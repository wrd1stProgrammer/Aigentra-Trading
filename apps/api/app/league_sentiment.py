from datetime import datetime, timedelta, timezone
from decimal import Decimal
import re
import time
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult, LeagueSentimentPayload
from app.ai.translation_cache import fanout_ai_translations, localized_payload_for_source
from app.core.config import Settings
from app.db import (
    AIReviewRecord,
    LeagueSentimentOpinionRecord,
    MarketSnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradeEventRecord,
    utc_now,
)
from app.locales import AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT, CANONICAL_AI_LOCALE, normalize_locale
from app.market.data_cache import redis_get_json, redis_set_json, shared_cache_key
from app.repositories import create_provider_call_log, from_json, sanitize_error_message, to_json
from app.traders.registry import list_traders


RECENT_TRADE_EVENT_TYPES = {
    "order_filled",
    "position_opened",
    "take_profit",
    "take_partial_profit",
    "stop_loss",
    "position_closed",
}
ACTIVE_ORDER_STATUSES = {"open", "pending", "submitted"}
ACTIVE_POSITION_STATUSES = {"open"}
BANNED_OPINION_TERMS = (
    ("페이퍼 트레이딩", "시뮬레이션"),
    ("paper-trading", "simulation"),
    ("paper trading", "simulation"),
    ("paper league", "simulation league"),
)


