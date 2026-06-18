from decimal import Decimal, InvalidOperation
from typing import Any


SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT = Decimal("100")


def final_trade_risk_percent(candidate: Any, review: Any) -> float:
    base_risk = _as_float(getattr(candidate, "riskPercent", None), 0.0)
    if base_risk <= 0:
        return 0.0

    requested = _as_float(getattr(review, "riskPercentOverride", None), base_risk)
    confidence = _as_float(getattr(review, "confidence", None), 0.0)
    risk_reward = estimated_risk_reward(candidate)
    setup_score = _as_float(getattr(candidate, "setupScore", None), 0.0)

    multiplier = 1.25
    absolute_cap = 1.5
    if confidence >= 82 and risk_reward >= 1.5 and setup_score >= 58:
        multiplier = 1.75
        absolute_cap = 2.25
        if getattr(review, "riskPercentOverride", None) is None:
            requested = max(requested, base_risk * 1.25)
    if confidence >= 90 and risk_reward >= 2.0 and setup_score >= 65:
        multiplier = 2.25
        absolute_cap = 3.0
        if getattr(review, "riskPercentOverride", None) is None:
            requested = max(requested, base_risk * 1.5)

    cap = min(absolute_cap, max(base_risk, base_risk * multiplier))
    return max(0.1, min(requested, cap))


def adjusted_margin_deployment_percent(base_deployment: Decimal, candidate: Any, settings: Any, review: Any | None) -> Decimal:
    if review is None:
        return base_deployment

    confidence = _as_float(getattr(review, "confidence", None), 0.0)
    risk_reward = estimated_risk_reward(candidate)
    setup_score = _as_float(getattr(candidate, "setupScore", None), 0.0)
    uplift = Decimal("0")
    if confidence >= 90 and risk_reward >= 2.0 and setup_score >= 65:
        uplift = Decimal("14")
    elif confidence >= 82 and risk_reward >= 1.5 and setup_score >= 58:
        uplift = Decimal("8")
    elif confidence >= 76 and getattr(review, "riskPercentOverride", None) is not None and setup_score >= 60:
        uplift = Decimal("5")

    maximum = min(
        SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT,
        max(Decimal("0"), _as_decimal(getattr(settings, "paper_max_margin_deployment_percent", 100), Decimal("100"))),
    )
    return min(maximum, base_deployment + uplift)


def estimated_risk_reward(candidate: Any) -> float:
    risk_plan = getattr(candidate, "riskPlan", None)
    risk_plan_rr = _as_float(getattr(risk_plan, "estimatedRiskReward", None), 0.0)
    if risk_plan_rr > 0:
        return risk_plan_rr

    side = str(getattr(candidate, "side", "") or "").upper()
    entries = list(getattr(candidate, "entries", []) or [])
    take_profits = list(getattr(candidate, "takeProfits", []) or [])
    stop_loss = _as_float(getattr(candidate, "stopLoss", None), 0.0)
    if side not in {"LONG", "SHORT"} or not entries or not take_profits or stop_loss <= 0:
        return 0.0

    average_entry = _weighted_average_price(entries)
    average_target = _weighted_average_price(take_profits)
    if average_entry <= 0 or average_target <= 0:
        return 0.0

    if side == "LONG":
        risk = average_entry - stop_loss
        reward = average_target - average_entry
    else:
        risk = stop_loss - average_entry
        reward = average_entry - average_target
    if risk <= 0 or reward <= 0:
        return 0.0
    return reward / risk


def _weighted_average_price(items: list[Any]) -> float:
    total_weight = 0.0
    weighted_sum = 0.0
    for item in items:
        price = _as_float(getattr(item, "price", None), 0.0)
        weight = max(_as_float(getattr(item, "weight", None), 1.0), 0.0)
        if price <= 0 or weight <= 0:
            continue
        total_weight += weight
        weighted_sum += price * weight
    return weighted_sum / total_weight if total_weight > 0 else 0.0


def _as_float(value: Any, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed == parsed else default


def _as_decimal(value: Any, default: Decimal) -> Decimal:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default
    return parsed if parsed.is_finite() else default
