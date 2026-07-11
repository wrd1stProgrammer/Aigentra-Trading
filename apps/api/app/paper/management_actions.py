from decimal import Decimal, ROUND_DOWN
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import PaperOrderRecord, PaperPositionRecord, TraderStateRecord
from app.paper.engine import PaperEngineResult, append_event, place_paper_order
from app.paper.repositories import create_trade_event
from app.paper.sizing import SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT, SERVICE_MAX_NOTIONAL_EXPOSURE_PERCENT
from app.repositories import serialize_record
from app.traders.models import ManagementAction


MIN_ADD_QUANTITY = Decimal("0.001")
QUANTITY_STEP = Decimal("0.001")
MIN_MANAGEMENT_ADD_FRACTION = Decimal("0.10")
MAX_MANAGEMENT_ADD_FRACTION = Decimal("1.00")


def _clamp_fraction(value: Optional[float]) -> Decimal:
    if value is None:
        return Decimal("0.35")
    return max(MIN_MANAGEMENT_ADD_FRACTION, min(Decimal(str(value)), MAX_MANAGEMENT_ADD_FRACTION))


def _quantity_from_margin(price: Decimal, margin: Decimal, leverage: Decimal) -> Decimal:
    if price <= 0 or margin <= 0 or leverage <= 0:
        return Decimal("0")
    return ((margin * leverage) / price).quantize(QUANTITY_STEP, rounding=ROUND_DOWN)


def _pending_order_exposure(db: Session, *, trader_id: str, mark_price: Decimal) -> tuple[Decimal, Decimal]:
    orders = db.execute(
        select(PaperOrderRecord).where(
            PaperOrderRecord.trader_id == trader_id,
            PaperOrderRecord.status == "open",
        )
    ).scalars().all()
    margin_total = Decimal("0")
    notional_total = Decimal("0")
    for order in orders:
        price = order.limit_price or mark_price
        if price <= 0 or order.leverage <= 0:
            continue
        notional = abs(order.quantity * price)
        margin_total += notional / order.leverage
        notional_total += notional
    return margin_total, notional_total


def _open_position_notional(db: Session, *, trader_id: str, mark_price: Decimal) -> Decimal:
    positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.status == "open",
        )
    ).scalars().all()
    return sum(
        (abs(position.notional) if position.notional else abs(position.quantity * mark_price) for position in positions),
        Decimal("0"),
    )


def create_position_add_order(
    db: Session,
    *,
    state: TraderStateRecord,
    position: PaperPositionRecord,
    action: ManagementAction,
    mark_price: Decimal,
    reason: str,
    result: Optional[PaperEngineResult],
) -> Optional[dict[str, Any]]:
    if position.status != "open":
        return None

    action_type = action.type.upper()
    if action_type not in {"ADD_TO_POSITION", "PYRAMID_POSITION"}:
        return None
    price = Decimal(str(action.price)) if action.price is not None and action.price > 0 else mark_price
    normalized_side = (position.side or "").upper()
    is_losing = (
        normalized_side == "LONG" and mark_price < position.entry_price
    ) or (
        normalized_side == "SHORT" and mark_price > position.entry_price
    )
    would_average_down = (
        normalized_side == "LONG" and price < position.entry_price
    ) or (
        normalized_side == "SHORT" and price > position.entry_price
    )
    if is_losing or would_average_down:
        return None

    quantity_fraction = _clamp_fraction(action.quantityFraction)
    base_margin = max(position.margin, Decimal("1"))
    available_cash = max(Decimal("0"), state.cash_balance)
    add_margin = min(base_margin * quantity_fraction, available_cash * Decimal("0.70"))
    if state.equity <= 0:
        return None
    configured_cap = Decimal(str(get_settings().paper_max_margin_deployment_percent))
    margin_cap_percent = min(SERVICE_MAX_MARGIN_DEPLOYMENT_PERCENT, max(Decimal("0"), configured_cap))
    pending_margin, pending_notional = _pending_order_exposure(
        db,
        trader_id=position.trader_id or "",
        mark_price=mark_price,
    )
    projected_margin = state.margin_used + pending_margin + add_margin
    maximum_margin = state.equity * margin_cap_percent / Decimal("100")
    if projected_margin > maximum_margin:
        return None
    add_notional = add_margin * position.leverage
    projected_notional = (
        _open_position_notional(db, trader_id=position.trader_id or "", mark_price=mark_price)
        + pending_notional
        + add_notional
    )
    maximum_notional = state.equity * SERVICE_MAX_NOTIONAL_EXPOSURE_PERCENT / Decimal("100")
    if projected_notional > maximum_notional:
        return None
    quantity = _quantity_from_margin(price, add_margin, position.leverage)
    if quantity < MIN_ADD_QUANTITY:
        return None

    order = place_paper_order(
        db,
        trader_id=position.trader_id or "",
        symbol=position.symbol or "",
        side=position.side,
        quantity=quantity,
        leverage=position.leverage,
        order_type="limit",
        limit_price=price,
        take_profit_price=position.take_profit_price,
        stop_loss_price=position.stop_loss_price,
        fee_type="maker",
        payload={
            "paperOnly": True,
            "source": "position_management_ai",
            "managementAction": action_type,
            "parentPositionId": position.id,
            "quantityFraction": float(quantity_fraction),
            "plannedMargin": float(add_margin),
            "accountMarginPercent": float((add_margin / state.equity) * Decimal("100")) if state.equity > 0 else 0.0,
            "projectedAccountMarginPercent": float((projected_margin / state.equity) * Decimal("100")),
            "projectedAccountNotionalPercent": float((projected_notional / state.equity) * Decimal("100")),
            "notionalExposurePercent": float(((add_margin * position.leverage) / state.equity) * Decimal("100")) if state.equity > 0 else 0.0,
            "reason": reason,
        },
    )
    event = create_trade_event(
        db,
        position.trader_id or "",
        position.symbol or "",
        "position_add_order_created_by_ai" if action_type == "ADD_TO_POSITION" else "position_pyramid_order_created_by_ai",
        order_id=order.id,
        position_id=position.id,
        price=price,
        quantity=quantity,
        payload={
            "paperOnly": True,
            "source": "position_management_ai",
            "managementAction": action_type,
            "reason": reason,
            "quantityFraction": quantity_fraction,
            "plannedMargin": add_margin,
            "parentPositionId": position.id,
        },
    )
    append_event(result, event)
    return serialize_record(order)
