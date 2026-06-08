from math import sqrt
from statistics import mean
from typing import Dict, List, Optional

from app.clients.binance_client import Candle


def ema(values: List[float], period: int) -> Optional[float]:
    if len(values) < period or period <= 0:
        return None
    multiplier = 2 / (period + 1)
    current = mean(values[:period])
    for value in values[period:]:
        current = (value - current) * multiplier + current
    return current


def rsi(values: List[float], period: int = 14) -> Optional[float]:
    if len(values) <= period:
        return None
    gains: List[float] = []
    losses: List[float] = []
    for idx in range(1, len(values)):
        delta = values[idx] - values[idx - 1]
        gains.append(max(delta, 0.0))
        losses.append(abs(min(delta, 0.0)))
    avg_gain = mean(gains[-period:])
    avg_loss = mean(losses[-period:])
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def atr(candles: List[Candle], period: int = 14) -> Optional[float]:
    if len(candles) <= period:
        return None
    true_ranges: List[float] = []
    for idx in range(1, len(candles)):
        candle = candles[idx]
        previous_close = candles[idx - 1].close
        true_ranges.append(
            max(
                candle.high - candle.low,
                abs(candle.high - previous_close),
                abs(candle.low - previous_close),
            )
        )
    return mean(true_ranges[-period:])


def standard_deviation(values: List[float]) -> Optional[float]:
    if not values:
        return None
    avg = mean(values)
    variance = mean([(value - avg) ** 2 for value in values])
    return sqrt(variance)


def sma(values: List[float], period: int) -> Optional[float]:
    if len(values) < period or period <= 0:
        return None
    return mean(values[-period:])


def bollinger_state(values: List[float], period: int = 20, deviations: float = 2.0) -> Dict[str, Optional[float]]:
    if len(values) < period:
        return {"basis": None, "upper": None, "lower": None, "widthPercent": None}
    sample = values[-period:]
    basis = mean(sample)
    std_dev = standard_deviation(sample) or 0.0
    upper = basis + std_dev * deviations
    lower = basis - std_dev * deviations
    width_percent = ((upper - lower) / basis * 100) if basis else None
    return {
        "basis": basis,
        "upper": upper,
        "lower": lower,
        "widthPercent": width_percent,
    }


def keltner_state(candles: List[Candle], period: int = 20, multiplier: float = 1.5) -> Dict[str, Optional[float]]:
    closes = [candle.close for candle in candles]
    basis = ema(closes, period)
    atr_value = atr(candles, period)
    if basis is None or atr_value is None:
        return {"basis": basis, "upper": None, "lower": None, "widthPercent": None}
    upper = basis + atr_value * multiplier
    lower = basis - atr_value * multiplier
    width_percent = ((upper - lower) / basis * 100) if basis else None
    return {
        "basis": basis,
        "upper": upper,
        "lower": lower,
        "widthPercent": width_percent,
    }


def adx(candles: List[Candle], period: int = 14) -> Optional[float]:
    if len(candles) <= period + 1:
        return None
    plus_dm: List[float] = []
    minus_dm: List[float] = []
    true_ranges: List[float] = []
    for idx in range(1, len(candles)):
        current = candles[idx]
        previous = candles[idx - 1]
        up_move = current.high - previous.high
        down_move = previous.low - current.low
        plus_dm.append(up_move if up_move > down_move and up_move > 0 else 0.0)
        minus_dm.append(down_move if down_move > up_move and down_move > 0 else 0.0)
        true_ranges.append(
            max(
                current.high - current.low,
                abs(current.high - previous.close),
                abs(current.low - previous.close),
            )
        )
    recent_tr = sum(true_ranges[-period:])
    if recent_tr <= 0:
        return None
    plus_di = 100 * sum(plus_dm[-period:]) / recent_tr
    minus_di = 100 * sum(minus_dm[-period:]) / recent_tr
    denominator = plus_di + minus_di
    if denominator <= 0:
        return 0.0
    return abs(plus_di - minus_di) / denominator * 100


