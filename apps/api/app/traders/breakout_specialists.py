from datetime import datetime, timezone
from typing import Any, Dict

from app.traders.btc_strategy_support import (
    btc_gate_common,
    build_btc_candidate,
    build_btc_profile,
    reject_btc_candidate,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import (
    TraderStrategy,
    candle_body_ratio,
    completed_signal_execution_valid,
    fvalue,
    open_interest_available,
    taker_flow_available,
    timeframe,
)


def _completed_candle(frame: Dict[str, Any]) -> Dict[str, Any]:
    candle = frame.get("completedCandle") or frame.get("latestCompletedCandle") or frame.get("completedLatestCandle")
    if isinstance(candle, dict):
        return candle
    return {}


def _with_completed_trigger(snapshot: Dict[str, Any]) -> tuple[dict[str, float | str], Dict[str, Any]]:
    gates = btc_gate_common(snapshot)
    fifteen = timeframe(snapshot, "15m")
    candle = _completed_candle(fifteen)
    gates.update(
        {
            "close15m": fvalue(candle.get("close"), float(gates["price"])),
            "open15m": fvalue(candle.get("open"), float(gates["price"])),
            "high15m": fvalue(candle.get("high"), float(gates["price"])),
            "low15m": fvalue(candle.get("low"), float(gates["price"])),
            "openTime15m": fvalue(candle.get("openTime"), 0.0),
            "candleBody": candle_body_ratio(candle),
            "volumeZ15m": fvalue(
                fifteen.get("completedVolumeZscore"),
                -99.0,
            ),
        }
    )
    return gates, fifteen


class SessionRaider(TraderStrategy):
    profile = build_btc_profile(
        trader_id="session-raider",
        name="Session Raider",
        description="Trades completed BTC range breaks at the three deepest UTC liquidity handoffs.",
        concept="Frozen four-bar opening range, completed impulse confirmation, strict session timing, and fast structural invalidation.",
        base_risk=0.38,
        risk_level="MEDIUM_HIGH",
        long_conditions=["Completed 15m close breaks a frozen four-bar range", "UTC session handoff is 01, 08, or 14", "Body and volume confirm expansion", "4H trend does not block upside"],
        short_conditions=["Completed 15m close breaks a frozen four-bar range", "UTC session handoff is 01, 08, or 14", "Body and volume confirm expansion", "4H trend does not block downside"],
        entry_rules=["One 0.38% risk completed-candle order", "Optional derivatives may raise risk to 0.46%; never chase live excursions"],
        take_profit_rules=["First range expansion target", "Retain runner only outside the frozen range"],
        stop_loss_rules=["Stop behind the completed impulse", "Exit on completed re-entry into the range"],
        checklist=["Is the range frozen?", "Is the candle completed?", "Is the exact session active?", "Is net reward still positive after cost?"],
        current_plan="Waiting for a completed BTC break of a frozen four-bar range at 01, 08, or 14 UTC.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gates, fifteen = _with_completed_trigger(snapshot)
        completed_range = fifteen.get("priorCompletedRange")
        frozen_range = completed_range or {}
        open_time = int(float(gates["openTime15m"]))
        exact_prior_hour = (
            int(fvalue(frozen_range.get("candles"))) == 4
            and int(fvalue(frozen_range.get("firstOpenTime"))) == open_time - 3_600_000
            and int(fvalue(frozen_range.get("lastCloseTime"))) == open_time - 1
        )
        if not exact_prior_hour:
            return reject_btc_candidate(self.profile, "Session window or impulse confirmation is not ready because the completed prior range is unavailable.", 34, gates, "session_range_unavailable")
        range_high = fvalue(frozen_range.get("high"))
        range_low = fvalue(frozen_range.get("low"))
        hour = datetime.fromtimestamp(open_time / 1000, timezone.utc).hour if open_time else -1
        minute = datetime.fromtimestamp(open_time / 1000, timezone.utc).minute if open_time else -1
        active_window = hour in {1, 8, 14} and minute == 0
        impulse = float(gates["candleBody"]) >= 0.48 and float(gates["volumeZ15m"]) >= 0.25
        long_break = float(gates["close15m"]) > range_high and float(gates["open15m"]) <= range_high and gates["trend4h"] != "bearish"
        short_break = float(gates["close15m"]) < range_low and float(gates["open15m"]) >= range_low and gates["trend4h"] != "bullish"
        score = 44 + (12 if active_window else -6) + (10 if impulse else 0) + (7 if long_break or short_break else 0)
        if active_window and impulse and long_break:
            side, setup = "LONG", "SESSION_RANGE_BREAK_LONG"
        elif active_window and impulse and short_break:
            side, setup = "SHORT", "SESSION_RANGE_BREAK_SHORT"
        else:
            return reject_btc_candidate(self.profile, "Completed session breakout confirmation is not ready.", score, gates, "session_break_not_ready")
        derivative_confirmed = (
            (open_interest_available(snapshot) and abs(float(gates["oi30m"])) >= 0.35)
            or (
                taker_flow_available(snapshot)
                and (
                    (side == "LONG" and float(gates["takerBuyShare"]) >= 0.54)
                    or (side == "SHORT" and float(gates["takerBuyShare"]) <= 0.46)
                )
            )
        )
        broken_boundary = range_high if side == "LONG" else range_low
        if not completed_signal_execution_valid(
            side,
            live_price=float(gates["price"]),
            signal_price=float(gates["close15m"]),
            invalidation_level=broken_boundary,
            atr=float(gates["atr1h"]),
        ):
            return reject_btc_candidate(self.profile, "Completed session break is stale at the live execution price.", score, gates, "stale_completed_trigger")
        risk_distance = max(abs(float(gates["price"]) - broken_boundary) + float(gates["atr1h"]) * 0.35, float(gates["price"]) * 0.0035)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.30, 2.20),
            leverage=5,
            max_leverage=7,
            entry_style="single",
            order_execution="SESSION_BREAKOUT_FAST",
            reason_code="completed_session_range_break",
            gate_scores={
                **gates,
                "priorSessionRangeHigh": range_high,
                "priorSessionRangeLow": range_low,
                "derivativeConfirmed": derivative_confirmed,
            },
            sizing_note="Risk stays reduced unless optional derivatives independently confirm the completed range break.",
            risk_percent=0.46 if derivative_confirmed else 0.38,
        )


