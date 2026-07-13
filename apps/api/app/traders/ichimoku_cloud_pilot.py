from typing import Any, Dict

from app.traders.btc_strategy_support import (
    btc_gate_common,
    build_btc_candidate,
    build_btc_profile,
    reject_btc_candidate,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import TraderStrategy, completed_signal_execution_valid, fvalue, timeframe


def _cloud_value(cloud: dict[str, Any], snake_name: str, camel_name: str) -> float:
    return fvalue(cloud.get(snake_name, cloud.get(camel_name)))


def _completed_candle(frame: dict[str, Any]) -> dict[str, Any]:
    completed = frame.get("completedCandle") or frame.get("latestCompletedCandle")
    if isinstance(completed, dict):
        return completed
    return {}


class IchimokuCloudPilot(TraderStrategy):
    profile = build_btc_profile(
        trader_id="ichimoku-cloud-pilot",
        name="Cloud Pilot",
        description="Rides BTC continuation only after real Ichimoku cloud alignment and a completed pullback recovery.",
        concept="Real Tenkan, Kijun, and displaced Senkou spans define the trend zone; completed candles, not a live EMA proxy, confirm continuation.",
        base_risk=0.58,
        risk_level="MEDIUM",
        long_conditions=["Completed 4H close is above a bullish cloud", "Completed 1H candle tests and recovers the cloud edge", "Tenkan remains above Kijun", "Funding is not one-sided"],
        short_conditions=["Completed 4H close is below a bearish cloud", "Completed 1H candle tests and rejects the cloud edge", "Tenkan remains below Kijun", "Funding is not one-sided"],
        entry_rules=["40% after completed cloud recovery", "60% on controlled cloud-edge retest"],
        take_profit_rules=["Partial near the prior swing", "Hold remainder while 1H cloud structure remains valid"],
        stop_loss_rules=["Stop outside the 1H cloud and ATR noise", "Exit on a completed 1H close through the opposite cloud edge"],
        checklist=["Are real displaced spans available?", "Did a completed candle recover the cloud?", "Is Tenkan/Kijun alignment healthy?", "Is funding too crowded?"],
        current_plan="Waiting for a completed BTC pullback recovery against a real Ichimoku cloud.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gates = btc_gate_common(snapshot)
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        cloud_1h = one_hour.get("ichimoku") or {}
        cloud_4h = four_hour.get("ichimoku") or {}
        cloud_available = bool(cloud_1h.get("available")) and bool(cloud_4h.get("available"))
        enriched_gates = {**gates, "realIchimokuAvailable": cloud_available}
        if not cloud_available:
            return reject_btc_candidate(
                self.profile,
                "Real Ichimoku spans are unavailable; the EMA cloud proxy is not tradable.",
                42,
                enriched_gates,
                "ichimoku_unavailable",
            )

        signal_1h = _completed_candle(one_hour)
        signal_4h = _completed_candle(four_hour)
        if not signal_1h or not signal_4h:
            return reject_btc_candidate(
                self.profile,
                "Completed 1H/4H candles are unavailable.",
                0,
                enriched_gates,
                "ichimoku_completed_candle_missing",
            )
        close_1h = fvalue(signal_1h.get("close"), float(gates["price"]))
        high_1h = fvalue(signal_1h.get("high"), close_1h)
        low_1h = fvalue(signal_1h.get("low"), close_1h)
        close_4h = fvalue(signal_4h.get("close"), float(gates["price"]))
        tenkan_1h = _cloud_value(cloud_1h, "tenkan", "tenkan")
        kijun_1h = _cloud_value(cloud_1h, "kijun", "kijun")
        top_1h = _cloud_value(cloud_1h, "cloud_top", "cloudTop")
        bottom_1h = _cloud_value(cloud_1h, "cloud_bottom", "cloudBottom")
        tenkan_4h = _cloud_value(cloud_4h, "tenkan", "tenkan")
        kijun_4h = _cloud_value(cloud_4h, "kijun", "kijun")
        top_4h = _cloud_value(cloud_4h, "cloud_top", "cloudTop")
        bottom_4h = _cloud_value(cloud_4h, "cloud_bottom", "cloudBottom")
        atr_1h = float(gates["atr1h"])
        touch_buffer = atr_1h * 0.18

        long_alignment = close_4h > top_4h and tenkan_4h >= kijun_4h
        short_alignment = close_4h < bottom_4h and tenkan_4h <= kijun_4h
        long_recovery = (
            low_1h <= max(top_1h, tenkan_1h) + touch_buffer
            and close_1h > top_1h
            and close_1h >= tenkan_1h >= kijun_1h
        )
        short_recovery = (
            high_1h >= min(bottom_1h, tenkan_1h) - touch_buffer
            and close_1h < bottom_1h
            and close_1h <= tenkan_1h <= kijun_1h
        )
        enriched_gates.update(
            {
                "cloudTop1h": top_1h,
                "cloudBottom1h": bottom_1h,
                "cloudTop4h": top_4h,
                "cloudBottom4h": bottom_4h,
                "completedClose1h": close_1h,
                "completedClose4h": close_4h,
            }
        )
        score = 48
        score += 14 if long_alignment or short_alignment else -8
        score += 14 if long_recovery or short_recovery else -8
        score += 6 if float(gates["fundingPercentile"]) < 90 else -8
        if long_alignment and long_recovery:
            side, setup = "LONG", "ICHIMOKU_CLOUD_RECOVERY_LONG"
        elif short_alignment and short_recovery:
            side, setup = "SHORT", "ICHIMOKU_CLOUD_REJECTION_SHORT"
        else:
            return reject_btc_candidate(
                self.profile,
                "Completed 1H/4H candles have not confirmed Ichimoku cloud continuation.",
                score,
                enriched_gates,
                "ichimoku_recovery_not_confirmed",
            )
        invalidation = top_1h if side == "LONG" else bottom_1h
        if not completed_signal_execution_valid(
            side,
            live_price=float(gates["price"]),
            signal_price=close_1h,
            invalidation_level=invalidation,
            atr=atr_1h,
        ):
            return reject_btc_candidate(self.profile, "Completed Ichimoku recovery is stale at the live execution price.", score, enriched_gates, "stale_completed_trigger")
        risk_distance = max(atr_1h * 1.35, float(gates["atr4h"]) * 0.38, close_1h * 0.007)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.9, 4.0),
            leverage=5,
            max_leverage=7,
            entry_style="deep_retest",
            order_execution="ICHIMOKU_CLOUD_RECOVERY",
            reason_code="real_ichimoku_continuation",
            gate_scores=enriched_gates,
            sizing_note="Real-cloud continuation: add only after the completed recovery remains above the cloud edge.",
        )
