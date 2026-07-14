from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.db import PaperOrderRecord, TradeEventRecord, TradePlanRecord, init_db, reset_db_engine, session_scope
from app.paper.planner import create_paper_orders_from_plan
from app.paper.repositories import create_equity_snapshot, ensure_trader_state
from app.repositories import from_json, to_json
from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TradePlan


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "test.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def sizing_settings(minimum: int = 10):
    return SimpleNamespace(
        paper_default_equity=10000,
        paper_max_leverage=10,
        paper_maker_fee_rate=0.0002,
        paper_taker_fee_rate=0.0005,
        paper_slippage_rate=0.0001,
        paper_min_margin_deployment_percent=minimum,
    )


def orderable_plan(candidate: TradeCandidate, leverage: int = 5) -> TradePlan:
    return TradePlan(
        status="PAPER_TRADING_PENDING",
        symbol="BTCUSDT",
        side=candidate.side,
        entries=candidate.entries,
        stopLoss=candidate.stopLoss,
        takeProfits=candidate.takeProfits,
        riskPercent=candidate.riskPercent,
        leverage=leverage,
    )


def margin_used(order: dict) -> float:
    return order["quantity"] * order["limitPrice"] / order["leverage"]


def test_split_entry_sizing_allocates_total_stop_risk_across_entries(temp_db):
    with session_scope() as db:
        candidate = TradeCandidate(
            created=True,
            side="LONG",
            setupType="TEST_SPLIT_ENTRY",
            setupScore=45,
            entries=[
                EntryPlan(price=68000, weight=0.5, reason="starter"),
                EntryPlan(price=67500, weight=0.5, reason="scale"),
            ],
            stopLoss=66000,
            takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
            riskPercent=3.0,
        )

        result = create_paper_orders_from_plan(
            db,
            trader_id="range-maker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=1),
        )

        assert len(result["created"]) == 1
        assert result["marginDeploymentPercent"] == 15
        assert result["plannedRisk"] <= result["riskBudget"] * 1.05
        assert result["riskBudgetUtilizationPercent"] <= 105
        assert margin_used(result["created"][0]) >= 1500
        assert 15 <= result["actualMarginDeploymentPercent"] <= 15.2


def test_first_split_entry_uses_at_least_fifteen_percent_account_margin(temp_db):
    # Given: a strong two-stage setup with enough stop-risk budget for its first minimum entry.
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_MINIMUM_SPLIT_MARGIN",
        setupScore=100,
        entries=[
            EntryPlan(price=68000, weight=0.4, reason="starter"),
            EntryPlan(price=67500, weight=0.6, reason="confirmation"),
        ],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=4.0,
    )

    # When: the planner creates independently fillable split orders.
    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=20),
        )

    # Then: the initial stage uses at least 15% margin while remaining within available cash.
    margins = [margin_used(order) for order in result["created"]]
    assert len(margins) == 2
    assert margins[0] >= 1500
    assert sum(margins) < 10000
    assert all(order["payload"]["minimumEntryMarginPercent"] == 15 for order in result["created"])
    assert result["created"][0]["payload"]["minimumEntryMarginRequired"] is True
    assert result["created"][0]["payload"]["minimumEntryMarginSatisfied"] is True
    assert result["plannedRisk"] <= result["riskBudget"] * 1.05


def test_first_entry_requires_fifteen_percent_account_margin(temp_db):
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_MEANINGFUL_FIRST_ENTRY",
        setupScore=45,
        entries=[EntryPlan(price=68000, weight=1.0, reason="entry")],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=5.0,
    )

    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=10),
        )

    assert len(result["created"]) == 1
    assert margin_used(result["created"][0]) >= 1500
    assert result["created"][0]["payload"]["minimumEntryMarginPercent"] == 15
    assert result["plannedRisk"] <= result["riskBudget"] * 1.05


