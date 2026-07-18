from typing import Any, Dict

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
    latest_candle,
    market_regime,
    normalize_entries_for_side,
    round_price,
    taker_buy_share,
    timeframe,
    trend_for,
    wick_ratios,
)


def build_alternative_profile(
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
        launchMonth="2026-07",
        lifecycleStatus="new",
        lifecycleLabel="NEW",
    )


def external_context(snapshot: Dict[str, Any], key: str) -> Dict[str, Any]:
    value = snapshot.get("externalDerivatives", {}).get(key)
    return value if isinstance(value, dict) else {}


def alternative_gate_common(snapshot: Dict[str, Any]) -> dict[str, float | str | bool]:
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


def build_alternative_candidate(
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
    entry_weights: tuple[float, float] = (0.55, 0.45),
    take_profit_weights: tuple[float, float] = (0.45, 0.55),
) -> TradeCandidate:
    price = fvalue(snapshot.get("price"))
    first_entry_weight, second_entry_weight = entry_weights
    first_take_profit_weight, second_take_profit_weight = take_profit_weights
    if side == "LONG":
        entries = normalize_entries_for_side(
            side,
            price,
            [
                EntryPlan(price=round_price(price), weight=first_entry_weight, reason="Data-trigger confirmation entry"),
                EntryPlan(price=round_price(price - risk_distance * 0.42), weight=second_entry_weight, reason="Controlled retest entry"),
            ],
        )
        stop = round_price(price - risk_distance)
        take_profits = [
            TakeProfitPlan(price=round_price(price + risk_distance * target_rs[0]), weight=first_take_profit_weight, reason="First pressure-release target"),
            TakeProfitPlan(price=round_price(price + risk_distance * target_rs[1]), weight=second_take_profit_weight, reason="Extended data-thesis target"),
        ]
    else:
        entries = normalize_entries_for_side(
            side,
            price,
            [
                EntryPlan(price=round_price(price), weight=first_entry_weight, reason="Data-trigger confirmation entry"),
                EntryPlan(price=round_price(price + risk_distance * 0.42), weight=second_entry_weight, reason="Controlled retest entry"),
            ],
        )
        stop = round_price(price + risk_distance)
        take_profits = [
            TakeProfitPlan(price=round_price(price - risk_distance * target_rs[0]), weight=first_take_profit_weight, reason="First pressure-release target"),
            TakeProfitPlan(price=round_price(price - risk_distance * target_rs[1]), weight=second_take_profit_weight, reason="Extended data-thesis target"),
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


def reject_alternative_candidate(
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


__all__ = [
    "alternative_gate_common",
    "build_alternative_candidate",
    "build_alternative_profile",
    "external_context",
    "reject_alternative_candidate",
]
