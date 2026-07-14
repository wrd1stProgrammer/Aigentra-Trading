from datetime import datetime
import time
from typing import Any, Final, Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.translation_cache import fanout_ai_translations
from app.core.config import Settings
from app.db import AIReviewRecord, TradeEventRecord, TradePlanRecord, TraderStatusFeedRecord
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
from app.repositories import create_provider_call_log, from_json, sanitize_error_message, serialize_record, to_json
from app.subscriber_status_feed_alerts import notify_subscribers_for_status_feed
from app.trader_status_feed.constants import (
    ACTIVE_HEARTBEAT_EVENT_TYPES,
    QUALIFYING_STATUS_STATES,
    SCHEDULED_REFRESH_STATUS_STATES,
    STATUS_FEED_STATE_NO_SETUP,
    STATUS_FEED_STATE_PENDING_ENTRY,
    STATUS_FEED_STATE_POSITION_CLOSED,
    STATUS_FEED_STATE_POSITION_ENTRY,
    STATUS_FEED_STATE_REVIEW_REJECTED,
)
from app.trader_status_feed.context import (
    aware_utc,
    build_status_feed_context,
    build_status_feed_semantic_context,
    review_summary,
)
from app.trader_status_feed.generator import MockTraderStatusFeedGenerator, get_status_feed_generator
from app.trader_status_feed.models import StatusFeedPersona, StatusFeedRequest, StatusFeedResult, TraderStatusFeedGenerator
from app.trader_status_feed.persona import status_persona_for_profile
from app.trader_status_feed.records import find_status_feed_by_source, latest_status_feed_record, latest_status_feed_record_for_state, status_feed_payload
from app.traders.registry import get_strategy


REVIEW_REJECT_REPEAT_WINDOW_SECONDS: Final = 21_600
TRADE_EVENT_STATUS_STATES: Final = {
    "order_filled": STATUS_FEED_STATE_POSITION_ENTRY,
    "position_closed": STATUS_FEED_STATE_POSITION_CLOSED,
    "order_adjusted_by_ai": STATUS_FEED_STATE_PENDING_ENTRY,
    "order_canceled_by_ai": STATUS_FEED_STATE_NO_SETUP,
    "order_expired_by_ai": STATUS_FEED_STATE_NO_SETUP,
    "position_add_order_created_by_ai": STATUS_FEED_STATE_POSITION_ENTRY,
    "position_pyramid_order_created_by_ai": STATUS_FEED_STATE_POSITION_ENTRY,
    "position_reduced_by_ai": STATUS_FEED_STATE_POSITION_ENTRY,
    "take_partial_profit": STATUS_FEED_STATE_POSITION_ENTRY,
    "stop_updated_by_ai": STATUS_FEED_STATE_POSITION_ENTRY,
    "stop_moved_to_breakeven": STATUS_FEED_STATE_POSITION_ENTRY,
}
ORDER_CLEANUP_EVENT_TYPES: Final = frozenset({"order_canceled_by_ai", "order_expired_by_ai"})
TRADE_EVENT_FEED_PRIORITY: Final = {
    "position_closed": 100,
    "take_partial_profit": 95,
    "position_reduced_by_ai": 90,
    "order_filled": 85,
    "position_add_order_created_by_ai": 80,
    "position_pyramid_order_created_by_ai": 80,
    "stop_moved_to_breakeven": 70,
    "stop_updated_by_ai": 65,
    "order_adjusted_by_ai": 60,
    "order_expired_by_ai": 50,
    "order_canceled_by_ai": 45,
}


def _review_rejection_code(payload: dict[str, Any] | None) -> str:
    review = payload.get("review") if isinstance(payload, dict) else None
    if not isinstance(review, dict):
        return ""
    return str(review.get("reviewCode") or "").strip().upper()


def _record_review_rejection_code(record: TraderStatusFeedRecord) -> str:
    raw = from_json(record.raw_json)
    if not isinstance(raw, dict):
        return ""
    request = raw.get("request")
    if not isinstance(request, dict):
        return ""
    trigger = request.get("trigger")
    return _review_rejection_code(trigger if isinstance(trigger, dict) else None)


async def _generate_with_logging(
    db: Session,
    *,
    generator: TraderStatusFeedGenerator,
    request: StatusFeedRequest,
    symbol: str,
    trader_id: str,
) -> StatusFeedResult:
    started = time.perf_counter()
    try:
        result = await generator.generate(request)
        create_provider_call_log(
            db,
            provider=result.provider,
            model=result.model,
            success=True,
            latency_ms=int((time.perf_counter() - started) * 1000),
            decision=f"status_feed:{request.stateKey}",
            symbol=symbol,
            trader_id=trader_id,
            status="trader_status_feed",
        )
        return result
    except Exception as exc:
        create_provider_call_log(
            db,
            provider=getattr(generator, "name", "openai"),
            model=getattr(generator, "model", "status-feed"),
            success=False,
            latency_ms=int((time.perf_counter() - started) * 1000),
            decision=f"status_feed:{request.stateKey}",
            symbol=symbol,
            trader_id=trader_id,
            status="trader_status_feed_error",
            error_message=sanitize_error_message(str(exc)),
        )
        return await MockTraderStatusFeedGenerator().generate(request)