def test_high_conviction_split_can_use_half_equity_first_and_full_equity_total(temp_db):
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_HIGH_CONVICTION_DEPLOYMENT",
        setupScore=100,
        entries=[
            EntryPlan(price=68000, weight=0.5, reason="first conviction entry"),
            EntryPlan(price=67500, weight=0.5, reason="second conviction entry"),
        ],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=20.0,
    )

    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=15),
        )

    margins = [margin_used(order) for order in result["created"]]
    assert len(margins) == 2
    assert margins[0] >= 4900
    assert result["created"][0]["payload"]["accountMarginPercent"] == pytest.approx(50, abs=0.3)
    assert sum(margins) >= 9900
    assert result["marginDeploymentPercent"] == 100
    assert result["actualMarginDeploymentPercent"] <= 100
    assert result["plannedRisk"] <= result["riskBudget"] * 1.05


def test_split_floor_does_not_push_total_margin_above_score_target_when_cash_exceeds_equity(temp_db):
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_SPLIT_TARGET_CEILING",
        setupScore=99,
        entries=[
            EntryPlan(price=68000, weight=0.01, reason="starter"),
            EntryPlan(price=67500, weight=0.99, reason="confirmation"),
        ],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=100.0,
    )

    with session_scope() as db:
        state = ensure_trader_state(db, "split-target-trader", Decimal("10000"))
        state.equity = Decimal("9000")
        state.cash_balance = Decimal("10000")
        db.flush()
        result = create_paper_orders_from_plan(
            db,
            trader_id="split-target-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=15),
        )

    assert result["marginDeploymentPercent"] == pytest.approx(98.3)
    assert result["created"][0]["payload"]["accountMarginPercent"] >= 15
    assert result["actualMarginUsed"] <= result["targetMarginBudget"]
    assert result["actualMarginDeploymentPercent"] <= 100


def test_split_entry_below_fifteen_percent_uses_risk_safe_size_instead_of_skipping(temp_db):
    # Given: a split setup whose approved stop-risk budget cannot fund a 15% margin entry.
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_MINIMUM_RISK_GUARD",
        setupScore=80,
        entries=[EntryPlan(price=68000, weight=1.0, reason="starter")],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=0.1,
    )

    # When: deterministic sizing applies both the risk budget and deployment floor.
    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=20),
        )

    assert len(result["created"]) == 1
    order = result["created"][0]
    assert margin_used(order) < 1500
    assert order["payload"]["minimumEntryMarginRequired"] is True
    assert order["payload"]["minimumEntryMarginSatisfied"] is False
    assert order["payload"]["minimumEntryMarginWaivedForRiskCap"] is True
    assert result["plannedRisk"] <= result["riskBudget"] * 1.05


def test_non_donchian_zero_order_plan_is_persisted_as_skipped(temp_db):
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_UNEXECUTABLE_RISK",
        setupScore=80,
        entries=[EntryPlan(price=68000, weight=1.0, reason="starter")],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=0.000001,
    )

    with session_scope() as db:
        plan_record = TradePlanRecord(
            id=76,
            run_id=1,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="PAPER_TRADING_PENDING",
            side="LONG",
            risk_percent=candidate.riskPercent,
            payload_json=to_json({"status": "PAPER_TRADING_PENDING"}),
        )
        db.add(plan_record)
        db.flush()

        result = create_paper_orders_from_plan(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=plan_record.id,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=20),
        )
        db.refresh(plan_record)
        plan_payload = from_json(plan_record.payload_json)

    assert result["created"] == []
    assert plan_record.status == "ORDER_CREATION_SKIPPED"
    assert plan_payload["status"] == "ORDER_CREATION_SKIPPED"
    assert plan_payload["orderCreationSkippedReasons"] == result["skipped"]


