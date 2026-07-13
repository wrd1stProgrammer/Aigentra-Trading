from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    completed_signal_execution_valid,
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
        description="Builds one- or two-slice entries after a completed 15m recovery confirms a healthy 1H EMA-zone pullback.",
        concept="Completed-candle trend continuation with a 40% confirmation slice and 60% controlled retest; late or OI-expanded signals use one reduced probe.",
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
        entryRules=["40% after a completed EMA20 recovery or rejection", "60% on a controlled EMA-zone retest"],
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
        currentPlan="Waiting for a completed 15m EMA-zone recovery before using an adaptive one- or two-slice entry.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        live_price = float(snapshot["price"])
        fifteen = snapshot["timeframes"]["15m"]
        one_hour = snapshot["timeframes"]["1h"]
        four_hour = snapshot["timeframes"]["4h"]
        signal_candle = (
            fifteen.get("completedCandle")
            or fifteen.get("latestCompletedCandle")
            or fifteen.get("completedLatestCandle")
            or {}
        )
        if not signal_candle:
            return make_rejection("A completed 15m pullback trigger is required.", 0)
        price = float(signal_candle.get("close") or live_price)
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
        atr_1h = float(one_hour.get("atr14") or price * 0.008)
        swings_1h = one_hour.get("swings") or {}

        if not (bullish_alignment or bearish_alignment):
            return make_rejection("4H trend and EMA alignment do not agree for a pullback setup.", 40)
        if not in_zone:
            return make_rejection("Price is outside the 1H EMA20-EMA50 pullback decision zone.", 48)
        signal_low = float(signal_candle.get("low") or price)
        signal_high = float(signal_candle.get("high") or price)
        signal_close = float(signal_candle.get("close") or price)
        bullish_recovery = signal_low <= upper_zone * 1.002 and signal_close >= ema20
        bearish_recovery = signal_high >= lower_zone * 0.998 and signal_close <= ema20
        if bullish_alignment and not bullish_recovery:
            return make_rejection("Completed 15m candle has not recovered EMA20 after the pullback reaction.", 50)
        if bearish_alignment and not bearish_recovery:
            return make_rejection("Completed 15m candle has not rejected EMA20 after the rebound reaction.", 50)
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
        invalidation = upper_zone if side == "SHORT" else lower_zone
        if not completed_signal_execution_valid(
            side,
            live_price=live_price,
            signal_price=signal_close,
            invalidation_level=invalidation,
            atr=atr_1h,
        ):
            return make_rejection("Completed pullback trigger is stale at the live execution price.", 50)
        price = live_price
        rsi_value = one_hour.get("rsi14") or 50.0
        late_pullback = rsi_value < 34 or rsi_value > 66 or abs(oi_change_30m) >= 1.8
        if late_pullback:
            score -= 6
            notes.append("Pullback confirmation is late or OI is expanding, so the first fill is treated as a probe.")

        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(price), weight=0.4, reason="Completed EMA20 recovery"),
                EntryPlan(price=round_price(max(lower_zone, price - atr_1h * 0.45)), weight=0.6, reason="Controlled EMA-zone retest"),
            ]
            if late_pullback:
                entries = [
                    EntryPlan(price=round_price(price), weight=1.0, reason="Single probe after late pullback confirmation"),
                ]
            structural_low = min(swings_1h.get("lows", []) or [lower_zone])
            stop = round_price(min(structural_low - atr_1h * 0.35, min(entry.price for entry in entries) - atr_1h * 0.45))
            tps = [
                TakeProfitPlan(price=round_price(max(price * 1.014, price + (price - stop) * 1.45)), weight=0.5, reason="Prior swing high or 1.45R"),
                TakeProfitPlan(price=round_price(max(price * 1.032, price + (price - stop) * 2.6)), weight=0.5, reason="Next resistance zone or 2.6R"),
            ]
            setup = "TWO_STAGE_PULLBACK_LONG"
        else:
            entries = [
                EntryPlan(price=round_price(price), weight=0.4, reason="Completed EMA20 rejection"),
                EntryPlan(price=round_price(min(upper_zone, price + atr_1h * 0.45)), weight=0.6, reason="Controlled EMA-zone retest"),
            ]
            if late_pullback:
                entries = [
                    EntryPlan(price=round_price(price), weight=1.0, reason="Single probe after late rebound confirmation"),
                ]
            structural_high = max(swings_1h.get("highs", []) or [upper_zone])
            stop = round_price(max(structural_high + atr_1h * 0.35, max(entry.price for entry in entries) + atr_1h * 0.45))
            tps = [
                TakeProfitPlan(price=round_price(min(price * 0.986, price - (stop - price) * 1.45)), weight=0.5, reason="Prior swing low or 1.45R"),
                TakeProfitPlan(price=round_price(min(price * 0.968, price - (stop - price) * 2.6)), weight=0.5, reason="Next support zone or 2.6R"),
            ]
            setup = "TWO_STAGE_PULLBACK_SHORT"

        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, tps)
        errors = candidate_geometry_errors(side, price, entries, stop, tps, min_risk_reward=1.3)
        if errors:
            return make_rejection("Pullback architect risk gates failed: " + "; ".join(errors), score)
        notes.append(f"Completed 15m recovery selected {'one probe' if late_pullback else 'two 40/60 slices'} based on RSI and optional OI state.")
        risk_percent = 0.5 if late_pullback else self.profile.baseRiskPercent

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 91),
            entries=entries,
            stopLoss=stop,
            takeProfits=tps,
            riskPercent=risk_percent,
            orderIntent=default_order_intent("SCALED_LIMIT_PULLBACK"),
            leveragePlan=default_leverage_plan(
                suggested=6 if score >= 80 and not late_pullback else 5,
                maximum=7,
                reason="Staged pullback entries use 5-7x because sizing is split and invalidation is structure-based.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
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
