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
    funding_abs_percentile,
    latest_candle,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
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
    )


def _gate_common(snapshot: Dict[str, Any]) -> dict[str, float | str]:
    price = fvalue(snapshot.get("price"))
    regime_data = snapshot.get("marketRegime", {}) or {}
    one_hour = timeframe(snapshot, "1h")
    four_hour = timeframe(snapshot, "4h")
    fifteen = timeframe(snapshot, "15m")
    candle = latest_candle(fifteen)
    channel = four_hour.get("channel") or one_hour.get("channel") or {}
    body = candle_body_ratio(candle)
    upper_wick, lower_wick = wick_ratios(candle)
    return {
        "price": price,
        "trend1h": trend_for(snapshot, "1h"),
        "trend4h": trend_for(snapshot, "4h"),
        "rsi1h": fvalue(one_hour.get("rsi14"), 50.0),
        "rsi15m": fvalue(fifteen.get("rsi14"), 50.0),
        "ema20_1h": fvalue(one_hour.get("ema20"), price),
        "ema50_1h": fvalue(one_hour.get("ema50"), price),
        "ema20_4h": fvalue(four_hour.get("ema20"), price),
        "ema50_4h": fvalue(four_hour.get("ema50"), price),
        "atr1h": max(fvalue(one_hour.get("atr14"), price * 0.008), price * 0.003),
        "atr4h": max(fvalue(four_hour.get("atr14"), price * 0.012), price * 0.006),
        "volumeZ15m": fvalue(fifteen.get("volumeZscore"), 0.0),
        "oi30m": open_interest_change(snapshot),
        "fundingPercentile": funding_abs_percentile(snapshot),
        "takerBuyShare": taker_buy_share(snapshot),
        "channelPosition": fvalue(channel.get("position"), 0.5),
        "candleBody": body,
        "upperWick": upper_wick,
        "lowerWick": lower_wick,
        "regime": market_regime(snapshot),
        "adx1h": fvalue(regime_data.get("adx1h"), 0.0),
        "priceChange1h": fvalue(regime_data.get("priceChange1h"), 0.0),
        "bollingerWidth1h": fvalue(regime_data.get("bollingerWidth1h"), 0.0),
        "keltnerWidth1h": fvalue(regime_data.get("keltnerWidth1h"), 0.0),
        "close15m": fvalue(candle.get("close"), price),
        "open15m": fvalue(candle.get("open"), price),
        "high15m": fvalue(candle.get("high"), price),
        "low15m": fvalue(candle.get("low"), price),
        "openTime15m": fvalue(candle.get("openTime"), 0),
    }


def _entries(side: str, price: float, risk_distance: float, style: str) -> List[EntryPlan]:
    if style == "single":
        return [EntryPlan(price=round_price(price), weight=1.0, reason="Confirmed BTC setup participation")]
    if style == "wide_staged":
        first_weight, pullback = 0.35, 0.50
    elif style == "deep_retest":
        first_weight, pullback = 0.40, 0.62
    else:
        first_weight, pullback = 0.55, 0.30
    second_weight = round(1.0 - first_weight, 2)
    if side == "LONG":
        planned = [
            EntryPlan(price=round_price(price), weight=first_weight, reason="Confirmation entry"),
            EntryPlan(price=round_price(price - risk_distance * pullback), weight=second_weight, reason="Planned retest entry"),
        ]
    else:
        planned = [
            EntryPlan(price=round_price(price), weight=first_weight, reason="Confirmation entry"),
            EntryPlan(price=round_price(price + risk_distance * pullback), weight=second_weight, reason="Planned retest entry"),
        ]
    return normalize_entries_for_side(side, price, planned)


def _take_profits(side: str, price: float, risk_distance: float, target_rs: tuple[float, float]) -> List[TakeProfitPlan]:
    first_r, second_r = target_rs
    if side == "LONG":
        return [
            TakeProfitPlan(price=round_price(price + risk_distance * first_r), weight=0.40, reason="First BTC liquidity target"),
            TakeProfitPlan(price=round_price(price + risk_distance * second_r), weight=0.60, reason="Extended thesis target"),
        ]
    return [
        TakeProfitPlan(price=round_price(price - risk_distance * first_r), weight=0.40, reason="First BTC liquidity target"),
        TakeProfitPlan(price=round_price(price - risk_distance * second_r), weight=0.60, reason="Extended thesis target"),
    ]


