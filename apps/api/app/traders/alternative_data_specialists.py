from datetime import datetime, timezone
from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    candidate_with_audit,
    candle_body_ratio,
    default_leverage_plan,
    default_order_intent,
    default_risk_plan,
    estimate_risk_reward,
    fvalue,
    latest_candle,
    market_regime,
    normalize_entries_for_side,
    round_price,
    taker_buy_share,
    timeframe,
    trend_for,
    wick_ratios,
)


def _mock_performance() -> Dict[str, Any]:
    return {"return7d": 0.0, "return30d": 0.0, "winRate": 0.0, "maxDrawdown": 0.0, "currentEquity": 10000.0}


def _profile(
    *,
    trader_id: str,
    name: str,
    description: str,
    concept: str,
    base_risk: float,
    risk_level: str,
    long_conditions: list[str],
    short_conditions: list[str],
    entry_rules: list[str],
    take_profit_rules: list[str],
    stop_loss_rules: list[str],
    checklist: list[str],
    current_plan: str,
) -> TraderProfile:
    return TraderProfile(
        id=trader_id,
        name=name,
        description=description,
        concept=concept,
        baseRiskPercent=base_risk,
        riskLevel=risk_level,
        longConditions=long_conditions,
        shortConditions=short_conditions,
        entryRules=entry_rules,
        takeProfitRules=take_profit_rules,
        stopLossRules=stop_loss_rules,
        aiReviewChecklist=checklist,
        mockPerformance=_mock_performance(),
        currentPlan=current_plan,
        launchMonth="2026-07",
        lifecycleStatus="new",
        lifecycleLabel="NEW",
    )


def _external(snapshot: Dict[str, Any], key: str) -> Dict[str, Any]:
    value = snapshot.get("externalDerivatives", {}).get(key)
    return value if isinstance(value, dict) else {}


def _gate_common(snapshot: Dict[str, Any]) -> dict[str, float | str | bool]:
    price = fvalue(snapshot.get("price"))
    fifteen = timeframe(snapshot, "15m")
    one_hour = timeframe(snapshot, "1h")
    four_hour = timeframe(snapshot, "4h")
    candle = latest_candle(fifteen)
    upper_wick, lower_wick = wick_ratios(candle)
    return {
        "price": price,
        "trend1h": trend_for(snapshot, "1h"),
        "trend4h": trend_for(snapshot, "4h"),
        "atr1h": max(fvalue(one_hour.get("atr14"), price * 0.008), price * 0.003),
        "atr4h": max(fvalue(four_hour.get("atr14"), price * 0.014), price * 0.006),
        "ema20_1h": fvalue(one_hour.get("ema20"), price),
        "ema50_1h": fvalue(one_hour.get("ema50"), price),
        "rsi1h": fvalue(one_hour.get("rsi14"), 50.0),
        "volumeZ15m": fvalue(fifteen.get("volumeZscore"), 0.0),
        "takerBuyShare": taker_buy_share(snapshot),
        "candleBody": candle_body_ratio(candle),
        "upperWick": upper_wick,
        "lowerWick": lower_wick,
        "close15m": fvalue(candle.get("close"), price),
        "open15m": fvalue(candle.get("open"), price),
        "regime": market_regime(snapshot),
    }


