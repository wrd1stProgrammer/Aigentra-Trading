from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.db import (
    APICallLogRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    ReviewUnlockRecord,
    SubscriberPreferenceRecord,
    TradeEventRecord,
    WhopCheckoutRecord,
)


ADMIN_TABLE_COLUMNS = {
    "subscriber_preferences": (
        "id",
        "created_at",
        "updated_at",
        "user_id",
        "email",
        "subscription_status",
        "favorite_trader_ids_json",
        "telegram_enabled",
        "telegram_chat_id",
        "locale",
    ),
    "whop_checkouts": (
        "id",
        "created_at",
        "updated_at",
        "checkout_id",
        "internal_order_id",
        "user_id",
        "email",
        "plan_key",
        "status",
        "whop_plan_id",
        "whop_payment_id",
        "whop_membership_id",
        "currency",
        "amount",
    ),
    "review_unlocks": ("id", "created_at", "updated_at", "user_id", "email", "source_type", "source_key", "status"),
    "paper_orders": (
        "id",
        "created_at",
        "updated_at",
        "trader_id",
        "symbol",
        "status",
        "side",
        "order_type",
        "quantity",
        "leverage",
        "limit_price",
        "take_profit_price",
        "stop_loss_price",
        "notional",
        "margin",
        "position_id",
    ),
    "paper_positions": (
        "id",
        "created_at",
        "updated_at",
        "trader_id",
        "symbol",
        "status",
        "side",
        "quantity",
        "entry_price",
        "exit_price",
        "leverage",
        "notional",
        "margin",
        "realized_pnl",
        "unrealized_pnl",
        "close_reason",
        "opened_at",
        "closed_at",
    ),
    "trade_events": (
        "id",
        "created_at",
        "trader_id",
        "symbol",
        "status",
        "event_type",
        "order_id",
        "position_id",
        "price",
        "quantity",
        "fee",
        "realized_pnl",
        "equity",
    ),
    "api_call_logs": ("id", "created_at", "endpoint", "method", "status", "latency_ms", "error_message"),
}

ADMIN_TABLE_MODELS = {
    "subscriber_preferences": SubscriberPreferenceRecord,
    "whop_checkouts": WhopCheckoutRecord,
    "review_unlocks": ReviewUnlockRecord,
    "paper_orders": PaperOrderRecord,
    "paper_positions": PaperPositionRecord,
    "trade_events": TradeEventRecord,
    "api_call_logs": APICallLogRecord,
}


def admin_table_names() -> list[str]:
    return list(ADMIN_TABLE_COLUMNS.keys())


def read_admin_table_payload(db: Session, table: str, limit: int, offset: int) -> dict:
    if table not in ADMIN_TABLE_MODELS:
        raise HTTPException(status_code=400, detail="unsupported admin table")
    model = ADMIN_TABLE_MODELS[table]
    columns = ADMIN_TABLE_COLUMNS[table]
    total = count_rows(db, model)
    records = db.execute(select(model).order_by(desc(model.id)).offset(offset).limit(limit)).scalars().all()
    return {
        "table": table,
        "columns": list(columns),
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": [table_row(record, columns) for record in records],
    }


def count_rows(db: Session, model, *conditions) -> int:
    query = select(func.count()).select_from(model)
    if conditions:
        query = query.where(*conditions)
    return int(db.execute(query).scalar_one() or 0)


def table_row(record, columns: tuple[str, ...]) -> dict:
    return {column: value_payload(getattr(record, column)) for column in columns}


def value_payload(value):
    if isinstance(value, datetime):
        return time_payload(value)
    if isinstance(value, Decimal):
        return number_payload(value)
    return value


def number_payload(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def time_payload(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat()
