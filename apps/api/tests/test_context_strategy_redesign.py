from datetime import datetime, timedelta, timezone

import pytest

from app.traders.registry import get_strategy
from tests.test_trader_cycle import neutral_internal_derivatives, sample_snapshot


def _completed_candle(open_: float, high: float, low: float, close: float) -> dict:
    return {
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": 1_500.0,
        "openTime": 1_800_000,
        "closeTime": 2_700_000,
    }


def _pullback_snapshot(*, confirmed: bool = True) -> dict:
    snapshot = neutral_internal_derivatives(sample_snapshot())
    snapshot["price"] = 67_850.0
    snapshot["timeframes"]["1h"].update(
        {
            "ema20": 67_800.0,
            "ema50": 67_200.0,
            "rsi14": 49.0,
            "atr14": 650.0,
            "swings": {"highs": [68_600.0], "lows": [66_800.0]},
        }
    )
    snapshot["timeframes"]["4h"].update(
        {"trend": "bullish", "ema20": 67_100.0, "ema50": 65_900.0}
    )
    close = 67_850.0 if confirmed else 67_650.0
    snapshot["timeframes"]["15m"]["latestCompletedCandle"] = _completed_candle(
        67_600.0, 67_920.0, 67_300.0, close
    )
    snapshot["timeframes"]["15m"]["latestCandle"] = _completed_candle(
        68_100.0, 68_500.0, 67_900.0, 68_400.0
    )
    return snapshot


def _funding_snapshot(*, optional_flow_available: bool) -> dict:
    snapshot = neutral_internal_derivatives(sample_snapshot())
    snapshot["price"] = 68_000.0
    snapshot["timeframes"]["4h"]["trend"] = "sideways"
    snapshot["timeframes"]["1h"].update(
        {
            "priceChange": {"1": 0.0008},
            "atr14": 700.0,
            "swings": {"highs": [68_450.0], "lows": [67_400.0]},
        }
    )
    snapshot["timeframes"]["15m"]["latestCompletedCandle"] = _completed_candle(
        68_180.0, 68_260.0, 67_920.0, 68_000.0
    )
    snapshot["timeframes"]["15m"]["latestCandle"] = _completed_candle(
        67_900.0, 68_500.0, 67_850.0, 68_420.0
    )
    snapshot["derivatives"].update(
        {
            "fundingRate": 0.00009,
            "markPrice": 68_040.0,
            "indexPrice": 68_000.0,
            "openInterest": 123_000.0 if optional_flow_available else 0.0,
        }
    )
    snapshot["derivatives"]["fundingStats"].update(
        {"historyAvailable": True, "absPercentile": 93.0, "latest": 0.00009}
    )
    snapshot["derivatives"]["crowding"].update(
        {"crowdedSide": "LONG", "longCrowded": True, "shortCrowded": False}
    )
    if optional_flow_available:
        snapshot["derivatives"]["openInterestStats"].update(
            {"historyAvailable": True, "changePercent30m": 1.4}
        )
        snapshot["derivatives"]["takerBuySell"].update(
            {"buySellRatio": 1.3, "buyVol": 1_300.0, "sellVol": 1_000.0}
        )
    return snapshot


def _ichimoku_snapshot(*, available: bool = True) -> dict:
    snapshot = neutral_internal_derivatives(sample_snapshot())
    snapshot["price"] = 68_050.0
    snapshot["timeframes"]["1h"].update(
        {
            "ichimoku": {
                "available": available,
                "tenkan": 67_950.0,
                "kijun": 67_700.0,
                "cloudTop": 67_800.0,
                "cloudBottom": 67_350.0,
            },
            "latestCompletedCandle": _completed_candle(67_700.0, 68_120.0, 67_600.0, 68_050.0),
        }
    )
    snapshot["timeframes"]["4h"].update(
        {
            "trend": "bullish",
            "ichimoku": {
                "available": available,
                "tenkan": 67_500.0,
                "kijun": 67_100.0,
                "cloudTop": 66_900.0,
                "cloudBottom": 66_200.0,
            },
            "latestCompletedCandle": _completed_candle(67_300.0, 68_200.0, 67_100.0, 68_000.0),
        }
    )
    return snapshot


