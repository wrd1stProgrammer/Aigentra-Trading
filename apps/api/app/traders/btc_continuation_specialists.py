from typing import Any, Dict

from app.traders.btc_strategy_support import (
    btc_gate_common,
    build_btc_candidate,
    build_btc_profile,
    reject_btc_candidate,
)
from app.traders.models import TradeCandidate
from app.traders.strategy_base import TraderStrategy


class ImbalanceHunter(TraderStrategy):
    profile = build_btc_profile(
        trader_id="imbalance-hunter",
        name="Imbalance Hunter",
        description="Waits for BTC displacement to leave a retestable imbalance zone instead of chasing the full candle.",
        concept="Displacement and midpoint retest: strong body, structure hold, OI/volume support, and clean invalidation at imbalance origin.",
        base_risk=0.57,
        risk_level="MEDIUM_HIGH",
        long_conditions=["15m bullish displacement body is strong", "Price remains above structure", "Midpoint retest is reachable", "OI/volume support continuation"],
        short_conditions=["15m bearish displacement body is strong", "Price remains below structure", "Midpoint retest is reachable", "OI/volume support continuation"],
        entry_rules=["Main order at imbalance midpoint", "Confirmation add only if continuation resumes"],
        take_profit_rules=["First target at displacement extension", "Second target at next liquidity pool"],
        stop_loss_rules=["Stop beyond imbalance origin", "Cancel if midpoint is sliced through"],
        checklist=["Is the candle a real displacement?", "Is retest geometry correct?", "Does continuation room justify holding?", "Should unfilled adds be cancelled?"],
        current_plan="Waiting for a BTC displacement candle to leave a clean retest zone.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gates = btc_gate_common(snapshot)
        bullish = float(gates["candleBody"]) >= 0.50 and float(gates["close15m"]) > float(gates["open15m"]) and float(gates["price"]) >= float(gates["ema20_1h"])
        bearish = float(gates["candleBody"]) >= 0.50 and float(gates["close15m"]) < float(gates["open15m"]) and float(gates["price"]) <= float(gates["ema20_1h"])
        score = 48 + (14 if bullish or bearish else 0) + (7 if float(gates["volumeZ15m"]) >= -0.15 else 0) + (5 if abs(float(gates["oi30m"])) >= 0.15 else 0)
        if bullish and gates["trend4h"] != "bearish":
            side, setup = "LONG", "BULLISH_IMBALANCE_RETEST"
        elif bearish and gates["trend4h"] != "bullish":
            side, setup = "SHORT", "BEARISH_IMBALANCE_RETEST"
        else:
            return reject_btc_candidate(self.profile, "Displacement body or structure alignment is not strong enough.", score, gates, "imbalance_not_clean")
        risk_distance = max(float(gates["atr1h"]) * 1.05, float(gates["price"]) * 0.0058)
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.65, 3.10),
            leverage=5,
            max_leverage=7,
            entry_style="deep_retest",
            order_execution="DISPLACEMENT_MIDPOINT_RETEST",
            reason_code="imbalance_midpoint_retest",
            gate_scores=gates,
            sizing_note="Imbalance retest: tactical sizing can grow only when midpoint remains respected.",
        )


class AtrTrailCommander(TraderStrategy):
    profile = build_btc_profile(
        trader_id="atr-trail-commander",
        name="ATR Trail Boss",
        description="Gives BTC trend trades wider ATR room and tries to hold winners instead of clipping every move.",
        concept="Higher-timeframe ATR continuation system with volatility-adjusted stops and delayed trailing after profit cushion.",
        base_risk=0.55,
        risk_level="MEDIUM",
        long_conditions=["4H trend is bullish", "Price remains above 1H/4H support proxy", "ATR stop sits outside normal noise", "Momentum is not blow-off"],
        short_conditions=["4H trend is bearish", "Price remains below 1H/4H resistance proxy", "ATR stop sits outside normal noise", "Momentum is not capitulation exhaustion"],
        entry_rules=["Enter partial on trend pullback", "Add after continuation resumes, not before"],
        take_profit_rules=["First target only after a wider 2R move", "Remainder trails by ATR and structure"],
        stop_loss_rules=["Stop outside ATR structure", "Trail only after enough profit cushion exists"],
        checklist=["Should this winner be allowed to run?", "Is ATR stop too wide for account risk?", "Is adding justified after cushion?", "Has trend really ended or only pulled back?"],
        current_plan="Waiting for a BTC trend continuation where the ATR stop gives enough room to hold.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        gates = btc_gate_common(snapshot)
        atr_percent = float(gates["atr1h"]) / float(gates["price"]) if float(gates["price"]) > 0 else 0.0
        long_trend = gates["trend4h"] == "bullish" and float(gates["price"]) >= float(gates["ema50_1h"]) and float(gates["ema20_4h"]) >= float(gates["ema50_4h"])
        short_trend = gates["trend4h"] == "bearish" and float(gates["price"]) <= float(gates["ema50_1h"]) and float(gates["ema20_4h"]) <= float(gates["ema50_4h"])
        volatility_ok = 0.004 <= atr_percent <= 0.035
        score = 50 + (14 if long_trend or short_trend else 0) + (7 if volatility_ok else -8)
        score += 5 if float(gates["fundingPercentile"]) < 92 else -5
        extended_move = abs(float(gates["priceChange1h"])) >= 0.006 or float(gates["adx1h"]) >= 28
        if extended_move:
            score -= 5
        if long_trend and volatility_ok:
            side, setup = "LONG", "ATR_TREND_TRAIL_LONG"
        elif short_trend and volatility_ok:
            side, setup = "SHORT", "ATR_TREND_TRAIL_SHORT"
        else:
            return reject_btc_candidate(self.profile, "Trend or ATR condition is not durable enough for a trailing setup.", score, gates, "atr_trend_not_ready")
        risk_distance = max(float(gates["atr1h"]) * 1.80, float(gates["atr4h"]) * 0.45, float(gates["price"]) * 0.009)
        enriched_gates = {**gates, "extendedMove": 1.0 if extended_move else 0.0}
        return build_btc_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(2.25, 4.70),
            leverage=5,
            max_leverage=7,
            entry_style="wide_staged" if extended_move else "deep_retest",
            order_execution="ATR_TREND_PULLBACK",
            reason_code="atr_trend_trail",
            gate_scores=enriched_gates,
            sizing_note="Trend follower: risk can widen only for high-confidence, wider-horizon setups with clean ATR geometry.",
            risk_percent=0.4 if extended_move else self.profile.baseRiskPercent,
        )


__all__ = ["AtrTrailCommander", "ImbalanceHunter"]
