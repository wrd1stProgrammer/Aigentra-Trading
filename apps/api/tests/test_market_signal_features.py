from types import SimpleNamespace

import pytest

import app.market.snapshot as snapshot_module
from app.clients.binance_client import Candle
from app.market.strategy_signals import (
    _unique_pivot_indices,
    confirmed_rsi_pivot_divergence,
    ichimoku_state,
)


INTERVAL_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}


def _candles(interval: str, *, live_close: float = 500.0) -> list[Candle]:
    interval_ms = INTERVAL_MS[interval]
    snapshot_time = 1_800_000_000_000
    start = snapshot_time - interval_ms * 180
    candles: list[Candle] = []
    for index in range(180):
        close = 100.0 + index * 0.25
        open_time = start + interval_ms * index
        candles.append(
            Candle(
                openTime=open_time,
                open=close - 0.1,
                high=close + 0.5,
                low=close - 0.5,
                close=close,
                volume=100.0 + index,
                closeTime=open_time + interval_ms - 1,
                quoteVolume=0.0,
                trades=10,
                takerBuyBaseVolume=0.0,
                takerBuyQuoteVolume=0.0,
            )
        )
    live = candles[-1]
    candles[-1] = live.model_copy(
        update={
            "openTime": snapshot_time,
            "closeTime": snapshot_time + interval_ms - 1,
            "open": live_close - 10.0,
            "high": live_close + 10.0,
            "low": live_close - 20.0,
            "close": live_close,
            "volume": 10_000.0,
        }
    )
    return candles


async def _snapshot(
    monkeypatch: pytest.MonkeyPatch,
    *,
    live_close: float,
    current_time: float = 1_800_000_000.0,
) -> dict:
    candles_by_interval = {
        interval: _candles(interval, live_close=live_close)
        for interval in INTERVAL_MS
    }

    async def fake_klines(_client, *, symbol: str, interval: str, limit: int) -> list[Candle]:
        assert symbol == "BTCUSDT"
        return candles_by_interval[interval][-limit:]

    async def fake_derivative(_client, _symbol: str, name: str) -> dict:
        if name == "open_interest":
            return {"openInterest": 100.0, "time": 1_799_999_999_000}
        return {
            "markPrice": 144.5,
            "indexPrice": 144.5,
            "lastFundingRate": 0.0,
            "nextFundingTime": 0,
        }

    async def fake_series(_client, _symbol: str, _name: str, **_kwargs) -> list[dict]:
        return []

    async def fake_external(_symbol: str) -> dict:
        return {
            "coinalyze": {"available": False},
            "deribit": {"available": False},
        }

    monkeypatch.setattr(snapshot_module, "cached_klines", fake_klines)
    monkeypatch.setattr(snapshot_module, "cached_derivative", fake_derivative)
    monkeypatch.setattr(snapshot_module, "cached_series", fake_series)
    monkeypatch.setattr(snapshot_module, "cached_external_derivatives", fake_external)
    monkeypatch.setattr(snapshot_module.time, "time", lambda: current_time)
    return await snapshot_module.build_market_snapshot(SimpleNamespace(), "BTCUSDT")


@pytest.mark.asyncio
async def test_snapshot_exposes_completed_strategy_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _snapshot(monkeypatch, live_close=500.0)

    assert result["timeframes"]["15m"]["barVwapProxy20"] == pytest.approx(142.55, rel=0.02)
    assert result["timeframes"]["15m"]["priorCompletedRange"]["candles"] == 4
    assert "confirmedRsiPivotDivergence" in result["timeframes"]["1h"]
    assert result["timeframes"]["1h"]["ichimoku"]["available"] is True
    assert result["timeframes"]["4h"]["ichimoku"]["available"] is True


@pytest.mark.asyncio
async def test_unfinished_candle_cannot_repaint_strategy_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    first = await _snapshot(monkeypatch, live_close=500.0)
    second = await _snapshot(monkeypatch, live_close=50.0)

    for interval in ("15m", "1h", "4h"):
        first_frame = first["timeframes"][interval]
        second_frame = second["timeframes"][interval]
        assert first_frame["barVwapProxy20"] == second_frame["barVwapProxy20"]
        assert first_frame["bollinger"] == second_frame["bollinger"]
    assert first["timeframes"]["1h"]["confirmedRsiPivotDivergence"] == second["timeframes"]["1h"]["confirmedRsiPivotDivergence"]
    assert first["timeframes"]["1h"]["ichimoku"] == second["timeframes"]["1h"]["ichimoku"]


