from datetime import datetime, timezone
from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    candidate_with_audit,
    candle_body_ratio,
    completed_signal_execution_valid,
    default_leverage_plan,
    default_order_intent,
    default_risk_plan,
    estimate_risk_reward,
    fvalue,
    latest_candle,
    make_rejection,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    taker_buy_share,
    timeframe,
    trend_for,
    wick_ratios,
)


def _completed_candle(frame: Dict[str, Any]) -> Dict[str, Any]:
    for key in ("completedCandle", "completedLatestCandle"):
        candle = frame.get(key)
        if isinstance(candle, dict) and candle:
            return candle
    return {}


class OrderflowSniper(TraderStrategy):
    profile = TraderProfile(
        id="orderflow-sniper",
        name="Session ORB Hunter",
        description="Trades BTC session/opening-range breaks with 15m follow-through, then cuts fast if the break falls back into range.",
        concept="Opening-range breakout desk: it wants price acceptance outside a fresh range, not unavailable internal taker-flow data.",
        baseRiskPercent=0.42,
        riskLevel="MEDIUM_HIGH",
        longConditions=[
            "BTC closes above the recent session or 1H range high",
            "15m body/volume confirm acceptance outside the range",
            "4H trend is not bearish",
            "Retest entry and stop still leave fee-aware upside",
        ],
        shortConditions=[
            "BTC closes below the recent session or 1H range low",
            "15m body/volume confirm acceptance outside the range",
            "4H trend is not bullish",
            "Retest entry and stop still leave fee-aware downside",
        ],
        entryRules=["60% on confirmed range break", "40% on shallow breakout retest"],
        takeProfitRules=["TP1 near the first expansion leg", "TP2 only while price holds outside the broken range"],
        stopLossRules=["Stop back inside the failed range", "Exit fast on 15m range re-entry"],
        aiReviewChecklist=[
            "Did price accept outside the session range, or is this only a wick?",
            "Is the retest entry still on the sensible side of current price?",
            "Does 4H structure permit a breakout attempt?",
            "Can the position be protected quickly if the range break fails?",
        ],
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan="Watching for BTC to break and hold a fresh session range before the retest becomes stale.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = fvalue(snapshot.get("price"))
        fifteen = timeframe(snapshot, "15m")
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        candle_15m = _completed_candle(fifteen)
        if not candle_15m:
            return make_rejection("Completed 15m breakout candle is unavailable.", 0)
        open_time = int(fvalue(candle_15m.get("openTime")))
        if open_time <= 0:
            return make_rejection("Completed session anchor timestamp is unavailable.", 0)
        opened_at = datetime.fromtimestamp(open_time / 1000, timezone.utc)
        if opened_at.hour not in {1, 8, 14} or opened_at.minute != 0:
            return make_rejection("Completed candle is outside a configured UTC session handoff.", 0)
        close_15m = fvalue(candle_15m.get("close"), price)
        open_15m = fvalue(candle_15m.get("open"), price)
        high_15m = fvalue(candle_15m.get("high"), price)
        low_15m = fvalue(candle_15m.get("low"), price)
        body_15m = candle_body_ratio(candle_15m)
        upper_wick, lower_wick = wick_ratios(candle_15m)
        completed_volume_z = fvalue(fifteen.get("completedVolumeZscore"), -99.0)
        volume_z = completed_volume_z
        external_taker_share = taker_buy_share(snapshot)
        oi_change_30m = open_interest_change(snapshot)
        atr_15m = max(fvalue(fifteen.get("atr14"), price * 0.004), price * 0.0025)
        atr_1h = max(fvalue(one_hour.get("atr14"), price * 0.008), price * 0.004)
        frozen_range = fifteen.get("priorCompletedRange") or {}
        if not (
            fvalue(frozen_range.get("high")) > fvalue(frozen_range.get("low"))
            and int(fvalue(frozen_range.get("candles"))) == 4
            and int(fvalue(frozen_range.get("firstOpenTime"))) == open_time - 3_600_000
            and int(fvalue(frozen_range.get("lastCloseTime"))) == open_time - 1
        ):
            return make_rejection("Frozen completed opening range is unavailable.", 0)
        session_high = fvalue(frozen_range.get("high"))
        session_low = fvalue(frozen_range.get("low"))
        range_source = "15m_prior_completed_4"
        buffer = max(atr_15m * 0.12, price * 0.001)
        acceptance_distance = max(atr_15m * 0.10, price * 0.0005)
        broke_up = close_15m > session_high and (close_15m - session_high) >= acceptance_distance
        broke_down = close_15m < session_low and (session_low - close_15m) >= acceptance_distance
        trend_1h = trend_for(snapshot, "1h")
        trend_4h = trend_for(snapshot, "4h")
        long_ready = broke_up and close_15m > open_15m and trend_4h != "bearish"
        short_ready = broke_down and close_15m < open_15m and trend_4h != "bullish"
        real_body_ok = body_15m >= 0.42
        wick_acceptance_ok = (
            (long_ready and upper_wick <= 0.36)
            or (short_ready and lower_wick <= 0.36)
            or (not long_ready and not short_ready)
        )
        participation_ok = real_body_ok and wick_acceptance_ok and volume_z >= 0.0
        score = 48
        score += 18 if long_ready or short_ready else 0
        score += 9 if participation_ok else -5
        score += 7 if body_15m >= 0.55 else 3 if body_15m >= 0.42 else 0
        score += 5 if volume_z >= 0.5 else 2 if volume_z >= 0.0 else -4
        score += 5 if (long_ready and trend_1h != "bearish") or (short_ready and trend_1h != "bullish") else 0
        if abs(oi_change_30m) >= 0.35:
            score += 3
        if (long_ready and external_taker_share > 0.53) or (short_ready and external_taker_share < 0.47):
            score += 3

        gate_scores = {
            "sessionHigh": round(session_high, 4),
            "sessionLow": round(session_low, 4),
            "rangeSource": range_source,
            "sessionHourUtc": opened_at.hour,
            "acceptanceDistance": round(acceptance_distance, 4),
            "close15m": round(close_15m, 4),
            "open15m": round(open_15m, 4),
            "body15m": round(body_15m, 4),
            "realBodyOk": 1.0 if real_body_ok else 0.0,
            "wickAcceptanceOk": 1.0 if wick_acceptance_ok else 0.0,
            "upperWick": round(upper_wick, 4),
            "lowerWick": round(lower_wick, 4),
            "volumeZ": round(volume_z, 4),
            "trend1h": trend_1h,
            "trend4h": trend_4h,
            "regime": market_regime(snapshot),
            "takerBuyShare": round(external_taker_share, 4),
            "oi30m": round(oi_change_30m, 4),
        }
        if long_ready == short_ready or not participation_ok or score < 60:
            return candidate_with_audit(
                TradeCandidate(
                    created=False,
                    reason="Session ORB break is not clean enough yet: range acceptance, 15m body, or trend filter is incomplete.",
                    setupScore=score,
                ),
                trader_id=self.profile.id,
                gate_scores=gate_scores,
                reason_code="session_orb_not_ready",
                observation_type="OBSERVE_ONLY" if score >= 52 else "NO_TRADE",
            )

        side = "LONG" if long_ready else "SHORT"
        setup = "SESSION_ORB_BREAKOUT_LONG" if side == "LONG" else "SESSION_ORB_BREAKOUT_SHORT"
        boundary = session_high if side == "LONG" else session_low
        if not completed_signal_execution_valid(
            side,
            live_price=price,
            signal_price=close_15m,
            invalidation_level=boundary,
            atr=atr_1h,
        ):
            return make_rejection("Completed session breakout is stale at the live execution price.", score)
        risk_distance = max(atr_15m * 1.15, atr_1h * 0.55, price * 0.0045)
        notes: List[str] = [
            "15m close accepted outside the recent session range.",
            "Internal taker/OI data is optional; this setup can run from OHLCV and range structure alone.",
            f"Session range {session_low:.1f}-{session_high:.1f}; 15m volume z-score {volume_z:.2f}.",
        ]
        if abs(oi_change_30m) >= 0.35:
            notes.append("Open-interest expansion adds confirmation but is not required.")
        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(price), weight=0.6, reason="Accepted session range break"),
                EntryPlan(price=round_price(max(session_high, price - risk_distance * 0.38)), weight=0.4, reason="Breakout retest"),
            ]
            stop = round_price(min(session_high - buffer, price - risk_distance))
            take_profits = [
                TakeProfitPlan(price=round_price(price + risk_distance * 1.35), weight=0.45, reason="First range expansion target"),
                TakeProfitPlan(price=round_price(price + risk_distance * 2.85), weight=0.55, reason="Continuation outside session range"),
            ]
        else:
            entries = [
                EntryPlan(price=round_price(price), weight=0.6, reason="Accepted session range break"),
                EntryPlan(price=round_price(min(session_low, price + risk_distance * 0.38)), weight=0.4, reason="Breakdown retest"),
            ]
            stop = round_price(max(session_low + buffer, price + risk_distance))
            take_profits = [
                TakeProfitPlan(price=round_price(price - risk_distance * 1.35), weight=0.45, reason="First range expansion target"),
                TakeProfitPlan(price=round_price(price - risk_distance * 2.85), weight=0.55, reason="Continuation outside session range"),
            ]
        entries = normalize_entries_for_side(side, price, entries)
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.10)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=1.08, fee_buffer_percent=0.10)
        if errors:
            return candidate_with_audit(
                TradeCandidate(created=False, reason="Session ORB risk gates failed: " + "; ".join(errors), setupScore=score),
                trader_id=self.profile.id,
                gate_scores=gate_scores,
                reason_code="session_orb_geometry_failed",
                observation_type="OBSERVE_ONLY" if score >= 52 else "NO_TRADE",
            )

        return candidate_with_audit(
            TradeCandidate(
                created=True,
                side=side,
                setupType=setup,
                setupScore=min(score, 90),
                entries=entries,
                stopLoss=stop,
                takeProfits=take_profits,
                riskPercent=self.profile.baseRiskPercent,
                orderIntent=default_order_intent("SESSION_ORB_BREAK_RETEST", post_only=False),
                leveragePlan=default_leverage_plan(
                    suggested=6 if score < 82 else 7,
                    maximum=8,
                    reason="Session ORB uses 6-7x only after a 15m close accepts outside the range; no unavailable flow feed is required.",
                ),
                riskPlan=default_risk_plan(
                    risk_percent=self.profile.baseRiskPercent,
                    risk_reward=risk_reward,
                    sizing_note="Range-break participation with fast failure exit and fee-aware retest spacing.",
                    min_risk_reward=1.08,
                    fee_buffer_percent=0.10,
                ),
                earlyExitRules=[
                    "Exit or cut risk if a 15m close returns inside the broken session range.",
                    "Cancel the retest slice if price reaches TP1 before the retest fills.",
                ],
                managementNotes=[
                    "Protect after TP1 or after a failed range retest; the edge is acceptance outside the range.",
                ],
                invalidation="Invalidate on a 15m close back inside the broken session range.",
                notes=notes,
            ),
            trader_id=self.profile.id,
            gate_scores=gate_scores,
            reason_code="session_orb_breakout",
        )
