from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.admin_tables import admin_table_names, count_rows, number_payload, read_admin_table_payload, time_payload
from app.core.config import get_settings
from app.db import (
    APICallLogRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    ReviewUnlockRecord,
    SubscriberPreferenceRecord,
    TradeEventRecord,
    WhopCheckoutRecord,
    db_status,
    get_db,
)
from app.whop_status import ACTIVE_CHECKOUT_STATUSES


router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin_api_token(x_admin_api_token: str = Header(default="")) -> None:
    expected_token = (os.getenv("ADMIN_API_TOKEN") or get_settings().admin_api_token).strip()
    if not expected_token or x_admin_api_token != expected_token:
        raise HTTPException(status_code=401, detail="admin API token required")


@router.get("/overview")
def read_admin_overview(
    _: None = Depends(require_admin_api_token),
    db: Session = Depends(get_db),
) -> dict:
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    database = db_status()
    return {
        "generatedAt": now.isoformat(),
        "database": {
            "status": database["status"],
            "dialect": database["dialect"],
            "databaseUrl": database["databaseUrl"],
            "appEnv": database["appEnv"],
            "remoteDatabaseBlockedInLocal": database["remoteDatabaseBlockedInLocal"],
            "tableCount": len(database["tables"]),
        },
        "totals": {
            "subscribers": count_rows(db, SubscriberPreferenceRecord),
            "activeSubscriptions": count_rows(db, WhopCheckoutRecord, WhopCheckoutRecord.status.in_(ACTIVE_CHECKOUT_STATUSES)),
            "telegramLinked": count_rows(
                db,
                SubscriberPreferenceRecord,
                SubscriberPreferenceRecord.telegram_enabled.is_(True),
                SubscriberPreferenceRecord.telegram_chat_id.is_not(None),
            ),
            "reviewUnlocks": count_rows(db, ReviewUnlockRecord),
            "tradeEvents24h": count_rows(db, TradeEventRecord, TradeEventRecord.created_at >= since_24h),
            "apiErrors24h": count_rows(db, APICallLogRecord, APICallLogRecord.status == "error", APICallLogRecord.created_at >= since_24h),
        },
        "paper": paper_summary(db),
        "recentEvents": [trade_event_payload(record) for record in recent_records(db, TradeEventRecord, 8)],
        "recentSubscribers": [subscriber_payload(record) for record in recent_records(db, SubscriberPreferenceRecord, 8)],
        "slowApiCalls": [api_call_payload(record) for record in recent_slow_api_calls(db)],
        "tables": admin_table_names(),
    }


@router.get("/table")
def read_admin_table(
    table: str = Query(),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: None = Depends(require_admin_api_token),
    db: Session = Depends(get_db),
) -> dict:
    return read_admin_table_payload(db, table, limit, offset)


def paper_summary(db: Session) -> dict:
    open_order_notional = decimal_sum(db, PaperOrderRecord.notional, PaperOrderRecord.status == "open")
    open_position_notional = decimal_sum(db, PaperPositionRecord.notional, PaperPositionRecord.status == "open")
    return {
        "openOrders": count_rows(db, PaperOrderRecord, PaperOrderRecord.status == "open"),
        "openPositions": count_rows(db, PaperPositionRecord, PaperPositionRecord.status == "open"),
        "closedPositions": count_rows(db, PaperPositionRecord, PaperPositionRecord.status == "closed"),
        "openOrderNotional": open_order_notional,
        "openPositionNotional": open_position_notional,
        "openNotional": open_order_notional + open_position_notional,
        "openMargin": decimal_sum(db, PaperPositionRecord.margin, PaperPositionRecord.status == "open"),
        "unrealizedPnl": decimal_sum(db, PaperPositionRecord.unrealized_pnl, PaperPositionRecord.status == "open"),
    }


def decimal_sum(db: Session, column, *conditions) -> float:
    query = select(func.coalesce(func.sum(column), 0))
    if conditions:
        query = query.where(*conditions)
    return number_payload(db.execute(query).scalar_one())


def recent_records(db: Session, model, limit: int):
    return db.execute(select(model).order_by(desc(model.created_at), desc(model.id)).limit(limit)).scalars().all()


def recent_slow_api_calls(db: Session) -> list[APICallLogRecord]:
    return db.execute(
        select(APICallLogRecord)
        .where((APICallLogRecord.status == "error") | (APICallLogRecord.latency_ms >= 3000))
        .order_by(desc(APICallLogRecord.created_at), desc(APICallLogRecord.id))
        .limit(8)
    ).scalars().all()


def trade_event_payload(record: TradeEventRecord) -> dict:
    return {
        "id": record.id,
        "createdAt": time_payload(record.created_at),
        "traderId": record.trader_id,
        "symbol": record.symbol,
        "status": record.status,
        "eventType": record.event_type,
        "price": number_payload(record.price),
        "quantity": number_payload(record.quantity),
        "realizedPnl": number_payload(record.realized_pnl),
    }


def subscriber_payload(record: SubscriberPreferenceRecord) -> dict:
    return {
        "id": record.id,
        "createdAt": time_payload(record.created_at),
        "updatedAt": time_payload(record.updated_at),
        "userId": record.user_id,
        "email": record.email,
        "subscriptionStatus": record.subscription_status,
        "telegramEnabled": record.telegram_enabled,
        "locale": record.locale,
    }


def api_call_payload(record: APICallLogRecord) -> dict:
    return {
        "id": record.id,
        "createdAt": time_payload(record.created_at),
        "endpoint": record.endpoint,
        "method": record.method,
        "status": record.status,
        "latencyMs": record.latency_ms,
        "errorMessage": record.error_message,
    }
