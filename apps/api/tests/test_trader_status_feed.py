import asyncio
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.core.config import Settings
from app.db import (
    AITranslationCacheRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    TraderStatusFeedRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
from app.trader_status_feed import generator as status_feed_generator
from app.trader_status_feed.models import StatusFeedPersona, StatusFeedRequest, StatusFeedResult
from app.trader_status_feed.constants import (
    STATUS_FEED_STATE_PENDING_ENTRY,
    STATUS_FEED_STATE_POSITION_CLOSED,
    STATUS_FEED_STATE_POSITION_ENTRY,
    STATUS_FEED_STATE_REVIEW_REJECTED,
)
from app.trader_status_feed.service import (
    create_status_feed_for_event,
)
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
    db_path = tmp_path / "trader-status-feed.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    try:
        yield db_path
    finally:
        reset_db_engine("sqlite:///:memory:")
        init_db()


def test_status_feed_created_for_required_lifecycle_events(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=True, ai_translation_target_locales=["ko"])
    generator = FakeStatusFeedGenerator()
    events = [
        (STATUS_FEED_STATE_REVIEW_REJECTED, "ai_review_rejected", "ai_review", 101),
        (STATUS_FEED_STATE_PENDING_ENTRY, "pending_entry_created", "trade_plan", 202),
        (STATUS_FEED_STATE_POSITION_ENTRY, "order_filled", "trade_event", 303),
        (STATUS_FEED_STATE_POSITION_CLOSED, "position_closed", "trade_event", 404),
    ]

    with session_scope() as db:
        for state_key, event_type, source_type, source_id in events:
            record = asyncio.run(
                create_status_feed_for_event(
                    db,
                    settings=settings,
                    trader_id="volume-breaker",
                    symbol="BTCUSDT",
                    state_key=state_key,
                    event_type=event_type,
                    source_type=source_type,
                    source_id=source_id,
                    trigger_payload={"eventType": event_type},
                    generator=generator,
                )
            )
            assert record.state_key == state_key
            assert record.event_type == event_type
            assert record.provider == "openai"

        duplicate = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="volume-breaker",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_PENDING_ENTRY,
                event_type="pending_entry_created",
                source_type="trade_plan",
                source_id=202,
                trigger_payload={"eventType": "pending_entry_created"},
                generator=generator,
            )
        )

        assert duplicate.source_id == 202
        assert db.query(TraderStatusFeedRecord).count() == 4
        assert db.query(AITranslationCacheRecord).filter_by(source_type=AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED).count() == 4
        assert len(generator.calls) == 4


def test_live_status_feed_reuses_recent_same_state_instead_of_duplicate_thread_posts(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False, trader_status_feed_regeneration_seconds=10_800)
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 6, 22, 17, 8, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="vwap-reclaimer",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="order_filled",
                source_type="trade_event",
                source_id=1798,
                trigger_payload={"eventId": 1798},
                generator=generator,
                now=base_time,
            )
        )
        duplicate_state = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="vwap-reclaimer",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="order_filled",
                source_type="trade_event",
                source_id=1799,
                trigger_payload={"eventId": 1799},
                generator=generator,
                now=base_time.replace(minute=20),
            )
        )

        assert duplicate_state.id == first.id
        assert db.query(TraderStatusFeedRecord).count() == 1
        assert len(generator.calls) == 1


def test_current_status_prefers_open_position_over_open_orders(temp_db):
    opened_at = datetime(2026, 6, 19, 1, 0, tzinfo=timezone.utc)
    submitted_at = datetime(2026, 6, 19, 1, 5, tzinfo=timezone.utc)

    with session_scope() as db:
        order = PaperOrderRecord(
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            status="open",
            side="long",
            order_type="limit",
            fee_type="maker",
            quantity=Decimal("0.01"),
            leverage=Decimal("5"),
            limit_price=Decimal("70000"),
            take_profit_price=Decimal("72000"),
            stop_loss_price=Decimal("69000"),
            submitted_at=submitted_at,
            payload_json='{"source":"protective-or-residual-order"}',
        )
        position = PaperPositionRecord(
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            status="open",
            side="long",
            quantity=Decimal("0.01"),
            entry_price=Decimal("70000"),
            leverage=Decimal("5"),
            notional=Decimal("700"),
            margin=Decimal("140"),
            entry_fee=Decimal("0.28"),
            take_profit_price=Decimal("72000"),
            stop_loss_price=Decimal("69000"),
            opened_at=opened_at,
            payload_json='{"source":"filled-position"}',
        )
        db.add_all([order, position])
        db.flush()

        candidate = current_status_feed_candidate(db, trader_id="volume-breaker", symbol="BTCUSDT")

        assert candidate is not None
        assert candidate["stateKey"] == STATUS_FEED_STATE_POSITION_ENTRY
        assert candidate["eventType"] == "position_entry_active"
        assert candidate["sourceType"] == "paper_position"
        assert candidate["sourceId"] == position.id


def test_status_feed_prompt_contract_uses_thread_voice_without_watch_label():
    contract = status_feed_generator.STATUS_FEED_STYLE_CONTRACT

    assert contract["format"] == "trader_thread_post"
    assert contract["watchPolicy"] == "empty_string"
    assert "news_article" in contract["forbiddenStyles"]
    assert "analyst_report" in contract["forbiddenStyles"]
    assert "next_watch_label" in contract["forbiddenPhrases"]


def test_mock_status_feed_generator_keeps_watch_empty_and_human_thread_like():
    request = StatusFeedRequest(
        trader=StatusFeedPersona(
            traderId="volume-breaker",
            name="Volume Breaker",
            alias="Volume Desk",
            voice="brief breakout trader",
            cadence="compact thread post",
            avoid="report language",
        ),
        symbol="BTCUSDT",
        stateKey=STATUS_FEED_STATE_POSITION_CLOSED,
        eventType="position_closed",
        generatedAt=datetime(2026, 6, 19, 3, 0, tzinfo=timezone.utc),
        trigger={"reason": "take_profit"},
        context={},
    )

    result = asyncio.run(status_feed_generator.MockTraderStatusFeedGenerator().generate(request))

    assert result.watch == ""
    assert "next" not in result.watch.lower()
    assert "I " in result.message or "I'm" in result.message
    assert "key signal" not in result.headline.lower()
