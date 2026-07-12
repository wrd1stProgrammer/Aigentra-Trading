from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord
from app.repositories import from_json


@dataclass(frozen=True, slots=True)
class PendingOrderExposure:
    margin: Decimal
    notional: Decimal
    cash_required: Decimal
    has_unpriced_order: bool


def _payload_decimal(value: Any) -> Decimal:
    try:
        parsed = Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")
    return parsed if parsed.is_finite() else Decimal("0")


def pending_order_exposure(
    db: Session,
    trader_id: str,
    maker_fee_rate: Decimal,
    taker_fee_rate: Decimal,
) -> PendingOrderExposure:
    orders = db.execute(
        select(PaperOrderRecord).where(
            PaperOrderRecord.trader_id == trader_id,
            PaperOrderRecord.status == "open",
        )
    ).scalars().all()
    margin = Decimal("0")
    notional = Decimal("0")
    cash_required = Decimal("0")
    has_unpriced_order = False
    for order in orders:
        fee_rate = maker_fee_rate if order.fee_type == "maker" else taker_fee_rate
        if order.limit_price is not None and order.limit_price > 0 and order.leverage > 0:
            order_notional = abs(order.quantity * order.limit_price)
            order_margin = order_notional / order.leverage
            order_fee = order_notional * fee_rate
            notional += order_notional
            margin += order_margin
            cash_required += order_margin + order_fee
            continue
        payload = from_json(order.payload_json) or {}
        payload = payload if isinstance(payload, dict) else {}
        payload_notional = _payload_decimal(payload.get("plannedNotional"))
        payload_margin = _payload_decimal(payload.get("plannedMargin"))
        payload_fee = _payload_decimal(payload.get("estimatedEntryFee"))
        price = order.limit_price or _payload_decimal(payload.get("expectedEntryFill"))
        priced_notional = abs(order.quantity * price) if price > 0 else Decimal("0")
        order_notional = max(payload_notional, priced_notional, abs(order.notional))
        if order_notional <= 0 or order.leverage <= 0:
            has_unpriced_order = True
            continue
        order_margin = max(payload_margin, order_notional / order.leverage)
        order_fee = max(payload_fee, order_notional * fee_rate)
        notional += order_notional
        margin += order_margin
        cash_required += order_margin + order_fee
    return PendingOrderExposure(
        margin=margin,
        notional=notional,
        cash_required=cash_required,
        has_unpriced_order=has_unpriced_order,
    )
