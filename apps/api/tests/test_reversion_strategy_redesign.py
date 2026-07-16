import copy

import pytest

from app.traders.registry import get_strategy
from tests.test_trader_cycle import neutral_internal_derivatives, sample_snapshot


def _completed_candle(
    *,
    open_: float,
    high: float,
    low: float,
    close: float,
) -> dict[str, float | int]:
    return {
        "openTime": 1_000,
        "closeTime": 2_000,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": 1_600.0,
    }


def _base_reversion_snapshot() -> dict:
    snapshot = neutral_internal_derivatives(sample_snapshot())
    snapshot["marketRegime"].update({"primary": "range", "adx1h": 18.0, "adx4h": 18.0})
    snapshot["timeframes"]["4h"].update({"trend": "sideways", "adx14": 18.0})
    snapshot["timeframes"]["1h"].update({"trend": "sideways", "adx14": 18.0, "atr14": 1_000.0})
    snapshot["timeframes"]["15m"].update(
        {
            "rsi14": 50.0,
            "completedVolumeZscore": 0.3,
            "volumeZscore": 7.0,
            "completedCandle": _completed_candle(
                open_=68_100.0,
                high=68_300.0,
                low=67_900.0,
                close=68_200.0,
            ),
        }
    )
    snapshot["price"] = 68_200.0
    return snapshot


def _range_setup() -> dict:
    snapshot = _base_reversion_snapshot()
    snapshot["timeframes"]["1h"]["priorCompletedRange"] = {
        "high": 70_000.0,
        "low": 68_000.0,
        "candles": 20,
        "lastCloseTime": 900,
    }
    return snapshot


def _vwap_setup() -> dict:
    snapshot = _base_reversion_snapshot()
    snapshot["timeframes"]["15m"].update(
        {
            "barVwapProxy20": 68_000.0,
            "completedCandle": _completed_candle(
                open_=67_800.0,
                high=68_250.0,
                low=67_600.0,
                close=68_100.0,
            ),
        }
    )
    snapshot["price"] = 68_100.0
    return snapshot


def _rsi_divergence_setup() -> dict:
    snapshot = _base_reversion_snapshot()
    snapshot["timeframes"]["1h"].update(
        {
            "rsi14": 50.0,
            "confirmedRsiPivotDivergence": {
                "available": True,
                "direction": "bullish",
                "first_index": 120,
                "second_index": 134,
                "first_price": 68_300.0,
                "second_price": 67_900.0,
                "first_rsi": 29.0,
                "second_rsi": 35.0,
            },
        }
    )
    return snapshot


def _wyckoff_setup() -> dict:
    snapshot = _range_setup()
    snapshot["timeframes"]["15m"]["completedCandle"] = _completed_candle(
        open_=68_100.0,
        high=68_300.0,
        low=67_800.0,
        close=68_200.0,
    )
    return snapshot


def _bollinger_setup() -> dict:
    snapshot = _base_reversion_snapshot()
    snapshot["timeframes"]["15m"].update(
        {
            "rsi14": 32.0,
            "bollinger": {
                "middle": 69_000.0,
                "upper": 70_000.0,
                "lower": 68_000.0,
                "widthPercent": 2.9,
            },
            "completedCandle": _completed_candle(
                open_=67_900.0,
                high=68_400.0,
                low=67_800.0,
                close=68_200.0,
            ),
        }
    )
    return snapshot


@pytest.mark.parametrize(
    ("trader_id", "snapshot_factory", "expected_setup"),
    [
        ("range-maker", _range_setup, "LOW_RANGE_REVERSION_LONG"),
        ("vwap-reclaimer", _vwap_setup, "VWAP_RECLAIM_LONG"),
        ("rsi-divergence-scout", _rsi_divergence_setup, "BULLISH_RSI_DIVERGENCE_RECLAIM"),
        ("wyckoff-spring", _wyckoff_setup, "WYCKOFF_SPRING_LONG"),
        ("bollinger-reversion", _bollinger_setup, "LOW_BAND_MEAN_REVERSION_LONG"),
    ],
)
def test_reversion_strategy_accepts_only_completed_structural_signal(
    trader_id: str,
    snapshot_factory,
    expected_setup: str,
) -> None:
    candidate = get_strategy(trader_id).evaluate(snapshot_factory())

    assert candidate.created is True
    assert candidate.side == "LONG"
    assert candidate.setupType == expected_setup


