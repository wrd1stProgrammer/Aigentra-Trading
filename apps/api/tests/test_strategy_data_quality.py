from app.market.derivatives import derivative_context
from app.paper.management import completed_taker_buy_ratio, taker_buy_ratio
from app.traders.models import EntryPlan, TakeProfitPlan
from app.traders.strategy_base import (
    candidate_geometry_errors,
    estimate_risk_reward,
    open_interest_available,
    taker_flow_available,
)


def _derivatives(*, oi_history: list[dict] | None = None, taker: list[dict] | None = None) -> dict:
    return derivative_context(
        open_interest={"openInterest": 0.0, "time": 0},
        premium_index={"markPrice": 100.0, "indexPrice": 100.0, "lastFundingRate": 0.0, "nextFundingTime": 0},
        open_interest_history=oi_history or [],
        funding_history=[],
        global_long_short=[],
        top_account_ratio=[],
        top_position_ratio=[],
        taker_buy_sell=taker or [],
    )


def test_missing_derivative_series_are_unavailable_not_directional() -> None:
    context = _derivatives()
    snapshot = {"derivatives": context}

    assert context["openInterestStats"]["available"] is False
    assert context["fundingStats"]["available"] is False
    assert context["takerBuySell"]["available"] is False
    assert context["takerBuySell"]["buyShare"] is None
    assert context["crowding"]["crowdedSide"] is None
    assert open_interest_available(snapshot) is False
    assert taker_flow_available(snapshot) is False


def test_derivative_series_become_available_only_with_valid_observations() -> None:
    context = _derivatives(
        oi_history=[
            {"sumOpenInterest": 100.0, "timestamp": 1},
            {"sumOpenInterest": 102.0, "timestamp": 2},
        ],
        taker=[{"buySellRatio": 1.2, "buyVol": 60.0, "sellVol": 50.0, "timestamp": 2}],
    )
    snapshot = {"derivatives": context}

    assert context["openInterestStats"]["available"] is True
    assert context["takerBuySell"]["available"] is True
    assert context["takerBuySell"]["buyShare"] > 0.5
    assert open_interest_available(snapshot) is True
    assert taker_flow_available(snapshot) is True


def test_malformed_derivative_rows_remain_unavailable() -> None:
    context = _derivatives(oi_history=[{}], taker=[{"buyVol": 10.0}])

    assert context["openInterestStats"]["available"] is False
    assert context["openInterestStats"]["historyAvailable"] is False
    assert context["takerBuySell"]["available"] is False
    assert context["takerBuySell"]["buyShare"] is None

    inconsistent = _derivatives(
        taker=[{"buySellRatio": 100.0, "buyVol": 10.0, "sellVol": 10.0, "timestamp": 1}]
    )
    assert inconsistent["takerBuySell"]["available"] is False


def test_non_finite_and_malformed_current_derivatives_fail_closed_without_raising() -> None:
    context = derivative_context(
        open_interest={"openInterest": float("inf"), "time": 0},
        premium_index={"markPrice": float("nan"), "indexPrice": 100.0, "lastFundingRate": "invalid", "nextFundingTime": 10},
        open_interest_history=[],
        funding_history=[{"fundingRate": float("nan")}],
        global_long_short=[],
        top_account_ratio=[],
        top_position_ratio=[],
        taker_buy_sell=[{"buySellRatio": float("inf"), "buyVol": 10.0, "sellVol": 10.0, "timestamp": 1}],
    )

    assert context["openInterestStats"]["available"] is False
    assert context["fundingStats"]["available"] is False
    assert context["takerBuySell"]["available"] is False


def test_single_oi_observation_does_not_claim_a_thirty_minute_change() -> None:
    context = _derivatives(oi_history=[{"sumOpenInterest": 100.0, "timestamp": 1}])

    assert context["openInterestStats"]["available"] is True
    assert context["openInterestStats"]["changeAvailable30m"] is False
    assert context["openInterestStats"]["changePercent30m"] is None


def test_net_risk_reward_subtracts_round_trip_cost_from_reward() -> None:
    entries = [EntryPlan(price=100.0, weight=1.0, reason="entry")]
    take_profits = [TakeProfitPlan(price=102.0, weight=1.0, reason="target")]

    risk_reward = estimate_risk_reward("LONG", entries, 99.0, take_profits, fee_buffer_percent=0.1)

    assert risk_reward == 1.73


def test_narrow_first_target_fails_explicit_net_cost_hurdle() -> None:
    entries = [EntryPlan(price=100.0, weight=1.0, reason="entry")]
    take_profits = [TakeProfitPlan(price=100.2, weight=1.0, reason="target")]

    errors = candidate_geometry_errors(
        "LONG",
        100.0,
        entries,
        99.0,
        take_profits,
        min_risk_reward=0.0,
        fee_buffer_percent=0.1,
    )

    assert "net_cost_hurdle_failed" in errors


def test_unavailable_candle_taker_volume_is_neutral_in_management() -> None:
    snapshot = {
        "timeframes": {
            "15m": {
                "latestCandle": {"volume": 100.0, "takerBuyBaseVolume": 0.0},
                "completedCandle": {"volume": 100.0, "takerBuyBaseVolume": 0.0},
            }
        },
        "derivatives": {"takerBuySell": {"available": False}},
    }

    assert taker_buy_ratio(snapshot) == 0.5
    assert completed_taker_buy_ratio(snapshot) == 0.5
