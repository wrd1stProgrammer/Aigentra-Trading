import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional, Type

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import (
    AIReviewRecord,
    APICallLogRecord,
    CandidateTradeRecord,
    MarketSnapshotRecord,
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
