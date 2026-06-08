from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord, PaperPositionRecord, TradePlanRecord
from app.repositories import from_json


def active_trade_plan_ids(db: Session, trader_id: str, symbol: str) -> set[int]:
    plan_ids: set[int] = set()
    orders = db.execute(
        select(PaperOrderRecord.payload_json)
        .where(
            PaperOrderRecord.trader_id == trader_id,
            PaperOrderRecord.symbol == symbol,
            PaperOrderRecord.status == "open",
        )
    ).scalars().all()
    positions = db.execute(
        select(PaperPositionRecord.payload_json)
        .where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "open",
        )
    ).scalars().all()
    for payload_json in [*orders, *positions]:
        plan_id = trade_plan_id_from_payload(from_json(payload_json))
        if plan_id is not None:
            plan_ids.add(plan_id)
    return plan_ids


def latest_active_trade_plan(db: Session, trader_id: str, symbol: str) -> Optional[TradePlanRecord]:
    records = list_active_trade_plans(db, trader_id, symbol, limit=1)
    return records[0] if records else None


def list_active_trade_plans(db: Session, trader_id: str, symbol: str, *, limit: int = 5) -> list[TradePlanRecord]:
    plan_ids = active_trade_plan_ids(db, trader_id, symbol)
    if not plan_ids:
        return []
    safe_limit = max(1, min(limit, 20))
    return list(
        db.execute(
            select(TradePlanRecord)
            .where(
                TradePlanRecord.trader_id == trader_id,
                TradePlanRecord.symbol == symbol,
                TradePlanRecord.id.in_(plan_ids),
            )
            .order_by(desc(TradePlanRecord.created_at), desc(TradePlanRecord.id))
            .limit(safe_limit)
        )
        .scalars()
        .all()
    )


def trade_plan_id_from_payload(payload: Any) -> Optional[int]:
    if not isinstance(payload, dict):
        return None
    value = payload.get("tradePlanId") or payload.get("trade_plan_id")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None
