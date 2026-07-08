# Trigger backend deploy after migration sync
from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import inspect
import os
import re
import threading
import time
from typing import Any, Dict, Mapping, Optional, Protocol

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, load_only, object_session

from app.ai.factory import provider_status
from app.ai.context import build_management_review_context, build_trade_review_context
from app.ai.review_logging import run_position_management_with_logging, run_review_with_logging
from app.ai.translation_cache import (
    ensure_localized_payload_for_source,
    fanout_ai_translations,
    localized_payload_for_source,
    merge_translation_overlay,
    scrub_translation_payload_for_source,
    source_locale_for_payload,
    stable_source_hash,
)
from app.clients.binance_client import ALLOWED_INTERVALS, ALLOWED_SYMBOLS
from app.clients.market_data_client import MarketDataClient
from app.core.config import VALID_AI_PROVIDERS, get_settings, normalize_ai_provider_name
from app.db import (
    AIReviewRecord,
    AITranslationCacheRecord,
    APICallLogRecord,
    CandidateTradeRecord,
    EquitySnapshotRecord,
    MarketSnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    ProviderCallLogRecord,
    RiskSettingsRecord,
    TradeEventRecord,
    TradePlanRecord,
    TraderAgentStateRecord,
    TraderLeaderboardSnapshotRecord,
    TraderStateRecord,
    TraderRunLogRecord,
    db_status,
    get_db,
    init_db,
    mask_database_url,
    normalized_database_url,
    REMOTE_DATABASE_PREFIXES,
    session_scope,
)
from app.league_sentiment import get_or_create_league_sentiment_opinion
from app.locales import (
    AI_TRANSLATION_SOURCE_AI_REVIEW,
    AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
    CANONICAL_AI_LOCALE,
    SUPPORTED_LOCALES,
    normalize_locale as normalize_supported_locale,
)
from app.market.data_cache import KLINE_CACHE as MARKET_KLINE_CACHE
from app.market.data_cache import cached_klines, cached_klines_before, market_cache_runtime
from app.market.snapshot import build_market_snapshot
from app.paper.engine import (
    PaperEngineResult,
    cancel_paper_order,
    close_position_by_management,
    process_candle,
    reduce_position_by_management,
    update_paper_order_limit,
    update_position_stop,
)
from app.paper.management_actions import create_position_add_order
from app.paper.management import (
    managed_exposure_from_order,
    managed_exposure_from_position,
    management_review_cooldown_seconds,
    order_management_events,
    position_management_events,
    recent_management_review_exists,
    trader_management_profile,
)
from app.paper.planner import (
    create_paper_orders_from_plan,
    list_active_paper_exposure,
    list_active_paper_exposure_map,
)
from app.paper.realtime_execution import (
    PAPER_EXECUTION_LOCK,
    REALTIME_EXECUTION_STATE,
    auto_realtime_execution_loop,
    execution_event_stream,
    run_realtime_execution_once,
)
from app.paper.plan_state import latest_active_trade_plan, list_active_trade_plans
from app.paper.reduction_policy import build_reduction_decision
from app.paper.repositories import ensure_trader_state
from app.paper.settings import sync_default_paper_settings
from app.paper.sizing import final_trade_risk_percent
from app.ops.trader_history_reset import RESET_CONFIRMATION_TEXT, reset_trader_history
from app.password_auth_routes import router as password_auth_router
from app.repositories import (
    create_ai_review,
    create_api_call_log,
    create_candidate_trade,
    create_first_stage_audit_report,
    create_market_snapshot,
    create_observation_candidate,
    create_position_management_review,
    create_trade_plan,
    create_trader_run_log,
    from_json,
    get_record,
    prune_trader_database,
    sanitize_error_message,
    serialize_record,
    to_json,
    upsert_trader_agent_state,
    update_trader_run_log,
)
from app.admin_routes import router as admin_router
from app.scanner_audit_routes import router as scanner_audit_router
from app.subscribers_routes import router as subscribers_router
from app.whop_routes import router as whop_router
from app.trader_status_feed.records import list_status_feed_payloads
from app.trader_status_feed.scheduler import create_status_feeds_for_current_states, regenerate_due_status_feeds
from app.trader_status_feed.service import (
    create_status_feed_for_ai_review,
    create_status_feed_for_pending_trade_plan,
    create_status_feeds_for_trade_events,
)
from app.traders.models import (
    EntryPlan,
    ManagementAction,
    ManagedExposure,
    ManagementEvent,
    PositionManagementPayload,
    PositionManagementResult,
    RunCycleRequest,
    StructuredReview,
    RunCycleResponse,
    TakeProfitPlan,
    TradeCandidate,
    TradePlan,
    TradeReviewPayload,
)
from app.traders.registry import get_strategy, list_scanner_traders, list_traders, list_traders_for_league_month, public_trader_profile
from app.traders.strategy_base import default_leverage_plan, default_order_intent, default_risk_plan, estimate_risk_reward, round_price


settings = get_settings()
AI_COOLDOWN_DECISIONS = {"REJECT", "DEFER", "NEEDS_MORE_DATA"}
PRICE_SHOCK_EVENT_TYPE = "common_price_shock"
PENDING_ORDER_CANCEL_ACTIONS = {"CANCEL_PENDING_ORDER", "CANCEL_REMAINING_ORDERS", "EXPIRE_PLAN", "REDUCE_RISK"}
PENDING_ORDER_CANCEL_DECISIONS = {"CANCEL_PENDING_ORDER", "REDUCE_RISK"}
MIN_FINAL_PAPER_LEVERAGE = 5.0
POSITION_MANAGEMENT_HEARTBEAT_LOOKAHEAD_SECONDS = 30
OBSERVATION_SETUP_SCORE_FLOOR = 50
CURRENT_PRICE_PATTERN = re.compile(
    r"(?:current\s+price|현재\s*가격)\D{0,16}([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)",
    re.IGNORECASE,
)


class PaperEngineRunRequest(BaseModel):
    symbol: str = "BTCUSDT"
    locale: str = "en"
    traderId: Optional[str] = None
    trader_id: Optional[str] = None
    mode: str = "paper"


class ScannerRunRequest(BaseModel):
    symbol: str = "BTCUSDT"
    provider: Optional[str] = None
    locale: str = "en"


class TraderHistoryResetRequest(BaseModel):
    traderIds: list[str] = []
    symbols: list[str] = []
    dryRun: bool = True
    confirmationText: Optional[str] = None
    allowProduction: bool = False
    allowRemote: bool = False


class TraderStatusFeedGenerateRequest(BaseModel):
    symbol: str = "BTCUSDT"
    traderIds: list[str] = []
    force: bool = False
    locale: str = "ko"


def require_ops_api_token(x_ops_api_token: str = Header(default="")) -> None:
    expected_token = (os.getenv("OPS_API_TOKEN") or settings.ops_api_token).strip()
    if not expected_token or x_ops_api_token != expected_token:
        raise HTTPException(status_code=401, detail="ops API token required")


AUTO_SCANNER_STATE: dict[str, Any] = {
    "enabled": settings.enable_auto_scanner,
    "running": False,
    "mode": "paper",
    "symbols": settings.auto_scanner_symbols,
    "intervalSeconds": settings.auto_scanner_interval_seconds,
    "provider": settings.auto_scanner_provider,
    "locale": settings.auto_scanner_locale,
    "aiRejectionCooldownSeconds": settings.ai_rejection_cooldown_seconds,
    "cycles": 0,
    "ticks": 0,
    "skippedTicks": 0,
    "scanInProgress": False,
    "currentScanStartedAt": None,
    "lastTickAt": None,
    "lastSkippedAt": None,
    "lastSkipReason": None,
    "nextTickAt": None,
    "lastStartedAt": None,
    "lastFinishedAt": None,
    "lastError": None,
    "lastResult": None,
    "priceShock": {},
}
AUTO_SCANNER_TASK: Optional[asyncio.Task] = None
AUTO_MANAGEMENT_STATE: dict[str, Any] = {
    "enabled": settings.enable_auto_scanner,
    "running": False,
    "mode": "paper",
    "symbols": settings.auto_scanner_symbols,
    "intervalSeconds": settings.auto_management_interval_seconds,
    "provider": settings.position_management_provider or settings.auto_scanner_provider,
    "locale": settings.auto_scanner_locale,
    "cycles": 0,
    "ticks": 0,
    "skippedTicks": 0,
    "scanInProgress": False,
    "currentScanStartedAt": None,
    "lastTickAt": None,
    "lastSkippedAt": None,
    "lastSkipReason": None,
    "nextTickAt": None,
    "lastStartedAt": None,
    "lastFinishedAt": None,
    "lastError": None,
    "lastResult": None,
}
AUTO_MANAGEMENT_TASK: Optional[asyncio.Task] = None
REALTIME_EXECUTION_TASK: Optional[asyncio.Task] = None
PRICE_SHOCK_STATE: dict[str, dict[str, Any]] = {}
LEAGUE_BUNDLE_CACHE_TTL_SECONDS = 300
LEAGUE_BUNDLE_CACHE: dict[tuple[str, bool, bool, str, str], tuple[float, dict[str, Any]]] = {}
OVERVIEW_REVIEWS_CACHE_TTL_SECONDS = LEAGUE_BUNDLE_CACHE_TTL_SECONDS
OVERVIEW_REVIEWS_CACHE: dict[tuple[int, int, Optional[str], Optional[str], str], tuple[float, dict[str, Any]]] = {}
TRADER_DETAIL_CACHE_VERSION = "localized-review-v3"
TRADER_DETAIL_CACHE: dict[tuple[str, str, int, int, str, str], tuple[float, dict[str, Any]]] = {}
LEADERBOARD_REFRESHING: set[tuple[str, str]] = set()
LEAGUE_BUNDLE_REFRESHING: set[tuple[str, bool, bool, str, str]] = set()
OVERVIEW_REVIEWS_REFRESHING: set[tuple[int, int, Optional[str], Optional[str], str]] = set()
TRADER_DETAIL_REFRESHING: set[tuple[str, str, str]] = set()


def invalidate_league_cache(symbol: Optional[str] = None, trader_id: Optional[str] = None) -> None:
    def mark_stale(cache: dict, key) -> None:
        cached = cache.get(key)
        if cached:
            cache[key] = (0, cached[1])

    if symbol is None:
        for key in list(LEAGUE_BUNDLE_CACHE):
            mark_stale(LEAGUE_BUNDLE_CACHE, key)
        for key in list(OVERVIEW_REVIEWS_CACHE):
            mark_stale(OVERVIEW_REVIEWS_CACHE, key)
        for key in list(TRADER_DETAIL_CACHE):
            mark_stale(TRADER_DETAIL_CACHE, key)
        return
    for key in list(LEAGUE_BUNDLE_CACHE):
        if key[0] == symbol:
            mark_stale(LEAGUE_BUNDLE_CACHE, key)
    for key in list(OVERVIEW_REVIEWS_CACHE):
        key_symbol = key[2]
        key_trader_id = key[3]
        if key_symbol in {None, symbol} and (trader_id is None or key_trader_id in {None, trader_id}):
            mark_stale(OVERVIEW_REVIEWS_CACHE, key)
    for key in list(TRADER_DETAIL_CACHE):
        if key[1] == symbol and (trader_id is None or key[0] == trader_id):
            mark_stale(TRADER_DETAIL_CACHE, key)


def cache_entry_was_invalidated(cached: Optional[tuple[float, dict[str, Any]]]) -> bool:
    return bool(cached and cached[0] <= 0)


def ensure_aware_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def cached_league_payload_outdated(
    db: Session,
    *,
    symbol: str,
    payload: dict[str, Any],
) -> bool:
    payload_updated_at = datetime_or_none(payload.get("lastUpdatedAt"))
    latest_snapshot_updated_at = db.execute(
        select(func.max(TraderLeaderboardSnapshotRecord.updated_at)).where(
            TraderLeaderboardSnapshotRecord.symbol == symbol
        )
    ).scalar_one_or_none()
    if latest_snapshot_updated_at and (
        payload_updated_at is None
        or ensure_aware_utc_datetime(latest_snapshot_updated_at) > ensure_aware_utc_datetime(payload_updated_at)
    ):
        return True

    return bool(find_drifted_trader_snapshots(db, symbol))


def cached_trader_detail_payload_outdated(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    payload: dict[str, Any],
) -> bool:
    cached_position_ids = {
        str(record.get("id"))
        for record in payload.get("positions", [])
        if isinstance(record, dict) and record.get("id") is not None
    }
    actual_position_ids = {
        str(record_id)
        for record_id in db.execute(
            select(PaperPositionRecord.id).where(
                PaperPositionRecord.trader_id == trader_id,
                PaperPositionRecord.symbol == symbol,
                PaperPositionRecord.status == "open",
            )
        ).scalars().all()
        if record_id is not None
    }
    if cached_position_ids != actual_position_ids:
        return True

    cached_order_ids = {
        str(record.get("id"))
        for record in payload.get("orders", [])
        if isinstance(record, dict) and record.get("id") is not None
    }
    actual_order_ids = {
        str(record_id)
        for record_id in db.execute(
            select(PaperOrderRecord.id).where(
                PaperOrderRecord.trader_id == trader_id,
                PaperOrderRecord.symbol == symbol,
                PaperOrderRecord.status == "open",
            )
        ).scalars().all()
        if record_id is not None
    }
    if cached_order_ids != actual_order_ids:
        return True

    cached_event_ids = [
        int(record.get("id"))
        for record in payload.get("events", [])
        if isinstance(record, dict) and str(record.get("id") or "").isdigit()
    ]
    cached_latest_event_id = max(cached_event_ids) if cached_event_ids else None
    actual_latest_event_id = db.execute(
        select(func.max(TradeEventRecord.id)).where(
            TradeEventRecord.trader_id == trader_id,
            TradeEventRecord.symbol == symbol,
        )
    ).scalar_one_or_none()
    if actual_latest_event_id is not None and (
        cached_latest_event_id is None or int(actual_latest_event_id) > cached_latest_event_id
    ):
        return True

    return False


def schedule_thread_refresh(func, *args) -> None:
    async def runner() -> None:
        try:
            await asyncio.to_thread(func, *args)
        except Exception:
            return

    try:
        asyncio.get_running_loop().create_task(runner())
    except RuntimeError:
        threading.Thread(target=func, args=args, daemon=True).start()


def run_coroutine_in_thread(func, *args, **kwargs):
    return asyncio.run(func(*args, **kwargs))


async def run_maybe_threaded(func, *args, **kwargs):
    if inspect.iscoroutinefunction(func):
        return await asyncio.to_thread(run_coroutine_in_thread, func, *args, **kwargs)
    return await asyncio.to_thread(func, *args, **kwargs)


def cleanup_stale_running_runs(max_age_minutes: int = 15) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max(1, max_age_minutes))
    with session_scope() as db:
        records = db.execute(
            select(TraderRunLogRecord)
            .where(
                TraderRunLogRecord.status == "running",
                TraderRunLogRecord.created_at < cutoff,
            )
            .limit(200)
        ).scalars().all()
        for record in records:
            update_trader_run_log(
                db,
                record,
                status="stale_error",
                payload={
                    **(from_json(record.payload_json) or {}),
                    "staleCleanup": True,
                    "staleCleanupAt": datetime.now(timezone.utc).isoformat(),
                },
                error_message="Run was left in running state after process interruption or database disconnect.",
            )
        return len(records)


async def handle_realtime_paper_execution_result(
    db: Session,
    trader_id: str,
    symbol: str,
    result: PaperEngineResult,
) -> None:
    if not (result.filled_orders or result.closed_positions or result.rejected_orders or result.events):
        return
    invalidate_league_cache(symbol, trader_id)
    refresh_leaderboard_snapshots(db, symbol, {trader_id})
    event_ids = [event.id for event in result.events if event.id is not None]
    if event_ids:
        if threading.current_thread() is not threading.main_thread():
            threading.Thread(
                target=lambda: asyncio.run(create_realtime_status_feeds_for_events(event_ids, symbol, trader_id)),
                daemon=True,
            ).start()
            return
        try:
            asyncio.get_running_loop().create_task(create_realtime_status_feeds_for_events(event_ids, symbol, trader_id))
        except RuntimeError:
            pass


async def create_realtime_status_feeds_for_events(event_ids: list[int], symbol: str, trader_id: str) -> None:
    await asyncio.sleep(0.2)
    try:
        with session_scope() as db:
            events = db.execute(select(TradeEventRecord).where(TradeEventRecord.id.in_(event_ids))).scalars().all()
            if not events:
                return
            records = await create_status_feeds_for_trade_events(db, settings=settings, events=events)
            if records:
                invalidate_league_cache(symbol, trader_id)
    except Exception:
        return


@asynccontextmanager
async def lifespan(app: FastAPI):
    global AUTO_SCANNER_TASK, AUTO_MANAGEMENT_TASK, REALTIME_EXECUTION_TASK
    init_db()
    cleanup_stale_running_runs()
    if settings.enable_auto_scanner:
        AUTO_SCANNER_TASK = asyncio.create_task(auto_scanner_loop())
        AUTO_MANAGEMENT_TASK = asyncio.create_task(auto_management_loop())
    if settings.enable_realtime_paper_execution and settings.realtime_paper_execution_role in {"api", "both"}:
        REALTIME_EXECUTION_TASK = asyncio.create_task(
            auto_realtime_execution_loop(on_result=handle_realtime_paper_execution_result)
        )
    yield
    if AUTO_SCANNER_TASK:
        AUTO_SCANNER_TASK.cancel()
        try:
            await AUTO_SCANNER_TASK
        except asyncio.CancelledError:
            pass
    if AUTO_MANAGEMENT_TASK:
        AUTO_MANAGEMENT_TASK.cancel()
        try:
            await AUTO_MANAGEMENT_TASK
        except asyncio.CancelledError:
            pass
    if REALTIME_EXECUTION_TASK:
        REALTIME_EXECUTION_TASK.cancel()
        try:
            await REALTIME_EXECUTION_TASK
        except asyncio.CancelledError:
            pass

