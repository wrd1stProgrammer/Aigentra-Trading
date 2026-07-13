from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.db import PaperOrderRecord, PaperPositionRecord, TraderStateRecord, init_db, reset_db_engine, session_scope
from app.paper.donchian_lifecycle import enforce_donchian_lifecycle
from app.paper.engine import PaperEngineResult, process_candle
from app.paper.planner import create_paper_orders_from_plan
from app.repositories import from_json, to_json
from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TradePlan
from test_paper_entry_sizing import sizing_settings


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "donchian-lifecycle.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def candidate_and_plan(side: str = "LONG") -> tuple[TradeCandidate, TradePlan]:
    is_long = side == "LONG"
    signal_close_time = int((datetime.now(timezone.utc) - timedelta(minutes=20)).timestamp() * 1000)
    context = {
        "lookback": 20,
        "boundaryTimeframe": "1h",
        "triggerTimeframe": "15m",
        "upperBoundary": 67500.0,
        "lowerBoundary": 65000.0,
        "brokenBoundary": 67500.0 if is_long else 65000.0,
        "boundaryFingerprint": "1h:20:67500.00000000:65000.00000000",
        "signalCandleCloseTime": signal_close_time,
    }
    candidate = TradeCandidate(
        created=True,
        side=side,
        setupType=f"DONCHIAN_RANGE_EXPANSION_{side}",
        setupScore=90,
        audit={"donchianContext": context},
        entries=[
            EntryPlan(price=68000 if is_long else 64500, weight=0.35, reason="confirmation"),
            EntryPlan(price=67600 if is_long else 64900, weight=0.65, reason="retest"),
        ],
        stopLoss=66500 if is_long else 66000,
        takeProfits=[TakeProfitPlan(price=71000 if is_long else 62000, weight=1.0, reason="target")],
        riskPercent=4.0,
    )
    plan = TradePlan(
        status="PAPER_TRADING_PENDING",
        symbol="BTCUSDT",
        side=side,
        entries=candidate.entries,
        stopLoss=candidate.stopLoss,
        takeProfits=candidate.takeProfits,
        riskPercent=candidate.riskPercent,
        leverage=6,
    )
    return candidate, plan


def completed_snapshot(*, close: float, low: float, high: float) -> dict:
    close_time = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {
        "symbol": "BTCUSDT",
        "price": close,
        "timeframes": {
            "15m": {
                "completedCandle": {
                    "openTime": close_time - 900_000,
                    "closeTime": close_time,
                    "open": 67800.0,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": 1000.0,
                }
            }
        },
    }


def seed_filled_confirmation(db, side: str = "LONG"):
    candidate, plan = candidate_and_plan(side)
    result = create_paper_orders_from_plan(
        db,
        trader_id="donchian-breakout",
        symbol="BTCUSDT",
        run_id=1,
        trade_plan_id=91,
        candidate=candidate,
        plan=plan,
        settings=sizing_settings(),
    )
    assert len(result["created"]) == 1
    process_candle(
        db,
        "donchian-breakout",
        "BTCUSDT",
        (
            {"open": 68100, "high": 68200, "low": 67900, "close": 68000}
            if side == "LONG"
            else {"open": 64400, "high": 64600, "low": 64300, "close": 64500}
        ),
    )
    position = db.query(PaperPositionRecord).filter_by(status="open").one()
    position.opened_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    return position


def test_valid_completed_retest_activates_exactly_one_second_stage(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        snapshot = completed_snapshot(close=67620, low=67480, high=67800)

        first = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=snapshot,
            result=PaperEngineResult(),
        )
        second = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=snapshot,
            result=PaperEngineResult(),
        )
        orders = db.query(PaperOrderRecord).filter_by(status="open").all()
        payload = from_json(position.payload_json)

    assert first["activatedOrderId"] is not None
    assert second["activatedOrderId"] is None
    assert len(orders) == 1
    assert from_json(orders[0].payload_json)["entryIndex"] == 1
    assert orders[0].limit_price == Decimal("67600")
    assert payload["dormantRetest"]["status"] == "ACTIVATED"


def test_original_signal_candle_cannot_activate_retest_after_confirmation_fill(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        payload = from_json(position.payload_json)
        snapshot = completed_snapshot(close=67620, low=67480, high=67800)
        snapshot["timeframes"]["15m"]["completedCandle"]["closeTime"] = payload["donchianContext"][
            "signalCandleCloseTime"
        ]
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=snapshot,
            result=PaperEngineResult(),
        )
        open_orders = db.query(PaperOrderRecord).filter_by(status="open").count()

    assert outcome["activatedOrderId"] is None
    assert open_orders == 0


def test_completed_range_reentry_closes_position_and_cancels_live_retest(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        valid = completed_snapshot(close=67620, low=67480, high=67800)
        enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=valid,
            result=PaperEngineResult(),
        )

        invalid = completed_snapshot(close=67450, low=67350, high=67600)
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=invalid,
            result=PaperEngineResult(),
        )
        db.refresh(position)
        open_orders = db.query(PaperOrderRecord).filter_by(status="open").count()
        state = db.query(TraderStateRecord).filter_by(trader_id="donchian-breakout").one()

    assert outcome["hardInvalidation"] is True
    assert position.status == "closed"
    assert position.close_reason == "donchian_range_reentry"
    assert open_orders == 0
    assert position.realized_pnl < Decimal("0")
    assert state.margin_used == Decimal("0")
    assert state.unrealized_pnl == Decimal("0")
    assert state.equity == state.cash_balance


