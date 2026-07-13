from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candle_body_ratio,
    candidate_geometry_errors,
    completed_signal_execution_valid,
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


def _completed_candle(frame: Dict[str, Any]) -> Dict[str, Any]:
    for key in ("completedCandle", "completedLatestCandle"):
        candle = frame.get(key)
        if isinstance(candle, dict) and candle:
            return candle
    return {}


class VolumeBreaker(TraderStrategy):
    profile = TraderProfile(
        id="volume-breaker",
        name="Volume Breaker",
        description="Waits for a major level to break with real participation, then checks whether the retest confirms the breakout instead of chasing.",
        concept="Its core idea is simple: a breakout matters only when volume, retest behavior, and structure all agree that new traders joined.",
        baseRiskPercent=0.8,
        riskLevel="MEDIUM_HIGH",
        longConditions=[
            "Major 1H or 4H resistance exists",
            "Close breaks above resistance",
            "Breakout volume z-score is elevated",
            "Retest holds above the old resistance",
            "15m rebound candle appears",
        ],
        shortConditions=[
            "Major 1H or 4H support exists",
            "Close breaks below support",
            "Breakdown volume z-score is elevated",
            "Retest rejects below the old support",
            "15m bearish candle appears",
        ],
        entryRules=["60/40 retest and confirmation under normal participation", "100% completed confirmation only when volume and taker flow are both strong"],
        takeProfitRules=["TP1 at next short-term level", "TP2 at next 1H/4H level"],
        stopLossRules=["Below breakout level for long", "Above breakdown level for short"],
        aiReviewChecklist=[
            "Was the breakout supported by real volume?",
            "Did retest confirm the level flip?",
            "Is entry too late?",
            "Is funding/OI overheated?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Monitoring retests after clean high-volume level breaks.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        one_hour = snapshot["timeframes"]["1h"]
        fifteen = snapshot["timeframes"]["15m"]
        volume_z = fifteen.get("completedVolumeZscore")
        if volume_z is None:
            return make_rejection("Completed breakout volume is unavailable.", 0)
        funding_percentile = funding_abs_percentile(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        crowding = crowded_side(snapshot)
        external_taker_share = taker_buy_share(snapshot)
        atr_value = one_hour.get("atr14") or price * 0.01
        candle = _completed_candle(fifteen)
        if not candle:
            return make_rejection("Completed 15m breakout candle is unavailable.", 0)
        frozen_range = one_hour.get("priorCompletedRange") or {}
        if (
            float(frozen_range.get("high") or 0.0) > float(frozen_range.get("low") or 0.0)
            and int(float(frozen_range.get("candles") or 0.0)) >= 20
        ):
            resistance = float(frozen_range["high"])
            support = float(frozen_range["low"])
        else:
            return make_rejection("Frozen completed 1H range is unavailable.", 0)
        retest_tolerance = max(atr_value * 0.12, price * 0.0015)
        body_ok = candle_body_ratio(candle) >= 0.30

        breakout_long = candle["close"] > resistance and candle["high"] > resistance
        retest_long = candle["low"] <= resistance + retest_tolerance and candle["close"] > resistance
        breakout_short = candle["close"] < support and candle["low"] < support
        retest_short = candle["high"] >= support - retest_tolerance and candle["close"] < support
        confirmed_long = breakout_long and retest_long and candle["close"] > candle["open"] and body_ok
        confirmed_short = breakout_short and retest_short and candle["close"] < candle["open"] and body_ok

        if volume_z < 1.0:
            return make_rejection("Volume expansion gate failed for breakout/retest setup.", 35)
        if confirmed_long == confirmed_short:
            return make_rejection("No single clean breakout/retest direction is confirmed.", 42)

        score = 55
        notes: List[str] = []
        score += min(18, int((volume_z - 1.0) * 8) + 10)
        notes.append("15m volume z-score cleared the breakout participation gate.")

        side = "LONG" if confirmed_long else "SHORT"
        boundary = resistance if side == "LONG" else support
        if not completed_signal_execution_valid(
            side,
            live_price=price,
            signal_price=float(candle["close"]),
            invalidation_level=boundary,
            atr=atr_value,
        ):
            return make_rejection("Completed volume breakout is stale at the live execution price.", 50)
        if side == crowding and funding_percentile >= 85 and oi_change_30m >= 1.0:
            return make_rejection("Breakout direction is already crowded by funding/OI, raising fakeout risk.", 54)
        if side == "LONG":
            score += 14
            entry_level = min(resistance + retest_tolerance * 0.25, price)
            stop = min(resistance - atr_value * 0.45, candle["low"] - atr_value * 0.08)
            risk_distance = max(entry_level - stop, price * 0.004)
            tps = [
                TakeProfitPlan(price=round_price(entry_level + risk_distance * 1.65), weight=0.45, reason="1.65R continuation"),
                TakeProfitPlan(price=round_price(entry_level + risk_distance * 3.0), weight=0.55, reason="Next higher timeframe extension"),
            ]
            setup = "VOLUME_BREAKOUT_RETEST_LONG"
        else:
            score += 14
            entry_level = max(support - retest_tolerance * 0.25, price)
            stop = max(support + atr_value * 0.45, candle["high"] + atr_value * 0.08)
            risk_distance = max(stop - entry_level, price * 0.004)
            tps = [
                TakeProfitPlan(price=round_price(entry_level - risk_distance * 1.65), weight=0.45, reason="1.65R continuation"),
                TakeProfitPlan(price=round_price(entry_level - risk_distance * 3.0), weight=0.55, reason="Next higher timeframe extension"),
            ]
            setup = "VOLUME_BREAKDOWN_RETEST_SHORT"

        entries = normalize_entries_for_side(side, price, [
            EntryPlan(price=round_price(entry_level), weight=0.6, reason="Retest level after break"),
            EntryPlan(price=round_price(price), weight=0.4, reason="Confirmation close"),
        ])
        taker_aligned = (side == "LONG" and external_taker_share >= 0.56) or (side == "SHORT" and external_taker_share <= 0.44)
        if taker_aligned:
            score += 6
            notes.append("External taker buy/sell flow agrees with breakout direction.")
        if volume_z >= 2.0 and taker_aligned:
            entries = normalize_entries_for_side(side, price, [
                EntryPlan(price=round_price(price), weight=1.0, reason="High-volume confirmed breakout participation"),
            ])
            notes.append("Strong taker-flow alignment upgraded this to a single confirmed-entry plan.")
        stop = round_price(stop)
        risk_reward = estimate_risk_reward(side, entries, stop, tps)
        errors = candidate_geometry_errors(side, price, entries, stop, tps)
        if errors:
            return make_rejection("Volume breaker risk gates failed: " + "; ".join(errors), score)
        leverage = 8 if volume_z >= 2.0 and score >= 78 else 6
        risk_percent = self.profile.baseRiskPercent if volume_z >= 1.4 else round(self.profile.baseRiskPercent * 0.8, 2)

        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup,
            setupScore=min(score, 90),
            entries=entries,
            stopLoss=stop,
            takeProfits=tps,
            riskPercent=risk_percent,
            orderIntent=default_order_intent(
                "CONFIRMED_BREAKOUT_IMMEDIATE" if len(entries) == 1 else "RETEST_THEN_CONFIRMATION",
                post_only=len(entries) > 1,
            ),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=8,
                reason="Breakout/retest trades use 6-8x, with 8x reserved for materially above-average confirmation volume.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=risk_percent,
                risk_reward=risk_reward,
                sizing_note="Size from stop distance after fee buffer; do not chase beyond confirmation close.",
            ),
            earlyExitRules=[
                "Exit early if a 15m candle closes back inside the broken level.",
                "Exit early if volume z-score turns negative on the next confirmation candle.",
            ],
            managementNotes=[
                "Agent should cancel pending retest orders quickly if price closes back inside the broken level.",
                "If continuation volume fades before TP1, Agent may reduce size instead of waiting for the hard stop.",
            ],
            invalidation="Cancel if retest level fails on 15m close.",
            notes=notes,
        )
