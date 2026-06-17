from decimal import Decimal, InvalidOperation, ROUND_DOWN
from collections import defaultdict
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord, PaperPositionRecord
from app.paper.engine import place_paper_order
from app.paper.repositories import create_trade_event, ensure_trader_state, upsert_risk_settings
from app.paper.review_payload import review_payload_fields
from app.repositories import serialize_record
from app.traders.models import TradeCandidate, TradePlan, TradeReviewResult


MIN_PAPER_QUANTITY = Decimal("0.001")
QUANTITY_STEP = Decimal("0.001")
MIN_SERVICE_MARGIN_DEPLOYMENT_PERCENT = Decimal("10")
MAX_SERVICE_MARGIN_DEPLOYMENT_PERCENT = Decimal("100")


def decimal_or_none(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return decimal if decimal.is_finite() else None


def quantize_quantity(quantity: Decimal) -> Decimal:
    return quantity.quantize(QUANTITY_STEP, rounding=ROUND_DOWN)


def decimal_setting(settings: Any, name: str, default: str) -> Decimal:
    return Decimal(str(getattr(settings, name, default)))


def clamp_decimal(value: Decimal, minimum: Decimal, maximum: Decimal) -> Decimal:
    return max(minimum, min(value, maximum))


def target_margin_deployment_percent(candidate: TradeCandidate, settings: Any) -> Decimal:
    configured_minimum = decimal_setting(settings, "paper_min_margin_deployment_percent", "10")
    minimum = max(
        MIN_SERVICE_MARGIN_DEPLOYMENT_PERCENT,
        clamp_decimal(configured_minimum, Decimal("0"), MAX_SERVICE_MARGIN_DEPLOYMENT_PERCENT),
    )
    configured_max = clamp_decimal(
        decimal_setting(settings, "paper_max_margin_deployment_percent", "100"),
        Decimal("0"),
        MAX_SERVICE_MARGIN_DEPLOYMENT_PERCENT,
    )
    maximum = max(minimum, configured_max)
    score = clamp_decimal(Decimal(str(candidate.setupScore or 0)), Decimal("0"), Decimal("100"))
    if score <= Decimal("50"):
        target = minimum
    else:
        target = minimum + ((score - Decimal("50")) / Decimal("50")) * (maximum - minimum)
    return clamp_decimal(target, minimum, maximum)


def sync_default_paper_settings(db: Session, trader_id: str, symbol: str, settings: Any):
    risk_settings = upsert_risk_settings(
        db,
        trader_id=trader_id,
        symbol=symbol,
        initial_equity=Decimal(str(settings.paper_default_equity)),
        max_leverage=Decimal(str(settings.paper_max_leverage)),
        maker_fee_rate=Decimal(str(settings.paper_maker_fee_rate)),
        taker_fee_rate=Decimal(str(settings.paper_taker_fee_rate)),
    )
    state = ensure_trader_state(db, trader_id, risk_settings.initial_equity)
    return state, risk_settings


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
) -> dict:
    if plan.status != "PAPER_TRADING_PENDING" or not plan.side or not plan.entries or plan.stopLoss is None:
        return {"created": [], "skipped": ["Trade plan is not orderable."]}

    state, risk_settings = sync_default_paper_settings(db, trader_id, symbol, settings)
    side = plan.side.lower()
    stop_loss = Decimal(str(plan.stopLoss))
    risk_percent = Decimal(str(plan.riskPercent or candidate.riskPercent or 0))
    if risk_percent <= 0:
        return {"created": [], "skipped": ["Risk percent is not positive."]}

    leverage = Decimal(str(plan.leverage or 1))
    leverage = max(Decimal("1"), min(leverage, risk_settings.max_leverage))
    total_weight = sum(Decimal(str(max(entry.weight, 0.0))) for entry in plan.entries)
    if total_weight <= 0:
        return {"created": [], "skipped": ["Entry weights are not positive."]}

    equity = Decimal(str(state.equity))
    available_cash = max(Decimal("0"), Decimal(str(state.cash_balance)))
    risk_budget = equity * (risk_percent / Decimal("100"))
    deployment_percent = target_margin_deployment_percent(candidate, settings)
    target_margin_budget = equity * (deployment_percent / Decimal("100"))
    fee_reserve_rate = max(risk_settings.maker_fee_rate, risk_settings.taker_fee_rate)
    cash_budget_cap = (
        available_cash / (Decimal("1") + (leverage * fee_reserve_rate))
        if available_cash > 0
        else Decimal("0")
    )
    target_margin_budget = min(target_margin_budget, cash_budget_cap)
    slippage_rate = Decimal(str(settings.paper_slippage_rate))
    created: list[dict] = []
    skipped: list[str] = []
    actual_margin_used = Decimal("0")

    for index, entry in enumerate(plan.entries):
        entry_price = Decimal(str(entry.price))
        distance_to_stop = abs(entry_price - stop_loss)
        if distance_to_stop <= 0:
            skipped.append(f"Entry {index + 1} skipped: stop distance is zero.")
            continue

        weight = Decimal(str(max(entry.weight, 0.0))) / total_weight
        planned_margin = target_margin_budget * weight
        planned_notional = planned_margin * leverage
        quantity = quantize_quantity(planned_notional / entry_price)
        if quantity < MIN_PAPER_QUANTITY:
            skipped.append(f"Entry {index + 1} skipped: quantity below paper minimum.")
            continue
        actual_margin = (quantity * entry_price) / leverage
        actual_margin_used += actual_margin

        target = plan.takeProfits[min(index, len(plan.takeProfits) - 1)] if plan.takeProfits else None
        post_only = candidate.orderIntent.postOnly if candidate.orderIntent else True
        use_market = not post_only and index == 0
        order_type = "market" if use_market else "limit"
        limit_price = None if use_market else entry_price
        estimated_entry_fee = entry_price * quantity * (
            risk_settings.taker_fee_rate if use_market else risk_settings.maker_fee_rate
        )
        payload = {
            "paperOnly": True,
            "runId": run_id,
            "tradePlanId": trade_plan_id,
            "entryIndex": index,
            "entryWeight": float(weight),
            "entryReason": entry.reason,
            "plannedEntryPrice": float(entry_price),
            "plannedStopLoss": float(stop_loss),
            "riskPercent": float(risk_percent),
            "marginDeploymentPercent": float(deployment_percent),
            "plannedMargin": float(planned_margin),
            "plannedNotional": float(planned_notional),
            "actualPlannedMargin": float(actual_margin),
            "accountMarginPercent": float((actual_margin / equity) * Decimal("100")) if equity > 0 else 0.0,
            "notionalExposurePercent": float(((actual_margin * leverage) / equity) * Decimal("100")) if equity > 0 else 0.0,
            "riskBudget": float(risk_budget),
            "slippageRate": float(slippage_rate),
            "estimatedEntryFee": float(estimated_entry_fee),
            "candidateSetupType": candidate.setupType,
            "orderIntent": candidate.orderIntent.model_dump() if candidate.orderIntent else None,
            "leveragePlan": candidate.leveragePlan.model_dump() if candidate.leveragePlan else None,
            "target": target.model_dump() if target else None,
            "takeProfits": [tp.model_dump() for tp in plan.takeProfits] if plan.takeProfits else None,
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
                **review_payload_fields(review),
            },
        )
        created.append(serialize_record(order))

    return {
        "created": created,
        "skipped": skipped,
        "riskBudget": float(risk_budget),
        "riskPercent": float(risk_percent),
        "marginDeploymentPercent": float(deployment_percent),
        "actualMarginDeploymentPercent": float((actual_margin_used / equity) * Decimal("100")) if equity > 0 else 0.0,
        "targetMarginBudget": float(target_margin_budget),
        "actualMarginUsed": float(actual_margin_used),
        "feeReserveRate": float(fee_reserve_rate),
        "leverage": float(leverage),
        "feeRates": {
            "maker": float(risk_settings.maker_fee_rate),
            "taker": float(risk_settings.taker_fee_rate),
        },
    }