def _candidate(
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
    entry_style: str,
    order_execution: str,
    reason_code: str,
    gate_scores: dict[str, Any],
    sizing_note: str,
    min_rr: float = 1.15,
) -> TradeCandidate:
    regime = str(gate_scores.get("regime") or "").lower()
    minimum_score = 60 if regime in {"range", "squeeze"} else 58
    observe_floor = max(50, minimum_score - 8)
    if score < minimum_score:
        return candidate_with_audit(
            TradeCandidate(
                created=False,
                reason=f"{profile.name} score {score} is below the first-stage entry threshold for the current {regime or 'mixed'} regime.",
                setupScore=score,
            ),
            trader_id=profile.id,
            gate_scores=gate_scores,
            reason_code="score_below_entry_threshold",
            observation_type="OBSERVE_ONLY" if score >= observe_floor else "NO_TRADE",
        )
    price = fvalue(snapshot.get("price"))
    entries = _entries(side, price, risk_distance, entry_style)
    stop = round_price(price - risk_distance if side == "LONG" else price + risk_distance)
    take_profits = _take_profits(side, price, risk_distance, target_rs)
    risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.09)
    errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=min_rr, fee_buffer_percent=0.09)
    if errors:
        return candidate_with_audit(
            TradeCandidate(
                created=False,
                reason=f"{profile.name} geometry gate failed: " + "; ".join(errors),
                setupScore=score,
            ),
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
            orderIntent=default_order_intent(order_execution, post_only=entry_style != "single"),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=max_leverage,
                reason=f"{profile.name} uses {leverage}x only after its BTC-specific first-stage filters and second-stage AI review agree.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note=sizing_note,
                min_risk_reward=min_rr,
                fee_buffer_percent=0.09,
            ),
            earlyExitRules=[
                "Exit or reduce if a 15m close invalidates the trigger level.",
                "Cancel unfilled scale entries when price reaches TP1 before the scale fills.",
            ],
            managementNotes=[
                "Position manager may reduce, trail, or let the trade run according to this trader's holding profile.",
                f"First-stage reason code: {reason_code}.",
            ],
            invalidation="Invalidate on a 15m close through the trigger level or if fee-adjusted RR drops below the minimum.",
            notes=_notes(snapshot, reason_code),
        ),
        trader_id=profile.id,
        gate_scores=gate_scores,
        reason_code=reason_code,
    )


def _rejection(profile: TraderProfile, reason: str, score: int, gate_scores: dict[str, Any], reason_code: str) -> TradeCandidate:
    return candidate_with_audit(
        TradeCandidate(created=False, reason=reason, setupScore=score),
        trader_id=profile.id,
        gate_scores=gate_scores,
        reason_code=reason_code,
        observation_type="OBSERVE_ONLY" if score >= 50 else "NO_TRADE",
    )


def _notes(snapshot: Dict[str, Any], reason_code: str) -> list[str]:
    gates = _gate_common(snapshot)
    return [
        f"Reason code: {reason_code}.",
        f"1H RSI {float(gates['rsi1h']):.1f}, 15m volume z-score {float(gates['volumeZ15m']):.2f}.",
        f"Regime {gates['regime']}, OI 30m change {float(gates['oi30m']):.2f}%, funding percentile {float(gates['fundingPercentile']):.0f}.",
    ]


