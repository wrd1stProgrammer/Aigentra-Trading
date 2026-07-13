from app.traders.btc_strategy_support import build_btc_profile


VWAP_RECLAIMER_PROFILE = build_btc_profile(
    trader_id="vwap-reclaimer",
    name="VWAP Reclaim Crew",
    description="Trades completed BTC reclaims and rejections around a volume-weighted HLC3 bar VWAP proxy.",
    concept="A twenty-bar HLC3-volume proxy defines intraday fair value; completed reentry candles and live execution validity replace the old EMA approximation.",
    base_risk=0.50,
    risk_level="MEDIUM",
    long_conditions=["Completed 15m candle crosses back above bar VWAP", "Candle body confirms acceptance", "4H trend is not bearish", "Live price still holds above VWAP"],
    short_conditions=["Completed 15m candle crosses back below bar VWAP", "Candle body confirms rejection", "4H trend is not bullish", "Live price still holds below VWAP"],
    entry_rules=["55% after completed VWAP reentry", "45% on a controlled retest that remains on the valid side"],
    take_profit_rules=["First target at 1.45R", "Second target at 2.65R while fair-value rotation persists"],
    stop_loss_rules=["Stop beyond VWAP and ATR noise", "Reject stale entries when live price invalidates the completed signal"],
    checklist=["Is bar VWAP available?", "Did the candle complete?", "Is the body decisive?", "Is live execution still valid?"],
    current_plan="Waiting for a completed 15m reentry around the HLC3-volume bar VWAP proxy.",
)

RSI_DIVERGENCE_SCOUT_PROFILE = build_btc_profile(
    trader_id="rsi-divergence-scout",
    name="RSI Divergence Scout",
    description="Trades confirmed BTC RSI pivot divergence only after a completed reversal candle.",
    concept="Unique confirmed price/RSI pivots, bounded pivot separation, completed structure confirmation, and a live-price freshness gate.",
    base_risk=0.48,
    risk_level="MEDIUM",
    long_conditions=["Confirmed bullish price/RSI pivots diverge", "Pivot separation is three to thirty bars", "Completed 15m candle closes bullish", "4H trend is not bearish"],
    short_conditions=["Confirmed bearish price/RSI pivots diverge", "Pivot separation is three to thirty bars", "Completed 15m candle closes bearish", "4H trend is not bullish"],
    entry_rules=["35% after completed divergence confirmation", "65% on a controlled structure retest"],
    take_profit_rules=["First target at 1.55R", "Second target at 2.90R while momentum rotates"],
    stop_loss_rules=["Stop beyond the confirmation candle", "Reject stale entries after live invalidation"],
    checklist=["Are pivots confirmed and unique?", "Is separation valid?", "Did structure confirm?", "Is live execution fresh?"],
    current_plan="Waiting for confirmed RSI pivots and a completed 15m reversal candle.",
)

WYCKOFF_SPRING_PROFILE = build_btc_profile(
    trader_id="wyckoff-spring",
    name="Wyckoff Springboard",
    description="Trades completed BTC springs and upthrusts against a frozen twenty-candle 1H range.",
    concept="A completed sweep must extend beyond the frozen boundary, leave a meaningful wick, and close back inside before execution.",
    base_risk=0.56,
    risk_level="HIGH",
    long_conditions=["Completed candle sweeps below frozen 1H support", "Lower wick confirms rejection", "Close returns inside the range", "Live price remains above support"],
    short_conditions=["Completed candle sweeps above frozen 1H resistance", "Upper wick confirms rejection", "Close returns inside the range", "Live price remains below resistance"],
    entry_rules=["55% after completed failed sweep", "45% on a controlled boundary retest"],
    take_profit_rules=["First target at 1.65R", "Second target at 3.05R toward opposite range liquidity"],
    stop_loss_rules=["Stop beyond the sweep and ATR buffer", "Exit on completed acceptance beyond the frozen boundary"],
    checklist=["Is the twenty-bar range frozen?", "Did price sweep far enough?", "Is wick quality valid?", "Is execution still fresh?"],
    current_plan="Waiting for a completed failed sweep of a frozen twenty-candle 1H range.",
)

BOLLINGER_REVERSION_PROFILE = build_btc_profile(
    trader_id="bollinger-reversion",
    name="Bollinger Boomerang",
    description="Trades completed BTC Bollinger-band reentries only in a contained range regime.",
    concept="Completed band reentry, 15m RSI exhaustion, and 1H ADX at or below 22 distinguish mean reversion from a band walk.",
    base_risk=0.42,
    risk_level="LOW_MEDIUM",
    long_conditions=["Completed candle pierces and reenters the lower band", "15m RSI is at or below 35", "1H ADX is contained", "Regime is range or mixed"],
    short_conditions=["Completed candle pierces and reenters the upper band", "15m RSI is at or above 65", "1H ADX is contained", "Regime is range or mixed"],
    entry_rules=["35% after completed band reentry", "65% on an orderly retest"],
    take_profit_rules=["First target at 1.35R", "Second target at 2.25R if reversion persists"],
    stop_loss_rules=["Stop beyond the band and ATR noise", "Reject execution after the completed trigger goes stale"],
    checklist=["Did the candle complete?", "Is RSI exhausted?", "Is ADX contained?", "Is this reentry rather than band walk?"],
    current_plan="Waiting for a completed band reentry while 1H trend strength remains contained.",
)


__all__ = [
    "BOLLINGER_REVERSION_PROFILE",
    "RSI_DIVERGENCE_SCOUT_PROFILE",
    "VWAP_RECLAIMER_PROFILE",
    "WYCKOFF_SPRING_PROFILE",
]