def _build_candidate(
    *,
    profile: TraderProfile,
    snapshot: Dict[str, Any],
    side: str,
    setup_type: str,
    score: int,
    risk_distance: float,
    target_rs: tuple[float, float],
    leverage: int,
    max_leverage: int,
    reason_code: str,
    gate_scores: dict[str, Any],
    notes: list[str],
    min_rr: float = 1.25,
) -> TradeCandidate:
    price = fvalue(snapshot.get("price"))
    if side == "LONG":
        entries = normalize_entries_for_side(
            side,
            price,
            [
                EntryPlan(price=round_price(price), weight=0.55, reason="Data-trigger confirmation entry"),
                EntryPlan(price=round_price(price - risk_distance * 0.42), weight=0.45, reason="Controlled retest entry"),
            ],
        )
        stop = round_price(price - risk_distance)
        take_profits = [
            TakeProfitPlan(price=round_price(price + risk_distance * target_rs[0]), weight=0.45, reason="First pressure-release target"),
            TakeProfitPlan(price=round_price(price + risk_distance * target_rs[1]), weight=0.55, reason="Extended data-thesis target"),
        ]
    else:
        entries = normalize_entries_for_side(
            side,
            price,
            [
                EntryPlan(price=round_price(price), weight=0.55, reason="Data-trigger confirmation entry"),
                EntryPlan(price=round_price(price + risk_distance * 0.42), weight=0.45, reason="Controlled retest entry"),
            ],
        )
        stop = round_price(price + risk_distance)
        take_profits = [
            TakeProfitPlan(price=round_price(price - risk_distance * target_rs[0]), weight=0.45, reason="First pressure-release target"),
            TakeProfitPlan(price=round_price(price - risk_distance * target_rs[1]), weight=0.55, reason="Extended data-thesis target"),
        ]
    risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.1)
    errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=min_rr, fee_buffer_percent=0.1)
    if errors:
        return candidate_with_audit(
            TradeCandidate(created=False, reason=f"{profile.name} geometry gate failed: " + "; ".join(errors), setupScore=score),
            trader_id=profile.id,
            gate_scores=gate_scores,
            reason_code="geometry_gate_failed",
            observation_type="OBSERVE_ONLY" if score >= 50 else "NO_TRADE",
        )
    return candidate_with_audit(
        TradeCandidate(
            created=True,
            side=side,
            setupType=setup_type,
            setupScore=min(score, 94),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=profile.baseRiskPercent,
            orderIntent=default_order_intent("DATA_CONFIRMED_RETEST", post_only=False),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=max_leverage,
                reason=f"{profile.name} uses external derivatives data as a hard gate before applying {leverage}x paper leverage.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note="External-data strategy: reduce or cancel quickly if the source signal normalizes before TP1.",
                min_risk_reward=min_rr,
                fee_buffer_percent=0.1,
            ),
            earlyExitRules=[
                "Exit early if the external pressure signal flips before TP1.",
                "Cancel the retest entry if price reaches TP1 before the second slice fills.",
            ],
            managementNotes=[
                f"First-stage reason code: {reason_code}.",
                "Position manager should keep checking live exposure separately from monthly league membership.",
            ],
            invalidation="Invalidate on a 15m close through the data-trigger level or if the external signal normalizes.",
            notes=notes,
        ),
        trader_id=profile.id,
        gate_scores=gate_scores,
        reason_code=reason_code,
    )


def _reject(profile: TraderProfile, reason: str, score: int, gate_scores: dict[str, Any], reason_code: str) -> TradeCandidate:
    return candidate_with_audit(
        TradeCandidate(created=False, reason=reason, setupScore=score),
        trader_id=profile.id,
        gate_scores=gate_scores,
        reason_code=reason_code,
        observation_type="OBSERVE_ONLY" if score >= 50 else "NO_TRADE",
    )


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
            and float(g["lowerWick"]) >= 0.18
            and g["trend4h"] != "bearish"
            and g["trend1h"] != "bearish"
        )
        reject_short = (
            float(g["close15m"]) < float(g["open15m"])
            and float(g["upperWick"]) >= 0.18
            and g["trend4h"] != "bullish"
            and g["trend1h"] != "bullish"
        )
        long_flush = liquidation_bias >= 0.22 and reclaim_long and buy_share >= 0.52 and volume_z >= 0.15
        short_squeeze_exhaustion = liquidation_bias <= -0.22 and reject_short and buy_share <= 0.48 and volume_z >= 0.15
        crowded_long_break = long_ratio >= 66 and reject_short and oi_change <= -0.1 and buy_share <= 0.5 and volume_z >= 0.25
        crowded_short_reclaim = long_ratio <= 40 and reclaim_long and oi_change <= -0.1 and buy_share >= 0.5 and volume_z >= 0.25
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
        leverage = 8 if score >= 78 else 6
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
            max_leverage=9,
            reason_code=reason,
            gate_scores=gate_scores,
            notes=notes,
        )


