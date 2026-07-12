from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event as sqlalchemy_event

from app.db import CandidateTradeRecord, PaperPositionRecord, TradeEventRecord, TraderStatusFeedRecord, init_db, reset_db_engine, session_scope
from app.trader_status_feed.records import list_status_feed_payloads


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "trader-status-feed-display-state.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    try:
        yield db_path
    finally:
        reset_db_engine("sqlite:///:memory:")
        init_db()


def _position(*, opened_at: datetime) -> PaperPositionRecord:
    return PaperPositionRecord(
        trader_id="trend-sentinel",
        symbol="BTCUSDT",
        status="open",
        side="long",
        quantity=Decimal("0.15"),
        entry_price=Decimal("64000"),
        leverage=Decimal("5"),
        notional=Decimal("9600"),
        margin=Decimal("1920"),
        entry_fee=Decimal("1.92"),
        take_profit_price=Decimal("66000"),
        stop_loss_price=Decimal("63200"),
        opened_at=opened_at,
    )


def _feed(*, created_at: datetime, source_id: int, state_key: str = "position_entry") -> TraderStatusFeedRecord:
    return TraderStatusFeedRecord(
        trader_id="trend-sentinel",
        symbol="BTCUSDT",
        status="ok",
        state_key=state_key,
        event_type="position_entry_active",
        source_type="paper_position",
        source_id=source_id,
        refresh_reason="event",
        state_started_at=created_at,
        provider="openai",
        model="fake",
        fallback=False,
        created_at=created_at,
        payload_json='{"headline":"Position note","message":"Holding."}',
    )


def test_feed_api_marks_only_matching_latest_episode_current_and_older_rows_archived(temp_db):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        position = _position(opened_at=base)
        db.add(position)
        db.flush()
        older = _feed(created_at=base - timedelta(hours=1), source_id=999, state_key="pending_entry")
        current = _feed(created_at=base, source_id=position.id)
        db.add_all([older, current])
        db.flush()

        rows = list_status_feed_payloads(db, trader_id="trend-sentinel", symbol="BTCUSDT", locale="en")

        assert [row["displayState"] for row in rows] == ["current", "archived"]


def test_feed_api_marks_latest_row_stale_when_a_new_episode_has_no_note_yet(temp_db):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        old_position = _position(opened_at=base)
        db.add(old_position)
        db.flush()
        feed = _feed(created_at=base, source_id=old_position.id)
        db.add(feed)
        old_position.status = "closed"
        new_position = _position(opened_at=base + timedelta(hours=2))
        db.add(new_position)
        db.flush()

        rows = list_status_feed_payloads(db, trader_id="trend-sentinel", symbol="BTCUSDT", locale="en")

        assert rows[0]["displayState"] == "stale"


def test_position_lifecycle_event_feed_matches_linked_active_position(temp_db):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        position = _position(opened_at=base)
        db.add(position)
        db.flush()
        event = TradeEventRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="recorded",
            event_type="take_partial_profit",
            position_id=position.id,
            price=Decimal("65000"),
            quantity=Decimal("0.05"),
            created_at=base + timedelta(hours=1),
        )
        db.add(event)
        db.flush()
        feed = TraderStatusFeedRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="ok",
            state_key="position_entry",
            event_type="take_partial_profit",
            source_type="trade_event",
            source_id=event.id,
            refresh_reason="event",
            state_started_at=event.created_at,
            provider="openai",
            model="fake",
            fallback=False,
            created_at=event.created_at,
            payload_json='{"headline":"Partial","message":"Reduced."}',
        )
        db.add(feed)
        db.flush()

        rows = list_status_feed_payloads(db, trader_id="trend-sentinel", symbol="BTCUSDT", locale="en")

        assert rows[0]["displayState"] == "current"


@pytest.mark.parametrize("event_type", ["order_canceled_by_ai", "order_expired_by_ai"])
def test_order_terminal_no_setup_feed_is_current_without_candidate_row(temp_db, event_type):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        event = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type=event_type,
            order_id=401,
            price=Decimal("64000"),
            quantity=Decimal("0.10"),
            created_at=base,
        )
        db.add(event)
        db.flush()
        feed = TraderStatusFeedRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            state_key="no_setup",
            event_type=event_type,
            source_type="trade_event",
            source_id=event.id,
            refresh_reason="event",
            state_started_at=base,
            provider="openai",
            model="fake",
            fallback=False,
            created_at=base,
            payload_json='{"headline":"Canceled","message":"Reset."}',
        )
        db.add(feed)
        db.flush()

        rows = list_status_feed_payloads(db, trader_id="channel-rider", symbol="BTCUSDT", locale="en")

        assert rows[0]["displayState"] == "current"


