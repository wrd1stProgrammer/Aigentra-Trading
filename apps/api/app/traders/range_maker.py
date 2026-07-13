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
    fvalue,
    funding_abs_percentile,
    make_rejection,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    timeframe,
    trend_for,
)


class RangeMaker(TraderStrategy):
    profile = TraderProfile(
        id="range-maker",
        name="Range Mechanic",
        description="Trades only clear sideways ranges, fading the edges when trend pressure is weak and exiting before breakouts accelerate.",
        concept="It assumes the market will rotate inside a box until proven otherwise, so it buys low edges and shorts high edges with quick invalidation.",
        baseRiskPercent=0.4,
        riskLevel="LOW_MEDIUM",
        longConditions=[
            "4H trend is sideways or ADX is low",
            "Price is near the lower 20% of the range",
            "Funding and OI do not show strong directional crowding",
            "15m candle shows rejection from the lower edge",
        ],
        shortConditions=[
            "4H trend is sideways or ADX is low",
            "Price is near the upper 20% of the range",
            "Funding and OI do not show strong directional crowding",
            "15m candle shows rejection from the upper edge",
        ],
        entryRules=["70/30 edge and confirmation in clean ranges", "52/48 when breakout pressure requires a smaller first slice"],
        takeProfitRules=["TP1 at range mid", "TP2 before opposite edge"],
        stopLossRules=["Outside range edge with ATR buffer", "Immediate exit on accepted breakout"],
        aiReviewChecklist=[
            "Is the market actually ranging or starting trend expansion?",
            "Is entry too close to the range midpoint?",
            "Is funding neutral enough for mean reversion?",
            "Should the trade be skipped because breakout risk is rising?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Waiting for BTC to trade at a clean range edge without breakout pressure.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        fifteen = timeframe(snapshot, "15m")
        prior_range = one_hour.get("priorCompletedRange") or {}
        completed_candle = (
            fifteen.get("completedCandle")
            or fifteen.get("latestCompletedCandle")
            or fifteen.get("completedLatestCandle")
            or {}
        )
        if not prior_range or int(fvalue(prior_range.get("candles"), 0)) < 20:
            return make_rejection("A frozen 20-candle 1H range is required before fading an edge.", 40)
        if not completed_candle:
            return make_rejection("A completed 15m rejection candle is required before fading a range edge.", 40)
        lower = fvalue(prior_range.get("low"), 0.0)
        upper = fvalue(prior_range.get("high"), 0.0)
        if lower <= 0 or upper <= lower:
            return make_rejection("The frozen 1H range is invalid and cannot define an edge.", 40)
        mid = lower + (upper - lower) * 0.5
        width = max(upper - lower, price * 0.004)
        signal_close = fvalue(completed_candle.get("close"), price)
        position = min(max((signal_close - lower) / width, 0.0), 1.0)
        trend = trend_for(snapshot, "4h")
        adx_4h = fvalue(four_hour.get("adx14"), 18.0)
        funding = fvalue(snapshot.get("derivatives", {}).get("fundingRate"), 0.0)
        funding_percentile = funding_abs_percentile(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        regime = market_regime(snapshot)
        if fifteen.get("completedVolumeZscore") is None:
            return make_rejection("Completed 15m volume is required before fading a range edge.", 40)
        volume_z = fvalue(fifteen.get("completedVolumeZscore"))
        atr_1h = fvalue(one_hour.get("atr14"), price * 0.007)
        candle_open = fvalue(completed_candle.get("open"), signal_close)
        candle_close = signal_close
        candle_high = fvalue(completed_candle.get("high"), signal_close)
        candle_low = fvalue(completed_candle.get("low"), signal_close)
        candle_range = max(candle_high - candle_low, price * 0.0001)
        lower_rejection = (
            candle_low <= lower
            and candle_close > candle_open
            and candle_close > lower
            and (min(candle_open, candle_close) - candle_low) / candle_range >= 0.30
        )
        upper_rejection = (
            candle_high >= upper
            and candle_close < candle_open
            and candle_close < upper
            and (candle_high - max(candle_open, candle_close)) / candle_range >= 0.30
        )

        if regime not in {"range", "mixed"} or adx_4h >= 22:
            return make_rejection("Range gate failed because regime or 4H trend strength does not support mean reversion.", 42)
        if abs(funding) > 0.00008 or funding_percentile >= 85:
            return make_rejection("Funding is too directional for range mean reversion.", 44)
        if abs(oi_change_30m) >= 1.2:
            return make_rejection("OI expansion is too strong for a range-edge fade.", 46)
        if 0.22 < position < 0.78:
            return make_rejection("Price is too close to range midpoint for an edge fade.", 46)
        if volume_z > 1.0:
            return make_rejection("Volume expansion suggests breakout risk, not range fading.", 48)

        side = "LONG" if position <= 0.22 else "SHORT"
        if side == "LONG" and not lower_rejection:
            return make_rejection("Lower range edge was touched without a confirmed 15m rejection candle.", 50)
        if side == "SHORT" and not upper_rejection:
            return make_rejection("Upper range edge was touched without a confirmed 15m rejection candle.", 50)
        invalidation = lower if side == "LONG" else upper
        if not completed_signal_execution_valid(
            side,
            live_price=price,
            signal_price=signal_close,
            invalidation_level=invalidation,
            atr=atr_1h,
        ):
            return make_rejection("Completed range rejection is stale at the live execution price.", 50)
        score = 62 + (10 if trend == "sideways" else 0) + (8 if adx_4h <= 18 else 0)
        breakout_pressure = volume_z >= 0.8 or position <= 0.08 or position >= 0.92
        if breakout_pressure:
            score -= 10
        notes: List[str] = [
            "Range structure is flat enough for mean reversion.",
            f"Regime is {regime}; funding percentile {funding_percentile:.0f}; 30m OI change {oi_change_30m:.2f}%.",
        ]
        if breakout_pressure:
            notes.append("Price is close enough to breakout acceptance that the edge fade starts smaller.")
        risk_distance = max(atr_1h * 0.65, width * 0.08, price * 0.0035)
        edge_weight = 0.52 if breakout_pressure else 0.7
        confirm_weight = round(1.0 - edge_weight, 2)
        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(max(lower + risk_distance * 0.15, price * 0.997)), weight=edge_weight, reason="Lower range edge fade"),
                EntryPlan(price=round_price(price), weight=confirm_weight, reason="15m reclaim confirmation"),
            ]
            stop = round_price(lower - risk_distance)
            take_profits = [
                TakeProfitPlan(price=round_price(max(mid, price + risk_distance * 1.25)), weight=0.6, reason="Range midpoint"),
                TakeProfitPlan(price=round_price(min(upper - risk_distance * 0.3, price + risk_distance * 2.1)), weight=0.4, reason="Before opposite edge"),
            ]
            setup = "LOW_RANGE_REVERSION_LONG"
        else:
            entries = [
                EntryPlan(price=round_price(min(upper - risk_distance * 0.15, price * 1.003)), weight=edge_weight, reason="Upper range edge fade"),
                EntryPlan(price=round_price(price), weight=confirm_weight, reason="15m failure confirmation"),
            ]
            stop = round_price(upper + risk_distance)
            take_profits = [
                TakeProfitPlan(price=round_price(min(mid, price - risk_distance * 1.25)), weight=0.6, reason="Range midpoint"),
                TakeProfitPlan(price=round_price(max(lower + risk_distance * 0.3, price - risk_distance * 2.1)), weight=0.4, reason="Before opposite edge"),
            ]
            setup = "HIGH_RANGE_REVERSION_SHORT"

        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.08)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=1.15, fee_buffer_percent=0.08)
        if errors:
            return make_rejection("Range maker risk gates failed: " + "; ".join(errors), score)
        risk_percent = 0.3 if breakout_pressure else self.profile.baseRiskPercent

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 88),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=risk_percent,
            orderIntent=default_order_intent("RANGE_EDGE_LIMIT"),
            leveragePlan=default_leverage_plan(
                suggested=6 if score >= 76 else 5,
                maximum=6,
                reason="Range trades use 5-6x with quick midpoint de-risking because breakouts can invalidate the edge fast.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
                risk_reward=risk_reward,
                sizing_note="Fast de-risk at range mid; never average into an accepted breakout.",
                min_risk_reward=1.15,
            ),
            earlyExitRules=[
                "Exit early if a 15m candle accepts outside the range edge.",
                "Cancel remaining entries if volume expansion appears before fill.",
            ],
            managementNotes=[
                "Agent should take profits earlier than trend strategies and close quickly on range break.",
            ],
            invalidation="Cancel if price accepts outside the range with elevated volume.",
            notes=notes,
        )