async def create_status_feed_for_event(
    db: Session,
    *,
    settings: Settings,
    trader_id: str,
    symbol: str,
    state_key: str,
    event_type: str,
    source_type: str,
    source_id: int | None,
    trigger_payload: dict[str, Any] | None = None,
    refresh_reason: str = "event",
    state_started_at: datetime | None = None,
    generator: TraderStatusFeedGenerator | None = None,
    force: bool = False,
    now: datetime | None = None,
) -> TraderStatusFeedRecord:
    if state_key not in QUALIFYING_STATUS_STATES:
        raise ValueError(f"Unsupported status feed state: {state_key}")
    generated_at = aware_utc(now)
    if not force:
        existing = find_status_feed_by_source(
            db,
            source_type=source_type,
            source_id=source_id,
            state_key=state_key,
            refresh_reason=refresh_reason,
        )
        if existing is not None:
            return existing
        if refresh_reason == "event" and event_type == "ai_review_rejected":
            current_code = _review_rejection_code(trigger_payload)
            latest_overall = latest_status_feed_record(db, trader_id=trader_id, symbol=symbol)
            latest_same_state = latest_status_feed_record_for_state(
                db,
                trader_id=trader_id,
                symbol=symbol,
                state_key=state_key,
            )
            if (
                latest_overall is not None
                and latest_same_state is not None
                and latest_overall.id == latest_same_state.id
                and current_code
            ):
                age_seconds = (generated_at - aware_utc(latest_same_state.created_at)).total_seconds()
                if (
                    age_seconds < REVIEW_REJECT_REPEAT_WINDOW_SECONDS
                    and _record_review_rejection_code(latest_same_state) == current_code
                ):
                    return latest_same_state
        if (
            refresh_reason == "event"
            and event_type in ACTIVE_HEARTBEAT_EVENT_TYPES
            and state_key in SCHEDULED_REFRESH_STATUS_STATES
        ):
            latest_overall = latest_status_feed_record(db, trader_id=trader_id, symbol=symbol)
            latest_same_state = latest_status_feed_record_for_state(db, trader_id=trader_id, symbol=symbol, state_key=state_key)
            if latest_overall is not None and latest_same_state is not None and latest_overall.id == latest_same_state.id:
                interval_seconds = max(60, int(settings.trader_status_feed_regeneration_seconds or 10_800))
                age_seconds = (generated_at - aware_utc(latest_same_state.created_at)).total_seconds()
                if age_seconds < interval_seconds:
                    return latest_same_state

    profile = get_strategy(trader_id).profile
    semantic_context = build_status_feed_semantic_context(
        db,
        profile,
        state_key=state_key,
        event_type=event_type,
        trigger=trigger_payload or {},
    )
    request = StatusFeedRequest(
        trader=StatusFeedPersona(**status_persona_for_profile(profile)),
        symbol=symbol,
        stateKey=state_key,
        eventType=event_type,
        generatedAt=generated_at,
        trigger=trigger_payload or {},
        semanticContext=semantic_context,
        context=build_status_feed_context(db, trader_id, symbol),
    )
    # Status generation can await an external provider. End the context read
    # transaction first so it cannot retain an RDS snapshot or row lock.
    db.commit()
    result = await _generate_with_logging(
        db,
        generator=generator or get_status_feed_generator(settings),
        request=request,
        symbol=symbol,
        trader_id=trader_id,
    )
    db.commit()
    payload = status_feed_payload(
        result,
        state_key=state_key,
        event_type=event_type,
        semantic_context=semantic_context,
        now=generated_at,
    )
    record = TraderStatusFeedRecord(
        symbol=symbol,
        trader_id=trader_id,
        status="ok",
        created_at=generated_at,
        updated_at=generated_at,
        state_key=state_key,
        event_type=event_type,
        source_type=source_type,
        source_id=source_id,
        refresh_reason=refresh_reason,
        state_started_at=aware_utc(state_started_at) if state_started_at else generated_at,
        provider=result.provider,
        model=result.model,
        fallback=result.fallback,
        payload_json=to_json(payload),
        raw_json=to_json({"request": request.model_dump(mode="json")}),
    )
    try:
        db.add(record)
        db.flush()
        # Publish the canonical feed before translation. A second producer can
        # now observe and reuse it instead of waiting on an uncommitted unique
        # index entry while the first producer awaits translation.
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = find_status_feed_by_source(
            db,
            source_type=source_type,
            source_id=source_id,
            state_key=state_key,
            refresh_reason=refresh_reason,
        )
        if existing is not None:
            return existing
        raise
    await fanout_ai_translations(
        db,
        settings=settings,
        source_type=AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
        source_id=record.id,
        payload=payload,
        symbol=symbol,
        trader_id=trader_id,
        release_clean_transaction_before_call=True,
    )
    notify_subscribers_for_status_feed(db, record)
    db.commit()
    return record


