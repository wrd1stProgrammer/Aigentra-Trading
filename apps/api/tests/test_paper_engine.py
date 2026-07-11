from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db import (
    EquitySnapshotRecord,
    PaperPositionRecord,
    SessionLocal,
    TradeEventRecord,
    TraderStateRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.paper.engine import place_paper_order, process_candle, reduce_position_by_management
from app.paper.repositories import upsert_risk_settings
from app.repositories import from_json


def rounded(value):
    return Decimal(value).quantize(Decimal("0.0001"))


def fee_inclusive_breakeven(entry_price, quantity, entry_fee, taker_fee_rate, side):
    entry = Decimal(str(entry_price))
    qty = Decimal(str(quantity))
    fee = Decimal(str(entry_fee))
    taker = Decimal(str(taker_fee_rate))
    slippage = Decimal("0.0001")
    match side:
        case "short":
            return ((entry * qty) - fee) / (qty * (Decimal("1") + taker) * (Decimal("1") + slippage))
        case "long":
            return ((entry * qty) + fee) / (qty * (Decimal("1") - taker) * (Decimal("1") - slippage))
        case _:
            raise AssertionError(f"unexpected side: {side}")


def test_stale_engine_session_cannot_close_position_twice(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="market",
            quantity=1,
            leverage=5,
            take_profit_price=120,
            stop_loss_price=90,
        )
        process_candle(db, "paper-trader", "BTCUSDT", {"open": 100, "high": 101, "low": 99, "close": 100})

    stale_db = SessionLocal()
    try:
        stale_position = stale_db.execute(select(PaperPositionRecord)).scalar_one()
        assert stale_position.status == "open"
        stale_db.commit()

        with session_scope() as execution_db:
            first = process_candle(
                execution_db,
                "paper-trader",
                "BTCUSDT",
                {"open": 100, "high": 101, "low": 89, "close": 90},
            )
            cash_after_close = execution_db.execute(select(TraderStateRecord.cash_balance)).scalar_one()
            assert len(first.closed_positions) == 1

        second = process_candle(
            stale_db,
            "paper-trader",
            "BTCUSDT",
            {"open": 90, "high": 91, "low": 89, "close": 90},
        )
        stale_db.commit()
    finally:
        stale_db.close()

    with session_scope() as db:
        state = db.execute(select(TraderStateRecord)).scalar_one()
        close_events = db.execute(
            select(TradeEventRecord).where(TradeEventRecord.event_type == "position_closed")
        ).scalars().all()
        assert second.closed_positions == []
        assert state.cash_balance == cash_after_close
        assert len(close_events) == 1


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "paper.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_market_long_fills_marks_to_market_and_closes_take_profit(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=10,
            take_profit_price=110,
            stop_loss_price=95,
        )

        first = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 104, "low": 99, "close": 103},
        )
        assert first.filled_orders == [order]
        assert not first.closed_positions

        position = db.execute(select(PaperPositionRecord)).scalar_one()
        state = db.execute(select(TraderStateRecord)).scalar_one()
        assert position.status == "open"
        assert rounded(position.margin) == Decimal("10.0010")
        assert rounded(position.unrealized_pnl) == Decimal("2.9900")
        assert rounded(state.equity) == Decimal("10002.9400")

        second = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 103, "high": 110, "low": 102, "close": 109},
        )
        assert second.closed_positions == [position]

        state = db.execute(select(TraderStateRecord)).scalar_one()
        assert position.status == "closed"
        assert position.close_reason == "take_profit"
        assert rounded(position.realized_pnl) == Decimal("9.8850")
        assert rounded(state.cash_balance) == Decimal("10009.8850")
        assert rounded(state.equity) == Decimal("10009.8850")
        assert rounded(state.total_fees) == Decimal("0.1050")

        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled", "position_closed"]
        assert db.execute(select(EquitySnapshotRecord)).scalars().all()