app = FastAPI(
    title="AI Trader League API",
    version="0.1.0",
    description="Paper-trading technical demo using public crypto futures market data only.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(subscribers_router)
app.include_router(password_auth_router)
app.include_router(whop_router)
app.include_router(scanner_audit_router)
app.include_router(admin_router)


def binance_client() -> MarketDataClient:
    return MarketDataClient()


def normalize_symbol(symbol: str) -> str:
    clean_symbol = symbol.upper()
    if clean_symbol not in ALLOWED_SYMBOLS:
        raise HTTPException(status_code=400, detail="Only BTCUSDT and ETHUSDT are supported.")
    return clean_symbol


def trade_plan_from_review(symbol: str, candidate, review) -> TradePlan:
    if not candidate.created:
        return TradePlan(status="NO_CANDIDATE", symbol=symbol, notes=[candidate.reason or "No setup"])
    if review.decision in {"APPROVE", "ADJUST_AND_APPROVE"}:
        leverage_plan = getattr(candidate, "leveragePlan", None)
        suggested_leverage = float(getattr(leverage_plan, "suggestedLeverage", 1) or 1)
        max_candidate_leverage = float(getattr(leverage_plan, "maxLeverage", suggested_leverage) or suggested_leverage)
        review_leverage = getattr(review, "leverageOverride", None)
        leverage_cap = max(1.0, min(max_candidate_leverage, float(settings.paper_max_leverage)))
        leverage_floor = min(MIN_FINAL_PAPER_LEVERAGE, leverage_cap)
        leverage = float(review_leverage or suggested_leverage)
        leverage = max(leverage_floor, min(leverage, leverage_cap))

        review_risk = getattr(review, "riskPercentOverride", None)
        risk_percent = final_trade_risk_percent(candidate, review)

        review_adjustments = list(getattr(review, "adjustments", []) or [])
        if review_leverage is not None and float(review_leverage) < leverage_floor:
            review_adjustments.append(
                f"Provider leverage override {float(review_leverage):.1f}x was clamped to the service minimum {leverage_floor:.1f}x."
            )
        if review_risk is not None and risk_percent < float(review_risk):
            review_adjustments.append(
                f"Provider risk override {float(review_risk):.2f}% was capped to {risk_percent:.2f}% by the paper sizing policy."
            )
        early_exit_recommendations = list(getattr(review, "earlyExitRecommendations", []) or [])
        order_style = getattr(getattr(candidate, "orderIntent", None), "execution", "LIMIT_STAGED")
        return TradePlan(
            status="PAPER_TRADING_PENDING",
            symbol=symbol,
            side=candidate.side,
            entries=candidate.entries,
            stopLoss=candidate.stopLoss,
            takeProfits=candidate.takeProfits,
            riskPercent=risk_percent,
            leverage=leverage,
            orderStyle=order_style,
            feeMode="maker_entry_taker_exit",
            estimatedFees=None,
            notes=list(candidate.notes) + review_adjustments,
            earlyExitRules=list(candidate.earlyExitRules) + early_exit_recommendations,
            managementNotes=list(candidate.managementNotes) + early_exit_recommendations,
        )
    review_adjustments = list(getattr(review, "adjustments", []) or [])
    counter_thesis = getattr(review, "counterThesis", "Review rejected the setup.")
    return TradePlan(
        status=f"REVIEW_{review.decision}",
        symbol=symbol,
        side=candidate.side,
        entries=[],
        stopLoss=candidate.stopLoss,
        takeProfits=[],
        riskPercent=0.0,
        notes=[counter_thesis] + review_adjustments,
    )


def first_stage_observation_type(candidate: TradeCandidate, review_decision: Optional[str] = None) -> str:
    if review_decision in {"REJECT", "DEFER", "NEEDS_MORE_DATA"}:
        return "AI_REJECTED"
    if candidate.created:
        return "CANDIDATE_READY"
    if int(candidate.setupScore or 0) >= OBSERVATION_SETUP_SCORE_FLOOR:
        return "OBSERVE_ONLY"
    return "NO_TRADE"


def normalize_provider(provider: Optional[str]) -> str:
    requested = normalize_ai_provider_name(provider or settings.ai_provider or "mock")
    if requested not in VALID_AI_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported AI provider.")
    return requested


SLIM_EXCLUDED_COLUMNS = {"payload_json", "raw_json"}
OVERVIEW_EXCLUDED_COLUMNS = {"raw_json"}
OVERVIEW_OK_STATUSES = ("ok", "success", "completed")
OVERVIEW_ENTRY_DECISIONS = ("APPROVE", "ADJUST_AND_APPROVE", "APPROVED")
OVERVIEW_MANAGEMENT_DECISIONS = (
    "HOLD",
    "LET_PROFIT_RUN",
    "MOVE_STOP",
    "MOVE_STOP_TO_BREAKEVEN",
    "TRAIL_STOP",
    "TAKE_PARTIAL_PROFIT",
    "PARTIAL_TAKE_PROFIT",
    "REDUCE_RISK",
    "REDUCE_SIZE",
    "CLOSE_POSITION",
    "CANCEL_PENDING_ORDER",
    "CANCEL_REMAINING_ORDERS",
    "ADJUST_PENDING_ORDER",
    "ADD_TO_POSITION",
    "PYRAMID_POSITION",
)


def _case_variants(values: tuple[str, ...]) -> tuple[str, ...]:
    variants: set[str] = set()
    for value in values:
        variants.update({value, value.lower(), value.upper(), value.capitalize()})
    return tuple(sorted(variants))


OVERVIEW_OK_STATUS_VALUES = _case_variants(OVERVIEW_OK_STATUSES)
OVERVIEW_ENTRY_DECISION_VALUES = _case_variants(OVERVIEW_ENTRY_DECISIONS)
OVERVIEW_MANAGEMENT_DECISION_VALUES = _case_variants(OVERVIEW_MANAGEMENT_DECISIONS)


def slim_load_columns(model) -> list[Any]:
    return [getattr(model, column.name) for column in model.__table__.columns if column.name not in SLIM_EXCLUDED_COLUMNS]


def slim_select(model):
    return select(model).options(load_only(*slim_load_columns(model)))


def overview_load_columns(model) -> list[Any]:
    return [getattr(model, column.name) for column in model.__table__.columns if column.name not in OVERVIEW_EXCLUDED_COLUMNS]


def overview_select(model):
    return select(model).options(load_only(*overview_load_columns(model)))


def overview_filtered_select(source: str, model):
    stmt = overview_select(model).where(
        model.status.in_(OVERVIEW_OK_STATUS_VALUES),
        model.fallback.is_(False),
        model.error_message.is_(None),
    )
    if source == "entry_review":
        return stmt.where(model.decision.in_(OVERVIEW_ENTRY_DECISION_VALUES))
    return stmt.where(
        or_(
            model.decision.in_(OVERVIEW_MANAGEMENT_DECISION_VALUES),
            model.action_type.in_(OVERVIEW_MANAGEMENT_DECISION_VALUES),
        )
    )


def overview_translation_source(record, overview_source: str) -> str | None:
    if overview_source == "entry_review" and isinstance(record, AIReviewRecord):
        return AI_TRANSLATION_SOURCE_AI_REVIEW
    if overview_source == "management_review" and isinstance(record, PositionManagementReviewRecord):
        return AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT
    return None


def overview_translation_overlays(
    db: Session,
    page_candidates: list[tuple[str, Any]],
    *,
    locale: str,
) -> dict[tuple[str, int], tuple[dict[str, Any], dict[str, Any]]]:
    requested_locale = normalize_locale(locale)
    if requested_locale == CANONICAL_AI_LOCALE or not page_candidates:
        return {}

    sources: dict[tuple[str, int], tuple[str, dict[str, Any], str]] = {}
    for overview_source, record in page_candidates:
        source_type = overview_translation_source(record, overview_source)
        payload = from_json(getattr(record, "payload_json", None))
        if source_type is None or record.id is None or not isinstance(payload, dict):
            continue
        sources[(overview_source, record.id)] = (source_type, payload, stable_source_hash(payload))

    if not sources:
        return {}

    source_types = sorted({source_type for source_type, _payload, _source_hash in sources.values()})
    source_ids = sorted({source_id for _overview_source, source_id in sources.keys()})
    records = db.execute(
        select(AITranslationCacheRecord).where(
            AITranslationCacheRecord.source_type.in_(source_types),
            AITranslationCacheRecord.source_id.in_(source_ids),
            AITranslationCacheRecord.locale == requested_locale,
            AITranslationCacheRecord.status == "ok",
        )
    ).scalars().all()
    cache_by_source = {
        (record.source_type, record.source_id, record.source_hash): record
        for record in records
    }

    overlays: dict[tuple[str, int], tuple[dict[str, Any], dict[str, Any]]] = {}
    for key, (source_type, payload, source_hash) in sources.items():
        cached = cache_by_source.get((source_type, key[1], source_hash))
        if cached is None:
            continue
        cached_payload = from_json(cached.payload_json)
        if not isinstance(cached_payload, dict):
            continue
        localized_payload = merge_translation_overlay(payload, scrub_translation_payload_for_source(source_type, cached_payload))
        overlays[key] = (
            localized_payload,
            {"status": "ok", "locale": requested_locale, "sourceHash": source_hash},
        )
    return overlays


def snake_to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    return value


def serialize_record_slim(record) -> dict:
    data = {
        column.name: json_safe(getattr(record, column.name))
        for column in record.__table__.columns
        if column.name not in SLIM_EXCLUDED_COLUMNS
    }
    for key, value in list(data.items()):
        data.setdefault(snake_to_camel(key), value)
    return data


def record_payload(value: Any) -> dict | None:
    return value if isinstance(value, dict) else None


def numeric_record_id(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def localized_embedded_ai_review_payload(record, payload: dict, locale: str) -> tuple[dict, dict | None]:
    record_session = object_session(record)
    ai_review_id = numeric_record_id(payload.get("aiReviewId"))
    ai_review = record_payload(payload.get("aiReview"))
    if record_session is None or ai_review_id is None or ai_review is None:
        return payload, None
    localized_review, meta = localized_payload_for_source(
        db=record_session,
        source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
        source_id=ai_review_id,
        payload=ai_review,
        locale=locale,
    )
    if meta.get("status") == "canonical":
        return payload, None
    if meta.get("status") != "ok":
        return payload, {"status": meta.get("status") or "fallback", "embeddedAiReview": meta}
    next_payload = {**payload, "aiReview": localized_review}
    approval_reason = localized_review.get("approvalReason")
    if approval_reason:
        next_payload["aiApprovalReason"] = approval_reason
    counter_thesis = localized_review.get("counterThesis")
    if counter_thesis:
        next_payload["aiCounterThesis"] = counter_thesis
    adjustments = localized_review.get("adjustments")
    if isinstance(adjustments, list):
        next_payload["aiAdjustments"] = adjustments
    structured = record_payload(localized_review.get("structuredReview"))
    if structured is not None:
        next_payload["aiStructuredReview"] = structured
    return next_payload, {"status": "ok", "embeddedAiReview": meta}


COMPACT_EVENT_KEYS = (
    "eventType",
    "phase",
    "severity",
    "reason",
    "suggestedAction",
    "metrics",
    "createdAt",
    "timestamp",
)
COMPACT_EXPOSURE_KEYS = (
    "kind",
    "id",
    "status",
    "side",
    "quantity",
    "limitPrice",
    "entryPrice",
    "averageEntryPrice",
    "stopLoss",
    "stopLossPrice",
    "takeProfit",
    "takeProfitPrice",
    "leverage",
    "entryWeight",
    "currentPrice",
    "unrealizedPnl",
    "realizedPnl",
    "progressR",
    "targetProgress",
)
COMPACT_REVIEW_KEYS = (
    "decision",
    "confidence",
    "riskLevel",
    "sourceLocale",
    "reviewCode",
    "reviewFacts",
    "riskFlags",
    "structuredReview",
    "actions",
    "riskChange",
    "nextReviewInSeconds",
    "rationale",
    "counterThesis",
    "userSummary",
    "provider",
    "model",
    "fallback",
    "metrics",
)
COMPACT_ACTION_KEYS = ("type", "reason", "price", "quantity", "riskChange", "status")


def compact_payload_keys(payload: dict, keys: tuple[str, ...]) -> dict[str, Any]:
    return {key: json_safe(payload[key]) for key in keys if key in payload}


def compact_action_payloads(actions: Any) -> list[dict[str, Any]]:
    if not isinstance(actions, list):
        return []
    compacted: list[dict[str, Any]] = []
    for action in actions:
        if isinstance(action, dict):
            compacted.append(compact_payload_keys(action, COMPACT_ACTION_KEYS))
    return compacted


def compact_management_review_for_detail(data: dict, payload: dict, translation_meta: dict | None) -> dict:
    event = record_payload(payload.get("event")) or {}
    exposure = record_payload(payload.get("exposure")) or {}
    review = record_payload(payload.get("review")) or {}
    compact_review = compact_payload_keys(review, COMPACT_REVIEW_KEYS)
    data["event"] = compact_payload_keys(event, COMPACT_EVENT_KEYS)
    data["exposure"] = compact_payload_keys(exposure, COMPACT_EXPOSURE_KEYS)
    data["review"] = compact_review
    data["appliedActions"] = compact_action_payloads(payload.get("appliedActions"))
    if translation_meta is not None:
        data["translation"] = translation_meta
    data["rationale"] = compact_review.get("rationale") or data.get("rationale")
    data["reviewFacts"] = compact_review.get("reviewFacts") or data.get("reviewFacts") or []
    data["riskFlags"] = compact_review.get("riskFlags") or data.get("riskFlags") or []
    data["riskLevel"] = compact_review.get("riskLevel") or data.get("riskLevel")
    if compact_review.get("structuredReview"):
        data["structuredReview"] = compact_review.get("structuredReview")
    if compact_review.get("userSummary"):
        data["summary"] = compact_review.get("userSummary")
    return data


def serialize_record_for_ui(
    record,
    *,
    include_payload: bool = False,
    locale: str = CANONICAL_AI_LOCALE,
    payload_mode: str = "full",
) -> dict:
    data = serialize_record_slim(record)
    if not include_payload:
        return data
    payload = from_json(getattr(record, "payload_json", None)) or {}
    translation_meta = None
    record_session = object_session(record)
    if isinstance(payload, dict):
        if isinstance(record, AIReviewRecord) and record_session is not None:
            payload, translation_meta = localized_payload_for_source(
                db=record_session,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=record.id,
                payload=payload,
                locale=locale,
            )
        elif isinstance(record, PositionManagementReviewRecord) and record_session is not None:
            payload, translation_meta = localized_payload_for_source(
                db=record_session,
                source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
                source_id=record.id,
                payload=payload,
                locale=locale,
            )
        elif isinstance(record, (PaperOrderRecord, PaperPositionRecord, TradeEventRecord)):
            payload, translation_meta = localized_embedded_ai_review_payload(record, payload, locale)
    if isinstance(record, PositionManagementReviewRecord) and payload_mode == "detail":
        return compact_management_review_for_detail(data, payload, translation_meta)
    if payload:
        data["payload"] = payload
    if translation_meta is not None:
        data["translation"] = translation_meta
    if isinstance(record, PositionManagementReviewRecord):
        data["event"] = payload.get("event") or {}
        data["exposure"] = payload.get("exposure") or {}
        data["review"] = payload.get("review") or {}
        data["appliedActions"] = payload.get("appliedActions") or []
        review = data["review"]
        if isinstance(review, dict):
            data["rationale"] = review.get("rationale") or data.get("rationale")
            data["reviewFacts"] = review.get("reviewFacts") or data.get("reviewFacts") or []
            data["riskFlags"] = review.get("riskFlags") or data.get("riskFlags") or []
            data["riskLevel"] = review.get("riskLevel") or data.get("riskLevel")
            if review.get("structuredReview"):
                data["structuredReview"] = review.get("structuredReview")
            if review.get("userSummary"):
                data["summary"] = review.get("userSummary")
    return data


def normalize_locale(locale: Optional[str]) -> str:
    return normalize_supported_locale(locale)


def snapshot_to_engine_candle(snapshot: dict) -> dict:
    one_minute = snapshot.get("timeframes", {}).get("1m", {})
    latest = one_minute.get("latestCandle") or one_minute
    open_time = latest.get("openTime")
    timestamp = None
    if open_time:
        timestamp = datetime.fromtimestamp(int(open_time) / 1000, tz=timezone.utc)
    close = latest.get("close", snapshot.get("price"))
    mark_price = snapshot.get("price")
    open_price = latest.get("open", close)
    high = latest.get("high", close)
    low = latest.get("low", close)
    if mark_price is not None:
        try:
            mark_value = Decimal(str(mark_price))
            high = max(Decimal(str(high)), mark_value)
            low = min(Decimal(str(low)), mark_value)
            close = mark_value
        except Exception:
            pass
    return {
        "open": open_price,
        "high": high,
        "low": low,
        "close": close,
        "timestamp": timestamp,
    }


def engine_result_payload(result) -> dict:
    if not result:
        return {
            "filledOrders": [],
            "closedPositions": [],
            "rejectedOrders": [],
            "events": [],
            "equitySnapshot": None,
        }
    return {
        "filledOrders": [serialize_record(order) for order in result.filled_orders],
        "closedPositions": [serialize_record(position) for position in result.closed_positions],
        "rejectedOrders": [serialize_record(order) for order in result.rejected_orders],
        "events": [serialize_record(event) for event in result.events],
        "equitySnapshot": serialize_record(result.snapshot) if result.snapshot else None,
    }


def current_snapshot_price(snapshot: dict) -> Decimal:
    price = snapshot.get("price")
    if price is None:
        price = snapshot.get("timeframes", {}).get("1m", {}).get("close")
    return Decimal(str(price or "0"))


def update_price_shock_context(symbol: str, snapshot: dict) -> dict[str, Any]:
    clean_symbol = normalize_symbol(symbol)
    price = float(current_snapshot_price(snapshot) or 0.0)
    now = datetime.now(timezone.utc)
    state = PRICE_SHOCK_STATE.setdefault(
        clean_symbol,
        {
            "lastPrice": None,
            "active": False,
            "sequence": 0,
            "activeSince": None,
            "activeUntilTs": 0.0,
            "lastReviewAt": None,
        },
    )
    previous_price = state.get("lastPrice")
    price_change_percent = 0.0
    if previous_price:
        price_change_percent = ((price - float(previous_price)) / float(previous_price)) * 100

    threshold = max(0.0, float(settings.price_shock_threshold_percent or 0.7))
    review_seconds = max(60, int(settings.price_shock_review_seconds or 120))
    review_cycles = max(1, int(settings.price_shock_review_cycles or 5))
    abs_change = abs(price_change_percent)
    active_until_ts = float(state.get("activeUntilTs") or 0.0)
    now_ts = now.timestamp()

    if previous_price and abs_change >= threshold:
        active_until_ts = now_ts + (review_seconds * review_cycles)
        state["active"] = True
        state["activeSince"] = state.get("activeSince") or now.isoformat()
        state["sequence"] = int(state.get("sequence") or 0) + 1
    elif active_until_ts > now_ts:
        state["active"] = True
    elif abs_change < threshold:
        state["active"] = False
        state["activeSince"] = None
        active_until_ts = 0.0

    direction = "UP" if price_change_percent > 0 else "DOWN" if price_change_percent < 0 else "FLAT"
    remaining_seconds = max(0.0, active_until_ts - now_ts)
    reviews_remaining = int((remaining_seconds + review_seconds - 1) // review_seconds) if remaining_seconds else 0
    state.update(
        {
            "lastPrice": price,
            "previousPrice": previous_price,
            "priceChangePercent": round(price_change_percent, 4),
            "absPriceChangePercent": round(abs_change, 4),
            "direction": direction,
            "reviewsRemaining": reviews_remaining,
            "thresholdPercent": threshold,
            "reviewSeconds": review_seconds,
            "reviewCycles": review_cycles,
            "activeUntilTs": active_until_ts,
            "updatedAt": now.isoformat(),
        }
    )
    shock = {
        "active": bool(state["active"]),
        "symbol": clean_symbol,
        "previousPrice": previous_price,
        "currentPrice": price,
        "priceChangePercent": round(price_change_percent, 4),
        "absPriceChangePercent": round(abs_change, 4),
        "direction": direction,
        "thresholdPercent": threshold,
        "reviewSeconds": state["reviewSeconds"],
        "reviewCycles": review_cycles,
        "reviewsRemaining": reviews_remaining,
        "sequence": int(state.get("sequence") or 0),
        "activeSince": state.get("activeSince"),
        "lastReviewAt": state.get("lastReviewAt"),
    }
    system = dict(snapshot.get("system") or {})
    system["priceShock"] = shock
    snapshot["system"] = system
    AUTO_SCANNER_STATE["priceShock"] = {key: dict(value) for key, value in PRICE_SHOCK_STATE.items()}
    return shock


def mark_price_shock_review_consumed(symbol: str) -> None:
    state = PRICE_SHOCK_STATE.get(normalize_symbol(symbol))
    if not state:
        return
    state["lastReviewAt"] = datetime.now(timezone.utc).isoformat()


def price_shock_context(snapshot: dict) -> dict[str, Any]:
    return dict((snapshot.get("system") or {}).get("priceShock") or {})


def price_shock_event_for_exposure(
    *,
    trader_id: str,
    symbol: str,
    exposure: ManagedExposure,
    snapshot: dict,
) -> Optional[ManagementEvent]:
    shock = price_shock_context(snapshot)
    if not shock.get("active"):
        return None
    direction = str(shock.get("direction") or "FLAT").upper()
    side = str(exposure.side or "").upper()
    adverse = (side == "LONG" and direction == "DOWN") or (side == "SHORT" and direction == "UP")
    favorable = (side == "LONG" and direction == "UP") or (side == "SHORT" and direction == "DOWN")
    phase = management_phase_for_exposure(exposure)
    if exposure.kind == "order":
        suggested = "CANCEL_PENDING_ORDER" if adverse else "HOLD"
        reason = (
            "Fast-market price shock while paper entry is still pending; reassess whether the entry is still valid, should be cancelled, or can wait."
        )
    else:
        suggested = "REDUCE_RISK" if adverse else "TAKE_PARTIAL_PROFIT" if favorable else "HOLD"
        reason = (
            "Fast-market price shock while paper position is active; reassess stop, partial profit, early exit, or hold without widening risk."
        )
    metrics = {
        "price": shock.get("currentPrice"),
        "previousPrice": shock.get("previousPrice"),
        "priceChangePercent": shock.get("priceChangePercent"),
        "absPriceChangePercent": shock.get("absPriceChangePercent"),
        "direction": direction,
        "thresholdPercent": shock.get("thresholdPercent"),
        "reviewSeconds": shock.get("reviewSeconds"),
        "reviewCycles": shock.get("reviewCycles"),
        "reviewsRemaining": shock.get("reviewsRemaining"),
        "shockSequence": shock.get("sequence"),
        "activeSince": shock.get("activeSince"),
        "side": side,
        "adverseToExposure": adverse,
        "favorableToExposure": favorable,
        "traderId": trader_id,
        "symbol": symbol,
    }
    return ManagementEvent(
        eventType=PRICE_SHOCK_EVENT_TYPE,
        phase=phase,
        severity="HIGH",
        reason=reason,
        suggestedAction=suggested,
        metrics=metrics,
    )


def should_run_price_shock_review(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    exposure: ManagedExposure,
    snapshot: dict,
) -> bool:
    shock = price_shock_context(snapshot)
    if not shock.get("active"):
        return False
    if int(shock.get("reviewsRemaining") or 0) <= 0:
        return False
    state = latest_agent_state(db, trader_id, symbol)
    now = datetime.now(timezone.utc)
    if state and state.last_event_type == PRICE_SHOCK_EVENT_TYPE:
        next_review_at = utc_datetime(state.next_review_at)
        if next_review_at and next_review_at > now:
            return False
    cooldown = max(60, int(settings.price_shock_review_seconds or 120))
    return not recent_management_review_exists(
        db,
        trader_id=trader_id,
        symbol=symbol,
        exposure_kind=exposure.kind,
        exposure_id=exposure.id,
        event_type=PRICE_SHOCK_EVENT_TYPE,
        cooldown_seconds=cooldown,
    )


def decimal_or_none(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def management_action_reason(
    review: PositionManagementResult,
    action_type: str,
    event: ManagementEvent,
) -> str:
    for action in review.actions:
        if action.type == action_type and action.reason:
            return action.reason
    return review.rationale or event.reason


def safe_management_stop(position: PaperPositionRecord, raw_price: Any, mark_price: Decimal) -> Optional[Decimal]:
    new_stop = decimal_or_none(raw_price)
    if new_stop is None:
        return None
    previous_stop = position.stop_loss_price
    if position.side == "long":
        if new_stop >= mark_price:
            return None
        if previous_stop is not None and new_stop <= previous_stop:
            return None
    if position.side == "short":
        if new_stop <= mark_price:
            return None
        if previous_stop is not None and new_stop >= previous_stop:
            return None
    return new_stop


def safe_management_limit(order: PaperOrderRecord, raw_price: Any, mark_price: Decimal) -> Optional[Decimal]:
    new_limit = decimal_or_none(raw_price)
    if new_limit is None or new_limit <= 0:
        return None
    if order.side == "long" and new_limit > mark_price:
        return None
    if order.side == "short" and new_limit < mark_price:
        return None
    return new_limit


MANAGEMENT_CLOSE_REASON = "management_close"


def utc_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def management_phase_for_exposure(exposure: ManagedExposure) -> str:
    return "PENDING_ORDER" if exposure.kind == "order" else "OPEN_POSITION"


def agent_mode_for_event(event: Optional[ManagementEvent], exposure: Optional[ManagedExposure] = None) -> str:
    if event is None:
        return "IDLE" if exposure is None else "MONITORING"
    if event.eventType == PRICE_SHOCK_EVENT_TYPE:
        return "FAST_MARKET_REVIEW"
    if event.severity.upper() == "HIGH":
        return "DEFENSIVE"
    if event.eventType.endswith("_heartbeat"):
        return "ACTIVE_REVIEW"
    if event.suggestedAction in {"TAKE_PARTIAL_PROFIT", "LET_PROFIT_RUN"}:
        return "PROFIT_MANAGEMENT"
    return "RISK_MANAGEMENT"


def primary_action_type(review: Optional[PositionManagementResult]) -> Optional[str]:
    if not review or not review.actions:
        return review.decision if review else None
    return review.actions[0].type


def next_review_at_from_review(
    review: PositionManagementResult,
    urgent: bool = False,
    max_seconds: Optional[int] = None,
) -> datetime:
    min_seconds = settings.position_management_urgent_cooldown_seconds if urgent else 60
    requested_seconds = int(review.nextReviewInSeconds or 300)
    if max_seconds is not None:
        requested_seconds = min(requested_seconds, int(max_seconds))
    next_seconds = max(int(min_seconds or 60), requested_seconds)
    return datetime.now(timezone.utc) + timedelta(seconds=next_seconds)


def latest_agent_state(db: Session, trader_id: str, symbol: str) -> Optional[TraderAgentStateRecord]:
    return db.execute(
        select(TraderAgentStateRecord).where(
            TraderAgentStateRecord.trader_id == trader_id,
            TraderAgentStateRecord.symbol == symbol,
        )
    ).scalar_one_or_none()


def heartbeat_event_type_for_exposure(trader_id: str, exposure: ManagedExposure) -> str:
    suffix = "pending_heartbeat" if exposure.kind == "order" else "position_heartbeat"
    return f"{trader_id.replace('-', '_')}_{suffix}"


def parse_exposure_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def latest_management_review_for_exposure(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    exposure: ManagedExposure,
) -> Optional[PositionManagementReviewRecord]:
    stmt = (
        select(PositionManagementReviewRecord)
        .where(
            PositionManagementReviewRecord.trader_id == trader_id,
            PositionManagementReviewRecord.symbol == symbol,
        )
        .order_by(desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
        .limit(1)
    )
    if exposure.kind == "order":
        stmt = stmt.where(PositionManagementReviewRecord.order_id == exposure.id)
    else:
        stmt = stmt.where(PositionManagementReviewRecord.position_id == exposure.id)
    return db.execute(stmt).scalar_one_or_none()


def next_heartbeat_due_at_for_exposure(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    exposure: ManagedExposure,
    heartbeat_seconds: int,
) -> Optional[datetime]:
    latest_review = latest_management_review_for_exposure(
        db,
        trader_id=trader_id,
        symbol=symbol,
        exposure=exposure,
    )
    base_time = utc_datetime(latest_review.created_at) if latest_review else parse_exposure_datetime(exposure.createdAt)
    if base_time is None:
        return None
    return base_time + timedelta(seconds=max(60, heartbeat_seconds))


def next_active_exposure_review_at(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    orders: list[PaperOrderRecord],
    positions: list[PaperPositionRecord],
) -> Optional[datetime]:
    due_times: list[datetime] = []
    for order in orders:
        due_at = next_heartbeat_due_at_for_exposure(
            db,
            trader_id=trader_id,
            symbol=symbol,
            exposure=managed_exposure_from_order(order),
            heartbeat_seconds=settings.position_management_pending_heartbeat_seconds,
        )
        if due_at:
            due_times.append(due_at)
    for position in positions:
        due_at = next_heartbeat_due_at_for_exposure(
            db,
            trader_id=trader_id,
            symbol=symbol,
            exposure=managed_exposure_from_position(position),
            heartbeat_seconds=settings.position_management_open_heartbeat_seconds,
        )
        if due_at:
            due_times.append(due_at)
    return min(due_times) if due_times else None


def should_run_heartbeat(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    exposure: ManagedExposure,
    heartbeat_seconds: int,
) -> bool:
    now = datetime.now(timezone.utc)
    due_at = next_heartbeat_due_at_for_exposure(
        db,
        trader_id=trader_id,
        symbol=symbol,
        exposure=exposure,
        heartbeat_seconds=heartbeat_seconds,
    )
    if due_at is None:
        return True
    return due_at <= now + timedelta(seconds=POSITION_MANAGEMENT_HEARTBEAT_LOOKAHEAD_SECONDS)


def heartbeat_event_for_order(trader_id: str, order: PaperOrderRecord, snapshot: dict) -> ManagementEvent:
    price = float(snapshot.get("price") or 0.0)
    limit_price = float(order.limit_price or price or 0.0)
    distance_percent = abs(price - limit_price) / price * 100 if price else 0.0
    profile = trader_management_profile(trader_id)
    age_seconds = int((datetime.now(timezone.utc) - utc_datetime(order.submitted_at)).total_seconds())
    metrics = {
        "price": price,
        "limitPrice": limit_price,
        "distancePercent": round(distance_percent, 4),
        "ageSeconds": age_seconds,
        "heartbeatSeconds": settings.position_management_pending_heartbeat_seconds,
    }
    pending_reasons = {
        "channel-rider": "Decide whether the channel-edge pending order still deserves patience or should be cancelled or adjusted.",
        "volume-breaker": "Check whether the retest order still has real breakout confirmation.",
        "pullback-architect": "Reassess staged pullback orders and whether remaining scale entries should stay active.",
        "leverage-hunter": "Reassess the crowding and funding trigger while the leverage entry waits.",
        "liquidity-reaper": "Check whether the wick or sweep entry still has reversal quality.",
        "volatility-squeezer": "Decide whether squeeze expansion is still alive or the pending pullback entry should expire.",
        "trend-sentinel": "Reassess whether a slow trend-continuation order still deserves patience.",
        "range-maker": "Decide whether the range edge is still valid or breakout risk should cancel the order.",
        "funding-contrarian": "Check whether the funding edge still exists before fading crowding.",
        "orderflow-sniper": "Expire stale session-break retests quickly if price re-enters the range.",
        "donchian-breakout": "Decide whether the broken Donchian boundary still deserves a retest entry or should be cancelled.",
        "ichimoku-cloud-pilot": "Reassess cloud-proxy trend quality and whether the continuation pullback is still valid.",
        "vwap-reclaimer": "Decide whether fair-value reclaim or rejection still holds, or whether the mean edge has decayed.",
        "wyckoff-spring": "Reassess whether the spring or upthrust trap still has reclaim or failure quality before fill.",
        "rsi-divergence-scout": "Reassess divergence confirmation and whether structure still supports the reversal entry.",
        "session-raider": "Expire session orders fast if the liquidity transition window or impulse is gone.",
        "imbalance-hunter": "Decide whether the imbalance midpoint retest is still respected or has failed.",
        "momentum-ignition": "Reassess compression breakout quickly; do not keep stale entries after price re-enters the box.",
        "bollinger-reversion": "Decide whether band reversion remains valid or a band-walk trend should cancel the order.",
        "atr-trail-commander": "Reassess whether the ATR pullback order still fits the larger BTC trend.",
    }
    reason = pending_reasons.get(trader_id, "Reassess whether the pending order still deserves patience or should be cancelled.")
    return ManagementEvent(
        eventType=f"{trader_id.replace('-', '_')}_pending_heartbeat",
        phase="PENDING_ORDER",
        severity="MEDIUM",
        reason=reason,
        suggestedAction="HOLD",
        metrics={**metrics, "profileOrderStaleSeconds": profile.get("order_stale_seconds")},
    )


def heartbeat_event_for_position(trader_id: str, position: PaperPositionRecord, snapshot: dict) -> ManagementEvent:
    price = float(snapshot.get("price") or 0.0)
    entry = float(position.entry_price or price or 0.0)
    stop = float(position.stop_loss_price or entry or 0.0)
    target = float(position.take_profit_price or entry or 0.0)
    risk = abs(entry - stop) or max(price * 0.004, 1.0)
    progress_r = ((price - entry) / risk) if position.side == "long" else ((entry - price) / risk)
    target_distance = abs(target - entry) or risk
    target_progress = ((price - entry) / target_distance) if position.side == "long" else ((entry - price) / target_distance)
    metrics = {
        "price": price,
        "entryPrice": entry,
        "stopLoss": stop,
        "takeProfit": target,
        "progressR": round(progress_r, 4),
        "targetProgress": round(target_progress, 4),
        "unrealizedPnl": float(position.unrealized_pnl or 0.0),
        "heartbeatSeconds": settings.position_management_open_heartbeat_seconds,
    }
    one_hour = snapshot.get("timeframes", {}).get("1h", {})
    channel = one_hour.get("channel", {}) if isinstance(one_hour.get("channel"), dict) else {}
    if trader_id == "channel-rider":
        metrics.update(
            {
                "channelLower": float(channel.get("lower") or price * 0.99),
                "channelMid": float(channel.get("mid") or price),
                "channelUpper": float(channel.get("upper") or price * 1.01),
            }
        )
    if trader_id == "imbalance-hunter":
        fifteen = snapshot.get("timeframes", {}).get("15m", {})
        latest_15m = fifteen.get("latestCandle", {}) if isinstance(fifteen.get("latestCandle"), dict) else {}
        close_15m = float(latest_15m.get("close") or fifteen.get("close") or price)
        derivatives = snapshot.get("derivatives", {})
        taker = derivatives.get("takerBuySell", {}) if isinstance(derivatives.get("takerBuySell"), dict) else {}
        taker_buy_share = taker.get("buyShare")
        if taker_buy_share is None:
            buy_sell_ratio = float(taker.get("buySellRatio") or 0.0)
            taker_buy_share = buy_sell_ratio / (1.0 + buy_sell_ratio) if buy_sell_ratio > 0 else 0.0
        metrics.update(
            {
                "imbalanceMidpoint": entry,
                "failureLine": stop,
                "fifteenMinuteClose": close_15m,
                "distanceToStopR": round(((price - stop) / risk) if position.side == "long" else ((stop - price) / risk), 4),
                "volumeZscore": float(fifteen.get("volumeZscore") or 0.0),
                "fundingRate": float(derivatives.get("fundingRate") or 0.0),
                "takerBuyRatio": round(max(0.0, min(float(taker_buy_share or 0.0), 1.0)), 4),
            }
        )
    position_reasons = {
        "channel-rider": "Decide if the channel trade should hold, protect profits, or exit early.",
        "volume-breaker": "Reassess continuation strength and whether breakout momentum still justifies holding.",
        "pullback-architect": "Manage staged pullback exposure, remaining orders, stop, and profit protection.",
        "leverage-hunter": "Manage squeeze and crowding risk with faster risk reduction if flow shifts.",
        "liquidity-reaper": "Decide whether the sweep reversal is still valid or profit should be protected.",
        "volatility-squeezer": "Protect squeeze profits if expansion stalls, or trail cleanly if volatility persists.",
        "trend-sentinel": "Decide whether to keep trailing the trend or exit if the higher-timeframe trend weakens.",
        "range-maker": "De-risk at range midpoint and close if the range breaks.",
        "funding-contrarian": "Harvest funding normalization or reduce if the crowded side accelerates again.",
        "orderflow-sniper": "Manage session-break exposure with no patience for range re-entry.",
        "donchian-breakout": "Manage range expansion, retest validity, and ATR trailing after breakout.",
        "ichimoku-cloud-pilot": "Decide whether cloud trend integrity still supports holding or adding.",
        "vwap-reclaimer": "Protect fair-value reclaim trades when price stalls around the mean.",
        "wyckoff-spring": "Decide whether the spring or upthrust trap is still working or should be exited.",
        "rsi-divergence-scout": "Monitor whether divergence reversal is confirmed or momentum re-accelerates.",
        "session-raider": "Manage session momentum and close if the window edge has expired.",
        "imbalance-hunter": "Monitor imbalance midpoint respect and displacement extension.",
        "momentum-ignition": "Ride compression expansion but reduce immediately if price re-enters the squeeze box.",
        "bollinger-reversion": "Take midpoint profits or exit if a band-walk trend starts.",
        "atr-trail-commander": "Trail ATR trend winners and avoid premature breakeven while the higher-timeframe trend holds.",
    }
    reason = position_reasons.get(trader_id, "Manage the open position from the current price, stop, target, and latest market evidence.")
    if trader_id == "imbalance-hunter":
        if progress_r >= 0:
            reason = (
                "Imbalance Hunter is working from entry; compare target progress with the invalidation line "
                "before deciding whether patience, breakeven, or trailing is justified."
            )
        else:
            reason = (
                "Imbalance Hunter is still near entry and moving back toward the invalidation line; "
                "decide whether the midpoint thesis deserves more patience or risk should be reduced."
            )
    return ManagementEvent(
        eventType=f"{trader_id.replace('-', '_')}_position_heartbeat",
        phase="OPEN_POSITION",
        severity="MEDIUM" if progress_r > -0.25 else "HIGH",
        reason=reason,
        suggestedAction="HOLD",
        metrics=metrics,
    )


def refresh_stale_position_management_review(
    review: PositionManagementResult,
    *,
    event: ManagementEvent,
    exposure: ManagedExposure,
) -> PositionManagementResult:
    if not structured_review_has_stale_current_price(review.structuredReview, review.rationale, event.metrics):
        return review
    metrics = event.metrics
    price = numeric_metric(metrics, "price")
    entry = numeric_metric(metrics, "entryPrice") or exposure.entryPrice or exposure.limitPrice
    stop = numeric_metric(metrics, "stopLoss") or exposure.stopLoss
    target = numeric_metric(metrics, "takeProfit") or exposure.takeProfit
    pnl = numeric_metric(metrics, "unrealizedPnl") or exposure.unrealizedPnl
    progress_r = numeric_metric(metrics, "progressR")
    side = str(exposure.side or "").upper() or "POSITION"
    action_type = primary_action_type(review) or review.decision
    position_state = management_position_state(side=side, price=price, entry=entry)
    fallback_title = None
    if str(review.sourceLocale or "en").lower().startswith("en"):
        fallback_title = management_decision_title(action_type=action_type, position_state=position_state)
    structured = StructuredReview(
        title=fallback_title,
        verdict=review.decision.replace("_", " ").title(),
        headline=management_decision_headline(side=side, price=price, action_type=action_type, position_state=position_state),
        action=management_action_sentence(action_type, position_state),
        keyReasons=[
            management_visible_metric_reason(
                action_type=action_type,
                price=price,
                entry=entry,
                stop=stop,
                target=target,
                pnl=pnl,
                progress_r=progress_r,
            ),
            management_live_context_sentence(action_type, side=side, position_state=position_state),
        ],
        risks=[management_risk_sentence(side=side, stop=stop, target=target)],
        watchConditions=[management_watch_sentence(side=side, stop=stop, target=target, entry=entry)],
        managerNote=management_note_sentence(action_type, side=side),
    )
    rationale = " ".join(
        [
            management_visible_metric_reason(
                action_type=action_type,
                price=price,
                entry=entry,
                stop=stop,
                target=target,
                pnl=pnl,
                progress_r=progress_r,
            ),
            management_watch_sentence(side=side, stop=stop, target=target, entry=entry),
        ]
    )
    return review.model_copy(
        update={
            "structuredReview": structured,
            "rationale": rationale,
            "riskFlags": unique_strings([*review.riskFlags, "STALE_STRUCTURED_REVIEW_REFRESHED"]),
        }
    )


def enforce_pending_order_cancel_event(
    review: PositionManagementResult,
    *,
    event: ManagementEvent,
    exposure: ManagedExposure,
) -> PositionManagementResult:
    if exposure.kind != "order":
        return review
    suggested_action = (event.suggestedAction or "").upper()
    if suggested_action not in PENDING_ORDER_CANCEL_ACTIONS:
        return review
    current_action = (primary_action_type(review) or review.decision or "").upper()
    if current_action in PENDING_ORDER_CANCEL_ACTIONS:
        return review
    enforced_decision = suggested_action if suggested_action in PENDING_ORDER_CANCEL_DECISIONS else "CANCEL_PENDING_ORDER"
    return review.model_copy(
        update={
            "decision": enforced_decision,
            "actions": [ManagementAction(type=suggested_action, reason=event.reason)],
            "riskChange": "REDUCED",
            "riskFlags": unique_strings([*review.riskFlags, "PENDING_ORDER_CANCEL_EVENT_ENFORCED"]),
        }
    )


def structured_review_has_stale_current_price(
    structured_review: Optional[StructuredReview],
    rationale: Optional[str],
    metrics: dict[str, Any],
) -> bool:
    current_price = numeric_metric(metrics, "price")
    if current_price is None:
        return False
    text = " ".join(structured_review_texts(structured_review) + ([rationale] if rationale else []))
    for match in CURRENT_PRICE_PATTERN.finditer(text):
        mentioned = parse_management_number(match.group(1))
        if mentioned is not None and abs(mentioned - current_price) > max(100.0, current_price * 0.006):
            return True
    return False


def structured_review_texts(structured_review: Optional[StructuredReview]) -> list[str]:
    if structured_review is None:
        return []
    values = [
        structured_review.title,
        structured_review.verdict,
        structured_review.headline,
        structured_review.action,
        *structured_review.keyReasons,
        *structured_review.risks,
        *structured_review.watchConditions,
        structured_review.managerNote,
    ]
    return [value for value in values if value]


def numeric_metric(metrics: dict[str, Any], key: str) -> Optional[float]:
    value = metrics.get(key)
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def parse_management_number(value: str) -> Optional[float]:
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


def format_management_price(value: Optional[float]) -> str:
    if value is None:
        return "-"
    return f"{value:,.1f}".rstrip("0").rstrip(".")


def format_management_pnl(value: Optional[float]) -> str:
    if value is None:
        return "-"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:,.2f}"


def management_position_state(*, side: str, price: Optional[float], entry: Optional[float]) -> str:
    if price is None or entry is None:
        return "active"
    is_winning = price >= entry if side == "LONG" else price <= entry
    return "working in profit" if is_winning else "under pressure"


def management_action_sentence(action_type: Optional[str], position_state: str) -> str:
    action = str(action_type or "HOLD").replace("_", " ").lower()
    if "close" in action:
        return "Close or reduce the exposure only if the hard invalidation is confirmed by the latest candle."
    if "cancel" in action:
        return "Cancel stale extra orders, but judge the open position from the current stop and target."
    if "move stop" in action or "breakeven" in action:
        return "Protect the position by keeping the stop tight; do not move risk farther away."
    return f"Hold the position for now because it is {position_state}, while watching the next invalidation trigger."


def management_decision_title(*, action_type: Optional[str], position_state: str) -> str:
    action = str(action_type or "HOLD").replace("_", " ").lower()
    if "partial" in action:
        return "Take some profit, keep the runner"
    if "close" in action:
        return "Exit before the edge fades"
    if "cancel" in action:
        return "Drop the stale extra order"
    if "move stop" in action or "breakeven" in action or "trail" in action:
        return "Protect the move now"
    if "profit" in position_state:
        return "Let the setup breathe"
    return "Patience, but no extra risk"


def management_live_context_sentence(action_type: Optional[str], *, side: str, position_state: str) -> str:
    action = str(action_type or "HOLD").replace("_", " ").lower()
    if "close" in action or "reduce" in action:
        return f"The {side} is {position_state}, so the review focuses on whether risk should be cut instead of simply waiting."
    if "cancel" in action:
        return f"The open {side} should be judged separately from any stale extra order that no longer improves the setup."
    if "move stop" in action or "breakeven" in action or "trail" in action:
        return f"The {side} is {position_state}, so the next decision is about protecting profit without loosening risk."
    return f"The {side} is {position_state}, so the review focuses on whether the original thesis still deserves patience."


def management_decision_headline(*, side: str, price: Optional[float], action_type: Optional[str], position_state: str) -> str:
    action = str(action_type or "HOLD").replace("_", " ").lower()
    price_text = format_management_price(price)
    if "partial" in action:
        return f"{side} is {position_state} near {price_text}, so the desk call is to take partial profit."
    if "close" in action:
        return f"{side} is {position_state} near {price_text}, so the desk call is to close the remaining position."
    if "move stop" in action or "breakeven" in action or "trail" in action:
        return f"{side} is {position_state} near {price_text}, so the desk call is to protect the stop."
    return f"{side} is {position_state} near {price_text}, so the desk call is to keep managing the thesis."


def management_visible_metric_reason(
    *,
    action_type: Optional[str],
    price: Optional[float],
    entry: Optional[float],
    stop: Optional[float],
    target: Optional[float],
    pnl: Optional[float],
    progress_r: Optional[float],
) -> str:
    action = str(action_type or "HOLD").replace("_", " ").lower()
    if "partial" in action or "close" in action:
        return (
            f"Price near {format_management_price(price)} has moved far enough from entry {format_management_price(entry)} "
            "that profit protection matters more than waiting for a perfect target."
        )
    if "move stop" in action or "breakeven" in action or "trail" in action:
        if progress_r is not None:
            return (
                f"With PnL {format_management_pnl(pnl)} and progress {progress_r:.2f}R, "
                "risk can be tightened without widening the original stop."
            )
        return f"The move from entry {format_management_price(entry)} justifies tighter risk control."
    return (
        f"Price near {format_management_price(price)} has not forced stop {format_management_price(stop)} "
        "or reached a target path that justifies profit-taking yet."
    )


def management_price_box_sentence(
    *,
    price: Optional[float],
    entry: Optional[float],
    stop: Optional[float],
    target: Optional[float],
    pnl: Optional[float],
    progress_r: Optional[float],
) -> str:
    progress = f", progress {progress_r:.2f}R" if progress_r is not None else ""
    return (
        f"Current price {format_management_price(price)}, entry {format_management_price(entry)}, "
        f"stop {format_management_price(stop)}, target {format_management_price(target)}, "
        f"PnL {format_management_pnl(pnl)}{progress}."
    )


def management_risk_sentence(*, side: str, stop: Optional[float], target: Optional[float]) -> str:
    if side == "SHORT":
        return (
            f"A move back toward stop {format_management_price(stop)} weakens the short, while continuation toward "
            f"{format_management_price(target)} keeps the target path open."
        )
    return (
        f"A move back toward stop {format_management_price(stop)} weakens the long, while continuation toward "
        f"{format_management_price(target)} keeps the target path open."
    )


def management_watch_sentence(
    *,
    side: str,
    stop: Optional[float],
    target: Optional[float],
    entry: Optional[float],
) -> str:
    reference = stop if stop is not None else entry
    if side == "SHORT":
        return (
            f"If a 15m close reclaims {format_management_price(reference)}, risk control should take priority; "
            f"if price extends toward {format_management_price(target)}, keep monitoring profit protection."
        )
    return (
        f"If a 15m close loses {format_management_price(reference)}, risk control should take priority; "
        f"if price extends toward {format_management_price(target)}, keep monitoring profit protection."
    )


def management_note_sentence(action_type: Optional[str], *, side: str) -> str:
    return f"Keep the next {side} decision anchored to live price, stop, and target; avoid widening risk without a fresh thesis."


def unique_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for value in values:
        key = str(value).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        items.append(key)
    return items


def apply_management_actions(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    event: ManagementEvent,
    exposure: ManagedExposure,
    review: PositionManagementResult,
    snapshot: dict,
    result: Optional[PaperEngineResult],
) -> list[dict[str, Any]]:
    mark_price = current_snapshot_price(snapshot)
    candle = snapshot_to_engine_candle(snapshot)
    applied: list[dict[str, Any]] = []
    state = ensure_trader_state(db, trader_id)

    for action in review.actions:
        action_type = action.type.upper()
        reason = action.reason or review.rationale or event.reason
        record = None

        if exposure.kind == "order":
            order = db.get(PaperOrderRecord, exposure.id)
            if not order or order.status != "open":
                applied.append({"type": action_type, "applied": False, "reason": "Paper order is no longer open."})
                continue
            if action_type in {"CANCEL_PENDING_ORDER", "CANCEL_REMAINING_ORDERS", "EXPIRE_PLAN", "REDUCE_RISK"}:
                record = cancel_paper_order(db, order, reason, result)
            elif action_type in {"ADJUST_PENDING_ORDER", "ADJUST_ENTRY"}:
                new_limit = safe_management_limit(order, action.price, mark_price)
                if new_limit is not None:
                    record = update_paper_order_limit(db, order, new_limit, reason, result)
            elif action_type in {"CLOSE_POSITION", "REDUCE_SIZE", "REDUCE_RISK"}:
                # AI가 오더에 CLOSE_POSITION / REDUCE_SIZE 를 보낸 경우 → 오더 취소로 처리
                record = cancel_paper_order(db, order, reason, result)
            elif action_type in {"HOLD", "LET_PROFIT_RUN", "NEEDS_MORE_DATA"}:
                applied.append({"type": action_type, "applied": False, "reason": "No paper state change requested."})
                continue

        elif exposure.kind == "position":
            position = db.get(PaperPositionRecord, exposure.id)
            if not position or position.status != "open":
                applied.append({"type": action_type, "applied": False, "reason": "Paper position is no longer open."})
                continue
            if action_type == "MOVE_STOP_TO_BREAKEVEN":
                new_stop = safe_management_stop(position, position.entry_price, mark_price)
                if new_stop is not None:
                    record = update_position_stop(db, position, new_stop, reason, result)
            elif action_type in {"MOVE_STOP", "TRAIL_STOP"}:
                new_stop = safe_management_stop(position, action.price, mark_price)
                if new_stop is not None:
                    record = update_position_stop(db, position, new_stop, reason, result)
            elif action_type in {"TAKE_PARTIAL_PROFIT", "REDUCE_RISK", "REDUCE_SIZE"}:
                reduction = build_reduction_decision(
                    db,
                    position=position,
                    action_type=action_type,
                    requested_fraction=action.quantityFraction,
                    review_decision=review.decision,
                    reason=reason,
                )
                reason = reduction.reason
                if not reduction.should_apply or reduction.quantity_fraction is None:
                    applied.append({"type": action_type, "applied": False, "reason": reduction.reason, "guarded": True})
                    continue
                record = reduce_position_by_management(
                    db,
                    state,
                    position,
                    mark_price,
                    reduction.quantity_fraction,
                    candle,
                    reason,
                    result,
                )
            elif action_type in {"ADD_TO_POSITION", "PYRAMID_POSITION"}:
                record = create_position_add_order(
                    db,
                    state=state,
                    position=position,
                    action=action,
                    mark_price=mark_price,
                    reason=reason,
                    result=result,
                )
            elif action_type == "CLOSE_POSITION":
                record = close_position_by_management(
                    db,
                    state,
                    position,
                    mark_price,
                    candle,
                    MANAGEMENT_CLOSE_REASON,
                    result,
                )
            elif action_type in {"CANCEL_REMAINING_ORDERS", "EXPIRE_PLAN"}:
                open_orders = db.execute(
                    select(PaperOrderRecord).where(
                        PaperOrderRecord.trader_id == trader_id,
                        PaperOrderRecord.symbol == symbol,
                        PaperOrderRecord.status == "open",
                    )
                ).scalars().all()
                for order in open_orders:
                    cancel_paper_order(db, order, reason, result)
                record = open_orders[0] if open_orders else None
            elif action_type in {"HOLD", "LET_PROFIT_RUN", "NEEDS_MORE_DATA"}:
                applied.append({"type": action_type, "applied": False, "reason": "No paper state change requested."})
                continue

        applied.append(
            {
                "type": action_type,
                "applied": record is not None,
                "reason": reason,
                "price": float(mark_price) if record is not None else action.price,
            }
        )

    # ── Fallback: decision=CLOSE_POSITION인데 실제로 포지션을 닫는 액션이 없는 경우 직접 청산 ──
    # AI가 decision에 CLOSE_POSITION을 담았지만 actions 리스트에 CLOSE_POSITION/REDUCE_SIZE 없이
    # HOLD나 빈 배열만 보낸 경우, decision을 우선시하여 포지션을 강제 종료한다.
    if (
        exposure.kind == "position"
        and review.decision == "CLOSE_POSITION"
        and not any(a.get("applied") for a in applied)
    ):
        position = db.get(PaperPositionRecord, exposure.id)
        if position and position.status == "open":
            fallback_reason = review.rationale or event.reason or "AI decision: CLOSE_POSITION (fallback)"
            record = close_position_by_management(
                db,
                state,
                position,
                mark_price,
                candle,
                MANAGEMENT_CLOSE_REASON,
                result,
            )
            applied.append({
                "type": "CLOSE_POSITION",
                "applied": record is not None,
                "reason": fallback_reason,
                "price": float(mark_price) if record is not None else None,
                "fallback": True,
            })

    return applied


async def run_management_reviews(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    snapshot: dict,
    provider_name: str,
    locale: str,
    result: Optional[PaperEngineResult],
) -> list[dict[str, Any]]:
    if not settings.enable_position_management_ai:
        return []

    strategy = get_strategy(trader_id)
    clean_provider = normalize_provider(
        provider_name or settings.position_management_provider or settings.ai_provider or "mock"
    )
    review_locale = normalize_locale(locale)
    profile = trader_management_profile(trader_id)
    cooldown_seconds = max(int(settings.position_management_cooldown_seconds or 0), 0)
    urgent_cooldown_seconds = max(int(settings.position_management_urgent_cooldown_seconds or 0), 0)
    configured_max_reviews = max(0, int(settings.position_management_max_reviews_per_cycle or 0))
    if configured_max_reviews <= 0:
        return []

    all_orders = db.execute(
        select(PaperOrderRecord)
        .where(PaperOrderRecord.trader_id == trader_id, PaperOrderRecord.symbol == symbol, PaperOrderRecord.status == "open")
        .order_by(PaperOrderRecord.submitted_at.asc(), PaperOrderRecord.id.asc())
    ).scalars().all()
    positions = db.execute(
        select(PaperPositionRecord)
        .where(PaperPositionRecord.trader_id == trader_id, PaperPositionRecord.symbol == symbol, PaperPositionRecord.status == "open")
        .order_by(PaperPositionRecord.opened_at.asc(), PaperPositionRecord.id.asc())
    ).scalars().all()

    # Pick only 1 representative pending order — the one whose limit_price is closest
    # to the current market price. All split/partial orders are ignored for review purposes.
    # This ensures exactly 1 "진입 대기" review per cycle regardless of order count.
    _current_price = float(snapshot.get("price") or 0)
    if all_orders:
        orders = [min(
            all_orders,
            key=lambda o: abs(float(o.limit_price or 0) - _current_price)
        )]
    else:
        orders = []

    active_exposure_count = len(orders) + len(positions)
    max_reviews = min(max(configured_max_reviews, active_exposure_count), 10)
    review_records: list[dict[str, Any]] = []

    if not orders and not positions:
        upsert_trader_agent_state(
            db,
            symbol=symbol,
            trader_id=trader_id,
            phase="IDLE",
            mode="WATCHING",
            next_review_at=None,
            payload={"reason": "No active paper exposure."},
            status="idle",
        )
        return []

    async def handle_event(event: ManagementEvent, exposure: ManagedExposure, *, force: bool = False) -> None:
        if len(review_records) >= max_reviews:
            return
        event_cooldown_seconds = management_review_cooldown_seconds(
            event,
            profile=profile,
            base_cooldown_seconds=cooldown_seconds,
            urgent_cooldown_seconds=urgent_cooldown_seconds,
        )
        if not force and recent_management_review_exists(
            db,
            trader_id=trader_id,
            symbol=symbol,
            exposure_kind=exposure.kind,
            exposure_id=exposure.id,
            event_type=event.eventType,
            cooldown_seconds=event_cooldown_seconds,
        ):
            return
        management_context = build_management_review_context(db, trader_id, symbol)
        payload = PositionManagementPayload(
            trader=strategy.profile,
            symbol=symbol,
            marketSnapshot=snapshot,
            event=event,
            exposure=exposure,
            locale=review_locale,
            **management_context,
        )
        try:
            review = await run_position_management_with_logging(db, payload, clean_provider, settings=settings)
            review.sourceLocale = review_locale
            review = refresh_stale_position_management_review(review, event=event, exposure=exposure)
            review = enforce_pending_order_cancel_event(review, event=event, exposure=exposure)
            if event.eventType == PRICE_SHOCK_EVENT_TYPE:
                review.nextReviewInSeconds = max(60, int(settings.price_shock_review_seconds or 120))
            applied_actions = apply_management_actions(
                db,
                trader_id=trader_id,
                symbol=symbol,
                event=event,
                exposure=exposure,
                review=review,
                snapshot=snapshot,
                result=result,
            )
            record = create_position_management_review(
                db,
                symbol=symbol,
                trader_id=trader_id,
                event=event,
                exposure=exposure,
                review=review,
                applied_actions=applied_actions,
                notify=False,
            )
        except Exception as exc:
            review = PositionManagementResult(
                decision="NEEDS_MORE_DATA",
                confidence=0,
                riskLevel="HIGH",
                actions=[],
                riskChange="UNCHANGED",
                nextReviewInSeconds=cooldown_seconds,
                rationale="Position management provider failed.",
                counterThesis="Hard paper risk engine remains active.",
                reviewFacts=[
                    {
                        "code": "provider_failed",
                        "labelKey": "reviewFact.providerFailed",
                        "severity": "warn",
                    }
                ],
                riskFlags=["provider_failed"],
                provider=clean_provider,
                model=clean_provider,
                sourceLocale=review_locale,
                fallback=False,
            )
            record = create_position_management_review(
                db,
                symbol=symbol,
                trader_id=trader_id,
                event=event,
                exposure=exposure,
                review=review,
                status="error",
                error_message=sanitize_error_message(str(exc)),
                applied_actions=[],
                notify=False,
            )
        if record.status == "ok":
            await fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
                source_id=record.id,
                payload=from_json(record.payload_json) or {},
                symbol=symbol,
                trader_id=trader_id,
            )
        from app.subscribers import notify_subscribers_for_management_review

        notify_subscribers_for_management_review(db, record)
        mode = agent_mode_for_event(event, exposure)
        action_type = primary_action_type(review)
        is_price_shock_event = event.eventType == PRICE_SHOCK_EVENT_TYPE
        next_review_at = next_review_at_from_review(
            review,
            urgent=event.severity.upper() == "HIGH",
            max_seconds=settings.price_shock_review_seconds if is_price_shock_event else None,
        )
        if is_price_shock_event:
            mark_price_shock_review_consumed(symbol)
        state = upsert_trader_agent_state(
            db,
            symbol=symbol,
            trader_id=trader_id,
            phase=event.phase,
            mode=mode,
            next_review_at=next_review_at,
            last_review_id=record.id,
            last_event_type=event.eventType,
            last_decision=review.decision,
            last_action_type=action_type,
            provider=review.provider,
            model=review.model,
            payload={
                "event": event.model_dump(),
                "review": review.model_dump(),
                "exposure": exposure.model_dump(),
                "nextReviewAt": next_review_at.isoformat(),
                "mode": mode,
            },
        )
        serialized = serialize_record(record)
        serialized["agentState"] = serialize_record(state)
        review_records.append(serialized)

    for order in orders:
        exposure = managed_exposure_from_order(order)
        shock_event = (
            price_shock_event_for_exposure(
                trader_id=trader_id,
                symbol=symbol,
                exposure=exposure,
                snapshot=snapshot,
            )
            if should_run_price_shock_review(
                db,
                trader_id=trader_id,
                symbol=symbol,
                exposure=exposure,
                snapshot=snapshot,
            )
            else None
        )
        events = [shock_event] if shock_event else order_management_events(trader_id, order, snapshot)
        if not events and not positions and should_run_heartbeat(
            db,
            trader_id=trader_id,
            symbol=symbol,
            exposure=exposure,
            heartbeat_seconds=settings.position_management_pending_heartbeat_seconds,
        ):
            events = [heartbeat_event_for_order(trader_id, order, snapshot)]
        for event in events:
            await handle_event(
                event,
                exposure,
                force=event.eventType == PRICE_SHOCK_EVENT_TYPE,
            )
            if len(review_records) >= max_reviews:
                break
        if len(review_records) >= max_reviews:
            break

    if len(review_records) < max_reviews:
        for position in positions:
            if position.status != "open":
                continue
            exposure = managed_exposure_from_position(position)
            shock_event = (
                price_shock_event_for_exposure(
                    trader_id=trader_id,
                    symbol=symbol,
                    exposure=exposure,
                    snapshot=snapshot,
                )
                if should_run_price_shock_review(
                    db,
                    trader_id=trader_id,
                    symbol=symbol,
                    exposure=exposure,
                    snapshot=snapshot,
                )
                else None
            )
            events = [shock_event] if shock_event else position_management_events(trader_id, position, snapshot)
            if not events and should_run_heartbeat(
                db,
                trader_id=trader_id,
                symbol=symbol,
                exposure=exposure,
                heartbeat_seconds=settings.position_management_open_heartbeat_seconds,
            ):
                events = [heartbeat_event_for_position(trader_id, position, snapshot)]
            for event in events:
                await handle_event(
                    event,
                    exposure,
                    force=event.eventType == PRICE_SHOCK_EVENT_TYPE,
                )
                if len(review_records) >= max_reviews:
                    break
            if len(review_records) >= max_reviews:
                break

    if not review_records:
        active_phase = "OPEN_POSITION" if positions else "PENDING_ORDER"
        active_exposure = managed_exposure_from_position(positions[0]) if positions else managed_exposure_from_order(orders[0])
        state = latest_agent_state(db, trader_id, symbol)
        next_review_at = next_active_exposure_review_at(
            db,
            trader_id=trader_id,
            symbol=symbol,
            orders=[] if positions else orders,
            positions=positions,
        )
        if next_review_at is None:
            next_review_at = utc_datetime(state.next_review_at) if state and state.next_review_at else (
                datetime.now(timezone.utc)
                + timedelta(
                    seconds=settings.position_management_open_heartbeat_seconds
                    if positions
                    else settings.position_management_pending_heartbeat_seconds
                )
            )
        upsert_trader_agent_state(
            db,
            symbol=symbol,
            trader_id=trader_id,
            phase=active_phase,
            mode="MONITORING",
            next_review_at=next_review_at,
            last_review_id=state.last_review_id if state else None,
            last_event_type=state.last_event_type if state else None,
            last_decision=state.last_decision if state else None,
            last_action_type=state.last_action_type if state else None,
            provider=state.provider if state else clean_provider,
            model=state.model if state else None,
            payload={
                "reason": "Active exposure monitored without a fresh AI call in this cycle.",
                "exposure": active_exposure.model_dump(),
                "nextReviewAt": next_review_at.isoformat() if next_review_at else None,
            },
        )

    db.flush()
    return review_records


async def process_existing_paper_exposure(
    db: Session,
    trader_id: str,
    symbol: str,
    snapshot: dict,
    provider_name: str,
    locale: str,
) -> dict:
    before = list_active_paper_exposure(db, trader_id, symbol)
    result = None
    management_reviews: list[dict[str, Any]] = []
    status_feed_ids: list[int] = []
    if before["hasExposure"]:
        sync_default_paper_settings(db, trader_id, symbol, settings)
        async with PAPER_EXECUTION_LOCK:
            result = process_candle(db, trader_id, symbol, snapshot_to_engine_candle(snapshot))
        management_reviews = await run_management_reviews(
            db,
            trader_id=trader_id,
            symbol=symbol,
            snapshot=snapshot,
            provider_name=provider_name,
            locale=locale,
            result=result,
        )
        status_feed_records = await create_status_feeds_for_trade_events(db, settings=settings, events=result.events)
        status_feed_ids = [record.id for record in status_feed_records if record.id is not None]
    after = list_active_paper_exposure(db, trader_id, symbol)
    prune_trader_database(db, trader_id, symbol)
    agent_state = latest_agent_state(db, trader_id, symbol)
    return {
        "before": before,
        "after": after,
        "engine": engine_result_payload(result),
        "managementReviews": management_reviews,
        "statusFeedIds": status_feed_ids,
        "agentState": serialize_record(agent_state) if agent_state else None,
    }


def list_filtered_records(
    db: Session,
    model,
    *,
    limit: int = 20,
    offset: int = 0,
    symbol: Optional[str] = None,
    trader_id: Optional[str] = None,
    status: Optional[str] = None,
    include_payload: bool = False,
    locale: str = CANONICAL_AI_LOCALE,
    payload_mode: str = "full",
) -> list[dict]:
    safe_limit = max(1, min(limit, 1000))
    safe_offset = max(0, offset)
    stmt = select(model) if include_payload else slim_select(model)
    if symbol:
        stmt = stmt.where(model.symbol == normalize_symbol(symbol))
    if trader_id:
        stmt = stmt.where(model.trader_id == trader_id)
    if status:
        stmt = stmt.where(model.status == status)

    stmt = stmt.order_by(desc(model.created_at), desc(model.id))
    if safe_offset > 0:
        stmt = stmt.offset(safe_offset)

    records = db.execute(stmt.limit(safe_limit)).scalars().all()
    return [
        serialize_record_for_ui(record, include_payload=include_payload, locale=locale, payload_mode=payload_mode)
        for record in records
    ]


def list_overview_review_records(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    symbol: Optional[str] = None,
    trader_id: Optional[str] = None,
    locale: str = CANONICAL_AI_LOCALE,
) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 50))
    safe_offset = max(0, offset)
    fetch_window = safe_offset + safe_limit + 1
    clean_symbol = normalize_symbol(symbol) if symbol else None

    candidates: list[tuple[str, Any]] = []
    for source, model in (
        ("entry_review", AIReviewRecord),
        ("management_review", PositionManagementReviewRecord),
    ):
        stmt = overview_filtered_select(source, model)
        if clean_symbol:
            stmt = stmt.where(model.symbol == clean_symbol)
        if trader_id:
            stmt = stmt.where(model.trader_id == trader_id)
        stmt = stmt.order_by(desc(model.created_at), desc(model.id)).limit(fetch_window)
        candidates.extend((source, record) for record in db.execute(stmt).scalars().all())

    candidates.sort(key=lambda item: (item[1].created_at, item[1].id), reverse=True)
    page_candidates = candidates[safe_offset:safe_offset + safe_limit]
    translation_overlays = overview_translation_overlays(db, page_candidates, locale=locale)

    reviews = []
    for source, record in page_candidates:
        localized_payload, translation_meta = translation_overlays.get((source, record.id), (None, None))
        reviews.append(
            serialize_overview_review_record(
                record,
                overview_source=source,
                locale=locale,
                payload_override=localized_payload,
                translation_meta=translation_meta,
                include_cached_translation=False,
            )
        )
    return {
        "reviews": reviews,
        "nextOffset": safe_offset + len(reviews),
        "hasMore": len(candidates) > safe_offset + safe_limit,
    }


def overview_review_cache_key(
    *,
    limit: int = 20,
    offset: int = 0,
    symbol: Optional[str] = None,
    trader_id: Optional[str] = None,
    locale: str = CANONICAL_AI_LOCALE,
) -> tuple[int, int, Optional[str], Optional[str], str]:
    clean_symbol = normalize_symbol(symbol) if symbol else None
    clean_locale = normalize_locale(locale)
    return (max(1, min(limit, 50)), max(0, offset), clean_symbol, trader_id, clean_locale)


def cached_overview_review_records(
    db: Session | None = None,
    *,
    limit: int = 20,
    offset: int = 0,
    symbol: Optional[str] = None,
    trader_id: Optional[str] = None,
    locale: str = CANONICAL_AI_LOCALE,
    prefer_cached: bool = False,
) -> dict[str, Any]:
    key = overview_review_cache_key(limit=limit, offset=offset, symbol=symbol, trader_id=trader_id, locale=locale)
    cached = OVERVIEW_REVIEWS_CACHE.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    if cached:
        if key not in OVERVIEW_REVIEWS_REFRESHING:
            OVERVIEW_REVIEWS_REFRESHING.add(key)
            schedule_thread_refresh(
                refresh_overview_review_cache_background,
                key[0],
                key[1],
                key[2],
                key[3],
                key[4],
        )
        return cached[1]
    if prefer_cached:
        if key not in OVERVIEW_REVIEWS_REFRESHING:
            OVERVIEW_REVIEWS_REFRESHING.add(key)
            schedule_thread_refresh(
                refresh_overview_review_cache_background,
                key[0],
                key[1],
                key[2],
                key[3],
                key[4],
            )
        return {
            "reviews": [],
            "nextOffset": key[1],
            "hasMore": True,
            "warming": True,
        }
    if db is None:
        with session_scope() as scoped_db:
            return cached_overview_review_records(
                scoped_db,
                limit=key[0],
                offset=key[1],
                symbol=key[2],
                trader_id=key[3],
                locale=key[4],
                prefer_cached=prefer_cached,
            )
    payload = list_overview_review_records(
        db,
        limit=key[0],
        offset=key[1],
        symbol=key[2],
        trader_id=key[3],
        locale=key[4],
    )
    OVERVIEW_REVIEWS_CACHE[key] = (time.monotonic() + OVERVIEW_REVIEWS_CACHE_TTL_SECONDS, payload)
    return payload


def refresh_overview_review_cache_background(
    limit: int,
    offset: int,
    symbol: Optional[str],
    trader_id: Optional[str],
    locale: str,
) -> None:
    key = (max(1, min(limit, 50)), max(0, offset), symbol, trader_id, normalize_locale(locale))
    try:
        with session_scope() as db:
            payload = list_overview_review_records(
                db,
                limit=key[0],
                offset=key[1],
                symbol=key[2],
                trader_id=key[3],
                locale=key[4],
            )
            OVERVIEW_REVIEWS_CACHE[key] = (time.monotonic() + OVERVIEW_REVIEWS_CACHE_TTL_SECONDS, payload)
    finally:
        OVERVIEW_REVIEWS_REFRESHING.discard(key)


def overview_review_warm_locales() -> set[str]:
    return {
        *SUPPORTED_LOCALES,
        *(normalize_locale(item) for item in settings.ai_translation_target_locales),
    }


def warm_overview_review_cache(db: Session, clean_symbol: str) -> None:
    for locale in overview_review_warm_locales():
        cached_overview_review_records(db, limit=20, offset=0, symbol=clean_symbol, locale=locale)


def serialize_overview_review_record(
    record,
    *,
    overview_source: str,
    locale: str = CANONICAL_AI_LOCALE,
    payload_override: dict[str, Any] | None = None,
    translation_meta: dict[str, Any] | None = None,
    include_cached_translation: bool = True,
) -> dict[str, Any]:
    data = serialize_record_slim(record)
    data["overviewSource"] = overview_source
    payload = payload_override if payload_override is not None else from_json(getattr(record, "payload_json", None)) or {}
    record_session = object_session(record)
    if include_cached_translation and isinstance(payload, dict) and record_session is not None:
        if isinstance(record, AIReviewRecord):
            payload, translation_meta = localized_payload_for_source(
                db=record_session,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=record.id,
                payload=payload,
                locale=locale,
            )
        elif isinstance(record, PositionManagementReviewRecord):
            payload, translation_meta = localized_payload_for_source(
                db=record_session,
                source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
                source_id=record.id,
                payload=payload,
                locale=locale,
            )
    if not isinstance(payload, dict):
        payload = {}

    if isinstance(record, AIReviewRecord):
        structured = payload.get("structuredReview") if isinstance(payload.get("structuredReview"), dict) else {}
        data["source"] = "entry_review"
        data["structuredReview"] = structured
        data["approvalReason"] = payload.get("approvalReason")
        data["rationale"] = payload.get("approvalReason") or payload.get("rationale") or structured.get("headline") or structured.get("action")
        data["riskFlags"] = payload.get("riskFlags") or []
        data["reviewFacts"] = payload.get("reviewFacts") or []
    elif isinstance(record, PositionManagementReviewRecord):
        event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
        review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
        structured = (
            review.get("structuredReview")
            if isinstance(review.get("structuredReview"), dict)
            else payload.get("structuredReview") if isinstance(payload.get("structuredReview"), dict)
            else {}
        )
        data["source"] = "management_review"
        data["event"] = {
            "eventType": event.get("eventType"),
            "phase": event.get("phase"),
            "severity": event.get("severity"),
            "reason": event.get("reason"),
            "suggestedAction": event.get("suggestedAction"),
        }
        data["review"] = {
            "decision": review.get("decision") or data.get("decision"),
            "action": review.get("action") or data.get("actionType"),
            "rationale": review.get("rationale"),
            "structuredReview": structured,
        }
        data["structuredReview"] = structured
        data["rationale"] = review.get("rationale") or structured.get("headline") or structured.get("action") or event.get("reason")
        data["riskFlags"] = review.get("riskFlags") or []
        data["reviewFacts"] = review.get("reviewFacts") or []
        data["riskLevel"] = review.get("riskLevel") or data.get("riskLevel")
    if translation_meta is not None:
        data["translation"] = translation_meta
    return data


def list_records_slim(db: Session, model, limit: int = 20) -> list:
    safe_limit = max(1, min(limit, 100))
    records = db.execute(slim_select(model).order_by(desc(model.created_at), desc(model.id)).limit(safe_limit)).scalars().all()
    return [serialize_record_slim(record) for record in records]


def latest_model_record(db: Session, model, trader_id: str, symbol: Optional[str] = None):
    stmt = select(model).where(model.trader_id == trader_id)
    if symbol:
        stmt = stmt.where(model.symbol == symbol)
    return db.execute(stmt.order_by(desc(model.created_at), desc(model.id)).limit(1)).scalar_one_or_none()


def count_model_records(db: Session, model, trader_id: str, symbol: Optional[str] = None, status: Optional[str] = None) -> int:
    stmt = select(func.count()).select_from(model).where(model.trader_id == trader_id)
    if symbol:
        stmt = stmt.where(model.symbol == symbol)
    if status:
        stmt = stmt.where(model.status == status)
    return int(db.scalar(stmt) or 0)


def has_meaningful_paper_state(db: Session, trader_id: str, symbol: Optional[str] = None, state: Optional[TraderStateRecord] = None) -> bool:
    if count_model_records(db, PaperOrderRecord, trader_id, symbol) > 0:
        return True
    if count_model_records(db, PaperPositionRecord, trader_id, symbol) > 0:
        return True
    if count_model_records(db, TradeEventRecord, trader_id, symbol) > 0:
        return True
    if count_model_records(db, EquitySnapshotRecord, trader_id, symbol) > 0:
        return True
    if state and (
        float(state.realized_pnl or 0) != 0
        or float(state.unrealized_pnl or 0) != 0
        or float(state.total_fees or 0) != 0
    ):
        return True
    return False


def latest_ai_review_cooldown(db: Session, trader_id: str, symbol: str) -> Optional[dict[str, Any]]:
    cooldown_seconds = max(0, int(settings.ai_rejection_cooldown_seconds or 0))
    if cooldown_seconds <= 0:
        return None
    latest_review = db.execute(
        select(AIReviewRecord)
        .where(AIReviewRecord.trader_id == trader_id, AIReviewRecord.symbol == symbol)
        .order_by(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    if not latest_review or (latest_review.decision or "").upper() not in AI_COOLDOWN_DECISIONS:
        return None
    now = datetime.now(timezone.utc)
    created_at = latest_review.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    elapsed_seconds = int((now - created_at).total_seconds())
    remaining_seconds = cooldown_seconds - elapsed_seconds
    if remaining_seconds <= 0:
        return None
    return {
        "reviewId": latest_review.id,
        "decision": latest_review.decision,
        "provider": latest_review.provider,
        "model": latest_review.model,
        "createdAt": created_at.isoformat(),
        "cooldownSeconds": cooldown_seconds,
        "remainingSeconds": remaining_seconds,
    }


def latest_ai_review_cooldown_map(db: Session, trader_ids: list[str], symbol: str) -> dict[str, dict[str, Any]]:
    cooldown_seconds = max(0, int(settings.ai_rejection_cooldown_seconds or 0))
    unique_trader_ids = sorted({trader_id for trader_id in trader_ids if trader_id})
    if cooldown_seconds <= 0 or not unique_trader_ids:
        return {}

    reviews = db.execute(
        select(AIReviewRecord)
        .where(
            AIReviewRecord.trader_id.in_(unique_trader_ids),
            AIReviewRecord.symbol == symbol,
        )
        .order_by(AIReviewRecord.trader_id.asc(), desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
    ).scalars().all()
    now = datetime.now(timezone.utc)
    cooldowns: dict[str, dict[str, Any]] = {}
    seen: set[str] = set()
    for review in reviews:
        trader_id = review.trader_id
        if not trader_id or trader_id in seen:
            continue
        seen.add(trader_id)
        if (review.decision or "").upper() not in AI_COOLDOWN_DECISIONS:
            continue
        created_at = review.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        elapsed_seconds = int((now - created_at).total_seconds())
        remaining_seconds = cooldown_seconds - elapsed_seconds
        if remaining_seconds <= 0:
            continue
        cooldowns[trader_id] = {
            "reviewId": review.id,
            "decision": review.decision,
            "provider": review.provider,
            "model": review.model,
            "createdAt": created_at.isoformat(),
            "cooldownSeconds": cooldown_seconds,
            "remainingSeconds": remaining_seconds,
        }
    return cooldowns


BREAKEVEN_CLOSE_REASONS = {"breakeven", "stop_at_entry"}
PAPER_OUTCOME_PNL_TOLERANCE = 0.01


class ClosedPaperPositionLike(Protocol):
    realized_pnl: Decimal | int | float | None
    close_reason: Optional[str]


def position_id_value(record: Any) -> Optional[int]:
    value = getattr(record, "id", None)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def position_event_position_id(record: Any) -> Optional[int]:
    value = getattr(record, "position_id", None)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def trade_events_by_position_id(
    db: Session,
    positions: list[Any],
    *,
    before: Optional[datetime] = None,
) -> dict[int, list[TradeEventRecord]]:
    position_ids = [position_id for position in positions if (position_id := position_id_value(position)) is not None]
    if not position_ids:
        return {}
    stmt = select(TradeEventRecord).where(TradeEventRecord.position_id.in_(position_ids))
    if before is not None:
        stmt = stmt.where(TradeEventRecord.created_at < before)
    events = db.execute(stmt).scalars().all()
    by_position_id: dict[int, list[TradeEventRecord]] = {}
    for event in events:
        position_id = position_event_position_id(event)
        if position_id is None:
            continue
        by_position_id.setdefault(position_id, []).append(event)
    return by_position_id


def realized_event_pnl_total(events: list[Any]) -> tuple[float, bool]:
    total = 0.0
    has_realized_event = False
    for event in events:
        realized_pnl = float(getattr(event, "realized_pnl", 0) or 0)
        total += realized_pnl
        if abs(realized_pnl) > 0:
            has_realized_event = True
    return total, has_realized_event


def position_cycle_pnl_value(
    position: Any,
    events_by_position_id: Mapping[int, list[Any]],
    *,
    include_unrealized: bool = True,
) -> float:
    position_id = position_id_value(position)
    event_realized_pnl = 0.0
    has_realized_event = False
    if position_id is not None:
        event_realized_pnl, has_realized_event = realized_event_pnl_total(events_by_position_id.get(position_id, []))
    realized_pnl = event_realized_pnl if has_realized_event else float(getattr(position, "realized_pnl", 0) or 0)
    if include_unrealized and str(getattr(position, "status", "") or "").lower() == "open":
        realized_pnl += float(getattr(position, "unrealized_pnl", 0) or 0)
    return realized_pnl


def position_cycle_pnl_values(
    positions: list[Any],
    events_by_position_id: Mapping[int, list[Any]],
    *,
    include_unrealized: bool = True,
) -> list[float]:
    return [
        position_cycle_pnl_value(position, events_by_position_id, include_unrealized=include_unrealized)
        for position in positions
    ]


def biggest_win_from_pnls(values: list[float]) -> float:
    winners = [value for value in values if value > PAPER_OUTCOME_PNL_TOLERANCE]
    return round(max(winners), 4) if winners else 0.0


def biggest_loss_from_pnls(values: list[float]) -> float:
    losers = [value for value in values if value < -PAPER_OUTCOME_PNL_TOLERANCE]
    return round(min(losers), 4) if losers else 0.0


def win_loss_counts_from_pnls(values: list[float]) -> tuple[int, int]:
    wins = sum(1 for value in values if value > PAPER_OUTCOME_PNL_TOLERANCE)
    losses = sum(1 for value in values if value < -PAPER_OUTCOME_PNL_TOLERANCE)
    return wins, losses


def is_breakeven_position(position: ClosedPaperPositionLike) -> bool:
    reason = str(position.close_reason or "").strip().lower()
    pnl = float(position.realized_pnl or 0)
    return reason in BREAKEVEN_CLOSE_REASONS or abs(pnl) <= PAPER_OUTCOME_PNL_TOLERANCE


def is_winning_position(position: ClosedPaperPositionLike) -> bool:
    return not is_breakeven_position(position) and float(position.realized_pnl or 0) > PAPER_OUTCOME_PNL_TOLERANCE


def is_losing_position(position: ClosedPaperPositionLike) -> bool:
    return not is_breakeven_position(position) and float(position.realized_pnl or 0) < -PAPER_OUTCOME_PNL_TOLERANCE


def win_rate_from_counts(wins: int, losses: int) -> float:
    counted_positions = wins + losses
    return round((wins / counted_positions) * 100, 2) if counted_positions else 0.0


def position_win_loss_counts(db: Session, trader_id: str, symbol: Optional[str] = None) -> tuple[int, int, int]:
    stmt = select(PaperPositionRecord).where(
        PaperPositionRecord.trader_id == trader_id,
        PaperPositionRecord.status == "closed",
    )
    if symbol:
        stmt = stmt.where(PaperPositionRecord.symbol == symbol)
    positions = db.execute(stmt).scalars().all()
    events_by_position_id = trade_events_by_position_id(db, positions)
    position_pnls = position_cycle_pnl_values(positions, events_by_position_id, include_unrealized=False)
    wins, losses = win_loss_counts_from_pnls(position_pnls)
    return len(positions), wins, losses


def paper_position_stats(db: Session, trader_id: str, symbol: Optional[str] = None) -> dict[str, Any]:
    stmt = select(PaperPositionRecord).where(PaperPositionRecord.trader_id == trader_id)
    if symbol:
        stmt = stmt.where(PaperPositionRecord.symbol == symbol)
    positions = db.execute(stmt).scalars().all()
    closed = [position for position in positions if position.status == "closed"]
    open_positions = [position for position in positions if position.status == "open"]
    events_by_position_id = trade_events_by_position_id(db, positions)
    cycle_pnl_values = position_cycle_pnl_values(positions, events_by_position_id)
    pnl_values = position_cycle_pnl_values(closed, events_by_position_id, include_unrealized=False)
    leverage_values = [float(position.leverage or 0) for position in positions if float(position.leverage or 0) > 0]
    long_count = sum(1 for position in positions if position.side == "long")
    short_count = sum(1 for position in positions if position.side == "short")
    avg = sum(pnl_values) / len(pnl_values) if pnl_values else 0.0
    variance = sum((value - avg) ** 2 for value in pnl_values) / len(pnl_values) if len(pnl_values) > 1 else 0.0
    stddev = variance ** 0.5
    sharpe_proxy = round(avg / stddev, 3) if stddev > 0 else 0.0
    open_notional = sum(float(position.notional or 0) for position in open_positions)
    open_margin = sum(float(position.margin or 0) for position in open_positions)
    return {
        "totalTrades": len(closed),
        "biggestWin": biggest_win_from_pnls(cycle_pnl_values),
        "biggestLoss": biggest_loss_from_pnls(cycle_pnl_values),
        "averageLeverage": round(sum(leverage_values) / len(leverage_values), 2) if leverage_values else None,
        "sharpeProxy": sharpe_proxy,
        "longTrades": long_count,
        "shortTrades": short_count,
        "openNotional": round(open_notional, 4),
        "openMargin": round(open_margin, 4),
    }


def open_order_stats(db: Session, trader_id: str, symbol: Optional[str] = None) -> dict[str, Any]:
    stmt = select(PaperOrderRecord).where(PaperOrderRecord.trader_id == trader_id, PaperOrderRecord.status == "open")
    if symbol:
        stmt = stmt.where(PaperOrderRecord.symbol == symbol)
    orders = db.execute(stmt).scalars().all()
    notional = 0.0
    planned_weight = 0.0
    for order in orders:
        price = float(order.limit_price or order.filled_price or 0)
        notional += price * float(order.quantity or 0)
        payload = serialize_record(order).get("payload") or {}
        try:
            planned_weight += float(payload.get("entryWeight") or 0)
        except (TypeError, ValueError):
            pass
    return {
        "openOrderNotional": round(notional, 4),
        "pendingEntryWeight": round(planned_weight, 4) if planned_weight else None,
    }


def slim_record(record) -> dict[str, Any]:
    data = {}
    for column in record.__table__.columns:
        name = column.name
        if name in {"payload_json", "raw_json", "error_message"}:
            continue
        value = getattr(record, name)
        if isinstance(value, Decimal):
            value = float(value)
        elif isinstance(value, datetime):
            value = value.isoformat()
        data[name] = value
        data.setdefault("".join([part if index == 0 else part.capitalize() for index, part in enumerate(name.split("_"))]), value)
    return data


def leaderboard_snapshot_to_summary(record: TraderLeaderboardSnapshotRecord) -> dict[str, Any]:
    payload = from_json(record.payload_json) or {}
    return {
        "traderId": record.trader_id,
        "traderName": record.trader_name,
        "symbol": record.symbol,
        "mode": record.mode,
        "hasLivePaperData": bool(
            record.has_live_paper_data
            or
            record.open_orders
            or record.open_positions
            or record.closed_positions
            or float(record.total_pnl or 0) != 0
            or record.latest_run_status
            or record.latest_plan_status
        ),
        "equity": round(float(record.equity or 0), 4),
        "cashBalance": round(float(record.cash_balance or 0), 4),
        "realizedPnl": round(float(record.realized_pnl or 0), 4),
        "unrealizedPnl": round(float(record.unrealized_pnl or 0), 4),
        "totalFees": round(float(record.total_fees or 0), 4),
        "totalPnl": round(float(record.total_pnl or 0), 4),
        "rankScore": record.rank_score,
        "return7d": record.return_7d,
        "return30d": record.return_30d,
        "winRate": record.win_rate,
        "closedPositions": record.closed_positions,
        "wins": record.wins,
        "losses": record.losses,
        "maxDrawdown": record.max_drawdown,
        "riskPercent": record.risk_percent,
        "leverage": record.leverage,
        "openOrders": record.open_orders,
        "openPositions": record.open_positions,
        "biggestWin": record.biggest_win,
        "biggestLoss": record.biggest_loss,
        "averageLeverage": record.average_leverage,
        "sharpe": record.sharpe,
        "longTrades": record.long_trades,
        "shortTrades": record.short_trades,
        "openNotional": record.open_notional,
        "openMargin": record.open_margin,
        "openOrderNotional": record.open_order_notional,
        "pendingEntryWeight": record.pending_entry_weight,
        "latestRunStatus": record.latest_run_status,
        "latestPlanStatus": record.latest_plan_status,
        "agentMode": record.agent_mode,
        "agentPhase": record.agent_phase,
        "nextReviewAt": record.next_review_at.isoformat() if record.next_review_at else None,
        "lastDecision": record.last_decision,
        "lastAction": record.last_action,
        "currentPlanKo": record.current_plan_ko or payload.get("currentPlanKo"),
        "currentPlanEn": record.current_plan_en or payload.get("currentPlanEn"),
        "agentState": payload.get("agentState"),
        "updatedAt": record.updated_at.isoformat() if record.updated_at else None,
    }


def list_leaderboard_summaries(db: Session, symbol: str) -> list[dict[str, Any]]:
    try:
        records = db.execute(
            slim_select(TraderLeaderboardSnapshotRecord)
            .where(TraderLeaderboardSnapshotRecord.symbol == symbol)
            .order_by(
                desc(TraderLeaderboardSnapshotRecord.rank_score),
                desc(TraderLeaderboardSnapshotRecord.equity),
                TraderLeaderboardSnapshotRecord.trader_id.asc(),
            )
        ).scalars().all()
        return [leaderboard_snapshot_summary(record, record.rank or index) for index, record in enumerate(records, start=1)]
    except SQLAlchemyError:
        db.rollback()
        return compute_trader_summary_payload(db, symbol)


def trader_summary_payload(db: Session, symbol: str) -> list[dict[str, Any]]:
    return list_leaderboard_summaries(db, symbol)


def parse_utc_league_month(value: Optional[str]) -> Optional[tuple[str, datetime, datetime]]:
    if value is None or value == "":
        return None
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        raise HTTPException(status_code=400, detail="leagueMonth must use UTC YYYY-MM format.")
    year, month = (int(part) for part in value.split("-", 1))
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="leagueMonth must use UTC YYYY-MM format.")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if month == 12 else datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return value, start, end


def monthly_equity_points(
    db: Session,
    trader_id: str,
    symbol: str,
    period_start: datetime,
    period_end: datetime,
) -> tuple[Optional[EquitySnapshotRecord], Optional[EquitySnapshotRecord], list[EquitySnapshotRecord]]:
    in_period = db.execute(
        select(EquitySnapshotRecord)
        .where(
            EquitySnapshotRecord.trader_id == trader_id,
            EquitySnapshotRecord.symbol == symbol,
            EquitySnapshotRecord.created_at >= period_start,
            EquitySnapshotRecord.created_at < period_end,
        )
        .order_by(EquitySnapshotRecord.created_at.asc(), EquitySnapshotRecord.id.asc())
    ).scalars().all()
    baseline = db.execute(
        select(EquitySnapshotRecord)
        .where(
            EquitySnapshotRecord.trader_id == trader_id,
            EquitySnapshotRecord.symbol == symbol,
            EquitySnapshotRecord.created_at < period_start,
        )
        .order_by(desc(EquitySnapshotRecord.created_at), desc(EquitySnapshotRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    start_snapshot = baseline or (in_period[0] if in_period else None)
    end_snapshot = in_period[-1] if in_period else baseline
    return start_snapshot, end_snapshot, in_period


def monthly_drawdown_percent(start_equity: float, snapshots: list[Any], end_equity: float) -> float:
    snapshot_values: list[float] = []
    for snapshot in snapshots:
        if hasattr(snapshot, "equity"):
            snapshot_values.append(float(snapshot.equity))
        else:
            snapshot_values.append(float(snapshot))
    values = [start_equity, *snapshot_values, end_equity]
    values = [value for value in values if value > 0]
    if not values:
        return 0.0
    peak = values[0]
    max_dd = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            max_dd = min(max_dd, ((value - peak) / peak) * 100)
    return round(max_dd, 2)


def monthly_leaderboard_summaries(
    db: Session,
    symbol: str,
    period_start: datetime,
    period_end: datetime,
) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    league_month = f"{period_start.year:04d}-{period_start.month:02d}"
    traders = list_traders_for_league_month(league_month)
    trader_ids = [trader.id for trader in traders]
    equity_points_by_trader = monthly_equity_points_by_trader(db, trader_ids, symbol, period_start, period_end)
    positions_by_trader = monthly_positions_by_trader(db, trader_ids, symbol, period_start, period_end)
    cycle_positions_by_trader = monthly_cycle_positions_by_trader(db, trader_ids, symbol, period_start, period_end)
    all_time_biggest_wins = all_time_biggest_wins_by_trader(db, trader_ids, symbol)
    all_cycle_positions = [position for positions in cycle_positions_by_trader.values() for position in positions]
    cycle_events_by_position_id = trade_events_by_position_id(db, all_cycle_positions, before=period_end)
    for trader in traders:
        start_snapshot, end_snapshot, snapshots = equity_points_by_trader.get(trader.id, (None, None, []))
        if start_snapshot is None or end_snapshot is None:
            start_equity = float(settings.paper_default_equity)
            end_equity = start_equity
            realized_pnl = 0.0
            unrealized_pnl = 0.0
            total_fees = 0.0
        else:
            start_equity = float(start_snapshot.equity)
            end_equity = float(end_snapshot.equity)
            realized_pnl = float(end_snapshot.realized_pnl) - float(start_snapshot.realized_pnl)
            unrealized_pnl = float(end_snapshot.unrealized_pnl)
            total_fees = float(end_snapshot.total_fees) - float(start_snapshot.total_fees)
        total_pnl = end_equity - start_equity
        monthly_return = round((total_pnl / start_equity) * 100, 2) if start_equity > 0 else 0.0
        monthly_positions = positions_by_trader.get(trader.id, [])
        cycle_positions = cycle_positions_by_trader.get(trader.id, [])
        closed_position_pnls = position_cycle_pnl_values(
            monthly_positions,
            cycle_events_by_position_id,
            include_unrealized=False,
        )
        position_pnls = position_cycle_pnl_values(cycle_positions, cycle_events_by_position_id)
        closed_positions = len(monthly_positions)
        wins, losses = win_loss_counts_from_pnls(closed_position_pnls)
        biggest_win = all_time_biggest_wins.get(trader.id, 0.0)
        biggest_loss = biggest_loss_from_pnls(position_pnls)
        long_trades = sum(1 for position in monthly_positions if str(position.side).lower() == "long")
        short_trades = sum(1 for position in monthly_positions if str(position.side).lower() == "short")
        win_rate = win_rate_from_counts(wins, losses)
        summaries.append(
            {
                "traderId": trader.id,
                "traderName": trader.name,
                "symbol": symbol,
                "mode": "paper",
                "hasLivePaperData": bool(snapshots),
                "equity": round(end_equity, 4),
                "cashBalance": round(float(end_snapshot.cash_balance), 4) if end_snapshot else round(end_equity, 4),
                "realizedPnl": round(realized_pnl, 4),
                "unrealizedPnl": round(unrealized_pnl, 4),
                "totalFees": round(total_fees, 4),
                "totalPnl": round(total_pnl, 4),
                "rankScore": monthly_return,
                "cumulativeReturn": monthly_return,
                "monthlyReturn": monthly_return,
                "return24h": monthly_return,
                "return7d": monthly_return,
                "return30d": monthly_return,
                "winRate": win_rate,
                "closedPositions": closed_positions,
                "wins": wins,
                "losses": losses,
                "maxDrawdown": monthly_drawdown_percent(start_equity, snapshots, end_equity),
                "riskPercent": trader.baseRiskPercent,
                "leverage": None,
                "openOrders": 0,
                "openPositions": 0,
                "biggestWin": biggest_win,
                "biggestLoss": biggest_loss,
                "averageLeverage": None,
                "sharpe": 0.0,
                "longTrades": long_trades,
                "shortTrades": short_trades,
                "openNotional": 0.0,
                "openMargin": 0.0,
                "openOrderNotional": 0.0,
                "pendingEntryWeight": None,
                "latestRunStatus": None,
                "latestPlanStatus": None,
                "currentPlanKo": "UTC 월간 리그 집계입니다. 현재 진행 중인 주문/포지션은 라이브 랭킹에서 확인하세요.",
                "currentPlanEn": "UTC monthly league snapshot. Check the live ranking for active orders or positions.",
                "agentState": None,
                "agentMode": None,
                "agentPhase": None,
                "nextReviewAt": None,
                "lastDecision": None,
                "lastAction": None,
                "currentState": current_state("monthly_snapshot", "status.summary.watching", "monthly", None),
            }
        )
    return sorted(summaries, key=lambda item: (-float(item["monthlyReturn"]), -float(item["equity"]), str(item["traderId"])))


def monthly_equity_points_by_trader(
    db: Session,
    trader_ids: list[str],
    symbol: str,
    period_start: datetime,
    period_end: datetime,
) -> dict[str, tuple[Optional[EquitySnapshotRecord], Optional[EquitySnapshotRecord], list[Any]]]:
    if not trader_ids:
        return {}

    period_ranked = (
        select(
            EquitySnapshotRecord.id.label("id"),
            EquitySnapshotRecord.trader_id.label("trader_id"),
            func.row_number()
            .over(
                partition_by=EquitySnapshotRecord.trader_id,
                order_by=(EquitySnapshotRecord.created_at.asc(), EquitySnapshotRecord.id.asc()),
            )
            .label("first_rank"),
            func.row_number()
            .over(
                partition_by=EquitySnapshotRecord.trader_id,
                order_by=(desc(EquitySnapshotRecord.created_at), desc(EquitySnapshotRecord.id)),
            )
            .label("last_rank"),
        )
        .where(
            EquitySnapshotRecord.trader_id.in_(trader_ids),
            EquitySnapshotRecord.symbol == symbol,
            EquitySnapshotRecord.created_at >= period_start,
            EquitySnapshotRecord.created_at < period_end,
        )
        .subquery()
    )
    boundary_rows = db.execute(
        select(EquitySnapshotRecord, period_ranked.c.first_rank, period_ranked.c.last_rank)
        .join(period_ranked, EquitySnapshotRecord.id == period_ranked.c.id)
        .where(or_(period_ranked.c.first_rank == 1, period_ranked.c.last_rank == 1))
    ).all()
    first_in_period_by_trader: dict[str, EquitySnapshotRecord] = {}
    last_in_period_by_trader: dict[str, EquitySnapshotRecord] = {}
    for record, first_rank, last_rank in boundary_rows:
        if first_rank == 1:
            first_in_period_by_trader[record.trader_id] = record
        if last_rank == 1:
            last_in_period_by_trader[record.trader_id] = record

    equity_ranges = db.execute(
        select(
            EquitySnapshotRecord.trader_id,
            func.min(EquitySnapshotRecord.equity),
            func.max(EquitySnapshotRecord.equity),
        )
        .where(
            EquitySnapshotRecord.trader_id.in_(trader_ids),
            EquitySnapshotRecord.symbol == symbol,
            EquitySnapshotRecord.created_at >= period_start,
            EquitySnapshotRecord.created_at < period_end,
        )
        .group_by(EquitySnapshotRecord.trader_id)
    ).all()
    drawdown_values_by_trader: dict[str, list[float]] = {}
    for trader_id, min_equity, max_equity in equity_ranges:
        values = [float(value) for value in (max_equity, min_equity) if value is not None]
        drawdown_values_by_trader[trader_id] = values

    baseline_by_trader: dict[str, EquitySnapshotRecord] = {}
    for trader_id in trader_ids:
        baseline = db.execute(
            select(EquitySnapshotRecord)
            .where(
                EquitySnapshotRecord.trader_id == trader_id,
                EquitySnapshotRecord.symbol == symbol,
                EquitySnapshotRecord.created_at < period_start,
            )
            .order_by(desc(EquitySnapshotRecord.created_at), desc(EquitySnapshotRecord.id))
            .limit(1)
        ).scalar_one_or_none()
        if baseline is not None:
            baseline_by_trader[trader_id] = baseline

    result: dict[str, tuple[Optional[EquitySnapshotRecord], Optional[EquitySnapshotRecord], list[Any]]] = {}
    for trader_id in trader_ids:
        first_snapshot = first_in_period_by_trader.get(trader_id)
        last_snapshot = last_in_period_by_trader.get(trader_id)
        baseline = baseline_by_trader.get(trader_id)
        start_snapshot = baseline or first_snapshot
        end_snapshot = last_snapshot or baseline
        snapshots = drawdown_values_by_trader.get(trader_id, [])
        result[trader_id] = (start_snapshot, end_snapshot, snapshots)
    return result


def monthly_positions_by_trader(
    db: Session,
    trader_ids: list[str],
    symbol: str,
    period_start: datetime,
    period_end: datetime,
) -> dict[str, list[PaperPositionRecord]]:
    if not trader_ids:
        return {}
    positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id.in_(trader_ids),
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "closed",
            PaperPositionRecord.closed_at >= period_start,
            PaperPositionRecord.closed_at < period_end,
        )
    ).scalars().all()
    by_trader: dict[str, list[PaperPositionRecord]] = {}
    for position in positions:
        by_trader.setdefault(position.trader_id, []).append(position)
    return by_trader


def monthly_cycle_positions_by_trader(
    db: Session,
    trader_ids: list[str],
    symbol: str,
    period_start: datetime,
    period_end: datetime,
) -> dict[str, list[PaperPositionRecord]]:
    if not trader_ids:
        return {}
    positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id.in_(trader_ids),
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.opened_at < period_end,
            or_(
                PaperPositionRecord.status == "open",
                PaperPositionRecord.closed_at >= period_start,
            ),
        )
    ).scalars().all()
    by_trader: dict[str, list[PaperPositionRecord]] = {}
    for position in positions:
        by_trader.setdefault(position.trader_id, []).append(position)
    return by_trader


def all_time_biggest_wins_by_trader(db: Session, trader_ids: list[str], symbol: str) -> dict[str, float]:
    if not trader_ids:
        return {}
    rows = db.execute(
        select(TraderLeaderboardSnapshotRecord.trader_id, TraderLeaderboardSnapshotRecord.biggest_win).where(
            TraderLeaderboardSnapshotRecord.trader_id.in_(trader_ids),
            TraderLeaderboardSnapshotRecord.symbol == symbol,
        )
    ).all()
    biggest_wins = {str(trader_id): round(float(biggest_win or 0), 4) for trader_id, biggest_win in rows}
    missing_trader_ids = [trader_id for trader_id in trader_ids if trader_id not in biggest_wins]
    if not missing_trader_ids:
        return biggest_wins

    positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id.in_(missing_trader_ids),
            PaperPositionRecord.symbol == symbol,
        )
    ).scalars().all()
    positions_by_trader: dict[str, list[PaperPositionRecord]] = {}
    for position in positions:
        positions_by_trader.setdefault(position.trader_id, []).append(position)
    events_by_position_id = trade_events_by_position_id(db, positions)
    for trader_id in missing_trader_ids:
        values = position_cycle_pnl_values(positions_by_trader.get(trader_id, []), events_by_position_id)
        biggest_wins[trader_id] = biggest_win_from_pnls(values)
    return biggest_wins