def current_utc_hour_window(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    base = ensure_utc(now or utc_now())
    start = base.replace(minute=0, second=0, microsecond=0)
    return start, start + timedelta(hours=1)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return ensure_utc(value).isoformat()


def league_sentiment_cache_key(symbol: str, locale: str, interval_start: datetime) -> str:
    return shared_cache_key("league_sentiment_opinion:v1", symbol.upper(), normalize_locale(locale), ensure_utc(interval_start).isoformat())


def league_sentiment_cache_ttl(interval_end: datetime, *, stale: bool = False) -> int:
    if stale:
        return 120
    seconds = int((ensure_utc(interval_end) - utc_now()).total_seconds())
    return max(60, min(seconds + 300, 7200))


async def cache_league_sentiment_payload(
    symbol: str,
    locale: str,
    interval_start: datetime,
    interval_end: datetime,
    payload: dict[str, Any],
    *,
    stale: bool = False,
) -> None:
    await redis_set_json(
        league_sentiment_cache_key(symbol, locale, interval_start),
        payload,
        league_sentiment_cache_ttl(interval_end, stale=stale),
    )


def sanitize_league_sentiment_opinion(opinion: LeagueSentimentOpinionResult) -> LeagueSentimentOpinionResult:
    return LeagueSentimentOpinionResult.model_validate(scrub_banned_opinion_terms(opinion.model_dump()))


def scrub_banned_opinion_terms(value: Any) -> Any:
    if isinstance(value, str):
        result = value
        for banned, replacement in BANNED_OPINION_TERMS:
            result = re.sub(re.escape(banned), replacement, result, flags=re.IGNORECASE)
        return result
    if isinstance(value, list):
        return [scrub_banned_opinion_terms(item) for item in value]
    if isinstance(value, dict):
        return {key: scrub_banned_opinion_terms(item) for key, item in value.items()}
    return value


async def get_or_create_league_sentiment_opinion(
    db: Session,
    *,
    symbol: str,
    locale: str,
    settings: Settings,
    force: bool = False,
    prefer_cached: bool = False,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    requested_locale = normalize_locale(locale)
    interval_start, interval_end = current_utc_hour_window(now)
    if not force:
        cached_payload = await redis_get_json(league_sentiment_cache_key(symbol, requested_locale, interval_start))
        if isinstance(cached_payload, dict):
            cached_payload["cacheHit"] = True
            return cached_payload
        existing = latest_hourly_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
        if existing is not None:
            await ensure_league_sentiment_translation(
                db,
                record=existing,
                locale=requested_locale,
                settings=settings,
            )
            serialized = serialize_league_sentiment_record(db, existing, cache_hit=True, locale=requested_locale)
            await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized)
            return serialized
        if prefer_cached:
            previous = latest_previous_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
            if previous is not None:
                await ensure_league_sentiment_translation(
                    db,
                    record=previous,
                    locale=requested_locale,
                    settings=settings,
                )
                serialized = serialize_league_sentiment_record(
                    db,
                    previous,
                    cache_hit=True,
                    locale=requested_locale,
                    stale=True,
                    next_refresh_at=interval_start,
                )
                await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized, stale=True)
                return serialized

    payload = build_league_sentiment_payload(
        db,
        symbol=symbol,
        locale=CANONICAL_AI_LOCALE,
        interval_start=interval_start,
        interval_end=interval_end,
        now=ensure_utc(now or utc_now()),
        recent_hours=max(1, int(getattr(settings, "league_sentiment_recent_hours", 24) or 24)),
    )
    provider_name = (
        getattr(settings, "league_sentiment_provider", "")
        or getattr(settings, "position_management_provider", "")
        or settings.ai_provider
        or "mock"
    )
    start = time.perf_counter()
    status = "ok"
    error_message = None
    try:
        provider = get_ai_provider(settings, provider_name)
        opinion = await provider.review_league_sentiment(payload)
        latency_ms = int((time.perf_counter() - start) * 1000)
        create_provider_call_log(
            db,
            provider=provider.name,
            model=provider.model,
            success=True,
            latency_ms=latency_ms,
            decision=opinion.bias,
            symbol=symbol,
            trader_id="aigentra-opinion",
            status="league_sentiment",
        )
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        status = "fallback"
        error_message = sanitize_error_message(str(exc))
        opinion = fallback_league_sentiment_opinion(payload)
        create_provider_call_log(
            db,
            provider=str(provider_name or "unknown"),
            model=str(getattr(settings, f"{provider_name}_model", provider_name) or provider_name),
            success=False,
            latency_ms=latency_ms,
            decision=opinion.bias,
            symbol=symbol,
            trader_id="aigentra-opinion",
            status="league_sentiment_error",
            error_message=error_message,
        )

    opinion = sanitize_league_sentiment_opinion(opinion.model_copy(update={"sourceCounts": dict(payload.sourceCounts)}))
    record = LeagueSentimentOpinionRecord(
        symbol=symbol,
        trader_id="aigentra-opinion",
        status=status,
        error_message=error_message,
        locale=CANONICAL_AI_LOCALE,
        interval_start=interval_start,
        interval_end=interval_end,
        provider=opinion.provider,
        model=opinion.model,
        bias=opinion.bias,
        confidence=opinion.confidence,
        risk_level=opinion.riskLevel,
        fallback=opinion.fallback,
        input_json=to_json(payload.model_dump()),
        payload_json=to_json(opinion.model_dump()),
        raw_json=None,
    )
    try:
        db.add(record)
        db.flush()
        await fanout_ai_translations(
            db,
            settings=settings,
            source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
            source_id=record.id,
            payload=opinion.model_dump(),
            symbol=symbol,
            trader_id="aigentra-opinion",
            target_locales=league_sentiment_translation_locales(settings, requested_locale),
        )
        from app.subscribers import notify_subscribers_for_league_sentiment_opinion

        notify_subscribers_for_league_sentiment_opinion(db, record)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = latest_hourly_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
        if existing is not None:
            await ensure_league_sentiment_translation(
                db,
                record=existing,
                locale=requested_locale,
                settings=settings,
            )
            serialized = serialize_league_sentiment_record(db, existing, cache_hit=True, locale=requested_locale)
            await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized)
            return serialized
        raise
    serialized = serialize_league_sentiment_record(db, record, cache_hit=False, locale=requested_locale)
    await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized)
    return serialized