def test_donchian_confirmation_failure_cannot_fall_through_to_retest_only_order(temp_db):
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="DONCHIAN_RANGE_EXPANSION_LONG",
        setupScore=80,
        audit={"donchianContext": {"upperBoundary": 67500.0, "lowerBoundary": 65000.0}},
        entries=[
            EntryPlan(price=68000, weight=0.35, reason="confirmation"),
            EntryPlan(price=67100, weight=0.65, reason="retest"),
        ],
        stopLoss=67000,
        takeProfits=[TakeProfitPlan(price=71000, weight=1.0, reason="target")],
        riskPercent=1.0,
    )

    with session_scope() as db:
        plan_record = TradePlanRecord(
            id=77,
            run_id=1,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            status="PAPER_TRADING_PENDING",
            side="LONG",
            risk_percent=1.0,
            payload_json=to_json({"status": "PAPER_TRADING_PENDING"}),
        )
        db.add(plan_record)
        db.flush()
        result = create_paper_orders_from_plan(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=77,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=6),
            settings=sizing_settings(),
        )
        order_count = db.query(PaperOrderRecord).count()
        event_count = db.query(TradeEventRecord).filter(TradeEventRecord.event_type == "paper_order_created").count()
        db.refresh(plan_record)
        plan_payload = from_json(plan_record.payload_json)

    assert result["created"] == []
    assert "confirmation" in result["skipped"][0].lower()
    assert order_count == 0
    assert event_count == 0
    assert plan_record.status == "ORDER_CREATION_SKIPPED"
    assert plan_payload["status"] == "ORDER_CREATION_SKIPPED"
    assert plan_payload["orderCreationSkippedReasons"] == result["skipped"]


def test_donchian_initial_planning_creates_only_confirmation_and_freezes_dormant_retest(temp_db):
    context = {
        "lookback": 20,
        "upperBoundary": 67500.0,
        "lowerBoundary": 65000.0,
        "brokenBoundary": 67500.0,
        "boundaryFingerprint": "1h:20:67500.00000000:65000.00000000",
    }
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="DONCHIAN_RANGE_EXPANSION_LONG",
        setupScore=90,
        audit={"donchianContext": context},
        entries=[
            EntryPlan(price=68000, weight=0.35, reason="confirmation"),
            EntryPlan(price=67600, weight=0.65, reason="retest"),
        ],
        stopLoss=66500,
        takeProfits=[TakeProfitPlan(price=71000, weight=1.0, reason="target")],
        riskPercent=4.0,
    )

    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=78,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=6),
            settings=sizing_settings(),
        )
        orders = db.query(PaperOrderRecord).all()

    assert len(result["created"]) == 1
    assert len(orders) == 1
    payload = result["created"][0]["payload"]
    assert payload["entryIndex"] == 0
    assert payload["donchianContext"] == context
    assert payload["dormantRetest"]["entryIndex"] == 1
    assert payload["dormantRetest"]["status"] == "DORMANT"
    assert payload["dormantRetest"]["activationTtlSeconds"] == 1800


def test_zero_weight_split_stage_does_not_receive_minimum_margin(temp_db):
    # Given: one active stage and one explicitly disabled stage.
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_ZERO_WEIGHT_STAGE",
        setupScore=80,
        entries=[
            EntryPlan(price=68000, weight=1.0, reason="active"),
            EntryPlan(price=67500, weight=0.0, reason="disabled"),
        ],
        stopLoss=66000,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=2.5,
    )

    # When: the planner evaluates the split stages.
    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="range-maker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=10),
        )

    # Then: only the positive-weight stage becomes an order.
    assert len(result["created"]) == 1
    assert result["created"][0]["payload"]["entryIndex"] == 0
    assert any("weight is not positive" in reason for reason in result["skipped"])


def test_non_positive_expected_entry_fill_is_skipped_without_division_error(temp_db):
    # Given: malformed first-stage geometry followed by a valid fallback stage.
    candidate = TradeCandidate(
        created=True,
        side="SHORT",
        setupType="TEST_ZERO_ENTRY_PRICE",
        setupScore=80,
        entries=[
            EntryPlan(price=0, weight=0.3, reason="invalid price"),
            EntryPlan(price=100, weight=0.3, reason="invalid stop distance"),
            EntryPlan(price=90, weight=0.4, reason="fallback"),
        ],
        stopLoss=100,
        takeProfits=[TakeProfitPlan(price=1, weight=1.0, reason="target")],
        riskPercent=9.0,
    )

    # When: the planner validates the expected fill before quantity arithmetic.
    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="range-maker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(),
        )

    # Then: the malformed stage is skipped and the first actual order still receives the floor.
    assert len(result["created"]) == 1
    assert result["created"][0]["payload"]["entryIndex"] == 2
    assert margin_used(result["created"][0]) >= 1500
    assert any("entry price is not positive" in reason for reason in result["skipped"])
    assert any("stop distance is zero" in reason for reason in result["skipped"])


