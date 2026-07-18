from decimal import Decimal, ROUND_DOWN, ROUND_UP
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord, PaperPositionRecord, TradePlanRecord
from app.paper.engine import place_paper_order
from app.paper.entry_guardrails import entry_guardrail_context
from app.paper.execution_cost_planning import (
    ExecutionCostPlanningRequest,
    assess_planned_execution_costs,
    persist_execution_cost_assessment,
)
from app.paper.execution_costs import ExecutionCostRates
from app.paper.pending_exposure import pending_order_exposure
from app.paper.repositories import create_trade_event, lock_trader_state
from app.paper.review_payload import review_payload_fields
from app.paper.settings import sync_default_paper_settings
from app.paper.sizing import (
    minimum_margin_deployment_percent,
    planned_entry_margin_budgets,
    target_margin_deployment_percent,
)
from app.repositories import from_json, serialize_record, to_json
from app.traders.models import TradeCandidate, TradePlan, TradeReviewResult


MIN_PAPER_QUANTITY = Decimal("0.001")
QUANTITY_STEP = Decimal("0.001")


def quantize_quantity(quantity: Decimal) -> Decimal:
    return quantity.quantize(QUANTITY_STEP, rounding=ROUND_DOWN)


def mark_order_creation_skipped(
    db: Session,
    trade_plan_id: int,
    reasons: list[str],
) -> None:
    plan_record = db.get(TradePlanRecord, trade_plan_id)
    if plan_record is None or plan_record.status != "PAPER_TRADING_PENDING":
        return
    plan_payload = from_json(plan_record.payload_json) or {}
    if not isinstance(plan_payload, dict):
        plan_payload = {}
    plan_record.status = "ORDER_CREATION_SKIPPED"
    plan_record.payload_json = to_json(
        {
            **plan_payload,
            "status": "ORDER_CREATION_SKIPPED",
            "orderCreationSkippedReasons": reasons,
        }
    )
    db.flush()


def list_active_paper_exposure(db: Session, trader_id: str, symbol: str) -> dict:
    orders = db.execute(
        select(PaperOrderRecord)
        .where(
            PaperOrderRecord.trader_id == trader_id,
            PaperOrderRecord.symbol == symbol,
            PaperOrderRecord.status == "open",
        )
        .order_by(PaperOrderRecord.id.asc())
    ).scalars().all()
    positions = db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "open",
        )
        .order_by(PaperPositionRecord.id.asc())
    ).scalars().all()
    return {
        "openOrders": [serialize_record(order) for order in orders],
        "openPositions": [serialize_record(position) for position in positions],
        "hasExposure": bool(orders or positions),
    }


def empty_active_paper_exposure() -> dict:
    return {"openOrders": [], "openPositions": [], "hasExposure": False}


def list_active_paper_exposure_map(db: Session, trader_ids: list[str], symbol: str) -> dict[str, dict]:
    unique_trader_ids = sorted({trader_id for trader_id in trader_ids if trader_id})
    if not unique_trader_ids:
        return {}

    exposures = {trader_id: empty_active_paper_exposure() for trader_id in unique_trader_ids}
    orders_by_trader: dict[str, list] = defaultdict(list)
    positions_by_trader: dict[str, list] = defaultdict(list)

    orders = db.execute(
        select(PaperOrderRecord)
        .where(
            PaperOrderRecord.trader_id.in_(unique_trader_ids),
            PaperOrderRecord.symbol == symbol,
            PaperOrderRecord.status == "open",
        )
        .order_by(PaperOrderRecord.trader_id.asc(), PaperOrderRecord.id.asc())
    ).scalars().all()
    positions = db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id.in_(unique_trader_ids),
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "open",
        )
        .order_by(PaperPositionRecord.trader_id.asc(), PaperPositionRecord.id.asc())
    ).scalars().all()

    for order in orders:
        orders_by_trader[order.trader_id].append(serialize_record(order))
    for position in positions:
        positions_by_trader[position.trader_id].append(serialize_record(position))

    for trader_id in unique_trader_ids:
        open_orders = orders_by_trader.get(trader_id, [])
        open_positions = positions_by_trader.get(trader_id, [])
        exposures[trader_id] = {
            "openOrders": open_orders,
            "openPositions": open_positions,
            "hasExposure": bool(open_orders or open_positions),
        }
    return exposures


