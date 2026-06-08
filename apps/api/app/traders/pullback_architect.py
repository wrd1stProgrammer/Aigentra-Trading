from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
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


class PullbackArchitect(TraderStrategy):
    profile = TraderProfile(
        id="pullback-architect",
        name="Pullback Architect",
        description="Builds scaled entries where EMA, VWAP-like mean, Fib, and support overlap.",
        concept="Trend continuation pullback with three staged entries.",
        baseRiskPercent=0.7,
        riskLevel="MEDIUM",
        longConditions=[
            "4H EMA20 is above EMA50",
            "4H structure prints higher highs and higher lows",
            "Price pulls into 1H EMA20-EMA50 zone",
            "Pullback volume is fading",
            "Funding is not overheated",
        ],
        shortConditions=[
            "4H EMA20 is below EMA50",
            "4H structure prints lower highs and lower lows",
            "Price rebounds into 1H EMA20-EMA50 zone",
            "Rebound volume is weak",
            "Funding is not overheated",
        ],
        entryRules=["Entry 1 40%", "Entry 2 35%", "Entry 3 25%"],
        takeProfitRules=["TP1 at prior swing", "TP2 at next major level"],
        stopLossRules=["Beyond final scale entry", "Beyond recent structure extreme"],
        aiReviewChecklist=[
            "Is this healthy pullback or trend failure?",
            "Are scale prices spaced well?",
            "Is SL distance acceptable?",
            "Is funding/OI overheated?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Preparing staged continuation entries near 1H moving average zones.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        one_hour = snapshot["timeframes"]["1h"]
        four_hour = snapshot["timeframes"]["4h"]
        funding = float(snapshot["derivatives"].get("fundingRate") or 0.0)
        funding_percentile = funding_abs_percentile(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        regime = market_regime(snapshot)
        ema20 = one_hour.get("ema20") or price
        ema50 = one_hour.get("ema50") or price
        trend = four_hour.get("trend", "sideways")
        lower_zone = min(ema20, ema50)
        upper_zone = max(ema20, ema50)
        in_zone = lower_zone * 0.995 <= price <= upper_zone * 1.005
        four_hour_ema20 = four_hour.get("ema20") or price
        four_hour_ema50 = four_hour.get("ema50") or price
        bullish_alignment = trend == "bullish" and four_hour_ema20 > four_hour_ema50
        bearish_alignment = trend == "bearish" and four_hour_ema20 < four_hour_ema50

        if not (bullish_alignment or bearish_alignment):
            return make_rejection("4H trend and EMA alignment do not agree for a pullback setup.", 40)
        if not in_zone:
            return make_rejection("Price is outside the 1H EMA20-EMA50 pullback decision zone.", 48)
        if abs(funding) >= 0.001 or funding_percentile >= 92:
            return make_rejection("Funding is too overheated for a continuation pullback.", 52)
        if regime == "shock":
            return make_rejection("Market is in shock regime; pullback entries are paused until volatility normalizes.", 54)

        score = 58
        notes: List[str] = []
        score += 16
        notes.append("4H trend and EMA alignment agree with the pullback direction.")
        notes.append("Price is inside the 1H EMA20-EMA50 decision zone.")
        notes.append("Funding is below the overheating hard gate.")
        if one_hour.get("rsi14") and 35 <= one_hour["rsi14"] <= 65:
            score += 7

        side = "SHORT" if bearish_alignment else "LONG"
        rsi_value = one_hour.get("rsi14") or 50.0
        scale_count = 3
        if 44 <= rsi_value <= 56 and abs(funding) < 0.00005 and abs(oi_change_30m) < 1.2:
            scale_count = 4
        elif rsi_value < 34 or rsi_value > 66 or abs(oi_change_30m) >= 1.8:
            scale_count = 2
        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(price * 0.998), weight=0.4, reason="First pullback scale"),
                EntryPlan(price=round_price(price * 0.992), weight=0.35, reason="EMA/Fib overlap"),
                EntryPlan(price=round_price(price * 0.986), weight=0.25, reason="Final structure scale"),
            ]
            if scale_count == 4:
                entries = [
                    EntryPlan(price=round_price(price * 0.999), weight=0.3, reason="Small confirmation starter"),
                    EntryPlan(price=round_price(price * 0.995), weight=0.3, reason="EMA20 pullback scale"),
                    EntryPlan(price=round_price(price * 0.990), weight=0.25, reason="EMA/Fib overlap"),
                    EntryPlan(price=round_price(price * 0.984), weight=0.15, reason="Final structure scale"),
                ]
            elif scale_count == 2:
                entries = [
                    EntryPlan(price=round_price(price * 0.997), weight=0.6, reason="Reduced first scale"),
                    EntryPlan(price=round_price(price * 0.990), weight=0.4, reason="Reduced structure scale"),
                ]
            stop = round_price(price * 0.975)
            tps = [
                TakeProfitPlan(price=round_price(price * 1.014), weight=0.5, reason="Prior swing high"),
                TakeProfitPlan(price=round_price(price * 1.032), weight=0.5, reason="Next resistance zone"),
            ]
            setup = "THREE_STAGE_PULLBACK_LONG"
        else:
            entries = [
                EntryPlan(price=round_price(price * 1.002), weight=0.4, reason="First rebound scale"),
                EntryPlan(price=round_price(price * 1.008), weight=0.35, reason="EMA/Fib overlap"),
                EntryPlan(price=round_price(price * 1.014), weight=0.25, reason="Final structure scale"),
            ]
            if scale_count == 4:
                entries = [
                    EntryPlan(price=round_price(price * 1.001), weight=0.3, reason="Small confirmation starter"),
                    EntryPlan(price=round_price(price * 1.005), weight=0.3, reason="EMA20 rebound scale"),
                    EntryPlan(price=round_price(price * 1.010), weight=0.25, reason="EMA/Fib overlap"),
                    EntryPlan(price=round_price(price * 1.016), weight=0.15, reason="Final structure scale"),
                ]
            elif scale_count == 2:
                entries = [
                    EntryPlan(price=round_price(price * 1.003), weight=0.6, reason="Reduced first scale"),
                    EntryPlan(price=round_price(price * 1.010), weight=0.4, reason="Reduced structure scale"),
                ]
            stop = round_price(price * 1.025)
            tps = [
                TakeProfitPlan(price=round_price(price * 0.986), weight=0.5, reason="Prior swing low"),
                TakeProfitPlan(price=round_price(price * 0.968), weight=0.5, reason="Next support zone"),
            ]
            setup = "THREE_STAGE_PULLBACK_SHORT"

        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, tps)
        errors = candidate_geometry_errors(side, price, entries, stop, tps, min_risk_reward=1.3)
        if errors:
            return make_rejection("Pullback architect risk gates failed: " + "; ".join(errors), score)
        notes.append(f"Dynamic scale plan selected {scale_count} entries based on RSI, funding, OI, and regime state.")

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 91),
            entries=entries,
            stopLoss=stop,
            takeProfits=tps,
            riskPercent=self.profile.baseRiskPercent,
            orderIntent=default_order_intent("SCALED_LIMIT_PULLBACK"),
            leveragePlan=default_leverage_plan(
                suggested=6 if score >= 80 and scale_count <= 3 else 5,
                maximum=7,
                reason="Staged pullback entries use 5-7x because sizing is split and invalidation is structure-based.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=self.profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note="Allocate risk across all scale entries; cancel unfilled scales if EMA50 fails.",
            ),
            earlyExitRules=[
                "Exit early if 1H closes beyond EMA50 against the setup.",
                "Exit early if funding expands beyond the overheating threshold before all entries fill.",
            ],
            managementNotes=[
                "Agent may cancel unfilled later scales if the first fill moves toward TP without a clean retest.",
                "Agent may take partial before TP1 when EMA20 momentum weakens or funding heats up.",
            ],
            invalidation="Cancel if 1H closes beyond the EMA50 decision band.",
            notes=notes,
        )