class MomentumIgnition(TraderStrategy):
    profile = build_btc_profile(
        trader_id="momentum-ignition",
        name="Compression Igniter",
        description="Trades a completed 15m release from a frozen twenty-bar box after verified 1H compression.",
        concept="Completed volatility compression and a non-repainting box breakout with expansion confirmation.",
        base_risk=0.52,
        risk_level="HIGH",
        long_conditions=["1H compression is complete", "Completed 15m close clears frozen twenty-bar high", "Body and volume expand", "4H is not bearish"],
        short_conditions=["1H compression is complete", "Completed 15m close clears frozen twenty-bar low", "Body and volume expand", "4H is not bullish"],
        entry_rules=["Enter only after the completed release", "No live-candle chase"],
        take_profit_rules=["Take partial on first expansion", "Run balance while completed closes hold outside"],
        stop_loss_rules=["Stop behind the release candle", "Reduce on completed box re-entry"],
        checklist=["Was compression complete first?", "Is the box frozen?", "Did body and volume expand?", "Does the trade clear costs?"],
        current_plan="Waiting for a completed 15m release from a frozen range after 1H compression.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        aggressive = self.profile.id.startswith("high-voltage-")
        gates, fifteen = _with_completed_trigger(snapshot)
        completed_range = fifteen.get("priorCompletedRange20")
        frozen_range = completed_range or {}
        if int(fvalue(frozen_range.get("candles"))) < 20:
            return reject_btc_candidate(self.profile, "A frozen twenty-candle compression range is required.", 34, gates, "compression_range_unavailable")
        upper = fvalue(frozen_range.get("high"))
        lower = fvalue(frozen_range.get("low"))
        width = float(gates["bollingerWidth1h"])
        keltner_width = float(gates["keltnerWidth1h"])
        compression_ratio = 1.05 if aggressive else 0.95
        compressed = str(gates["regime"]) == "squeeze" or (width > 0 and keltner_width > 0 and width <= keltner_width * compression_ratio)
        expansion = float(gates["candleBody"]) >= (0.36 if aggressive else 0.46) and float(gates["volumeZ15m"]) >= (0.05 if aggressive else 0.15)
        long_break = compressed and expansion and float(gates["close15m"]) > upper and gates["trend4h"] != "bearish"
        short_break = compressed and expansion and float(gates["close15m"]) < lower and gates["trend4h"] != "bullish"
        score = 44 + (16 if compressed else -8) + (14 if long_break or short_break else 0) + (8 if expansion else -4)
        enriched_gates = {
            **gates,
            "compressionReady": 1.0 if compressed else 0.0,
            "upperBoundary": upper,
            "lowerBoundary": lower,
        }
        if long_break:
            side, setup = "LONG", "VOLATILITY_COMPRESSION_IGNITION_LONG"
        elif short_break:
            side, setup = "SHORT", "VOLATILITY_COMPRESSION_IGNITION_SHORT"
        else:
            return reject_btc_candidate(self.profile, "Completed compression release is not ready.", score, enriched_gates, "compression_breakout_not_ready")
        broken_boundary = upper if side == "LONG" else lower
        if not completed_signal_execution_valid(
            side,
            live_price=float(gates["price"]),
            signal_price=float(gates["close15m"]),
            invalidation_level=broken_boundary,
            atr=float(gates["atr1h"]),
            maximum_atr_deviation=0.90 if aggressive else 0.75,
        ):
            return reject_btc_candidate(self.profile, "Completed compression release is stale at the live execution price.", score, enriched_gates, "stale_completed_trigger")
        risk_distance = max(float(gates["atr1h"]) * 0.82, float(gates["price"]) * 0.0048)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.55, 3.60) if aggressive else (1.55, 3.20),
            leverage=16 if aggressive and score < 78 else 20 if aggressive else 6,
            max_leverage=20 if aggressive else 8,
            entry_style="high_voltage_retest" if aggressive else "single",
            order_execution="COMPRESSION_BREAKOUT_PARTICIPATION",
            reason_code="completed_volatility_compression_ignition",
            gate_scores=enriched_gates,
            sizing_note="Size only after a completed squeeze release; unfinished candles and unavailable flow never add conviction.",
            risk_percent=self.profile.baseRiskPercent,
            min_rr=1.10 if aggressive else 1.15,
            take_profit_weights=(0.25, 0.75) if aggressive else (0.40, 0.60),
        )