def realized_volatility(values: List[float], period: int = 20) -> Optional[float]:
    if len(values) <= period:
        return None
    returns: List[float] = []
    for idx in range(1, len(values)):
        previous = values[idx - 1]
        if previous:
            returns.append((values[idx] - previous) / previous)
    sample = returns[-period:]
    std_dev = standard_deviation(sample)
    if std_dev is None:
        return None
    return std_dev * sqrt(period) * 100


def volume_zscore(candles: List[Candle], period: int = 20) -> Optional[float]:
    if len(candles) < period:
        return None
    volumes = [candle.volume for candle in candles[-period:]]
    avg = mean(volumes)
    variance = mean([(volume - avg) ** 2 for volume in volumes])
    std_dev = sqrt(variance)
    if std_dev == 0:
        return 0.0
    return (volumes[-1] - avg) / std_dev


def taker_buy_ratio(candles: List[Candle], period: int = 20) -> Optional[float]:
    if not candles:
        return None
    sample = candles[-period:] if len(candles) >= period else candles
    total_volume = sum(candle.volume for candle in sample)
    if total_volume <= 0:
        return None
    taker_buy_volume = sum(candle.takerBuyBaseVolume for candle in sample)
    return min(max(taker_buy_volume / total_volume, 0.0), 1.0)


def recent_swings(candles: List[Candle], lookback: int = 3) -> Dict[str, List[float]]:
    highs: List[float] = []
    lows: List[float] = []
    if len(candles) < 5:
        return {"highs": highs, "lows": lows}
    for idx in range(2, len(candles) - 2):
        window = candles[idx - 2 : idx + 3]
        current = candles[idx]
        if current.high == max(candle.high for candle in window):
            highs.append(current.high)
        if current.low == min(candle.low for candle in window):
            lows.append(current.low)
    return {"highs": highs[-lookback:], "lows": lows[-lookback:]}


def basic_trend(closes: List[float], ema20_value: Optional[float], ema50_value: Optional[float]) -> str:
    if ema20_value is None or ema50_value is None or len(closes) < 2:
        return "unknown"
    if ema20_value > ema50_value and closes[-1] >= ema20_value:
        return "bullish"
    if ema20_value < ema50_value and closes[-1] <= ema20_value:
        return "bearish"
    return "sideways"


def linear_regression_slope(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    n = len(values)
    x_avg = (n - 1) / 2
    y_avg = mean(values)
    numerator = sum((idx - x_avg) * (value - y_avg) for idx, value in enumerate(values))
    denominator = sum((idx - x_avg) ** 2 for idx in range(n))
    if denominator == 0:
        return 0.0
    return numerator / denominator


def channel_state(candles: List[Candle]) -> Dict[str, float]:
    if len(candles) < 20:
        latest = candles[-1].close if candles else 0.0
        return {
            "slope": 0.0,
            "lower": latest,
            "mid": latest,
            "upper": latest,
            "position": 0.5,
        }
    sample = candles[-60:] if len(candles) >= 60 else candles
    lows = [candle.low for candle in sample]
    highs = [candle.high for candle in sample]
    closes = [candle.close for candle in sample]
    slope = linear_regression_slope(closes)
    lower = min(lows[-20:])
    upper = max(highs[-20:])
    width = max(upper - lower, 1e-9)
    latest = closes[-1]
    position = min(max((latest - lower) / width, 0.0), 1.0)
    return {
        "slope": slope,
        "lower": lower,
        "mid": lower + width * 0.5,
        "upper": upper,
        "position": position,
    }


def pct_change(values: List[float], periods: int) -> Optional[float]:
    if len(values) <= periods:
        return None
    previous = values[-periods - 1]
    if previous == 0:
        return None
    return (values[-1] - previous) / previous
