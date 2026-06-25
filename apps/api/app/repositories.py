import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, Type

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import (
    AIReviewRecord,
    AITranslationCacheRecord,
    APICallLogRecord,
    CandidateTradeRecord,
    FirstStageAuditReportRecord,
    MarketSnapshotRecord,
    ObservationCandidateRecord,
    PositionManagementReviewRecord,
    ProviderCallLogRecord,
    TradePlanRecord,
    TraderAgentStateRecord,
    TraderRunLogRecord,
    utc_now,
)


def to_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def from_json(value: Optional[str]) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def model_payload(data: Any) -> dict:
    if data is None:
        return {}
    if hasattr(data, "model_dump"):
        return data.model_dump()
    return dict(data)


def pick_existing(source: dict, keys: tuple[str, ...]) -> dict:
    return {key: source[key] for key in keys if source.get(key) is not None}


def compact_market_snapshot_payload(payload: dict) -> dict:
    timeframe_keys = ("close", "ema20", "ema50", "rsi14", "atr14", "volumeZscore", "trend")
    compact_timeframes = {
        timeframe: pick_existing(values, timeframe_keys)
        for timeframe, values in (payload.get("timeframes") or {}).items()
        if isinstance(values, dict)
    }
    derivatives = payload.get("derivatives") or {}
    return {
        "storagePolicy": "compact_market_snapshot_v1",
        "symbol": payload.get("symbol"),
        "price": payload.get("price"),
        "intervals": payload.get("intervals", []),
        "timeframes": compact_timeframes,
        "derivatives": pick_existing(derivatives, ("openInterest", "fundingRate", "markPrice", "indexPrice")),
        "marketRegime": pick_existing(
            payload.get("marketRegime") or {},
            ("primary", "adx1h", "adx4h", "volumeZscore15m", "priceChange1h"),
        ),
    }


def compact_candidate_payload(payload: Optional[dict]) -> Optional[dict]:
    if payload is None:
        return None
    compact = pick_existing(payload, ("created", "reason", "side", "setupType", "setupScore", "riskPercent"))
    if payload.get("entries"):
        compact["entryCount"] = len(payload.get("entries") or [])
    if payload.get("takeProfits"):
        compact["takeProfitCount"] = len(payload.get("takeProfits") or [])
    return compact


def compact_observation_payload(payload: Optional[dict]) -> Optional[dict]:
    if payload is None:
        return None
    compact = pick_existing(
        payload,
        (
            "created",
            "reason",
            "side",
            "setupType",
            "setupScore",
            "observationType",
            "holdingProfile",
            "timeHorizon",
            "riskPercent",
        ),
    )
    if payload.get("audit"):
        audit = payload.get("audit") or {}
        compact["audit"] = {
            "reasonCode": audit.get("reasonCode"),
            "gateScores": audit.get("gateScores") or {},
            "executionProfile": audit.get("executionProfile") or {},
        }
    return compact


def compact_ai_review_payload(payload: Optional[dict]) -> Optional[dict]:
    if payload is None:
        return None
    return pick_existing(payload, ("decision", "confidence", "riskLevel", "provider", "model", "fallback"))


def compact_trade_plan_payload(payload: Optional[dict]) -> Optional[dict]:
    if payload is None:
        return None
    compact = pick_existing(payload, ("status", "side", "riskPercent"))
    if payload.get("entries"):
        compact["entryCount"] = len(payload.get("entries") or [])
    if payload.get("takeProfits"):
        compact["takeProfitCount"] = len(payload.get("takeProfits") or [])
    return compact


def compact_paper_payload(payload: Optional[dict]) -> Optional[dict]:
    if payload is None:
        return None
    after = payload.get("after") or {}
    engine = payload.get("engine") or {}
    orders_created = payload.get("ordersCreated") or {}
    return {
        "openOrderCount": len(after.get("openOrders") or []),
        "openPositionCount": len(after.get("openPositions") or []),
        "createdOrderCount": len(orders_created.get("created") or []),
        "eventCount": len(engine.get("events") or []),
        "managementReviewCount": len(payload.get("managementReviews") or []),
    }


