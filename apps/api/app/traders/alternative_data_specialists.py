from typing import Any, Dict

from app.traders.alternative_data_support import (
    alternative_gate_common as _gate_common,
    build_alternative_candidate as _build_candidate,
    build_alternative_profile as _profile,
    external_context as _external,
    reject_alternative_candidate as _reject,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import TraderStrategy, fvalue


class LiquidationPressureSniper(TraderStrategy):
    profile = _profile(
        trader_id="liquidation-pressure-sniper",
        name="Liquidation Pressure Sniper",
        description="Uses aggregated futures liquidation, open-interest, and crowding pressure to catch forced-position flushes after price confirms.",
        concept="Coinalyze-backed liquidation pressure: avoid guessing tops or bottoms until liquidations, OI change, long/short bias, and 15m structure agree.",
        base_risk=0.54,
        risk_level="HIGH",
        long_conditions=[
            "Long liquidations have already flushed or short liquidations are trapped",
            "Price reclaims 15m structure after the flush",
            "OI pressure stops expanding against the entry",
            "Risk distance still supports at least 1.25R",
        ],
        short_conditions=[
            "Short liquidations have exhausted upside or long crowding is vulnerable",
            "Price rejects 15m structure after the flush",
            "OI/funding no longer validates the crowded side",
            "Risk distance still supports at least 1.25R",
        ],
        entry_rules=["55% on confirmed pressure reversal", "45% on controlled retest of the trigger candle"],
        take_profit_rules=["TP1 when the forced-flow release reaches 1.45R", "TP2 near the next liquidation pocket if pressure persists"],
        stop_loss_rules=["Stop beyond the flush/rejection trigger", "Exit if liquidation imbalance flips against the trade"],
        checklist=[
            "Is this forced flow or normal volatility?",
            "Does the long/short ratio support the direction?",
            "Is OI falling after a flush or expanding into a squeeze?",
            "Is the retest entry still reachable without chasing?",
        ],
        current_plan="Waiting for Coinalyze liquidation pressure to line up with a clean BTC structure trigger.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        aggressive = self.profile.id.startswith("high-voltage-")
        g = _gate_common(snapshot)
        coinalyze = _external(snapshot, "coinalyze")
        available = bool(coinalyze.get("available"))
        long_liq = fvalue(coinalyze.get("longLiquidations6h"))
        short_liq = fvalue(coinalyze.get("shortLiquidations6h"))
        total_liq = long_liq + short_liq
        liquidation_bias = (long_liq - short_liq) / total_liq if total_liq > 0 else 0.0
        long_ratio = fvalue(coinalyze.get("longAccountPercent"), 50.0)
        oi_change = fvalue(coinalyze.get("openInterestChange6hPercent"))
        buy_share = fvalue(coinalyze.get("takerBuyShare"), float(g["takerBuyShare"]))
        volume_z = float(g["volumeZ15m"])
        reclaim_long = (
            float(g["close15m"]) > float(g["open15m"])
            and float(g["lowerWick"]) >= (0.12 if aggressive else 0.18)
            and g["trend4h"] != "bearish"
            and g["trend1h"] != "bearish"
        )
        reject_short = (
            float(g["close15m"]) < float(g["open15m"])
            and float(g["upperWick"]) >= (0.12 if aggressive else 0.18)
            and g["trend4h"] != "bullish"
            and g["trend1h"] != "bullish"
        )
        bias_threshold = 0.15 if aggressive else 0.22
        volume_threshold = 0.05 if aggressive else 0.15
        crowded_volume_threshold = 0.12 if aggressive else 0.25
        long_flush = liquidation_bias >= bias_threshold and reclaim_long and buy_share >= (0.50 if aggressive else 0.52) and volume_z >= volume_threshold
        short_squeeze_exhaustion = liquidation_bias <= -bias_threshold and reject_short and buy_share <= (0.50 if aggressive else 0.48) and volume_z >= volume_threshold
        crowded_long_break = long_ratio >= (62 if aggressive else 66) and reject_short and oi_change <= (0.0 if aggressive else -0.1) and buy_share <= 0.5 and volume_z >= crowded_volume_threshold
        crowded_short_reclaim = long_ratio <= (42 if aggressive else 40) and reclaim_long and oi_change <= (0.0 if aggressive else -0.1) and buy_share >= 0.5 and volume_z >= crowded_volume_threshold
        score = 40 + (16 if available else 0) + min(18, int(abs(liquidation_bias) * 70))
        score += 9 if abs(oi_change) >= 0.35 else 0
        score += 7 if volume_z >= 0.25 else -4
        gate_scores = {
            **g,
            "externalAvailable": available,
            "longLiquidations6h": long_liq,
            "shortLiquidations6h": short_liq,
            "liquidationBias": round(liquidation_bias, 4),
            "longAccountPercent": long_ratio,
            "openInterestChange6hPercent": oi_change,
            "coinalyzeSource": coinalyze.get("source"),
        }
        if long_flush or crowded_short_reclaim:
            side, setup, reason = "LONG", "LIQUIDATION_PRESSURE_REVERSAL_LONG", "liquidation_flush_reclaim"
        elif short_squeeze_exhaustion or crowded_long_break:
            side, setup, reason = "SHORT", "LIQUIDATION_PRESSURE_REVERSAL_SHORT", "liquidation_pressure_rejection"
        else:
            return _reject(
                self.profile,
                "Liquidation pressure has not aligned with a confirmed 15m structure trigger.",
                score,
                gate_scores,
                "liquidation_pressure_not_aligned",
            )
        risk_distance = max(float(g["atr1h"]) * 0.95, float(g["price"]) * 0.0055)
        leverage = (20 if score >= 78 else 18) if aggressive else (8 if score >= 78 else 6)
        notes = [
            f"Coinalyze available: {available}.",
            f"6h long/short liquidations: {long_liq:.0f}/{short_liq:.0f}; bias {liquidation_bias:.2f}.",
            f"Long account percent {long_ratio:.1f}, OI change {oi_change:.2f}%, taker buy share {buy_share:.2f}.",
        ]
        return _build_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.45, 2.95),
            leverage=leverage,
            max_leverage=20 if aggressive else 9,
            reason_code=reason,
            gate_scores=gate_scores,
            notes=notes,
            min_rr=1.15 if aggressive else 1.25,
            entry_weights=(0.60, 0.40) if aggressive else (0.55, 0.45),
            take_profit_weights=(0.50, 0.50) if aggressive else (0.45, 0.55),
        )


from app.traders.volatility_skew_sentinel import VolatilitySkewSentinel


__all__ = ["LiquidationPressureSniper", "VolatilitySkewSentinel"]