def monthly_position_query(db: Session, trader_id: str, symbol: str, period_start: datetime, period_end: datetime):
    return db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "closed",
            PaperPositionRecord.closed_at >= period_start,
            PaperPositionRecord.closed_at < period_end,
        )
    ).scalars().all()


def monthly_position_win_loss_counts(
    db: Session,
    trader_id: str,
    symbol: str,
    period_start: datetime,
    period_end: datetime,
) -> tuple[int, int, int]:
    positions = monthly_position_query(db, trader_id, symbol, period_start, period_end)
    events_by_position_id = trade_events_by_position_id(db, positions, before=period_end)
    position_pnls = position_cycle_pnl_values(positions, events_by_position_id, include_unrealized=False)
    wins, losses = win_loss_counts_from_pnls(position_pnls)
    return len(positions), wins, losses


def monthly_position_side_count(
    db: Session,
    trader_id: str,
    symbol: str,
    period_start: datetime,
    period_end: datetime,
    side: str,
) -> int:
    return sum(1 for position in monthly_position_query(db, trader_id, symbol, period_start, period_end) if str(position.side).lower() == side)


def monthly_biggest_position_pnl(
    db: Session,
    trader_id: str,
    symbol: str,
    period_start: datetime,
    period_end: datetime,
    *,
    biggest: bool,
) -> float:
    positions = monthly_cycle_positions_by_trader(db, [trader_id], symbol, period_start, period_end).get(trader_id, [])
    events_by_position_id = trade_events_by_position_id(db, positions, before=period_end)
    values = position_cycle_pnl_values(positions, events_by_position_id)
    return biggest_win_from_pnls(values) if biggest else biggest_loss_from_pnls(values)


