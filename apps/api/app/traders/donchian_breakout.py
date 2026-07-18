from typing import Any, Dict

from app.traders.btc_strategy_support import (
    btc_gate_common,
    build_btc_candidate,
    build_btc_profile,
    reject_btc_candidate,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import TraderStrategy, candle_body_ratio, fvalue, timeframe


class DonchianBreakout(TraderStrategy):
    profile = build_btc_profile(
        trader_id="donchian-breakout",
        name="Donchian Breakout Boss",
        description="Breaks BTC out of recent 1H/4H ranges only when participation expands enough to make a false break less likely.",
        concept="Range expansion system using Donchian-style boundaries, volume/OI confirmation, wider ATR stop, and slower profit protection than a scalp.",
        base_risk=0.62,
        risk_level="MEDIUM_HIGH",
        long_conditions=["1H/4H structure is not bearish", "Price closes through the upper range boundary", "At least two of volume, OI, and directional taker flow confirm", "ATR stop still leaves at least 1.15R"],
        short_conditions=["1H/4H structure is not bullish", "Price closes through the lower range boundary", "At least two of volume, OI, and directional taker flow confirm", "ATR stop still leaves at least 1.15R"],
        entry_rules=["Enter a confirmation slice on the break", "Hold a second slice for the first controlled retest outside the old range"],
        take_profit_rules=["Take partial near the first expansion leg", "Let the rest work toward wider swing liquidity if structure holds"],
        stop_loss_rules=["Stop outside the broken range plus ATR buffer", "Cancel retest if price accepts back inside the old range"],
        checklist=["Is this a clean expansion or a stop-run fakeout?", "Is participation expanding rather than drying up?", "Does the wider stop still fit account risk?", "Should the retest slice be cancelled if price runs?"],
        current_plan="Waiting for BTC to leave a recent range with real participation, not just a thin wick.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        aggressive = self.profile.id.startswith("high-voltage-")
        gates = btc_gate_common(snapshot)
        fifteen = timeframe(snapshot, "15m")
        one_hour = timeframe(snapshot, "1h")
        completed_signal = fifteen.get("completedCandle")
        frozen_range = one_hour.get("priorCompletedRange")
        if not isinstance(completed_signal, dict) or not isinstance(frozen_range, dict):
            return reject_btc_candidate(
                self.profile,
                "Donchian requires a completed 15m signal candle and 20 completed 1H boundary candles.",
                0,
                gates,
                "donchian_completed_data_missing",
            )

        upper = fvalue(frozen_range.get("high"))
        lower = fvalue(frozen_range.get("low"))
        boundary_candles = int(fvalue(frozen_range.get("candles")))
        signal_close = fvalue(completed_signal.get("close"))
        if upper <= lower or boundary_candles != 20 or signal_close <= 0:
            return reject_btc_candidate(
                self.profile,
                "Donchian completed-candle boundary data is invalid.",
                0,
                gates,
                "donchian_boundary_invalid",
            )

        completed_volume_z = fvalue(fifteen.get("completedVolumeZscore"), -99.0)
        signal_body = candle_body_ratio(completed_signal)
        gates["volumeZ15m"] = completed_volume_z
        gates["candleBody"] = signal_body
        volume_confirmed = completed_volume_z >= (0.15 if aggressive else 0.35)
        oi_confirmed = float(gates["oi30m"]) >= (0.05 if aggressive else 0.12)
        taker_share = float(gates["takerBuyShare"])
        high_break = signal_close > upper and gates["trend4h"] != "bearish"
        low_break = signal_close < lower and gates["trend4h"] != "bullish"
        if high_break:
            side, setup = "LONG", "DONCHIAN_RANGE_EXPANSION_LONG"
            taker_confirmed = taker_share >= (0.52 if aggressive else 0.55)
            broken_boundary = upper
        elif low_break:
            side, setup = "SHORT", "DONCHIAN_RANGE_EXPANSION_SHORT"
            taker_confirmed = taker_share <= (0.48 if aggressive else 0.45)
            broken_boundary = lower
        else:
            gates["donchianParticipationCount"] = 0
            return reject_btc_candidate(self.profile, "A completed 15m candle has not closed through the frozen Donchian boundary.", 0, gates, "donchian_no_breakout")

        participation_flags = {
            "volume": volume_confirmed,
            "openInterest": oi_confirmed,
            "directionalTakerFlow": taker_confirmed,
        }
        participation_count = sum(participation_flags.values())
        gates["donchianParticipationCount"] = participation_count
        score = (52 if aggressive else 48) + participation_count * (8 if aggressive else 6)
        score += 9 if gates["regime"] in {"trend", "squeeze"} else 0
        score += 7 if signal_body >= (0.36 if aggressive else 0.45) else 0
        minimum_participation = 1 if aggressive else 2
        if participation_count < minimum_participation:
            return reject_btc_candidate(
                self.profile,
                f"Donchian breakout needs at least {minimum_participation} directional participation confirmation{'s' if minimum_participation > 1 else ''}.",
                score,
                gates,
                "donchian_participation_weak",
            )

        price = signal_close
        atr_buffer = float(gates["atr1h"]) * 0.20
        boundary_stop_distance = price - (broken_boundary - atr_buffer) if side == "LONG" else (broken_boundary + atr_buffer) - price
        risk_distance = max(float(gates["atr1h"]) * 1.20, float(gates["atr4h"]) * 0.34, price * 0.006, boundary_stop_distance)
        boundary_fingerprint = (
            f"1h:20:{upper:.8f}:{lower:.8f}:"
            f"{int(fvalue(frozen_range.get('firstOpenTime')))}:{int(fvalue(frozen_range.get('lastCloseTime')))}"
        )
        donchian_context = {
            "lookback": 20,
            "boundaryTimeframe": "1h",
            "triggerTimeframe": "15m",
            "upperBoundary": upper,
            "lowerBoundary": lower,
            "brokenBoundary": broken_boundary,
            "boundaryFirstOpenTime": frozen_range.get("firstOpenTime"),
            "boundaryLastCloseTime": frozen_range.get("lastCloseTime"),
            "signalCandleOpenTime": completed_signal.get("openTime"),
            "signalCandleCloseTime": completed_signal.get("closeTime"),
            "signalCandleClose": signal_close,
            "participation": participation_flags,
            "participationCount": participation_count,
            "boundaryFingerprint": boundary_fingerprint,
        }
        candidate_snapshot = {**snapshot, "price": price}
        return build_btc_candidate(
            profile=self.profile,
            snapshot=candidate_snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.75, 4.00) if aggressive else (1.75, 3.60),
            leverage=14 if aggressive and score < 78 else 16 if aggressive else 6,
            max_leverage=16 if aggressive else 8,
            entry_style="high_voltage_staged" if aggressive else "wide_staged",
            order_execution="BREAKOUT_CLOSE_OR_RETEST",
            reason_code="donchian_expansion",
            gate_scores=gates,
            sizing_note="Wider swing breakout: risk can expand only when AI confirms participation and fakeout risk is acceptable.",
            candidate_audit={"donchianContext": donchian_context},
            risk_percent=self.profile.baseRiskPercent,
            take_profit_weights=(0.25, 0.75) if aggressive else (0.40, 0.60),
        )


__all__ = ["DonchianBreakout"]
