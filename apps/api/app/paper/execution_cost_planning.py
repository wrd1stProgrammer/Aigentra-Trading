from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db import TradePlanRecord
from app.paper.execution_costs import (
    EntryOrderType,
    ExecutionCostPayload,
    ExecutionCostRates,
    ExecutionCostRequest,
    ExecutionSide,
    PlannedExecutionEntry,
    PlannedExecutionTarget,
    calculate_execution_costs,
    execution_cost_gate,
)
from app.repositories import from_json, to_json
from app.traders.models import TradeCandidate, TradePlan


@dataclass(frozen=True, slots=True)
class ExecutionCostPlanningRequest:
    candidate: TradeCandidate
    plan: TradePlan
    rates: ExecutionCostRates
    confirmation_only: bool


@dataclass(frozen=True, slots=True)
class ExecutionCostDecision:
    payload: ExecutionCostPayload | None
    rejection_reasons: tuple[str, ...]


def assess_planned_execution_costs(request: ExecutionCostPlanningRequest) -> ExecutionCostDecision:
    risk_plan = request.candidate.riskPlan
    if risk_plan is None or request.plan.side is None or request.plan.stopLoss is None:
        return ExecutionCostDecision(payload=None, rejection_reasons=())

    post_only = request.candidate.orderIntent.postOnly if request.candidate.orderIntent else True
    assessment = calculate_execution_costs(
        ExecutionCostRequest(
            side=ExecutionSide(request.plan.side.lower()),
            entries=tuple(
                PlannedExecutionEntry(
                    price=Decimal(str(entry.price)),
                    weight=Decimal(str(entry.weight)),
                    order_type=(
                        EntryOrderType.MARKET
                        if not post_only and index == 0
                        else EntryOrderType.LIMIT
                    ),
                )
                for index, entry in enumerate(request.plan.entries)
                if entry.price > 0
                and entry.weight > 0
                and (not request.confirmation_only or index == 0)
            ),
            stop_loss=Decimal(str(request.plan.stopLoss)),
            targets=tuple(
                PlannedExecutionTarget(
                    price=Decimal(str(target.price)),
                    weight=Decimal(str(target.weight)),
                )
                for target in request.plan.takeProfits
            ),
            rates=request.rates,
        )
    )
    if assessment is None:
        return ExecutionCostDecision(payload=None, rejection_reasons=())
    return ExecutionCostDecision(
        payload=assessment.to_payload(),
        rejection_reasons=tuple(
            reason.value
            for reason in execution_cost_gate(
                assessment,
                Decimal(str(risk_plan.minRiskReward)),
            )
        ),
    )


def persist_execution_cost_assessment(
    db: Session,
    trade_plan_id: int,
    payload: ExecutionCostPayload,
) -> None:
    plan_record = db.get(TradePlanRecord, trade_plan_id)
    if plan_record is None:
        return
    plan_payload = from_json(plan_record.payload_json) or {}
    if not isinstance(plan_payload, dict):
        plan_payload = {}
    plan_record.payload_json = to_json({**plan_payload, "executionCostAssessment": payload})
    db.flush()
