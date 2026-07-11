from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.db import init_db, reset_db_engine, session_scope
from app.paper.planner import create_paper_orders_from_plan
from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TradePlan


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "test.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def sizing_settings(minimum: int = 10, maximum: int = 100):
    return SimpleNamespace(
        paper_default_equity=10000,
        paper_max_leverage=10,
        paper_maker_fee_rate=0.0002,
        paper_taker_fee_rate=0.0005,
        paper_slippage_rate=0.0001,
        paper_min_margin_deployment_percent=minimum,
        paper_max_margin_deployment_percent=maximum,
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
            riskPercent=0.7,
        )

        result = create_paper_orders_from_plan(
            db,
            trader_id="range-maker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=orderable_plan(candidate, leverage=5),
            settings=sizing_settings(minimum=1, maximum=100),
        )

        assert len(result["created"]) == 2
        assert result["marginDeploymentPercent"] == 10
        assert result["plannedRisk"] <= result["riskBudget"] * 1.05
        assert result["riskBudgetUtilizationPercent"] <= 105
        assert result["actualMarginDeploymentPercent"] < 10


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
            riskPercent=0.4,
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
