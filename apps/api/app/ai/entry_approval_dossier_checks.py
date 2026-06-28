from typing import Any, Optional

from app.ai.entry_approval_dossier_common import append_check, safe_float
from app.ai.entry_approval_dossier_context import active_exposure, loss_context
from app.traders.models import TradeReviewPayload
from app.traders.strategy_base import (
    candidate_geometry_errors,
    estimate_risk_reward,
    weighted_average_entry,
    weighted_average_take_profit,
)


def build_data_checks(payload: TradeReviewPayload, geometry: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    candidate = payload.candidate
    data_checks: list[dict[str, Any]] = []
    hard_blockers: list[str] = []
    warnings: list[str] = []

    append_check(data_checks, "candidate_created", "pass" if candidate.created else "fail", "Candidate exists.")
    if not candidate.created:
        hard_blockers.append("Candidate was not created by the first-stage trader.")

    missing = missing_required_fields(payload)
    if missing:
        detail = f"Missing required second-pass fields: {', '.join(missing)}."
        append_check(data_checks, "required_fields", "fail", detail, ", ".join(missing))
        hard_blockers.append(detail)
    else:
        append_check(data_checks, "required_fields", "pass", "Entry, stop, target, risk, leverage, order intent, and early-exit fields are present.")

    for error in geometry_errors(payload):
        append_check(data_checks, "entry_geometry", "fail", error)
        hard_blockers.append(error)
    if not any(check["code"] == "entry_geometry" and check["status"] == "fail" for check in data_checks) and candidate.created:
        append_check(data_checks, "entry_geometry", "pass", "Entry, stop, and targets are on the correct sides of the trade.")

    risk_plan = candidate.riskPlan
    if risk_plan is not None:
        add_fee_rr_check(data_checks, hard_blockers, geometry, float(risk_plan.minRiskReward))

    leverage_plan = candidate.leveragePlan
    if leverage_plan is not None:
        add_leverage_check(data_checks, hard_blockers, warnings, leverage_plan.suggestedLeverage, leverage_plan.maxLeverage)

    order_intent = candidate.orderIntent
    if order_intent is not None:
        if order_intent.reduceOnly:
            append_check(data_checks, "order_intent", "fail", "Entry order intent cannot be reduce-only.")
            hard_blockers.append("Entry order intent cannot be reduce-only.")
        else:
            append_check(data_checks, "order_intent", "pass", "Order intent is compatible with a pending paper entry.", order_intent.execution)

    exposure = active_exposure(payload.activeExposure)
    if exposure["openOrderCount"] or exposure["openPositionCount"]:
        detail = "Existing exposure is active; a new entry approval should not be issued."
        append_check(data_checks, "active_exposure", "fail", detail)
        hard_blockers.append(detail)
    else:
        append_check(data_checks, "active_exposure", "pass", "No active paper order or position blocks this candidate.")

    losses = loss_context(payload)
    if losses["lossDiscipline"].get("active") or losses["recentLossReviews"]:
        detail = "Recent loss context should affect sizing or patience, not automatically reject the setup."
        append_check(data_checks, "recent_loss_context", "warn", detail)
        warnings.append(detail)

    return data_checks, hard_blockers, warnings


def geometry_summary(payload: TradeReviewPayload) -> dict[str, Any]:
    candidate = payload.candidate
    weighted_entry = weighted_average_entry(candidate.entries)
    weighted_target = weighted_average_take_profit(candidate.takeProfits)
    fee_buffer = float(candidate.riskPlan.feeBufferPercent) if candidate.riskPlan else 0.08
    side = str(candidate.side or "").upper()
    stop_loss = float(candidate.stopLoss or 0.0)
    fee_rr = estimate_risk_reward(side, candidate.entries, stop_loss, candidate.takeProfits, fee_buffer)
    return {
        "weightedEntry": round(weighted_entry, 4),
        "weightedTarget": round(weighted_target, 4),
        "firstEntry": candidate.entries[0].price if candidate.entries else None,
        "firstTakeProfit": candidate.takeProfits[0].price if candidate.takeProfits else None,
        "stopLoss": candidate.stopLoss,
        "feeAwareRiskReward": fee_rr,
        "minimumRiskReward": candidate.riskPlan.minRiskReward if candidate.riskPlan else None,
        "candidateRiskReward": candidate.riskPlan.estimatedRiskReward if candidate.riskPlan else None,
        "distanceToStopPercent": distance_to_stop_percent(side, weighted_entry, stop_loss),
        "distanceToTargetPercent": distance_to_target_percent(side, weighted_entry, weighted_target),
    }


def decision_gate(hard_blockers: list[str], warnings: list[str]) -> dict[str, Any]:
    if hard_blockers:
        return {
            "severity": "hard_fail",
            "allowedDecisions": ["REJECT", "NEEDS_MORE_DATA"],
            "blockedDecisions": ["APPROVE", "ADJUST_AND_APPROVE", "DEFER"],
            "mustExplain": hard_blockers[:4],
        }
    if warnings:
        return {
            "severity": "caution",
            "allowedDecisions": ["APPROVE", "ADJUST_AND_APPROVE", "DEFER", "REJECT", "NEEDS_MORE_DATA"],
            "preferredDecisions": ["ADJUST_AND_APPROVE", "DEFER", "APPROVE"],
            "mustExplain": warnings[:4],
        }
    return {
        "severity": "clean",
        "allowedDecisions": ["APPROVE", "ADJUST_AND_APPROVE", "DEFER", "REJECT", "NEEDS_MORE_DATA"],
        "preferredDecisions": ["APPROVE", "ADJUST_AND_APPROVE"],
        "mustExplain": [],
    }


def review_focus(hard_blockers: list[str], warnings: list[str]) -> list[str]:
    if hard_blockers:
        return [
            "Lead with the concrete blocker, not a generic risk label.",
            "Explain what data would make the candidate reviewable again.",
        ]
    focus = [
        "Lead with why this entry is or is not worth taking now.",
        "Tie the decision to entry, stop, target, and fee-aware RR.",
        "Name one kill-switch that would change the decision.",
    ]
    if warnings:
        focus.append("If approving, explain the exact adjustment that contains the warning.")
    return focus


def missing_required_fields(payload: TradeReviewPayload) -> list[str]:
    candidate = payload.candidate
    missing: list[str] = []
    for field_name, value in (
        ("side", candidate.side),
        ("entries", candidate.entries),
        ("stopLoss", candidate.stopLoss),
        ("takeProfits", candidate.takeProfits),
        ("riskPlan", candidate.riskPlan),
        ("leveragePlan", candidate.leveragePlan),
        ("orderIntent", candidate.orderIntent),
        ("earlyExitRules", candidate.earlyExitRules),
        ("invalidation", candidate.invalidation),
    ):
        if value in (None, "", []) or value == {}:
            missing.append(field_name)
    return missing


def geometry_errors(payload: TradeReviewPayload) -> list[str]:
    candidate = payload.candidate
    if candidate.side is None or candidate.stopLoss is None or candidate.riskPlan is None:
        return []
    return candidate_geometry_errors(
        candidate.side,
        safe_float(payload.marketSnapshot.get("price")),
        candidate.entries,
        candidate.stopLoss,
        candidate.takeProfits,
        min_risk_reward=candidate.riskPlan.minRiskReward,
        fee_buffer_percent=candidate.riskPlan.feeBufferPercent,
    )


def add_fee_rr_check(checks: list[dict[str, Any]], hard_blockers: list[str], geometry: dict[str, Any], minimum_rr: float) -> None:
    fee_rr = float(geometry["feeAwareRiskReward"])
    if fee_rr < minimum_rr:
        detail = f"Fee-aware RR {fee_rr:.2f} is below minimum {minimum_rr:.2f}."
        append_check(checks, "fee_aware_rr", "fail", detail, f"{fee_rr:.2f}/{minimum_rr:.2f}")
        hard_blockers.append(detail)
        return
    append_check(checks, "fee_aware_rr", "pass", "Fee-aware risk-reward clears the trader minimum.", f"{fee_rr:.2f}/{minimum_rr:.2f}")


def add_leverage_check(checks: list[dict[str, Any]], hard_blockers: list[str], warnings: list[str], suggested: int, maximum: int) -> None:
    if suggested > maximum:
        detail = "Suggested leverage is above the strategy max leverage."
        append_check(checks, "leverage_bounds", "fail", detail, f"{suggested}/{maximum}")
        hard_blockers.append(detail)
        return
    if maximum < 5:
        detail = "Max leverage is below the service execution floor of 5x."
        append_check(checks, "leverage_bounds", "fail", detail, str(maximum))
        hard_blockers.append(detail)
        return
    if suggested >= 8:
        detail = "High leverage needs unusually clean confirmation or an adjustment."
        append_check(checks, "leverage_bounds", "warn", detail, str(suggested))
        warnings.append(detail)
        return
    append_check(checks, "leverage_bounds", "pass", "Suggested leverage is inside the strategy limit.", str(suggested))


def distance_to_stop_percent(side: str, weighted_entry: float, stop_loss: float) -> Optional[float]:
    if weighted_entry <= 0 or stop_loss <= 0:
        return None
    distance = weighted_entry - stop_loss if side == "LONG" else stop_loss - weighted_entry
    return round((distance / weighted_entry) * 100, 4)


def distance_to_target_percent(side: str, weighted_entry: float, weighted_target: float) -> Optional[float]:
    if weighted_entry <= 0 or weighted_target <= 0:
        return None
    distance = weighted_target - weighted_entry if side == "LONG" else weighted_entry - weighted_target
    return round((distance / weighted_entry) * 100, 4)
