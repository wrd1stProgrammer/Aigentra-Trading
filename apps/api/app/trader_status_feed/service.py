from datetime import datetime
import time
from typing import Any, Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.translation_cache import fanout_ai_translations
from app.core.config import Settings
from app.db import AIReviewRecord, TradeEventRecord, TradePlanRecord, TraderStatusFeedRecord
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
from app.repositories import create_provider_call_log, sanitize_error_message, serialize_record, to_json
from app.subscriber_status_feed_alerts import notify_subscribers_for_status_feed
from app.trader_status_feed.constants import (
    QUALIFYING_STATUS_STATES,
    SCHEDULED_REFRESH_STATUS_STATES,
    STATUS_FEED_STATE_PENDING_ENTRY,
    STATUS_FEED_STATE_POSITION_CLOSED,
    STATUS_FEED_STATE_POSITION_ENTRY,
    STATUS_FEED_STATE_REVIEW_REJECTED,
)
from app.trader_status_feed.context import aware_utc, build_status_feed_context, review_summary
from app.trader_status_feed.generator import MockTraderStatusFeedGenerator, get_status_feed_generator
from app.trader_status_feed.models import StatusFeedPersona, StatusFeedRequest, StatusFeedResult, TraderStatusFeedGenerator
from app.trader_status_feed.persona import status_persona_for_profile
from app.trader_status_feed.records import find_status_feed_by_source, latest_status_feed_record, latest_status_feed_record_for_state, status_feed_payload
from app.traders.registry import get_strategy


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
        if refresh_reason == "event" and state_key in SCHEDULED_REFRESH_STATUS_STATES:
            latest_overall = latest_status_feed_record(db, trader_id=trader_id, symbol=symbol)
            latest_same_state = latest_status_feed_record_for_state(db, trader_id=trader_id, symbol=symbol, state_key=state_key)
            if latest_overall is not None and latest_same_state is not None and latest_overall.id == latest_same_state.id:
                interval_seconds = max(60, int(settings.trader_status_feed_regeneration_seconds or 10_800))
                age_seconds = (generated_at - aware_utc(latest_same_state.created_at)).total_seconds()
                if age_seconds < interval_seconds:
                    return latest_same_state

    profile = get_strategy(trader_id).profile
    request = StatusFeedRequest(
        trader=StatusFeedPersona(**status_persona_for_profile(profile)),
        symbol=symbol,
        stateKey=state_key,
        eventType=event_type,
        generatedAt=generated_at,
        trigger=trigger_payload or {},
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
    payload = status_feed_payload(result, state_key=state_key, event_type=event_type, now=generated_at)
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
    for event in events:
        if event.event_type == "order_filled":
            state_key = STATUS_FEED_STATE_POSITION_ENTRY
        elif event.event_type == "position_closed":
            state_key = STATUS_FEED_STATE_POSITION_CLOSED
        else:
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
                trigger_payload={"event": serialize_record(event)},
                state_started_at=event.created_at,
                generator=generator,
            )
        )
    return records