def test_short_retest_activates_then_completed_range_reentry_closes(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db, "SHORT")
        valid = completed_snapshot(close=64900, low=64750, high=65100)
        activated = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=valid,
            result=PaperEngineResult(),
        )
        invalid = completed_snapshot(close=65100, low=64800, high=65200)
        closed = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=invalid,
            result=PaperEngineResult(),
        )
        db.refresh(position)
        open_orders = db.query(PaperOrderRecord).filter_by(status="open").count()

    assert activated["activatedOrderId"] is not None
    assert closed["hardInvalidation"] is True
    assert position.status == "closed"
    assert position.close_reason == "donchian_range_reentry"
    assert open_orders == 0


def test_unfilled_confirmation_is_canceled_when_completed_close_reenters_range(temp_db):
    with session_scope() as db:
        candidate, plan = candidate_and_plan()
        result = create_paper_orders_from_plan(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=92,
            candidate=candidate,
            plan=plan,
            settings=sizing_settings(),
        )
        order_id = result["created"][0]["id"]
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=67400, low=67200, high=67900),
            result=PaperEngineResult(),
        )
        order = db.get(PaperOrderRecord, order_id)

    assert outcome["activatedOrderId"] is None
    assert order.status == "canceled"


def test_dormant_retest_expires_after_ttl(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        position.opened_at = datetime.now(timezone.utc) - timedelta(seconds=1801)
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=68000, low=67800, high=68200),
            result=PaperEngineResult(),
        )
        payload = from_json(position.payload_json)

    assert outcome["expiredReason"] == "activation_ttl_elapsed"
    assert payload["dormantRetest"]["status"] == "EXPIRED"


def test_activated_retest_order_is_canceled_after_ttl(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        activated = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=67620, low=67480, high=67800),
            result=PaperEngineResult(),
        )
        assert activated["activatedOrderId"] is not None
        process_candle(
            db,
            "donchian-breakout",
            "BTCUSDT",
            {"open": 68000, "high": 68100, "low": 67700, "close": 68000},
        )
        db.refresh(position)
        assert from_json(position.payload_json)["dormantRetest"]["status"] == "ACTIVATED"
        position.opened_at = datetime.now(timezone.utc) - timedelta(seconds=1801)
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=68000, low=67800, high=68200),
            result=PaperEngineResult(),
        )
        payload = from_json(position.payload_json)
        live_orders = db.query(PaperOrderRecord).filter_by(status="open").count()

    assert outcome["expiredReason"] == "activation_ttl_elapsed"
    assert payload["dormantRetest"]["status"] == "EXPIRED"
    assert live_orders == 0


def test_filled_retest_is_not_later_reclassified_as_expired(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        activated = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=67620, low=67480, high=67800),
            result=PaperEngineResult(),
        )
        assert activated["activatedOrderId"] is not None
        process_candle(
            db,
            "donchian-breakout",
            "BTCUSDT",
            {"open": 67700, "high": 67800, "low": 67500, "close": 67600},
        )
        db.refresh(position)
        filled_payload = from_json(position.payload_json)
        position.opened_at = datetime.now(timezone.utc) - timedelta(seconds=1801)
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=68000, low=67800, high=68200),
            result=PaperEngineResult(),
        )
        db.refresh(position)
        final_payload = from_json(position.payload_json)

    assert filled_payload["dormantRetest"]["status"] == "FILLED"
    assert outcome["expiredReason"] is None
    assert final_payload["dormantRetest"]["status"] == "FILLED"


def test_dormant_retest_expires_when_original_risk_is_exhausted(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        payload = from_json(position.payload_json)
        payload["plannedRisk"] = payload["riskBudget"]
        position.payload_json = to_json(payload)
        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=completed_snapshot(close=67620, low=67480, high=67800),
            result=PaperEngineResult(),
        )
        payload = from_json(position.payload_json)
        open_orders = db.query(PaperOrderRecord).filter_by(status="open").count()

    assert outcome["expiredReason"] == "insufficient_remaining_risk_or_cash"
    assert payload["dormantRetest"]["status"] == "EXPIRED"
    assert open_orders == 0


def test_retest_does_not_activate_without_touch_or_after_tp1(temp_db):
    with session_scope() as db:
        position = seed_filled_confirmation(db)
        no_touch = completed_snapshot(close=70900, low=68000, high=71100)

        outcome = enforce_donchian_lifecycle(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            snapshot=no_touch,
            result=PaperEngineResult(),
        )
        payload = from_json(position.payload_json)
        open_orders = db.query(PaperOrderRecord).filter_by(status="open").count()

    assert outcome["activatedOrderId"] is None
    assert payload["dormantRetest"]["status"] == "EXPIRED"
    assert payload["dormantRetest"]["expirationReason"] == "take_profit_reached_before_retest"
    assert open_orders == 0