def _skew_snapshot() -> dict:
    snapshot = neutral_internal_derivatives(sample_snapshot())
    snapshot["price"] = 68_050.0
    snapshot["timeframes"]["1h"].update({"ema20": 67_900.0, "rsi14": 48.0})
    snapshot["timeframes"]["4h"]["trend"] = "sideways"
    snapshot["timeframes"]["15m"]["latestCompletedCandle"] = _completed_candle(
        67_850.0, 68_120.0, 67_700.0, 68_050.0
    )
    snapshot["timeframes"]["15m"]["latestCandle"] = _completed_candle(
        68_200.0, 68_300.0, 67_600.0, 67_700.0
    )
    snapshot["externalDerivatives"] = {
        "deribit": {
            "available": True,
            "source": "deribit",
            "putCallIvSpread": 6.2,
            "putCallIvSpreadZscore": 1.6,
            "skewSampleCount": 12,
            "skewPersistence": 2,
            "expiryDays": 21,
            "sameExpiry": True,
            "callPutVolumeRatio": 0.8,
            "ivPercentile": 72.0,
            "realizedVolatility30d": 58.0,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
    }
    return snapshot


def test_pullback_requires_completed_ema20_recovery_and_uses_two_slices() -> None:
    candidate = get_strategy("pullback-architect").evaluate(_pullback_snapshot())

    assert candidate.created is True
    assert candidate.side == "LONG"
    assert [entry.weight for entry in candidate.entries] == [0.4, 0.6]


def test_pullback_rejects_zone_touch_without_completed_recovery() -> None:
    candidate = get_strategy("pullback-architect").evaluate(_pullback_snapshot(confirmed=False))

    assert candidate.created is False
    assert "completed 15m" in candidate.reason.lower()


def test_pullback_rejects_doji_recovery_without_directional_follow_through() -> None:
    snapshot = _pullback_snapshot()
    snapshot["timeframes"]["15m"]["latestCompletedCandle"] = _completed_candle(
        67_840.0, 67_920.0, 67_300.0, 67_850.0
    )

    candidate = get_strategy("pullback-architect").evaluate(snapshot)

    assert candidate.created is False
    assert "directional" in candidate.reason.lower()


def test_pullback_stop_keeps_minimum_atr_room_beyond_final_scale() -> None:
    snapshot = _pullback_snapshot()
    snapshot["timeframes"]["1h"]["swings"] = {
        "highs": [68_600.0],
        "lows": [67_550.0],
    }

    candidate = get_strategy("pullback-architect").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.stopLoss is not None
    deepest_entry = min(entry.price for entry in candidate.entries)
    assert deepest_entry - candidate.stopLoss >= snapshot["timeframes"]["1h"]["atr14"] * 0.60


def test_funding_extreme_can_trade_without_optional_flow_at_reduced_risk() -> None:
    candidate = get_strategy("funding-contrarian").evaluate(
        _funding_snapshot(optional_flow_available=False)
    )

    assert candidate.created is True
    assert candidate.side == "SHORT"
    assert candidate.riskPercent == pytest.approx(0.30)


def test_funding_does_not_treat_single_oi_sample_as_unwinding_confirmation() -> None:
    snapshot = _funding_snapshot(optional_flow_available=False)
    snapshot["derivatives"]["openInterestStats"].update(
        {"available": True, "historyAvailable": True, "changeAvailable30m": False, "changePercent30m": None}
    )

    candidate = get_strategy("funding-contrarian").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.riskPercent == pytest.approx(0.30)


def test_funding_available_flow_can_veto_crowded_side_acceleration() -> None:
    candidate = get_strategy("funding-contrarian").evaluate(
        _funding_snapshot(optional_flow_available=True)
    )

    assert candidate.created is False
    assert "open interest is still expanding" in candidate.reason.lower()


def test_real_ichimoku_requires_cloud_data_and_completed_recovery() -> None:
    accepted = get_strategy("ichimoku-cloud-pilot").evaluate(_ichimoku_snapshot())
    rejected = get_strategy("ichimoku-cloud-pilot").evaluate(
        _ichimoku_snapshot(available=False)
    )

    assert accepted.created is True
    assert accepted.side == "LONG"
    assert rejected.created is False
    assert "ichimoku" in rejected.reason.lower()


@pytest.mark.parametrize(
    ("field", "value", "reason_fragment"),
    [
        ("updatedAt", (datetime.now(timezone.utc) - timedelta(minutes=11)).isoformat(), "stale"),
        ("sameExpiry", False, "expiry"),
        ("expiryDays", 60, "expiry"),
        ("skewPersistence", 1, "persistent"),
    ],
)
def test_options_skew_rejects_invalid_context(
    field: str, value: object, reason_fragment: str
) -> None:
    snapshot = _skew_snapshot()
    snapshot["externalDerivatives"]["deribit"][field] = value

    candidate = get_strategy("volatility-skew-sentinel").evaluate(snapshot)

    assert candidate.created is False
    assert reason_fragment in candidate.reason.lower()


def test_options_skew_uses_completed_price_confirmation() -> None:
    first = get_strategy("volatility-skew-sentinel").evaluate(_skew_snapshot())
    mutated = _skew_snapshot()
    mutated["timeframes"]["15m"]["latestCandle"].update(
        {"open": 68_400.0, "high": 68_500.0, "low": 67_500.0, "close": 67_600.0}
    )
    second = get_strategy("volatility-skew-sentinel").evaluate(mutated)

    assert first.created is True
    assert second.created is True
    assert first.side == second.side == "LONG"


def test_options_skew_fails_closed_without_completed_candle() -> None:
    snapshot = _skew_snapshot()
    snapshot["timeframes"]["15m"]["completedSignalsAvailable"] = False
    snapshot["timeframes"]["15m"].pop("latestCompletedCandle")

    candidate = get_strategy("volatility-skew-sentinel").evaluate(snapshot)

    assert candidate.created is False
    assert "completed" in candidate.reason.lower()


@pytest.mark.parametrize(
    ("trader_id", "snapshot_factory", "interval"),
    [
        ("pullback-architect", lambda: _pullback_snapshot(), "15m"),
        ("funding-contrarian", lambda: _funding_snapshot(optional_flow_available=False), "15m"),
        ("ichimoku-cloud-pilot", lambda: _ichimoku_snapshot(), "1h"),
    ],
)
def test_context_strategies_fail_closed_without_required_completed_candle(
    trader_id: str,
    snapshot_factory,
    interval: str,
) -> None:
    snapshot = snapshot_factory()
    frame = snapshot["timeframes"][interval]
    for key in ("completedCandle", "latestCompletedCandle", "completedLatestCandle"):
        frame.pop(key, None)

    candidate = get_strategy(trader_id).evaluate(snapshot)

    assert candidate.created is False