async def create_status_feed_for_ai_review(
    db: Session,
    *,
    settings: Settings,
    review: AIReviewRecord,
    generator: TraderStatusFeedGenerator | None = None,
) -> TraderStatusFeedRecord | None:
    if (review.decision or "").upper() != "REJECT":
        return None
    return await create_status_feed_for_event(
        db,
        settings=settings,
        trader_id=review.trader_id or "",
        symbol=review.symbol or "",
        state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
        event_type="ai_review_rejected",
        source_type="ai_review",
        source_id=review.id,
        trigger_payload={"review": review_summary(review)},
        state_started_at=review.created_at,
        generator=generator,
    )


async def create_status_feed_for_pending_trade_plan(
    db: Session,
    *,
    settings: Settings,
    plan: TradePlanRecord,
    created_orders: list[dict[str, Any]],
    generator: TraderStatusFeedGenerator | None = None,
) -> TraderStatusFeedRecord | None:
    if not created_orders:
        return None
    return await create_status_feed_for_event(
        db,
        settings=settings,
        trader_id=plan.trader_id or "",
        symbol=plan.symbol or "",
        state_key=STATUS_FEED_STATE_PENDING_ENTRY,
        event_type="pending_entry_created",
        source_type="trade_plan",
        source_id=plan.id,
        trigger_payload={
            "planId": plan.id,
            "status": plan.status,
            "side": plan.side,
            "riskPercent": plan.risk_percent,
            "createdOrderCount": len(created_orders),
            "orders": created_orders[:3],
        },
        state_started_at=plan.created_at,
        generator=generator,
    )


async def create_status_feeds_for_trade_events(
    db: Session,
    *,
    settings: Settings,
    events: Iterable[TradeEventRecord],
    generator: TraderStatusFeedGenerator | None = None,
) -> list[TraderStatusFeedRecord]:
    records: list[TraderStatusFeedRecord] = []
    for event, related_events in _coalesced_trade_feed_events(events):
        state_key = TRADE_EVENT_STATUS_STATES.get(event.event_type or "")
        if state_key is None:
            continue
        records.append(
            await create_status_feed_for_event(
                db,
                settings=settings,
                trader_id=event.trader_id or "",
                symbol=event.symbol or "",
                state_key=state_key,
                event_type=event.event_type,
                source_type="trade_event",
                source_id=event.id,
                trigger_payload={
                    "event": serialize_record(event),
                    "relatedEventTypes": [related.event_type for related in related_events],
                    "relatedEvents": [serialize_record(related) for related in related_events],
                },
                state_started_at=event.created_at,
                generator=generator,
            )
        )
    return records


def _coalesced_trade_feed_events(
    events: Iterable[TradeEventRecord],
) -> list[tuple[TradeEventRecord, list[TradeEventRecord]]]:
    qualifying = [event for event in events if (event.event_type or "") in TRADE_EVENT_STATUS_STATES]
    closed_pairs = {
        (event.trader_id or "", event.symbol or "")
        for event in qualifying
        if event.event_type == "position_closed"
    }
    filtered = [
        event
        for event in qualifying
        if not (
            event.event_type in {"order_canceled_by_ai", "order_expired_by_ai"}
            and (event.trader_id or "", event.symbol or "") in closed_pairs
        )
    ]
    groups: dict[tuple[str, str, str], list[TradeEventRecord]] = {}
    for event in filtered:
        episode = f"position:{event.position_id}" if event.position_id is not None else "orders"
        key = (event.trader_id or "", event.symbol or "", episode)
        groups.setdefault(key, []).append(event)
    for trader_id, symbol in {(event.trader_id or "", event.symbol or "") for event in filtered}:
        order_key = (trader_id, symbol, "orders")
        order_events = groups.get(order_key)
        if not order_events or any((event.event_type or "") not in ORDER_CLEANUP_EVENT_TYPES for event in order_events):
            continue
        position_keys = [
            key
            for key in groups
            if key[:2] == (trader_id, symbol) and key[2].startswith("position:")
        ]
        if len(position_keys) == 1:
            groups[position_keys[0]].extend(groups.pop(order_key))
    coalesced: list[tuple[TradeEventRecord, list[TradeEventRecord]]] = []
    for group in groups.values():
        primary = max(group, key=lambda item: (TRADE_EVENT_FEED_PRIORITY.get(item.event_type or "", 0), -(item.id or 0)))
        related = [event for event in group if event is not primary]
        coalesced.append((primary, related))
    return coalesced
