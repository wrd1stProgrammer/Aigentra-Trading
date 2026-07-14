from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord, PaperPositionRecord, TraderAgentStateRecord
from app.repositories import upsert_trader_agent_state


_UNSET = object()


def reconcile_trader_agent_state(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    mode: str | None = None,
    next_review_at: datetime | None | object = _UNSET,
    last_review_id: int | None | object = _UNSET,
    last_event_type: str | None | object = _UNSET,
    last_decision: str | None | object = _UNSET,
    last_action_type: str | None | object = _UNSET,
    provider: str | None | object = _UNSET,
    model: str | None | object = _UNSET,
    payload: dict[str, Any] | None = None,
) -> TraderAgentStateRecord:
    statement = select(TraderAgentStateRecord).where(
        TraderAgentStateRecord.trader_id == trader_id,
        TraderAgentStateRecord.symbol == symbol,
    )
    if db.get_bind().dialect.name != "sqlite":
        statement = statement.with_for_update()
    current = db.execute(statement).scalar_one_or_none()

    open_positions = int(
        db.scalar(
            select(func.count()).select_from(PaperPositionRecord).where(
                PaperPositionRecord.trader_id == trader_id,
                PaperPositionRecord.symbol == symbol,
                PaperPositionRecord.status == "open",
            )
        )
        or 0
    )
    open_orders = int(
        db.scalar(
            select(func.count()).select_from(PaperOrderRecord).where(
                PaperOrderRecord.trader_id == trader_id,
                PaperOrderRecord.symbol == symbol,
                PaperOrderRecord.status == "open",
            )
        )
        or 0
    )

    if open_positions:
        phase = "OPEN_POSITION"
    elif open_orders:
        phase = "PENDING_ORDER"
    else:
        phase = "IDLE"

    active = phase != "IDLE"
    resolved_mode = mode or (current.mode if current is not None else None) or (
        "MONITORING" if phase == "OPEN_POSITION" else "WATCHING"
    )
    resolved_next_review_at = (
        current.next_review_at if next_review_at is _UNSET and current is not None else next_review_at
    )
    if resolved_next_review_at is _UNSET or not active:
        resolved_next_review_at = None

    def historical(value: object, field: str) -> Any:
        if value is not _UNSET:
            return value
        return getattr(current, field) if current is not None else None

    resolved_payload = payload
    if payload is not None or not active:
        resolved_payload = {
            **(payload or {}),
            "actualExposure": {
                "openOrders": open_orders,
                "openPositions": open_positions,
                "phase": phase,
            },
            "nextReviewAt": resolved_next_review_at.isoformat() if resolved_next_review_at else None,
        }

    return upsert_trader_agent_state(
        db,
        symbol=symbol,
        trader_id=trader_id,
        phase=phase,
        mode="WATCHING" if not active else resolved_mode,
        next_review_at=resolved_next_review_at,
        last_review_id=historical(last_review_id, "last_review_id"),
        last_event_type=historical(last_event_type, "last_event_type"),
        last_decision=historical(last_decision, "last_decision"),
        last_action_type=historical(last_action_type, "last_action_type"),
        provider=historical(provider, "provider"),
        model=historical(model, "model"),
        payload=resolved_payload,
        status="active" if active else "idle",
    )
