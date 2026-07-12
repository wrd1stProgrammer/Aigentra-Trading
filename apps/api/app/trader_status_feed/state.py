from datetime import datetime
from typing import Any

from sqlalchemy import asc, desc, func, select, tuple_
from sqlalchemy.orm import Session

from app.db import AIReviewRecord, CandidateTradeRecord, PaperOrderRecord, PaperPositionRecord, TradeEventRecord
from app.repositories import serialize_record
from app.trader_status_feed.constants import (
    STATUS_FEED_STATE_PENDING_ENTRY,
    STATUS_FEED_STATE_NO_SETUP,
    STATUS_FEED_STATE_POSITION_CLOSED,
    STATUS_FEED_STATE_POSITION_ENTRY,
    STATUS_FEED_STATE_REVIEW_REJECTED,
)
from app.trader_status_feed.context import aware_utc, review_summary


def current_status_feed_candidate(db: Session, *, trader_id: str, symbol: str) -> dict[str, Any] | None:
    return current_status_feed_candidates(db, pairs={(trader_id, symbol)}).get((trader_id, symbol))


def current_status_feed_candidates(
    db: Session,
    *,
    pairs: set[tuple[str, str]],
) -> dict[tuple[str, str], dict[str, Any] | None]:
    if not pairs:
        return {}
    positions = _ranked_pair_records(
        db,
        PaperPositionRecord,
        pairs,
        conditions=(PaperPositionRecord.status == "open",),
        order_by=(asc(PaperPositionRecord.opened_at), asc(PaperPositionRecord.id)),
    )
    orders = _ranked_pair_records(
        db,
        PaperOrderRecord,
        pairs,
        conditions=(PaperOrderRecord.status == "open",),
        order_by=(asc(PaperOrderRecord.submitted_at), asc(PaperOrderRecord.id)),
    )
    events = _ranked_pair_records(
        db,
        TradeEventRecord,
        pairs,
        conditions=(
            TradeEventRecord.event_type.in_(
                ("order_filled", "position_closed", "order_canceled_by_ai", "order_expired_by_ai")
            ),
        ),
        order_by=(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id)),
    )
    rejects = _ranked_pair_records(
        db,
        AIReviewRecord,
        pairs,
        conditions=(AIReviewRecord.decision == "REJECT",),
        order_by=(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id)),
    )
    no_setups = _ranked_pair_records(
        db,
        CandidateTradeRecord,
        pairs,
        conditions=(CandidateTradeRecord.status == "not_created",),
        order_by=(desc(CandidateTradeRecord.created_at), desc(CandidateTradeRecord.id)),
    )
    position_map = _records_by_pair(positions)
    order_map = _records_by_pair(orders)
    event_map = _records_by_pair(events)
    reject_map = _records_by_pair(rejects)
    no_setup_map = _records_by_pair(no_setups)
    return {
        pair: _candidate_for_pair(
            position=position_map.get(pair),
            order=order_map.get(pair),
            latest_event=event_map.get(pair),
            latest_reject=reject_map.get(pair),
            latest_no_setup=no_setup_map.get(pair),
        )
        for pair in pairs
    }


def _ranked_pair_records(db, model, pairs, *, conditions, order_by):
    ranked = (
        select(
            model.id.label("record_id"),
            func.row_number()
            .over(partition_by=(model.trader_id, model.symbol), order_by=order_by)
            .label("pair_rank"),
        )
        .where(tuple_(model.trader_id, model.symbol).in_(pairs), *conditions)
        .subquery()
    )
    return list(
        db.scalars(
            select(model)
            .join(ranked, model.id == ranked.c.record_id)
            .where(ranked.c.pair_rank == 1)
        ).all()
    )


def _records_by_pair(records):
    return {(record.trader_id or "", record.symbol or ""): record for record in records}


def _candidate_for_pair(*, position, order, latest_event, latest_reject, latest_no_setup):
    if position is not None:
        return {
            "stateKey": STATUS_FEED_STATE_POSITION_ENTRY,
            "eventType": "position_entry_active",
            "sourceType": "paper_position",
            "sourceId": position.id,
            "stateStartedAt": position.opened_at,
            "trigger": {"position": serialize_record(position)},
        }
    if order is not None:
        return {
            "stateKey": STATUS_FEED_STATE_PENDING_ENTRY,
            "eventType": "pending_entry_active",
            "sourceType": "paper_order",
            "sourceId": order.id,
            "stateStartedAt": order.submitted_at,
            "trigger": {"order": serialize_record(order)},
        }
    candidates: list[tuple[datetime, dict[str, Any]]] = []
    if latest_event is not None:
        state_key = {
            "position_closed": STATUS_FEED_STATE_POSITION_CLOSED,
            "order_canceled_by_ai": STATUS_FEED_STATE_NO_SETUP,
            "order_expired_by_ai": STATUS_FEED_STATE_NO_SETUP,
        }.get(latest_event.event_type, STATUS_FEED_STATE_POSITION_ENTRY)
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
    if latest_no_setup is not None:
        candidates.append(
            (
                aware_utc(latest_no_setup.created_at),
                {
                    "stateKey": STATUS_FEED_STATE_NO_SETUP,
                    "eventType": "no_setup_heartbeat",
                    "sourceType": "candidate_trade",
                    "sourceId": latest_no_setup.id,
                    "stateStartedAt": latest_no_setup.created_at,
                    "trigger": {"candidate": serialize_record(latest_no_setup)},
                },
            )
        )
    return max(candidates, key=lambda item: item[0])[1] if candidates else None