class DonchianBreakout(TraderStrategy):
    profile = _profile(
        trader_id="donchian-breakout",
        name="Donchian Breakout Boss",
        description="Breaks BTC out of recent 1H/4H ranges only when participation expands enough to make a false break less likely.",
        concept="Range expansion system using Donchian-style boundaries, volume/OI confirmation, wider ATR stop, and slower profit protection than a scalp.",
        base_risk=0.62,
        risk_level="MEDIUM_HIGH",
        long_conditions=["1H/4H structure is not bearish", "Price closes through the upper range boundary", "Volume or OI confirms fresh participation", "ATR stop still leaves at least 1.15R"],
        short_conditions=["1H/4H structure is not bullish", "Price closes through the lower range boundary", "Volume or OI confirms fresh participation", "ATR stop still leaves at least 1.15R"],
        entry_rules=["Enter a confirmation slice on the break", "Hold a second slice for the first controlled retest outside the old range"],
        take_profit_rules=["Take partial near the first expansion leg", "Let the rest work toward wider swing liquidity if structure holds"],
        stop_loss_rules=["Stop outside the broken range plus ATR buffer", "Cancel retest if price accepts back inside the old range"],
        checklist=["Is this a clean expansion or a stop-run fakeout?", "Is participation expanding rather than drying up?", "Does the wider stop still fit account risk?", "Should the retest slice be cancelled if price runs?"],
        current_plan="Waiting for BTC to leave a recent range with real participation, not just a thin wick.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        score = 48 + int(max(0.0, float(g["volumeZ15m"]) + 0.3) * 7) + int(abs(float(g["oi30m"])) * 4)
        score += 9 if g["regime"] in {"trend", "squeeze"} else 0
        score += 7 if float(g["candleBody"]) >= 0.45 else 0
        price = float(g["price"])
        high_break = price >= max(float(g["ema20_1h"]), float(g["ema50_1h"])) and g["trend4h"] != "bearish"
        low_break = price <= min(float(g["ema20_1h"]), float(g["ema50_1h"])) and g["trend4h"] != "bullish"
        volume_z = float(g["volumeZ15m"])
        oi_abs = abs(float(g["oi30m"]))
        participation = (volume_z > 0.05 and oi_abs >= 0.12) or volume_z >= 0.35 or oi_abs >= 0.35
        if high_break and participation:
            side, setup = "LONG", "DONCHIAN_RANGE_EXPANSION_LONG"
        elif low_break and participation:
            side, setup = "SHORT", "DONCHIAN_RANGE_EXPANSION_SHORT"
        else:
            return _rejection(self.profile, "Donchian boundary or participation confirmation is not strong enough yet.", score, g, "donchian_no_breakout")
        risk_distance = max(float(g["atr1h"]) * 1.20, float(g["atr4h"]) * 0.34, price * 0.006)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.75, 3.60),
            leverage=6,
            max_leverage=8,
            entry_style="wide_staged",
            order_execution="BREAKOUT_CLOSE_OR_RETEST",
            reason_code="donchian_expansion",
            gate_scores=g,
            sizing_note="Wider swing breakout: risk can expand only when AI confirms participation and fakeout risk is acceptable.",
        )


class IchimokuCloudPilot(TraderStrategy):
    profile = _profile(
        trader_id="ichimoku-cloud-pilot",
        name="Cloud Pilot",
        description="Rides BTC continuation when price holds a cloud-like trend zone instead of chasing every candle.",
        concept="Ichimoku-inspired continuation using 4H direction, 1H EMA cloud proxy, healthy RSI, funding sanity, and delayed trailing.",
        base_risk=0.58,
        risk_level="MEDIUM",
        long_conditions=["4H trend is bullish", "1H price holds above the EMA20/EMA50 cloud proxy", "RSI is constructive but not euphoric", "Funding is not one-sided"],
        short_conditions=["4H trend is bearish", "1H price holds below the EMA20/EMA50 cloud proxy", "RSI is weak but not capitulated", "Funding is not one-sided"],
        entry_rules=["Probe near the cloud edge", "Add only after a continuation candle confirms"],
        take_profit_rules=["Partial near the prior swing", "Hold remainder toward trend extension while the cloud remains valid"],
        stop_loss_rules=["Stop outside the cloud proxy", "Exit if 1H closes through the opposite side of the cloud"],
        checklist=["Is the cloud proxy trending or flat?", "Is the pullback healthy?", "Can this be held longer than a scalp?", "Is funding too crowded?"],
        current_plan="Waiting for BTC to pull back into the trend cloud and prove continuation.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        score = 50 + (10 if g["trend4h"] in {"bullish", "bearish"} else 0) + (7 if 36 <= float(g["rsi1h"]) <= 64 else 0)
        score += 6 if float(g["fundingPercentile"]) < 90 else -8
        price = float(g["price"])
        if g["trend4h"] == "bullish" and price >= float(g["ema50_1h"]) and float(g["ema20_1h"]) >= float(g["ema50_1h"]):
            side, setup = "LONG", "CLOUD_CONTINUATION_LONG"
        elif g["trend4h"] == "bearish" and price <= float(g["ema50_1h"]) and float(g["ema20_1h"]) <= float(g["ema50_1h"]):
            side, setup = "SHORT", "CLOUD_CONTINUATION_SHORT"
        else:
            return _rejection(self.profile, "Cloud proxy is flat or price is not holding the trend zone.", score, g, "cloud_proxy_not_confirmed")
        risk_distance = max(float(g["atr1h"]) * 1.35, float(g["atr4h"]) * 0.38, price * 0.007)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.90, 4.00),
            leverage=5,
            max_leverage=7,
            entry_style="deep_retest",
            order_execution="CLOUD_PULLBACK_CONTINUATION",
            reason_code="cloud_continuation",
            gate_scores=g,
            sizing_note="Trend-cloud setup: size expands only when the second-stage review agrees the pullback is healthy.",
        )