def create_paper_orders_from_plan(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    run_id: int,
    trade_plan_id: int,
    candidate: TradeCandidate,
    plan: TradePlan,
    settings: Any,
    review: Optional[TradeReviewResult] = None,
    ai_review_id: Optional[int] = None,
) -> dict:
    is_donchian = trader_id == "donchian-breakout" and str(candidate.setupType or "").startswith("DONCHIAN_")
    if plan.status != "PAPER_TRADING_PENDING" or not plan.side or not plan.entries or plan.stopLoss is None:
        reasons = ["Trade plan is not orderable."]
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {"created": [], "skipped": reasons}

    if trader_id == "funding-contrarian":
        now = datetime.now(timezone.utc)
        interval_hours = max(1, int(getattr(settings, "paper_funding_interval_hours", 8)))
        funding_bucket = now.replace(
            hour=(now.hour // interval_hours) * interval_hours,
            minute=0,
            second=0,
            microsecond=0,
        )
        prior_attempt = db.execute(
            select(PaperOrderRecord.id)
            .where(
                PaperOrderRecord.trader_id == trader_id,
                PaperOrderRecord.symbol == symbol,
                PaperOrderRecord.created_at >= funding_bucket,
            )
            .limit(1)
        ).scalar_one_or_none()
        if prior_attempt is not None:
            reasons = ["Funding Contrarian already attempted this funding interval."]
            mark_order_creation_skipped(db, trade_plan_id, reasons)
            return {
                "created": [],
                "skipped": reasons,
                "fundingInterval": funding_bucket.isoformat(),
            }

    state, risk_settings = sync_default_paper_settings(db, trader_id, symbol, settings)
    state = lock_trader_state(db, trader_id, risk_settings.initial_equity)
    if list_active_paper_exposure(db, trader_id, symbol)["hasExposure"]:
        reasons = ["Trader already has active exposure for this symbol."]
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {"created": [], "skipped": reasons}
    side = plan.side.lower()
    stop_loss = Decimal(str(plan.stopLoss))
    candidate_risk_percent = Decimal(str(candidate.riskPercent or 0))
    planned_risk_percent = min(Decimal(str(plan.riskPercent or candidate.riskPercent or 0)), candidate_risk_percent)
    if planned_risk_percent <= 0:
        reasons = ["Risk percent is not positive."]
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {"created": [], "skipped": reasons}

    leverage = Decimal(str(plan.leverage or 1))
    leverage = max(Decimal("1"), min(leverage, risk_settings.max_leverage))
    total_weight = sum(
        (Decimal(str(max(entry.weight, 0.0))) for entry in plan.entries if entry.price > 0),
        Decimal("0"),
    )
    if total_weight <= 0:
        reasons = ["Entry weights are not positive."]
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {"created": [], "skipped": reasons}

    post_only = candidate.orderIntent.postOnly if candidate.orderIntent else True
    execution_cost_decision = assess_planned_execution_costs(
        ExecutionCostPlanningRequest(
            candidate=candidate,
            plan=plan,
            rates=ExecutionCostRates(
                maker_fee_rate=risk_settings.maker_fee_rate,
                taker_fee_rate=risk_settings.taker_fee_rate,
                slippage_rate=Decimal(str(settings.paper_slippage_rate)),
            ),
            confirmation_only=is_donchian,
        )
    )
    execution_cost_payload = execution_cost_decision.payload
    if execution_cost_payload is not None:
        persist_execution_cost_assessment(db, trade_plan_id, execution_cost_payload)
    if execution_cost_decision.rejection_reasons:
        reasons = list(execution_cost_decision.rejection_reasons)
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {
            "created": [],
            "skipped": reasons,
            "executionCostAssessment": execution_cost_payload,
        }

    equity = Decimal(str(state.equity))
    available_cash = max(Decimal("0"), Decimal(str(state.cash_balance)))
    guardrails = entry_guardrail_context(
        db,
        trader_id,
        candidate_risk_percent=planned_risk_percent,
        settings=settings,
    )
    if guardrails["blocked"]:
        reasons = guardrails.get("blockReasons") or ["Account entry guardrail is active."]
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {"created": [], "skipped": reasons, "entryGuardrails": guardrails}
    guardrail_risk_cap = candidate_risk_percent * Decimal(str(guardrails.get("riskMultiplier", 1.0)))
    risk_percent = min(planned_risk_percent, guardrail_risk_cap)
    risk_budget = equity * (risk_percent / Decimal("100"))
    effective_risk_budget = risk_budget
    base_deployment_percent = target_margin_deployment_percent(candidate, settings)
    deployment_percent = base_deployment_percent
    target_margin_budget = equity * (deployment_percent / Decimal("100"))
    pending = pending_order_exposure(
        db,
        trader_id,
        risk_settings.maker_fee_rate,
        risk_settings.taker_fee_rate,
    )
    if pending.has_unpriced_order:
        reasons = ["Unpriced pending market order prevents safe capacity calculation."]
        mark_order_creation_skipped(db, trade_plan_id, reasons)
        return {"created": [], "skipped": reasons}
    available_cash = max(Decimal("0"), available_cash - pending.cash_required)
    fee_reserve_rate = max(risk_settings.maker_fee_rate, risk_settings.taker_fee_rate)
    cash_budget_cap = (
        available_cash / (Decimal("1") + (leverage * fee_reserve_rate))
        if available_cash > 0
        else Decimal("0")
    )
    minimum_entry_margin_percent = minimum_margin_deployment_percent(settings, candidate)
    minimum_entry_margin = equity * minimum_entry_margin_percent / Decimal("100")
    minimum_entry_margin_label = format(minimum_entry_margin_percent.normalize(), "f")
    hard_margin_budget = cash_budget_cap
    split_margin_floor = minimum_entry_margin
    target_margin_budget = min(max(target_margin_budget, split_margin_floor), hard_margin_budget)
    eligible_entries = [entry for entry in plan.entries if entry.price > 0 and entry.weight > 0]
    eligible_entry_indexes = [
        index for index, entry in enumerate(plan.entries) if entry.price > 0 and entry.weight > 0
    ]
    entry_margin_budgets = dict(
        zip(
            eligible_entry_indexes,
            planned_entry_margin_budgets(
                entries=eligible_entries,
                target_margin_budget=target_margin_budget,
                total_weight=total_weight,
                first_entry_floor_budget=minimum_entry_margin,
            ),
            strict=True,
        )
    )
    slippage_rate = Decimal(str(settings.paper_slippage_rate))
    created: list[dict] = []
    skipped: list[str] = []
    actual_margin_used = Decimal("0")
    total_planned_risk = Decimal("0")

    for index, entry in enumerate(plan.entries):
        if is_donchian and index > 0:
            continue
        entry_label = "Donchian confirmation" if is_donchian else f"Entry {index + 1}"
        entry_price = Decimal(str(entry.price))
        if entry.weight <= 0:
            skipped.append(f"{entry_label} skipped: weight is not positive.")
            continue
        if entry_price <= 0:
            skipped.append(f"{entry_label} skipped: entry price is not positive.")
            continue
        if abs(entry_price - stop_loss) <= 0:
            skipped.append(f"{entry_label} skipped: stop distance is zero.")
            continue

        weight = Decimal(str(max(entry.weight, 0.0))) / total_weight
        target = plan.takeProfits[min(index, len(plan.takeProfits) - 1)] if plan.takeProfits else None
        use_market = not post_only and index == 0
        order_type = "market" if use_market else "limit"
        entry_fee_rate = risk_settings.taker_fee_rate if use_market else risk_settings.maker_fee_rate
        expected_entry_fill = entry_price * (
            Decimal("1") + slippage_rate if side == "long" and use_market
            else Decimal("1") - slippage_rate if side == "short" and use_market
            else Decimal("1")
        )
        expected_stop_fill = stop_loss * (
            Decimal("1") - slippage_rate if side == "long"
            else Decimal("1") + slippage_rate
        )
        loss_distance = (
            expected_entry_fill - expected_stop_fill
            if side == "long"
            else expected_stop_fill - expected_entry_fill
        )
        risk_per_unit = loss_distance + expected_entry_fill * entry_fee_rate + expected_stop_fill * risk_settings.taker_fee_rate
        if risk_per_unit <= 0:
            skipped.append(f"{entry_label} skipped: fee/slippage-adjusted risk is not positive.")
            continue
        requires_minimum_margin = not created
        minimum_margin_quantity = Decimal("0")
        rounded_minimum_margin = Decimal("0")
        if requires_minimum_margin:
            minimum_margin_quantity = (
                (minimum_entry_margin * leverage) / expected_entry_fill
            ).quantize(QUANTITY_STEP, rounding=ROUND_UP)
            rounded_minimum_margin = minimum_margin_quantity * expected_entry_fill / leverage
        allocated_risk = risk_budget * weight
        if requires_minimum_margin:
            minimum_entry_risk = minimum_margin_quantity * risk_per_unit
            effective_risk_budget = max(effective_risk_budget, minimum_entry_risk)
            allocated_risk = max(allocated_risk, minimum_entry_risk)
        risk_sized_quantity = allocated_risk / risk_per_unit
        remaining_margin_budget = max(Decimal("0"), hard_margin_budget - actual_margin_used)
        remaining_target_margin_budget = max(Decimal("0"), target_margin_budget - actual_margin_used)
        if requires_minimum_margin and remaining_margin_budget < rounded_minimum_margin:
            skipped.append(
                f"{entry_label} skipped: remaining account capacity is below the "
                f"{minimum_entry_margin_label}% entry margin floor."
            )
            continue
        planned_entry_margin_budget = min(
            entry_margin_budgets.get(index, Decimal("0")),
            remaining_target_margin_budget,
        )
        if requires_minimum_margin:
            planned_entry_margin_budget = max(planned_entry_margin_budget, rounded_minimum_margin)
        margin_cap = min(planned_entry_margin_budget, remaining_margin_budget)
        margin_sized_quantity = (margin_cap * leverage) / expected_entry_fill
        quantity = quantize_quantity(min(risk_sized_quantity, margin_sized_quantity))
        planned_risk = quantity * risk_per_unit
        tolerance = Decimal("1") + Decimal(str(getattr(settings, "paper_risk_budget_tolerance_percent", 5))) / Decimal("100")
        remaining_risk = max(Decimal("0"), effective_risk_budget * tolerance - total_planned_risk)
        if planned_risk > remaining_risk:
            quantity = min(quantity, quantize_quantity(remaining_risk / risk_per_unit))
            planned_risk = quantity * risk_per_unit
        if requires_minimum_margin and quantity < minimum_margin_quantity:
            skipped.append(
                f"{entry_label} skipped: risk-approved size is below the "
                f"{minimum_entry_margin_label}% entry margin floor."
            )
            continue
        if quantity < MIN_PAPER_QUANTITY:
            skipped.append(f"{entry_label} skipped: remaining risk budget is below paper minimum.")
            continue
        actual_margin = (quantity * expected_entry_fill) / leverage
        if actual_margin > remaining_margin_budget:
            skipped.append(
                f"{entry_label} skipped: remaining account capacity is below the "
                f"{minimum_entry_margin_label}% entry margin floor."
            )
            continue
        total_planned_risk += planned_risk
        actual_margin_used += actual_margin
        limit_price = None if use_market else entry_price
        estimated_entry_fee = expected_entry_fill * quantity * entry_fee_rate
        planned_notional = expected_entry_fill * quantity
        planned_margin = planned_notional / leverage
        effective_weight = planned_risk / risk_budget if risk_budget > 0 else Decimal("0")
        payload = {
            "paperOnly": True,
            "runId": run_id,
            "tradePlanId": trade_plan_id,
            "entryIndex": index,
            "entryWeight": float(weight),
            "effectiveEntryWeight": float(effective_weight),
            "entryReason": entry.reason,
            "plannedEntryPrice": float(entry_price),
            "plannedStopLoss": float(stop_loss),
            "riskPercent": float(risk_percent),
            "baseMarginDeploymentPercent": float(base_deployment_percent),
            "marginDeploymentPercent": float(deployment_percent),
            "minimumEntryMarginPercent": float(minimum_entry_margin_percent),
            "minimumEntryMarginRequired": requires_minimum_margin,
            "minimumEntryMarginSatisfied": not requires_minimum_margin or actual_margin >= minimum_entry_margin,
            "minimumEntryMarginWaivedForRiskCap": False,
            "plannedMargin": float(planned_margin),
            "plannedNotional": float(planned_notional),
            "actualPlannedMargin": float(actual_margin),
            "accountMarginPercent": float((actual_margin / equity) * Decimal("100")) if equity > 0 else 0.0,
            "notionalExposurePercent": float(((actual_margin * leverage) / equity) * Decimal("100")) if equity > 0 else 0.0,
            "riskBudget": float(effective_risk_budget),
            "approvedRiskBudget": float(risk_budget),
            "riskBudgetExpandedForMinimumEntry": effective_risk_budget > risk_budget,
            "riskBudgetExpansion": float(effective_risk_budget - risk_budget),
            "allocatedRiskBudget": float(allocated_risk),
            "plannedRisk": float(planned_risk),
            "riskPerUnit": float(risk_per_unit),
            "expectedEntryFill": float(expected_entry_fill),
            "expectedStopFill": float(expected_stop_fill),
            "entryGuardrails": guardrails,
            "slippageRate": float(slippage_rate),
            "estimatedEntryFee": float(estimated_entry_fee),
            **(
                {"executionCostAssessment": execution_cost_payload}
                if execution_cost_payload is not None
                else {}
            ),
            "candidateSetupType": candidate.setupType,
            "donchianContext": candidate.audit.get("donchianContext") if is_donchian else None,
            "dormantRetest": (
                {
                    "status": "DORMANT",
                    "entryIndex": 1,
                    "price": plan.entries[1].price,
                    "weight": plan.entries[1].weight,
                    "reason": plan.entries[1].reason,
                    "activationTtlSeconds": 1800,
                    "createdFromConfirmationOrder": True,
                }
                if is_donchian and len(plan.entries) > 1
                else None
            ),
            "holdingHorizon": plan.managementPlan.holdingHorizon.value if plan.managementPlan else None,
            "strategyFamily": plan.managementPlan.strategyFamily.value if plan.managementPlan else None,
            "managementPlan": plan.managementPlan.model_dump(mode="json") if plan.managementPlan else None,
            "orderIntent": candidate.orderIntent.model_dump() if candidate.orderIntent else None,
            "leveragePlan": candidate.leveragePlan.model_dump() if candidate.leveragePlan else None,
            "target": target.model_dump() if target else None,
            "takeProfits": [tp.model_dump() for tp in plan.takeProfits] if plan.takeProfits else None,
            "aiReviewId": ai_review_id,
            **review_payload_fields(review),
        }
        order = place_paper_order(
            db,
            trader_id=trader_id,
            symbol=symbol,
            side=side,
            quantity=quantity,
            leverage=leverage,
            order_type=order_type,
            limit_price=limit_price,
            take_profit_price=target.price if target else None,
            stop_loss_price=stop_loss,
            fee_type="taker" if use_market else "maker",
            payload=payload,
        )
        create_trade_event(
            db,
            trader_id=trader_id,
            symbol=symbol,
            event_type="paper_order_created",
            order_id=order.id,
            price=entry_price,
            quantity=quantity,
            payload={
                "paperOnly": True,
                "runId": run_id,
                "tradePlanId": trade_plan_id,
                "entryIndex": index,
                "orderType": order_type,
                "side": side,
                "leverage": leverage,
                "limitPrice": limit_price,
                "reason": entry.reason,
                "source": "trade_plan",
                "donchianContext": candidate.audit.get("donchianContext") if is_donchian else None,
                "aiReviewId": ai_review_id,
                "holdingHorizon": plan.managementPlan.holdingHorizon.value if plan.managementPlan else None,
                "strategyFamily": plan.managementPlan.strategyFamily.value if plan.managementPlan else None,
                "managementPlan": plan.managementPlan.model_dump(mode="json") if plan.managementPlan else None,
                **review_payload_fields(review),
            },
        )
        created.append(serialize_record(order))

    if not created:
        mark_order_creation_skipped(db, trade_plan_id, skipped)

    return {
        "created": created,
        "skipped": skipped,
        "riskBudget": float(effective_risk_budget),
        "approvedRiskBudget": float(risk_budget),
        "riskBudgetExpandedForMinimumEntry": effective_risk_budget > risk_budget,
        "riskBudgetExpansion": float(effective_risk_budget - risk_budget),
        "riskPercent": float(risk_percent),
        "effectiveRiskPercent": float((effective_risk_budget / equity) * Decimal("100")) if equity > 0 else 0.0,
        "plannedRisk": float(total_planned_risk),
        "riskBudgetUtilizationPercent": float(total_planned_risk / effective_risk_budget * Decimal("100")) if effective_risk_budget > 0 else 0.0,
        "entryGuardrails": guardrails,
        "baseMarginDeploymentPercent": float(base_deployment_percent),
        "marginDeploymentPercent": float(deployment_percent),
        "minimumEntryMarginPercent": float(minimum_entry_margin_percent),
        "actualMarginDeploymentPercent": float((actual_margin_used / equity) * Decimal("100")) if equity > 0 else 0.0,
        "targetMarginBudget": float(target_margin_budget),
        "actualMarginUsed": float(actual_margin_used),
        "feeReserveRate": float(fee_reserve_rate),
        "leverage": float(leverage),
        "feeRates": {
            "maker": float(risk_settings.maker_fee_rate),
            "taker": float(risk_settings.taker_fee_rate),
        },
        **(
            {"executionCostAssessment": execution_cost_payload}
            if execution_cost_payload is not None
            else {}
        ),
    }
