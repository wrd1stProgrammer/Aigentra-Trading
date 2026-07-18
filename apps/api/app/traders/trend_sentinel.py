from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
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


class TrendSentinel(TraderStrategy):
    profile = TraderProfile(
        id="trend-sentinel",
        name="Trend Sentinel",
        description="Focuses on slower high-timeframe continuation trades and gives winners more room when the larger trend remains intact.",
        concept="It is the patient trend desk: fewer trades, wider context, controlled pullback entries, and trailing exits instead of quick scalps.",
        baseRiskPercent=0.45,
        riskLevel="LOW_MEDIUM",
        longConditions=[
            "4H trend is bullish and 1D is not bearish",
            "4H EMA20 remains above EMA50",
            "1H pullback stays above EMA50",
            "ADX or swing structure shows trend persistence",
            "Funding is not extremely positive",
        ],
        shortConditions=[
            "4H trend is bearish and 1D is not bullish",
            "4H EMA20 remains below EMA50",
            "1H rebound stays below EMA50",
            "ADX or swing structure shows trend persistence",
            "Funding is not extremely negative",
        ],
        entryRules=["40% at 1H mean", "60% at continuation confirmation"],
        takeProfitRules=["TP1 at 1.5R", "Let remainder trail with 4H structure"],
        stopLossRules=["Beyond 1H EMA50 and recent structure", "Never widen the trailing stop"],
        aiReviewChecklist=[
            "Is this still a trend or already late exhaustion?",
            "Is funding too crowded for continuation?",
            "Should the second entry wait for confirmation instead of filling immediately?",
            "Can the stop trail without choking the trend?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Waiting for a clean high-timeframe continuation pullback.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        aggressive = self.profile.id.startswith("high-voltage-")
        price = float(snapshot["price"])
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        one_day = timeframe(snapshot, "1d")
        trend_4h = trend_for(snapshot, "4h")
        trend_1d = str(one_day.get("trend") or trend_4h)
        funding = fvalue(snapshot.get("derivatives", {}).get("fundingRate"), 0.0)
        ema20_4h = fvalue(four_hour.get("ema20"), price)
        ema50_4h = fvalue(four_hour.get("ema50"), price)
        ema20_1h = fvalue(one_hour.get("ema20"), price)
        ema50_1h = fvalue(one_hour.get("ema50"), price)
        adx_4h = fvalue(four_hour.get("adx14"), 18.0)
        atr_1h = fvalue(one_hour.get("atr14"), price * 0.008)
        price_change_12h = fvalue(four_hour.get("priceChange", {}).get("4"), 0.0)
        funding_percentile = funding_abs_percentile(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        regime = market_regime(snapshot)

        bullish = trend_4h == "bullish" and trend_1d != "bearish" and ema20_4h >= ema50_4h
        bearish = trend_4h == "bearish" and trend_1d != "bullish" and ema20_4h <= ema50_4h
        if not (bullish or bearish):
            return make_rejection("4H/1D trend alignment is not clean enough for Sentinel continuation.", 42)
        if regime in {"range", "squeeze"} and adx_4h < (20 if aggressive else 24):
            return make_rejection("Trend Sentinel is paused because regime is not trending enough.", 44)
        if bullish and (funding > (0.00018 if aggressive else 0.00012) or funding_percentile >= (96 if aggressive else 92)):
            return make_rejection("Bullish continuation is too crowded by funding.", 48)
        if bearish and (funding < (-0.00018 if aggressive else -0.00012) or funding_percentile >= (96 if aggressive else 92)):
            return make_rejection("Bearish continuation is too crowded by funding.", 48)
        if adx_4h < (12 if aggressive else 15) and abs(price_change_12h) < (0.0025 if aggressive else 0.004):
            return make_rejection("Trend strength is too weak for a continuation hold strategy.", 46)

        side = "LONG" if bullish else "SHORT"
        score = 60 + (10 if adx_4h >= 20 else 0) + (8 if abs(price_change_12h) >= 0.006 else 0)
        notes: List[str] = ["4H trend and EMA stack align with continuation."]
        notes.append(f"Regime is {regime}; 30m OI change is {oi_change_30m:.2f}%.")
        if trend_1d == trend_4h:
            score += 8
            notes.append("1D trend agrees with the 4H direction.")
        if oi_change_30m > 0.6:
            score += 5
            notes.append("OI expansion supports trend participation.")

        risk_distance = max(atr_1h * 1.05, price * 0.006)
        if side == "LONG":
            if price < ema50_1h - (risk_distance * 0.20 if aggressive else 0):
                return make_rejection("Price is already below 1H EMA50; continuation thesis is weakened.", 50)
            mean_entry = min(price, max(ema20_1h, price - risk_distance * 0.35))
            entries = [
                EntryPlan(price=round_price(mean_entry), weight=0.4, reason="1H mean pullback"),
                EntryPlan(price=round_price(price), weight=0.6, reason="Continuation confirmation"),
            ]
            if aggressive:
                entries = [
                    EntryPlan(price=round_price(price), weight=0.40, reason="Immediate valid trend pullback"),
                    EntryPlan(price=round_price(mean_entry), weight=0.30, reason="1H mean pullback"),
                    EntryPlan(price=round_price(max(ema50_1h, price - risk_distance * 0.55)), weight=0.30, reason="Final structural pullback scale"),
                ]
            if adx_4h >= 28 and oi_change_30m >= 0.8:
                entries = [
                    EntryPlan(price=round_price(price), weight=1.0, reason="Strong HTF continuation participation"),
                ]
            stop = round_price(min(ema50_1h, price - risk_distance))
            take_profits = [
                TakeProfitPlan(price=round_price(price + risk_distance * 1.5), weight=0.45, reason="1.5R de-risk"),
                TakeProfitPlan(price=round_price(price + risk_distance * 3.0), weight=0.55, reason="4H trend trailing objective"),
            ]
            if aggressive:
                take_profits = [
                    take_profits[0].model_copy(update={"weight": 0.20}),
                    take_profits[1].model_copy(update={"weight": 0.80}),
                ]
            setup = "HTF_TREND_CONTINUATION_LONG"
        else:
            if price > ema50_1h + (risk_distance * 0.20 if aggressive else 0):
                return make_rejection("Price is already above 1H EMA50; short continuation thesis is weakened.", 50)
            mean_entry = max(price, min(ema20_1h, price + risk_distance * 0.35))
            entries = [
                EntryPlan(price=round_price(mean_entry), weight=0.4, reason="1H mean rebound"),
                EntryPlan(price=round_price(price), weight=0.6, reason="Continuation confirmation"),
            ]
            if aggressive:
                entries = [
                    EntryPlan(price=round_price(price), weight=0.40, reason="Immediate valid trend rebound"),
                    EntryPlan(price=round_price(mean_entry), weight=0.30, reason="1H mean rebound"),
                    EntryPlan(price=round_price(min(ema50_1h, price + risk_distance * 0.55)), weight=0.30, reason="Final structural rebound scale"),
                ]
            if adx_4h >= 28 and oi_change_30m >= 0.8:
                entries = [
                    EntryPlan(price=round_price(price), weight=1.0, reason="Strong HTF continuation participation"),
                ]
            stop = round_price(max(ema50_1h, price + risk_distance))
            take_profits = [
                TakeProfitPlan(price=round_price(price - risk_distance * 1.5), weight=0.45, reason="1.5R de-risk"),
                TakeProfitPlan(price=round_price(price - risk_distance * 3.0), weight=0.55, reason="4H trend trailing objective"),
            ]
            if aggressive:
                take_profits = [
                    take_profits[0].model_copy(update={"weight": 0.20}),
                    take_profits[1].model_copy(update={"weight": 0.80}),
                ]
            setup = "HTF_TREND_CONTINUATION_SHORT"

        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.08)
        minimum_rr = 1.25 if aggressive else 1.45
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=minimum_rr, fee_buffer_percent=0.08)
        if errors:
            return make_rejection("Trend sentinel risk gates failed: " + "; ".join(errors), score)

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 92),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=self.profile.baseRiskPercent,
            orderIntent=default_order_intent("HTF_PULLBACK_AND_CONFIRMATION"),
            leveragePlan=default_leverage_plan(
                suggested=(10 if score < 78 else 14) if aggressive else (6 if score < 78 else 8),
                maximum=14 if aggressive else 8,
                reason=(
                    "High Voltage trend continuation uses 10-14x isolated leverage while the 4H structure remains intact."
                    if aggressive
                    else "Trend Sentinel uses 6-8x for confirmed continuation, with wider structure stops and trailing management."
                ),
            ),
            riskPlan=default_risk_plan(
                risk_percent=self.profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note="Lower risk per trade; allow the winning remainder to trail instead of forcing quick exits.",
                min_risk_reward=minimum_rr,
            ),
            earlyExitRules=[
                "Exit early if 4H closes through EMA50 against the position.",
                "Take partial profit if funding becomes extreme while price stalls.",
            ],
            managementNotes=[
                "Agent can let profit run when ADX remains strong, but must tighten stops on 4H structure breaks.",
            ],
            invalidation="Cancel if 4H EMA stack flips before fill.",
            notes=notes,
        )