async def ensure_league_sentiment_translation(
    db: Session,
    *,
    record: LeagueSentimentOpinionRecord,
    locale: str,
    settings: Settings,
) -> None:
    requested_locale = normalize_locale(locale)
    if requested_locale == CANONICAL_AI_LOCALE or record.id is None:
        return
    opinion = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(opinion, dict):
        return

    _, translation_meta = localized_payload_for_source(
        db,
        source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
        source_id=record.id,
        payload=opinion,
        locale=requested_locale,
    )
    if translation_meta.get("status") == "ok":
        return

    await fanout_ai_translations(
        db,
        settings=settings,
        source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
        source_id=record.id,
        payload=opinion,
        symbol=record.symbol,
        trader_id="aigentra-opinion",
        target_locales=(requested_locale,),
    )
    db.flush()
    db.commit()


def league_sentiment_translation_locales(settings: Settings, requested_locale: str) -> tuple[str, ...]:
    locales: list[str] = []
    for item in getattr(settings, "ai_translation_target_locales", []):
        locale = normalize_locale(item)
        if locale != CANONICAL_AI_LOCALE and locale not in locales:
            locales.append(locale)
    normalized_requested_locale = normalize_locale(requested_locale)
    if normalized_requested_locale != CANONICAL_AI_LOCALE and normalized_requested_locale not in locales:
        locales.append(normalized_requested_locale)
    return tuple(locales)


def latest_hourly_opinion(
    db: Session,
    symbol: str,
    locale: str,
    interval_start: datetime,
) -> Optional[LeagueSentimentOpinionRecord]:
    return db.execute(
        select(LeagueSentimentOpinionRecord)
        .where(
            LeagueSentimentOpinionRecord.symbol == symbol,
            LeagueSentimentOpinionRecord.locale == locale,
            LeagueSentimentOpinionRecord.interval_start == interval_start,
        )
        .order_by(desc(LeagueSentimentOpinionRecord.id))
    ).scalar_one_or_none()


def latest_previous_opinion(
    db: Session,
    symbol: str,
    locale: str,
    before_interval_start: datetime,
) -> Optional[LeagueSentimentOpinionRecord]:
    return db.execute(
        select(LeagueSentimentOpinionRecord)
        .where(
            LeagueSentimentOpinionRecord.symbol == symbol,
            LeagueSentimentOpinionRecord.locale == locale,
            LeagueSentimentOpinionRecord.interval_start < before_interval_start,
        )
        .order_by(desc(LeagueSentimentOpinionRecord.interval_start), desc(LeagueSentimentOpinionRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def build_league_sentiment_payload(
    db: Session,
    *,
    symbol: str,
    locale: str,
    interval_start: datetime,
    interval_end: datetime,
    now: datetime,
    recent_hours: int,
) -> LeagueSentimentPayload:
    cutoff = now - timedelta(hours=recent_hours)
    trader_names = {trader.id: trader.name for trader in list_traders()}
    active_positions = list_active_positions(db, symbol)
    pending_orders = list_pending_orders(db, symbol)
    recent_closed = list_recent_closed_positions(db, symbol, cutoff)
    recent_events = list_recent_trade_events(db, symbol, cutoff)
    entry_reviews = list_recent_entry_reviews(db, symbol, cutoff)
    management_reviews = list_recent_management_reviews(db, symbol, cutoff)
    market = latest_market_context(db, symbol)

    active_position_summaries = [summarize_position(record, trader_names) for record in active_positions]
    pending_order_summaries = [summarize_order(record, trader_names) for record in pending_orders]
    closed_position_summaries = [summarize_closed_position(record, trader_names) for record in recent_closed]
    event_summaries = [summarize_trade_event(record, trader_names) for record in recent_events]
    entry_review_summaries = [summarize_entry_review(record, trader_names) for record in entry_reviews]
    management_review_summaries = [summarize_management_review(record, trader_names) for record in management_reviews]
    counts = source_counts(
        active_position_summaries,
        pending_order_summaries,
        closed_position_summaries,
        event_summaries,
        entry_review_summaries,
        management_review_summaries,
    )
    return LeagueSentimentPayload(
        symbol=symbol,
        locale=locale,
        generatedAt=iso_utc(now) or "",
        intervalStart=iso_utc(interval_start) or "",
        intervalEnd=iso_utc(interval_end) or "",
        market=market,
        sourceCounts=counts,
        activePositions=active_position_summaries[:40],
        pendingOrders=pending_order_summaries[:40],
        recentClosedPositions=closed_position_summaries[:40],
        recentTradeEvents=event_summaries[:80],
        recentEntryReviews=entry_review_summaries[:60],
        recentManagementReviews=management_review_summaries[:60],
        longShortContext=long_short_context(active_position_summaries, pending_order_summaries),
    )


def list_active_positions(db: Session, symbol: str) -> list[PaperPositionRecord]:
    return db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status.in_(ACTIVE_POSITION_STATUSES),
        )
        .order_by(desc(PaperPositionRecord.updated_at), desc(PaperPositionRecord.opened_at), desc(PaperPositionRecord.id))
        .limit(80)
    ).scalars().all()


def list_pending_orders(db: Session, symbol: str) -> list[PaperOrderRecord]:
    return db.execute(
        select(PaperOrderRecord)
        .where(
            PaperOrderRecord.symbol == symbol,
            PaperOrderRecord.status.in_(ACTIVE_ORDER_STATUSES),
        )
        .order_by(desc(PaperOrderRecord.submitted_at), desc(PaperOrderRecord.id))
        .limit(80)
    ).scalars().all()


def list_recent_closed_positions(db: Session, symbol: str, cutoff: datetime) -> list[PaperPositionRecord]:
    return db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "closed",
            PaperPositionRecord.closed_at >= cutoff,
        )
        .order_by(desc(PaperPositionRecord.closed_at), desc(PaperPositionRecord.id))
        .limit(80)
    ).scalars().all()


