from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db import PaperPositionRecord, init_db, reset_db_engine, session_scope
from app.paper.engine import PaperEngineResult, place_paper_order, process_candle
from app.paper.repositories import create_trade_event, upsert_risk_settings
from app.paper.reduction_policy import build_reduction_decision
from app.repositories import to_json
from app.traders.models import ManagedExposure, ManagementAction, ManagementEvent, PositionManagementResult


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "management-reduction.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def _create_open_position(db) -> PaperPositionRecord:
    upsert_risk_settings(db, "paper-trader", "BTCUSDT", max_leverage=10)
    place_paper_order(
        db,
        trader_id="paper-trader",
        symbol="BTCUSDT",
        side="long",
        quantity=1,
        leverage=5,
        take_profit_price=120,
        stop_loss_price=90,
    )
    process_candle(db, "paper-trader", "BTCUSDT", {"open": 100, "high": 101, "low": 99, "close": 100})
    return db.execute(select(PaperPositionRecord)).scalar_one()


def test_unspecified_risk_reduction_defaults_to_small_guarded_fraction(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_RISK",
            requested_fraction=None,
            review_decision="HOLD",
            reason="Position is close to the hard stop.",
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("0.10")


def test_explicit_small_reduction_fraction_is_not_silently_raised(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_RISK",
            requested_fraction=0.01,
            review_decision="HOLD",
            reason="Precise small reduction.",
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("0.01")


@pytest.mark.parametrize("reason", ["Make a small risk reduction.", "Rally failed.", "Falling momentum."])
def test_full_close_intent_does_not_match_embedded_all_substrings(temp_db, reason):
    with session_scope() as db:
        position = _create_open_position(db)

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_RISK",
            requested_fraction=None,
            review_decision="HOLD",
            reason=reason,
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("0.10")


def test_full_close_intent_matches_standalone_all_word(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_RISK",
            requested_fraction=None,
            review_decision="HOLD",
            reason="Close all remaining size.",
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("1")


def test_recent_partial_profit_blocks_repeated_ai_size_reduction(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        create_trade_event(
            db,
            "paper-trader",
            "BTCUSDT",
            "take_partial_profit",
            position_id=position.id,
            price=110,
            quantity=Decimal("0.50"),
            payload={"source": "strategy_take_profit"},
        )

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_SIZE",
            requested_fraction=None,
            review_decision="HOLD",
            reason="Reduce risk again.",
        )

        assert decision.should_apply is False
        assert "recent protective size reduction" in decision.reason


def test_reduction_does_not_leave_position_below_meaningful_runner_floor(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        position.quantity = Decimal("0.2600000000")
        position.payload_json = to_json({"initialQuantity": 1.0})
        db.flush()

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_SIZE",
            requested_fraction=0.25,
            review_decision="HOLD",
            reason="Trim again.",
        )

        assert decision.should_apply is False
        assert "minimum runner" in decision.reason


def test_legacy_position_floor_uses_filled_quantity_when_payload_lacks_initial_quantity(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        position.quantity = Decimal("0.2600000000")
        position.payload_json = to_json({})
        db.flush()

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_SIZE",
            requested_fraction=0.25,
            review_decision="HOLD",
            reason="Trim legacy runner.",
        )

        assert decision.should_apply is False
        assert "minimum runner" in decision.reason


def test_large_reduction_is_capped_to_meaningful_runner_floor(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        position.quantity = Decimal("0.5000000000")
        position.payload_json = to_json({"initialQuantity": 1.0})
        db.flush()

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_SIZE",
            requested_fraction=0.75,
            review_decision="HOLD",
            reason="Large trim.",
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("0.5")
        assert "capped" in decision.reason


def test_apply_management_actions_does_not_compound_unspecified_reductions(temp_db):
    from app.main import apply_management_actions

    with session_scope() as db:
        position = _create_open_position(db)
        exposure = ManagedExposure(
            kind="position",
            id=position.id,
            status="open",
            side="LONG",
            quantity=1,
            entryPrice=100,
            stopLoss=90,
            takeProfit=120,
            leverage=5,
        )
        event = ManagementEvent(
            eventType="near_stop_risk_reduction",
            phase="OPEN_POSITION",
            severity="HIGH",
            reason="Position is within 0.3R of the hard stop.",
            suggestedAction="REDUCE_RISK",
        )
        review = PositionManagementResult(
            decision="HOLD",
            confidence=92,
            riskLevel="HIGH",
            actions=[ManagementAction(type="REDUCE_SIZE", reason="reduce risk")],
            riskChange="REDUCED",
            nextReviewInSeconds=900,
            rationale="reduce risk",
            counterThesis="hard stop remains valid",
        )
        snapshot = {"price": 101, "timeframes": {"1m": {"open": 101, "high": 101, "low": 101, "close": 101}}}

        first = apply_management_actions(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            event=event,
            exposure=exposure,
            review=review,
            snapshot=snapshot,
            result=PaperEngineResult(),
        )
        db.refresh(position)
        quantity_after_first = position.quantity

        second = apply_management_actions(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            event=event,
            exposure=exposure,
            review=review,
            snapshot=snapshot,
            result=PaperEngineResult(),
        )
        db.refresh(position)

        assert first[0]["applied"] is True
        assert quantity_after_first == Decimal("0.9000000000")
        assert second[0]["applied"] is False
        assert position.quantity == quantity_after_first
