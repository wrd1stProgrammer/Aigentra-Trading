from decimal import Decimal, InvalidOperation
from typing import Any, Final


SERVICE_MIN_MARGIN_DEPLOYMENT_PERCENT: Final = Decimal("10")
SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT: Final = Decimal("100")


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
    horizon_multiplier = _horizon_risk_multiplier(candidate)
    if confidence >= 82 and risk_reward >= 1.5 and setup_score >= 58:
        multiplier = Decimal("1.75") * horizon_multiplier
        absolute_cap = float(Decimal("2.25") * horizon_multiplier)
        if getattr(review, "riskPercentOverride", None) is None:
            requested = max(requested, base_risk * 1.25)
    if confidence >= 90 and risk_reward >= 2.0 and setup_score >= 65:
        multiplier = Decimal("2.25") * horizon_multiplier
        absolute_cap = float(Decimal("3.0") * horizon_multiplier)
        if getattr(review, "riskPercentOverride", None) is None:
            requested = max(requested, base_risk * 1.5)

    cap = min(absolute_cap, max(base_risk, base_risk * float(multiplier)))
    return max(0.1, min(requested, cap))


def adjusted_margin_deployment_percent(base_deployment: Decimal, candidate: Any, settings: Any, review: Any | None) -> Decimal:
    if review is None:
        return base_deployment

    confidence = _as_float(getattr(review, "confidence", None), 0.0)
    risk_reward = estimated_risk_reward(candidate)
    setup_score = _as_float(getattr(candidate, "setupScore", None), 0.0)
    uplift = Decimal("0")
    horizon_multiplier = _horizon_risk_multiplier(candidate)
    if confidence >= 90 and risk_reward >= 2.0 and setup_score >= 65:
        uplift = Decimal("14") * horizon_multiplier
    elif confidence >= 82 and risk_reward >= 1.5 and setup_score >= 58:
        uplift = Decimal("8") * horizon_multiplier
    elif confidence >= 76 and getattr(review, "riskPercentOverride", None) is not None and setup_score >= 60:
        uplift = Decimal("5")

    maximum = min(
        SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT,
        max(Decimal("0"), _as_decimal(getattr(settings, "paper_max_margin_deployment_percent", 100), Decimal("100"))),
    )
    return min(maximum, base_deployment + uplift)


def minimum_margin_deployment_percent(settings: Any) -> Decimal:
    configured_minimum = _as_decimal(getattr(settings, "paper_min_margin_deployment_percent", 10), Decimal("10"))
    return max(
        SERVICE_MIN_MARGIN_DEPLOYMENT_PERCENT,
        _clamp_decimal(configured_minimum, Decimal("0"), SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT),
    )


def target_margin_deployment_percent(candidate: Any, settings: Any) -> Decimal:
    minimum = minimum_margin_deployment_percent(settings)
    configured_max = _clamp_decimal(
        _as_decimal(getattr(settings, "paper_max_margin_deployment_percent", 100), Decimal("100")),
        Decimal("0"),
        SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT,
    )
    maximum = max(minimum, configured_max)
    score = _clamp_decimal(_as_decimal(getattr(candidate, "setupScore", 0), Decimal("0")), Decimal("0"), Decimal("100"))
    if score <= Decimal("50"):
        target = minimum
    else:
        target = minimum + ((score - Decimal("50")) / Decimal("50")) * (maximum - minimum)
    return _clamp_decimal(target, minimum, maximum)


def planned_entry_margin_budgets(
    *,
    entries: list[Any],
    target_margin_budget: Decimal,
    total_weight: Decimal,
    first_entry_floor_budget: Decimal,
) -> list[Decimal]:
    if target_margin_budget <= 0 or total_weight <= 0:
        return [Decimal("0") for _ in entries]

    weights = [_entry_weight(entry) / total_weight for entry in entries]
    budgets = [target_margin_budget * weight for weight in weights]
    if len(budgets) <= 1:
        return budgets

    floor = min(target_margin_budget, max(Decimal("0"), first_entry_floor_budget))
    if floor <= 0 or budgets[0] >= floor:
        return budgets

    remaining_budget = target_margin_budget - floor
    remaining_weight = sum(weights[1:], Decimal("0"))
    if remaining_budget <= 0 or remaining_weight <= 0:
        return [floor] + [Decimal("0") for _ in budgets[1:]]
    return [floor] + [remaining_budget * (weight / remaining_weight) for weight in weights[1:]]


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


def _clamp_decimal(value: Decimal, minimum: Decimal, maximum: Decimal) -> Decimal:
    return max(minimum, min(value, maximum))


def _entry_weight(entry: Any) -> Decimal:
    return max(_as_decimal(getattr(entry, "weight", 0), Decimal("0")), Decimal("0"))


def _horizon_risk_multiplier(candidate: Any) -> Decimal:
    profile = str(getattr(candidate, "holdingProfile", "") or "").lower()
    audit = getattr(candidate, "audit", None)
    if isinstance(audit, dict):
        execution_profile = audit.get("executionProfile") or {}
        configured = _as_decimal(execution_profile.get("riskUpliftMultiplier"), Decimal("0"))
        if configured > 0:
            return min(Decimal("1.25"), max(Decimal("0.70"), configured))
    if profile in {"trend", "swing"}:
        return Decimal("1.15")
    if profile == "micro":
        return Decimal("0.80")
    if profile == "intraday":
        return Decimal("0.95")
    return Decimal("1.00")
