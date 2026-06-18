from datetime import datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.ai.translation_cache import localized_payload_for_source
from app.db import TraderStatusFeedRecord
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED, CANONICAL_AI_LOCALE, normalize_locale
from app.repositories import json_safe
from app.trader_status_feed.context import payload_from_record
from app.trader_status_feed.models import StatusFeedResult


def status_feed_payload(result: StatusFeedResult, *, state_key: str, event_type: str, now: datetime) -> dict[str, Any]:
    return {
        "feedType": "trader_status_feed",
        "stateKey": state_key,
        "eventType": event_type,
        "headline": result.headline,
        "message": result.message,
        "mood": result.mood,
        "stance": result.stance,
        "watch": result.watch,
        "provider": result.provider,
        "model": result.model,
        "fallback": result.fallback,
        "generatedAt": now.isoformat(),
    }


def find_status_feed_by_source(
    db: Session,
    *,
    source_type: str,
    source_id: int | None,
    state_key: str,
    refresh_reason: str,
) -> TraderStatusFeedRecord | None:
    if source_id is None:
        return None
    return db.execute(
        select(TraderStatusFeedRecord)
        .where(
            TraderStatusFeedRecord.source_type == source_type,
            TraderStatusFeedRecord.source_id == source_id,
            TraderStatusFeedRecord.state_key == state_key,
            TraderStatusFeedRecord.refresh_reason == refresh_reason,
        )
        .order_by(desc(TraderStatusFeedRecord.created_at), desc(TraderStatusFeedRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def latest_status_feed_record(db: Session, *, trader_id: str, symbol: str) -> TraderStatusFeedRecord | None:
    return db.execute(
        select(TraderStatusFeedRecord)
        .where(TraderStatusFeedRecord.trader_id == trader_id, TraderStatusFeedRecord.symbol == symbol)
        .order_by(desc(TraderStatusFeedRecord.created_at), desc(TraderStatusFeedRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def list_status_feed_records(
    db: Session,
    *,
    symbol: str | None = None,
    trader_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[TraderStatusFeedRecord]:
    stmt = select(TraderStatusFeedRecord)
    if symbol:
        stmt = stmt.where(TraderStatusFeedRecord.symbol == symbol)
    if trader_id:
        stmt = stmt.where(TraderStatusFeedRecord.trader_id == trader_id)
    stmt = stmt.order_by(desc(TraderStatusFeedRecord.created_at), desc(TraderStatusFeedRecord.id))
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    if safe_offset:
        stmt = stmt.offset(safe_offset)
    return db.execute(stmt.limit(safe_limit)).scalars().all()


def serialize_status_feed(record: TraderStatusFeedRecord, *, locale: str, db: Session) -> dict[str, Any]:
    payload = payload_from_record(record)
    localized_payload = payload
    translation_meta = {"status": "canonical", "locale": CANONICAL_AI_LOCALE}
    if payload:
        localized_payload, translation_meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
            source_id=record.id,
            payload=payload,
            locale=normalize_locale(locale),
        )
    data = {
        column.name: json_safe(getattr(record, column.name))
        for column in record.__table__.columns
        if column.name not in {"payload_json", "raw_json", "error_message"}
    }
    for key, value in list(data.items()):
        parts = key.split("_")
        data.setdefault(parts[0] + "".join(part.capitalize() for part in parts[1:]), value)
    data["payload"] = localized_payload
    data["headline"] = localized_payload.get("headline")
    data["message"] = localized_payload.get("message")
    data["watch"] = localized_payload.get("watch")
    data["translation"] = translation_meta
    return data


def list_status_feed_payloads(
    db: Session,
    *,
    symbol: str | None = None,
    trader_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
    locale: str = CANONICAL_AI_LOCALE,
) -> list[dict[str, Any]]:
    return [
        serialize_status_feed(record, locale=locale, db=db)
        for record in list_status_feed_records(db, symbol=symbol, trader_id=trader_id, limit=limit, offset=offset)
    ]
