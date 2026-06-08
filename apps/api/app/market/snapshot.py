import asyncio
from typing import Any, Dict

from app.clients.binance_client import BinanceClient, Candle
from app.market.data_cache import cached_derivative, cached_klines, cached_series
from app.market.derivatives import classify_market_regime, derivative_context
from app.market.indicators import (
    adx,
    atr,
    basic_trend,
    bollinger_state,
    channel_state,
    ema,
    keltner_state,
    pct_change,
    recent_swings,
    realized_volatility,
    rsi,
    taker_buy_ratio,
    volume_zscore,
)


INTERVAL_LIMITS = {
    "1m": 120,
    "5m": 120,
    "15m": 160,
    "1h": 180,
    "4h": 180,
    "1d": 180,
}

async def build_market_snapshot(client: BinanceClient, symbol: str) -> Dict[str, Any]:
    interval_items = list(INTERVAL_LIMITS.items())
    candles_results = await asyncio.gather(
        *[
            cached_klines(client, symbol=symbol, interval=interval, limit=limit)
            for interval, limit in interval_items
        ]
    )
    candles_by_interval: Dict[str, list[Candle]] = {
        interval: candles
        for (interval, _), candles in zip(interval_items, candles_results)
    }

    (
        open_interest,
        premium_index,
        open_interest_history,
        funding_history,
        global_long_short,
        top_account_ratio,
        top_position_ratio,
        taker_buy_sell,
    ) = await asyncio.gather(
        cached_derivative(client, symbol, "open_interest"),
        cached_derivative(client, symbol, "premium_index"),
        cached_series(client, symbol, "open_interest_history", period="5m", limit=36),
        cached_series(client, symbol, "funding_rate_history", limit=100),
        cached_series(client, symbol, "global_long_short", period="5m", limit=36),
        cached_series(client, symbol, "top_long_short_account", period="5m", limit=36),
        cached_series(client, symbol, "top_long_short_position", period="5m", limit=36),
        cached_series(client, symbol, "taker_buy_sell", period="5m", limit=36),
    )

    timeframes: Dict[str, Any] = {}
    for interval, candles in candles_by_interval.items():
        closes = [candle.close for candle in candles]
        latest = candles[-1]
        ema20_value = ema(closes, 20)
        ema50_value = ema(closes, 50)
        frame: Dict[str, Any] = {
            "close": latest.close,
            "open": latest.open,
            "high": latest.high,
            "low": latest.low,
            "volume": latest.volume,
            "ema20": ema20_value,
            "ema50": ema50_value,
            "rsi14": rsi(closes, 14),
            "atr14": atr(candles, 14),
            "adx14": adx(candles, 14),
            "volumeZscore": volume_zscore(candles, 20),
            "takerBuyRatio": taker_buy_ratio(candles, 20),
            "bollinger": bollinger_state(closes, 20),
            "keltner": keltner_state(candles, 20),
            "realizedVolatility20": realized_volatility(closes, 20),
            "swings": recent_swings(candles, 3),
            "priceChange": {
                "1": pct_change(closes, 1),
                "4": pct_change(closes, 4),
                "12": pct_change(closes, 12),
            },
            "latestCandle": latest.model_dump(),
        }
        if interval in {"1h", "4h", "1d"}:
            frame["trend"] = basic_trend(closes, ema20_value, ema50_value)
        if interval in {"1h", "4h", "1d"}:
            frame["channel"] = channel_state(candles)
        timeframes[interval] = frame

    price = premium_index["markPrice"] or timeframes["1m"]["close"]
    derivatives = derivative_context(
        open_interest=open_interest,
        premium_index=premium_index,
        open_interest_history=open_interest_history,
        funding_history=funding_history,
        global_long_short=global_long_short,
        top_account_ratio=top_account_ratio,
        top_position_ratio=top_position_ratio,
        taker_buy_sell=taker_buy_sell,
    )
    return {
        "symbol": symbol.upper(),
        "price": price,
        "intervals": list(INTERVAL_LIMITS.keys()),
        "timeframes": timeframes,
        "derivatives": derivatives,
        "marketRegime": classify_market_regime(timeframes, derivatives),
    }
