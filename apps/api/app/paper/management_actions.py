from decimal import Decimal, ROUND_DOWN
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import PaperPositionRecord, TraderStateRecord
from app.paper.engine import PaperEngineResult, append_event, place_paper_order
from app.paper.pending_exposure import pending_order_exposure
from app.paper.repositories import create_trade_event, ensure_risk_settings
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
    if state.equity <= 0:
        return None
    risk_settings = ensure_risk_settings(db, position.trader_id or "", position.symbol)
    pending = pending_order_exposure(
        db,
        position.trader_id or "",
        risk_settings.maker_fee_rate,
        risk_settings.taker_fee_rate,
    )
    if pending.has_unpriced_order:
        return None
    available_cash = max(Decimal("0"), state.cash_balance - pending.cash_required)
    add_margin = min(base_margin * quantity_fraction, available_cash * Decimal("0.70"))
    quantity = _quantity_from_margin(price, add_margin, position.leverage)
    if quantity < MIN_ADD_QUANTITY:
        return None
    actual_notional = quantity * price
    actual_margin = actual_notional / position.leverage
    estimated_entry_fee = actual_notional * risk_settings.maker_fee_rate
    if actual_margin + estimated_entry_fee > available_cash:
        return None
    projected_margin = state.margin_used + pending.margin + actual_margin
    projected_notional = (
        _open_position_notional(db, trader_id=position.trader_id or "", mark_price=mark_price)
        + pending.notional
        + actual_notional
    )

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
            "plannedMargin": float(actual_margin),
            "plannedNotional": float(actual_notional),
            "estimatedEntryFee": float(estimated_entry_fee),
            "accountMarginPercent": float((actual_margin / state.equity) * Decimal("100")) if state.equity > 0 else 0.0,
            "projectedAccountMarginPercent": float((projected_margin / state.equity) * Decimal("100")),
            "projectedAccountNotionalPercent": float((projected_notional / state.equity) * Decimal("100")),
            "notionalExposurePercent": float((actual_notional / state.equity) * Decimal("100")) if state.equity > 0 else 0.0,
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
            "plannedMargin": actual_margin,
            "parentPositionId": position.id,
        },
    )
    append_event(result, event)
    return serialize_record(order)