def test_limit_short_uses_maker_fee_and_closes_stop_loss(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "ETHUSDT", max_leverage=5)
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="ETHUSDT",
            side="short",
            order_type="limit",
            limit_price=50,
            quantity=2,
            leverage=2,
            take_profit_price=45,
            stop_loss_price=55,
        )

        fill = process_candle(
            db,
            "paper-trader",
            "ETHUSDT",
            {"open": 49, "high": 50.5, "low": 48, "close": 49},
        )
        assert fill.filled_orders == [order]
        assert rounded(order.fee) == Decimal("0.0200")

        close = process_candle(
            db,
            "paper-trader",
            "ETHUSDT",
            {"open": 52, "high": 55, "low": 49, "close": 54},
        )
        position = close.closed_positions[0]
        state = db.execute(select(TraderStateRecord)).scalar_one()

        assert position.close_reason == "stop_loss"
        assert rounded(position.realized_pnl) == Decimal("-10.0860")
        assert rounded(state.cash_balance) == Decimal("9989.9140")
        assert rounded(state.total_fees) == Decimal("0.0750")


def test_pending_limit_order_does_not_close_take_profit_before_entry(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=110,
            stop_loss_price=95,
        )

        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 105, "high": 112, "low": 104, "close": 111},
        )

        db.refresh(order)
        assert result.filled_orders == []
        assert result.closed_positions == []
        assert result.events == []
        assert order.status == "open"
        assert db.execute(select(PaperPositionRecord)).scalars().all() == []


def test_historical_replay_ignores_candles_before_position_open(temp_db):
    base_time = datetime(2026, 7, 4, 17, 33, tzinfo=timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=120,
            stop_loss_price=90,
        )
        order.submitted_at = base_time
        db.flush()

        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": base_time},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 119, "high": 121, "low": 118, "close": 120, "timestamp": base_time - timedelta(minutes=1)},
        )

        assert result.closed_positions == []
        assert position.status == "open"


def test_historical_replay_ignores_candles_before_order_submission(temp_db):
    submitted_at = datetime(2026, 7, 7, 10, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=120,
            stop_loss_price=90,
        )
        order.submitted_at = submitted_at
        db.flush()

        before_submission = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 101, "high": 102, "low": 99, "close": 100, "timestamp": submitted_at - timedelta(minutes=1)},
        )

        db.refresh(order)
        assert before_submission.filled_orders == []
        assert before_submission.events == []
        assert order.status == "open"
        assert db.execute(select(PaperPositionRecord)).scalars().all() == []

        after_submission = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 101, "high": 102, "low": 99, "close": 100, "timestamp": submitted_at},
        )

        db.refresh(order)
        assert after_submission.filled_orders == [order]
        assert order.status == "filled"


def test_take_profit_counts_prior_ai_reduction_against_planned_target(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=110,
            stop_loss_price=90,
            payload={
                "initialQuantity": 1,
                "takeProfits": [
                    {"price": 110, "weight": 0.4, "reason": "first target"},
                    {"price": 120, "weight": 0.6, "reason": "runner target"},
                ],
            },
        )

        fill = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        state = db.execute(select(TraderStateRecord)).scalar_one()
        reduce_position_by_management(
            db,
            state,
            position,
            108,
            Decimal("0.4"),
            {"open": 107, "high": 108, "low": 106, "close": 108},
            "manual profit protection",
            fill,
        )

        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 108, "high": 111, "low": 107, "close": 110},
        )

        db.refresh(position)
        assert rounded(position.quantity) == Decimal("0.5000")
        take_profit_event = db.execute(
            select(TradeEventRecord).where(TradeEventRecord.event_type == "take_partial_profit")
        ).scalar_one()
        assert rounded(take_profit_event.quantity) == Decimal("0.1000")


