from typing import Any, Dict

from app.traders.btc_strategy_support import (
    btc_gate_common,
    build_btc_candidate,
    reject_btc_candidate,
)
from app.traders.btc_redesigned_profiles import (
    BOLLINGER_REVERSION_PROFILE,
    RSI_DIVERGENCE_SCOUT_PROFILE,
    VWAP_RECLAIMER_PROFILE,
    WYCKOFF_SPRING_PROFILE,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import (
    TraderStrategy,
    candle_body_ratio,
    completed_signal_execution_valid,
    fvalue,
    timeframe,
    wick_ratios,
)


def _completed_candle(frame: Dict[str, Any]) -> Dict[str, Any] | None:
    for key in ("completedCandle", "latestCompletedCandle", "completedLatestCandle"):
        candle = frame.get(key)
        if isinstance(candle, dict):
            return candle
    return None


def _completed_gate(snapshot: Dict[str, Any]) -> tuple[dict[str, float | str], Dict[str, Any] | None]:
    gate = btc_gate_common(snapshot)
    fifteen = timeframe(snapshot, "15m")
    candle = _completed_candle(fifteen)
    if candle is None:
        return gate, None
    upper_wick, lower_wick = wick_ratios(candle)
    gate.update(
        {
            "close15m": fvalue(candle.get("close")),
            "open15m": fvalue(candle.get("open")),
            "high15m": fvalue(candle.get("high")),
            "low15m": fvalue(candle.get("low")),
            "candleBody": candle_body_ratio(candle),
            "upperWick": upper_wick,
            "lowerWick": lower_wick,
            "volumeZ15m": fvalue(fifteen.get("completedVolumeZscore"), -99.0),
        }
    )
    return gate, candle


class VwapReclaimer(TraderStrategy):
    profile = VWAP_RECLAIMER_PROFILE

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gate, candle = _completed_gate(snapshot)
        fifteen = timeframe(snapshot, "15m")
        vwap = fvalue(fifteen.get("barVwapProxy20"), -1.0)
        if candle is None or vwap <= 0:
            return reject_btc_candidate(self.profile, "Completed VWAP proxy data is unavailable.", 0, gate, "vwap_completed_data_missing")

        close = fvalue(candle.get("close"))
        open_ = fvalue(candle.get("open"))
        low = fvalue(candle.get("low"))
        high = fvalue(candle.get("high"))
        body = candle_body_ratio(candle)
        reclaim_long = open_ < vwap and low < vwap < close and close > open_ and body >= 0.30
        reject_short = open_ > vwap and high > vwap > close and close < open_ and body >= 0.30
        reclaim_long = reclaim_long and gate["trend4h"] != "bearish"
        reject_short = reject_short and gate["trend4h"] != "bullish"
        score = 50 + (14 if reclaim_long or reject_short else 0) + (7 if body >= 0.42 else 0)
        if reclaim_long:
            side, setup = "LONG", "VWAP_RECLAIM_LONG"
        elif reject_short:
            side, setup = "SHORT", "VWAP_REJECT_SHORT"
        else:
            return reject_btc_candidate(self.profile, "The completed candle did not reclaim or reject the bar VWAP proxy.", score, gate, "vwap_reentry_not_confirmed")
        if not completed_signal_execution_valid(
            side,
            live_price=float(gate["price"]),
            signal_price=close,
            invalidation_level=vwap,
            atr=float(gate["atr1h"]),
        ):
            return reject_btc_candidate(self.profile, "Completed VWAP reentry is stale at the live execution price.", score, gate, "stale_completed_trigger")
        risk_distance = max(float(gate["atr1h"]) * 0.78, float(gate["price"]) * 0.0042)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.45, 2.65),
            leverage=5,
            max_leverage=7,
            entry_style="confirm_retest",
            order_execution="COMPLETED_VWAP_REENTRY",
            reason_code="completed_vwap_reentry",
            gate_scores={**gate, "barVwapProxy20": vwap},
            sizing_note="VWAP reentry: risk stays moderate because intraday fair-value edges decay quickly.",
        )


