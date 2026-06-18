from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import TraderStatusFeedRecord
from app.trader_status_feed.constants import QUALIFYING_STATUS_STATES
from app.trader_status_feed.context import aware_utc
from app.trader_status_feed.models import TraderStatusFeedGenerator
from app.trader_status_feed.records import latest_status_feed_record
from app.trader_status_feed.service import create_status_feed_for_event
from app.trader_status_feed.state import current_status_feed_candidate
from app.traders.registry import list_traders


async def regenerate_due_status_feeds(
    db: Session,
    *,
    settings: Settings,
    symbol: str,
    trader_ids: list[str] | None = None,
    generator: TraderStatusFeedGenerator | None = None,
    now: datetime | None = None,
) -> list[TraderStatusFeedRecord]:
    generated_at = aware_utc(now)
    interval_seconds = max(60, int(settings.trader_status_feed_regeneration_seconds or 10_800))
    generated: list[TraderStatusFeedRecord] = []
    for trader_id in sorted(set(trader_ids or [trader.id for trader in list_traders()])):
        latest = latest_status_feed_record(db, trader_id=trader_id, symbol=symbol)
        if latest is None or latest.state_key not in QUALIFYING_STATUS_STATES:
            continue
        candidate = current_status_feed_candidate(db, trader_id=trader_id, symbol=symbol)
        if candidate is None or candidate.get("stateKey") != latest.state_key:
            continue
        age_seconds = (generated_at - aware_utc(latest.created_at)).total_seconds()
        if age_seconds < interval_seconds:
            continue
        generated.append(
            await create_status_feed_for_event(
                db,
                settings=settings,
                trader_id=trader_id,
                symbol=symbol,
                state_key=latest.state_key,
                event_type=f"{latest.event_type}_refresh",
                source_type="trader_status_feed",
                source_id=latest.id,
                trigger_payload={
                    "previousFeedId": latest.id,
                    "previousEventType": latest.event_type,
                    "ageSeconds": int(age_seconds),
                    "currentState": candidate["trigger"],
                    "currentEventType": candidate["eventType"],
                    "currentSourceType": candidate["sourceType"],
                    "currentSourceId": candidate["sourceId"],
                },
                refresh_reason="scheduled",
                state_started_at=candidate["stateStartedAt"] or latest.state_started_at or latest.created_at,
                generator=generator,
                now=generated_at,
            )
        )
    return generated


async def create_status_feed_for_current_state(
    db: Session,
    *,
    settings: Settings,
    trader_id: str,
    symbol: str,
    generator: TraderStatusFeedGenerator | None = None,
    force: bool = False,
) -> TraderStatusFeedRecord | None:
    candidate = current_status_feed_candidate(db, trader_id=trader_id, symbol=symbol)
    if candidate is None:
        return None
    return await create_status_feed_for_event(
        db,
        settings=settings,
        trader_id=trader_id,
        symbol=symbol,
        state_key=candidate["stateKey"],
        event_type=candidate["eventType"],
        source_type=candidate["sourceType"],
        source_id=candidate["sourceId"],
        trigger_payload=candidate["trigger"],
        state_started_at=candidate["stateStartedAt"],
        generator=generator,
        force=force,
    )


async def create_status_feeds_for_current_states(
    db: Session,
    *,
    settings: Settings,
    symbol: str,
    trader_ids: list[str] | None = None,
    force: bool = False,
    generator: TraderStatusFeedGenerator | None = None,
) -> list[TraderStatusFeedRecord]:
    records: list[TraderStatusFeedRecord] = []
    for trader_id in trader_ids or [trader.id for trader in list_traders()]:
        record = await create_status_feed_for_current_state(
            db,
            settings=settings,
            trader_id=trader_id,
            symbol=symbol,
            generator=generator,
            force=force,
        )
        if record is not None:
            records.append(record)
    return records
