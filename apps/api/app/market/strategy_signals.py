from dataclasses import dataclass
from statistics import mean

from app.clients.binance_client import Candle


@dataclass(frozen=True)
class RsiPivotDivergence:
    available: bool
    direction: str
    first_index: int | None = None
    second_index: int | None = None
    first_price: float | None = None
    second_price: float | None = None
    first_rsi: float | None = None
    second_rsi: float | None = None


@dataclass(frozen=True)
class IchimokuState:
    available: bool
    tenkan: float | None = None
    kijun: float | None = None
    span_a: float | None = None
    span_b: float | None = None
    cloud_top: float | None = None
    cloud_bottom: float | None = None


def bar_vwap_proxy(candles: list[Candle], period: int = 20) -> float | None:
    if period <= 0 or len(candles) < period:
        return None
    sample = candles[-period:]
    total_volume = sum(candle.volume for candle in sample)
    if total_volume <= 0:
        return None
    weighted_typical_price = sum(
        ((candle.high + candle.low + candle.close) / 3.0) * candle.volume
        for candle in sample
    )
    return weighted_typical_price / total_volume


def confirmed_rsi_pivot_divergence(
    candles: list[Candle],
    *,
    period: int = 14,
    left: int = 2,
    right: int = 2,
    minimum_separation: int = 3,
    maximum_separation: int = 30,
) -> RsiPivotDivergence:
    if len(candles) <= period + left + right:
        return RsiPivotDivergence(available=False, direction="none")

    rsi_values = _rolling_rsi([candle.close for candle in candles], period)
    lows, highs = _unique_pivot_indices(candles, left=left, right=right)

    bullish = _latest_divergent_pair(
        candles,
        rsi_values,
        lows,
        direction="bullish",
        minimum_separation=minimum_separation,
        maximum_separation=maximum_separation,
    )
    bearish = _latest_divergent_pair(
        candles,
        rsi_values,
        highs,
        direction="bearish",
        minimum_separation=minimum_separation,
        maximum_separation=maximum_separation,
    )
    if bullish is None and bearish is None:
        return RsiPivotDivergence(available=True, direction="none")
    if bearish is None or (bullish is not None and bullish.second_index > bearish.second_index):
        return bullish or RsiPivotDivergence(available=True, direction="none")
    return bearish


def _unique_pivot_indices(
    candles: list[Candle],
    *,
    left: int,
    right: int,
) -> tuple[list[int], list[int]]:
    lows: list[int] = []
    highs: list[int] = []
    for index in range(left, len(candles) - right):
        window = candles[index - left : index + right + 1]
        candle = candles[index]
        window_lows = [item.low for item in window]
        window_highs = [item.high for item in window]
        if candle.low == min(window_lows) and window_lows.count(candle.low) == 1:
            lows.append(index)
        if candle.high == max(window_highs) and window_highs.count(candle.high) == 1:
            highs.append(index)
    return lows, highs


def ichimoku_state(candles: list[Candle]) -> IchimokuState:
    if len(candles) < 78:
        return IchimokuState(available=False)
    current_index = len(candles) - 1
    projected_source_index = current_index - 26
    tenkan = _midpoint(candles, current_index, 9)
    kijun = _midpoint(candles, current_index, 26)
    projected_tenkan = _midpoint(candles, projected_source_index, 9)
    projected_kijun = _midpoint(candles, projected_source_index, 26)
    span_a = (projected_tenkan + projected_kijun) / 2.0
    span_b = _midpoint(candles, projected_source_index, 52)
    return IchimokuState(
        available=True,
        tenkan=tenkan,
        kijun=kijun,
        span_a=span_a,
        span_b=span_b,
        cloud_top=max(span_a, span_b),
        cloud_bottom=min(span_a, span_b),
    )


def _rolling_rsi(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return result
    gains = [max(values[index] - values[index - 1], 0.0) for index in range(1, len(values))]
    losses = [abs(min(values[index] - values[index - 1], 0.0)) for index in range(1, len(values))]
    average_gain = mean(gains[:period])
    average_loss = mean(losses[:period])
    result[period] = 100.0 if average_loss == 0 else 100.0 - (100.0 / (1.0 + average_gain / average_loss))
    for index in range(period + 1, len(values)):
        average_gain = (average_gain * (period - 1) + gains[index - 1]) / period
        average_loss = (average_loss * (period - 1) + losses[index - 1]) / period
        result[index] = 100.0 if average_loss == 0 else 100.0 - (100.0 / (1.0 + average_gain / average_loss))
    return result


def _latest_divergent_pair(
    candles: list[Candle],
    rsi_values: list[float | None],
    pivots: list[int],
    *,
    direction: str,
    minimum_separation: int,
    maximum_separation: int,
) -> RsiPivotDivergence | None:
    for second in reversed(pivots):
        for first in reversed(pivots):
            separation = second - first
            if separation < minimum_separation:
                continue
            if separation > maximum_separation:
                break
            first_rsi = rsi_values[first]
            second_rsi = rsi_values[second]
            if first_rsi is None or second_rsi is None:
                continue
            if direction == "bullish":
                first_price, second_price = candles[first].low, candles[second].low
                divergent = second_price < first_price and second_rsi > first_rsi
            else:
                first_price, second_price = candles[first].high, candles[second].high
                divergent = second_price > first_price and second_rsi < first_rsi
            if divergent:
                return RsiPivotDivergence(
                    available=True,
                    direction=direction,
                    first_index=first,
                    second_index=second,
                    first_price=first_price,
                    second_price=second_price,
                    first_rsi=first_rsi,
                    second_rsi=second_rsi,
                )
    return None


def _midpoint(candles: list[Candle], end_index: int, period: int) -> float:
    sample = candles[end_index - period + 1 : end_index + 1]
    return (max(candle.high for candle in sample) + min(candle.low for candle in sample)) / 2.0
