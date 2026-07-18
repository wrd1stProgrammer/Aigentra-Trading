from copy import deepcopy

import pytest

from app.ai.base import entry_approval_prompt, trader_review_policy
from app.main import trade_plan_from_review
from app.paper.holding_policy import trader_holding_policy
from app.paper.sizing import minimum_margin_deployment_percent, target_margin_deployment_percent
from app.traders.high_voltage_config import HIGH_VOLTAGE_TRADER_IDS
from app.traders.models import TradeCandidate, TradeReviewPayload, TradeReviewResult
from app.traders.registry import get_strategy, list_scanner_traders
from tests.test_intraday_breakout_redesign import _breakout_snapshot


class _Settings:
    paper_min_margin_deployment_percent = 20


def test_high_voltage_traders_are_independent_scanner_accounts() -> None:
    scanner_ids = {trader.id for trader in list_scanner_traders()}

    assert HIGH_VOLTAGE_TRADER_IDS <= scanner_ids
    for trader_id in HIGH_VOLTAGE_TRADER_IDS:
        profile = get_strategy(trader_id).profile
        assert profile.mockPerformance["currentEquity"] == 10_000.0
        assert profile.riskLevel == "EXTREME"
        assert profile.launchMonth == "2026-07"


@pytest.mark.parametrize(
    ("high_voltage_id", "source_id"),
    [
        ("high-voltage-channel-raider", "channel-rider"),
        ("high-voltage-donchian-overdrive", "donchian-breakout"),
        ("high-voltage-trend-titan", "trend-sentinel"),
        ("high-voltage-liquidation-shock", "liquidation-pressure-sniper"),
        ("high-voltage-compression-detonator", "momentum-ignition"),
    ],
)
def test_high_voltage_keeps_source_breakeven_policy(high_voltage_id: str, source_id: str) -> None:
    high_voltage_policy = trader_holding_policy(high_voltage_id)
    source_policy = trader_holding_policy(source_id)

    assert high_voltage_policy.breakeven_progress_r == source_policy.breakeven_progress_r
    assert high_voltage_policy.first_take_profit_breakeven_progress == source_policy.first_take_profit_breakeven_progress


def test_high_voltage_margin_band_is_separate_from_standard_sizing() -> None:
    candidate = TradeCandidate(
        created=True,
        setupScore=80,
        audit={"leagueVariant": "high_voltage"},
    )

    assert minimum_margin_deployment_percent(_Settings(), candidate) == 6
    assert target_margin_deployment_percent(candidate, _Settings()) == 18
    assert minimum_margin_deployment_percent(_Settings()) == 20


def test_compression_detonator_accepts_moderate_completed_expansion() -> None:
    snapshot = _breakout_snapshot("momentum-ignition")
    completed = deepcopy(snapshot["timeframes"]["15m"]["completedLatestCandle"])
    completed.update({"open": 69_000.0, "high": 69_250.0, "low": 68_950.0, "close": 69_120.0})
    snapshot["price"] = completed["close"]
    snapshot["timeframes"]["15m"]["completedLatestCandle"] = completed
    snapshot["timeframes"]["15m"]["completedVolumeZscore"] = 0.08

    standard = get_strategy("momentum-ignition").evaluate(snapshot)
    aggressive = get_strategy("high-voltage-compression-detonator").evaluate(snapshot)

    assert standard.created is False
    assert aggressive.created is True
    assert [entry.weight for entry in aggressive.entries] == [0.7, 0.3]
    assert [target.weight for target in aggressive.takeProfits] == [0.25, 0.75]
    assert aggressive.leveragePlan is not None
    assert aggressive.leveragePlan.suggestedLeverage == 20
    assert aggressive.leveragePlan.maxLeverage == 20
    assert aggressive.audit["leagueVariant"] == "high_voltage"


def test_high_voltage_second_stage_preserves_aggressive_execution_mandate() -> None:
    strategy = get_strategy("high-voltage-compression-detonator")
    candidate = strategy.evaluate(_breakout_snapshot("momentum-ignition"))
    prompt = entry_approval_prompt(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=_breakout_snapshot("momentum-ignition"),
            candidate=candidate,
        )
    )

    assert trader_review_policy(strategy.profile.id)["leagueVariant"] == "high_voltage"
    assert "Do not reduce below 10x" in prompt
    assert "between 10 and leveragePlan.maxLeverage" in prompt


def test_high_voltage_review_cannot_reduce_execution_below_ten_x() -> None:
    candidate = get_strategy("high-voltage-compression-detonator").evaluate(
        _breakout_snapshot("momentum-ignition")
    )
    review = TradeReviewResult(
        decision="ADJUST_AND_APPROVE",
        confidence=80,
        riskLevel="EXTREME",
        leverageOverride=5,
        approvalReason="The completed compression release remains valid.",
        counterThesis="A completed close back inside the box invalidates the trade.",
    )

    plan = trade_plan_from_review("BTCUSDT", candidate, review)

    assert plan.leverage == 10