@pytest.mark.parametrize(
    ("trader_id", "snapshot_factory"),
    [
        ("range-maker", _range_setup),
        ("vwap-reclaimer", _vwap_setup),
        ("rsi-divergence-scout", _rsi_divergence_setup),
        ("wyckoff-spring", _wyckoff_setup),
        ("bollinger-reversion", _bollinger_setup),
    ],
)
def test_unfinished_candle_cannot_repaint_reversion_direction(
    trader_id: str,
    snapshot_factory,
) -> None:
    snapshot = snapshot_factory()
    first = get_strategy(trader_id).evaluate(snapshot)
    mutated = copy.deepcopy(snapshot)
    mutated["timeframes"]["15m"].update(
        {
            "open": 70_000.0,
            "high": 71_000.0,
            "low": 67_000.0,
            "close": 67_100.0,
            "latestCandle": _completed_candle(
                open_=70_000.0,
                high=71_000.0,
                low=67_000.0,
                close=67_100.0,
            ),
        }
    )
    second = get_strategy(trader_id).evaluate(mutated)

    assert first.created is True
    assert second.created is True
    assert (second.side, second.setupType) == (first.side, first.setupType)


@pytest.mark.parametrize(
    ("trader_id", "snapshot_factory", "mutate"),
    [
        (
            "range-maker",
            _range_setup,
            lambda snapshot: snapshot["timeframes"]["15m"].update(
                {"completedCandle": _completed_candle(open_=68_050.0, high=68_250.0, low=68_010.0, close=68_200.0)}
            ),
        ),
        (
            "vwap-reclaimer",
            _vwap_setup,
            lambda snapshot: snapshot["timeframes"]["15m"].update({"barVwapProxy20": None}),
        ),
        (
            "rsi-divergence-scout",
            _rsi_divergence_setup,
            lambda snapshot: snapshot["timeframes"]["1h"].update(
                {"confirmedRsiPivotDivergence": {"available": True, "direction": "none"}}
            ),
        ),
        (
            "wyckoff-spring",
            _wyckoff_setup,
            lambda snapshot: snapshot["timeframes"]["15m"].update(
                {"completedCandle": _completed_candle(open_=68_050.0, high=68_250.0, low=67_930.0, close=68_200.0)}
            ),
        ),
        (
            "bollinger-reversion",
            _bollinger_setup,
            lambda snapshot: (
                snapshot["marketRegime"].update({"primary": "trend", "adx4h": 27.0}),
                snapshot["timeframes"]["4h"].update({"adx14": 27.0}),
            ),
        ),
    ],
)
def test_reversion_strategy_rejects_missing_or_hostile_confirmation(
    trader_id: str,
    snapshot_factory,
    mutate,
) -> None:
    snapshot = snapshot_factory()
    mutate(snapshot)

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False


@pytest.mark.parametrize(
    ("trader_id", "snapshot_factory"),
    [
        ("range-maker", _range_setup),
        ("vwap-reclaimer", _vwap_setup),
        ("rsi-divergence-scout", _rsi_divergence_setup),
        ("wyckoff-spring", _wyckoff_setup),
        ("bollinger-reversion", _bollinger_setup),
    ],
)
def test_reversion_strategies_fail_closed_without_completed_candle(
    trader_id: str,
    snapshot_factory,
) -> None:
    snapshot = snapshot_factory()
    frame = snapshot["timeframes"]["15m"]
    for key in ("completedCandle", "latestCompletedCandle", "completedLatestCandle"):
        frame.pop(key, None)

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False


def test_range_maker_fails_closed_without_completed_volume() -> None:
    snapshot = _range_setup()
    snapshot["timeframes"]["15m"].pop("completedVolumeZscore", None)

    candidate = get_strategy("range-maker").evaluate(snapshot)

    assert candidate.created is False
    assert "completed 15m volume" in candidate.reason.lower()


def test_vwap_weak_completed_volume_keeps_entry_but_reduces_risk() -> None:
    snapshot = _vwap_setup()
    snapshot["timeframes"]["15m"]["completedVolumeZscore"] = -0.05

    candidate = get_strategy("vwap-reclaimer").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.riskPercent == pytest.approx(0.35)
    assert candidate.audit["gateScores"]["weakCompletedVolume"] is True


def test_vwap_stop_floor_sits_outside_intraday_noise() -> None:
    snapshot = _vwap_setup()
    snapshot["timeframes"]["1h"]["atr14"] = 200.0

    candidate = get_strategy("vwap-reclaimer").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.stopLoss is not None
    assert snapshot["price"] - candidate.stopLoss >= snapshot["price"] * 0.0055
