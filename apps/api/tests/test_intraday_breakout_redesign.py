from copy import deepcopy
from datetime import datetime, timezone

import pytest

from app.traders.registry import get_strategy
from tests.test_trader_cycle import neutral_internal_derivatives, sample_snapshot


def _candle(
    open_: float,
    high: float,
    low: float,
    close: float,
    *,
    open_time: int,
    volume: float = 2_400.0,
) -> dict:
    return {
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "openTime": open_time,
        "takerBuyBaseVolume": 0.0,
    }


def _breakout_snapshot(trader_id: str) -> dict:
    snapshot = neutral_internal_derivatives(sample_snapshot())
    open_time = int(datetime(2026, 1, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    completed = _candle(68_980.0, 69_240.0, 68_940.0, 69_180.0, open_time=open_time)
    snapshot["price"] = completed["close"]
    snapshot["timeframes"]["15m"].update(
        {
            "open": completed["open"],
            "high": completed["high"],
            "low": completed["low"],
            "close": completed["close"],
            "volumeZscore": 1.25,
            "completedVolumeZscore": 1.25,
            "atr14": 220.0,
            "completedLatestCandle": completed,
            "latestCandle": deepcopy(completed),
            "priorCompletedRange": {
                "high": 69_000.0,
                "low": 68_600.0,
                "candles": 4,
                "firstOpenTime": open_time - 3_600_000,
                "lastCloseTime": open_time - 1,
            },
            "priorCompletedRange20": {"high": 69_000.0, "low": 67_800.0, "candles": 20},
        }
    )
    snapshot["timeframes"]["1h"].update(
        {
            "open": 68_500.0,
            "high": 69_000.0,
            "low": 67_800.0,
            "close": 68_900.0,
            "atr14": 500.0,
            "trend": "bullish",
            "priorCompletedRange": {"high": 69_000.0, "low": 67_800.0, "candles": 20},
            "swings": {"highs": [68_300.0, 68_700.0], "lows": [67_800.0, 68_000.0]},
            "channel": {"lower": 67_800.0, "mid": 68_400.0, "upper": 69_000.0, "position": 0.9},
        }
    )
    snapshot["timeframes"]["4h"].update({"trend": "bullish"})
    snapshot["marketRegime"].update(
        {
            "primary": "squeeze" if trader_id == "momentum-ignition" else "trend",
            "adx1h": 20.0,
            "bollingerWidth1h": 1.8,
            "keltnerWidth1h": 2.1,
            "volumeZscore15m": 1.25,
        }
    )
    return snapshot


@pytest.mark.parametrize(
    ("trader_id", "setup_type"),
    [
        ("session-raider", "SESSION_RANGE_BREAK_LONG"),
        ("orderflow-sniper", "SESSION_ORB_BREAKOUT_LONG"),
        ("momentum-ignition", "VOLATILITY_COMPRESSION_IGNITION_LONG"),
        ("volume-breaker", "VOLUME_BREAKOUT_RETEST_LONG"),
    ],
)
def test_breakout_traders_accept_completed_close_outside_frozen_range(
    trader_id: str,
    setup_type: str,
) -> None:
    candidate = get_strategy(trader_id).evaluate(_breakout_snapshot(trader_id))

    assert candidate.created is True
    assert candidate.side == "LONG"
    assert candidate.setupType == setup_type


@pytest.mark.parametrize(
    "trader_id",
    ["session-raider", "orderflow-sniper", "momentum-ignition", "volume-breaker"],
)
def test_breakout_traders_reject_completed_close_inside_frozen_range(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    inside = _candle(
        68_900.0,
        69_120.0,
        68_820.0,
        68_980.0,
        open_time=snapshot["timeframes"]["15m"]["completedLatestCandle"]["openTime"],
    )
    snapshot["price"] = inside["close"]
    snapshot["timeframes"]["15m"]["completedLatestCandle"] = inside
    snapshot["timeframes"]["15m"]["latestCandle"] = deepcopy(inside)

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False


@pytest.mark.parametrize(
    "trader_id",
    ["session-raider", "orderflow-sniper", "momentum-ignition", "volume-breaker"],
)
def test_live_candle_cannot_repaint_completed_breakout_decision(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    baseline = get_strategy(trader_id).evaluate(snapshot)
    snapshot["timeframes"]["15m"]["latestCandle"] = _candle(
        69_180.0,
        69_260.0,
        68_400.0,
        68_500.0,
        open_time=snapshot["timeframes"]["15m"]["completedLatestCandle"]["openTime"] + 900_000,
        volume=8_000.0,
    )

    after_live_move = get_strategy(trader_id).evaluate(snapshot)

    assert baseline.created is True
    assert (after_live_move.created, after_live_move.side, after_live_move.setupType) == (
        baseline.created,
        baseline.side,
        baseline.setupType,
    )


@pytest.mark.parametrize(
    "trader_id",
    ["session-raider", "orderflow-sniper", "momentum-ignition", "volume-breaker"],
)
def test_completed_breakout_is_not_executable_after_live_price_reenters_range(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    snapshot["price"] = 68_500.0

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False


@pytest.mark.parametrize(
    "trader_id",
    ["session-raider", "orderflow-sniper", "momentum-ignition", "volume-breaker"],
)
def test_breakout_traders_fail_closed_without_completed_candle(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    frame = snapshot["timeframes"]["15m"]
    for key in ("completedCandle", "latestCompletedCandle", "completedLatestCandle"):
        frame.pop(key, None)

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False


@pytest.mark.parametrize(
    "trader_id",
    ["session-raider", "orderflow-sniper", "momentum-ignition", "volume-breaker"],
)
def test_valid_live_execution_price_preserves_safe_long_fill_geometry(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    snapshot["price"] = 69_050.0

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is True
    assert candidate.side == "LONG"
    assert candidate.stopLoss < min(entry.price for entry in candidate.entries)
    assert max(entry.price for entry in candidate.entries) <= snapshot["price"]
    assert all(target.price > candidate.entries[0].price for target in candidate.takeProfits)


@pytest.mark.parametrize("trader_id", ["session-raider", "orderflow-sniper"])
def test_session_breakout_rejects_stale_or_noncontiguous_prior_hour(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    snapshot["timeframes"]["15m"]["priorCompletedRange"]["firstOpenTime"] -= 900_000

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False


@pytest.mark.parametrize(
    "trader_id",
    ["session-raider", "orderflow-sniper", "momentum-ignition", "volume-breaker"],
)
def test_breakout_traders_fail_closed_without_completed_volume(trader_id: str) -> None:
    snapshot = _breakout_snapshot(trader_id)
    snapshot["timeframes"]["15m"].pop("completedVolumeZscore", None)

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False
