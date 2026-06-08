from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    candle_body_ratio,
    default_leverage_plan,
    default_order_intent,
    default_risk_plan,
    estimate_risk_reward,
    fvalue,
    latest_candle,
    make_rejection,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    timeframe,
    trend_for,
)


class VolatilitySqueezer(TraderStrategy):
    profile = TraderProfile(
        id="volatility-squeezer",
        name="Volatility Squeezer",
        description="Waits for volatility compression, then trades the first confirmed expansion.",
        concept="Bollinger/Keltner compression, ATR percentile, volume expansion, and breakout close.",
        baseRiskPercent=0.55,
        riskLevel="MEDIUM",
        longConditions=[
            "1H volatility is compressed versus recent realized volatility",
            "15m candle closes above the compression range",
            "Volume or candle body expands with the breakout",
            "4H trend is not bearish",
        ],
        shortConditions=[
            "1H volatility is compressed versus recent realized volatility",
            "15m candle closes below the compression range",
            "Volume or candle body expands with the breakdown",
            "4H trend is not bullish",
        ],
        entryRules=["50% on expansion close", "50% on first shallow pullback"],
        takeProfitRules=["TP1 near 1.2R", "TP2 uses ATR expansion target"],
        stopLossRules=["Inside failed compression range", "Beyond expansion candle midpoint"],
        aiReviewChecklist=[
            "Is this a real volatility expansion or a one-candle fake?",
            "Is the breakout direction aligned enough with higher timeframe structure?",
            "Is the first pullback entry still reachable without chasing?",
            "Should the stop be tightened quickly if expansion stalls?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Waiting for compressed BTC volatility to release with volume.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        fifteen = timeframe(snapshot, "15m")
        one_hour = timeframe(snapshot, "1h")
        four_hour_trend = trend_for(snapshot, "4h")
        candle = latest_candle(fifteen)
        atr_value = fvalue(one_hour.get("atr14"), price * 0.008)
        bb_width = fvalue(one_hour.get("bollinger", {}).get("widthPercent"), atr_value / price * 100)
        kc_width = fvalue(one_hour.get("keltner", {}).get("widthPercent"), bb_width * 1.25)
        realized_vol = fvalue(one_hour.get("realizedVolatility20"), bb_width)
        volume_z = fvalue(fifteen.get("volumeZscore"), 0.0)
        oi_change_30m = open_interest_change(snapshot)
        regime = market_regime(snapshot)
        body_ratio = candle_body_ratio(candle)
        compression_score = 0
        if bb_width <= max(1.8, realized_vol * 0.85):
            compression_score += 1
        if bb_width <= kc_width:
            compression_score += 1
        if atr_value / price <= 0.014:
            compression_score += 1
        if compression_score < 2:
            return make_rejection("Volatility is not compressed enough for a squeeze setup.", 42)
        if regime == "shock":
            return make_rejection("Market already expanded into shock regime; squeeze entry is too late.", 50)

        close = fvalue(candle.get("close"), price)
        open_ = fvalue(candle.get("open"), close)
        impulse = volume_z >= 0.35 or body_ratio >= 0.48 or oi_change_30m >= 0.8
        if not impulse:
            return make_rejection("Compression exists, but expansion candle lacks impulse.", 48)

        ema20 = fvalue(one_hour.get("ema20"), price)
        side = None
        if close > open_ and close >= ema20 and four_hour_trend != "bearish":
            side = "LONG"
        if close < open_ and close <= ema20 and four_hour_trend != "bullish":
            side = "SHORT"
        if side is None:
            return make_rejection("Expansion direction conflicts with 1H mean or 4H trend filter.", 50)

        score = 62 + compression_score * 6 + min(12, int(max(volume_z, 0.0) * 6))
        if oi_change_30m >= 0.8:
            score += 6
        notes: List[str] = [
            "1H Bollinger/Keltner compression gate passed.",
            "15m expansion candle has either volume or body impulse.",
            f"30m OI change is {oi_change_30m:.2f}% during expansion check.",
        ]
        risk_distance = max(atr_value * 0.65, price * 0.0045)
        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(price), weight=0.5, reason="Expansion close participation"),
                EntryPlan(price=round_price(price - risk_distance * 0.35), weight=0.5, reason="First shallow pullback"),
            ]
            stop = round_price(price - risk_distance)
            take_profits = [
                TakeProfitPlan(price=round_price(price + risk_distance * 1.2), weight=0.45, reason="Fast expansion 1.2R"),
                TakeProfitPlan(price=round_price(price + risk_distance * 2.1), weight=0.55, reason="ATR expansion target"),
            ]
            setup = "VOLATILITY_SQUEEZE_BREAKOUT_LONG"
        else:
            entries = [
                EntryPlan(price=round_price(price), weight=0.5, reason="Expansion close participation"),
                EntryPlan(price=round_price(price + risk_distance * 0.35), weight=0.5, reason="First shallow pullback"),
            ]
            stop = round_price(price + risk_distance)
            take_profits = [
                TakeProfitPlan(price=round_price(price - risk_distance * 1.2), weight=0.45, reason="Fast expansion 1.2R"),
                TakeProfitPlan(price=round_price(price - risk_distance * 2.1), weight=0.55, reason="ATR expansion target"),
            ]
            setup = "VOLATILITY_SQUEEZE_BREAKDOWN_SHORT"

        entries = normalize_entries_for_side(side, price, entries)
        if score >= 82 and volume_z >= 1.2:
            entries = normalize_entries_for_side(side, price, [
                EntryPlan(price=round_price(price), weight=1.0, reason="Strong expansion close participation"),
            ])
            notes.append("Strong expansion upgraded this to a single-entry momentum plan.")
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.09)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=1.2, fee_buffer_percent=0.09)
        if errors:
            return make_rejection("Volatility squeezer risk gates failed: " + "; ".join(errors), score)

        leverage = 8 if score >= 78 else 6
        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 90),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=self.profile.baseRiskPercent,
            orderIntent=default_order_intent(
                "STRONG_EXPANSION_SINGLE_ENTRY" if len(entries) == 1 else "EXPANSION_CLOSE_THEN_PULLBACK",
                post_only=False,
            ),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=8,
                reason="Squeeze releases use 6-8x because volatility expands quickly, with strict invalidation if expansion fails.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=self.profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note="Use expansion candle risk first, then cancel pullback entry if price snaps back inside compression.",
                min_risk_reward=1.2,
                fee_buffer_percent=0.09,
            ),
            earlyExitRules=[
                "Exit early if the next 15m candle closes back inside the compression range.",
                "Move stop to breakeven quickly if expansion reaches 0.8R and volume fades.",
            ],
            managementNotes=[
                "Agent should review quickly after fill because squeeze trades decay fast when momentum stalls.",
            ],
            invalidation="Cancel if price re-enters the compression band on a 15m close.",
            notes=notes,
        )
