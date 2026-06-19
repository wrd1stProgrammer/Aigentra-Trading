import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.config import Settings
from app.db import TradeEventRecord, init_db, reset_db_engine, session_scope
from app.trader_status_feed.constants import STATUS_FEED_STATE_PENDING_ENTRY, STATUS_FEED_STATE_POSITION_CLOSED
from app.trader_status_feed.models import StatusFeedResult
from app.trader_status_feed.records import list_status_feed_records
from app.trader_status_feed.scheduler import regenerate_due_status_feeds
from app.trader_status_feed.service import create_status_feed_for_event


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


def test_status_feed_regenerates_on_three_hour_boundary_only(temp_db):
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=False,
        trader_status_feed_regeneration_seconds=10_800,
    )
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 6, 19, 0, 5, tzinfo=timezone.utc)

    with session_scope() as db:
        close_event = TradeEventRecord(
            trader_id="volatility-squeezer",
            symbol="BTCUSDT",
            status="recorded",
            event_type="position_closed",
            price=Decimal("70000"),
            quantity=Decimal("0.01"),
            realized_pnl=Decimal("120"),
            created_at=base_time,
            payload_json='{"reason":"take_profit"}',
        )
        db.add(close_event)
        db.flush()
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="volatility-squeezer",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_CLOSED,
                event_type="position_closed",
                source_type="trade_event",
                source_id=close_event.id,
                trigger_payload={"reason": "take_profit"},
                generator=generator,
                now=base_time,
            )
        )
        first.created_at = base_time
        first.updated_at = base_time

        early = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["volatility-squeezer"],
                generator=generator,
                now=base_time + timedelta(hours=2, minutes=59),
            )
        )
        due = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["volatility-squeezer"],
                generator=generator,
                now=base_time + timedelta(hours=3),
            )
        )
        again = asyncio.run(
            regenerate_due_status_feeds(
                db,
                settings=settings,
                symbol="BTCUSDT",
                trader_ids=["volatility-squeezer"],
                generator=generator,
                now=base_time + timedelta(hours=3, minutes=1),
            )
        )

        records = list_status_feed_records(db, symbol="BTCUSDT", trader_id="volatility-squeezer", limit=10)

        assert early == []
        assert len(due) == 1
        assert again == []
        assert due[0].source_type == "trader_status_feed"
        assert due[0].source_id == first.id
        assert records[0].refresh_reason == "scheduled"
        assert records[1].refresh_reason == "event"


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