def test_position_close_feed_stays_current_after_cleanup_order_cancel(temp_db):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        closed = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type="position_closed",
            position_id=501,
            price=Decimal("65000"),
            quantity=Decimal("0.10"),
            created_at=base,
        )
        cleanup_cancel = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type="order_canceled_after_position_close",
            order_id=502,
            price=Decimal("64000"),
            quantity=Decimal("0.05"),
            created_at=base + timedelta(seconds=1),
        )
        db.add_all([closed, cleanup_cancel])
        db.flush()
        feed = TraderStatusFeedRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            state_key="position_closed",
            event_type="position_closed",
            source_type="trade_event",
            source_id=closed.id,
            refresh_reason="event",
            state_started_at=base,
            provider="openai",
            model="fake",
            fallback=False,
            created_at=base,
            payload_json='{"headline":"Closed","message":"Reset."}',
        )
        db.add(feed)
        db.flush()

        rows = list_status_feed_payloads(db, trader_id="channel-rider", symbol="BTCUSDT", locale="en")

        assert rows[0]["displayState"] == "current"


def test_no_setup_feed_requires_matching_semantic_episode(temp_db):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        first = CandidateTradeRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="not_created",
            setup_type="channel-edge",
            setup_score=40,
            error_message="Price is still in the middle of the channel.",
            created_at=base,
        )
        db.add(first)
        db.flush()
        feed = TraderStatusFeedRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            state_key="no_setup",
            event_type="no_setup_heartbeat",
            source_type="candidate_trade",
            source_id=first.id,
            refresh_reason="event",
            state_started_at=base,
            provider="openai",
            model="fake",
            fallback=False,
            created_at=base,
            payload_json='{"headline":"Flat","message":"Waiting."}',
            raw_json='{"request":{"trigger":{"candidate":{"status":"not_created","setupType":"channel-edge","errorMessage":"Price is still in the middle of the channel."}}}}',
        )
        same_episode = CandidateTradeRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="not_created",
            setup_type="channel-edge",
            setup_score=42,
            error_message="Price is still in the middle of the channel.",
            created_at=base + timedelta(minutes=1),
        )
        db.add_all([feed, same_episode])
        db.flush()

        same_rows = list_status_feed_payloads(db, trader_id="channel-rider", symbol="BTCUSDT", locale="en")
        assert same_rows[0]["displayState"] == "current"

        changed_episode = CandidateTradeRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="not_created",
            setup_type="channel-break",
            setup_score=45,
            error_message="The channel edge failed and the setup reset.",
            created_at=base + timedelta(minutes=2),
        )
        db.add(changed_episode)
        db.flush()

        changed_rows = list_status_feed_payloads(db, trader_id="channel-rider", symbol="BTCUSDT", locale="en")
        assert changed_rows[0]["displayState"] == "stale"


def test_display_state_classification_batches_queries_across_traders(temp_db):
    base = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        for index in range(12):
            trader_id = f"batch-trader-{index}"
            candidate = CandidateTradeRecord(
                trader_id=trader_id,
                symbol="BTCUSDT",
                status="not_created",
                setup_type="waiting",
                setup_score=30,
                error_message="No clean setup.",
                created_at=base,
            )
            db.add(candidate)
            db.flush()
            db.add(
                TraderStatusFeedRecord(
                    trader_id=trader_id,
                    symbol="BTCUSDT",
                    status="ok",
                    state_key="no_setup",
                    event_type="no_setup_heartbeat",
                    source_type="candidate_trade",
                    source_id=candidate.id,
                    refresh_reason="event",
                    state_started_at=base,
                    provider="openai",
                    model="fake",
                    fallback=False,
                    created_at=base,
                    payload_json='{"headline":"Flat","message":"Waiting."}',
                )
            )
        db.flush()
        statements = []

        def count_statement(*_args):
            statements.append(1)

        engine = db.get_bind()
        sqlalchemy_event.listen(engine, "before_cursor_execute", count_statement)
        try:
            rows = list_status_feed_payloads(db, symbol="BTCUSDT", limit=100, locale="en")
        finally:
            sqlalchemy_event.remove(engine, "before_cursor_execute", count_statement)

        assert len(rows) == 12
        assert len(statements) <= 9