def build_monthly_league_bundle_payload(
    db: Session,
    clean_symbol: str,
    league_month: str,
    period_start: datetime,
    period_end: datetime,
    *,
    include_empty: bool = True,
    include_related: bool = False,
    locale: str = CANONICAL_AI_LOCALE,
) -> dict[str, Any]:
    summaries = monthly_leaderboard_summaries(db, clean_symbol, period_start, period_end)
    if not include_empty:
        summaries = [summary for summary in summaries if summary.get("hasLivePaperData")]
    return {
        "symbol": clean_symbol,
        "mode": "paper",
        "paperOnly": True,
        "source": "equity_snapshots_monthly",
        "needsMigration": False,
        "cacheHit": False,
        "stale": False,
        "scheduledRefresh": False,
        "missingSnapshotCount": 0,
        "refreshed": False,
        "snapshotCount": len(summaries),
        "lastUpdatedAt": period_end.isoformat(),
        "period": {
            "type": "monthly",
            "month": league_month,
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
            "timezone": "UTC",
        },
        "traders": list_traders_for_league_month(league_month),
        "summaries": summaries,
        "positions": [],
        "orders": [],
        "managementReviews": [],
        "statusFeeds": list_status_feed_payloads(db, symbol=clean_symbol, limit=120, locale=locale) if include_related else [],
        "scanner": scanner_status_payload(),
    }


