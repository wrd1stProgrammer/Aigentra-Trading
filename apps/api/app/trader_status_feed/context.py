from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.ai.context import account_state_context, active_exposure_context, recent_trade_events_context
from app.db import AIReviewRecord, PositionManagementReviewRecord, TraderStatusFeedRecord, utc_now
from app.repositories import from_json


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
    return {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "decision": record.decision,
        "confidence": record.confidence,
        "riskLevel": record.risk_level,
        "approvalReason": payload.get("approvalReason"),
        "counterThesis": payload.get("counterThesis"),
        "headline": structured.get("headline"),
        "action": structured.get("action"),
    }


def management_summary(record: PositionManagementReviewRecord) -> dict[str, Any]:
    payload = payload_from_record(record)
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    return {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "eventType": record.event_type,
        "phase": record.phase,
        "decision": record.decision,
        "actionType": record.action_type,
        "rationale": review.get("rationale"),
        "userSummary": review.get("userSummary"),
    }


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