class VwapReclaimer(TraderStrategy):
    profile = _profile(
        trader_id="vwap-reclaimer",
        name="VWAP Reclaim Crew",
        description="Trades BTC intraday fair-value reclaim or rejection after an overextension snaps back with acceptance.",
        concept="VWAP-like reclaim using EMA20 proxy, faded taker pressure, and fast invalidation around fair value.",
        base_risk=0.50,
        risk_level="MEDIUM",
        long_conditions=["Price stretched below fair value", "15m candle reclaims EMA20 proxy", "Seller pressure fades", "OI is not expanding against the reclaim"],
        short_conditions=["Price stretched above fair value", "15m candle rejects EMA20 proxy", "Buyer pressure fades", "OI is not expanding against the rejection"],
        entry_rules=["Enter on reclaim/rejection close", "Use shallow retest for the second slice only if price stays accepted"],
        take_profit_rules=["First target at intraday midpoint", "Second target at opposite short-term liquidity"],
        stop_loss_rules=["Stop beyond failed reclaim candle", "Exit if price accepts through fair value the wrong way"],
        checklist=["Is this reclaim real or only noise?", "Is the target too close after fees?", "Did taker flow actually fade?", "Should the second slice be cancelled quickly?"],
        current_plan="Waiting for BTC to reclaim or reject intraday fair value with enough proof.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        reclaim_long = float(g["low15m"]) < float(g["ema20_1h"]) < float(g["close15m"]) and float(g["takerBuyShare"]) >= 0.50
        reject_short = float(g["high15m"]) > float(g["ema20_1h"]) > float(g["close15m"]) and float(g["takerBuyShare"]) <= 0.50
        score = 49 + (12 if reclaim_long or reject_short else 0) + (6 if abs(float(g["oi30m"])) < 0.8 else 0)
        score += 6 if float(g["volumeZ15m"]) > -0.35 else -5
        if reclaim_long:
            side, setup = "LONG", "VWAP_RECLAIM_LONG"
        elif reject_short:
            side, setup = "SHORT", "VWAP_REJECT_SHORT"
        else:
            return _rejection(self.profile, "Fair-value reclaim/rejection has not been accepted by the 15m candle.", score, g, "vwap_not_reclaimed")
        risk_distance = max(float(g["atr1h"]) * 0.85, float(g["price"]) * 0.0045)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.35, 2.45),
            leverage=5,
            max_leverage=7,
            entry_style="confirm_retest",
            order_execution="VWAP_RECLAIM_THEN_LIMIT",
            reason_code="fair_value_reclaim",
            gate_scores=g,
            sizing_note="Intraday fair-value setup: keep sizing moderate because reclaim trades decay quickly.",
        )