@pytest.mark.asyncio
async def test_snapshot_fails_closed_when_provider_has_no_completed_candle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = await _snapshot(monkeypatch, live_close=500.0, current_time=1_700_000_000.0)

    for interval in ("15m", "1h", "4h"):
        frame = result["timeframes"][interval]
        assert frame["completedSignalsAvailable"] is False
        assert frame["barVwapProxy20"] is None
        assert "completedCandle" not in frame
    assert result["timeframes"]["1h"]["ichimoku"]["available"] is False


def test_rsi_pivot_confirmation_rejects_tied_plateau_extremes() -> None:
    candles = _candles("1h")[:5]
    lows = [3.0, 2.0, 2.0, 3.0, 4.0]
    highs = [5.0, 7.0, 7.0, 6.0, 5.0]
    candles = [
        candle.model_copy(update={"low": low, "high": high})
        for candle, low, high in zip(candles, lows, highs)
    ]

    low_pivots, high_pivots = _unique_pivot_indices(candles, left=1, right=1)

    assert low_pivots == []
    assert high_pivots == []


def test_ichimoku_cloud_uses_spans_displaced_from_twenty_six_bars_ago() -> None:
    candles = _candles("1h")[:78]

    state = ichimoku_state(candles)

    source_index = len(candles) - 1 - 26
    projected_tenkan_sample = candles[source_index - 8 : source_index + 1]
    projected_kijun_sample = candles[source_index - 25 : source_index + 1]
    expected_tenkan = (
        max(candle.high for candle in projected_tenkan_sample)
        + min(candle.low for candle in projected_tenkan_sample)
    ) / 2
    expected_kijun = (
        max(candle.high for candle in projected_kijun_sample)
        + min(candle.low for candle in projected_kijun_sample)
    ) / 2
    projected_span_b_sample = candles[source_index - 51 : source_index + 1]
    expected_span_b = (
        max(candle.high for candle in projected_span_b_sample)
        + min(candle.low for candle in projected_span_b_sample)
    ) / 2

    assert state.available is True
    assert state.span_a == pytest.approx((expected_tenkan + expected_kijun) / 2)
    assert state.span_b == pytest.approx(expected_span_b)
    assert state.span_a != pytest.approx((state.tenkan + state.kijun) / 2)


def test_frozen_range_rejects_missing_or_noncontiguous_source_bars() -> None:
    candles = _candles("15m")[:6]
    signal_close_time = candles[-1].closeTime + 1
    contiguous = snapshot_module.prior_completed_range(candles, signal_close_time, lookback=4)
    broken = list(candles)
    broken[-2] = broken[-2].model_copy(update={"openTime": broken[-2].openTime + 60_000})

    assert contiguous is not None
    assert contiguous["firstOpenTime"] == candles[-4].openTime
    assert contiguous["lastCloseTime"] == candles[-1].closeTime
    assert snapshot_module.prior_completed_range(broken, signal_close_time, lookback=4) is None


def test_wilder_rsi_positive_divergence_pins_confirmed_pivots_and_values() -> None:
    closes = [
        100, 99, 97, 98, 101, 98, 95, 97, 94, 93, 95, 92, 94, 92, 89, 86, 87, 88, 85, 83,
        80, 82, 83, 80, 82, 79, 77, 80, 83, 85, 82, 84, 86, 87, 84, 82, 79, 81, 79, 78,
        79, 77, 79, 76, 78, 77, 79, 82, 80, 77, 79, 81, 84, 82, 81, 78, 80, 83, 80, 82,
    ]
    template = _candles("1h")[0]
    candles = [
        template.model_copy(
            update={"openTime": index, "closeTime": index, "open": close, "high": close + 0.4, "low": close - 0.4, "close": close}
        )
        for index, close in enumerate(closes)
    ]

    divergence = confirmed_rsi_pivot_divergence(candles)

    assert divergence.direction == "bullish"
    assert (divergence.first_index, divergence.second_index) == (30, 55)
    assert divergence.first_price == pytest.approx(81.6)
    assert divergence.second_price == pytest.approx(77.6)
    assert divergence.first_rsi == pytest.approx(41.16237, rel=1e-5)
    assert divergence.second_rsi == pytest.approx(44.35147, rel=1e-5)
