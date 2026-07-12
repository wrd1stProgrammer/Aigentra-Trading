from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db import (
    PaperPositionRecord,
    PositionManagementReviewRecord,
    SessionLocal,
    TradeEventRecord,
    TraderStateRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.paper.engine import PaperEngineResult, place_paper_order, process_candle
from app.paper.management import (
    management_review_cooldown_seconds,
    recent_management_review_exists,
)
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

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("1")
        assert "minimum runner quantity" in decision.reason


def test_management_review_cooldown_uses_protective_minimums():
    high_risk_event = ManagementEvent(
        eventType="near_stop_risk_reduction",
        phase="OPEN_POSITION",
        severity="HIGH",
        reason="Close to stop.",
        suggestedAction="REDUCE_RISK",
    )

    assert management_review_cooldown_seconds(
        high_risk_event,
        profile={"cooldown_seconds": 240},
        base_cooldown_seconds=300,
        urgent_cooldown_seconds=60,
    ) == 900


def test_pending_stale_management_review_cooldown_uses_order_stale_window():
    stale_event = ManagementEvent(
        eventType="imbalance_retest_missed",
        phase="PENDING_ORDER",
        severity="MEDIUM",
        reason="Pending imbalance retest became stale.",
        suggestedAction="CANCEL_PENDING_ORDER",
        metrics={"profileOrderStaleSeconds": 900},
    )

    assert management_review_cooldown_seconds(
        stale_event,
        profile={
            "cooldown_seconds": 300,
            "order_stale_seconds": 900,
            "events": {"pending_stale": "imbalance_retest_missed"},
        },
        base_cooldown_seconds=300,
        urgent_cooldown_seconds=60,
    ) == 900


def test_heartbeat_cadence_is_not_stretched_by_event_cooldown():
    heartbeat = ManagementEvent(
        eventType="pullback_architect_position_heartbeat",
        phase="OPEN_POSITION",
        severity="MEDIUM",
        reason="Periodic active-position review.",
        suggestedAction="HOLD",
        metrics={"heartbeatSeconds": 1500},
    )

    assert management_review_cooldown_seconds(
        heartbeat,
        profile={"cooldown_seconds": 2000},
        base_cooldown_seconds=2000,
        urgent_cooldown_seconds=60,
    ) == 1500


def test_failed_management_review_retries_before_full_heartbeat_cooldown(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        failed = PositionManagementReviewRecord(
            trader_id="paper-trader",
            symbol="BTCUSDT",
            position_id=position.id,
            status="error",
            event_type="paper_trader_position_heartbeat",
            created_at=datetime.now(timezone.utc) - timedelta(seconds=360),
        )
        db.add(failed)
        db.flush()

        assert recent_management_review_exists(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            exposure_kind="position",
            exposure_id=position.id,
            event_type="paper_trader_position_heartbeat",
            cooldown_seconds=1500,
            error_retry_seconds=300,
        ) is False


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

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("1")
        assert "minimum runner quantity" in decision.reason


def test_large_defensive_reduction_closes_at_meaningful_runner_floor(temp_db):
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
        assert decision.quantity_fraction == Decimal("1")
        assert "minimum runner quantity" in decision.reason


def test_defensive_reduction_closes_residual_below_five_percent_account_margin(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        position.quantity = Decimal("0.5000000000")
        position.margin = Decimal("600")
        position.payload_json = to_json({"initialQuantity": 1.0})
        db.flush()

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_RISK",
            requested_fraction=0.25,
            review_decision="REDUCE_RISK",
            reason="Reduce an already small residual.",
            account_equity=Decimal("10000"),
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("1")
        assert "minimum account margin" in decision.reason


def test_defensive_reduction_keeps_partial_size_at_exactly_five_percent_account_margin(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        position.margin = Decimal("625")
        position.payload_json = to_json({"initialQuantity": 1.0})
        db.flush()

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="REDUCE_RISK",
            requested_fraction=0.20,
            review_decision="REDUCE_RISK",
            reason="Keep a meaningful residual.",
            account_equity=Decimal("10000"),
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("0.2")


def test_partial_profit_preserves_runner_instead_of_forcing_defensive_close(temp_db):
    with session_scope() as db:
        position = _create_open_position(db)
        position.quantity = Decimal("0.5000000000")
        position.payload_json = to_json({"initialQuantity": 1.0})
        db.flush()

        decision = build_reduction_decision(
            db,
            position=position,
            action_type="TAKE_PARTIAL_PROFIT",
            requested_fraction=0.75,
            review_decision="TAKE_PARTIAL_PROFIT",
            reason="Take profit and retain a runner.",
            account_equity=Decimal("10000"),
        )

        assert decision.should_apply is True
        assert decision.quantity_fraction == Decimal("0.5")


def test_management_action_closes_tiny_residual_with_short_database_reason(temp_db):
    from app.main import apply_management_actions

    with session_scope() as db:
        position = _create_open_position(db)
        state = db.execute(select(TraderStateRecord).where(TraderStateRecord.trader_id == "paper-trader")).scalar_one()
        position.quantity = Decimal("0.5000000000")
        position.notional = Decimal("3000")
        position.margin = Decimal("600")
        position.payload_json = to_json({"initialQuantity": 1.0})
        state.cash_balance = Decimal("9400")
        state.margin_used = Decimal("600")
        db.flush()

        applied = apply_management_actions(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            event=ManagementEvent(
                eventType="near_stop_risk_reduction",
                phase="OPEN_POSITION",
                severity="HIGH",
                reason="Position is close to the hard stop.",
                suggestedAction="REDUCE_RISK",
            ),
            exposure=ManagedExposure(
                kind="position",
                id=position.id,
                status="open",
                side="LONG",
                quantity=0.5,
                entryPrice=100,
                stopLoss=90,
                takeProfit=120,
                leverage=5,
            ),
            review=PositionManagementResult(
                decision="REDUCE_RISK",
                confidence=90,
                riskLevel="HIGH",
                actions=[ManagementAction(type="REDUCE_RISK", quantityFraction=0.25, reason="Reduce tiny residual.")],
                riskChange="REDUCED",
                nextReviewInSeconds=900,
                rationale="Reduce tiny residual.",
                counterThesis="Hard stop remains valid.",
            ),
            snapshot={"price": 101, "timeframes": {"1m": {"open": 101, "high": 101, "low": 101, "close": 101}}},
            result=PaperEngineResult(),
        )
        db.refresh(position)
        event_types = db.execute(
            select(TradeEventRecord.event_type).where(TradeEventRecord.position_id == position.id)
        ).scalars().all()

        assert applied[0]["applied"] is True
        assert "minimum account margin" in applied[0]["reason"]
        assert position.status == "closed"
        assert position.close_reason == "management_close"
        assert event_types.count("position_closed") == 1
        assert "position_reduced_by_ai" not in event_types


def test_apply_management_actions_does_not_compound_unspecified_reductions(temp_db):
    from app.main import apply_management_actions

    with session_scope() as db:
        position = _create_open_position(db)
        state = db.execute(select(TraderStateRecord).where(TraderStateRecord.trader_id == "paper-trader")).scalar_one()
        position.margin = Decimal("1000")
        position.notional = Decimal("5000")
        state.margin_used = Decimal("1000")
        state.cash_balance = Decimal("9000")
        db.flush()
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


def test_management_close_position_uses_short_db_reason(temp_db):
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
            eventType="pullback_position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Review the open pullback position.",
            suggestedAction="CLOSE_POSITION",
        )
        long_reason = (
            "1h EMA50 회복 조건이 깨졌고 현재가는 진입가보다 낮으며 손절까지 남은 거리가 짧아 "
            "Pullback Architect의 LONG 풀백 논리가 약해졌습니다."
        )
        review = PositionManagementResult(
            decision="CLOSE_POSITION",
            confidence=86,
            riskLevel="HIGH",
            actions=[ManagementAction(type="CLOSE_POSITION", reason=long_reason)],
            riskChange="REDUCED",
            nextReviewInSeconds=900,
            rationale=long_reason,
            counterThesis="Position thesis has weakened.",
        )
        snapshot = {"price": 95, "timeframes": {"1m": {"open": 95, "high": 95, "low": 95, "close": 95}}}

        applied = apply_management_actions(
            db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            event=event,
            exposure=exposure,
            review=review,
            snapshot=snapshot,
            result=PaperEngineResult(),
        )
        db.flush()
        db.refresh(position)

        assert applied[0]["applied"] is True
        assert applied[0]["reason"] == long_reason
        assert position.status == "closed"
        assert position.close_reason == "management_close"


def test_stale_management_action_cannot_reduce_already_closed_position(temp_db):
    from app.main import apply_management_actions

    with session_scope() as db:
        position_id = _create_open_position(db).id

    stale_db = SessionLocal()
    try:
        stale_position = stale_db.get(PaperPositionRecord, position_id)
        assert stale_position is not None and stale_position.status == "open"
        stale_db.commit()

        with session_scope() as execution_db:
            process_candle(
                execution_db,
                "paper-trader",
                "BTCUSDT",
                {"open": 100, "high": 101, "low": 89, "close": 90},
            )
            closed_cash = execution_db.execute(select(TraderStateRecord.cash_balance)).scalar_one()

        exposure = ManagedExposure(
            kind="position",
            id=position_id,
            status="open",
            side="LONG",
            quantity=1,
            entryPrice=100,
            stopLoss=90,
            takeProfit=120,
            leverage=5,
        )
        event = ManagementEvent(
            eventType="position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Review the position.",
            suggestedAction="REDUCE_SIZE",
        )
        review = PositionManagementResult(
            decision="HOLD",
            confidence=80,
            riskLevel="MEDIUM",
            actions=[ManagementAction(type="REDUCE_SIZE", quantityFraction=0.5, reason="Trim exposure.")],
            riskChange="REDUCED",
            nextReviewInSeconds=900,
            rationale="Trim exposure.",
            counterThesis="The stop may already have executed.",
        )

        applied = apply_management_actions(
            stale_db,
            trader_id="paper-trader",
            symbol="BTCUSDT",
            event=event,
            exposure=exposure,
            review=review,
            snapshot={"price": 90, "timeframes": {"1m": {"open": 90, "high": 90, "low": 90, "close": 90}}},
            result=PaperEngineResult(),
        )
        stale_db.commit()
    finally:
        stale_db.close()

    with session_scope() as db:
        position = db.get(PaperPositionRecord, position_id)
        state = db.execute(select(TraderStateRecord)).scalar_one()
        reductions = db.execute(
            select(TradeEventRecord).where(TradeEventRecord.event_type == "position_reduced_by_ai")
        ).scalars().all()

        assert applied[0]["applied"] is False
        assert position is not None and position.status == "closed"
        assert position.quantity == Decimal("1.0000000000")
        assert state.cash_balance == closed_cash
        assert reductions == []