def test_long_take_profit_uses_nearest_profitable_target_when_payload_is_unsorted(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=120,
            stop_loss_price=90,
            payload={
                "initialQuantity": 1,
                "takeProfits": [
                    {"price": 120, "weight": 0.6, "reason": "far target"},
                    {"price": 110, "weight": 0.4, "reason": "near target"},
                ],
            },
        )

        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )

        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 111, "low": 99, "close": 109},
        )

        position = db.execute(select(PaperPositionRecord)).scalar_one()
        take_profit_event = db.execute(
            select(TradeEventRecord).where(TradeEventRecord.event_type == "take_partial_profit")
        ).scalar_one()
        payload = from_json(position.payload_json) or {}

        assert result.closed_positions == []
        assert rounded(position.quantity) == Decimal("0.5000")
        assert rounded(take_profit_event.quantity) == Decimal("0.5000")
        assert position.take_profit_price == Decimal("120.0000000000")
        assert payload["takeProfits"][1]["status"] == "filled"
        assert payload["takeProfits"][0].get("status") != "filled"


def test_short_take_profit_uses_nearest_profitable_target_when_payload_is_unsorted(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="short",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=80,
            stop_loss_price=110,
            payload={
                "initialQuantity": 1,
                "takeProfits": [
                    {"price": 80, "weight": 0.6, "reason": "far target"},
                    {"price": 90, "weight": 0.4, "reason": "near target"},
                ],
            },
        )

        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )

        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 89, "close": 91},
        )

        position = db.execute(select(PaperPositionRecord)).scalar_one()
        take_profit_event = db.execute(
            select(TradeEventRecord).where(TradeEventRecord.event_type == "take_partial_profit")
        ).scalar_one()
        payload = from_json(position.payload_json) or {}

        assert result.closed_positions == []
        assert rounded(position.quantity) == Decimal("0.5000")
        assert rounded(take_profit_event.quantity) == Decimal("0.5000")
        assert position.take_profit_price == Decimal("80.0000000000")
        assert payload["takeProfits"][1]["status"] == "filled"
        assert payload["takeProfits"][0].get("status") != "filled"


def test_order_rejected_when_notional_exceeds_risk_settings(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_notional=50)
        order = place_paper_order(db, "paper-trader", "BTCUSDT", side="long", quantity=1)

        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )

        state = db.execute(select(TraderStateRecord)).scalar_one()
        events = db.execute(select(TradeEventRecord)).scalars().all()
        positions = db.execute(select(PaperPositionRecord)).scalars().all()

        assert result.rejected_orders == [order]
        assert order.status == "rejected"
        assert positions == []
        assert rounded(state.equity) == Decimal("10000.0000")
        assert [event.event_type for event in events] == ["order_rejected"]


def test_position_management_moves_stop_to_breakeven(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=130,
            stop_loss_price=90,
        )

        first = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 111, "low": 99, "close": 105},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        assert first.filled_orders
        assert position.stop_loss_price == Decimal("90.0000000000")
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled"]

        second = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 105, "high": 111, "low": 104, "close": 106},
        )

        assert second.closed_positions == []
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=1,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        third = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 106, "high": 106, "low": 100, "close": 101},
        )

        assert third.closed_positions == [position]
        assert position.close_reason == "breakeven"
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == [
            "order_filled",
            "stop_moved_to_breakeven",
            "position_closed",
        ]


