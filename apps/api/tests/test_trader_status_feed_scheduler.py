import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import Settings
from app.db import PaperPositionRecord, init_db, reset_db_engine, session_scope
from app.trader_status_feed.constants import STATUS_FEED_STATE_PENDING_ENTRY, STATUS_FEED_STATE_POSITION_ENTRY
from app.trader_status_feed.models import StatusFeedResult
from app.trader_status_feed.records import list_status_feed_records
from app.trader_status_feed.scheduler import regenerate_due_status_feeds
from app.trader_status_feed.service import create_status_feed_for_event
from app.trader_status_feed.state import current_status_feed_candidate


class FakeStatusFeedGenerator:
    name = "openai"
    model = "fake-status-feed"

    def __init__(self) -> None:
        self.calls = []

    async def generate(self, request):
        self.calls.append(request)
        return StatusFeedResult(
            headline=f"{request.stateKey} update",
            message=f"{request.trader.name} is tracking {request.eventType} with a clean, short desk note.",
            mood="focused",
            stance="patient",
            watch="",
            provider=self.name,
            model=self.model,
            fallback=False,
        )


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "trader-status-feed-scheduler.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    try:
        yield db_path
    finally:
        reset_db_engine("sqlite:///:memory:")
        init_db()


def test_status_feed_does_not_regenerate_when_state_no_longer_current(temp_db):
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=False,
        trader_status_feed_regeneration_seconds=10_800,
    )
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 6, 19, 0, 5, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="volume-breaker",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_PENDING_ENTRY,
                event_type="pending_entry_created",
                source_type="trade_plan",
                source_id=777,
                trigger_payload={"order": "created_then_canceled"},
                generator=generator,
                now=base_time,
            )
        )
        first.created_at = base_time
        first.updated_at = base_time

        due = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["volume-breaker"],
                generator=generator,
                now=base_time + timedelta(hours=3),
            )
        )

        assert due == []
        assert list_status_feed_records(db, symbol="BTCUSDT", trader_id="volume-breaker", limit=10) == [first]


def test_status_feed_regenerates_when_current_state_changes(temp_db):
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=False,
        trader_status_feed_regeneration_seconds=10_800,
    )
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 7, 3, 11, 5, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="atr-trail-commander",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_PENDING_ENTRY,
                event_type="pending_entry_created",
                source_type="trade_plan",
                source_id=509,
                trigger_payload={"order": "created"},
                generator=generator,
                now=base_time,
            )
        )
        position = PaperPositionRecord(
            trader_id="atr-trail-commander",
            symbol="BTCUSDT",
            status="open",
            side="long",
            quantity=0.166,
            entry_price=61984.8,
            leverage=5,
            notional=10289.4768,
            margin=2057.89536,
            entry_fee=2.05789536,
            take_profit_price=63240,
            stop_loss_price=61426.9,
            opened_at=base_time + timedelta(minutes=5),
            created_at=base_time + timedelta(minutes=5),
            updated_at=base_time + timedelta(minutes=5),
        )
        db.add(position)
        db.flush()

        due = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["atr-trail-commander"],
                generator=generator,
                now=base_time + timedelta(minutes=10),
            )
        )

        assert len(due) == 1
        assert due[0].state_key == STATUS_FEED_STATE_POSITION_ENTRY
        assert due[0].source_type == "paper_position"
        assert due[0].source_id == position.id
        assert due[0].state_started_at == position.opened_at
        records = list_status_feed_records(db, symbol="BTCUSDT", trader_id="atr-trail-commander", limit=10)
        assert records[0].id == due[0].id
        assert records[1].id == first.id


def test_due_live_position_skips_unchanged_facts_then_emits_material_stop_change(temp_db):
    settings = Settings(openai_api_key="test-key", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 7, 12, 0, 0, tzinfo=timezone.utc)

    with session_scope() as db:
        position = PaperPositionRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="open",
            side="long",
            quantity=0.15,
            entry_price=64_000,
            leverage=5,
            notional=9_600,
            margin=1_920,
            entry_fee=1.92,
            unrealized_pnl=120,
            take_profit_price=66_000,
            stop_loss_price=63_200,
            opened_at=base_time,
            created_at=base_time,
            updated_at=base_time,
            payload_json='{"managementPlan":{"holdingHorizon":"POSITION","strategyFamily":"TREND_FOLLOW"}}',
        )
        db.add(position)
        db.flush()
        candidate = current_status_feed_candidate(db, trader_id="trend-sentinel", symbol="BTCUSDT")
        assert candidate is not None
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=candidate["stateKey"],
                event_type=candidate["eventType"],
                source_type=candidate["sourceType"],
                source_id=candidate["sourceId"],
                trigger_payload=candidate["trigger"],
                state_started_at=candidate["stateStartedAt"],
                generator=generator,
                now=base_time,
            )
        )
        first.created_at = base_time

        unchanged = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["trend-sentinel"],
                generator=generator,
                now=base_time + timedelta(hours=6),
            )
        )
        position.stop_loss_price = 63_700
        db.flush()
        changed = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["trend-sentinel"],
                generator=generator,
                now=base_time + timedelta(hours=6, minutes=1),
            )
        )
        unchanged_after_refresh = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["trend-sentinel"],
                generator=generator,
                now=base_time + timedelta(hours=12, minutes=2),
            )
        )

        assert unchanged == []
        assert len(changed) == 1
        assert changed[0].refresh_reason == "scheduled"
        assert unchanged_after_refresh == []
        assert len(generator.calls) == 2