class WyckoffSpring(TraderStrategy):
    profile = _profile(
        trader_id="wyckoff-spring",
        name="Wyckoff Springboard",
        description="Finds BTC spring/upthrust traps where price sweeps a range edge and quickly fails back inside.",
        concept="Trap reversal around range extremes using wick quality, channel position, snapback close, and fast invalidation.",
        base_risk=0.56,
        risk_level="HIGH",
        long_conditions=["Price sweeps below range support", "Lower wick is meaningful", "15m close reclaims inside the range", "Volume suggests stop-run participation"],
        short_conditions=["Price sweeps above range resistance", "Upper wick is meaningful", "15m close fails back inside the range", "Volume suggests stop-run participation"],
        entry_rules=["Enter on reclaim/failure candle", "Use a second slice on retest of swept level"],
        take_profit_rules=["First target near range midpoint", "Second target near opposite liquidity pocket"],
        stop_loss_rules=["Stop beyond the sweep wick", "Exit if the swept level is accepted again"],
        checklist=["Is this a trap or real breakout?", "Is wick quality strong enough?", "Is stop outside the actual sweep?", "Should profit be protected early?"],
        current_plan="Waiting for a BTC stop-run trap to snap back inside the range.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        spring_long = float(g["channelPosition"]) <= 0.28 and float(g["lowerWick"]) >= 0.30 and g["trend4h"] != "bearish"
        upthrust_short = float(g["channelPosition"]) >= 0.72 and float(g["upperWick"]) >= 0.30 and g["trend4h"] != "bullish"
        score = 50 + (12 if spring_long or upthrust_short else 0) + (8 if float(g["volumeZ15m"]) >= -0.25 else 0)
        score += 5 if g["regime"] in {"range", "mixed"} else -4
        if spring_long:
            side, setup = "LONG", "WYCKOFF_SPRING_LONG"
        elif upthrust_short:
            side, setup = "SHORT", "WYCKOFF_UPTHRUST_SHORT"
        else:
            return _rejection(self.profile, "Range sweep and snapback quality are not strong enough for a Wyckoff trap.", score, g, "spring_not_confirmed")
        risk_distance = max(float(g["atr1h"]) * 0.90, float(g["price"]) * 0.0048)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.55, 2.90),
            leverage=5,
            max_leverage=7,
            entry_style="confirm_retest",
            order_execution="SPRING_RECLAIM_CONFIRMATION",
            reason_code="wyckoff_trap_reversal",
            gate_scores=g,
            sizing_note="Trap reversal: allow tactical size only when snapback is visible and invalidation remains close.",
        )


class RsiDivergenceScout(TraderStrategy):
    profile = _profile(
        trader_id="rsi-divergence-scout",
        name="RSI Divergence Scout",
        description="Looks for BTC exhaustion where RSI stops confirming price and structure begins to turn.",
        concept="Momentum divergence plus structure confirmation; avoids fading strong trends without a reclaim/failure candle.",
        base_risk=0.48,
        risk_level="MEDIUM",
        long_conditions=["1H RSI is weak but improving", "Price stops making clean downside progress", "15m closes back above structure", "Crowding does not fight the reversal"],
        short_conditions=["1H RSI is strong but weakening", "Price stops making clean upside progress", "15m fails below structure", "Crowding does not fight the reversal"],
        entry_rules=["Small confirmation slice first", "Larger slice on retest of reclaimed/failed structure"],
        take_profit_rules=["First target at mean reversion zone", "Second target at prior swing if momentum keeps rotating"],
        stop_loss_rules=["Stop beyond divergence invalidation swing", "Exit if momentum re-accelerates against the thesis"],
        checklist=["Is divergence real or just trend continuation?", "Did structure confirm?", "Is HTF trend too strong to fade?", "Is fee-adjusted RR still valid?"],
        current_plan="Waiting for BTC momentum exhaustion to be confirmed by structure, not just RSI alone.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        bullish = float(g["rsi1h"]) <= 44 and float(g["close15m"]) > float(g["open15m"]) and g["trend4h"] != "bearish"
        bearish = float(g["rsi1h"]) >= 56 and float(g["close15m"]) < float(g["open15m"]) and g["trend4h"] != "bullish"
        score = 47 + (14 if bullish or bearish else 0) + (6 if float(g["candleBody"]) >= 0.30 else 0)
        score += 5 if g["regime"] in {"range", "mixed"} else 0
        if bullish:
            side, setup = "LONG", "BULLISH_RSI_DIVERGENCE_RECLAIM"
        elif bearish:
            side, setup = "SHORT", "BEARISH_RSI_DIVERGENCE_FAILURE"
        else:
            return _rejection(self.profile, "RSI exhaustion has not been confirmed by structure.", score, g, "divergence_needs_structure")
        risk_distance = max(float(g["atr1h"]) * 1.00, float(g["price"]) * 0.0052)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.45, 2.75),
            leverage=5,
            max_leverage=7,
            entry_style="wide_staged",
            order_execution="DIVERGENCE_CONFIRMATION",
            reason_code="rsi_divergence_reclaim",
            gate_scores=g,
            sizing_note="Divergence reversal: no aggressive sizing until price confirms exhaustion with structure.",
        )