def compact_trader_run_payload(payload: Optional[dict]) -> dict:
    payload = payload or {}
    compact = {
        "storagePolicy": "compact_trader_run_log_v1",
        "trader": payload.get("trader"),
        "symbol": payload.get("symbol"),
        "requestedProvider": payload.get("requestedProvider"),
        "locale": payload.get("locale"),
        "candidate": compact_candidate_payload(payload.get("candidate")),
        "aiReview": compact_ai_review_payload(payload.get("aiReview")),
        "tradePlan": compact_trade_plan_payload(payload.get("tradePlan")),
        "paper": compact_paper_payload(payload.get("paper")),
    }
    if payload.get("cooldown"):
        compact["cooldown"] = payload.get("cooldown")
    if payload.get("recordIds"):
        compact["recordIds"] = payload.get("recordIds")
    return {key: value for key, value in compact.items() if value is not None}


def sanitize_error_message(message: Optional[str]) -> Optional[str]:
    if not message:
        return message
    clean = re.sub(r"([?&]key=)[^\s'\"&]+", r"\1[REDACTED]", message)
    clean = re.sub(r"(api[_-]?key['\"=: ]+)[^\s'\",}]+", r"\1[REDACTED]", clean, flags=re.IGNORECASE)
    clean = re.sub(r"(Bearer\s+)[A-Za-z0-9._\-]+", r"\1[REDACTED]", clean)
    return clean


def snake_to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


def json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    return value


def _as_decimal(value: Any, default: Decimal) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except Exception:
        return default
    return parsed if parsed.is_finite() else default


def serialize_record(record) -> dict:
    data = {column.name: json_safe(getattr(record, column.name)) for column in record.__table__.columns}
    for key, value in list(data.items()):
        data.setdefault(snake_to_camel(key), value)
    data["payload"] = from_json(data.get("payload_json"))
    data["raw"] = from_json(data.get("raw_json"))
    return data


