from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    crowded_side,
    default_leverage_plan,
    default_order_intent,
    default_risk_plan,
    estimate_risk_reward,
    funding_abs_percentile,
    make_rejection,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
)


class ChannelRider(TraderStrategy):
    profile = TraderProfile(
        id="channel-rider",
        name="Channel Rider",
        description="Trades channel pullbacks only when price reaches a clear edge and the larger trend still supports the bounce or rejection.",
        concept="Think of it as riding a sloped price lane: it buys near the lower lane in uptrends and shorts near the upper lane in downtrends.",
        baseRiskPercent=0.7,
        riskLevel="MEDIUM",
        longConditions=[
            "4H trend is bullish",
            "Recent swing highs and lows are rising",
            "Channel slope is positive",
            "Price is near the lower channel quartile",
            "1H RSI sits in a controlled pullback zone",
        ],
        shortConditions=[
            "4H trend is bearish",
            "Recent swing highs and lows are falling",
            "Channel slope is negative",
            "Price is near the upper channel quartile",
            "1H RSI is rolling over from a rebound zone",
        ],
        entryRules=["50% near channel edge", "50% after 15m confirmation candle"],
        takeProfitRules=["TP1 at channel midline", "TP2 at opposite channel edge"],
        stopLossRules=["Beyond channel edge", "Beyond recent swing extreme"],
        aiReviewChecklist=[
            "Is the channel forced?",
            "Is this a pullback or trend failure?",
            "Does the higher timeframe conflict?",
            "Are cancellation conditions clear?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Waiting for a clean channel-edge pullback.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        one_hour = snapshot["timeframes"]["1h"]
        four_hour = snapshot["timeframes"]["4h"]
        fifteen = snapshot["timeframes"]["15m"]
        channel = one_hour.get("channel", {})
        position = float(channel.get("position", 0.5))
        slope = float(channel.get("slope", 0.0))
        rsi = one_hour.get("rsi14") or 50.0
        trend = four_hour.get("trend", "sideways")
        regime = market_regime(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        funding_percentile = funding_abs_percentile(snapshot)
        crowded = crowded_side(snapshot)
        lower = float(channel.get("lower", price * 0.99))
        mid = float(channel.get("mid", price))
        upper = float(channel.get("upper", price * 1.01))
        channel_width = max(upper - lower, 0.0)

        if regime == "shock":
            return make_rejection("Market is in shock regime; channel edge entries are paused until volatility normalizes.", 42)
        if channel_width < price * 0.004:
            return make_rejection("Channel width is too narrow to define entries and stops.", 38)
        if not (position <= 0.32 or position >= 0.68):
            return make_rejection("Price is not close enough to a channel edge.", 46)
        if not (35 <= rsi <= 65):
            return make_rejection("1H RSI is outside the controlled pullback/rebound band.", 50)

        if trend == "bullish":
            side = "LONG"
            if position > 0.38 or slope < 0:
                return make_rejection("Bullish channel setup conflicts with edge position or slope.", 52)
        elif trend == "bearish":
            side = "SHORT"
            if position < 0.62 or slope > 0:
                return make_rejection("Bearish channel setup conflicts with edge position or slope.", 52)
        else:
            side = "SHORT" if position >= 0.68 else "LONG"

        score = 58
        notes: List[str] = []
        channel_quality = 0
        if trend == "bullish":
            notes.append("4H trend supports long setups.")
            channel_quality += 1
        if trend == "bearish":
            notes.append("4H trend supports short setups.")
            channel_quality += 1
        if abs(slope) > price * 0.00002:
            score += 10
            channel_quality += 1
            notes.append("1H channel slope is visible enough for a demo setup.")
        score += 18
        notes.append("Price is near a channel edge and RSI is in the actionable band.")
        if side == "LONG":
            risk_distance = max(price - min(lower, price * 0.988), price * 0.004)
            entries = [
                EntryPlan(price=round_price(max(lower, price * 0.997)), weight=0.5, reason="Channel edge probe"),
                EntryPlan(price=round_price(price * 1.001), weight=0.5, reason="15m confirmation"),
            ]
            stop = round_price(min(lower, price * 0.988))
            take_profits = [
                TakeProfitPlan(price=round_price(max(mid, price + risk_distance * 1.25)), weight=0.5, reason="Channel midline or 1.25R"),
                TakeProfitPlan(price=round_price(max(upper, price + risk_distance * 2.0)), weight=0.5, reason="Opposite channel edge or 2R"),
            ]
            setup = "CHANNEL_LOWER_BAND_PULLBACK"
        else:
            risk_distance = max(max(upper, price * 1.012) - price, price * 0.004)
            entries = [
                EntryPlan(price=round_price(min(upper, price * 1.003)), weight=0.5, reason="Channel edge probe"),
                EntryPlan(price=round_price(price * 0.999), weight=0.5, reason="15m confirmation"),
            ]
            stop = round_price(max(upper, price * 1.012))
            take_profits = [
                TakeProfitPlan(price=round_price(min(mid, price - risk_distance * 1.25)), weight=0.5, reason="Channel midline or 1.25R"),
                TakeProfitPlan(price=round_price(min(lower, price - risk_distance * 2.0)), weight=0.5, reason="Opposite channel edge or 2R"),
            ]
            setup = "CHANNEL_UPPER_BAND_REJECTION"

        confirming_candle = (
            (side == "LONG" and fifteen.get("close", price) > fifteen.get("open", price))
            or (side == "SHORT" and fifteen.get("close", price) < fifteen.get("open", price))
        )
        if side == crowded and funding_percentile >= 88 and oi_change_30m >= 1.2:
            return make_rejection("Channel entry direction is crowded by funding/OI, raising trap risk.", score)
        if confirming_candle and channel_quality >= 2 and abs(oi_change_30m) < 2.0:
            entries = [
                EntryPlan(price=round_price(price), weight=1.0, reason="Confirmed channel-edge reaction"),
            ]
            notes.append("15m confirmation upgraded this to a single-entry channel reaction plan.")
        else:
            notes.append(f"Market regime is {regime}; 30m OI change is {oi_change_30m:.2f}%.")

        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=1.3)
        if errors:
            return make_rejection("Channel rider risk gates failed: " + "; ".join(errors), score)
        if trend == "sideways":
            notes.append("4H is sideways, so this is treated as a tactical edge trade with reduced risk.")
        risk_percent = self.profile.baseRiskPercent if trend != "sideways" else round(self.profile.baseRiskPercent * 0.75, 2)
        suggested_leverage = 6 if channel_quality >= 2 else 5

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 92),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=risk_percent,
            orderIntent=default_order_intent("CHANNEL_EDGE_LIMIT_WITH_CONFIRMATION"),
            leveragePlan=default_leverage_plan(
                suggested=suggested_leverage,
                maximum=7,
                reason="Channel trades use 5-7x: enough futures expression, but capped when channel quality or HTF trend is mixed.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
                risk_reward=risk_reward,
                sizing_note="Risk from weighted entries to channel-edge stop; no averaging after invalidation.",
            ),
            earlyExitRules=[
                "Exit early if 1H closes outside the channel against the setup.",
                "Exit early if RSI exits the controlled band before confirmation fills.",
            ],
            managementNotes=[
                "At channel midline, Agent may move stop to breakeven or take partial profit depending on momentum.",
                "If the channel looks forced after entry, Agent should prefer reduce risk over adding patience.",
            ],
            invalidation="Cancel if price closes outside the channel on 1H.",
            notes=notes,
        )
