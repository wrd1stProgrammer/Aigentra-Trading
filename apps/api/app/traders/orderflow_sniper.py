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
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    taker_buy_share,
    taker_buy_sell_ratio,
    timeframe,
)


class OrderflowSniper(TraderStrategy):
    profile = TraderProfile(
        id="orderflow-sniper",
        name="Orderflow Sniper",
        description="A short-horizon paper scalper using 1m/5m flow bursts and strict exit timing.",
        concept="Taker imbalance, 1m/5m impulse, tight ATR stop, and fast AI management reviews.",
        baseRiskPercent=0.3,
        riskLevel="HIGH",
        longConditions=[
            "1m and 5m candles show aligned bullish impulse",
            "Taker buy ratio is materially above neutral",
            "Spread/volatility proxy is not disorderly",
            "Stop distance is small enough after fees",
        ],
        shortConditions=[
            "1m and 5m candles show aligned bearish impulse",
            "Taker buy ratio is materially below neutral",
            "Spread/volatility proxy is not disorderly",
            "Stop distance is small enough after fees",
        ],
        entryRules=["80% on micro impulse", "20% on immediate retest"],
        takeProfitRules=["TP1 at 0.8R", "TP2 at 1.4R or flow exhaustion"],
        stopLossRules=["Tight microstructure stop", "Exit fast on flow flip"],
        aiReviewChecklist=[
            "Is microstructure impulse real enough after fees?",
            "Is volatility too chaotic for a tight stop?",
            "Should this be immediate participation or skip due to chase risk?",
            "Can the Agent review again within minutes after fill?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Only taking fast paper scalps when 1m/5m flow is unusually clean.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        one_min = timeframe(snapshot, "1m")
        five_min = timeframe(snapshot, "5m")
        one_hour = timeframe(snapshot, "1h")
        candle_1m = latest_candle(one_min)
        candle_5m = latest_candle(five_min)
        taker_1m = fvalue(one_min.get("takerBuyRatio"), 0.5)
        taker_5m = fvalue(five_min.get("takerBuyRatio"), taker_1m)
        external_taker_share = taker_buy_share(snapshot)
        external_taker_ratio = taker_buy_sell_ratio(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        taker_5m = (taker_5m + external_taker_share) / 2
        volume_z_1m = fvalue(one_min.get("volumeZscore"), 0.0)
        volume_z_5m = fvalue(five_min.get("volumeZscore"), 0.0)
        atr_1m = fvalue(one_min.get("atr14"), price * 0.0015)
        atr_1h = fvalue(one_hour.get("atr14"), price * 0.008)
        micro_vol_ok = atr_1m / price <= 0.004 and atr_1h / price <= 0.025
        body_1m = candle_body_ratio(candle_1m)
        body_5m = candle_body_ratio(candle_5m)
        close_1m = fvalue(candle_1m.get("close"), price)
        open_1m = fvalue(candle_1m.get("open"), close_1m)
        close_5m = fvalue(candle_5m.get("close"), price)
        open_5m = fvalue(candle_5m.get("open"), close_5m)

        if not micro_vol_ok:
            return make_rejection("Micro volatility is too disorderly for tight orderflow scalping.", 38)
        aligned_long = (
            close_1m > open_1m
            and close_5m > open_5m
            and taker_1m >= 0.58
            and taker_5m >= 0.54
            and external_taker_ratio >= 1.02
        )
        aligned_short = (
            close_1m < open_1m
            and close_5m < open_5m
            and taker_1m <= 0.42
            and taker_5m <= 0.46
            and external_taker_ratio <= 0.98
        )
        if aligned_long == aligned_short:
            return make_rejection("1m/5m taker flow does not confirm one clean direction.", 44)
        if max(volume_z_1m, volume_z_5m) < -0.35 and max(body_1m, body_5m) < 0.45:
            return make_rejection("Flow direction exists, but participation is too weak after fee buffer.", 46)

        side = "LONG" if aligned_long else "SHORT"
        score = 60 + int(abs(taker_1m - 0.5) * 80) + (8 if max(body_1m, body_5m) >= 0.5 else 0)
        notes: List[str] = [
            "1m and 5m candles align with taker-flow direction.",
            "Micro volatility is inside the tight-stop gate.",
            f"External taker ratio is {external_taker_ratio:.2f}; 30m OI change is {oi_change_30m:.2f}%.",
        ]
        if abs(oi_change_30m) >= 0.8:
            score += 5
            notes.append("OI expansion supports active microstructure participation.")
        risk_distance = max(atr_1m * 2.2, price * 0.0022)
        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(price), weight=0.8, reason="Micro flow impulse"),
                EntryPlan(price=round_price(price - risk_distance * 0.25), weight=0.2, reason="Immediate retest"),
            ]
            stop = round_price(price - risk_distance)
            take_profits = [
                TakeProfitPlan(price=round_price(price + risk_distance * 0.85), weight=0.55, reason="Fast scalp de-risk"),
                TakeProfitPlan(price=round_price(price + risk_distance * 1.45), weight=0.45, reason="Flow continuation"),
            ]
            setup = "MICRO_ORDERFLOW_IMPULSE_LONG"
        else:
            entries = [
                EntryPlan(price=round_price(price), weight=0.8, reason="Micro flow impulse"),
                EntryPlan(price=round_price(price + risk_distance * 0.25), weight=0.2, reason="Immediate retest"),
            ]
            stop = round_price(price + risk_distance)
            take_profits = [
                TakeProfitPlan(price=round_price(price - risk_distance * 0.85), weight=0.55, reason="Fast scalp de-risk"),
                TakeProfitPlan(price=round_price(price - risk_distance * 1.45), weight=0.45, reason="Flow continuation"),
            ]
            setup = "MICRO_ORDERFLOW_IMPULSE_SHORT"

        entries = normalize_entries_for_side(side, price, entries)
        if max(volume_z_1m, volume_z_5m) >= 1.0 and body_1m >= 0.55 and abs(oi_change_30m) >= 0.8:
            entries = normalize_entries_for_side(side, price, [
                EntryPlan(price=round_price(price), weight=1.0, reason="Clean micro flow burst"),
            ])
            notes.append("Clean micro flow burst upgraded this to a single immediate entry.")
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.12)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=0.9, fee_buffer_percent=0.12)
        if errors:
            return make_rejection("Orderflow sniper risk gates failed: " + "; ".join(errors), score)

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 86),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=self.profile.baseRiskPercent,
            orderIntent=default_order_intent("MICRO_FLOW_IMMEDIATE_THEN_RETEST", post_only=False),
            leveragePlan=default_leverage_plan(
                suggested=10 if len(entries) == 1 and score >= 80 else 8,
                maximum=10,
                reason="Fast orderflow scalps use 8-10x with very short patience and immediate de-risking on flow flips.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=self.profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note="Smallest risk bucket; exit quickly on flow flip and account for taker fees.",
                min_risk_reward=0.9,
                fee_buffer_percent=0.12,
            ),
            earlyExitRules=[
                "Exit early if 1m taker flow flips through neutral.",
                "Take partial quickly if price reaches 0.8R and 1m volume decays.",
            ],
            managementNotes=[
                "Agent review cadence should be the fastest among all traders after fill.",
            ],
            invalidation="Cancel if the next 1m candle fully reverses the impulse.",
            notes=notes,
        )
