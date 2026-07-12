from datetime import datetime
from typing import Any

from sqlalchemy import desc, func, select, tuple_
from sqlalchemy.orm import Session

from app.ai.translation_cache import localized_payload_for_source
from app.db import TradeEventRecord, TraderStatusFeedRecord
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED, CANONICAL_AI_LOCALE, normalize_locale
from app.repositories import from_json, json_safe
from app.trader_status_feed.context import aware_utc, payload_from_record
from app.trader_status_feed.models import StatusFeedResult
from app.trader_status_feed.state import current_status_feed_candidates


def status_feed_payload(
    result: StatusFeedResult,
    *,
    state_key: str,
    event_type: str,
    semantic_context: dict[str, Any],
    now: datetime,
) -> dict[str, Any]:
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
        "semanticContext": semantic_context,
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


def latest_status_feed_record_for_state(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    state_key: str,
) -> TraderStatusFeedRecord | None:
    return db.execute(
        select(TraderStatusFeedRecord)
        .where(
            TraderStatusFeedRecord.trader_id == trader_id,
            TraderStatusFeedRecord.symbol == symbol,
            TraderStatusFeedRecord.state_key == state_key,
        )
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


def serialize_status_feed(
    record: TraderStatusFeedRecord,
    *,
    locale: str,
    db: Session,
    display_state: str = "archived",
) -> dict[str, Any]:
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
    data["displayState"] = display_state
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
    records = list_status_feed_records(db, symbol=symbol, trader_id=trader_id, limit=limit, offset=offset)
    display_states = classify_status_feed_display_states(db, records)
    return [
        serialize_status_feed(record, locale=locale, db=db, display_state=display_states[record.id])
        for record in records
    ]


def classify_status_feed_display_states(
    db: Session,
    records: list[TraderStatusFeedRecord],
) -> dict[int, str]:
    states: dict[int, str] = {}
    groups = {(record.trader_id or "", record.symbol or "") for record in records}
    candidates = current_status_feed_candidates(db, pairs=groups)
    latest_records = _latest_status_feeds_for_pairs(db, groups)
    latest_event_ids = {
        record.source_id
        for record in latest_records.values()
        if record.source_type == "trade_event" and record.source_id is not None
    }
    events = {
        event.id: event
        for event in db.scalars(select(TradeEventRecord).where(TradeEventRecord.id.in_(latest_event_ids))).all()
    }
    for trader_id, symbol in groups:
        latest = latest_records.get((trader_id, symbol))
        candidate = candidates.get((trader_id, symbol))
        for record in records:
            if (record.trader_id or "", record.symbol or "") != (trader_id, symbol):
                continue
            if latest is None or record.id != latest.id:
                states[record.id] = "archived"
            elif candidate is None:
                states[record.id] = "archived"
            else:
                states[record.id] = "current" if _record_matches_candidate(record, candidate, events) else "stale"
    return states


def _latest_status_feeds_for_pairs(
    db: Session,
    pairs: set[tuple[str, str]],
) -> dict[tuple[str, str], TraderStatusFeedRecord]:
    if not pairs:
        return {}
    ranked = (
        select(
            TraderStatusFeedRecord.id.label("record_id"),
            func.row_number()
            .over(
                partition_by=(TraderStatusFeedRecord.trader_id, TraderStatusFeedRecord.symbol),
                order_by=(desc(TraderStatusFeedRecord.created_at), desc(TraderStatusFeedRecord.id)),
            )
            .label("pair_rank"),
        )
        .where(tuple_(TraderStatusFeedRecord.trader_id, TraderStatusFeedRecord.symbol).in_(pairs))
        .subquery()
    )
    records = db.scalars(
        select(TraderStatusFeedRecord)
        .join(ranked, TraderStatusFeedRecord.id == ranked.c.record_id)
        .where(ranked.c.pair_rank == 1)
    ).all()
    return {(record.trader_id or "", record.symbol or ""): record for record in records}


def _record_matches_candidate(
    record: TraderStatusFeedRecord,
    candidate: dict[str, Any],
    events: dict[int, TradeEventRecord],
) -> bool:
    if record.state_key != candidate.get("stateKey"):
        return False
    if record.source_type == candidate.get("sourceType") and record.source_id == candidate.get("sourceId"):
        return True
    trigger = _record_trigger(record)
    if isinstance(trigger, dict):
        if (
            trigger.get("currentSourceType") == candidate.get("sourceType")
            and trigger.get("currentSourceId") == candidate.get("sourceId")
        ):
            return True
    if record.source_type == "trade_event" and record.source_id is not None:
        event = events.get(record.source_id)
        if event is not None:
            if candidate.get("sourceType") == "paper_position" and event.position_id == candidate.get("sourceId"):
                return True
            if candidate.get("sourceType") == "paper_order" and event.order_id == candidate.get("sourceId"):
                return True
    if record.state_key == "no_setup" and _no_setup_fingerprint(trigger) == _no_setup_fingerprint(candidate.get("trigger")):
        return True
    started_at = candidate.get("stateStartedAt")
    if record.state_started_at is None or not isinstance(started_at, datetime):
        return False
    return abs((aware_utc(record.state_started_at) - aware_utc(started_at)).total_seconds()) <= 2


def _record_trigger(record: TraderStatusFeedRecord) -> dict[str, Any]:
    raw = from_json(record.raw_json)
    request = raw.get("request") if isinstance(raw, dict) else None
    trigger = request.get("trigger") if isinstance(request, dict) else None
    return trigger if isinstance(trigger, dict) else {}


def _no_setup_fingerprint(trigger: Any) -> tuple[str, str, str]:
    if not isinstance(trigger, dict):
        return ("", "", "")
    while isinstance(trigger.get("currentState"), dict):
        trigger = trigger["currentState"]
    candidate = trigger.get("candidate")
    if not isinstance(candidate, dict):
        return ("", "", "")
    payload = candidate.get("payload") if isinstance(candidate.get("payload"), dict) else {}
    reason = candidate.get("errorMessage") or candidate.get("error_message") or payload.get("reason")
    setup_type = candidate.get("setupType") or candidate.get("setup_type") or payload.get("setupType")
    status = candidate.get("status")
    return (str(status or ""), str(setup_type or ""), " ".join(str(reason or "").split()).lower())
