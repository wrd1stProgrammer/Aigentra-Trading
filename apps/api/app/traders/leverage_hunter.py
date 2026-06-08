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
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    taker_buy_share,
)


class LeverageHunter(TraderStrategy):
    profile = TraderProfile(
        id="leverage-hunter",
        name="Leverage Hunter",
        description="Uses futures-specific overheating signals, then waits for structure trigger.",
        concept="Open interest, funding, crowding proxy, and structure break.",
        baseRiskPercent=0.6,
        riskLevel="HIGH",
        longConditions=[
            "Open interest is elevated",
            "Funding is low or negative",
            "Short side is crowded by proxy",
            "Price stops falling",
            "15m closes above resistance",
        ],
        shortConditions=[
            "Open interest is elevated",
            "Funding is high",
            "Long side is crowded by proxy",
            "Price stops rising",
            "15m closes below support",
        ],
        entryRules=["70% on structure trigger", "30% on retest confirmation"],
        takeProfitRules=["TP1 at 1.5R", "TP2 at 2.5R or next liquidation/support zone"],
        stopLossRules=["Beyond broken structure", "Beyond trigger candle extreme"],
        aiReviewChecklist=[
            "Is OI increase new positioning or noise?",
            "Is structure trigger confirmed?",
            "Is this just blind countertrend fading?",
            "Is opposite squeeze risk acceptable?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Waiting for crowding plus a real 15m structure trigger.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        fifteen = snapshot["timeframes"]["15m"]
        one_hour = snapshot["timeframes"]["1h"]
        funding = float(snapshot["derivatives"].get("fundingRate") or 0.0)
        oi = float(snapshot["derivatives"].get("openInterest") or 0.0)
        funding_percentile = funding_abs_percentile(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        derivative_crowded_side = crowded_side(snapshot)
        price_change = one_hour.get("priceChange", {}).get("1") or 0.0
        rsi = one_hour.get("rsi14") or 50.0
        taker_buy_ratio = fifteen.get("takerBuyRatio")
        if taker_buy_ratio is None:
            candle = fifteen.get("latestCandle", {})
            candle_volume = candle.get("volume") or fifteen.get("volume") or 0.0
            taker_buy_volume = candle.get("takerBuyBaseVolume") or 0.0
            taker_buy_ratio = taker_buy_volume / candle_volume if candle_volume > 0 else 0.5
        external_taker_share = taker_buy_share(snapshot)
        if external_taker_share != 0.5:
            taker_buy_ratio = (float(taker_buy_ratio) + external_taker_share) / 2
        taker_buy_ratio = min(max(float(taker_buy_ratio), 0.0), 1.0)
        swings = one_hour.get("swings", {})
        nearby_support = min(swings.get("lows", []) or [one_hour.get("low", price * 0.994)])
        nearby_resistance = max(swings.get("highs", []) or [one_hour.get("high", price * 1.006)])

        oi_available = oi > 0
        funding_tilted = abs(funding) >= 0.00003 or funding_percentile >= 70
        oi_expanding = oi_change_30m >= 0.8
        long_crowded = derivative_crowded_side == "LONG" or (funding > 0 and taker_buy_ratio >= 0.54)
        short_crowded = derivative_crowded_side == "SHORT" or (funding < 0 and taker_buy_ratio <= 0.46)
        bearish_structure = fifteen["close"] < fifteen["open"] and fifteen["close"] <= nearby_support * 1.003
        bullish_structure = fifteen["close"] > fifteen["open"] and fifteen["close"] >= nearby_resistance * 0.997

        if not oi_available:
            return make_rejection("Open interest gate failed; leverage crowding cannot be verified.", 30)
        if not funding_tilted:
            return make_rejection("Funding skew is too small for leverage crowding setup.", 38)
        if not oi_expanding and funding_percentile < 85:
            return make_rejection("Crowding exists, but OI expansion is not strong enough for a leverage flush setup.", 42)
        if long_crowded == short_crowded:
            return make_rejection("Taker flow proxy does not confirm a single crowded side.", 44)
        side = "SHORT" if long_crowded else "LONG"
        if side == "SHORT" and not bearish_structure:
            return make_rejection("Long crowding exists but bearish structure trigger is not confirmed.", 50)
        if side == "LONG" and not bullish_structure:
            return make_rejection("Short crowding exists but bullish structure trigger is not confirmed.", 50)

        score = 58
        notes: List[str] = []
        score += min(12, int(abs(funding) / 0.00001))
        notes.append("Open interest is present and funding skew cleared the hard gate.")
        notes.append(f"Taker buy share is {taker_buy_ratio:.2f}; 30m OI change is {oi_change_30m:.2f}%.")
        if funding_percentile:
            notes.append(f"Funding absolute percentile is {funding_percentile:.0f}.")
        if abs(price_change) < 0.006:
            score += 12
            notes.append("1H price change is not expanding with the crowding signal.")
        if rsi >= 58 or rsi <= 42:
            score += 8
        score += 10
        risk_distance = max(one_hour.get("atr14") or price * 0.01, price * 0.006)
        if side == "SHORT":
            stop = round_price(price + risk_distance)
            tps = [
                TakeProfitPlan(price=round_price(price - risk_distance * 1.5), weight=0.5, reason="1.5R cover"),
                TakeProfitPlan(price=round_price(price - risk_distance * 2.5), weight=0.5, reason="2.5R squeeze target"),
            ]
            setup = "LEVERAGE_CROWDING_BREAKDOWN_SHORT"
        else:
            stop = round_price(price - risk_distance)
            tps = [
                TakeProfitPlan(price=round_price(price + risk_distance * 1.5), weight=0.5, reason="1.5R cover"),
                TakeProfitPlan(price=round_price(price + risk_distance * 2.5), weight=0.5, reason="2.5R squeeze target"),
            ]
            setup = "LEVERAGE_CROWDING_BREAKOUT_LONG"

        entries = normalize_entries_for_side(side, price, [
            EntryPlan(price=round_price(price), weight=0.7, reason="Structure trigger"),
            EntryPlan(price=round_price(price * (1.002 if side == "SHORT" else 0.998)), weight=0.3, reason="Retest confirmation"),
        ])
        risk_reward = estimate_risk_reward(side, entries, stop, tps, fee_buffer_percent=0.1)
        errors = candidate_geometry_errors(
            side,
            price,
            entries,
            stop,
            tps,
            min_risk_reward=1.35,
            fee_buffer_percent=0.1,
        )
        if errors:
            return make_rejection("Leverage hunter risk gates failed: " + "; ".join(errors), score)
        leverage = 10 if (abs(funding) >= 0.00008 or funding_percentile >= 85) and score >= 78 else 8
        risk_percent = self.profile.baseRiskPercent if leverage <= 8 else round(self.profile.baseRiskPercent * 0.85, 2)

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 88),
            entries=entries,
            stopLoss=stop,
            takeProfits=tps,
            riskPercent=risk_percent,
            orderIntent=default_order_intent("STRUCTURE_TRIGGER_THEN_RETEST", post_only=False),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=10,
                reason="Leverage Hunter is the high-beta futures specialist: 8-10x only after funding/crowding and structure confirm together.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
                risk_reward=risk_reward,
                sizing_note="Use smaller notional because funding and taker flow can reverse abruptly.",
                min_risk_reward=1.35,
                fee_buffer_percent=0.1,
            ),
            earlyExitRules=[
                "Exit early if taker flow flips back toward the crowded side before TP1.",
                "Exit early if funding remains skewed but price reclaims the trigger candle against the trade.",
            ],
            managementNotes=[
                "Agent should be faster than other swing strategies: reduce risk on flow flip even before stop.",
                "At 1R, Agent may move stop to breakeven because squeeze trades often reverse sharply.",
            ],
            invalidation="Cancel if the trigger candle is fully reclaimed against the trade.",
            notes=notes,
        )