class RsiDivergenceScout(TraderStrategy):
    profile = RSI_DIVERGENCE_SCOUT_PROFILE

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gate, candle = _completed_gate(snapshot)
        divergence = timeframe(snapshot, "1h").get("confirmedRsiPivotDivergence")
        if candle is None or not isinstance(divergence, dict) or not divergence.get("available"):
            return reject_btc_candidate(self.profile, "Confirmed RSI pivot divergence data is unavailable.", 0, gate, "rsi_pivot_data_missing")

        direction = str(divergence.get("direction") or "none")
        separation = int(fvalue(divergence.get("second_index")) - fvalue(divergence.get("first_index")))
        first_price = fvalue(divergence.get("first_price"))
        second_price = fvalue(divergence.get("second_price"))
        first_rsi = fvalue(divergence.get("first_rsi"))
        second_rsi = fvalue(divergence.get("second_rsi"))
        close = fvalue(candle.get("close"))
        open_ = fvalue(candle.get("open"))
        bullish = direction == "bullish" and 3 <= separation <= 30 and second_price < first_price and second_rsi > first_rsi and close > open_ and gate["trend4h"] != "bearish"
        bearish = direction == "bearish" and 3 <= separation <= 30 and second_price > first_price and second_rsi < first_rsi and close < open_ and gate["trend4h"] != "bullish"
        score = 50 + (15 if bullish or bearish else 0) + (6 if candle_body_ratio(candle) >= 0.25 else 0)
        if bullish:
            side, setup = "LONG", "BULLISH_RSI_DIVERGENCE_RECLAIM"
        elif bearish:
            side, setup = "SHORT", "BEARISH_RSI_DIVERGENCE_FAILURE"
        else:
            return reject_btc_candidate(self.profile, "Pivot divergence or completed-candle confirmation is invalid.", score, gate, "rsi_pivot_confirmation_failed")
        invalidation = fvalue(candle.get("low")) if side == "LONG" else fvalue(candle.get("high"))
        if not completed_signal_execution_valid(
            side,
            live_price=float(gate["price"]),
            signal_price=close,
            invalidation_level=invalidation,
            atr=float(gate["atr1h"]),
        ):
            return reject_btc_candidate(self.profile, "Completed divergence trigger is stale at the live execution price.", score, gate, "stale_completed_trigger")
        risk_distance = max(float(gate["atr1h"]) * 0.95, float(gate["price"]) * 0.0050)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.55, 2.90),
            leverage=5,
            max_leverage=7,
            entry_style="wide_staged",
            order_execution="CONFIRMED_PIVOT_DIVERGENCE",
            reason_code="confirmed_rsi_pivot_divergence",
            gate_scores={**gate, "pivotSeparation": separation},
            sizing_note="Confirmed divergence: scale only after a completed candle proves momentum has rotated.",
        )


