from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    default_leverage_plan,
    default_order_intent,
    default_risk_plan,
    estimate_risk_reward,
    make_rejection,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    taker_buy_share,
)


class LiquidityReaper(TraderStrategy):
    profile = TraderProfile(
        id="liquidity-reaper",
        name="Liquidity Reaper",
        description="Targets stop sweeps above highs or below lows after reclaim/failure confirmation.",
        concept="Liquidity sweep, wick rejection, and 15m reclaim/fail.",
        baseRiskPercent=0.6,
        riskLevel="HIGH",
        longConditions=[
            "Prior 1H or 4H low exists",
            "Price briefly sweeps below the low",
            "Sweep distance is at least 0.2 ATR",
            "Lower wick is 40% or more of candle range",
            "15m closes back above the swept low",
        ],
        shortConditions=[
            "Prior 1H or 4H high exists",
            "Price briefly sweeps above the high",
            "Sweep distance is at least 0.2 ATR",
            "Upper wick is 40% or more of candle range",
            "15m closes back below the swept high",
        ],
        entryRules=["60% on confirmation", "40% on retest"],
        takeProfitRules=["TP1 at box mid/VWAP proxy", "TP2 at opposite liquidity zone"],
        stopLossRules=["Beyond wick extreme", "Enough buffer outside the sweep"],
        aiReviewChecklist=[
            "Is this a real sweep or valid breakout?",
            "Is 15m reclaim/fail clear?",
            "Is higher timeframe trend too strong?",
            "Is SL outside the wick?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Watching prior highs and lows for failed stop runs.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        fifteen = snapshot["timeframes"]["15m"]
        one_hour = snapshot["timeframes"]["1h"]
        candle = fifteen["latestCandle"]
        candle_range = max(candle["high"] - candle["low"], 1e-9)
        upper_wick = candle["high"] - max(candle["open"], candle["close"])
        lower_wick = min(candle["open"], candle["close"]) - candle["low"]
        upper_ratio = upper_wick / candle_range
        lower_ratio = lower_wick / candle_range
        atr_value = one_hour.get("atr14") or price * 0.01
        swings = one_hour.get("swings", {})
        prior_high = max(swings.get("highs", []) or [one_hour.get("high", price * 1.006)])
        prior_low = min(swings.get("lows", []) or [one_hour.get("low", price * 0.994)])
        regime = market_regime(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        external_taker_share = taker_buy_share(snapshot)
        volume_z = fifteen.get("volumeZscore") or 0.0

        min_sweep_distance = max(atr_value * 0.2, price * 0.001)
        short_sweep_distance = candle["high"] - prior_high
        long_sweep_distance = prior_low - candle["low"]
        short_sweep = (
            short_sweep_distance >= min_sweep_distance
            and candle["close"] < prior_high
            and upper_ratio >= 0.4
        )
        long_sweep = (
            long_sweep_distance >= min_sweep_distance
            and candle["close"] > prior_low
            and lower_ratio >= 0.4
        )

        if short_sweep == long_sweep:
            return make_rejection("No single ATR-qualified liquidity sweep and reclaim/fail is confirmed.", 42)

        score = 58
        notes: List[str] = []
        score += 14
        notes.append("Sweep distance cleared the 0.2 ATR hard gate.")
        notes.append("15m candle has a reclaim/fail close and a rejection wick >= 40% of range.")
        if volume_z > 0.5:
            score += 8
            notes.append("Sweep candle volume is elevated.")
        flow_confirmed = (short_sweep and external_taker_share >= 0.56) or (long_sweep and external_taker_share <= 0.44)
        if flow_confirmed:
            score += 6
            notes.append("External taker flow confirms a stop-run imbalance into the wick.")
        if oi_change_30m >= 0.6:
            score += 5
            notes.append(f"30m OI expanded {oi_change_30m:.2f}% into the sweep.")
        if not flow_confirmed and volume_z <= 0 and oi_change_30m < 0.2 and regime != "shock":
            return make_rejection("Sweep exists, but volume/OI/taker confirmation is too weak.", score)

        side = "SHORT" if short_sweep else "LONG"
        risk_distance = max(atr_value * 0.35, price * 0.004)
        if side == "SHORT":
            stop = round_price(max(candle["high"], price + risk_distance * 0.5))
            stop_risk = max(stop - price, risk_distance)
            tps = [
                TakeProfitPlan(price=round_price(price - stop_risk * 1.35), weight=0.5, reason="Box mid/VWAP proxy or 1.35R"),
                TakeProfitPlan(price=round_price(min(prior_low, price - stop_risk * 2.2)), weight=0.5, reason="Opposite liquidity zone or 2.2R"),
            ]
            setup = "HIGH_SWEEP_FAILURE_SHORT"
            retest = min(prior_high, price * 1.002)
        else:
            stop = round_price(min(candle["low"], price - risk_distance * 0.5))
            stop_risk = max(price - stop, risk_distance)
            tps = [
                TakeProfitPlan(price=round_price(price + stop_risk * 1.35), weight=0.5, reason="Box mid/VWAP proxy or 1.35R"),
                TakeProfitPlan(price=round_price(max(prior_high, price + stop_risk * 2.2)), weight=0.5, reason="Opposite liquidity zone or 2.2R"),
            ]
            setup = "LOW_SWEEP_RECLAIM_LONG"
            retest = max(prior_low, price * 0.998)

        entries = normalize_entries_for_side(side, price, [
            EntryPlan(price=round_price(price), weight=0.6, reason="Confirmation close"),
            EntryPlan(price=round_price(retest), weight=0.4, reason="Retest entry"),
        ])
        if flow_confirmed and volume_z >= 1.0 and max(upper_ratio, lower_ratio) >= 0.55:
            entries = normalize_entries_for_side(side, price, [
                EntryPlan(price=round_price(price), weight=1.0, reason="High-confidence sweep reclaim/fail"),
            ])
            notes.append("Strong wick, volume, and flow upgraded this to a single-entry sweep plan.")
        risk_reward = estimate_risk_reward(side, entries, stop, tps, fee_buffer_percent=0.1)
        errors = candidate_geometry_errors(
            side,
            price,
            entries,
            stop,
            tps,
            min_risk_reward=1.25,
            fee_buffer_percent=0.1,
        )
        if errors:
            return make_rejection("Liquidity reaper risk gates failed: " + "; ".join(errors), score)
        sweep_volume_confirmed = volume_z > 0.5
        leverage = 10 if score >= 82 and flow_confirmed else 8 if sweep_volume_confirmed else 6
        risk_percent = self.profile.baseRiskPercent if sweep_volume_confirmed else round(self.profile.baseRiskPercent * 0.8, 2)

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 90),
            entries=entries,
            stopLoss=stop,
            takeProfits=tps,
            riskPercent=risk_percent,
            orderIntent=default_order_intent("CONFIRMATION_THEN_SWEEP_RETEST"),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=10,
                reason="Liquidity sweeps use 6-10x because invalidation is tight; 10x requires wick, volume, and taker-flow confirmation.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
                risk_reward=risk_reward,
                sizing_note="Risk is measured from weighted entry to wick extreme plus fee buffer.",
                min_risk_reward=1.25,
                fee_buffer_percent=0.1,
            ),
            earlyExitRules=[
                "Exit early if price accepts beyond the swept level for one full 15m close.",
                "Exit early if the wick extreme is retested with rising volume against the trade.",
            ],
            managementNotes=[
                "Agent should move to breakeven quickly after the range midpoint because sweeps can reverse twice.",
                "If the wick extreme is defended with rising volume, Agent should reduce or close before hard stop.",
            ],
            invalidation="Cancel if the swept level accepts price beyond the wick.",
            notes=notes,
        )