def test_drawdown_guard_caps_review_risk_once_before_margin_floor(temp_db):
    # Given: the review already halves candidate risk while the account is in the 0.5x drawdown band.
    now = datetime.now(timezone.utc)
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_SINGLE_DRAWDOWN_CAP",
        setupScore=80,
        entries=[EntryPlan(price=68000, weight=1.0, reason="entry")],
        stopLoss=66500,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=0.52,
    )
    plan = orderable_plan(candidate, leverage=5)
    plan.riskPercent = 0.26

    with session_scope() as db:
        state = ensure_trader_state(db, "drawdown-sized-trader", Decimal("10000"))
        peak = create_equity_snapshot(db, state, "BTCUSDT")
        peak.created_at = now - timedelta(days=2)
        state.equity = Decimal("9000")
        state.cash_balance = Decimal("9000")
        baseline = create_equity_snapshot(db, state, "BTCUSDT")
        baseline.created_at = now - timedelta(days=1)
        db.flush()

        # When: the approved plan reaches deterministic order sizing.
        result = create_paper_orders_from_plan(
            db,
            trader_id="drawdown-sized-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=plan,
            settings=sizing_settings(minimum=20),
        )

    # Then: the current guard is enforced as a cap, not multiplied into the plan a second time.
    assert result["entryGuardrails"]["riskMultiplier"] == 0.5
    assert result["riskPercent"] == pytest.approx(0.26)


def test_daily_loss_guard_uses_approved_plan_risk_not_larger_candidate_risk(temp_db):
    # Given: a 0.26% approved plan and a 0.70% daily account loss.
    now = datetime.now(timezone.utc)
    candidate = TradeCandidate(
        created=True,
        side="LONG",
        setupType="TEST_APPROVED_RISK_DAILY_GUARD",
        setupScore=80,
        entries=[EntryPlan(price=68000, weight=1.0, reason="entry")],
        stopLoss=66500,
        takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
        riskPercent=0.52,
    )
    plan = orderable_plan(candidate, leverage=5)
    plan.riskPercent = 0.26

    with session_scope() as db:
        state = ensure_trader_state(db, "daily-loss-sized-trader", Decimal("10000"))
        baseline = create_equity_snapshot(db, state, "BTCUSDT")
        baseline.created_at = now - timedelta(days=1)
        state.equity = Decimal("9930")
        state.cash_balance = Decimal("9930")
        db.flush()

        # When: the approved plan reaches account entry guardrails.
        result = create_paper_orders_from_plan(
            db,
            trader_id="daily-loss-sized-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=plan,
            settings=sizing_settings(minimum=20),
        )

    # Then: the 2R daily limit is 0.52%, so the new entry is blocked.
    assert result["created"] == []
    assert result["entryGuardrails"]["dailyLossLimitPercent"] == pytest.approx(0.52)
    assert "Daily loss" in result["skipped"][0]


def test_funding_contrarian_cannot_retry_in_same_funding_interval(temp_db):
    with session_scope() as db:
        candidate = TradeCandidate(
            created=True,
            side="SHORT",
            setupType="POSITIVE_FUNDING_STALL_SHORT",
            setupScore=70,
            entries=[EntryPlan(price=68000, weight=1.0, reason="funding unwind")],
            stopLoss=69000,
            takeProfits=[TakeProfitPlan(price=66000, weight=1.0, reason="normalization")],
            riskPercent=1.5,
        )
        settings = sizing_settings()
        first = create_paper_orders_from_plan(
            db,
            trader_id="funding-contrarian",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate),
            settings=settings,
        )
        second = create_paper_orders_from_plan(
            db,
            trader_id="funding-contrarian",
            symbol="BTCUSDT",
            run_id=2,
            trade_plan_id=2,
            candidate=candidate,
            plan=orderable_plan(candidate),
            settings=settings,
        )

        assert first["created"]
        assert second["created"] == []
        assert "already attempted this funding interval" in second["skipped"][0]
