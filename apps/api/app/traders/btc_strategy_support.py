from typing import Any, Dict, List

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
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


def build_btc_profile(
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
        mockPerformance={
            "return7d": 0.0,
            "return30d": 0.0,
            "winRate": 0.0,
            "maxDrawdown": 0.0,
            "currentEquity": 10000.0,
        },
        currentPlan=current_plan,
    )


def btc_gate_common(snapshot: Dict[str, Any]) -> dict[str, float | str]:
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
    if style == "high_voltage_staged":
        offsets = (0.0, 0.25, 0.50)
        weights = (0.50, 0.25, 0.25)
        planned = [
            EntryPlan(
                price=round_price(price - risk_distance * offset if side == "LONG" else price + risk_distance * offset),
                weight=weight,
                reason=("Breakout confirmation entry" if index == 0 else f"Controlled retest entry {index}"),
            )
            for index, (offset, weight) in enumerate(zip(offsets, weights, strict=True))
        ]
        return normalize_entries_for_side(side, price, planned)
    if style == "high_voltage_retest":
        first_weight, pullback = 0.70, 0.35
    elif style == "wide_staged":
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


def _take_profits(
    side: str,
    price: float,
    risk_distance: float,
    target_rs: tuple[float, float],
    weights: tuple[float, float] = (0.40, 0.60),
) -> List[TakeProfitPlan]:
    first_r, second_r = target_rs
    first_weight, second_weight = weights
    if side == "LONG":
        return [
            TakeProfitPlan(price=round_price(price + risk_distance * first_r), weight=first_weight, reason="First BTC liquidity target"),
            TakeProfitPlan(price=round_price(price + risk_distance * second_r), weight=second_weight, reason="Extended thesis target"),
        ]
    return [
        TakeProfitPlan(price=round_price(price - risk_distance * first_r), weight=first_weight, reason="First BTC liquidity target"),
        TakeProfitPlan(price=round_price(price - risk_distance * second_r), weight=second_weight, reason="Extended thesis target"),
    ]


def build_btc_candidate(
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
    risk_percent: float | None = None,
    candidate_audit: dict[str, Any] | None = None,
    take_profit_weights: tuple[float, float] = (0.40, 0.60),
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
    take_profits = _take_profits(side, price, risk_distance, target_rs, take_profit_weights)
    risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.09)
    errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=min_rr, fee_buffer_percent=0.09)
    if errors:
        return candidate_with_audit(
            TradeCandidate(created=False, reason=f"{profile.name} geometry gate failed: " + "; ".join(errors), setupScore=score),
            trader_id=profile.id,
            gate_scores=gate_scores,
            reason_code="geometry_gate_failed",
            observation_type="OBSERVE_ONLY" if score >= 50 else "NO_TRADE",
        )
    applied_risk_percent = profile.baseRiskPercent if risk_percent is None else risk_percent
    return candidate_with_audit(
        TradeCandidate(
            created=True,
            side=side,
            setupType=setup_type,
            setupScore=min(score, 94),
            audit=candidate_audit or {},
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=applied_risk_percent,
            orderIntent=default_order_intent(order_execution, post_only=entry_style != "single"),
            leveragePlan=default_leverage_plan(
                suggested=leverage,
                maximum=max_leverage,
                reason=f"{profile.name} uses {leverage}x only after its BTC-specific first-stage filters and second-stage AI review agree.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=applied_risk_percent,
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


def reject_btc_candidate(
    profile: TraderProfile,
    reason: str,
    score: int,
    gate_scores: dict[str, Any],
    reason_code: str,
) -> TradeCandidate:
    return candidate_with_audit(
        TradeCandidate(created=False, reason=reason, setupScore=score),
        trader_id=profile.id,
        gate_scores=gate_scores,
        reason_code=reason_code,
        observation_type="OBSERVE_ONLY" if score >= 50 else "NO_TRADE",
    )


def _notes(snapshot: Dict[str, Any], reason_code: str) -> list[str]:
    gates = btc_gate_common(snapshot)
    return [
        f"Reason code: {reason_code}.",
        f"1H RSI {float(gates['rsi1h']):.1f}, 15m volume z-score {float(gates['volumeZ15m']):.2f}.",
        f"Regime {gates['regime']}, OI 30m change {float(gates['oi30m']):.2f}%, funding percentile {float(gates['fundingPercentile']):.0f}.",
    ]


__all__ = ["btc_gate_common", "build_btc_candidate", "build_btc_profile", "reject_btc_candidate"]