class WyckoffSpring(TraderStrategy):
    profile = WYCKOFF_SPRING_PROFILE

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gate, candle = _completed_gate(snapshot)
        frozen_range = timeframe(snapshot, "1h").get("priorCompletedRange")
        if candle is None or not isinstance(frozen_range, dict):
            return reject_btc_candidate(self.profile, "Completed sweep candle or frozen range is unavailable.", 0, gate, "wyckoff_completed_data_missing")

        upper = fvalue(frozen_range.get("high"))
        lower = fvalue(frozen_range.get("low"))
        candles = int(fvalue(frozen_range.get("candles")))
        atr = max(float(gate["atr1h"]), float(gate["price"]) * 0.003)
        close = fvalue(candle.get("close"))
        low = fvalue(candle.get("low"))
        high = fvalue(candle.get("high"))
        upper_wick, lower_wick = wick_ratios(candle)
        spring_long = candles == 20 and low <= lower - atr * 0.15 and close > lower and lower_wick >= 0.35
        upthrust_short = candles == 20 and high >= upper + atr * 0.15 and close < upper and upper_wick >= 0.35
        score = 50 + (15 if spring_long or upthrust_short else 0) + (6 if gate["regime"] in {"range", "mixed"} else -8)
        if spring_long:
            side, setup = "LONG", "WYCKOFF_SPRING_LONG"
        elif upthrust_short:
            side, setup = "SHORT", "WYCKOFF_UPTHRUST_SHORT"
        else:
            return reject_btc_candidate(self.profile, "The completed candle did not fail a meaningful frozen-range sweep.", score, gate, "wyckoff_failed_sweep_missing")
        invalidation = lower if side == "LONG" else upper
        if not completed_signal_execution_valid(
            side,
            live_price=float(gate["price"]),
            signal_price=close,
            invalidation_level=invalidation,
            atr=atr,
        ):
            return reject_btc_candidate(self.profile, "Completed failed-sweep trigger is stale at the live execution price.", score, gate, "stale_completed_trigger")
        risk_distance = max(atr * 0.82, abs(float(gate["price"]) - (low if side == "LONG" else high)) + atr * 0.12)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.65, 3.05),
            leverage=5,
            max_leverage=7,
            entry_style="confirm_retest",
            order_execution="FAILED_SWEEP_REENTRY",
            reason_code="wyckoff_failed_sweep_reentry",
            gate_scores={**gate, "sweepDepthAtr": max(lower - low, high - upper, 0.0) / atr},
            sizing_note="Failed sweep: invalidate beyond the sweep and protect risk before fading the range edge.",
        )


class BollingerReversion(TraderStrategy):
    profile = BOLLINGER_REVERSION_PROFILE

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gate, candle = _completed_gate(snapshot)
        fifteen = timeframe(snapshot, "15m")
        bands = fifteen.get("bollinger")
        regime_data = snapshot.get("marketRegime", {}) or {}
        adx1h = fvalue(timeframe(snapshot, "1h").get("adx14"), fvalue(regime_data.get("adx1h"), 99.0))
        if candle is None or not isinstance(bands, dict):
            return reject_btc_candidate(self.profile, "Completed candle or Bollinger bands are unavailable.", 0, gate, "bollinger_completed_data_missing")

        lower = fvalue(bands.get("lower"))
        upper = fvalue(bands.get("upper"))
        close = fvalue(candle.get("close"))
        low = fvalue(candle.get("low"))
        high = fvalue(candle.get("high"))
        rsi = fvalue(fifteen.get("rsi14"), 50.0)
        ranging = gate["regime"] in {"range", "mixed"} and adx1h <= 22.0
        lower_reentry = ranging and rsi <= 35.0 and low <= lower < close
        upper_reentry = ranging and rsi >= 65.0 and high >= upper > close
        score = 50 + (15 if lower_reentry or upper_reentry else 0) + (7 if ranging else -10)
        if lower_reentry:
            side, setup = "LONG", "LOW_BAND_MEAN_REVERSION_LONG"
        elif upper_reentry:
            side, setup = "SHORT", "UPPER_BAND_MEAN_REVERSION_SHORT"
        else:
            return reject_btc_candidate(self.profile, "Band reentry, RSI exhaustion, or range-regime confirmation failed.", score, gate, "bollinger_reentry_not_confirmed")
        invalidation = lower if side == "LONG" else upper
        if not completed_signal_execution_valid(
            side,
            live_price=float(gate["price"]),
            signal_price=close,
            invalidation_level=invalidation,
            atr=float(gate["atr1h"]),
        ):
            return reject_btc_candidate(self.profile, "Completed band reentry is stale at the live execution price.", score, gate, "stale_completed_trigger")
        risk_distance = max(float(gate["atr1h"]) * 0.80, float(gate["price"]) * 0.0045)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.35, 2.25),
            leverage=4,
            max_leverage=6,
            entry_style="wide_staged",
            order_execution="COMPLETED_BAND_REENTRY",
            reason_code="bollinger_completed_reentry",
            gate_scores={**gate, "adx1h": adx1h, "rsi15m": rsi},
            sizing_note="Band reentry: keep risk low and trade only when trend strength is contained.",
        )


__all__ = ["BollingerReversion", "RsiDivergenceScout", "VwapReclaimer", "WyckoffSpring"]