def test_old_entry_breakeven_stop_upgrades_to_fee_inclusive_breakeven(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "atr-trail-commander", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="atr-trail-commander",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=120,
            stop_loss_price=80,
        )

        process_candle(
            db,
            "atr-trail-commander",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        position.stop_loss_price = position.entry_price
        db.flush()

        result = process_candle(
            db,
            "atr-trail-commander",
            "BTCUSDT",
            {"open": 100, "high": 111, "low": 99, "close": 109},
        )

        db.refresh(position)
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert position.close_reason == "breakeven"
        assert rounded(position.realized_pnl) == Decimal("0.0000")
        assert [event.event_type for event in result.events] == ["stop_moved_to_breakeven", "position_closed"]
        payload = from_json(result.events[0].payload_json) or {}
        assert payload["reason"] == "fee_inclusive_breakeven_upgrade"
        assert payload["feeInclusiveUpgrade"] is True


def test_fee_inclusive_breakeven_upgrade_is_stable_at_database_price_precision(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "atr-trail-commander", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="atr-trail-commander",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=120,
            stop_loss_price=80,
        )

        process_candle(
            db,
            "atr-trail-commander",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        ).quantize(Decimal("0.0000000001"))
        position.stop_loss_price = expected_stop
        db.flush()

        result = process_candle(
            db,
            "atr-trail-commander",
            "BTCUSDT",
            {"open": 100.5, "high": 111, "low": 100.2, "close": 109},
        )

        db.refresh(position)
        assert position.status == "open"
        assert position.stop_loss_price == expected_stop
        assert result.events == []


def test_trend_sentinel_does_not_move_stop_to_breakeven_at_one_r(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "trend-sentinel", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=140,
            stop_loss_price=90,
        )

        result = process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 111, "low": 99, "close": 105},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        assert result.filled_orders
        assert position.stop_loss_price == Decimal("90.0000000000")
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled"]


def test_orderflow_sniper_can_move_stop_to_breakeven_before_one_r(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "orderflow-sniper", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="orderflow-sniper",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=112,
            stop_loss_price=90,
        )

        result = process_candle(
            db,
            "orderflow-sniper",
            "BTCUSDT",
            {"open": 100, "high": 107, "low": 99, "close": 105},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        assert result.filled_orders
        assert position.stop_loss_price == Decimal("90.0000000000")
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled"]

        second = process_candle(
            db,
            "orderflow-sniper",
            "BTCUSDT",
            {"open": 105, "high": 107, "low": 104, "close": 105},
        )

        assert second.closed_positions == []
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=1,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled", "stop_moved_to_breakeven"]


def test_newly_filled_position_waits_for_next_candle_before_breakeven_management(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "session-raider", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="session-raider",
            symbol="BTCUSDT",
            side="short",
            quantity=1,
            leverage=1,
            take_profit_price=80,
            stop_loss_price=110,
        )

        first = process_candle(
            db,
            "session-raider",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 92, "close": 98},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        assert first.filled_orders
        assert position.status == "open"
        assert position.stop_loss_price == Decimal("110.0000000000")
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled"]

        second = process_candle(
            db,
            "session-raider",
            "BTCUSDT",
            {"open": 98, "high": 99, "low": 92, "close": 94},
        )

        assert second.filled_orders == []
        assert position.status == "open"
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=1,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="short",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled", "stop_moved_to_breakeven"]


def test_60_hour_profitable_long_moves_stop_to_breakeven(temp_db):
    base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "trend-sentinel", "BTCUSDT", max_leverage=5)
        order = place_paper_order(
            db,
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=140,
            stop_loss_price=90,
        )
        order.submitted_at = base_time
        db.flush()

        process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": base_time},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        result = process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 105, "low": 99, "close": 101, "timestamp": base_time + timedelta(hours=60, minutes=1)},
        )

        db.refresh(position)
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert [event.event_type for event in result.events] == ["stop_moved_to_breakeven"]
        payload = from_json(result.events[0].payload_json) or {}
        assert payload["reason"] == "profitable_after_60h_breakeven"
        assert payload["minimumHoldingHours"] == 60


def test_60_hour_profitable_short_moves_stop_to_breakeven(temp_db):
    base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "trend-sentinel", "BTCUSDT", max_leverage=5)
        order = place_paper_order(
            db,
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            side="short",
            quantity=1,
            leverage=1,
            take_profit_price=60,
            stop_loss_price=110,
        )
        order.submitted_at = base_time
        db.flush()

        process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": base_time},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        result = process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 95, "close": 99, "timestamp": base_time + timedelta(hours=60, minutes=1)},
        )

        db.refresh(position)
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="short",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert [event.event_type for event in result.events] == ["stop_moved_to_breakeven"]
        payload = from_json(result.events[0].payload_json) or {}
        assert payload["reason"] == "profitable_after_60h_breakeven"


