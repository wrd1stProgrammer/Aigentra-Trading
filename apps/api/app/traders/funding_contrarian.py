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
    fvalue,
    funding_abs_percentile,
    latest_candle,
    make_rejection,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    taker_buy_sell_ratio,
    timeframe,
)


class FundingContrarian(TraderStrategy):
    profile = TraderProfile(
        id="funding-contrarian",
        name="Funding Contrarian",
        description="Fades extreme futures funding only when price stalls, structure confirms, and the crowded side starts losing momentum.",
        concept="High or negative funding alone is not enough; this trader waits for proof that the crowded futures bet is becoming vulnerable.",
        baseRiskPercent=0.45,
        riskLevel="MEDIUM_HIGH",
        longConditions=[
            "Funding is meaningfully negative",
            "Price stops making new lows despite bearish positioning",
            "15m closes back above a micro resistance",
            "Risk/reward allows fast partial at funding normalization",
        ],
        shortConditions=[
            "Funding is meaningfully positive",
            "Price stops making new highs despite bullish positioning",
            "15m closes back below a micro support",
            "Risk/reward allows fast partial at funding normalization",
        ],
        entryRules=["65% after structure trigger", "35% on retest if funding remains stretched"],
        takeProfitRules=["TP1 at 1.3R or funding normalization", "TP2 at 2.2R or opposite intraday level"],
        stopLossRules=["Beyond failed structure", "No stop widening when funding remains extreme"],
        aiReviewChecklist=[
            "Is this funding extreme tradable, or can crowding stay irrational longer?",
            "Is there a real structure trigger rather than blind mean reversion?",
            "Is opposite squeeze risk controlled by small size and stop distance?",
            "Should profit be taken early when funding normalizes?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Watching funding extremes, but refusing to fade without structure confirmation.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        fifteen = timeframe(snapshot, "15m")
        one_hour = timeframe(snapshot, "1h")
        candle = latest_candle(fifteen)
        funding = fvalue(snapshot.get("derivatives", {}).get("fundingRate"), 0.0)
        mark_price = fvalue(snapshot.get("derivatives", {}).get("markPrice"), price)
        index_price = fvalue(snapshot.get("derivatives", {}).get("indexPrice"), price)
        premium = ((mark_price - index_price) / index_price) if index_price else 0.0
        oi = fvalue(snapshot.get("derivatives", {}).get("openInterest"), 0.0)
        funding_percentile = funding_abs_percentile(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        crowding = crowded_side(snapshot)
        taker_ratio = taker_buy_sell_ratio(snapshot)
        atr_1h = fvalue(one_hour.get("atr14"), price * 0.008)
        price_change_1h = fvalue(one_hour.get("priceChange", {}).get("1"), 0.0)
        swings = one_hour.get("swings", {})
        support = min(swings.get("lows", []) or [fvalue(one_hour.get("low"), price * 0.994)])
        resistance = max(swings.get("highs", []) or [fvalue(one_hour.get("high"), price * 1.006)])
        close = fvalue(candle.get("close"), price)
        open_ = fvalue(candle.get("open"), close)

        if oi <= 0:
            return make_rejection("Open interest is unavailable, so funding crowding cannot be trusted.", 34)
        if abs(funding) < 0.000045 and abs(premium) < 0.00035 and funding_percentile < 80:
            return make_rejection("Funding/premium is not extreme enough for contrarian setup.", 40)
        if abs(oi_change_30m) < 0.3 and funding_percentile < 85:
            return make_rejection("Funding is stretched, but OI change is too weak to prove active crowding.", 44)

        side = None
        if funding > 0 and premium >= -0.0005 and price_change_1h <= 0.0025 and close < open_:
            side = "SHORT"
        elif funding < 0 and premium <= 0.0005 and price_change_1h >= -0.0025 and close > open_:
            side = "LONG"
        if side is None:
            return make_rejection("Funding is stretched, but structure/stall trigger is not confirmed.", 48)
        if side == "SHORT" and crowding == "SHORT":
            return make_rejection("Contrarian short rejected because current crowding is already short-sided.", 48)
        if side == "LONG" and crowding == "LONG":
            return make_rejection("Contrarian long rejected because current crowding is already long-sided.", 48)

        score = 60 + min(16, int(abs(funding) / 0.00001)) + (6 if abs(price_change_1h) < 0.0015 else 0)
        if funding_percentile >= 80:
            score += 8
        squeeze_pressure = (
            (side == "SHORT" and price_change_1h > 0.0015 and taker_ratio > 1.15)
            or (side == "LONG" and price_change_1h < -0.0015 and taker_ratio < 0.85)
        ) and oi_change_30m >= 1.0
        if squeeze_pressure:
            score -= 4
        notes: List[str] = [
            "Funding or mark/index premium is stretched enough for a contrarian watch.",
            "15m structure shows stall before entry.",
            f"30m OI change is {oi_change_30m:.2f}% and taker buy/sell ratio is {taker_ratio:.2f}.",
        ]
        if squeeze_pressure:
            notes.append("Crowded-side pressure is still active, so this remains a smaller probe-and-retest fade.")
        risk_distance = max(atr_1h * 0.75, price * 0.005)
        trigger_weight = 0.45 if squeeze_pressure else 0.65
        retest_weight = round(1.0 - trigger_weight, 2)
        if side == "SHORT":
            trigger_level = max(price, min(resistance, price + risk_distance * 0.25))
            entries = [
                EntryPlan(price=round_price(price), weight=trigger_weight, reason="Bearish structure trigger after positive funding"),
                EntryPlan(price=round_price(trigger_level), weight=retest_weight, reason="Retest while funding remains stretched"),
            ]
            stop = round_price(max(resistance, price + risk_distance))
            take_profits = [
                TakeProfitPlan(price=round_price(price - risk_distance * 1.3), weight=0.55, reason="Funding normalization or 1.3R"),
                TakeProfitPlan(price=round_price(price - risk_distance * 2.2), weight=0.45, reason="Contrarian unwind target"),
            ]
            setup = "POSITIVE_FUNDING_STALL_SHORT"
        else:
            trigger_level = min(price, max(support, price - risk_distance * 0.25))
            entries = [
                EntryPlan(price=round_price(price), weight=trigger_weight, reason="Bullish structure trigger after negative funding"),
                EntryPlan(price=round_price(trigger_level), weight=retest_weight, reason="Retest while funding remains stretched"),
            ]
            stop = round_price(min(support, price - risk_distance))
            take_profits = [
                TakeProfitPlan(price=round_price(price + risk_distance * 1.3), weight=0.55, reason="Funding normalization or 1.3R"),
                TakeProfitPlan(price=round_price(price + risk_distance * 2.2), weight=0.45, reason="Contrarian unwind target"),
            ]
            setup = "NEGATIVE_FUNDING_STALL_LONG"

        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.1)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=1.25, fee_buffer_percent=0.1)
        if errors:
            return make_rejection("Funding contrarian risk gates failed: " + "; ".join(errors), score)
        risk_percent = 0.3 if squeeze_pressure else self.profile.baseRiskPercent

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 88),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=risk_percent,
            orderIntent=default_order_intent("FUNDING_STALL_TRIGGER", post_only=False),
            leveragePlan=default_leverage_plan(
                suggested=6 if score < 82 else 8,
                maximum=8,
                reason="Funding contrarian trades use 6-8x only after stall confirmation because crowding can persist longer than expected.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
                risk_reward=risk_reward,
                sizing_note="Small contrarian risk; exit early if funding normalizes without price follow-through.",
                min_risk_reward=1.25,
                fee_buffer_percent=0.1,
            ),
            earlyExitRules=[
                "Take partial or tighten stop if funding normalizes before TP1.",
                "Close early if price accelerates with the crowded side after entry.",
            ],
            managementNotes=[
                "Agent should distinguish funding normalization profit from squeeze continuation risk.",
            ],
            invalidation="Cancel if the structure trigger is reclaimed and funding stays extreme.",
            notes=notes,
        )