def build_monthly_league_warming_payload(
    clean_symbol: str,
    league_month: str,
    period_start: datetime,
    period_end: datetime,
    *,
    locale: str = CANONICAL_AI_LOCALE,
) -> dict[str, Any]:
    return {
        "symbol": clean_symbol,
        "mode": "paper",
        "paperOnly": True,
        "source": "equity_snapshots_monthly",
        "needsMigration": False,
        "cacheHit": False,
        "stale": True,
        "scheduledRefresh": True,
        "warming": True,
        "missingSnapshotCount": 0,
        "refreshed": False,
        "snapshotCount": 0,
        "lastUpdatedAt": period_end.isoformat(),
        "period": {
            "type": "monthly",
            "month": league_month,
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
            "timezone": "UTC",
        },
        "traders": list_traders_for_league_month(league_month),
        "summaries": [],
        "positions": [],
        "orders": [],
        "managementReviews": [],
        "statusFeeds": [],
        "scanner": scanner_status_payload(),
    }


def equity_return_for_period(
    db: Session,
    trader_id: str,
    symbol: str,
    current_equity: float,
    initial_equity: float,
    days: int,
) -> float:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    snapshot = db.execute(
        select(EquitySnapshotRecord)
        .where(
            EquitySnapshotRecord.trader_id == trader_id,
            EquitySnapshotRecord.symbol == symbol,
            EquitySnapshotRecord.created_at >= cutoff,
        )
        .order_by(EquitySnapshotRecord.created_at.asc(), EquitySnapshotRecord.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    baseline = float(snapshot.equity) if snapshot else initial_equity
    if baseline <= 0:
        return 0.0
    return round(((current_equity - baseline) / baseline) * 100, 2)


def max_drawdown_percent(db: Session, trader_id: str, symbol: str, current_equity: float) -> float:
    snapshots = db.execute(
        select(EquitySnapshotRecord)
        .where(
            EquitySnapshotRecord.trader_id == trader_id,
            EquitySnapshotRecord.symbol == symbol,
        )
        .order_by(EquitySnapshotRecord.created_at.asc(), EquitySnapshotRecord.id.asc())
    ).scalars().all()
    values = [float(snapshot.equity) for snapshot in snapshots if float(snapshot.equity or 0) > 0]
    if current_equity > 0:
        values.append(current_equity)
    if not values:
        return 0.0
    peak = values[0]
    max_dd = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            max_dd = min(max_dd, ((value - peak) / peak) * 100)
    return round(max_dd, 2)


def plan_text_for_summary(open_orders: int, open_positions: int, latest_run, latest_plan) -> dict:
    if open_positions:
        return {
            "ko": f"오픈 paper 포지션 {open_positions}개를 관리 중입니다.",
            "en": f"Managing {open_positions} open paper position(s).",
        }
    if open_orders:
        return {
            "ko": f"대기 중인 paper 주문 {open_orders}개가 있습니다.",
            "en": f"Waiting on {open_orders} pending paper order(s).",
        }
    if latest_plan:
        status = latest_plan.status
        return {
            "ko": f"최근 plan 상태: {status}. 활성 paper 포지션은 없습니다.",
            "en": f"Latest plan status: {status}. No active paper exposure.",
        }
    if latest_run:
        status = latest_run.status
        return {
            "ko": f"최근 run 상태: {status}. 현재 활성 셋업은 없습니다.",
            "en": f"Latest run status: {status}. No active setup now.",
        }
    return {
        "ko": "아직 저장된 paper 거래가 없습니다. 사이클 실행으로 후보를 생성하세요.",
        "en": "No stored paper trades yet. Run a cycle to create a candidate.",
    }


def trader_summary_for_profile(db: Session, trader, symbol: str) -> dict:
    risk_settings = (
        db.execute(
            select(RiskSettingsRecord)
            .where(RiskSettingsRecord.trader_id == trader.id, RiskSettingsRecord.symbol == symbol)
            .limit(1)
        ).scalar_one_or_none()
    )
    initial_equity = float(risk_settings.initial_equity) if risk_settings else float(settings.paper_default_equity)
    state = (
        db.execute(
            select(TraderStateRecord)
            .where(TraderStateRecord.trader_id == trader.id)
            .limit(1)
        ).scalar_one_or_none()
    )
    current_equity = float(state.equity) if state else initial_equity
    realized_pnl = float(state.realized_pnl) if state else 0.0
    unrealized_pnl = float(state.unrealized_pnl) if state else 0.0
    total_pnl = realized_pnl + unrealized_pnl
    cumulative_return = round((total_pnl / initial_equity) * 100, 2) if initial_equity > 0 else 0.0
    closed_positions, wins, losses = position_win_loss_counts(db, trader.id, symbol)
    win_rate = win_rate_from_counts(wins, losses)
    open_orders = count_model_records(db, PaperOrderRecord, trader.id, symbol, "open")
    open_positions = count_model_records(db, PaperPositionRecord, trader.id, symbol, "open")
    latest_run = latest_model_record(db, TraderRunLogRecord, trader.id, symbol)
    active_plan = latest_active_trade_plan(db, trader.id, symbol)
    agent_state = latest_agent_state(db, trader.id, symbol)
    latest_plan_payload = serialize_record(active_plan).get("payload") if active_plan else None
    leverage = None
    risk_percent = trader.baseRiskPercent
    if latest_plan_payload:
        leverage = latest_plan_payload.get("leverage")
        risk_percent = latest_plan_payload.get("riskPercent") or risk_percent
    position_stats = paper_position_stats(db, trader.id, symbol)
    order_stats = open_order_stats(db, trader.id, symbol)
    current_plan = plan_text_for_summary(open_orders, open_positions, latest_run, active_plan)
    current_state = trader_current_state_payload(
        open_orders=open_orders,
        open_positions=open_positions,
        latest_plan_status=active_plan.status if active_plan else None,
        latest_run_status=latest_run.status if latest_run else None,
        agent_phase=agent_state.phase if agent_state else None,
        last_decision=agent_state.last_decision if agent_state else None,
        last_action=agent_state.last_action_type if agent_state else None,
    )
    return {
        "traderId": trader.id,
        "traderName": trader.name,
        "symbol": symbol,
        "mode": "paper",
        "hasLivePaperData": bool(
            latest_run
            or active_plan
            or open_orders
            or open_positions
            or closed_positions
            or has_meaningful_paper_state(db, trader.id, symbol, state)
        ),
        "equity": round(current_equity, 4),
        "cashBalance": round(float(state.cash_balance), 4) if state else initial_equity,
        "realizedPnl": round(realized_pnl, 4),
        "unrealizedPnl": round(unrealized_pnl, 4),
        "totalFees": round(float(state.total_fees), 4) if state else 0.0,
        "totalPnl": round(total_pnl, 4),
        "cumulativeReturn": cumulative_return,
        "return24h": equity_return_for_period(db, trader.id, symbol, current_equity, initial_equity, 1),
        "return7d": equity_return_for_period(db, trader.id, symbol, current_equity, initial_equity, 7),
        "return30d": equity_return_for_period(db, trader.id, symbol, current_equity, initial_equity, 30),
        "winRate": win_rate,
        "closedPositions": closed_positions,
        "wins": wins,
        "losses": losses,
        "maxDrawdown": max_drawdown_percent(db, trader.id, symbol, current_equity),
        "riskPercent": risk_percent,
        "leverage": leverage,
        "openOrders": open_orders,
        "openPositions": open_positions,
        "biggestWin": position_stats["biggestWin"],
        "biggestLoss": position_stats["biggestLoss"],
        "averageLeverage": position_stats["averageLeverage"],
        "sharpe": position_stats["sharpeProxy"],
        "longTrades": position_stats["longTrades"],
        "shortTrades": position_stats["shortTrades"],
        "openNotional": position_stats["openNotional"],
        "openMargin": position_stats["openMargin"],
        "openOrderNotional": order_stats["openOrderNotional"],
        "pendingEntryWeight": order_stats["pendingEntryWeight"],
        "latestRunStatus": latest_run.status if latest_run else None,
        "latestPlanStatus": active_plan.status if active_plan else None,
        "currentPlanKo": current_plan["ko"],
        "currentPlanEn": current_plan["en"],
        "agentState": serialize_record_slim(agent_state) if agent_state else None,
        "agentMode": agent_state.mode if agent_state else None,
        "agentPhase": agent_state.phase if agent_state else None,
        "nextReviewAt": agent_state.next_review_at.isoformat() if agent_state and agent_state.next_review_at else None,
        "lastDecision": agent_state.last_decision if agent_state else None,
        "lastAction": agent_state.last_action_type if agent_state else None,
        "currentState": current_state,
    }


def compute_trader_summary_payload(db: Session, symbol: str) -> list[dict]:
    return [trader_summary_for_profile(db, trader, symbol) for trader in list_traders()]


def float_or_default(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def nullable_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def int_or_default(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def datetime_or_none(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def upsert_leaderboard_snapshot_from_summary(db: Session, summary: dict) -> TraderLeaderboardSnapshotRecord:
    trader_id = summary["traderId"]
    symbol = summary["symbol"]
    record = db.execute(
        select(TraderLeaderboardSnapshotRecord).where(
            TraderLeaderboardSnapshotRecord.trader_id == trader_id,
            TraderLeaderboardSnapshotRecord.symbol == symbol,
        )
    ).scalar_one_or_none()
    if record is None:
        record = TraderLeaderboardSnapshotRecord(trader_id=trader_id, symbol=symbol)
        db.add(record)
    now = datetime.now(timezone.utc)
    total_pnl = float_or_default(summary.get("totalPnl"))
    rank_score = max(
        float_or_default(summary.get("cumulativeReturn")),
        float_or_default(summary.get("return7d")),
        float_or_default(summary.get("return30d")),
    )
    record.status = "active" if summary.get("hasLivePaperData") else "empty"
    record.updated_at = now
    record.mode = "paper"
    record.trader_name = summary.get("traderName")
    record.has_live_paper_data = bool(summary.get("hasLivePaperData"))
    record.rank_score = rank_score
    record.equity = float_or_default(summary.get("equity"))
    record.cash_balance = float_or_default(summary.get("cashBalance"))
    record.realized_pnl = float_or_default(summary.get("realizedPnl"))
    record.unrealized_pnl = float_or_default(summary.get("unrealizedPnl"))
    record.total_fees = float_or_default(summary.get("totalFees"))
    record.total_pnl = total_pnl
    record.return_7d = float_or_default(summary.get("return7d"))
    record.return_30d = float_or_default(summary.get("return30d"))
    record.win_rate = nullable_float(summary.get("winRate"))
    record.closed_positions = int_or_default(summary.get("closedPositions"))
    record.wins = int_or_default(summary.get("wins"))
    record.losses = int_or_default(summary.get("losses"))
    record.max_drawdown = float_or_default(summary.get("maxDrawdown"))
    record.risk_percent = nullable_float(summary.get("riskPercent"))
    record.leverage = nullable_float(summary.get("leverage"))
    record.open_orders = int_or_default(summary.get("openOrders"))
    record.open_positions = int_or_default(summary.get("openPositions"))
    record.biggest_win = float_or_default(summary.get("biggestWin"))
    record.biggest_loss = float_or_default(summary.get("biggestLoss"))
    record.average_leverage = nullable_float(summary.get("averageLeverage"))
    record.sharpe = float_or_default(summary.get("sharpe"))
    record.long_trades = int_or_default(summary.get("longTrades"))
    record.short_trades = int_or_default(summary.get("shortTrades"))
    record.open_notional = float_or_default(summary.get("openNotional"))
    record.open_margin = float_or_default(summary.get("openMargin"))
    record.open_order_notional = float_or_default(summary.get("openOrderNotional"))
    record.pending_entry_weight = nullable_float(summary.get("pendingEntryWeight"))
    record.latest_run_status = summary.get("latestRunStatus")
    record.latest_plan_status = summary.get("latestPlanStatus")
    record.current_plan_ko = summary.get("currentPlanKo")
    record.current_plan_en = summary.get("currentPlanEn")
    record.agent_mode = summary.get("agentMode")
    record.agent_phase = summary.get("agentPhase")
    record.next_review_at = datetime_or_none(summary.get("nextReviewAt"))
    record.last_decision = summary.get("lastDecision")
    record.last_action = summary.get("lastAction")
    record.payload_json = to_json(
        {
            "currentPlanKo": summary.get("currentPlanKo"),
            "currentPlanEn": summary.get("currentPlanEn"),
            "agentState": summary.get("agentState"),
            "cumulativeReturn": summary.get("cumulativeReturn"),
            "return24h": summary.get("return24h"),
        }
    )
    record.raw_json = None
    db.flush()
    return record


def refresh_leaderboard_ranks(db: Session, symbol: str) -> list[TraderLeaderboardSnapshotRecord]:
    records = db.execute(
        slim_select(TraderLeaderboardSnapshotRecord)
        .where(TraderLeaderboardSnapshotRecord.symbol == symbol)
        .order_by(
            desc(TraderLeaderboardSnapshotRecord.rank_score),
            desc(TraderLeaderboardSnapshotRecord.equity),
            TraderLeaderboardSnapshotRecord.trader_id.asc(),
        )
    ).scalars().all()
    for rank, record in enumerate(records, start=1):
        record.rank = rank
    db.flush()
    return records


def refresh_trader_leaderboard_snapshot(db: Session, trader_id: str, symbol: str) -> TraderLeaderboardSnapshotRecord:
    trader = get_strategy(trader_id).profile
    summary = trader_summary_for_profile(db, trader, symbol)
    record = upsert_leaderboard_snapshot_from_summary(db, summary)
    refresh_leaderboard_ranks(db, symbol)
    invalidate_league_cache(symbol, trader_id)
    return record


def refreshed_leaderboard_records(
    db: Session,
    symbol: str,
    trader_ids: Optional[set[str]],
) -> list[TraderLeaderboardSnapshotRecord]:
    ranked = refresh_leaderboard_ranks(db, symbol)
    if not trader_ids:
        return ranked
    return [record for record in ranked if record.trader_id in trader_ids]


def find_drifted_trader_snapshots(db: Session, symbol: str) -> set[str]:
    # Query actual open position counts by trader
    pos_stmt = (
        select(PaperPositionRecord.trader_id, func.count(PaperPositionRecord.id))
        .where(PaperPositionRecord.symbol == symbol, PaperPositionRecord.status == "open")
        .group_by(PaperPositionRecord.trader_id)
    )
    actual_positions = {trader_id: count for trader_id, count in db.execute(pos_stmt).all()}

    # Query actual open order counts by trader
    order_stmt = (
        select(PaperOrderRecord.trader_id, func.count(PaperOrderRecord.id))
        .where(PaperOrderRecord.symbol == symbol, PaperOrderRecord.status == "open")
        .group_by(PaperOrderRecord.trader_id)
    )
    actual_orders = {trader_id: count for trader_id, count in db.execute(order_stmt).all()}

    # Query snapshot counts by trader
    snap_stmt = select(
        TraderLeaderboardSnapshotRecord.trader_id,
        TraderLeaderboardSnapshotRecord.open_positions,
        TraderLeaderboardSnapshotRecord.open_orders,
    ).where(TraderLeaderboardSnapshotRecord.symbol == symbol)
    snapshots = db.execute(snap_stmt).all()

    drifted = set()
    for trader_id, snap_pos, snap_orders in snapshots:
        if not trader_id:
            continue
        act_pos = actual_positions.get(trader_id, 0)
        act_orders = actual_orders.get(trader_id, 0)
        if snap_pos != act_pos or snap_orders != act_orders:
            drifted.add(trader_id)

    return drifted


def refresh_leaderboard_snapshots(
    db: Session,
    symbol: str,
    trader_ids: Optional[set[str]] = None,
) -> list[TraderLeaderboardSnapshotRecord]:
    records = []
    for trader in list_traders():
        if trader_ids and trader.id not in trader_ids:
            continue
        records.append(upsert_leaderboard_snapshot_from_summary(db, trader_summary_for_profile(db, trader, symbol)))
    invalidate_league_cache(symbol)
    return refreshed_leaderboard_records(db, symbol, trader_ids)


def leaderboard_snapshot_summary(record: TraderLeaderboardSnapshotRecord, rank: int) -> dict[str, Any]:
    current_state = trader_current_state_payload(
        open_orders=record.open_orders,
        open_positions=record.open_positions,
        latest_plan_status=record.latest_plan_status,
        latest_run_status=record.latest_run_status,
        agent_phase=record.agent_phase,
        last_decision=record.last_decision,
        last_action=record.last_action,
    )
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "rank": rank,
        "traderId": record.trader_id,
        "traderName": record.trader_name,
        "symbol": record.symbol,
        "mode": record.mode,
        "hasLivePaperData": record.has_live_paper_data,
        "rankScore": json_safe(record.rank_score),
        "equity": json_safe(record.equity),
        "cashBalance": json_safe(record.cash_balance),
        "realizedPnl": json_safe(record.realized_pnl),
        "unrealizedPnl": json_safe(record.unrealized_pnl),
        "totalFees": json_safe(record.total_fees),
        "totalPnl": json_safe(record.total_pnl),
        "cumulativeReturn": json_safe(payload.get("cumulativeReturn")),
        "return24h": json_safe(payload.get("return24h")),
        "return7d": json_safe(record.return_7d),
        "return30d": json_safe(record.return_30d),
        "winRate": json_safe(record.win_rate),
        "closedPositions": record.closed_positions,
        "wins": record.wins,
        "losses": record.losses,
        "maxDrawdown": json_safe(record.max_drawdown),
        "riskPercent": json_safe(record.risk_percent),
        "leverage": json_safe(record.leverage),
        "openOrders": record.open_orders,
        "openPositions": record.open_positions,
        "biggestWin": json_safe(record.biggest_win),
        "biggestLoss": json_safe(record.biggest_loss),
        "averageLeverage": json_safe(record.average_leverage),
        "sharpe": json_safe(record.sharpe),
        "longTrades": record.long_trades,
        "shortTrades": record.short_trades,
        "openNotional": json_safe(record.open_notional),
        "openMargin": json_safe(record.open_margin),
        "openOrderNotional": json_safe(record.open_order_notional),
        "pendingEntryWeight": json_safe(record.pending_entry_weight),
        "latestRunStatus": record.latest_run_status,
        "latestPlanStatus": record.latest_plan_status,
        "currentPlanKo": record.current_plan_ko,
        "currentPlanEn": record.current_plan_en,
        "agentMode": record.agent_mode,
        "agentPhase": record.agent_phase,
        "nextReviewAt": record.next_review_at.isoformat() if record.next_review_at else None,
        "lastDecision": record.last_decision,
        "lastAction": record.last_action,
        "updatedAt": record.updated_at.isoformat() if record.updated_at else None,
        "currentState": current_state,
    }


def trader_current_state_payload(
    *,
    open_orders: Optional[int],
    open_positions: Optional[int],
    latest_plan_status: Optional[str],
    latest_run_status: Optional[str],
    agent_phase: Optional[str],
    last_decision: Optional[str],
    last_action: Optional[str],
) -> dict[str, Any]:
    normalized_plan = normalize_state_key(latest_plan_status)
    normalized_run = normalize_state_key(latest_run_status)
    normalized_phase = normalize_state_key(agent_phase)
    normalized_decision = normalize_state_key(last_decision)
    normalized_action = normalize_state_key(last_action)

    if (open_positions or 0) > 0:
        return current_state("open_position", "status.summary.openPosition", "position", normalized_action or normalized_decision)
    if (open_orders or 0) > 0:
        return current_state("pending_order", "status.summary.pendingOrder", "order", normalized_action or normalized_decision)
    if normalized_plan == "PAPER_TRADING_PENDING":
        return current_state("qualified_setup", "status.summary.planReady", "plan", normalized_plan)
    if normalized_run == "NO_CANDIDATE":
        return current_state("watching", "status.summary.watching", "run", normalized_run)
    if normalized_run in {"COMPLETED", "REVIEWED", "REVIEW"} or normalized_decision:
        return current_state("reviewed", "status.summary.reviewed", "review", normalized_decision or normalized_run)
    if normalized_phase in {"OPEN_POSITION", "PENDING_ORDER"}:
        return current_state(normalized_phase.lower(), f"status.summary.{camel_state_key(normalized_phase)}", "agent", normalized_action or normalized_phase)
    if normalized_phase in {"IDLE", "WATCHING", "MONITORING", "WATCHLIST"}:
        return current_state("idle", "status.summary.idle", "agent", normalized_phase)
    return current_state("watching", "status.summary.idle", "fallback", normalized_run or normalized_phase)


def current_state(key: str, label_key: str, source: str, detail: Optional[str]) -> dict[str, Any]:
    return {
        "key": key,
        "labelKey": label_key,
        "source": source,
        "detail": detail,
    }


def normalize_state_key(value: Optional[str]) -> str:
    return str(value or "").strip().replace("-", "_").replace(" ", "_").upper()


def camel_state_key(value: str) -> str:
    parts = value.lower().split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def suppress_inactive_pending_plan_summary(summary: dict[str, Any]) -> dict[str, Any]:
    if summary.get("openOrders") or summary.get("openPositions"):
        return summary
    if summary.get("latestPlanStatus") != "PAPER_TRADING_PENDING":
        return summary
    latest_run_status = summary.get("latestRunStatus")
    summary["latestPlanStatus"] = None
    if latest_run_status:
        summary["currentPlanKo"] = f"최근 run 상태: {latest_run_status}. 현재 활성 셋업은 없습니다."
        summary["currentPlanEn"] = f"Latest run status: {latest_run_status}. No active setup now."
    else:
        summary["currentPlanKo"] = "현재 활성 paper 주문/포지션이 없습니다."
        summary["currentPlanEn"] = "No active paper orders or positions."
    return summary


def refresh_leaderboard_snapshots_background(symbol: str, trader_ids: Optional[set[str]] = None) -> None:
    refresh_key = (symbol, ",".join(sorted(trader_ids)) if trader_ids else "*")
    if refresh_key in LEADERBOARD_REFRESHING:
        return
    LEADERBOARD_REFRESHING.add(refresh_key)
    try:
        with session_scope() as db:
            refresh_leaderboard_snapshots(db, symbol, trader_ids)
    finally:
        LEADERBOARD_REFRESHING.discard(refresh_key)


def build_league_bundle_payload(
    db: Session,
    clean_symbol: str,
    *,
    include_empty: bool = True,
    include_related: bool = False,
    refreshed: bool = False,
    scheduled_refresh: bool = False,
    missing_ids: Optional[set[str]] = None,
    locale: str = CANONICAL_AI_LOCALE,
) -> dict[str, Any]:
    stmt = slim_select(TraderLeaderboardSnapshotRecord).where(TraderLeaderboardSnapshotRecord.symbol == clean_symbol)
    if not include_empty:
        stmt = stmt.where(TraderLeaderboardSnapshotRecord.has_live_paper_data.is_(True))
    snapshots = db.execute(
        stmt.order_by(
            desc(TraderLeaderboardSnapshotRecord.rank_score),
            desc(TraderLeaderboardSnapshotRecord.equity),
            TraderLeaderboardSnapshotRecord.trader_id.asc(),
        )
    ).scalars().all()
    summaries = [
        suppress_inactive_pending_plan_summary(leaderboard_snapshot_summary(record, rank))
        for rank, record in enumerate(snapshots, start=1)
    ]
    updated_at_values = [record.updated_at for record in snapshots if record.updated_at]
    return {
        "symbol": clean_symbol,
        "mode": "paper",
        "paperOnly": True,
        "source": "trader_leaderboard_snapshots",
        "period": {"type": "current", "timezone": "UTC"},
        "needsMigration": False,
        "cacheHit": False,
        "stale": False,
        "scheduledRefresh": scheduled_refresh,
        "missingSnapshotCount": len(missing_ids or set()),
        "refreshed": refreshed,
        "snapshotCount": len(summaries),
        "lastUpdatedAt": max(updated_at_values).isoformat() if updated_at_values else None,
        "traders": list_traders(),
        "summaries": summaries,
        "positions": list_filtered_records(db, PaperPositionRecord, limit=100, symbol=clean_symbol, status="open", include_payload=True) if include_related else [],
        "orders": list_filtered_records(db, PaperOrderRecord, limit=100, symbol=clean_symbol, status="open", include_payload=True) if include_related else [],
        "managementReviews": list_filtered_records(db, PositionManagementReviewRecord, limit=30, symbol=clean_symbol, include_payload=False) if include_related else [],
        "statusFeeds": list_status_feed_payloads(db, symbol=clean_symbol, limit=120, locale=locale) if include_related else [],
        "scanner": scanner_status_payload(),
    }


def trader_snapshot_summary(db: Session, trader_id: str, clean_symbol: str) -> Optional[dict[str, Any]]:
    record = db.execute(
        slim_select(TraderLeaderboardSnapshotRecord).where(
            TraderLeaderboardSnapshotRecord.trader_id == trader_id,
            TraderLeaderboardSnapshotRecord.symbol == clean_symbol,
        )
    ).scalar_one_or_none()
    if record is None:
        return None
    return leaderboard_snapshot_summary(record, record.rank or 0)


def record_review_translation_source(record) -> Optional[tuple[str, int, dict[str, Any]]]:
    payload = from_json(getattr(record, "payload_json", None)) or {}
    if not isinstance(payload, dict) or not payload:
        return None

    source_type: str | None = None
    source_id: int | None = None
    source_payload: dict[str, Any] | None = None
    if isinstance(record, PositionManagementReviewRecord):
        source_type = AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT
        source_id = record.id
        source_payload = payload
    elif isinstance(record, AIReviewRecord):
        source_type = AI_TRANSLATION_SOURCE_AI_REVIEW
        source_id = record.id
        source_payload = payload
    elif isinstance(record, (PaperOrderRecord, PaperPositionRecord, TradeEventRecord)):
        ai_review_id = numeric_record_id(payload.get("aiReviewId"))
        ai_review = record_payload(payload.get("aiReview"))
        if ai_review_id is not None and ai_review is not None:
            source_type = AI_TRANSLATION_SOURCE_AI_REVIEW
            source_id = ai_review_id
            source_payload = ai_review

    if source_type is None or source_id is None or source_payload is None:
        return None
    return source_type, source_id, source_payload


def record_review_translation_ready(db: Session, record, *, locale: str) -> bool:
    clean_locale = normalize_locale(locale)
    if isinstance(record, (AIReviewRecord, PositionManagementReviewRecord)) and (
        str(getattr(record, "status", "ok")).lower() != "ok" or bool(getattr(record, "fallback", False))
    ):
        return True
    source = record_review_translation_source(record)
    if source is None:
        return True
    source_type, source_id, source_payload = source
    if clean_locale == source_locale_for_payload(source_payload):
        return True
    _localized, meta = localized_payload_for_source(
        db,
        source_type=source_type,
        source_id=source_id,
        payload=source_payload,
        locale=clean_locale,
    )
    return meta.get("status") in {"canonical", "ok"} and not meta.get("staleSourceHash")


async def ensure_record_review_translation(
    db: Session,
    record,
    *,
    locale: str,
    release_clean_transaction_before_call: bool = False,
) -> bool:
    clean_locale = normalize_locale(locale)
    if isinstance(record, (AIReviewRecord, PositionManagementReviewRecord)) and (
        str(getattr(record, "status", "ok")).lower() != "ok" or bool(getattr(record, "fallback", False))
    ):
        return True
    source = record_review_translation_source(record)
    if source is None:
        return True
    source_type, source_id, source_payload = source
    if clean_locale == source_locale_for_payload(source_payload):
        return True

    _localized, meta = await ensure_localized_payload_for_source(
        db,
        settings=settings,
        source_type=source_type,
        source_id=source_id,
        payload=source_payload,
        locale=clean_locale,
        symbol=getattr(record, "symbol", None),
        trader_id=getattr(record, "trader_id", None),
        release_clean_transaction_before_call=release_clean_transaction_before_call,
    )
    return meta.get("status") in {"canonical", "ok"}


def trader_detail_translation_records(
    db: Session,
    *,
    trader_id: str,
    clean_symbol: str,
    reviews_limit: int,
    events_limit: int,
) -> list[Any]:
    def fetch(model, *, limit: int, status: str | None = None) -> list[Any]:
        stmt = select(model).where(model.trader_id == trader_id, model.symbol == clean_symbol)
        if status is not None:
            stmt = stmt.where(model.status == status)
        return db.execute(stmt.order_by(desc(model.created_at), desc(model.id)).limit(max(1, min(limit, 1000)))).scalars().all()

    records: list[Any] = []
    records.extend(fetch(PaperPositionRecord, limit=12, status="open"))
    records.extend(fetch(PaperPositionRecord, limit=20, status="closed"))
    records.extend(fetch(PaperOrderRecord, limit=12, status="open"))
    records.extend(fetch(PositionManagementReviewRecord, limit=reviews_limit))
    records.extend(fetch(TradeEventRecord, limit=events_limit))
    return records


def trader_detail_translations_ready(
    db: Session,
    *,
    trader_id: str,
    clean_symbol: str,
    locale: str,
    reviews_limit: int,
    events_limit: int,
) -> bool:
    clean_locale = normalize_locale(locale)
    return all(
        record_review_translation_ready(db, record, locale=clean_locale)
        for record in trader_detail_translation_records(
            db,
            trader_id=trader_id,
            clean_symbol=clean_symbol,
            reviews_limit=reviews_limit,
            events_limit=events_limit,
        )
    )


async def ensure_trader_detail_translations(
    db: Session,
    *,
    trader_id: str,
    clean_symbol: str,
    locale: str,
    reviews_limit: int,
    events_limit: int,
    release_clean_transaction_before_call: bool = False,
) -> bool:
    clean_locale = normalize_locale(locale)
    ready = True
    for record in trader_detail_translation_records(
        db,
        trader_id=trader_id,
        clean_symbol=clean_symbol,
        reviews_limit=reviews_limit,
        events_limit=events_limit,
    ):
        ready = await ensure_record_review_translation(
            db,
            record,
            locale=clean_locale,
            release_clean_transaction_before_call=release_clean_transaction_before_call,
        ) and ready
    return ready


def build_trader_detail_payload(
    db: Session,
    trader_id: str,
    clean_symbol: str,
    trader,
    summaries: Optional[list[dict[str, Any]]] = None,
    reviews_limit: int = 20,
    events_limit: int = 20,
    locale: str = CANONICAL_AI_LOCALE,
) -> dict[str, Any]:
    from datetime import date
    if summaries is None:
        summaries = [trader_summary_for_profile(db, trader, clean_symbol)]
    trade_plans = list_filtered_records(db, TradePlanRecord, limit=30, symbol=clean_symbol, trader_id=trader_id, include_payload=True)
    
    # Aggregate daily realized PnL for monthly calendar (extremely lightweight)
    pnl_date_key = func.date(TradeEventRecord.created_at)
    stmt = (
        select(
            pnl_date_key.label("date_key"),
            func.sum(TradeEventRecord.realized_pnl).label("pnl_sum")
        )
        .where(
            TradeEventRecord.trader_id == trader_id,
            TradeEventRecord.symbol == clean_symbol,
            TradeEventRecord.realized_pnl != 0
        )
        .group_by(pnl_date_key)
        .order_by(pnl_date_key)
    )
    daily_pnl_rows = db.execute(stmt).all()
    daily_pnl = [
        {
            "date": r.date_key.isoformat() if isinstance(r.date_key, date) else str(r.date_key),
            "pnl": float(r.pnl_sum)
        }
        for r in daily_pnl_rows
    ]
    review_date_key = func.date(PositionManagementReviewRecord.created_at)
    review_count_stmt = (
        select(
            review_date_key.label("date_key"),
            func.count(PositionManagementReviewRecord.id).label("review_count"),
        )
        .where(
            PositionManagementReviewRecord.trader_id == trader_id,
            PositionManagementReviewRecord.symbol == clean_symbol,
        )
        .group_by(review_date_key)
        .order_by(review_date_key)
    )
    review_count_rows = db.execute(review_count_stmt).all()
    review_counts_by_day = [
        {
            "date": r.date_key.isoformat() if isinstance(r.date_key, date) else str(r.date_key),
            "count": int(r.review_count or 0),
        }
        for r in review_count_rows
    ]

    return {
        "symbol": clean_symbol,
        "trader": trader,
        "summaries": summaries,
        "positions": list_filtered_records(db, PaperPositionRecord, limit=12, symbol=clean_symbol, trader_id=trader_id, status="open", include_payload=True, locale=locale),
        "closedPositions": list_filtered_records(db, PaperPositionRecord, limit=20, symbol=clean_symbol, trader_id=trader_id, status="closed", include_payload=True, locale=locale),
        "orders": list_filtered_records(db, PaperOrderRecord, limit=12, symbol=clean_symbol, trader_id=trader_id, status="open", include_payload=True, locale=locale),
        "managementReviews": list_filtered_records(
            db,
            PositionManagementReviewRecord,
            limit=reviews_limit,
            symbol=clean_symbol,
            trader_id=trader_id,
            include_payload=True,
            locale=locale,
            payload_mode="detail",
        ),
        "events": list_filtered_records(db, TradeEventRecord, limit=events_limit, symbol=clean_symbol, trader_id=trader_id, include_payload=True, locale=locale),
        "statusFeeds": list_status_feed_payloads(
            db,
            symbol=clean_symbol,
            trader_id=trader_id,
            limit=20,
            locale=locale,
        ),
        "dailyPnl": daily_pnl,
        "reviewCountsByDay": review_counts_by_day,
        "tradePlans": trade_plans,
        "cacheHit": False,
        "stale": False,
    }


def refresh_league_bundle_cache_background(
    symbol: str,
    include_empty: bool = True,
    include_related: bool = False,
    locale: str = CANONICAL_AI_LOCALE,
    league_month: Optional[str] = None,
) -> None:
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    monthly_period = parse_utc_league_month(league_month) if league_month else None
    period_key = monthly_period[0] if monthly_period else "current"
    refresh_key = (clean_symbol, include_empty, include_related, clean_locale, period_key)
    if refresh_key in LEAGUE_BUNDLE_REFRESHING:
        return
    LEAGUE_BUNDLE_REFRESHING.add(refresh_key)
    try:
        with session_scope() as db:
            if monthly_period:
                league_month_value, period_start, period_end = monthly_period
                payload = build_monthly_league_bundle_payload(
                    db,
                    clean_symbol,
                    league_month_value,
                    period_start,
                    period_end,
                    include_empty=include_empty,
                    include_related=include_related,
                    locale=clean_locale,
                )
                LEAGUE_BUNDLE_CACHE[refresh_key] = (time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS, payload)
                return
            known_trader_ids = {trader.id for trader in list_traders()}
            existing_ids = {
                trader_id
                for trader_id in db.execute(
                    select(TraderLeaderboardSnapshotRecord.trader_id).where(
                        TraderLeaderboardSnapshotRecord.symbol == clean_symbol
                    )
                ).scalars().all()
                if trader_id
            }
            missing_ids = known_trader_ids - existing_ids
            if missing_ids:
                refresh_leaderboard_snapshots(db, clean_symbol, missing_ids)
            payload = build_league_bundle_payload(
                db,
                clean_symbol,
                include_empty=include_empty,
                include_related=include_related,
                refreshed=bool(missing_ids),
                missing_ids=missing_ids,
                locale=clean_locale,
            )
            LEAGUE_BUNDLE_CACHE[refresh_key] = (time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS, payload)
    finally:
        LEAGUE_BUNDLE_REFRESHING.discard(refresh_key)


def refresh_trader_detail_cache_background(trader_id: str, symbol: str, locale: str = CANONICAL_AI_LOCALE) -> None:
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    refresh_key = (trader_id, clean_symbol, clean_locale)
    if refresh_key in TRADER_DETAIL_REFRESHING:
        return
    TRADER_DETAIL_REFRESHING.add(refresh_key)
    try:
        trader = public_trader_profile(get_strategy(trader_id).profile)
        with session_scope() as db:
            if not db.execute(
                select(TraderLeaderboardSnapshotRecord.id)
                .where(
                    TraderLeaderboardSnapshotRecord.trader_id == trader_id,
                    TraderLeaderboardSnapshotRecord.symbol == clean_symbol,
                )
                .limit(1)
            ).scalar_one_or_none():
                refresh_leaderboard_snapshots(db, clean_symbol, {trader_id})
            snapshot_summary = trader_snapshot_summary(db, trader_id, clean_symbol)
            translations_ready = asyncio.run(
                ensure_trader_detail_translations(
                    db,
                    trader_id=trader_id,
                    clean_symbol=clean_symbol,
                    locale=clean_locale,
                    reviews_limit=20,
                    events_limit=20,
                    release_clean_transaction_before_call=True,
                )
            )
            payload = build_trader_detail_payload(
                db,
                trader_id,
                clean_symbol,
                trader,
                summaries=[snapshot_summary] if snapshot_summary else None,
                reviews_limit=20,
                events_limit=20,
                locale=clean_locale,
            )
            if translations_ready:
                TRADER_DETAIL_CACHE[(trader_id, clean_symbol, 20, 20, clean_locale, TRADER_DETAIL_CACHE_VERSION)] = (
                    time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS,
                    payload,
                )
    finally:
        TRADER_DETAIL_REFRESHING.discard(refresh_key)


def warm_initial_league_cache() -> None:
    for symbol in sorted(set(settings.auto_scanner_symbols or ["BTCUSDT"]) | {"BTCUSDT"}):
        clean_symbol = normalize_symbol(symbol)
        try:
            with session_scope() as db:
                try:
                    warm_overview_review_cache(db, clean_symbol)
                except Exception:
                    pass
                known_trader_ids = {trader.id for trader in list_traders()}
                existing_ids = {
                    trader_id
                    for trader_id in db.execute(
                        select(TraderLeaderboardSnapshotRecord.trader_id).where(
                            TraderLeaderboardSnapshotRecord.symbol == clean_symbol
                        )
                    ).scalars().all()
                    if trader_id
                }
                missing_ids = known_trader_ids - existing_ids
                if missing_ids:
                    refresh_leaderboard_snapshots(db, clean_symbol, missing_ids)

                payload = build_league_bundle_payload(
                    db,
                    clean_symbol,
                    include_empty=True,
                    include_related=False,
                    refreshed=bool(missing_ids),
                    missing_ids=missing_ids,
                )
                LEAGUE_BUNDLE_CACHE[(clean_symbol, True, False, CANONICAL_AI_LOCALE, "current")] = (
                    time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS,
                    payload,
                )
        except Exception:
            continue


async def latest_engine_candle(symbol: str) -> dict:
    candles = await binance_client().get_klines(symbol, interval="1m", limit=1)
    if not candles:
        raise HTTPException(status_code=502, detail="No Binance candle returned.")
    candle = candles[-1]
    return {
        "open": candle.open,
        "high": candle.high,
        "low": candle.low,
        "close": candle.close,
        "timestamp": datetime.fromtimestamp(candle.openTime / 1000, tz=timezone.utc),
    }


def scanner_status_payload() -> dict[str, Any]:
    return {
        **AUTO_SCANNER_STATE,
        "taskActive": bool(AUTO_SCANNER_TASK and not AUTO_SCANNER_TASK.done()),
        "managementLoop": {
            **AUTO_MANAGEMENT_STATE,
            "taskActive": bool(AUTO_MANAGEMENT_TASK and not AUTO_MANAGEMENT_TASK.done()),
        },
        "realtimeExecutionLoop": {
            **REALTIME_EXECUTION_STATE,
            "taskActive": bool(REALTIME_EXECUTION_TASK and not REALTIME_EXECUTION_TASK.done()),
        },
        "paperOnly": True,
        "privateTradingApi": False,
    }


async def run_scanner_once(
    *,
    symbols: Optional[list[str]] = None,
    provider: Optional[str] = None,
    locale: Optional[str] = None,
    defer_leaderboard_refresh: bool = True,
) -> dict[str, Any]:
    requested_symbols = symbols or settings.auto_scanner_symbols or ["BTCUSDT"]
    clean_symbols = [normalize_symbol(symbol) for symbol in requested_symbols]
    requested_provider = normalize_provider(provider or settings.auto_scanner_provider or "mock")
    requested_locale = normalize_locale(locale or settings.auto_scanner_locale or "ko")
    started_at = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    counts = {
        "symbols": len(clean_symbols),
        "tradersChecked": 0,
        "candidates": 0,
        "aiReviews": 0,
        "tradePlans": 0,
        "openOrders": 0,
        "openPositions": 0,
        "managementReviews": 0,
        "statusFeeds": 0,
        "noCandidate": 0,
        "activeExposure": 0,
        "cooldowns": 0,
        "errors": 0,
    }
    duration_breakdown = {
        "snapshotMs": 0,
        "prefilterDbMs": 0,
        "firstStageMs": 0,
        "runCycleMs": 0,
        "leaderboardRefreshScheduleMs": 0,
    }
    symbol_breakdown: dict[str, dict[str, Any]] = {
        symbol: {
            "snapshotMs": 0,
            "prefilterDbMs": 0,
            "firstStageMs": 0,
            "runCycleMs": 0,
            "candidateJobs": 0,
            "errors": 0,
        }
        for symbol in clean_symbols
    }

    snapshot_semaphore = asyncio.Semaphore(max(1, int(settings.auto_scanner_snapshot_concurrency or 1)))

    async def snapshot_job(symbol: str) -> tuple[str, dict[str, Any], int]:
        snapshot_started = time.perf_counter()
        async with snapshot_semaphore:
            snapshot = await build_market_snapshot(binance_client(), symbol)
        return symbol, snapshot, int((time.perf_counter() - snapshot_started) * 1000)

    snapshot_results = await asyncio.gather(
        *(snapshot_job(symbol) for symbol in clean_symbols),
        return_exceptions=True,
    )
    snapshots: dict[str, dict[str, Any]] = {}
    for symbol, snapshot_result in zip(clean_symbols, snapshot_results):
        if isinstance(snapshot_result, Exception):
            counts["errors"] += 1
            symbol_breakdown[symbol]["errors"] += 1
            results.append(
                {
                    "traderId": "market-snapshot",
                    "trader": "Market Snapshot",
                    "symbol": symbol,
                    "status": "ERROR",
                    "error": sanitize_error_message(str(snapshot_result)),
                }
            )
            continue
        result_symbol, snapshot, snapshot_ms = snapshot_result
        snapshots[result_symbol] = snapshot
        duration_breakdown["snapshotMs"] += snapshot_ms
        symbol_breakdown[result_symbol]["snapshotMs"] = snapshot_ms

    candidate_jobs: list[tuple[Any, str, dict[str, Any]]] = []
    changed_traders_by_symbol: dict[str, set[str]] = {symbol: set() for symbol in clean_symbols}
    traders_list = list_scanner_traders(started_at)
    trader_ids = [trader.id for trader in traders_list]

    for symbol, snapshot in snapshots.items():
        update_price_shock_context(symbol, snapshot)
        prefilter_started = time.perf_counter()
        with session_scope() as db:
            exposure_map = list_active_paper_exposure_map(db, trader_ids, symbol)
            cooldown_map = latest_ai_review_cooldown_map(db, trader_ids, symbol)
        prefilter_ms = int((time.perf_counter() - prefilter_started) * 1000)
        duration_breakdown["prefilterDbMs"] += prefilter_ms
        symbol_breakdown[symbol]["prefilterDbMs"] = prefilter_ms

        first_stage_started = time.perf_counter()
        for trader in traders_list:
            counts["tradersChecked"] += 1
            try:
                active_exposure = exposure_map.get(
                    trader.id,
                    {"openOrders": [], "openPositions": [], "hasExposure": False},
                )
                cooldown = None if active_exposure["hasExposure"] else cooldown_map.get(trader.id)

                if cooldown:
                    counts["cooldowns"] += 1
                    counts["noCandidate"] += 1
                    results.append(
                        {
                            "traderId": trader.id,
                            "trader": trader.name,
                            "symbol": symbol,
                            "runId": None,
                            "status": "AI_REVIEW_COOLDOWN",
                            "candidateCreated": False,
                            "candidateReason": f"Second-stage AI cooldown: {cooldown['remainingSeconds']}s remaining.",
                            "setupScore": 0,
                            "aiDecision": None,
                            "provider": requested_provider,
                            "openOrders": 0,
                            "openPositions": 0,
                            "managementReviews": 0,
                        }
                    )
                    continue

                if not active_exposure["hasExposure"]:
                    candidate_probe = get_strategy(trader.id).evaluate(snapshot)
                    if not candidate_probe.created:
                        counts["noCandidate"] += 1
                        results.append(
                            {
                                "traderId": trader.id,
                                "trader": trader.name,
                                "symbol": symbol,
                                "runId": None,
                                "status": "NO_CANDIDATE",
                                "candidateCreated": False,
                                "candidateReason": candidate_probe.reason,
                                "setupScore": candidate_probe.setupScore,
                                "aiDecision": None,
                                "provider": requested_provider,
                                "openOrders": 0,
                                "openPositions": 0,
                                "managementReviews": 0,
                            }
                        )
                        continue
                    candidate_jobs.append((trader, symbol, snapshot))
                    symbol_breakdown[symbol]["candidateJobs"] += 1
                else:
                    open_orders = len(active_exposure.get("openOrders", []))
                    open_positions = len(active_exposure.get("openPositions", []))
                    management_reviews = 0
                    counts["noCandidate"] += 1
                    counts["activeExposure"] += 1
                    counts["openOrders"] += open_orders
                    counts["openPositions"] += open_positions
                    counts["managementReviews"] += management_reviews
                    results.append(
                        {
                            "traderId": trader.id,
                            "trader": trader.name,
                            "symbol": symbol,
                            "runId": None,
                            "status": "ACTIVE_PAPER_EXPOSURE",
                            "candidateCreated": False,
                            "candidateReason": "Existing paper exposure is active; dedicated management loop handles paper orders, positions, and AI reviews.",
                            "setupScore": None,
                            "aiDecision": None,
                            "provider": requested_provider,
                            "openOrders": open_orders,
                            "openPositions": open_positions,
                            "managementReviews": management_reviews,
                        }
                    )
                    continue
            except Exception as exc:
                counts["errors"] += 1
                symbol_breakdown[symbol]["errors"] += 1
                results.append(
                    {
                        "traderId": trader.id,
                        "trader": trader.name,
                        "symbol": symbol,
                        "status": "ERROR",
                        "error": sanitize_error_message(str(exc)),
                    }
                )
        first_stage_ms = int((time.perf_counter() - first_stage_started) * 1000)
        duration_breakdown["firstStageMs"] += first_stage_ms
        symbol_breakdown[symbol]["firstStageMs"] = first_stage_ms

    ai_semaphore = asyncio.Semaphore(max(1, int(settings.auto_scanner_ai_concurrency or 1)))

    async def candidate_run_job(trader, symbol: str, snapshot: dict[str, Any]) -> tuple[Any, str, Optional[RunCycleResponse], int, Optional[str]]:
        run_started = time.perf_counter()
        try:
            async with ai_semaphore:
                result = await run_trader_cycle(
                    trader.id,
                    symbol,
                    provider_override=requested_provider,
                    locale=requested_locale,
                    snapshot_override=snapshot,
                    refresh_leaderboard=False,
                )
            return trader, symbol, result, int((time.perf_counter() - run_started) * 1000), None
        except Exception as exc:
            return trader, symbol, None, int((time.perf_counter() - run_started) * 1000), sanitize_error_message(str(exc))

    candidate_results = await asyncio.gather(
        *(candidate_run_job(trader, symbol, snapshot) for trader, symbol, snapshot in candidate_jobs),
        return_exceptions=False,
    )
    for trader, symbol, result, run_cycle_ms, error in candidate_results:
        duration_breakdown["runCycleMs"] += run_cycle_ms
        symbol_breakdown[symbol]["runCycleMs"] += run_cycle_ms
        if error or result is None:
            counts["errors"] += 1
            symbol_breakdown[symbol]["errors"] += 1
            results.append(
                {
                    "traderId": trader.id,
                    "trader": trader.name,
                    "symbol": symbol,
                    "status": "ERROR",
                    "candidateCreated": False,
                    "candidateReason": error,
                    "setupScore": None,
                    "aiDecision": None,
                    "provider": requested_provider,
                    "openOrders": 0,
                    "openPositions": 0,
                    "managementReviews": 0,
                }
            )
            continue

        candidate_created = bool(result.candidate and result.candidate.created)
        has_review = result.aiReview is not None
        trade_plan_status = result.tradePlan.status if result.tradePlan else None
        open_orders = len(result.paperOrders or [])
        open_positions = len(result.paperPositions or [])
        management_reviews = len(result.managementReviews or [])
        if candidate_created:
            counts["candidates"] += 1
        else:
            counts["noCandidate"] += 1
        if has_review:
            counts["aiReviews"] += 1
        if result.recordIds and result.recordIds.get("tradePlanId"):
            counts["tradePlans"] += 1
        if trade_plan_status == "ACTIVE_PAPER_EXPOSURE":
            counts["activeExposure"] += 1
        if trade_plan_status == "AI_REVIEW_COOLDOWN":
            counts["cooldowns"] += 1
        counts["openOrders"] += open_orders
        counts["openPositions"] += open_positions
        counts["managementReviews"] += management_reviews
        changed_traders_by_symbol.setdefault(symbol, set()).add(trader.id)
        results.append(
            {
                "traderId": trader.id,
                "trader": trader.name,
                "symbol": symbol,
                "runId": result.runId,
                "status": trade_plan_status or ("CANDIDATE_READY" if candidate_created else "NO_CANDIDATE"),
                "candidateCreated": candidate_created,
                "candidateReason": result.candidate.reason if result.candidate else None,
                "setupScore": result.candidate.setupScore if result.candidate else None,
                "aiDecision": result.aiReview.decision if result.aiReview else None,
                "provider": result.aiReview.provider if result.aiReview else requested_provider,
                "openOrders": open_orders,
                "openPositions": open_positions,
                "managementReviews": management_reviews,
            }
        )

    for symbol in clean_symbols:
        try:
            with session_scope() as db:
                due_feeds = await regenerate_due_status_feeds(
                    db,
                    settings=settings,
                    symbol=symbol,
                    trader_ids=trader_ids,
                )
                if due_feeds:
                    counts["statusFeeds"] += len(due_feeds)
                    changed_traders_by_symbol.setdefault(symbol, set()).update(
                        record.trader_id for record in due_feeds if record.trader_id
                    )
        except Exception:
            counts["errors"] += 1
            symbol_breakdown[symbol]["errors"] += 1

    # Detect drifted snapshots and add them to refresh target
    for symbol in clean_symbols:
        try:
            with session_scope() as db:
                drifted_ids = find_drifted_trader_snapshots(db, symbol)
                if drifted_ids:
                    changed_traders_by_symbol.setdefault(symbol, set()).update(drifted_ids)
        except Exception:
            pass

    leaderboard_started = time.perf_counter()
    for symbol, trader_ids_to_refresh in changed_traders_by_symbol.items():
        if not trader_ids_to_refresh:
            continue
        invalidate_league_cache(symbol)
        if defer_leaderboard_refresh:
            schedule_thread_refresh(refresh_leaderboard_snapshots_background, symbol, trader_ids_to_refresh)
        else:
            try:
                with session_scope() as db:
                    refresh_leaderboard_snapshots(db, symbol, trader_ids_to_refresh)
            except Exception as exc:
                counts["errors"] += 1
                symbol_breakdown[symbol]["errors"] += 1
                results.append(
                    {
                        "traderId": "leaderboard-refresh",
                        "trader": "Leaderboard Refresh",
                        "symbol": symbol,
                        "status": "ERROR",
                        "candidateCreated": False,
                        "candidateReason": sanitize_error_message(str(exc)),
                        "setupScore": None,
                        "aiDecision": None,
                        "provider": requested_provider,
                        "openOrders": 0,
                        "openPositions": 0,
                        "managementReviews": 0,
                    }
                )
    duration_breakdown["leaderboardRefreshScheduleMs"] = int((time.perf_counter() - leaderboard_started) * 1000)

    finished_at = datetime.now(timezone.utc)
    audit_report_ids: dict[str, int] = {}
    for symbol in clean_symbols:
        try:
            snapshot = snapshots.get(symbol) or {}
            regime = str((snapshot.get("marketRegime") or {}).get("primary") or "unknown")
            symbol_results = [result for result in results if result.get("symbol") == symbol]
            with session_scope() as db:
                report = create_first_stage_audit_report(
                    db,
                    symbol=symbol,
                    scanner_started_at=started_at,
                    scanner_finished_at=finished_at,
                    market_regime=regime,
                    counts=symbol_breakdown.get(symbol, {}),
                    results=symbol_results,
                    status="ok" if counts["errors"] == 0 else "partial_error",
                )
                audit_report_ids[symbol] = report.id
        except Exception as exc:
            counts["errors"] += 1
            symbol_breakdown[symbol]["errors"] += 1
            results.append(
                {
                    "traderId": "first-stage-audit",
                    "trader": "First Stage Audit",
                    "symbol": symbol,
                    "status": "ERROR",
                    "candidateCreated": False,
                    "candidateReason": sanitize_error_message(str(exc)),
                    "setupScore": None,
                    "aiDecision": None,
                    "provider": requested_provider,
                    "openOrders": 0,
                    "openPositions": 0,
                    "managementReviews": 0,
                }
            )
    payload = {
        "status": "ok" if counts["errors"] == 0 else "partial_error",
        "mode": "paper",
        "paperOnly": True,
        "symbols": clean_symbols,
        "provider": requested_provider,
        "locale": requested_locale,
        "startedAt": started_at.isoformat(),
        "finishedAt": finished_at.isoformat(),
        "durationMs": int((finished_at - started_at).total_seconds() * 1000),
        "durationBreakdownMs": duration_breakdown,
        "symbolBreakdown": symbol_breakdown,
        "counts": counts,
        "firstStageAuditReportIds": audit_report_ids,
        "priceShock": AUTO_SCANNER_STATE.get("priceShock", {}),
        "results": results,
    }
    AUTO_SCANNER_STATE.update(
        {
            "cycles": int(AUTO_SCANNER_STATE.get("cycles") or 0) + 1,
            "lastStartedAt": payload["startedAt"],
            "lastFinishedAt": payload["finishedAt"],
            "lastError": None if counts["errors"] == 0 else "One or more trader scans failed.",
            "lastResult": payload,
        }
    )
    return payload


async def run_management_once(
    *,
    symbols: Optional[list[str]] = None,
    provider: Optional[str] = None,
    locale: Optional[str] = None,
) -> dict[str, Any]:
    requested_symbols = symbols or settings.auto_scanner_symbols or ["BTCUSDT"]
    clean_symbols = [normalize_symbol(symbol) for symbol in requested_symbols]
    requested_provider = normalize_provider(
        provider or settings.position_management_provider or settings.auto_scanner_provider or "mock"
    )
    requested_locale = normalize_locale(locale or settings.auto_scanner_locale or "ko")
    started_at = datetime.now(timezone.utc)
    counts = {
        "symbols": len(clean_symbols),
        "tradersChecked": 0,
        "activeExposure": 0,
        "openOrders": 0,
        "openPositions": 0,
        "managementReviews": 0,
        "statusFeeds": 0,
        "errors": 0,
    }
    results: list[dict[str, Any]] = []

    for symbol in clean_symbols:
        active_traders: list[str] = []
        with session_scope() as db:
            for trader in list_traders():
                exposure = list_active_paper_exposure(db, trader.id, symbol)
                if exposure["hasExposure"]:
                    active_traders.append(trader.id)

        if not active_traders:
            continue

        snapshot = await build_market_snapshot(binance_client(), symbol)
        update_price_shock_context(symbol, snapshot)

        for trader_id in active_traders:
            trader = get_strategy(trader_id).profile
            counts["tradersChecked"] += 1
            try:
                with session_scope() as db:
                    paper_result = await process_existing_paper_exposure(
                        db,
                        trader_id,
                        symbol,
                        snapshot,
                        requested_provider,
                        requested_locale,
                    )
                open_orders = len(paper_result.get("after", {}).get("openOrders", []))
                open_positions = len(paper_result.get("after", {}).get("openPositions", []))
                management_reviews = len(paper_result.get("managementReviews", []))
                counts["activeExposure"] += 1
                counts["openOrders"] += open_orders
                counts["openPositions"] += open_positions
                counts["managementReviews"] += management_reviews
                results.append(
                    {
                        "traderId": trader_id,
                        "trader": trader.name,
                        "symbol": symbol,
                        "status": "ACTIVE_PAPER_EXPOSURE",
                        "openOrders": open_orders,
                        "openPositions": open_positions,
                        "managementReviews": management_reviews,
                    }
                )
                if management_reviews:
                    invalidate_league_cache(symbol, trader_id)
            except Exception as exc:
                counts["errors"] += 1
                results.append(
                    {
                        "traderId": trader_id,
                        "trader": trader.name,
                        "symbol": symbol,
                        "status": "ERROR",
                        "error": sanitize_error_message(str(exc)),
                    }
                )
        try:
            with session_scope() as db:
                due_feeds = await regenerate_due_status_feeds(
                    db,
                    settings=settings,
                    symbol=symbol,
                    trader_ids=active_traders,
                )
                counts["statusFeeds"] += len(due_feeds)
                if due_feeds:
                    invalidate_league_cache(symbol)
                refresh_leaderboard_snapshots(db, symbol, set(active_traders))
        except Exception as exc:
            counts["errors"] += 1
            results.append(
                {
                    "traderId": "leaderboard-refresh",
                    "trader": "Leaderboard Refresh",
                    "symbol": symbol,
                    "status": "ERROR",
                    "error": sanitize_error_message(str(exc)),
                }
            )

    finished_at = datetime.now(timezone.utc)
    payload = {
        "status": "ok" if counts["errors"] == 0 else "partial_error",
        "mode": "paper",
        "paperOnly": True,
        "symbols": clean_symbols,
        "provider": requested_provider,
        "locale": requested_locale,
        "startedAt": started_at.isoformat(),
        "finishedAt": finished_at.isoformat(),
        "durationMs": int((finished_at - started_at).total_seconds() * 1000),
        "counts": counts,
        "priceShock": AUTO_SCANNER_STATE.get("priceShock", {}),
        "results": results,
    }
    AUTO_MANAGEMENT_STATE.update(
        {
            "cycles": int(AUTO_MANAGEMENT_STATE.get("cycles") or 0) + 1,
            "lastStartedAt": payload["startedAt"],
            "lastFinishedAt": payload["finishedAt"],
            "lastError": None if counts["errors"] == 0 else "One or more management checks failed.",
            "lastResult": payload,
        }
    )
    return payload


async def auto_management_loop() -> None:
    AUTO_MANAGEMENT_STATE.update({"enabled": True, "running": True})
    interval = min(30, max(5, int(settings.auto_management_interval_seconds or 10)))
    AUTO_MANAGEMENT_STATE["intervalSeconds"] = interval
    scan_task: Optional[asyncio.Task] = None
    next_tick = time.monotonic()

    async def management_cycle() -> None:
        AUTO_MANAGEMENT_STATE.update(
            {
                "scanInProgress": True,
                "currentScanStartedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        try:
            await run_maybe_threaded(run_management_once)
        except Exception as exc:
            AUTO_MANAGEMENT_STATE.update(
                {
                    "lastError": sanitize_error_message(str(exc)),
                    "lastFinishedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
        finally:
            AUTO_MANAGEMENT_STATE.update(
                {
                    "scanInProgress": False,
                    "currentScanStartedAt": None,
                }
            )

    try:
        while True:
            sleep_seconds = max(0.0, next_tick - time.monotonic())
            AUTO_MANAGEMENT_STATE["nextTickAt"] = (
                datetime.now(timezone.utc) + timedelta(seconds=sleep_seconds)
            ).isoformat()
            if sleep_seconds > 0:
                await asyncio.sleep(sleep_seconds)

            AUTO_MANAGEMENT_STATE.update(
                {
                    "ticks": int(AUTO_MANAGEMENT_STATE.get("ticks") or 0) + 1,
                    "lastTickAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            next_tick += interval

            if scan_task and not scan_task.done():
                AUTO_MANAGEMENT_STATE.update(
                    {
                        "skippedTicks": int(AUTO_MANAGEMENT_STATE.get("skippedTicks") or 0) + 1,
                        "lastSkippedAt": datetime.now(timezone.utc).isoformat(),
                        "lastSkipReason": "previous_management_scan_still_running",
                    }
                )
                continue

            if scan_task and scan_task.done():
                try:
                    scan_task.result()
                except Exception as exc:
                    AUTO_MANAGEMENT_STATE["lastError"] = sanitize_error_message(str(exc))
            scan_task = asyncio.create_task(management_cycle())
    except asyncio.CancelledError:
        if scan_task and not scan_task.done():
            scan_task.cancel()
            try:
                await scan_task
            except asyncio.CancelledError:
                pass
        AUTO_MANAGEMENT_STATE.update({"running": False})
        raise


async def auto_scanner_loop() -> None:
    AUTO_SCANNER_STATE.update({"enabled": True, "running": True})
    interval = max(15, int(settings.auto_scanner_interval_seconds or 60))
    scan_task: Optional[asyncio.Task] = None
    next_tick = time.monotonic()

    async def scanner_cycle() -> None:
        AUTO_SCANNER_STATE.update(
            {
                "scanInProgress": True,
                "currentScanStartedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
        try:
            await run_maybe_threaded(run_scanner_once)
        except Exception as exc:
            AUTO_SCANNER_STATE.update(
                {
                    "lastError": sanitize_error_message(str(exc)),
                    "lastFinishedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
        finally:
            AUTO_SCANNER_STATE.update(
                {
                    "scanInProgress": False,
                    "currentScanStartedAt": None,
                }
            )

    try:
        while True:
            sleep_seconds = max(0.0, next_tick - time.monotonic())
            AUTO_SCANNER_STATE["nextTickAt"] = (
                datetime.now(timezone.utc) + timedelta(seconds=sleep_seconds)
            ).isoformat()
            if sleep_seconds > 0:
                await asyncio.sleep(sleep_seconds)

            AUTO_SCANNER_STATE.update(
                {
                    "ticks": int(AUTO_SCANNER_STATE.get("ticks") or 0) + 1,
                    "lastTickAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            next_tick += interval

            if scan_task and not scan_task.done():
                AUTO_SCANNER_STATE.update(
                    {
                        "skippedTicks": int(AUTO_SCANNER_STATE.get("skippedTicks") or 0) + 1,
                        "lastSkippedAt": datetime.now(timezone.utc).isoformat(),
                        "lastSkipReason": "previous_scan_still_running",
                    }
                )
                continue

            if scan_task and scan_task.done():
                try:
                    scan_task.result()
                except Exception as exc:
                    AUTO_SCANNER_STATE["lastError"] = sanitize_error_message(str(exc))
            scan_task = asyncio.create_task(scanner_cycle())
    except asyncio.CancelledError:
        if scan_task and not scan_task.done():
            scan_task.cancel()
            try:
                await scan_task
            except asyncio.CancelledError:
                pass
        AUTO_SCANNER_STATE.update({"running": False})
        raise


async def run_trader_cycle(
    trader_id: str,
    symbol: str,
    provider_override: Optional[str] = None,
    locale: str = "en",
    snapshot_override: Optional[dict[str, Any]] = None,
    refresh_leaderboard: bool = True,
) -> RunCycleResponse:
    strategy = get_strategy(trader_id)
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    requested_provider = normalize_provider(provider_override)
    snapshot = snapshot_override or await build_market_snapshot(binance_client(), clean_symbol)
    with session_scope() as db:
        paper_before_candidate = await process_existing_paper_exposure(
            db,
            strategy.profile.id,
            clean_symbol,
            snapshot,
            requested_provider,
            clean_locale,
        )

    if paper_before_candidate["after"]["hasExposure"]:
        management_plan = TradePlan(
            status="ACTIVE_PAPER_EXPOSURE",
            symbol=clean_symbol,
            notes=[
                "Existing paper order or paper position is active. New candidate generation is paused for this trader and symbol.",
            ],
            managementNotes=[
                "Use paper engine run-once or the future scanner loop to keep marking the active paper exposure.",
            ],
        )
        no_candidate = strategy.evaluate(snapshot)
        no_candidate.created = False
        no_candidate.reason = "Existing paper exposure is active; run-cycle is in management mode."
        no_candidate.entries = []
        no_candidate.takeProfits = []
        no_candidate.stopLoss = None
        no_candidate.riskPercent = None
        no_candidate.side = None
        no_candidate.setupType = None
        review = None
        plan = management_plan
        with session_scope() as db:
            snapshot_record = create_market_snapshot(db, clean_symbol, snapshot)
            run_record = create_trader_run_log(
                db,
                symbol=clean_symbol,
                trader_id=strategy.profile.id,
                provider=requested_provider,
                status="active_paper_exposure",
                payload={"requestedProvider": requested_provider, "locale": clean_locale, "paper": paper_before_candidate},
            )
            candidate_record = create_candidate_trade(db, run_record.id, clean_symbol, strategy.profile.id, no_candidate)
            update_trader_run_log(
                db,
                run_record,
                status="active_paper_exposure",
                payload={
                    "trader": strategy.profile.name,
                    "symbol": clean_symbol,
                    "candidate": no_candidate.model_dump(),
                    "aiReview": None,
                    "tradePlan": plan.model_dump(),
                    "paper": paper_before_candidate,
                },
                market_snapshot_id=snapshot_record.id,
                candidate_trade_id=candidate_record.id,
            )
            record_ids = {
                "marketSnapshotId": snapshot_record.id,
                "runId": run_record.id,
                "candidateTradeId": candidate_record.id,
                "aiReviewId": None,
                "tradePlanId": None,
                "paperOrderIds": [order["id"] for order in paper_before_candidate["after"]["openOrders"]],
                "paperPositionIds": [position["id"] for position in paper_before_candidate["after"]["openPositions"]],
                "positionManagementReviewIds": [
                    review["id"] for review in paper_before_candidate.get("managementReviews", [])
                ],
            }
            if refresh_leaderboard:
                refresh_trader_leaderboard_snapshot(db, strategy.profile.id, clean_symbol)
            prune_trader_database(db, strategy.profile.id, clean_symbol)
        return RunCycleResponse(
            runId=record_ids["runId"],
            persisted=True,
            recordIds=record_ids,
            trader=strategy.profile.name,
            traderId=strategy.profile.id,
            symbol=clean_symbol,
            marketSnapshot=snapshot,
            candidate=no_candidate,
            aiReview=review,
            tradePlan=plan,
            paper=paper_before_candidate,
            paperOrders=paper_before_candidate["after"]["openOrders"],
            paperOrder=paper_before_candidate["after"]["openOrders"][0] if paper_before_candidate["after"]["openOrders"] else None,
            paperPositions=paper_before_candidate["after"]["openPositions"],
            paperPosition=paper_before_candidate["after"]["openPositions"][0] if paper_before_candidate["after"]["openPositions"] else None,
            tradeEvents=paper_before_candidate["engine"]["events"],
            equitySnapshot=paper_before_candidate["engine"]["equitySnapshot"],
            managementReviews=paper_before_candidate.get("managementReviews", []),
        )

    with session_scope() as db:
        cooldown = latest_ai_review_cooldown(db, strategy.profile.id, clean_symbol)

    if cooldown:
        remaining = cooldown["remainingSeconds"]
        reason = (
            f"Second-stage AI returned {cooldown['decision']}. "
            f"First-stage scanning is paused for {remaining} more seconds."
        )
        no_candidate = TradeCandidate(
            created=False,
            reason=reason,
            setupScore=0,
            notes=[
                "AI rejection cooldown prevents repeated first-stage scans on the same trader/symbol.",
            ],
        )
        plan = TradePlan(
            status="AI_REVIEW_COOLDOWN",
            symbol=clean_symbol,
            notes=[reason],
            managementNotes=[
                "Existing paper exposure management still runs; only new candidate generation is paused.",
            ],
        )
        with session_scope() as db:
            snapshot_record = create_market_snapshot(db, clean_symbol, snapshot)
            run_record = create_trader_run_log(
                db,
                symbol=clean_symbol,
                trader_id=strategy.profile.id,
                provider=requested_provider,
                status="ai_review_cooldown",
                payload={"requestedProvider": requested_provider, "locale": clean_locale, "cooldown": cooldown},
            )
            candidate_record = create_candidate_trade(db, run_record.id, clean_symbol, strategy.profile.id, no_candidate)
            update_trader_run_log(
                db,
                run_record,
                status="ai_review_cooldown",
                payload={
                    "trader": strategy.profile.name,
                    "symbol": clean_symbol,
                    "candidate": no_candidate.model_dump(),
                    "aiReview": None,
                    "tradePlan": plan.model_dump(),
                    "paper": paper_before_candidate,
                    "cooldown": cooldown,
                },
                market_snapshot_id=snapshot_record.id,
                candidate_trade_id=candidate_record.id,
            )
            record_ids = {
                "marketSnapshotId": snapshot_record.id,
                "runId": run_record.id,
                "candidateTradeId": candidate_record.id,
                "aiReviewId": None,
                "tradePlanId": None,
                "paperOrderIds": [],
                "paperPositionIds": [],
                "positionManagementReviewIds": [
                    review["id"] for review in paper_before_candidate.get("managementReviews", [])
                ],
            }
            if refresh_leaderboard:
                refresh_trader_leaderboard_snapshot(db, strategy.profile.id, clean_symbol)
            prune_trader_database(db, strategy.profile.id, clean_symbol)
        return RunCycleResponse(
            runId=record_ids["runId"],
            persisted=True,
            recordIds=record_ids,
            trader=strategy.profile.name,
            traderId=strategy.profile.id,
            symbol=clean_symbol,
            marketSnapshot=snapshot,
            candidate=no_candidate,
            aiReview=None,
            tradePlan=plan,
            paper=paper_before_candidate,
            paperOrders=[],
            paperOrder=None,
            paperPositions=[],
            paperPosition=None,
            tradeEvents=paper_before_candidate["engine"]["events"],
            equitySnapshot=paper_before_candidate["engine"]["equitySnapshot"],
            managementReviews=paper_before_candidate.get("managementReviews", []),
        )

    candidate = strategy.evaluate(snapshot)
    review = None
    plan = trade_plan_from_review(clean_symbol, candidate, type("Review", (), {"decision": "NEEDS_MORE_DATA", "adjustments": [], "counterThesis": "No review"})())
    paper_result: dict[str, Any] = paper_before_candidate

    with session_scope() as db:
        snapshot_record = create_market_snapshot(db, clean_symbol, snapshot)
        run_record = create_trader_run_log(
            db,
            symbol=clean_symbol,
            trader_id=strategy.profile.id,
            provider=requested_provider,
            payload={"requestedProvider": requested_provider, "locale": clean_locale},
        )
        candidate_record = create_candidate_trade(db, run_record.id, clean_symbol, strategy.profile.id, candidate)
        if first_stage_observation_type(candidate) == "OBSERVE_ONLY":
            create_observation_candidate(
                db,
                symbol=clean_symbol,
                trader_id=strategy.profile.id,
                candidate=candidate,
                observation_type="OBSERVE_ONLY",
                run_id=run_record.id,
                candidate_trade_id=candidate_record.id,
                decision=None,
                status="observe_only",
                payload={"source": "run_trader_cycle", "reason": candidate.reason},
            )
        record_ids = {
            "marketSnapshotId": snapshot_record.id,
            "runId": run_record.id,
            "candidateTradeId": candidate_record.id,
            "aiReviewId": None,
            "tradePlanId": None,
            "paperOrderIds": [],
        }

    status = "no_candidate"
    error_message = None
    review_record = None
    plan_record = None
    created_paper_orders: list[dict] = []
    try:
        try:
            if candidate.created:
                with session_scope() as db:
                    review_payload = TradeReviewPayload(
                        trader=strategy.profile,
                        symbol=clean_symbol,
                        marketSnapshot=snapshot,
                        candidate=candidate,
                        locale=clean_locale,
                        **build_trade_review_context(db, strategy.profile.id, clean_symbol),
                    )
                    review = await run_review_with_logging(db, review_payload, requested_provider, settings=settings)
                    review.sourceLocale = clean_locale
                    review_record = create_ai_review(db, record_ids["runId"], clean_symbol, strategy.profile.id, review)
                    create_observation_candidate(
                        db,
                        symbol=clean_symbol,
                        trader_id=strategy.profile.id,
                        candidate=candidate,
                        observation_type=first_stage_observation_type(candidate, review.decision),
                        run_id=record_ids["runId"],
                        candidate_trade_id=record_ids["candidateTradeId"],
                        ai_review_id=review_record.id,
                        decision=review.decision,
                        status="approved" if review.decision in {"APPROVE", "ADJUST_AND_APPROVE"} else "ai_rejected",
                        payload={"source": "second_stage_review", "confidence": review.confidence, "riskLevel": review.riskLevel},
                    )
                    await fanout_ai_translations(
                        db,
                        settings=settings,
                        source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                        source_id=review_record.id,
                        payload=from_json(review_record.payload_json) or {},
                        symbol=clean_symbol,
                        trader_id=strategy.profile.id,
                    )
                    await create_status_feed_for_ai_review(db, settings=settings, review=review_record)
                    plan = trade_plan_from_review(clean_symbol, candidate, review)
                    if review.decision in {"APPROVE", "ADJUST_AND_APPROVE"}:
                        plan_record = create_trade_plan(db, record_ids["runId"], clean_symbol, strategy.profile.id, plan)
                        paper_order_result = create_paper_orders_from_plan(
                            db,
                            trader_id=strategy.profile.id,
                            symbol=clean_symbol,
                            run_id=record_ids["runId"],
                            trade_plan_id=plan_record.id,
                            candidate=candidate,
                            plan=plan,
                            settings=settings,
                            review=review,
                            ai_review_id=review_record.id,
                        )
                        created_paper_orders = paper_order_result.get("created", [])
                        await create_status_feed_for_pending_trade_plan(
                            db,
                            settings=settings,
                            plan=plan_record,
                            created_orders=created_paper_orders,
                        )
                        paper_result = {
                            **paper_result,
                            "ordersCreated": paper_order_result,
                            "after": list_active_paper_exposure(db, strategy.profile.id, clean_symbol),
                        }
                    record_ids["aiReviewId"] = review_record.id
                    record_ids["tradePlanId"] = plan_record.id if plan_record else None
                    record_ids["paperOrderIds"] = [order["id"] for order in created_paper_orders]
                status = "completed"
        except Exception as exc:
            error_message = sanitize_error_message(str(exc))
            status = "error"
            raise
        finally:
            with session_scope() as db:
                run_record = db.get(TraderRunLogRecord, record_ids["runId"])
                update_trader_run_log(
                    db,
                    run_record,
                    status=status,
                    payload={
                        "trader": strategy.profile.name,
                        "symbol": clean_symbol,
                        "candidate": candidate.model_dump(),
                        "aiReview": review.model_dump() if review else None,
                        "tradePlan": plan.model_dump() if plan else None,
                        "paper": paper_result,
                        "managementReviews": paper_result.get("managementReviews", []),
                    },
                    error_message=error_message,
                    market_snapshot_id=record_ids["marketSnapshotId"],
                    candidate_trade_id=record_ids["candidateTradeId"],
                    ai_review_id=record_ids["aiReviewId"],
                    trade_plan_id=record_ids["tradePlanId"],
                )
            try:
                with session_scope() as db:
                    if refresh_leaderboard:
                        refresh_trader_leaderboard_snapshot(db, strategy.profile.id, clean_symbol)
                    prune_trader_database(db, strategy.profile.id, clean_symbol)
            except Exception:
                invalidate_league_cache(clean_symbol, strategy.profile.id)
    except Exception:
        raise

    return RunCycleResponse(
        runId=record_ids["runId"],
        persisted=True,
        recordIds=record_ids,
        trader=strategy.profile.name,
        traderId=strategy.profile.id,
        symbol=clean_symbol,
        marketSnapshot=snapshot,
        candidate=candidate,
        aiReview=review,
        tradePlan=plan,
        paper=paper_result,
        paperOrders=paper_result.get("after", {}).get("openOrders", []),
        paperOrder=paper_result.get("after", {}).get("openOrders", [None])[0] if paper_result.get("after", {}).get("openOrders") else None,
        paperPositions=paper_result.get("after", {}).get("openPositions", []),
        paperPosition=paper_result.get("after", {}).get("openPositions", [None])[0] if paper_result.get("after", {}).get("openPositions") else None,
        tradeEvents=paper_result.get("engine", {}).get("events", []),
        equitySnapshot=paper_result.get("engine", {}).get("equitySnapshot"),
        managementReviews=paper_result.get("managementReviews", []),
    )


@app.get("/health")
async def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "service": "ai-trader-league-api",
        "mode": settings.app_env,
        "buildSha": settings.build_sha,
    }


@app.get("/api/db/status")
async def database_status() -> Dict[str, Any]:
    return db_status()


@app.get("/api/ops/storage-policy")
async def storage_policy() -> Dict[str, Any]:
    database = db_status()
    return {
        "status": "ok",
        "mode": "paper",
        "paperOnly": True,
        "privateTradingApi": False,
        "database": {
            "dialect": database["dialect"],
            "databaseUrl": database["databaseUrl"],
            "remoteDatabaseBlockedInLocal": database.get("remoteDatabaseBlockedInLocal", False),
        },
        "policies": {
            "marketSnapshots": {
                "mode": "compact",
                "rawJson": False,
                "storesCandles": False,
                "storesLatestCandle": False,
                "defaultRestEndpointWrite": False,
            },
            "traderRunLogs": {
                "mode": "compact",
                "rawJson": False,
                "storesFullMarketSnapshot": False,
                "storesFullPaperState": False,
            },
            "hotMarketData": {
                "mode": "redis_cache_with_memory_fallback" if settings.redis_url and settings.redis_market_cache_enabled else "memory_cache",
                "databasePersistence": False,
                "remoteRedisRequired": False,
                "redisConfigured": bool(settings.redis_url),
            },
        },
    }


@app.post("/api/ops/trader-history/reset")
async def trader_history_reset(
    request: TraderHistoryResetRequest,
    _: None = Depends(require_ops_api_token),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    database_url = normalized_database_url()
    is_remote = database_url.startswith(REMOTE_DATABASE_PREFIXES)
    is_production = settings.app_env.lower() == "production"
    if not request.dryRun:
        if request.confirmationText != RESET_CONFIRMATION_TEXT:
            raise HTTPException(
                status_code=409,
                detail={"code": "RESET_CONFIRMATION_REQUIRED"},
            )
        if is_production and not settings.ops_allow_production_reset:
            raise HTTPException(status_code=403, detail={"code": "RESET_PRODUCTION_DISABLED_BY_SERVER"})
        if is_remote and not settings.ops_allow_remote_reset:
            raise HTTPException(status_code=403, detail={"code": "RESET_REMOTE_DATABASE_DISABLED_BY_SERVER"})
        if is_production and not request.allowProduction:
            raise HTTPException(status_code=409, detail={"code": "RESET_PRODUCTION_OVERRIDE_REQUIRED"})
        if is_remote and not request.allowRemote:
            raise HTTPException(status_code=409, detail={"code": "RESET_REMOTE_DATABASE_OVERRIDE_REQUIRED"})
    try:
        result = reset_trader_history(
            db,
            trader_ids=request.traderIds,
            symbols=request.symbols,
            dry_run=request.dryRun,
            confirmation_text=request.confirmationText,
        )
    except ValueError as exc:
        if str(exc) == "RESET_CONFIRMATION_REQUIRED":
            raise HTTPException(
                status_code=409,
                detail={"code": "RESET_CONFIRMATION_REQUIRED"},
            ) from exc
        raise
    result["database"] = {
        "databaseUrl": mask_database_url(database_url),
        "dialect": db.bind.dialect.name if db.bind is not None else None,
        "appEnv": settings.app_env,
        "remote": is_remote,
        "production": is_production,
    }
    return result


@app.post("/api/ops/trader-status-feeds/generate")
async def generate_trader_status_feeds_api(
    request: TraderStatusFeedGenerateRequest,
    _: None = Depends(require_ops_api_token),
) -> Dict[str, Any]:
    clean_symbol = normalize_symbol(request.symbol)
    clean_locale = normalize_locale(request.locale)
    valid_trader_ids = {trader.id for trader in list_traders()}
    target_ids = [trader_id for trader_id in request.traderIds if trader_id in valid_trader_ids] or sorted(valid_trader_ids)
    with session_scope() as db:
        records = await create_status_feeds_for_current_states(
            db,
            settings=settings,
            symbol=clean_symbol,
            trader_ids=target_ids,
            force=request.force,
        )
        generated_ids = {record.id for record in records}
        if generated_ids:
            invalidate_league_cache(clean_symbol)
        feed_items = [
            item
            for item in list_status_feed_payloads(
                db,
                symbol=clean_symbol,
                limit=max(len(records), 1),
                locale=clean_locale,
            )
            if item.get("id") in generated_ids
        ]
    return {
        "symbol": clean_symbol,
        "locale": clean_locale,
        "requestedTraders": target_ids,
        "generated": len(records),
        "statusFeeds": feed_items,
    }


@app.get("/api/market/cache/status")
async def market_cache_status() -> Dict[str, Any]:
    now = time.monotonic()
    active_kline_keys = [
        {"symbol": key[0], "interval": key[1], "limit": key[2], "ttlSeconds": max(0, int(expires_at - now))}
        for key, (expires_at, _) in MARKET_KLINE_CACHE.items()
    ]
    runtime = market_cache_runtime()
    persistence = "redis_ttl_with_memory_fallback" if runtime["redisConfigured"] and runtime["redisMarketCacheEnabled"] else "memory_only"
    return {
        "status": "ok",
        "hotMarketData": {
            "source": runtime["marketDataProvider"],
            "fallbackSource": runtime["marketDataFallbackProvider"],
            "persistence": persistence,
            "databasePersistence": False,
            "remoteRedisRequired": False,
            "redisConfigured": runtime["redisConfigured"],
            "redisAvailable": runtime["redisAvailable"],
        },
        "caches": {
            "klines": {
                "entries": len(MARKET_KLINE_CACHE),
                "maxEntries": 240,
                "items": active_kline_keys,
            },
            "derivatives": {"entries": runtime["memoryDerivativeEntries"]},
            "series": {"entries": runtime["memorySeriesEntries"]},
            "leagueBundle": {
                "entries": len(LEAGUE_BUNDLE_CACHE),
                "ttlSeconds": LEAGUE_BUNDLE_CACHE_TTL_SECONDS,
            },
            "traderDetail": {
                "entries": len(TRADER_DETAIL_CACHE),
                "ttlSeconds": LEAGUE_BUNDLE_CACHE_TTL_SECONDS,
            },
        },
    }


@app.get("/api/binance/test")
async def binance_test() -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        result = await binance_client().test_public_data()
        with session_scope() as db:
            create_api_call_log(db, "/api/binance/test", "GET", "ok", latency_ms=int((time.perf_counter() - start) * 1000), payload={"binanceReachable": result.get("binanceReachable")})
        return result
    except Exception as exc:
        with session_scope() as db:
            create_api_call_log(db, "/api/binance/test", "GET", "error", latency_ms=int((time.perf_counter() - start) * 1000), error_message=sanitize_error_message(str(exc)))
        raise


@app.get("/api/market/klines")
@app.get("/api/binance/klines")
async def klines(
    symbol: str = Query("BTCUSDT"),
    interval: str = Query("1m"),
    limit: int = Query(20, ge=1, le=500),
    before: Optional[int] = Query(None),
):
    clean_symbol = normalize_symbol(symbol)
    if interval not in ALLOWED_INTERVALS:
        raise HTTPException(status_code=400, detail="Unsupported interval.")
    try:
        candles = (
            await cached_klines_before(binance_client(), clean_symbol, interval, limit, before)
            if before
            else await cached_klines(binance_client(), clean_symbol, interval, limit)
        )
        payload = {"symbol": clean_symbol, "interval": interval, "count": len(candles), "candles": candles}
        return payload
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Market data request failed: {exc}") from exc


@app.get("/api/binance/open-interest")
async def open_interest(symbol: str = Query("BTCUSDT")):
    try:
        return await binance_client().get_open_interest(normalize_symbol(symbol))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Market data request failed: {exc}") from exc


@app.get("/api/binance/market-snapshot")
async def market_snapshot(symbol: str = Query("BTCUSDT"), persist: bool = Query(False)):
    try:
        clean_symbol = normalize_symbol(symbol)
        snapshot = await build_market_snapshot(binance_client(), clean_symbol)
        if persist:
            with session_scope() as db:
                create_market_snapshot(db, clean_symbol, snapshot)
        return snapshot
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Market data request failed: {exc}") from exc


@app.get("/api/traders")
async def traders():
    return {"traders": list_traders()}


@app.get("/api/traders/{trader_id}")
async def trader_detail(trader_id: str):
    try:
        return public_trader_profile(get_strategy(trader_id).profile)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Trader not found.") from exc


@app.get("/api/league/leaderboard")
async def league_leaderboard(symbol: str = Query("BTCUSDT"), db: Session = Depends(get_db)):
    clean_symbol = normalize_symbol(symbol)
    return {
        "symbol": clean_symbol,
        "traders": list_traders(),
        "summaries": trader_summary_payload(db, clean_symbol),
        "positions": list_filtered_records(db, PaperPositionRecord, limit=100, symbol=clean_symbol, status="open", include_payload=True),
        "orders": list_filtered_records(db, PaperOrderRecord, limit=100, symbol=clean_symbol, status="open", include_payload=True),
        "managementReviews": list_filtered_records(db, PositionManagementReviewRecord, limit=30, symbol=clean_symbol, include_payload=False),
        "scanner": scanner_status_payload(),
    }


@app.get("/api/league/leaderboard-fast")
def league_leaderboard_fast(
    symbol: str = Query("BTCUSDT"),
    include_empty: bool = Query(True),
    include_related: bool = Query(False, alias="includeRelated"),
    refresh: bool = Query(False),
    locale: str = Query(CANONICAL_AI_LOCALE),
    league_month: Optional[str] = Query(None, alias="leagueMonth"),
    db: Session = Depends(get_db),
):
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    monthly_period = parse_utc_league_month(league_month)
    init_db()
    cache_key = (
        clean_symbol,
        include_empty,
        include_related,
        clean_locale,
        monthly_period[0] if monthly_period else "current",
    )
    cached = LEAGUE_BUNDLE_CACHE.get(cache_key)
    expected_trader_count = (
        len(list_traders_for_league_month(monthly_period[0])) if monthly_period else len(list_traders())
    )
    cached_trader_count = len(cached[1].get("traders", [])) if cached else 0
    if cached and cached_trader_count > 0 and cached_trader_count != expected_trader_count:
        LEAGUE_BUNDLE_CACHE.pop(cache_key, None)
        cached = None
    now = time.monotonic()
    cache_was_stale = bool(cached and cached[0] <= now)
    cache_payload_outdated = bool(
        cached and cached_league_payload_outdated(db, symbol=clean_symbol, payload=cached[1])
    )
    cache_was_invalidated = cache_entry_was_invalidated(cached) or cache_payload_outdated
    if not refresh and cached:
        is_fresh = cached[0] > now
        if is_fresh and not cache_payload_outdated:
            return {**cached[1], "cacheHit": True, "stale": False, "scheduledRefresh": False}
        if not cache_was_invalidated and monthly_period:
            schedule_thread_refresh(
                refresh_league_bundle_cache_background,
                clean_symbol,
                include_empty,
                include_related,
                clean_locale,
                monthly_period[0],
            )
        elif not cache_was_invalidated:
            schedule_thread_refresh(refresh_league_bundle_cache_background, clean_symbol, include_empty, include_related, clean_locale)
        if not cache_was_invalidated:
            return {**cached[1], "cacheHit": True, "stale": True, "scheduledRefresh": True}
    missing_ids: set[str] = set()
    try:
        if monthly_period:
            league_month_value, period_start, period_end = monthly_period
            if not refresh and not cache_was_invalidated:
                schedule_thread_refresh(
                    refresh_league_bundle_cache_background,
                    clean_symbol,
                    include_empty,
                    include_related,
                    clean_locale,
                    league_month_value,
                )
                return build_monthly_league_warming_payload(
                    clean_symbol,
                    league_month_value,
                    period_start,
                    period_end,
                    locale=clean_locale,
                )
            payload = build_monthly_league_bundle_payload(
                db,
                clean_symbol,
                league_month_value,
                period_start,
                period_end,
                include_empty=include_empty,
                include_related=include_related,
                locale=clean_locale,
            )
            LEAGUE_BUNDLE_CACHE[cache_key] = (time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS, payload)
            return payload

        known_trader_ids = {trader.id for trader in list_traders()}
        existing_ids = {
            trader_id
            for trader_id in db.execute(
                select(TraderLeaderboardSnapshotRecord.trader_id).where(
                    TraderLeaderboardSnapshotRecord.symbol == clean_symbol
                )
            ).scalars().all()
            if trader_id
        }
        missing_ids = known_trader_ids - existing_ids
        if refresh:
            refresh_leaderboard_snapshots(db, clean_symbol, None)
            db.commit()
        elif missing_ids:
            schedule_thread_refresh(refresh_league_bundle_cache_background, clean_symbol, include_empty, include_related, clean_locale)

        payload = build_league_bundle_payload(
            db,
            clean_symbol,
            include_empty=include_empty,
            include_related=include_related,
            refreshed=refresh,
            scheduled_refresh=bool((missing_ids or cache_was_stale) and not refresh),
            missing_ids=missing_ids,
            locale=clean_locale,
        )
    except SQLAlchemyError:
        db.rollback()
        if monthly_period:
            raise HTTPException(status_code=500, detail="Monthly leaderboard is temporarily unavailable.")
        summaries = compute_trader_summary_payload(db, clean_symbol)
        if not include_empty:
            summaries = [summary for summary in summaries if summary.get("hasLivePaperData")]
        payload = {
            "symbol": clean_symbol,
            "mode": "paper",
            "paperOnly": True,
            "source": "computed_fallback",
            "period": {"type": "current", "timezone": "UTC"},
            "needsMigration": True,
            "cacheHit": False,
            "stale": False,
            "scheduledRefresh": False,
            "missingSnapshotCount": len(missing_ids),
            "refreshed": False,
            "snapshotCount": len(summaries),
            "lastUpdatedAt": None,
            "traders": list_traders(),
            "summaries": summaries,
            "positions": list_filtered_records(db, PaperPositionRecord, limit=100, symbol=clean_symbol, status="open", include_payload=False) if include_related else [],
            "orders": list_filtered_records(db, PaperOrderRecord, limit=100, symbol=clean_symbol, status="open", include_payload=False) if include_related else [],
            "managementReviews": list_filtered_records(db, PositionManagementReviewRecord, limit=30, symbol=clean_symbol, include_payload=False) if include_related else [],
            "statusFeeds": list_status_feed_payloads(db, symbol=clean_symbol, limit=120, locale=clean_locale) if include_related else [],
            "scanner": scanner_status_payload(),
        }
    if not refresh and not missing_ids and not payload.get("needsMigration"):
        LEAGUE_BUNDLE_CACHE[cache_key] = (time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS, payload)
    return payload


@app.get("/api/league/sentiment/opinion")
async def league_sentiment_opinion(
    symbol: str = Query("BTCUSDT"),
    locale: str = Query("ko"),
    refresh: bool = Query(False),
    prefer_cached: bool = Query(False, alias="preferCached"),
    db: Session = Depends(get_db),
):
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    init_db()
    return await get_or_create_league_sentiment_opinion(
        db,
        symbol=clean_symbol,
        locale=clean_locale,
        settings=settings,
        force=refresh,
        prefer_cached=prefer_cached,
    )


@app.get("/api/league/overview-reviews")
async def league_overview_reviews(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    prefer_cached: bool = Query(False),
):
    return cached_overview_review_records(
        limit=limit,
        offset=offset,
        symbol=symbol,
        trader_id=trader_id,
        locale=normalize_locale(locale),
        prefer_cached=prefer_cached,
    )


@app.post("/api/league/leaderboard-snapshots/refresh")
async def refresh_leaderboard_snapshots_api(
    symbol: str = Query("BTCUSDT"),
    trader_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    clean_symbol = normalize_symbol(symbol)
    init_db()
    trader_ids = None
    if trader_id:
        try:
            get_strategy(trader_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Trader not found.") from exc
        trader_ids = {trader_id}
    records = refresh_leaderboard_snapshots(db, clean_symbol, trader_ids)
    db.commit()
    records = sorted(records, key=lambda record: (-record.rank_score, -record.equity, record.trader_id or ""))
    return {
        "symbol": clean_symbol,
        "mode": "paper",
        "paperOnly": True,
        "refreshed": len(records),
        "summaries": [leaderboard_snapshot_summary(record, rank) for rank, record in enumerate(records, start=1)],
    }


@app.get("/api/league/traders/{trader_id}")
def league_trader_detail(
    trader_id: str,
    symbol: str = Query("BTCUSDT"),
    locale: str = Query(CANONICAL_AI_LOCALE),
    refresh: bool = Query(False),
    reviews_limit: int = Query(20, ge=1, le=50, alias="reviewsLimit"),
    events_limit: int = Query(20, ge=1, le=50, alias="eventsLimit"),
    db: Session = Depends(get_db),
):
    try:
        trader = public_trader_profile(get_strategy(trader_id).profile)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Trader not found.") from exc
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    cache_key = (trader_id, clean_symbol, reviews_limit, events_limit, clean_locale, TRADER_DETAIL_CACHE_VERSION)
    cached = TRADER_DETAIL_CACHE.get(cache_key)
    now = time.monotonic()
    cache_was_stale = bool(cached and cached[0] <= now)
    cache_payload_outdated = bool(
        cached
        and cached_trader_detail_payload_outdated(
            db,
            trader_id=trader_id,
            symbol=clean_symbol,
            payload=cached[1],
        )
    )
    cache_was_invalidated = cache_entry_was_invalidated(cached) or cache_payload_outdated
    if cached and not refresh:
        is_fresh = cached[0] > now
        if is_fresh and not cache_payload_outdated:
            return {**cached[1], "cacheHit": True, "stale": False, "scheduledRefresh": False}
        if not cache_was_invalidated:
            schedule_thread_refresh(refresh_trader_detail_cache_background, trader_id, clean_symbol, clean_locale)
            return {**cached[1], "cacheHit": True, "stale": True, "scheduledRefresh": True}
    if refresh:
        refresh_trader_leaderboard_snapshot(db, trader_id, clean_symbol)
        db.commit()
    snapshot_summary = trader_snapshot_summary(db, trader_id, clean_symbol)
    translations_ready = trader_detail_translations_ready(
        db,
        trader_id=trader_id,
        clean_symbol=clean_symbol,
        locale=clean_locale,
        reviews_limit=reviews_limit,
        events_limit=events_limit,
    )
    if not translations_ready:
        schedule_thread_refresh(refresh_trader_detail_cache_background, trader_id, clean_symbol, clean_locale)
        db.commit()
    payload = build_trader_detail_payload(
        db,
        trader_id,
        clean_symbol,
        trader,
        summaries=[snapshot_summary] if snapshot_summary else None,
        reviews_limit=reviews_limit,
        events_limit=events_limit,
        locale=clean_locale,
    )
    if not any(summary.get("traderId") == trader_id for summary in payload["summaries"]):
        schedule_thread_refresh(refresh_trader_detail_cache_background, trader_id, clean_symbol, clean_locale)
    payload["scheduledRefresh"] = bool(cache_was_stale and not refresh)
    if translations_ready:
        TRADER_DETAIL_CACHE[cache_key] = (time.monotonic() + LEAGUE_BUNDLE_CACHE_TTL_SECONDS, payload)
    return payload


@app.get("/api/league/traders/{trader_id}/management-reviews")
async def league_trader_management_reviews(
    trader_id: str,
    symbol: str = Query("BTCUSDT"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    try:
        get_strategy(trader_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Trader not found.") from exc
    clean_symbol = normalize_symbol(symbol)
    clean_locale = normalize_locale(locale)
    records = list_filtered_records(
        db,
        PositionManagementReviewRecord,
        limit=limit + 1,
        offset=offset,
        symbol=clean_symbol,
        trader_id=trader_id,
        include_payload=True,
        locale=clean_locale,
        payload_mode="detail",
    )
    page = records[:limit]
    if clean_locale != CANONICAL_AI_LOCALE and any((record.get("translation") or {}).get("status") == "missing" for record in page):
        schedule_thread_refresh(refresh_trader_detail_cache_background, trader_id, clean_symbol, clean_locale)
    return {
        "symbol": clean_symbol,
        "traderId": trader_id,
        "managementReviews": page,
        "offset": offset,
        "nextOffset": offset + len(page),
        "hasMore": len(records) > limit,
    }


@app.get("/api/league/traders/{trader_id}/trade-history")
async def league_trader_trade_history(
    trader_id: str,
    symbol: str = Query("BTCUSDT"),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    from datetime import timezone
    import json
    clean_symbol = normalize_symbol(symbol)
    
    # 1. Fetch closed positions (sufficiently large limit to construct a complete history on backend)
    positions = db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == clean_symbol,
            PaperPositionRecord.status == "closed",
        )
        .order_by(desc(PaperPositionRecord.closed_at))
        .limit(1000)
    ).scalars().all()
    
    # 2. Fetch trade events representing realized PnL changes
    event_types = [
        "POSITION_CLOSED", "TAKE_PROFIT", "PARTIAL_TAKE_PROFIT", "TAKE_PARTIAL_PROFIT",
        "STOP_LOSS", "LIQUIDATION", "CLOSE_POSITION", "POSITION_REDUCED_BY_AI",
        "REDUCE_SIZE", "REDUCE_RISK"
    ]
    stmt = select(TradeEventRecord).where(
        TradeEventRecord.trader_id == trader_id,
        TradeEventRecord.symbol == clean_symbol
    )
    stmt = stmt.where(func.upper(TradeEventRecord.event_type).in_(event_types))
    events = db.execute(stmt.order_by(desc(TradeEventRecord.created_at)).limit(1000)).scalars().all()
    
    # 3. Group and aggregate records by hour/minute, side, exit price, and symbol
    merged_items = {}
    
    def parse_float(val):
        if val is None:
            return 0.0
        try:
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    def event_payload(ev: TradeEventRecord) -> dict:
        if not ev.payload_json:
            return {}
        try:
            parsed = json.loads(ev.payload_json)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def normalized_event_type(ev: TradeEventRecord) -> str:
        return str(ev.event_type or "").replace("-", "_").upper()

    def is_partial_exit_event(ev: TradeEventRecord, payload: dict) -> bool:
        event_type = normalized_event_type(ev)
        source = str(payload.get("source") or "").lower()
        return (
            "PARTIAL" in event_type
            or "REDUCE" in event_type
            or event_type == "TAKE_PARTIAL_PROFIT"
            or source == "strategy_take_profit"
            or payload.get("takeProfitIndex") is not None
        )

    def is_final_exit_event(ev: TradeEventRecord, payload: dict) -> bool:
        if is_partial_exit_event(ev, payload):
            return False
        return normalized_event_type(ev) in {
            "POSITION_CLOSED",
            "TAKE_PROFIT",
            "STOP_LOSS",
            "LIQUIDATION",
            "CLOSE_POSITION",
        }

    event_payloads = {id(ev): event_payload(ev) for ev in events}
    positions_with_final_exit_events = {
        ev.position_id
        for ev in events
        if ev.position_id is not None and is_final_exit_event(ev, event_payloads[id(ev)])
    }

    for pos in positions:
        if pos.id in positions_with_final_exit_events:
            continue
        closed_at = pos.closed_at or pos.updated_at or pos.created_at
        if not closed_at:
            continue
        time_key = closed_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
        
        exit_price = parse_float(pos.exit_price)
        entry_price = parse_float(pos.entry_price)
        qty = parse_float(pos.quantity)
        pnl = parse_float(pos.realized_pnl)
        leverage = parse_float(pos.leverage)
        side = (pos.side or "SHORT").upper()
        
        key = (time_key, side, f"{exit_price:.2f}", clean_symbol)
        
        if key in merged_items:
            existing = merged_items[key]
            existing["quantity"] += qty
            existing["pnl"] += pnl
            existing["weighted_entry_sum"] += entry_price * qty
            existing["entry_qty_sum"] += qty
            if leverage > existing["leverage"]:
                existing["leverage"] = leverage
        else:
            merged_items[key] = {
                "time": closed_at.isoformat(),
                "side": side,
                "exitPrice": exit_price,
                "symbol": clean_symbol,
                "quantity": qty,
                "pnl": pnl,
                "leverage": leverage,
                "weighted_entry_sum": entry_price * qty,
                "entry_qty_sum": qty,
                "action": "close",
                "closeReason": pos.close_reason or "closed",
            }
            
    for ev in events:
        created_at = ev.created_at
        if not created_at:
            continue
        time_key = created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M")
        
        price = parse_float(ev.price)
        qty = parse_float(ev.quantity)
        pnl = parse_float(ev.realized_pnl)
        
        payload = event_payloads[id(ev)]
                
        entry_price = parse_float(payload.get("entryPrice") or payload.get("averageEntryPrice") or price)
        leverage = parse_float(payload.get("leverage") or 1.0)
        side_val = str(payload.get("side") or ev.event_type or "SHORT").upper()
        side = "SHORT" if ("SHORT" in side_val or "SELL" in side_val) else "LONG"
            
        key = (time_key, side, f"{price:.2f}", clean_symbol)
        
        if key in merged_items:
            existing = merged_items[key]
            existing["quantity"] += qty
            existing["pnl"] += pnl
            existing["weighted_entry_sum"] += entry_price * qty
            existing["entry_qty_sum"] += qty
            if leverage > existing["leverage"]:
                existing["leverage"] = leverage
        else:
            merged_items[key] = {
                "time": created_at.isoformat(),
                "side": side,
                "exitPrice": price,
                "symbol": clean_symbol,
                "quantity": qty,
                "pnl": pnl,
                "leverage": leverage,
                "weighted_entry_sum": entry_price * qty,
                "entry_qty_sum": qty,
                "action": ev.event_type.lower(),
                "closeReason": payload.get("reason") or "closed",
            }
            
    # Finalize items and calculate average entry prices
    results = []
    for item in merged_items.values():
        if item["entry_qty_sum"] > 0:
            item["entryPrice"] = item["weighted_entry_sum"] / item["entry_qty_sum"]
        else:
            item["entryPrice"] = item["exitPrice"]
            
        del item["weighted_entry_sum"]
        del item["entry_qty_sum"]
        results.append(item)
        
    # Sort by time desc (most recent first)
    results.sort(key=lambda x: x["time"], reverse=True)
    
    # Paginate
    paginated = results[offset : offset + limit]
    next_offset = offset + len(paginated)
    
    return {
        "symbol": clean_symbol,
        "traderId": trader_id,
        "total": len(results),
        "offset": offset,
        "limit": limit,
        "nextOffset": next_offset,
        "hasMore": next_offset < len(results),
        "items": paginated
    }


@app.post("/api/traders/{trader_id}/run-cycle")
async def trader_run_cycle(trader_id: str, request: RunCycleRequest, provider: Optional[str] = Query(None)):
    try:
        return await run_trader_cycle(trader_id, request.symbol, provider_override=provider, locale=request.locale)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Trader not found.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Market data request failed: {exc}") from exc


@app.post("/api/demo/run-all-traders")
async def run_all_traders(request: RunCycleRequest):
    results = []
    for trader in list_traders():
        results.append(await run_trader_cycle(trader.id, request.symbol, provider_override="mock", locale=request.locale))
    return {"symbol": normalize_symbol(request.symbol), "provider": "mock", "results": results}


@app.get("/api/ai/providers")
async def ai_providers():
    return {
        "selectedProvider": settings.ai_provider,
        "providers": provider_status(settings),
        "fallbackToMock": settings.ai_missing_key_fallback_to_mock,
        "envFileLoaded": settings.env_file_loaded,
    }


@app.get("/api/scanner/status")
async def scanner_status():
    return scanner_status_payload()


@app.get("/api/paper/realtime/status")
async def realtime_paper_status():
    return {
        **REALTIME_EXECUTION_STATE,
        "taskActive": bool(REALTIME_EXECUTION_TASK and not REALTIME_EXECUTION_TASK.done()),
    }


@app.post("/api/paper/realtime/run-once")
async def realtime_paper_run_once(request: ScannerRunRequest):
    clean_symbol = normalize_symbol(request.symbol)
    return await run_realtime_execution_once(
        symbols=[clean_symbol],
        on_result=handle_realtime_paper_execution_result,
    )


@app.get("/api/league/traders/{trader_id}/execution-events")
async def trader_execution_events(
    trader_id: str,
    request: Request,
    symbol: str = Query("BTCUSDT"),
):
    clean_symbol = normalize_symbol(symbol)
    return StreamingResponse(
        execution_event_stream(request, trader_id=trader_id, symbol=clean_symbol),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/scanner/run-once")
async def scanner_run_once(request: ScannerRunRequest):
    clean_symbol = normalize_symbol(request.symbol)
    return await run_scanner_once(
        symbols=[clean_symbol],
        provider=request.provider or settings.auto_scanner_provider,
        locale=request.locale,
    )


@app.post("/api/ai/review-demo")
async def ai_review_demo(request: RunCycleRequest, provider: Optional[str] = Query(None)):
    strategy = get_strategy("channel-rider")
    clean_symbol = normalize_symbol(request.symbol)
    requested_provider = normalize_provider(provider)
    clean_locale = normalize_locale(request.locale)
    snapshot = await build_market_snapshot(binance_client(), clean_symbol)
    candidate = strategy.evaluate(snapshot)
    if not candidate.created:
        price = float(snapshot["price"])
        entries = [
            EntryPlan(price=round_price(price * 0.998), weight=0.55, reason="Synthetic demo pullback entry"),
            EntryPlan(price=round_price(price), weight=0.45, reason="Synthetic demo confirmation entry"),
        ]
        stop = round_price(price * 0.99)
        take_profits = [
            TakeProfitPlan(price=round_price(price * 1.015), weight=0.5, reason="Synthetic 1.5% target"),
            TakeProfitPlan(price=round_price(price * 1.025), weight=0.5, reason="Synthetic 2.5% target"),
        ]
        risk_reward = estimate_risk_reward("LONG", entries, stop, take_profits)
        candidate.created = True
        candidate.side = "LONG"
        candidate.setupType = "DEMO_REVIEW_SYNTHETIC_CANDIDATE"
        candidate.setupScore = max(candidate.setupScore, 68)
        candidate.reason = None
        candidate.entries = entries
        candidate.stopLoss = stop
        candidate.takeProfits = take_profits
        candidate.riskPercent = 0.5
        candidate.orderIntent = default_order_intent("DEMO_LIMIT_REVIEW")
        candidate.leveragePlan = default_leverage_plan(
            suggested=5,
            maximum=6,
            reason="Synthetic review demo follows the service-wide 5-10x futures paper range.",
        )
        candidate.riskPlan = default_risk_plan(
            risk_percent=0.5,
            risk_reward=risk_reward,
            sizing_note="Synthetic candidate for provider integration test only.",
        )
        candidate.earlyExitRules = ["Exit early if the synthetic support level fails."]
        candidate.invalidation = "Synthetic demo invalidates below stop loss."
        candidate.notes = ["Synthetic candidate created only to test AI provider review flow."]
    with session_scope() as db:
        snapshot_record = create_market_snapshot(db, clean_symbol, snapshot)
        run_record = create_trader_run_log(
            db,
            symbol=clean_symbol,
            trader_id=strategy.profile.id,
            provider=requested_provider,
            payload={"demo": "ai_review", "requestedProvider": requested_provider, "locale": clean_locale},
        )
        candidate_record = create_candidate_trade(db, run_record.id, clean_symbol, strategy.profile.id, candidate)
        run_id = run_record.id
        snapshot_id = snapshot_record.id
        candidate_id = candidate_record.id

    with session_scope() as db:
        review_payload = TradeReviewPayload(
            trader=strategy.profile,
            symbol=clean_symbol,
            marketSnapshot=snapshot,
            candidate=candidate,
            locale=clean_locale,
            **build_trade_review_context(db, strategy.profile.id, clean_symbol),
        )
        review = await run_review_with_logging(db, review_payload, requested_provider, settings=settings)
        review.sourceLocale = clean_locale
        review_record = create_ai_review(db, run_id, clean_symbol, strategy.profile.id, review)
        await fanout_ai_translations(
            db,
            settings=settings,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=review_record.id,
            payload=from_json(review_record.payload_json) or {},
            symbol=clean_symbol,
            trader_id=strategy.profile.id,
        )
        plan = trade_plan_from_review(clean_symbol, candidate, review)
        plan_record = None
        if review.decision in {"APPROVE", "ADJUST_AND_APPROVE"}:
            plan_record = create_trade_plan(db, run_id, clean_symbol, strategy.profile.id, plan)
        plan_id = plan_record.id if plan_record else None

    with session_scope() as db:
        run_record = db.get(TraderRunLogRecord, run_id)
        update_trader_run_log(
            db,
            run_record,
            status="completed",
            payload={"candidate": candidate.model_dump(), "aiReview": review.model_dump(), "tradePlan": plan.model_dump()},
            market_snapshot_id=snapshot_id,
            candidate_trade_id=candidate_id,
            ai_review_id=review_record.id,
            trade_plan_id=plan_id,
        )
        refresh_trader_leaderboard_snapshot(db, strategy.profile.id, clean_symbol)
    return {
        "runId": run_id,
        "persisted": True,
        "recordIds": {
            "marketSnapshotId": snapshot_id,
            "runId": run_id,
            "candidateTradeId": candidate_id,
            "aiReviewId": review_record.id,
            "tradePlanId": plan_id,
        },
        "trader": strategy.profile.name,
        "symbol": clean_symbol,
        "candidate": candidate,
        "aiReview": review,
        "tradePlan": plan,
    }


@app.get("/api/runs")
async def runs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return {"runs": list_records_slim(db, TraderRunLogRecord, limit)}


@app.get("/api/runs/{run_id}")
async def run_detail(run_id: int, db: Session = Depends(get_db)):
    run = get_record(db, TraderRunLogRecord, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@app.get("/api/market-snapshots")
async def market_snapshots(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return {"marketSnapshots": list_records_slim(db, MarketSnapshotRecord, limit)}


@app.get("/api/candidate-trades")
async def candidate_trades(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {"candidateTrades": list_filtered_records(db, CandidateTradeRecord, limit=limit, symbol=symbol, trader_id=trader_id, status=status)}


@app.get("/api/trade-plans")
def trade_plans(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {"tradePlans": list_filtered_records(db, TradePlanRecord, limit=limit, symbol=symbol, trader_id=trader_id, status=status, include_payload=True)}


@app.get("/api/ai/reviews")
async def ai_reviews(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    return {
        "aiReviews": list_filtered_records(
            db,
            AIReviewRecord,
            limit=limit,
            offset=offset,
            symbol=symbol,
            trader_id=trader_id,
            status=status,
            include_payload=True,
            locale=normalize_locale(locale),
        )
    }


@app.get("/api/provider-calls")
async def provider_calls(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return {"providerCalls": list_records_slim(db, ProviderCallLogRecord, limit)}


@app.get("/api/api-calls")
async def api_calls(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return {"apiCalls": list_records_slim(db, APICallLogRecord, limit)}


@app.get("/api/paper/trader-states")
@app.get("/api/trader-states")
async def paper_trader_states(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    include_empty: bool = Query(False),
    db: Session = Depends(get_db),
):
    clean_symbol = normalize_symbol(symbol) if symbol else None
    profiles = {trader.id: trader.name for trader in list_traders()}
    state_records = db.execute(
        select(TraderStateRecord).order_by(desc(TraderStateRecord.updated_at), desc(TraderStateRecord.id)).limit(max(1, min(limit, 100)))
    ).scalars().all()
    states = []
    for state_record in state_records:
        trader_id = state_record.trader_id or ""
        if not include_empty and not has_meaningful_paper_state(db, trader_id, clean_symbol, state_record):
            continue
        state = serialize_record_slim(state_record)
        state["traderName"] = profiles.get(trader_id, trader_id)
        state["mode"] = "paper"
        state["cash"] = state.get("cashBalance")
        agent_state = db.execute(
            select(TraderAgentStateRecord).where(
                TraderAgentStateRecord.trader_id == trader_id,
                *( [TraderAgentStateRecord.symbol == clean_symbol] if clean_symbol else [] ),
            ).order_by(desc(TraderAgentStateRecord.updated_at), desc(TraderAgentStateRecord.id)).limit(1)
        ).scalar_one_or_none()
        if agent_state:
            state["agentState"] = serialize_record_slim(agent_state)
        state["openPositions"] = db.scalar(
            select(func.count()).select_from(PaperPositionRecord).where(
                PaperPositionRecord.trader_id == trader_id,
                *( [PaperPositionRecord.symbol == clean_symbol] if clean_symbol else [] ),
                PaperPositionRecord.status == "open",
            )
        )
        state["openOrders"] = db.scalar(
            select(func.count()).select_from(PaperOrderRecord).where(
                PaperOrderRecord.trader_id == trader_id,
                *( [PaperOrderRecord.symbol == clean_symbol] if clean_symbol else [] ),
                PaperOrderRecord.status == "open",
            )
        )
        states.append(state)
    return {"states": states}


@app.get("/api/paper/trader-summary")
async def paper_trader_summary(symbol: str = Query("BTCUSDT"), db: Session = Depends(get_db)):
    clean_symbol = normalize_symbol(symbol)
    return {"symbol": clean_symbol, "summaries": trader_summary_payload(db, clean_symbol)}


@app.get("/api/paper/orders")
@app.get("/api/paper-trading/orders")
def paper_orders(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    return {
        "orders": list_filtered_records(
            db,
            PaperOrderRecord,
            limit=limit,
            symbol=symbol,
            trader_id=trader_id,
            status=status,
            include_payload=True,
            locale=normalize_locale(locale),
        )
    }


@app.get("/api/paper/positions")
@app.get("/api/paper-trading/positions")
def paper_positions(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    return {
        "positions": list_filtered_records(
            db,
            PaperPositionRecord,
            limit=limit,
            symbol=symbol,
            trader_id=trader_id,
            status=status,
            include_payload=True,
            locale=normalize_locale(locale),
        )
    }


@app.get("/api/paper/positions/active")
def active_paper_positions(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    return {
        "positions": list_filtered_records(
            db,
            PaperPositionRecord,
            limit=limit,
            symbol=symbol,
            trader_id=trader_id,
            status="open",
            include_payload=True,
            locale=normalize_locale(locale),
        )
    }


@app.get("/api/paper/events")
@app.get("/api/paper-trading/events")
@app.get("/api/trade-events")
async def paper_events(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    include_payload: bool = Query(False, alias="includePayload"),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    records = list_filtered_records(
        db,
        TradeEventRecord,
        limit=limit + 1,
        offset=offset,
        symbol=symbol,
        trader_id=trader_id,
        include_payload=include_payload,
        locale=normalize_locale(locale),
    )
    page = records[:limit]
    return {
        "events": page,
        "offset": offset,
        "nextOffset": offset + len(page),
        "hasMore": len(records) > limit,
    }


@app.get("/api/trader-status-feeds")
@app.get("/api/league/status-feeds")
async def trader_status_feeds(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    return {
        "statusFeeds": list_status_feed_payloads(
            db,
            limit=limit,
            offset=offset,
            symbol=normalize_symbol(symbol) if symbol else None,
            trader_id=trader_id,
            locale=normalize_locale(locale),
        )
    }


@app.get("/api/paper/management-reviews")
@app.get("/api/position-management/reviews")
async def position_management_reviews(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    locale: str = Query(CANONICAL_AI_LOCALE),
    db: Session = Depends(get_db),
):
    return {
        "managementReviews": list_filtered_records(
            db,
            PositionManagementReviewRecord,
            limit=limit,
            offset=offset,
            symbol=symbol,
            trader_id=trader_id,
            status=status,
            include_payload=True,
            locale=normalize_locale(locale),
        )
    }


@app.get("/api/paper/agent-states")
@app.get("/api/agent-states")
async def paper_agent_states(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {
        "agentStates": list_filtered_records(
            db,
            TraderAgentStateRecord,
            limit=limit,
            symbol=symbol,
            trader_id=trader_id,
            status=status,
        )
    }


@app.get("/api/paper/equity-snapshots")
@app.get("/api/paper-trading/equity-snapshots")
@app.get("/api/equity-snapshots")
def paper_equity_snapshots(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {"snapshots": list_filtered_records(db, EquitySnapshotRecord, limit=limit, symbol=symbol, trader_id=trader_id)}


@app.get("/api/paper/risk-settings")
async def paper_risk_settings(
    limit: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = Query(None),
    trader_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {"riskSettings": list_filtered_records(db, RiskSettingsRecord, limit=limit, symbol=symbol, trader_id=trader_id)}


@app.post("/api/paper/engine/run-once")
@app.post("/api/paper-trading/engine/run-once")
@app.post("/api/engine/run-once")
async def paper_engine_run_once(request: PaperEngineRunRequest):
    clean_symbol = normalize_symbol(request.symbol)
    target_trader_id = request.traderId or request.trader_id
    valid_trader_ids = {trader.id for trader in list_traders()}
    if target_trader_id and target_trader_id not in valid_trader_ids:
        raise HTTPException(status_code=404, detail="Trader not found.")
    trader_ids = [target_trader_id] if target_trader_id else sorted(valid_trader_ids)
    candle = await latest_engine_candle(clean_symbol)
    results = []
    all_events = []
    all_snapshots = []
    filled_count = 0
    closed_count = 0
    rejected_count = 0
    management_review_count = 0
    status_feed_count = 0

    with session_scope() as db:
        for trader_id in trader_ids:
            before = list_active_paper_exposure(db, trader_id, clean_symbol)
            result_payload = engine_result_payload(None)
            management_reviews: list[dict[str, Any]] = []
            if before["hasExposure"]:
                sync_default_paper_settings(db, trader_id, clean_symbol, settings)
                result = process_candle(db, trader_id, clean_symbol, candle)
                snapshot = await build_market_snapshot(binance_client(), clean_symbol)
                management_reviews = await run_management_reviews(
                    db,
                    trader_id=trader_id,
                    symbol=clean_symbol,
                    snapshot=snapshot,
                    provider_name=settings.position_management_provider or settings.auto_scanner_provider or "mock",
                    locale=normalize_locale(request.locale),
                    result=result,
                )
                result_payload = engine_result_payload(result)
                status_feed_records = await create_status_feeds_for_trade_events(db, settings=settings, events=result.events)
                filled_count += len(result_payload["filledOrders"])
                closed_count += len(result_payload["closedPositions"])
                rejected_count += len(result_payload["rejectedOrders"])
                management_review_count += len(management_reviews)
                status_feed_count += len(status_feed_records)
                all_events.extend(result_payload["events"])
                if result_payload["equitySnapshot"]:
                    all_snapshots.append(result_payload["equitySnapshot"])
            after = list_active_paper_exposure(db, trader_id, clean_symbol)
            refresh_trader_leaderboard_snapshot(db, trader_id, clean_symbol)
            results.append(
                {
                    "traderId": trader_id,
                    "symbol": clean_symbol,
                    "hadExposure": before["hasExposure"],
                    "activeExposure": after,
                    "engine": result_payload,
                    "managementReviews": management_reviews,
                }
            )

    return {
        "status": "ok",
        "mode": "paper",
        "symbol": clean_symbol,
        "candle": candle,
        "processedTraders": len(trader_ids),
        "processedOrders": filled_count + rejected_count,
        "openedPositions": filled_count,
        "closedPositions": closed_count,
        "rejectedOrders": rejected_count,
        "managementReviews": management_review_count,
        "statusFeeds": status_feed_count,
        "events": all_events,
        "equitySnapshots": all_snapshots,
        "results": results,
    }
