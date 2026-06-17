from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db import (
    EquitySnapshotRecord,
    PaperPositionRecord,
    TradeEventRecord,
    TraderStateRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.paper.engine import place_paper_order, process_candle
from app.paper.repositories import upsert_risk_settings
from app.repositories import from_json


def rounded(value):
    return Decimal(value).quantize(Decimal("0.0001"))


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
        assert rounded(position.margin) == Decimal("10.0000")
        assert rounded(position.unrealized_pnl) == Decimal("3.0000")
        assert rounded(state.equity) == Decimal("10002.9500")

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
        assert rounded(position.realized_pnl) == Decimal("9.8950")
        assert rounded(state.cash_balance) == Decimal("10009.8950")
        assert rounded(state.equity) == Decimal("10009.8950")
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
        assert rounded(position.realized_pnl) == Decimal("-10.0750")
        assert rounded(state.cash_balance) == Decimal("9989.9250")
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
        assert position.stop_loss_price == Decimal("100.0000000000")
        third = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 106, "high": 106, "low": 100, "close": 101},
        )

        assert third.closed_positions == [position]
        assert position.close_reason == "stop_loss"
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == [
            "order_filled",
            "stop_moved_to_breakeven",
            "position_closed",
        ]


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
        assert position.stop_loss_price == Decimal("100.0000000000")
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
        assert position.stop_loss_price == Decimal("100.0000000000")
        events = db.execute(select(TradeEventRecord).order_by(TradeEventRecord.id)).scalars().all()
        assert [event.event_type for event in events] == ["order_filled", "stop_moved_to_breakeven"]


def test_newly_filled_position_waits_for_next_candle_before_early_failure_exit(temp_db):
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

        assert second.closed_positions == [position]
        assert position.status == "closed"
        assert position.close_reason == "early_thesis_failure"
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
        assert position.entry_price == Decimal("105.0000000000")
        assert position.stop_loss_price == Decimal("115.0000000000")
        assert position.take_profit_price == Decimal("95.0000000000")
        assert payload["takeProfits"][0]["price"] == 95.0
        assert payload["target"]["price"] == 95.0


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
        
        third = process_candle(
            db,
            "paper-trader",
            "BTCUSDT",
            {"open": 109, "high": 122, "low": 108, "close": 121},
        )
        
        db.refresh(position)
        assert position.status == "closed"
        assert position.close_reason == "take_profit"


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