class SessionRaider(TraderStrategy):
    profile = _profile(
        trader_id="session-raider",
        name="Session Raider",
        description="Targets BTC range breaks around high-liquidity session handoffs, then manages quickly because the edge decays.",
        concept="Session breakout with time window, impulse candle, range boundary, strict TTL, and no repeated revenge entries after failures.",
        base_risk=0.52,
        risk_level="MEDIUM_HIGH",
        long_conditions=["Asia/London/New York transition window is active", "15m candle breaks above local range", "Body or volume expands", "4H trend is not a hard bearish block"],
        short_conditions=["Asia/London/New York transition window is active", "15m candle breaks below local range", "Body or volume expands", "4H trend is not a hard bullish block"],
        entry_rules=["Single confirmed session-break order", "Expire quickly if not filled"],
        take_profit_rules=["First target at nearby session liquidity", "Second target only if momentum keeps expanding"],
        stop_loss_rules=["Stop behind the session break candle", "Exit if price re-enters the session range"],
        checklist=["Is the session window actually active?", "Is this impulse or a thin wick?", "Should stale orders expire immediately?", "Has this session already failed repeatedly?"],
        current_plan="Waiting for BTC to break a session range during a real liquidity window.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        open_time = int(float(g["openTime15m"]) or 0)
        hour = datetime.fromtimestamp(open_time / 1000, timezone.utc).hour if open_time else datetime.now(timezone.utc).hour
        active_window = hour in {0, 1, 7, 8, 13, 14, 15}
        long_break = float(g["close15m"]) > max(float(g["open15m"]), float(g["ema20_1h"])) and g["trend4h"] != "bearish"
        short_break = float(g["close15m"]) < min(float(g["open15m"]), float(g["ema20_1h"])) and g["trend4h"] != "bullish"
        impulse = float(g["candleBody"]) >= 0.40 or float(g["volumeZ15m"]) > -0.20
        score = 44 + (12 if active_window else -6) + (10 if impulse else 0) + (7 if long_break or short_break else 0)
        if active_window and impulse and long_break:
            side, setup = "LONG", "SESSION_RANGE_BREAK_LONG"
        elif active_window and impulse and short_break:
            side, setup = "SHORT", "SESSION_RANGE_BREAK_SHORT"
        else:
            return _rejection(self.profile, "Session window or impulse confirmation is not ready.", score, g, "session_break_not_ready")
        risk_distance = max(float(g["atr1h"]) * 0.80, float(g["price"]) * 0.0045)
        return _candidate(
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
            reason_code="session_range_break",
            gate_scores=g,
            sizing_note="Session strategy: keep risk capped because repeated attempts and stale fills decay quickly.",
        )


class ImbalanceHunter(TraderStrategy):
    profile = _profile(
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
        g = _gate_common(snapshot)
        bullish = float(g["candleBody"]) >= 0.50 and float(g["close15m"]) > float(g["open15m"]) and float(g["price"]) >= float(g["ema20_1h"])
        bearish = float(g["candleBody"]) >= 0.50 and float(g["close15m"]) < float(g["open15m"]) and float(g["price"]) <= float(g["ema20_1h"])
        score = 48 + (14 if bullish or bearish else 0) + (7 if float(g["volumeZ15m"]) >= -0.15 else 0) + (5 if abs(float(g["oi30m"])) >= 0.15 else 0)
        if bullish and g["trend4h"] != "bearish":
            side, setup = "LONG", "BULLISH_IMBALANCE_RETEST"
        elif bearish and g["trend4h"] != "bullish":
            side, setup = "SHORT", "BEARISH_IMBALANCE_RETEST"
        else:
            return _rejection(self.profile, "Displacement body or structure alignment is not strong enough.", score, g, "imbalance_not_clean")
        risk_distance = max(float(g["atr1h"]) * 1.05, float(g["price"]) * 0.0058)
        return _candidate(
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
            gate_scores=g,
            sizing_note="Imbalance retest: tactical sizing can grow only when midpoint remains respected.",
        )


class MomentumIgnition(TraderStrategy):
    profile = _profile(
        trader_id="momentum-ignition",
        name="Compression Igniter",
        description="Joins BTC only after volatility compresses and a 15m breakout shows real expansion instead of stale chase.",
        concept="Volatility-compression ignition system: squeeze first, breakout second, optional derivatives only as confirmation.",
        base_risk=0.52,
        risk_level="HIGH",
        long_conditions=["BTC is compressed by regime or band width", "15m closes above the compression boundary", "Volume/body show expansion", "4H trend does not block upside"],
        short_conditions=["BTC is compressed by regime or band width", "15m closes below the compression boundary", "Volume/body show expansion", "4H trend does not block downside"],
        entry_rules=["Single participation entry after expansion close", "No averaging down into failed compression"],
        take_profit_rules=["Take partial into the first expansion leg", "Hold the rest only while price stays outside compression"],
        stop_loss_rules=["Stop behind the compression breakout candle", "Reduce fast on 15m re-entry into the box"],
        checklist=["Is this fresh expansion or late chase?", "Was volatility genuinely compressed first?", "Does volume/body confirm the break?", "Is leverage capped by post-compression volatility?"],
        current_plan="Waiting for BTC compression to release with a clean 15m breakout and enough room after fees.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        channel = one_hour.get("channel") or four_hour.get("channel") or {}
        upper_boundary = max(
            float(g["ema20_1h"]),
            fvalue(one_hour.get("high"), float(g["price"])),
            fvalue(channel.get("upper"), float(g["price"])),
        )
        lower_boundary = min(
            float(g["ema20_1h"]),
            fvalue(one_hour.get("low"), float(g["price"])),
            fvalue(channel.get("lower"), float(g["price"])),
        )
        bb_width = float(g["bollingerWidth1h"])
        keltner_width = float(g["keltnerWidth1h"])
        compression_ready = (
            str(g["regime"]) == "squeeze"
            or (bb_width > 0 and keltner_width > 0 and bb_width <= keltner_width * 0.95)
        )
        compressed_not_wild = float(g["adx1h"]) <= 28 or str(g["regime"]) == "squeeze"
        expansion_body = float(g["candleBody"]) >= 0.46
        expansion_volume = float(g["volumeZ15m"]) >= 0.15
        long_break = (
            compression_ready
            and compressed_not_wild
            and expansion_body
            and expansion_volume
            and float(g["close15m"]) > max(float(g["open15m"]), upper_boundary)
            and g["trend4h"] != "bearish"
        )
        short_break = (
            compression_ready
            and compressed_not_wild
            and expansion_body
            and expansion_volume
            and float(g["close15m"]) < min(float(g["open15m"]), lower_boundary)
            and g["trend4h"] != "bullish"
        )
        score = 44
        score += 16 if compression_ready else -8
        score += 14 if long_break or short_break else 0
        score += 8 if expansion_body else -3
        score += 7 if expansion_volume else -4
        score += 4 if compressed_not_wild else -4
        if abs(float(g["oi30m"])) >= 0.35:
            score += 3
        if (long_break and float(g["takerBuyShare"]) > 0.53) or (short_break and float(g["takerBuyShare"]) < 0.47):
            score += 3
        enriched_g = {
            **g,
            "compressionReady": 1.0 if compression_ready else 0.0,
            "compressedNotWild": 1.0 if compressed_not_wild else 0.0,
            "upperBoundary": round(upper_boundary, 4),
            "lowerBoundary": round(lower_boundary, 4),
        }
        if long_break:
            side, setup = "LONG", "VOLATILITY_COMPRESSION_IGNITION_LONG"
        elif short_break:
            side, setup = "SHORT", "VOLATILITY_COMPRESSION_IGNITION_SHORT"
        else:
            return _rejection(
                self.profile,
                "Compression ignition is not ready: squeeze, breakout close, volume/body, or trend filter is incomplete.",
                score,
                enriched_g,
                "compression_breakout_not_ready",
            )
        risk_distance = max(float(g["atr1h"]) * 0.82, float(g["price"]) * 0.0048)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.55, 3.20),
            leverage=6,
            max_leverage=8,
            entry_style="single",
            order_execution="COMPRESSION_BREAKOUT_PARTICIPATION",
            reason_code="volatility_compression_ignition",
            gate_scores=enriched_g,
            sizing_note="Compression ignition: size only after squeeze release is confirmed; derivatives are optional confirmation, not a hard gate.",
        )


class BollingerReversion(TraderStrategy):
    profile = _profile(
        trader_id="bollinger-reversion",
        name="Bollinger Boomerang",
        description="Fades BTC statistical overextension only when the market is ranging enough for mean reversion to make sense.",
        concept="Band/RSI mean reversion with trend-strength filter, exhaustion confirmation, and midpoint-focused exits.",
        base_risk=0.42,
        risk_level="LOW_MEDIUM",
        long_conditions=["Price is near lower statistical band or channel extreme", "RSI is depressed", "Trend regime is not strongly bearish", "Volume does not confirm breakdown continuation"],
        short_conditions=["Price is near upper statistical band or channel extreme", "RSI is elevated", "Trend regime is not strongly bullish", "Volume does not confirm breakout continuation"],
        entry_rules=["Enter first slice at extension", "Use second slice only if deeper extension remains orderly"],
        take_profit_rules=["First target at mean", "Second target only if reversion keeps improving"],
        stop_loss_rules=["Stop outside statistical extension", "Exit if band-walk behavior starts"],
        checklist=["Is this reversion or a band walk?", "Is trend strength too high?", "Is target close enough for mean reversion?", "Is crowding worsening the fade?"],
        current_plan="Waiting for BTC to stretch statistically while trend strength stays contained.",
    )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        g = _gate_common(snapshot)
        lower_fade = (float(g["rsi1h"]) <= 38 or float(g["channelPosition"]) <= 0.18) and g["trend4h"] != "bearish"
        upper_fade = (float(g["rsi1h"]) >= 62 or float(g["channelPosition"]) >= 0.82) and g["trend4h"] != "bullish"
        score = 50 + (12 if lower_fade or upper_fade else 0) + (8 if g["regime"] in {"range", "mixed"} else -8)
        if lower_fade:
            side, setup = "LONG", "LOW_BAND_MEAN_REVERSION_LONG"
        elif upper_fade:
            side, setup = "SHORT", "UPPER_BAND_MEAN_REVERSION_SHORT"
        else:
            return _rejection(self.profile, "Band extension is not extreme enough, or trend is too strong to fade.", score, g, "band_reversion_not_ready")
        risk_distance = max(float(g["atr1h"]) * 0.85, float(g["price"]) * 0.0046)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(1.25, 2.05),
            leverage=5,
            max_leverage=7,
            entry_style="wide_staged",
            order_execution="STATISTICAL_REVERSION_LIMIT",
            reason_code="band_mean_reversion",
            gate_scores=g,
            sizing_note="Mean reversion: keep risk lower unless AI confirms the market is ranging, not trending.",
        )