def test_60_hour_breakeven_requires_profit_and_minimum_hold_time(temp_db):
    base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "trend-sentinel", "BTCUSDT", max_leverage=5)
        order = place_paper_order(
            db,
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=140,
            stop_loss_price=90,
        )
        order.submitted_at = base_time
        db.flush()

        process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": base_time},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        under_threshold = process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 105, "low": 99, "close": 101, "timestamp": base_time + timedelta(hours=59, minutes=59)},
        )
        db.refresh(position)
        assert position.stop_loss_price == Decimal("90.0000000000")
        assert under_threshold.events == []

        losing_after_threshold = process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 98, "close": 99, "timestamp": base_time + timedelta(hours=60, minutes=1)},
        )
        db.refresh(position)
        assert position.stop_loss_price == Decimal("90.0000000000")
        assert losing_after_threshold.events == []


def test_60_hour_breakeven_does_not_apply_on_fill_candle(temp_db):
    base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "trend-sentinel", "BTCUSDT", max_leverage=5)
        order = place_paper_order(
            db,
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=140,
            stop_loss_price=90,
        )
        order.submitted_at = base_time
        db.flush()

        result = process_candle(
            db,
            "trend-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 105, "low": 99, "close": 101, "timestamp": base_time + timedelta(hours=60, minutes=1)},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        assert result.filled_orders
        assert position.stop_loss_price == Decimal("90.0000000000")
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled"]


def test_adverse_close_does_not_trigger_early_thesis_failure_before_stop(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "session-raider", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="session-raider",
            symbol="BTCUSDT",
            side="short",
            quantity=1,
            leverage=1,
            take_profit_price=80,
            stop_loss_price=110,
        )

        first = process_candle(
            db,
            "session-raider",
            "BTCUSDT",
            {"open": 100, "high": 106, "low": 99, "close": 105},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        assert first.filled_orders
        assert first.closed_positions == []
        assert position.status == "open"
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled"]

        second = process_candle(
            db,
            "session-raider",
            "BTCUSDT",
            {"open": 105, "high": 106, "low": 103, "close": 105},
        )

        assert second.closed_positions == []
        assert position.status == "open"

        third = process_candle(
            db,
            "session-raider",
            "BTCUSDT",
            {"open": 105, "high": 111, "low": 104, "close": 110},
        )

        assert third.closed_positions == [position]
        assert position.status == "closed"
        assert position.close_reason == "stop_loss"
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled", "position_closed"]


def test_market_fill_reanchors_stop_and_targets_to_actual_fill_price(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "session-raider", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="session-raider",
            symbol="BTCUSDT",
            side="short",
            quantity=1,
            leverage=1,
            take_profit_price=90,
            stop_loss_price=110,
            payload={
                "plannedEntryPrice": 100,
                "target": {"price": 90, "weight": 1.0, "reason": "TP1"},
                "takeProfits": [{"price": 90, "weight": 1.0, "reason": "TP1"}],
            },
        )

        result = process_candle(
            db,
            "session-raider",
            "BTCUSDT",
            {"open": 105, "high": 106, "low": 104, "close": 105},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        payload = from_json(position.payload_json)

        assert result.filled_orders
        assert position.entry_price == Decimal("104.9895000000")
        assert position.stop_loss_price == Decimal("114.9895000000")
        assert position.take_profit_price == Decimal("94.9895000000")
        assert payload["takeProfits"][0]["price"] == 94.9895
        assert payload["target"]["price"] == 94.9895


def test_partial_take_profit_reduces_position_size(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        
        from app.repositories import to_json
        order_payload = {
            "initialQuantity": 1.0,
            "takeProfits": [
                {"price": 110.0, "weight": 0.5, "status": "pending", "reason": "TP1"},
                {"price": 120.0, "weight": 0.5, "status": "pending", "reason": "TP2"}
            ]
        }
        
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            quantity=1.0,
            leverage=10,
            take_profit_price=110.0,
            stop_loss_price=95.0,
        )
        order.payload_json = to_json(order_payload)
        db.flush()

        first = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 104, "low": 99, "close": 103},
        )
        assert first.filled_orders == [order]
        
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert position.status == "open"
        assert position.quantity == Decimal("1.0")
        
        second = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 103, "high": 115, "low": 102, "close": 109},
        )
        
        db.refresh(position)
        assert position.status == "open"
        assert rounded(position.quantity) == Decimal("0.5000")
        assert rounded(position.take_profit_price) == Decimal("120.0000")
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert [event.event_type for event in second.events] == [
            "take_partial_profit",
            "stop_moved_to_breakeven",
        ]
        
        third = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 109, "high": 122, "low": 108, "close": 121},
        )
        
        db.refresh(position)
        assert position.status == "closed"
        assert position.close_reason == "take_profit"