def create_market_snapshot(db: Session, symbol: str, payload: dict, status: str = "ok", error_message: Optional[str] = None) -> MarketSnapshotRecord:
    compact_payload = compact_market_snapshot_payload(payload)
    record = MarketSnapshotRecord(
        symbol=symbol,
        status=status,
        error_message=sanitize_error_message(error_message),
        price=payload.get("price"),
        payload_json=to_json(compact_payload),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def create_trader_run_log(db: Session, symbol: str, trader_id: str, provider: str, status: str = "running", payload: Optional[dict] = None, error_message: Optional[str] = None) -> TraderRunLogRecord:
    record = TraderRunLogRecord(
        symbol=symbol,
        trader_id=trader_id,
        provider=provider,
        status=status,
        error_message=sanitize_error_message(error_message),
        payload_json=to_json(compact_trader_run_payload(payload)),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def update_trader_run_log(
    db: Session,
    run: TraderRunLogRecord,
    status: str,
    payload: Optional[dict] = None,
    error_message: Optional[str] = None,
    market_snapshot_id: Optional[int] = None,
    candidate_trade_id: Optional[int] = None,
    ai_review_id: Optional[int] = None,
    trade_plan_id: Optional[int] = None,
) -> TraderRunLogRecord:
    run.status = status
    run.error_message = sanitize_error_message(error_message)
    if payload is not None:
        run.payload_json = to_json(compact_trader_run_payload(payload))
        run.raw_json = None
    if market_snapshot_id is not None:
        run.market_snapshot_id = market_snapshot_id
    if candidate_trade_id is not None:
        run.candidate_trade_id = candidate_trade_id
    if ai_review_id is not None:
        run.ai_review_id = ai_review_id
    if trade_plan_id is not None:
        run.trade_plan_id = trade_plan_id
    db.flush()
    return run


def create_candidate_trade(db: Session, run_id: int, symbol: str, trader_id: str, candidate: Any) -> CandidateTradeRecord:
    payload = model_payload(candidate)
    record = CandidateTradeRecord(
        run_id=run_id,
        symbol=symbol,
        trader_id=trader_id,
        status="created" if payload.get("created") else "not_created",
        error_message=sanitize_error_message(payload.get("reason")),
        setup_type=payload.get("setupType"),
        side=payload.get("side"),
        setup_score=payload.get("setupScore"),
        payload_json=to_json(payload),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def create_first_stage_audit_report(
    db: Session,
    *,
    symbol: str,
    scanner_started_at: Optional[datetime],
    scanner_finished_at: Optional[datetime],
    market_regime: Optional[str],
    counts: dict,
    results: list[dict],
    status: str = "ok",
) -> FirstStageAuditReportRecord:
    compact_results = []
    for result in results:
        if result.get("symbol") != symbol:
            continue
        compact_results.append(
            pick_existing(
                result,
                (
                    "traderId",
                    "status",
                    "candidateCreated",
                    "candidateReason",
                    "setupScore",
                    "aiDecision",
                    "openOrders",
                    "openPositions",
                ),
            )
        )
    candidate_ready_count = sum(
        1
        for row in compact_results
        if row.get("status") in {"CANDIDATE_READY", "PAPER_TRADING_PENDING"}
        or row.get("aiDecision") in {"APPROVE", "ADJUST_AND_APPROVE", "APPROVED"}
    )
    observe_only_count = sum(
        1
        for row in compact_results
        if row.get("candidateCreated") is False and int(row.get("setupScore") or 0) >= 50
    )
    no_trade_count = sum(1 for row in compact_results if row.get("status") == "NO_CANDIDATE")
    ai_rejected_count = sum(1 for row in compact_results if row.get("aiDecision") in {"REJECT", "DEFER", "NEEDS_MORE_DATA"})
    cooldown_count = sum(1 for row in compact_results if str(row.get("status") or "").endswith("_COOLDOWN"))
    active_exposure_count = sum(1 for row in compact_results if row.get("status") == "ACTIVE_PAPER_EXPOSURE")
    payload = {
        "storagePolicy": "compact_first_stage_audit_v1",
        "counts": counts,
        "results": compact_results,
    }
    record = FirstStageAuditReportRecord(
        symbol=symbol,
        status=status,
        scanner_started_at=scanner_started_at,
        scanner_finished_at=scanner_finished_at,
        market_regime=market_regime,
        total_traders=len(compact_results),
        candidate_ready_count=candidate_ready_count,
        observe_only_count=observe_only_count,
        no_trade_count=no_trade_count,
        ai_rejected_count=ai_rejected_count,
        cooldown_count=cooldown_count,
        active_exposure_count=active_exposure_count,
        payload_json=to_json(payload),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def create_observation_candidate(
    db: Session,
    *,
    symbol: str,
    trader_id: str,
    candidate: Any,
    observation_type: str,
    run_id: Optional[int] = None,
    candidate_trade_id: Optional[int] = None,
    ai_review_id: Optional[int] = None,
    decision: Optional[str] = None,
    status: str = "observing",
    payload: Optional[dict] = None,
) -> ObservationCandidateRecord:
    candidate_payload = model_payload(candidate)
    entries = candidate_payload.get("entries") or []
    take_profits = candidate_payload.get("takeProfits") or []
    record = ObservationCandidateRecord(
        run_id=run_id,
        candidate_trade_id=candidate_trade_id,
        ai_review_id=ai_review_id,
        symbol=symbol,
        trader_id=trader_id,
        status=status,
        error_message=sanitize_error_message(candidate_payload.get("reason")),
        observation_type=observation_type,
        side=candidate_payload.get("side"),
        setup_type=candidate_payload.get("setupType"),
        setup_score=candidate_payload.get("setupScore"),
        decision=decision,
        entry_price=entries[0].get("price") if entries and isinstance(entries[0], dict) else None,
        stop_loss=candidate_payload.get("stopLoss"),
        first_take_profit=take_profits[0].get("price") if take_profits and isinstance(take_profits[0], dict) else None,
        outcome_status="pending",
        payload_json=to_json(
            {
                "candidate": compact_observation_payload(candidate_payload),
                "context": payload or {},
            }
        ),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def update_observation_candidate_outcome_for_position(db: Session, position: Any, close_reason: str, exit_price: Any) -> Optional[ObservationCandidateRecord]:
    payload = from_json(getattr(position, "payload_json", None)) or {}
    run_id = payload.get("runId")
    ai_review_id = payload.get("aiReviewId")
    if run_id is None and ai_review_id is None:
        return None

    stmt = select(ObservationCandidateRecord).where(
        ObservationCandidateRecord.trader_id == getattr(position, "trader_id", None),
        ObservationCandidateRecord.symbol == getattr(position, "symbol", None),
    )
    if ai_review_id is not None:
        stmt = stmt.where(ObservationCandidateRecord.ai_review_id == int(ai_review_id))
    elif run_id is not None:
        stmt = stmt.where(ObservationCandidateRecord.run_id == int(run_id))
    record = db.execute(
        stmt.order_by(desc(ObservationCandidateRecord.created_at), desc(ObservationCandidateRecord.id)).limit(1)
    ).scalar_one_or_none()
    if record is None:
        return None

    entry_price = _as_decimal(getattr(position, "entry_price", None), Decimal("0"))
    stop_loss = _as_decimal(getattr(position, "stop_loss_price", None), Decimal("0"))
    exit_value = _as_decimal(exit_price, Decimal("0"))
    risk = abs(entry_price - stop_loss)
    if risk > 0 and exit_value > 0:
        if str(getattr(position, "side", "") or "").lower() == "short":
            outcome_r = (entry_price - exit_value) / risk
        else:
            outcome_r = (exit_value - entry_price) / risk
        record.outcome_r = float(outcome_r)
    record.outcome_status = close_reason or "closed"
    record.outcome_recorded_at = utc_now()
    context = from_json(record.payload_json) or {}
    context["outcome"] = {
        "status": record.outcome_status,
        "r": record.outcome_r,
        "positionId": getattr(position, "id", None),
        "closeReason": close_reason,
    }
    record.payload_json = to_json(context)
    db.flush()
    return record


def create_ai_review(db: Session, run_id: int, symbol: str, trader_id: str, review: Any, status: str = "ok", error_message: Optional[str] = None) -> AIReviewRecord:
    payload = model_payload(review)
    record = AIReviewRecord(
        run_id=run_id,
        symbol=symbol,
        trader_id=trader_id,
        status=status,
        error_message=sanitize_error_message(error_message),
        provider=payload.get("provider"),
        model=payload.get("model"),
        decision=payload.get("decision"),
        confidence=payload.get("confidence"),
        risk_level=payload.get("riskLevel"),
        fallback=bool(payload.get("fallback")),
        payload_json=to_json(payload),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def create_trade_plan(db: Session, run_id: int, symbol: str, trader_id: str, plan: Any) -> TradePlanRecord:
    payload = model_payload(plan)
    record = TradePlanRecord(
        run_id=run_id,
        symbol=symbol,
        trader_id=trader_id,
        status=payload.get("status", "unknown"),
        side=payload.get("side"),
        risk_percent=payload.get("riskPercent"),
        payload_json=to_json(payload),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def create_api_call_log(db: Session, endpoint: str, method: str, status: str, latency_ms: Optional[int] = None, symbol: Optional[str] = None, trader_id: Optional[str] = None, payload: Optional[dict] = None, error_message: Optional[str] = None) -> APICallLogRecord:
    record = APICallLogRecord(
        endpoint=endpoint,
        method=method,
        status=status,
        latency_ms=latency_ms,
        symbol=symbol,
        trader_id=trader_id,
        payload_json=to_json(payload or {}),
        error_message=sanitize_error_message(error_message),
    )
    db.add(record)
    db.flush()
    return record


def create_provider_call_log(db: Session, provider: str, model: str, success: bool, latency_ms: int, decision: Optional[str] = None, symbol: Optional[str] = None, trader_id: Optional[str] = None, status: Optional[str] = None, error_message: Optional[str] = None) -> ProviderCallLogRecord:
    safe_payload = {
        "provider": provider,
        "model": model,
        "success": success,
        "latency_ms": latency_ms,
        "decision": decision,
    }
    record = ProviderCallLogRecord(
        provider=provider,
        model=model,
        success=success,
        latency_ms=latency_ms,
        decision=decision,
        symbol=symbol,
        trader_id=trader_id,
        status=status or ("ok" if success else "error"),
        error_message=sanitize_error_message(error_message),
        payload_json=to_json(safe_payload),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    return record


def get_translation_cache_record(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    source_hash: str,
    locale: str,
) -> Optional[AITranslationCacheRecord]:
    return db.execute(
        select(AITranslationCacheRecord).where(
            AITranslationCacheRecord.source_type == source_type,
            AITranslationCacheRecord.source_id == source_id,
            AITranslationCacheRecord.source_hash == source_hash,
            AITranslationCacheRecord.locale == locale,
        )
    ).scalar_one_or_none()


def get_successful_translation_by_hash(
    db: Session,
    *,
    source_type: str,
    source_hash: str,
    locale: str,
) -> Optional[AITranslationCacheRecord]:
    return db.execute(
        select(AITranslationCacheRecord)
        .where(
            AITranslationCacheRecord.source_type == source_type,
            AITranslationCacheRecord.source_hash == source_hash,
            AITranslationCacheRecord.locale == locale,
            AITranslationCacheRecord.status == "ok",
        )
        .order_by(desc(AITranslationCacheRecord.updated_at), desc(AITranslationCacheRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def get_latest_successful_translation_for_source(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    locale: str,
) -> Optional[AITranslationCacheRecord]:
    return db.execute(
        select(AITranslationCacheRecord)
        .where(
            AITranslationCacheRecord.source_type == source_type,
            AITranslationCacheRecord.source_id == source_id,
            AITranslationCacheRecord.locale == locale,
            AITranslationCacheRecord.status == "ok",
        )
        .order_by(desc(AITranslationCacheRecord.updated_at), desc(AITranslationCacheRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def upsert_translation_cache_record(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    source_hash: str,
    locale: str,
    status: str,
    payload: dict,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    symbol: Optional[str] = None,
    trader_id: Optional[str] = None,
    raw: Optional[dict] = None,
    error_message: Optional[str] = None,
) -> AITranslationCacheRecord:
    record = get_translation_cache_record(
        db,
        source_type=source_type,
        source_id=source_id,
        source_hash=source_hash,
        locale=locale,
    )
    if record is None:
        record = AITranslationCacheRecord(
            source_type=source_type,
            source_id=source_id,
            source_hash=source_hash,
            locale=locale,
        )
        db.add(record)
    record.status = status
    record.updated_at = utc_now()
    record.provider = provider
    record.model = model
    record.symbol = symbol
    record.trader_id = trader_id
    record.payload_json = to_json(payload)
    record.raw_json = to_json(raw) if raw is not None else None
    record.error_message = sanitize_error_message(error_message)
    db.flush()
    return record


def create_position_management_review(
    db: Session,
    *,
    symbol: str,
    trader_id: str,
    event: Any,
    exposure: Any,
    review: Any,
    status: str = "ok",
    error_message: Optional[str] = None,
    applied_actions: Optional[list] = None,
    notify: bool = True,
) -> PositionManagementReviewRecord:
    event_payload = model_payload(event)
    exposure_payload = model_payload(exposure)
    review_payload = model_payload(review)
    actions = review_payload.get("actions") or []
    primary_action = actions[0].get("type") if actions and isinstance(actions[0], dict) else review_payload.get("decision")
    record = PositionManagementReviewRecord(
        symbol=symbol,
        trader_id=trader_id,
        status=status,
        error_message=sanitize_error_message(error_message),
        order_id=exposure_payload.get("id") if exposure_payload.get("kind") == "order" else None,
        position_id=exposure_payload.get("id") if exposure_payload.get("kind") == "position" else None,
        event_type=event_payload.get("eventType"),
        phase=event_payload.get("phase"),
        provider=review_payload.get("provider"),
        model=review_payload.get("model"),
        decision=review_payload.get("decision"),
        confidence=review_payload.get("confidence"),
        action_type=primary_action,
        fallback=bool(review_payload.get("fallback")),
        payload_json=to_json(
            {
                "event": event_payload,
                "exposure": exposure_payload,
                "review": review_payload,
                "appliedActions": applied_actions or [],
            }
        ),
        raw_json=None,
    )
    db.add(record)
    db.flush()
    if notify:
        from app.subscribers import notify_subscribers_for_management_review

        notify_subscribers_for_management_review(db, record)
    return record


def upsert_trader_agent_state(
    db: Session,
    *,
    symbol: str,
    trader_id: str,
    phase: str,
    mode: str,
    next_review_at: Optional[datetime] = None,
    last_review_id: Optional[int] = None,
    last_event_type: Optional[str] = None,
    last_decision: Optional[str] = None,
    last_action_type: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    payload: Optional[dict] = None,
    status: str = "active",
) -> TraderAgentStateRecord:
    record = db.execute(
        select(TraderAgentStateRecord).where(
            TraderAgentStateRecord.trader_id == trader_id,
            TraderAgentStateRecord.symbol == symbol,
        )
    ).scalar_one_or_none()
    if record is None:
        record = TraderAgentStateRecord(symbol=symbol, trader_id=trader_id)
        db.add(record)
    record.status = status
    record.updated_at = utc_now()
    record.phase = phase
    record.mode = mode
    record.next_review_at = next_review_at
    record.last_review_id = last_review_id
    record.last_event_type = last_event_type
    record.last_decision = last_decision
    record.last_action_type = last_action_type
    record.provider = provider
    record.model = model
    if payload is not None:
        record.payload_json = to_json(payload)
        record.raw_json = None
    db.flush()
    return record


def list_records(db: Session, model: Type, limit: int = 20) -> list:
    safe_limit = max(1, min(limit, 100))
    records = db.execute(select(model).order_by(desc(model.created_at), desc(model.id)).limit(safe_limit)).scalars().all()
    return [serialize_record(record) for record in records]


def get_record(db: Session, model: Type, record_id: int) -> Optional[dict]:
    record = db.get(model, record_id)
    return serialize_record(record) if record else None


def prune_trader_database(db: Session, trader_id: str, symbol: str) -> None:
    # Disable database pruning/deletion policy per user request
    return
    from app.db import (
        TraderRunLogRecord,
        TradePlanRecord,
        CandidateTradeRecord,
        AIReviewRecord,
        PositionManagementReviewRecord,
        PaperOrderRecord,
        PaperPositionRecord,
        TradeEventRecord,
        EquitySnapshotRecord,
        TelegramAlertDeliveryRecord
    )
    from sqlalchemy import update, delete
    
    # 1. Prune EquitySnapshots: keep all from today, keep only latest per day for past days
    snapshots = db.execute(
        select(EquitySnapshotRecord)
        .where(
            EquitySnapshotRecord.trader_id == trader_id,
            EquitySnapshotRecord.symbol == symbol
        )
        .order_by(desc(EquitySnapshotRecord.created_at))
    ).scalars().all()
    
    if snapshots:
        today_date = utc_now().date()
        daily_best = {}  # date -> snapshot
        to_keep = set()
        
        for snap in snapshots:
            snap_time = snap.candle_time or snap.created_at
            if not snap_time:
                continue
            snap_date = snap_time.date()
            if snap_date == today_date:
                to_keep.add(snap.id)
            else:
                if snap_date not in daily_best:
                    daily_best[snap_date] = snap
                    to_keep.add(snap.id)
        
        for snap in snapshots:
            if snap.id not in to_keep:
                db.delete(snap)

    # 2. Prune paper positions (keep latest 30 closed)
    pos_stmt = select(PaperPositionRecord).where(
        PaperPositionRecord.trader_id == trader_id,
        PaperPositionRecord.symbol == symbol,
        PaperPositionRecord.status != "open"
    ).order_by(desc(PaperPositionRecord.created_at), desc(PaperPositionRecord.id))
    closed_positions = db.execute(pos_stmt).scalars().all()
    if len(closed_positions) > 30:
        pos_ids_to_del = [pos.id for pos in closed_positions[30:]]
        db.execute(
            update(TradeEventRecord)
            .where(TradeEventRecord.position_id.in_(pos_ids_to_del))
            .values(position_id=None)
        )
        db.execute(
            update(PositionManagementReviewRecord)
            .where(PositionManagementReviewRecord.position_id.in_(pos_ids_to_del))
            .values(position_id=None)
        )
        for pos in closed_positions[30:]:
            db.delete(pos)

    # 3. Prune paper orders (keep latest 30 non-open)
    ord_stmt = select(PaperOrderRecord).where(
        PaperOrderRecord.trader_id == trader_id,
        PaperOrderRecord.symbol == symbol,
        PaperOrderRecord.status != "open"
    ).order_by(desc(PaperOrderRecord.created_at), desc(PaperOrderRecord.id))
    closed_orders = db.execute(ord_stmt).scalars().all()
    if len(closed_orders) > 30:
        ord_ids_to_del = [o.id for o in closed_orders[30:]]
        db.execute(
            update(PaperPositionRecord)
            .where(PaperPositionRecord.order_id.in_(ord_ids_to_del))
            .values(order_id=None)
        )
        db.execute(
            update(TradeEventRecord)
            .where(TradeEventRecord.order_id.in_(ord_ids_to_del))
            .values(order_id=None)
        )
        db.execute(
            update(PositionManagementReviewRecord)
            .where(PositionManagementReviewRecord.order_id.in_(ord_ids_to_del))
            .values(order_id=None)
        )
        for o in closed_orders[30:]:
            db.delete(o)

    # 4. Prune trade events (keep latest 30)
    ev_stmt = select(TradeEventRecord).where(
        TradeEventRecord.trader_id == trader_id,
        TradeEventRecord.symbol == symbol
    ).order_by(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id))
    events = db.execute(ev_stmt).scalars().all()
    if len(events) > 30:
        ev_ids_to_del = [ev.id for ev in events[30:]]
        db.execute(
            delete(TelegramAlertDeliveryRecord)
            .where(TelegramAlertDeliveryRecord.trade_event_id.in_(ev_ids_to_del))
        )
        for ev in events[30:]:
            db.delete(ev)

    # 5. Prune trader run logs (keep latest 30)
    run_stmt = select(TraderRunLogRecord).where(
        TraderRunLogRecord.trader_id == trader_id,
        TraderRunLogRecord.symbol == symbol
    ).order_by(desc(TraderRunLogRecord.created_at), desc(TraderRunLogRecord.id))
    runs = db.execute(run_stmt).scalars().all()
    if len(runs) > 30:
        run_ids_to_del = [r.id for r in runs[30:]]
        db.execute(update(CandidateTradeRecord).where(CandidateTradeRecord.run_id.in_(run_ids_to_del)).values(run_id=None))
        db.execute(update(AIReviewRecord).where(AIReviewRecord.run_id.in_(run_ids_to_del)).values(run_id=None))
        db.execute(update(TradePlanRecord).where(TradePlanRecord.run_id.in_(run_ids_to_del)).values(run_id=None))
        for r in runs[30:]:
            db.delete(r)

    # 6. Prune simpler tables
    def prune_simple_table(model, limit=30, status_filter=None):
        stmt = select(model).where(
            model.trader_id == trader_id,
            model.symbol == symbol
        )
        if status_filter is not None:
            stmt = stmt.where(status_filter)
        stmt = stmt.order_by(desc(model.created_at), desc(model.id))
        records = db.execute(stmt).scalars().all()
        if len(records) > limit:
            for record in records[limit:]:
                db.delete(record)

    prune_simple_table(CandidateTradeRecord, limit=30)
    prune_simple_table(AIReviewRecord, limit=30)
    prune_simple_table(PositionManagementReviewRecord, limit=30)
    prune_simple_table(TradePlanRecord, limit=30, status_filter=(TradePlanRecord.status != "ACTIVE_PAPER_EXPOSURE"))
    
    db.flush()