class AtrTrailCommander(TraderStrategy):
    profile = _profile(
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
        g = _gate_common(snapshot)
        atr_percent = float(g["atr1h"]) / float(g["price"]) if float(g["price"]) > 0 else 0.0
        long_trend = g["trend4h"] == "bullish" and float(g["price"]) >= float(g["ema50_1h"]) and float(g["ema20_4h"]) >= float(g["ema50_4h"])
        short_trend = g["trend4h"] == "bearish" and float(g["price"]) <= float(g["ema50_1h"]) and float(g["ema20_4h"]) <= float(g["ema50_4h"])
        volatility_ok = 0.004 <= atr_percent <= 0.035
        score = 50 + (14 if long_trend or short_trend else 0) + (7 if volatility_ok else -8)
        score += 5 if float(g["fundingPercentile"]) < 92 else -5
        if long_trend and volatility_ok:
            side, setup = "LONG", "ATR_TREND_TRAIL_LONG"
        elif short_trend and volatility_ok:
            side, setup = "SHORT", "ATR_TREND_TRAIL_SHORT"
        else:
            return _rejection(self.profile, "Trend or ATR condition is not durable enough for a trailing setup.", score, g, "atr_trend_not_ready")
        risk_distance = max(float(g["atr1h"]) * 1.80, float(g["atr4h"]) * 0.45, float(g["price"]) * 0.009)
        return _candidate(
            profile=self.profile,
            snapshot=snapshot,
            side=side,
            setup_type=setup,
            score=score,
            risk_distance=risk_distance,
            target_rs=(2.25, 4.70),
            leverage=5,
            max_leverage=7,
            entry_style="deep_retest",
            order_execution="ATR_TREND_PULLBACK",
            reason_code="atr_trend_trail",
            gate_scores=g,
            sizing_note="Trend follower: risk can widen only for high-confidence, wider-horizon setups with clean ATR geometry.",
        )