def test_first_partial_take_profit_closes_at_least_half_position(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)

        from app.repositories import to_json
        order_payload = {
            "initialQuantity": 1.0,
            "takeProfits": [
                {"price": 110.0, "weight": 0.4, "status": "pending", "reason": "TP1"},
                {"price": 120.0, "weight": 0.6, "status": "pending", "reason": "TP2"},
            ],
        }

        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            quantity=1.0,
            leverage=10,
            take_profit_price=110.0,
            stop_loss_price=95.0,
        )
        order.payload_json = to_json(order_payload)
        db.flush()

        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 104, "low": 99, "close": 103},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 103, "high": 115, "low": 102, "close": 109},
        )

        db.refresh(position)
        assert position.status == "open"
        assert rounded(position.quantity) == Decimal("0.5000")
        assert rounded(result.events[0].quantity) == Decimal("0.5000")
        assert rounded(position.take_profit_price) == Decimal("120.0000")


def test_short_partial_take_profit_moves_stop_to_breakeven(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)

        from app.repositories import to_json
        order_payload = {
            "initialQuantity": 1.0,
            "takeProfits": [
                {"price": 90.0, "weight": 0.5, "status": "pending", "reason": "TP1"},
                {"price": 80.0, "weight": 0.5, "status": "pending", "reason": "TP2"},
            ],
        }

        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="short",
            quantity=1.0,
            leverage=10,
            take_profit_price=90.0,
            stop_loss_price=105.0,
        )
        order.payload_json = to_json(order_payload)
        db.flush()

        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 85, "close": 91},
        )

        db.refresh(position)
        assert position.status == "open"
        assert rounded(position.quantity) == Decimal("0.5000")
        assert rounded(position.take_profit_price) == Decimal("80.0000")
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="short",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert [event.event_type for event in result.events] == [
            "take_partial_profit",
            "stop_moved_to_breakeven",
        ]


