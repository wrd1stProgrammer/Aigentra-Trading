from datetime import datetime, timezone
from typing import Any, Dict

from app.traders.alternative_data_support import (
    alternative_gate_common,
    build_alternative_candidate,
    build_alternative_profile,
    external_context,
    reject_alternative_candidate,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import TraderStrategy, completed_signal_execution_valid, fvalue, timeframe


def _completed_candle(frame: dict[str, Any]) -> dict[str, Any]:
    completed = frame.get("completedCandle") or frame.get("latestCompletedCandle")
    if isinstance(completed, dict):
        return completed
    return {}


def _is_fresh(updated_at: Any, *, maximum_age_seconds: int = 600) -> bool:
    try:
        updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return False
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - updated.astimezone(timezone.utc)).total_seconds()
    return 0 <= age_seconds <= maximum_age_seconds


class VolatilitySkewSentinel(TraderStrategy):
    profile = build_alternative_profile(
        trader_id="volatility-skew-sentinel",
        name="Volatility Skew Sentinel",
        description="Trades persistent same-expiry BTC option skew only after a completed price reversal confirms it.",
        concept="Fresh 7-45 day same-expiry put/call IV skew must persist across observations before completed BTC structure can trigger a trade.",
        base_risk=0.46,
        risk_level="MEDIUM_HIGH",
        long_conditions=["Fresh same-expiry put skew is at least 1.25 z-score", "Skew persists for two observations", "Completed 15m candle reclaims structure", "4H trend is not strongly bearish"],
        short_conditions=["Fresh same-expiry call skew is at least 1.25 z-score", "Skew persists for two observations", "Completed 15m candle rejects structure", "4H trend is not strongly bullish"],
        entry_rules=["55% on completed skew-confirmed trigger", "45% on retest while the same-expiry skew persists"],
        take_profit_rules=["TP1 at 1.35R", "TP2 toward the next options-driven liquidity zone"],
        stop_loss_rules=["Stop beyond the completed trigger candle", "Exit if skew normalizes before price follows through"],
        checklist=["Is the skew source under ten minutes old?", "Are put and call from the same 7-45 day expiry?", "Did skew persist twice?", "Did a completed candle confirm?"],
        current_plan="Waiting for persistent same-expiry BTC option skew and a completed structure trigger.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gates = alternative_gate_common(snapshot)
        deribit = external_context(snapshot, "deribit")
        available = bool(deribit.get("available"))
        fresh = _is_fresh(deribit.get("updatedAt"))
        same_expiry = bool(deribit.get("sameExpiry"))
        expiry_days = int(fvalue(deribit.get("expiryDays")))
        expiry_valid = same_expiry and 7 <= expiry_days <= 45
        skew_samples = int(fvalue(deribit.get("skewSampleCount")))
        persistence = int(fvalue(deribit.get("skewPersistence")))
        skew_zscore = fvalue(deribit.get("putCallIvSpreadZscore"))
        spread = fvalue(deribit.get("putCallIvSpread"))
        call_put_volume_ratio = fvalue(deribit.get("callPutVolumeRatio"), 1.0)
        iv_percentile = fvalue(deribit.get("ivPercentile"), 50.0)
        realized_volatility = fvalue(deribit.get("realizedVolatility30d"))
        gate_scores = {
            **gates,
            "externalAvailable": available,
            "sourceFresh": fresh,
            "sameExpiry": same_expiry,
            "expiryDays": expiry_days,
            "skewSampleCount": skew_samples,
            "skewPersistence": persistence,
            "putCallIvSpread": spread,
            "putCallIvSpreadZscore": skew_zscore,
            "deribitSource": deribit.get("source"),
        }
        score = 38 + (17 if available else 0) + min(16, int(abs(spread) * 2.2))
        if not available:
            return reject_alternative_candidate(self.profile, "Deribit skew source is unavailable.", score, gate_scores, "options_skew_unavailable")
        if not fresh:
            return reject_alternative_candidate(self.profile, "Deribit skew source is stale.", score, gate_scores, "options_skew_stale")
        if not expiry_valid:
            return reject_alternative_candidate(self.profile, "Options skew must use the same 7-45 day expiry.", score, gate_scores, "options_skew_expiry_invalid")
        if skew_samples < 8:
            return reject_alternative_candidate(self.profile, "Options skew history has not completed eight buckets.", score, gate_scores, "options_skew_history_not_ready")
        if persistence < 2:
            return reject_alternative_candidate(self.profile, "Options skew is not persistent across two observations.", score, gate_scores, "options_skew_not_persistent")

        fifteen = timeframe(snapshot, "15m")
        signal = _completed_candle(fifteen)
        if not signal:
            return reject_alternative_candidate(
                self.profile,
                "Completed 15m price confirmation is unavailable.",
                score,
                gate_scores,
                "options_skew_completed_candle_missing",
            )
        signal_open = fvalue(signal.get("open"), float(gates["price"]))
        signal_close = fvalue(signal.get("close"), float(gates["price"]))
        ema20 = float(gates["ema20_1h"])
        reclaim_long = signal_close > signal_open and signal_close >= ema20 and gates["trend4h"] != "bearish"
        reject_short = signal_close < signal_open and signal_close <= ema20 and gates["trend4h"] != "bullish"
        vol_ok = realized_volatility <= 95 or realized_volatility == 0
        fear_reversal = skew_zscore >= 1.25 and reclaim_long and 35 <= float(gates["rsi1h"]) <= 58
        upside_chase_fade = skew_zscore <= -1.25 and call_put_volume_ratio >= 1.15 and reject_short and float(gates["rsi1h"]) >= 48
        score += 7 if 45 <= iv_percentile <= 88 else 0
        score += 7 if vol_ok else -8
        score += 7 if fear_reversal or upside_chase_fade else 0
        gate_scores.update({"completedSignalOpen": signal_open, "completedSignalClose": signal_close})
        if fear_reversal and vol_ok:
            side, setup, reason = "LONG", "OPTIONS_SKEW_FEAR_REVERSAL_LONG", "persistent_put_skew_reclaim"
        elif upside_chase_fade and vol_ok:
            side, setup, reason = "SHORT", "OPTIONS_SKEW_CHASE_FADE_SHORT", "persistent_call_skew_rejection"
        else:
            return reject_alternative_candidate(
                self.profile,
                "Persistent options skew lacks a completed BTC price confirmation.",
                score,
                gate_scores,
                "options_skew_price_not_confirmed",
            )
        if not completed_signal_execution_valid(
            side,
            live_price=float(gates["price"]),
            signal_price=signal_close,
            invalidation_level=ema20,
            atr=float(gates["atr1h"]),
        ):
            return reject_alternative_candidate(self.profile, "Completed options trigger is stale at the live execution price.", score, gate_scores, "stale_completed_trigger")
        risk_distance = max(float(gates["atr1h"]) * 1.05, signal_close * 0.006)
        notes = [
            f"Same-expiry tenor is {expiry_days} days and source age is under ten minutes.",
            f"Skew z-score {skew_zscore:.2f} persisted for {persistence} observations across {skew_samples} buckets.",
            f"Completed 15m close {signal_close:.2f} confirmed the options context.",
        ]
        return build_alternative_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.35, 2.65),
            leverage=6 if score >= 76 else 5,
            max_leverage=7,
            reason_code=reason,
            gate_scores=gate_scores,
            notes=notes,
            min_rr=1.2,
        )
