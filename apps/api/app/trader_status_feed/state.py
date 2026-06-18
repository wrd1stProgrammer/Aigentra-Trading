from datetime import datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import AIReviewRecord, PaperOrderRecord, PaperPositionRecord, TradeEventRecord
from app.repositories import serialize_record
from app.trader_status_feed.constants import (
    STATUS_FEED_STATE_PENDING_ENTRY,
    STATUS_FEED_STATE_POSITION_CLOSED,
    STATUS_FEED_STATE_POSITION_ENTRY,
    STATUS_FEED_STATE_REVIEW_REJECTED,
)
from app.trader_status_feed.context import aware_utc, review_summary


def current_status_feed_candidate(db: Session, *, trader_id: str, symbol: str) -> dict[str, Any] | None:
    position = db.execute(
        select(PaperPositionRecord)
        .where(PaperPositionRecord.trader_id == trader_id, PaperPositionRecord.symbol == symbol, PaperPositionRecord.status == "open")
        .order_by(PaperPositionRecord.opened_at.asc(), PaperPositionRecord.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    if position is not None:
        return {
            "stateKey": STATUS_FEED_STATE_POSITION_ENTRY,
            "eventType": "position_entry_active",
            "sourceType": "paper_position",
            "sourceId": position.id,
            "stateStartedAt": position.opened_at,
            "trigger": {"position": serialize_record(position)},
        }

    order = db.execute(
        select(PaperOrderRecord)
        .where(PaperOrderRecord.trader_id == trader_id, PaperOrderRecord.symbol == symbol, PaperOrderRecord.status == "open")
        .order_by(PaperOrderRecord.submitted_at.asc(), PaperOrderRecord.id.asc())
        .limit(1)
    ).scalar_one_or_none()
    if order is not None:
        return {
            "stateKey": STATUS_FEED_STATE_PENDING_ENTRY,
            "eventType": "pending_entry_active",
            "sourceType": "paper_order",
            "sourceId": order.id,
            "stateStartedAt": order.submitted_at,
            "trigger": {"order": serialize_record(order)},
        }

    latest_event = db.execute(
        select(TradeEventRecord)
        .where(
            TradeEventRecord.trader_id == trader_id,
            TradeEventRecord.symbol == symbol,
            TradeEventRecord.event_type.in_(("order_filled", "position_closed")),
        )
        .order_by(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    latest_reject = db.execute(
        select(AIReviewRecord)
        .where(AIReviewRecord.trader_id == trader_id, AIReviewRecord.symbol == symbol, AIReviewRecord.decision == "REJECT")
        .order_by(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    candidates: list[tuple[datetime, dict[str, Any]]] = []
    if latest_event is not None:
        state_key = STATUS_FEED_STATE_POSITION_CLOSED if latest_event.event_type == "position_closed" else STATUS_FEED_STATE_POSITION_ENTRY
        candidates.append(
            (
                aware_utc(latest_event.created_at),
                {
                    "stateKey": state_key,
                    "eventType": latest_event.event_type,
                    "sourceType": "trade_event",
                    "sourceId": latest_event.id,
                    "stateStartedAt": latest_event.created_at,
                    "trigger": {"event": serialize_record(latest_event)},
                },
            )
        )
    if latest_reject is not None:
        candidates.append(
            (
                aware_utc(latest_reject.created_at),
                {
                    "stateKey": STATUS_FEED_STATE_REVIEW_REJECTED,
                    "eventType": "ai_review_rejected",
                    "sourceType": "ai_review",
                    "sourceId": latest_reject.id,
                    "stateStartedAt": latest_reject.created_at,
                    "trigger": {"review": review_summary(latest_reject)},
                },
            )
        )
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[0])[1]
