from types import SimpleNamespace

import pytest

from app.db import TradePlanRecord, init_db, reset_db_engine, session_scope
from app.paper.planner import create_paper_orders_from_plan
from app.repositories import from_json, to_json
from app.traders.models import (
    CandidateRiskPlan,
    EntryPlan,
    OrderIntent,
    TakeProfitPlan,
    TradeCandidate,
    TradePlan,
)


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "execution-costs.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        paper_default_equity=10_000,
        paper_max_leverage=10,
        paper_maker_fee_rate=0.0002,
        paper_taker_fee_rate=0.0005,
        paper_slippage_rate=0.0001,
        paper_min_margin_deployment_percent=15,
    )


def _candidate(
    *,
    target: float,
    stop: float = 99.0,
    min_risk_reward: float = 1.3,
    post_only: bool = True,
    with_risk_plan: bool = True,
) -> TradeCandidate:
    return TradeCandidate(
        created=True,
        side="LONG",
        setupType="EXECUTION_COST_TEST",
        setupScore=80,
        entries=[EntryPlan(price=100.0, weight=1.0, reason="entry")],
        stopLoss=stop,
        takeProfits=[TakeProfitPlan(price=target, weight=1.0, reason="target")],
        riskPercent=4.0,
        orderIntent=OrderIntent(postOnly=post_only),
        riskPlan=(
            CandidateRiskPlan(
                minRiskReward=min_risk_reward,
                estimatedRiskReward=9.0,
                feeBufferPercent=0.01,
                sizingNote="planner must recalculate from executable costs",
            )
            if with_risk_plan
            else None
        ),
    )


def _plan(candidate: TradeCandidate) -> TradePlan:
    return TradePlan(
        status="PAPER_TRADING_PENDING",
        symbol="BTCUSDT",
        side=candidate.side,
        entries=candidate.entries,
        stopLoss=candidate.stopLoss,
        takeProfits=candidate.takeProfits,
        riskPercent=candidate.riskPercent,
        leverage=5,
    )


def _plan_record(record_id: int) -> TradePlanRecord:
    return TradePlanRecord(
        id=record_id,
        run_id=1,
        trader_id="execution-cost-trader",
        symbol="BTCUSDT",
        status="PAPER_TRADING_PENDING",
        side="LONG",
        risk_percent=4.0,
        payload_json=to_json({"status": "PAPER_TRADING_PENDING"}),
    )


def test_planner_rejects_first_target_below_actual_roundtrip_cost_hurdle(temp_db) -> None:
    # Given: TP1 clears the candidate's stale estimate but not 2.5x executable roundtrip costs.
    candidate = _candidate(target=100.15, stop=99.8, min_risk_reward=0.1)

    # When: the final planner prices maker entry, taker target/stop, and slippage.
    with session_scope() as db:
        record = _plan_record(91)
        db.add(record)
        db.flush()
        result = create_paper_orders_from_plan(
            db,
            trader_id="execution-cost-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=record.id,
            candidate=candidate,
            plan=_plan(candidate),
            settings=_settings(),
        )
        db.refresh(record)
        stored_payload = from_json(record.payload_json)

    # Then: no order is emitted and the auditable final calculation is retained.
    assert result["created"] == []
    assert result["skipped"] == ["net_cost_hurdle_failed"]
    assert result["executionCostAssessment"]["firstTargetCostMultiple"] < 2.5
    assert stored_payload["executionCostAssessment"] == result["executionCostAssessment"]


def test_planner_recalculates_and_rejects_net_rr_below_candidate_minimum(temp_db) -> None:
    # Given: a candidate whose optimistic stored RR ignores the configured execution costs.
    candidate = _candidate(target=100.9, min_risk_reward=1.0)

    # When: the executable net RR is calculated immediately before order creation.
    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="execution-cost-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=92,
            candidate=candidate,
            plan=_plan(candidate),
            settings=_settings(),
        )

    # Then: the stale candidate estimate cannot authorize the order.
    assert result["created"] == []
    assert result["skipped"] == ["net_risk_reward_below_minimum"]
    assert result["executionCostAssessment"]["netRiskReward"] < 1.0


def test_planner_uses_market_entry_cost_and_persists_assessment_on_order(temp_db) -> None:
    # Given: a cost-safe setup that explicitly requests a taker market entry.
    candidate = _candidate(target=102.0, post_only=False)

    # When: the planner emits the executable order.
    with session_scope() as db:
        record = _plan_record(93)
        db.add(record)
        db.flush()
        result = create_paper_orders_from_plan(
            db,
            trader_id="execution-cost-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=record.id,
            candidate=candidate,
            plan=_plan(candidate),
            settings=_settings(),
        )

    # Then: the final payload records taker entry pricing and its net RR.
    assert len(result["created"]) == 1
    assessment = result["executionCostAssessment"]
    assert assessment["entryOrderTypes"] == ["market"]
    assert assessment["entryFee"] == pytest.approx(0.050005)
    assert assessment["makerFeeRate"] == pytest.approx(0.0002)
    assert assessment["takerFeeRate"] == pytest.approx(0.0005)
    assert assessment["slippageRate"] == pytest.approx(0.0001)
    assert result["created"][0]["payload"]["executionCostAssessment"] == assessment


def test_manual_candidate_without_risk_plan_keeps_legacy_order_path(temp_db) -> None:
    # Given: a manually constructed candidate without a deterministic risk plan.
    candidate = _candidate(target=100.15, stop=99.8, with_risk_plan=False)

    # When: the existing planner handles the manual candidate.
    with session_scope() as db:
        result = create_paper_orders_from_plan(
            db,
            trader_id="manual-trader",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=94,
            candidate=candidate,
            plan=_plan(candidate),
            settings=_settings(),
        )

    # Then: the new strategy-only final gate is not applied.
    assert len(result["created"]) == 1
    assert "executionCostAssessment" not in result
