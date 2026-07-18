from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.ai.context import account_state_context, active_exposure_context, recent_trade_events_context
from app.db import (
    AIReviewRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TraderStatusFeedRecord,
    utc_now,
)
from app.repositories import from_json, serialize_record
from app.traders.models import TraderProfile


LIFECYCLE_ACTIONS = {
    "order_filled": "open",
    "position_entry_active": "hold",
    "position_closed": "close",
    "position_reduced_by_ai": "reduce",
    "take_partial_profit": "reduce",
    "position_add_order_created_by_ai": "add",
    "position_pyramid_order_created_by_ai": "add",
    "order_adjusted_by_ai": "adjust",
    "order_canceled_by_ai": "cancel",
    "order_expired_by_ai": "expire",
    "stop_updated_by_ai": "protect",
    "stop_moved_to_breakeven": "protect",
    "stop_moved_to_take_profit": "protect",
    "ai_review_rejected": "reject",
    "no_setup_heartbeat": "wait",
}


def aware_utc(value: datetime | None) -> datetime:
    if value is None:
        return utc_now()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def payload_from_record(record: Any) -> dict[str, Any]:
    parsed = from_json(getattr(record, "payload_json", None))
    return parsed if isinstance(parsed, dict) else {}


def review_summary(record: AIReviewRecord) -> dict[str, Any]:
    payload = payload_from_record(record)
    structured = payload.get("structuredReview") if isinstance(payload.get("structuredReview"), dict) else {}
    summary = {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "decision": record.decision,
        "confidence": record.confidence,
        "riskLevel": record.risk_level,
        "reviewCode": payload.get("reviewCode"),
        "approvalReason": payload.get("approvalReason"),
        "counterThesis": payload.get("counterThesis"),
        "headline": structured.get("headline"),
        "action": structured.get("action"),
    }
    summary.update(structured_review_summary(structured))
    return summary


def build_status_feed_semantic_context(
    db: Session,
    profile: TraderProfile,
    *,
    state_key: str,
    event_type: str,
    trigger: dict[str, Any],
) -> dict[str, Any]:
    nested_entity = next(
        (trigger[key] for key in ("position", "order", "event", "review") if isinstance(trigger.get(key), dict)),
        None,
    )
    entity = nested_entity or trigger
    payload = entity.get("payload") if isinstance(entity.get("payload"), dict) else {}
    linked_entity: dict[str, Any] = {}
    if nested_entity is not None:
        position_id = entity.get("positionId") or entity.get("position_id")
        order_id = entity.get("orderId") or entity.get("order_id")
        linked_record = db.get(PaperPositionRecord, int(position_id)) if position_id is not None else None
        if linked_record is None and order_id is not None:
            linked_record = db.get(PaperOrderRecord, int(order_id))
        if linked_record is not None:
            linked_entity = serialize_record(linked_record)
    linked_payload = linked_entity.get("payload") if isinstance(linked_entity.get("payload"), dict) else {}
    management_plan = next(
        (
            source["managementPlan"]
            for source in (payload, linked_payload, trigger)
            if isinstance(source.get("managementPlan"), dict)
        ),
        {},
    )
    result: dict[str, Any] = {
        "stateKey": state_key,
        "eventType": event_type,
        "lifecycleAction": LIFECYCLE_ACTIONS.get(event_type, "update"),
        "holdingHorizon": str(management_plan.get("holdingHorizon") or profile.holdingHorizon.value).upper(),
        "strategyFamily": str(management_plan.get("strategyFamily") or profile.strategyFamily.value).upper(),
    }
    aliases = {
        "side": ("side",),
        "entryPrice": ("entryPrice", "entry_price"),
        "limitPrice": ("limitPrice", "limit_price"),
        "stopLossPrice": ("stopLossPrice", "stop_loss_price"),
        "takeProfitPrice": ("takeProfitPrice", "take_profit_price"),
        "quantity": ("quantity",),
        "leverage": ("leverage",),
    }
    for canonical, keys in aliases.items():
        value = next(
            (
                source[key]
                for source in (entity, payload, linked_entity, linked_payload, trigger)
                for key in keys
                if source.get(key) is not None
            ),
            None,
        )
        if value is not None:
            result[canonical] = value
    return result


def management_summary(record: PositionManagementReviewRecord) -> dict[str, Any]:
    payload = payload_from_record(record)
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    structured = review.get("structuredReview") if isinstance(review.get("structuredReview"), dict) else {}
    summary = {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "eventType": record.event_type,
        "phase": record.phase,
        "decision": record.decision,
        "actionType": record.action_type,
        "rationale": review.get("rationale"),
        "userSummary": review.get("userSummary"),
    }
    summary.update(structured_review_summary(structured))
    return summary


def structured_review_summary(structured: dict[str, Any]) -> dict[str, Any]:
    fields = ("headline", "action", "keyReasons", "risks", "watchConditions", "managerNote")
    return {key: structured[key] for key in fields if has_summary_value(structured.get(key))}


def has_summary_value(value: Any) -> bool:
    return value is not None and value != "" and value != []


def feed_summary(record: TraderStatusFeedRecord) -> dict[str, Any]:
    payload = payload_from_record(record)
    return {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "stateKey": record.state_key,
        "eventType": record.event_type,
        "refreshReason": record.refresh_reason,
        "headline": payload.get("headline"),
        "message": payload.get("message"),
    }


def build_status_feed_context(db: Session, trader_id: str, symbol: str) -> dict[str, Any]:
    ai_reviews = db.execute(
        select(AIReviewRecord)
        .where(AIReviewRecord.trader_id == trader_id, AIReviewRecord.symbol == symbol)
        .order_by(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
        .limit(4)
    ).scalars().all()
    management_reviews = db.execute(
        select(PositionManagementReviewRecord)
        .where(PositionManagementReviewRecord.trader_id == trader_id, PositionManagementReviewRecord.symbol == symbol)
        .order_by(desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
        .limit(5)
    ).scalars().all()
    recent_feeds = db.execute(
        select(TraderStatusFeedRecord)
        .where(TraderStatusFeedRecord.trader_id == trader_id, TraderStatusFeedRecord.symbol == symbol)
        .order_by(desc(TraderStatusFeedRecord.created_at), desc(TraderStatusFeedRecord.id))
        .limit(4)
    ).scalars().all()
    return {
        "recentAiReviews": [review_summary(record) for record in ai_reviews],
        "recentManagementReviews": [management_summary(record) for record in management_reviews],
        "recentStatusFeeds": [feed_summary(record) for record in recent_feeds],
        "recentTradeEvents": recent_trade_events_context(db, trader_id, symbol, limit=8),
        "activeExposure": active_exposure_context(db, trader_id, symbol),
        "accountState": account_state_context(db, trader_id),
    }