class VolatilitySkewSentinel(TraderStrategy):
    profile = _profile(
        trader_id="volatility-skew-sentinel",
        name="Volatility Skew Sentinel",
        description="Reads Deribit BTC option skew and realized-volatility pressure, then trades spot/futures direction only after price confirms the options signal.",
        concept="Options-volatility sentinel: put/call IV skew, option volume/OI, realized volatility, and BTC structure decide whether fear or upside chase is mispriced.",
        base_risk=0.46,
        risk_level="MEDIUM_HIGH",
        long_conditions=[
            "Put skew is elevated but BTC stops making lower closes",
            "15m reclaim confirms fear is not accelerating",
            "Realized volatility is contained enough for defined invalidation",
            "4H trend is not strongly bearish",
        ],
        short_conditions=[
            "Call skew or upside chase is elevated",
            "15m rejection confirms the upside premium is fading",
            "Realized volatility is contained enough for defined invalidation",
            "4H trend is not strongly bullish",
        ],
        entry_rules=["55% on skew-confirmed structure trigger", "45% on retest if skew remains elevated"],
        take_profit_rules=["TP1 when skew trade reaches 1.35R", "TP2 toward the next options-driven liquidity zone"],
        stop_loss_rules=["Stop beyond trigger candle", "Exit if skew normalizes before price follows through"],
        checklist=[
            "Is the skew signal fresh or stale?",
            "Does price confirm instead of fighting the options market?",
            "Is realized volatility too high for a tight invalidation?",
            "Should the second slice be cancelled after fast follow-through?",
        ],
        current_plan="Waiting for Deribit BTC option skew to diverge from confirmed price structure.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        deribit = _external(snapshot, "deribit")
        available = bool(deribit.get("available"))
        put_call_iv_spread = fvalue(deribit.get("putCallIvSpread"))
        skew_zscore = fvalue(deribit.get("putCallIvSpreadZscore"))
        skew_samples = int(fvalue(deribit.get("skewSampleCount")))
        call_put_volume_ratio = fvalue(deribit.get("callPutVolumeRatio"), 1.0)
        iv_percentile = fvalue(deribit.get("ivPercentile"), 50.0)
        realized_volatility = fvalue(deribit.get("realizedVolatility30d"), 0.0)
        reclaim_long = float(g["close15m"]) > float(g["open15m"]) and float(g["close15m"]) >= float(g["ema20_1h"]) and g["trend4h"] != "bearish"
        reject_short = float(g["close15m"]) < float(g["open15m"]) and float(g["close15m"]) <= float(g["ema20_1h"]) and g["trend4h"] != "bullish"
        updated_at = deribit.get("updatedAt")
        try:
            updated = datetime.fromisoformat(str(updated_at).replace("Z", "+00:00"))
            fresh = (datetime.now(timezone.utc) - updated.astimezone(timezone.utc)).total_seconds() <= 600
        except (TypeError, ValueError):
            fresh = False
        history_ready = skew_samples >= 8
        fear_reversal = skew_zscore >= 1.25 and reclaim_long and 35 <= float(g["rsi1h"]) <= 58
        upside_chase_fade = skew_zscore <= -1.25 and call_put_volume_ratio >= 1.15 and reject_short and float(g["rsi1h"]) >= 48
        vol_ok = realized_volatility <= 95 or realized_volatility == 0
        score = 38 + (17 if available else 0) + min(16, int(abs(put_call_iv_spread) * 2.2))
        score += 7 if 45 <= iv_percentile <= 88 else 0
        score += 7 if vol_ok else -8
        score += 5 if float(g["candleBody"]) >= 0.32 else 0
        gate_scores = {
            **g,
            "externalAvailable": available,
            "putCallIvSpread": put_call_iv_spread,
            "putCallIvSpreadZscore": skew_zscore,
            "skewSampleCount": skew_samples,
            "sourceFresh": fresh,
            "callPutVolumeRatio": call_put_volume_ratio,
            "ivPercentile": iv_percentile,
            "realizedVolatility30d": realized_volatility,
            "deribitSource": deribit.get("source"),
        }
        if not available or not fresh or not history_ready:
            return _reject(
                self.profile,
                "Deribit skew history is stale or has not completed its minimum warm-up sample.",
                score,
                gate_scores,
                "options_skew_history_not_ready",
            )
        if fear_reversal and vol_ok:
            side, setup, reason = "LONG", "OPTIONS_SKEW_FEAR_REVERSAL_LONG", "put_skew_reclaim"
        elif upside_chase_fade and vol_ok:
            side, setup, reason = "SHORT", "OPTIONS_SKEW_CHASE_FADE_SHORT", "call_skew_rejection"
        else:
            return _reject(
                self.profile,
                "Options skew has not confirmed a clean BTC structure trigger.",
                score,
                gate_scores,
                "options_skew_not_confirmed",
            )
        risk_distance = max(float(g["atr1h"]) * 1.05, float(g["price"]) * 0.006)
        leverage = 6 if score >= 76 else 5
        notes = [
            f"Deribit available: {available}.",
            f"Put-call IV spread {put_call_iv_spread:.2f}, IV percentile {iv_percentile:.1f}.",
            f"Historical skew z-score {skew_zscore:.2f} across {skew_samples} 15m samples.",
            f"Call/put option volume ratio {call_put_volume_ratio:.2f}, realized volatility {realized_volatility:.1f}.",
        ]
        return _build_candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.35, 2.65),
            leverage=leverage,
            max_leverage=7,
            reason_code=reason,
            gate_scores=gate_scores,
            notes=notes,
            min_rr=1.2,
        )