def list_recent_trade_events(db: Session, symbol: str, cutoff: datetime) -> list[TradeEventRecord]:
    return db.execute(
        select(TradeEventRecord)
        .where(
            TradeEventRecord.symbol == symbol,
            TradeEventRecord.created_at >= cutoff,
            TradeEventRecord.event_type.in_(RECENT_TRADE_EVENT_TYPES),
        )
        .order_by(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id))
        .limit(120)
    ).scalars().all()


def list_recent_entry_reviews(db: Session, symbol: str, cutoff: datetime) -> list[AIReviewRecord]:
    return db.execute(
        select(AIReviewRecord)
        .where(
            AIReviewRecord.symbol == symbol,
            AIReviewRecord.created_at >= cutoff,
            AIReviewRecord.status == "ok",
            AIReviewRecord.fallback.is_(False),
        )
        .order_by(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
        .limit(100)
    ).scalars().all()


def list_recent_management_reviews(db: Session, symbol: str, cutoff: datetime) -> list[PositionManagementReviewRecord]:
    return db.execute(
        select(PositionManagementReviewRecord)
        .where(
            PositionManagementReviewRecord.symbol == symbol,
            PositionManagementReviewRecord.created_at >= cutoff,
            PositionManagementReviewRecord.status == "ok",
            PositionManagementReviewRecord.fallback.is_(False),
            PositionManagementReviewRecord.error_message.is_(None),
        )
        .order_by(desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
        .limit(100)
    ).scalars().all()


def latest_market_context(db: Session, symbol: str) -> dict[str, Any]:
    record = db.execute(
        select(MarketSnapshotRecord)
        .where(MarketSnapshotRecord.symbol == symbol)
        .order_by(desc(MarketSnapshotRecord.created_at), desc(MarketSnapshotRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    if record is None:
        return {"symbol": symbol, "price": None, "updatedAt": None, "dataAvailable": False}
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "symbol": symbol,
        "price": numeric(payload.get("price")) or numeric(record.price),
        "updatedAt": iso_utc(record.created_at),
        "dataAvailable": True,
        "marketRegime": payload.get("marketRegime") or {},
        "timeframes": compact_timeframes(payload.get("timeframes") or {}),
        "derivatives": payload.get("derivatives") or {},
    }


def compact_timeframes(timeframes: dict[str, Any]) -> dict[str, Any]:
    allowed = {"close", "ema20", "ema50", "ema200", "rsi14", "atr14", "volumeZscore", "trend", "adx14"}
    compact: dict[str, Any] = {}
    for timeframe, values in timeframes.items():
        if not isinstance(values, dict):
            continue
        compact[str(timeframe)] = {key: values.get(key) for key in allowed if values.get(key) is not None}
    return compact


def summarize_position(record: PaperPositionRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": record.id,
        "orderId": record.order_id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "side": side_label(record.side),
        "status": record.status,
        "quantity": numeric(record.quantity),
        "entryPrice": numeric(record.entry_price),
        "takeProfit": numeric(record.take_profit_price),
        "stopLoss": numeric(record.stop_loss_price),
        "leverage": numeric(record.leverage),
        "notional": numeric(record.notional),
        "margin": numeric(record.margin),
        "unrealizedPnl": numeric(record.unrealized_pnl),
        "openedAt": iso_utc(record.opened_at),
        "updatedAt": iso_utc(record.updated_at),
    }


def summarize_order(record: PaperOrderRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": record.id,
        "positionId": record.position_id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "side": side_label(record.side),
        "status": record.status,
        "orderType": record.order_type,
        "quantity": numeric(record.quantity),
        "limitPrice": numeric(record.limit_price),
        "takeProfit": numeric(record.take_profit_price),
        "stopLoss": numeric(record.stop_loss_price),
        "leverage": numeric(record.leverage),
        "notional": numeric(record.notional),
        "margin": numeric(record.margin),
        "submittedAt": iso_utc(record.submitted_at),
        "updatedAt": iso_utc(record.updated_at),
    }


def summarize_closed_position(record: PaperPositionRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "side": side_label(record.side),
        "closeReason": record.close_reason,
        "entryPrice": numeric(record.entry_price),
        "exitPrice": numeric(record.exit_price),
        "realizedPnl": numeric(record.realized_pnl),
        "leverage": numeric(record.leverage),
        "openedAt": iso_utc(record.opened_at),
        "closedAt": iso_utc(record.closed_at),
    }


def summarize_trade_event(record: TradeEventRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "eventType": record.event_type,
        "side": side_label(payload.get("side")),
        "price": numeric(record.price),
        "quantity": numeric(record.quantity),
        "realizedPnl": numeric(record.realized_pnl),
        "reason": first_text(payload, ("reason", "message", "closeReason")),
        "createdAt": iso_utc(record.created_at),
    }


def summarize_entry_review(record: AIReviewRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "decision": record.decision,
        "confidence": record.confidence,
        "riskLevel": record.risk_level,
        "headline": review_text(payload, ("headline", "approvalReason", "rationale")),
        "action": review_text(payload, ("action", "counterThesis")),
        "createdAt": iso_utc(record.created_at),
    }


def summarize_management_review(record: PositionManagementReviewRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    exposure = payload.get("exposure") if isinstance(payload.get("exposure"), dict) else {}
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "phase": record.phase,
        "decision": record.decision,
        "action": record.action_type,
        "confidence": record.confidence,
        "riskLevel": review.get("riskLevel") or payload.get("riskLevel"),
        "side": side_label(exposure.get("side")),
        "entryPrice": numeric(exposure.get("entryPrice")),
        "currentPrice": numeric(exposure.get("currentPrice")),
        "headline": review_text(review, ("headline", "rationale", "reason")),
        "nextAction": review_text(review, ("action",)),
        "createdAt": iso_utc(record.created_at),
    }


def source_counts(
    positions: list[dict[str, Any]],
    orders: list[dict[str, Any]],
    closed: list[dict[str, Any]],
    events: list[dict[str, Any]],
    entry_reviews: list[dict[str, Any]],
    management_reviews: list[dict[str, Any]],
) -> dict[str, int]:
    def count_side(records: list[dict[str, Any]], side: str) -> int:
        return sum(1 for record in records if record.get("side") == side)

    closed_take_profits = sum(1 for item in closed if closed_outcome(item) == "take_profit")
    closed_stop_losses = sum(1 for item in closed if closed_outcome(item) == "stop_loss")
    event_take_profits = sum(1 for item in events if str(item.get("eventType") or "").lower() in {"take_profit", "take_partial_profit"})
    event_stop_losses = sum(1 for item in events if str(item.get("eventType") or "").lower() == "stop_loss")
    take_profits = closed_take_profits if closed else event_take_profits
    stop_losses = closed_stop_losses if closed else event_stop_losses
    return {
        "activePositions": len(positions),
        "activeLongPositions": count_side(positions, "LONG"),
        "activeShortPositions": count_side(positions, "SHORT"),
        "pendingOrders": len(orders),
        "pendingLongOrders": count_side(orders, "LONG"),
        "pendingShortOrders": count_side(orders, "SHORT"),
        "recentClosedPositions": len(closed),
        "recentTradeEvents": len(events),
        "recentTakeProfits": take_profits,
        "recentStopLosses": stop_losses,
        "recentEntryReviews": len(entry_reviews),
        "recentApprovedEntryReviews": sum(1 for item in entry_reviews if str(item.get("decision") or "").upper() in {"APPROVE", "ADJUST_AND_APPROVE"}),
        "recentRejectedEntryReviews": sum(1 for item in entry_reviews if str(item.get("decision") or "").upper() == "REJECT"),
        "recentManagementReviews": len(management_reviews),
    }


def closed_outcome(item: dict[str, Any]) -> str:
    reason = str(item.get("closeReason") or "").lower()
    pnl = numeric(item.get("realizedPnl"))
    if reason == "take_profit" or (pnl is not None and pnl > 0):
        return "take_profit"
    if reason == "stop_loss" or (pnl is not None and pnl < 0):
        return "stop_loss"
    return "breakeven"


def long_short_context(positions: list[dict[str, Any]], orders: list[dict[str, Any]]) -> dict[str, Any]:
    long_notional = sum(float(item.get("notional") or 0) for item in positions + orders if item.get("side") == "LONG")
    short_notional = sum(float(item.get("notional") or 0) for item in positions + orders if item.get("side") == "SHORT")
    return {
        "longExposureCount": sum(1 for item in positions + orders if item.get("side") == "LONG"),
        "shortExposureCount": sum(1 for item in positions + orders if item.get("side") == "SHORT"),
        "longNotional": round(long_notional, 4),
        "shortNotional": round(short_notional, 4),
        "dominantSide": "LONG" if long_notional > short_notional else "SHORT" if short_notional > long_notional else "BALANCED",
    }


def fallback_league_sentiment_opinion(payload: LeagueSentimentPayload) -> LeagueSentimentOpinionResult:
    counts = payload.sourceCounts
    long_count = int(counts.get("activeLongPositions", 0)) + int(counts.get("pendingLongOrders", 0))
    short_count = int(counts.get("activeShortPositions", 0)) + int(counts.get("pendingShortOrders", 0))
    stop_losses = int(counts.get("recentStopLosses", 0))
    take_profits = int(counts.get("recentTakeProfits", 0))
    if stop_losses >= max(2, take_profits + 2):
        bias = "RISK_OFF"
        risk = "HIGH"
    elif long_count > short_count:
        bias = "LONG_BIASED"
        risk = "MEDIUM"
    elif short_count > long_count:
        bias = "SHORT_BIASED"
        risk = "MEDIUM"
    elif long_count or short_count:
        bias = "MIXED"
        risk = "MEDIUM"
    else:
        bias = "NEUTRAL"
        risk = "LOW"
    ko = payload.locale.lower().startswith("ko")
    return LeagueSentimentOpinionResult(
        bias=bias,
        confidence=45 if bias in {"NEUTRAL", "MIXED"} else 58,
        riskLevel=risk,
        headline="현재 시간대 종합 의견을 보수적으로 정리했습니다." if ko else "The current hourly opinion was built conservatively.",
        summary=(
            f"활성/대기 기준 LONG {long_count}건, SHORT {short_count}건입니다. "
            "AI 상세 해석 대신 검증된 DB 집계만 사용했으므로 방향 판단보다 리스크 확인에 초점을 둡니다."
            if ko
            else f"Current active/pending context has LONG {long_count} versus SHORT {short_count}. "
            "Only verified database counts were used, so treat this as risk context rather than a strong directional call."
        ),
        keyDrivers=[
            f"LONG {long_count}건 / SHORT {short_count}건" if ko else f"LONG {long_count} / SHORT {short_count}",
            f"최근 익절 {take_profits}건 / 손절 {stop_losses}건" if ko else f"Recent TP {take_profits} / SL {stop_losses}",
        ],
        risks=["모델 상세 해석 없이 집계 기반으로만 표시됩니다." if ko else "Shown from aggregate counts without model-level interpretation."],
        watchConditions=["다음 UTC 정시 갱신 때 활성 방향과 손절/익절 변화 확인" if ko else "Check active direction and TP/SL changes at the next UTC hourly refresh."],
        action="새 포지션보다 기존 활성 셋업의 무효화 조건을 먼저 확인하세요." if ko else "Prioritize invalidation checks on active setups before chasing new direction.",
        longShortContext=f"LONG {long_count} / SHORT {short_count}",
        sourceCounts=dict(counts),
        provider="system",
        model="safe-hourly-fallback",
        fallback=True,
    )


def serialize_league_sentiment_record(
    db: Session,
    record: LeagueSentimentOpinionRecord,
    *,
    cache_hit: bool,
    locale: str,
    stale: bool = False,
    next_refresh_at: Optional[datetime] = None,
) -> dict[str, Any]:
    opinion = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(opinion, dict):
        opinion = {}
    localized_opinion, translation_meta = localized_payload_for_source(
        db,
        source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
        source_id=record.id,
        payload=opinion,
        locale=locale,
    )
    if isinstance(localized_opinion, dict):
        localized_opinion = dict(localized_opinion)
        localized_opinion.pop("dataQuality", None)
    return {
        "id": record.id,
        "symbol": record.symbol,
        "locale": locale,
        "sourceLocale": record.locale,
        "status": record.status,
        "intervalStart": iso_utc(record.interval_start),
        "intervalEnd": iso_utc(record.interval_end),
        "createdAt": iso_utc(record.created_at),
        "updatedAt": iso_utc(record.updated_at),
        "cacheHit": cache_hit,
        "stale": stale,
        "nextRefreshAt": iso_utc(next_refresh_at or record.interval_end),
        "translation": translation_meta,
        "opinion": localized_opinion,
    }


def numeric(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def side_label(value: Any) -> Optional[str]:
    normalized = str(value or "").strip().upper()
    if normalized in {"LONG", "BUY"}:
        return "LONG"
    if normalized in {"SHORT", "SELL"}:
        return "SHORT"
    return normalized or None


def first_text(source: dict[str, Any], keys: tuple[str, ...]) -> Optional[str]:
    for key in keys:
        value = source.get(key)
        if value not in {None, ""}:
            return str(value)
    return None


def review_text(payload: dict[str, Any], keys: tuple[str, ...]) -> Optional[str]:
    structured = payload.get("structuredReview") if isinstance(payload.get("structuredReview"), dict) else {}
    for key in keys:
        value = structured.get(key)
        if value not in {None, ""}:
            return str(value)
    return first_text(payload, keys)