def test_options_skew_moves_stop_to_breakeven_at_halfway_to_first_take_profit(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "volatility-skew-sentinel", "BTCUSDT", max_leverage=10)

        from app.repositories import to_json
        order_payload = {
            "initialQuantity": 1.0,
            "takeProfits": [
                {"price": 120.0, "weight": 0.5, "status": "pending", "reason": "TP1"},
                {"price": 140.0, "weight": 0.5, "status": "pending", "reason": "TP2"},
            ],
        }

        order = place_paper_order(
            db,
            trader_id="volatility-skew-sentinel",
            symbol="BTCUSDT",
            side="long",
            quantity=1.0,
            leverage=5,
            take_profit_price=120.0,
            stop_loss_price=80.0,
        )
        order.payload_json = to_json(order_payload)
        db.flush()

        process_candle(
            db,
            "volatility-skew-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()

        result = process_candle(
            db,
            "volatility-skew-sentinel",
            "BTCUSDT",
            {"open": 100, "high": 111, "low": 100, "close": 109},
        )

        db.refresh(position)
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="long",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert [event.event_type for event in result.events] == ["stop_moved_to_breakeven"]
        payload = from_json(result.events[0].payload_json) or {}
        assert payload["reason"] == "first_take_profit_halfway_breakeven"


def test_short_moves_stop_to_breakeven_at_halfway_to_first_take_profit(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "pullback-architect", "BTCUSDT", max_leverage=10)
        from app.repositories import to_json

        order = place_paper_order(
            db,
            trader_id="pullback-architect",
            symbol="BTCUSDT",
            side="short",
            quantity=1.0,
            leverage=5,
            take_profit_price=80.0,
            stop_loss_price=120.0,
        )
        order.payload_json = to_json(
            {
                "initialQuantity": 1.0,
                "takeProfits": [
                    {"price": 80.0, "weight": 0.5, "status": "pending", "reason": "TP1"},
                    {"price": 60.0, "weight": 0.5, "status": "pending", "reason": "TP2"},
                ],
            }
        )
        db.flush()

        process_candle(
            db,
            "pullback-architect",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        result = process_candle(
            db,
            "pullback-architect",
            "BTCUSDT",
            {"open": 100, "high": 100, "low": 89, "close": 91},
        )

        db.refresh(position)
        expected_stop = fee_inclusive_breakeven(
            entry_price=position.entry_price,
            quantity=position.quantity,
            entry_fee=position.entry_fee,
            taker_fee_rate=Decimal("0.0005"),
            side="short",
        )
        assert rounded(position.stop_loss_price) == rounded(expected_stop)
        assert [event.event_type for event in result.events] == ["stop_moved_to_breakeven"]
        payload = from_json(result.events[0].payload_json) or {}
        assert payload["reason"] == "first_take_profit_halfway_breakeven"


def test_close_position_cancels_remaining_orders_for_same_plan(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
        
        from app.repositories import to_json
        payload = {"tradePlanId": 999}
        
        # Place two limit orders representing a split entry plan
        order1 = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100.0,
            quantity=0.5,
            leverage=10,
            take_profit_price=110.0,
            stop_loss_price=95.0,
        )
        order1.payload_json = to_json(payload)
        
        order2 = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=98.0,
            quantity=0.5,
            leverage=10,
            take_profit_price=110.0,
            stop_loss_price=95.0,
        )
        order2.payload_json = to_json(payload)
        db.flush()
        
        # Process candle where order1 fills
        first = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 102, "high": 103, "low": 99.5, "close": 100},
        )
        assert first.filled_orders == [order1]
        
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert position.status == "open"
        db.refresh(order2)
        assert order2.status == "open"
        
        # Process candle where position hits take profit (high = 110), but price doesn't drop to 98 (low = 99)
        second = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 110, "low": 99, "close": 109.5},
        )
        assert second.closed_positions == [position]
        assert position.close_reason == "take_profit"
        
        db.refresh(order2)
        # Verify order2 has been automatically cancelled!
        assert order2.status == "canceled"


def test_limit_order_requires_price_through_not_exact_touch(temp_db):
    with session_scope() as db:
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
        )
        exact_touch = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 101, "high": 102, "low": 100, "close": 101},
        )
        assert exact_touch.filled_orders == []
        assert order.status == "open"

        traded_through = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 101, "high": 101, "low": 99.9, "close": 100},
        )
        assert traded_through.filled_orders == [order]


def test_open_position_pays_funding_once_per_settlement_bucket(temp_db):
    base_time = datetime(2026, 7, 1, 0, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        order = place_paper_order(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=130,
            stop_loss_price=80,
        )
        order.submitted_at = base_time
        db.flush()
        process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": base_time},
        )
        settlement = base_time.replace(hour=8, minute=0)
        result = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": settlement, "fundingRate": 0.001},
        )
        duplicate = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100, "timestamp": settlement + timedelta(minutes=1), "fundingRate": 0.001},
        )
        funding_events = [event for event in result.events if event.event_type == "funding_payment"]
        assert len(funding_events) == 1
        assert rounded(funding_events[0].realized_pnl) == Decimal("-0.1000")
        assert not [event for event in duplicate.events if event.event_type == "funding_payment"]
