from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional, Union

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import PaperOrderRecord, PaperPositionRecord, TraderStateRecord, utc_now
from app.paper.holding_policy import trader_holding_policy
from app.paper.repositories import (
    create_equity_snapshot_if_needed,
    create_paper_order,
    create_trade_event,
    ensure_risk_settings,
    ensure_trader_state,
    list_open_orders,
    list_open_positions,
    normalize_symbol,
    normalize_trader_id,
    to_decimal,
)


@dataclass(frozen=True)
class Candle:
    symbol: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    timestamp: Optional[datetime] = None

    @classmethod
    def from_mapping(cls, symbol: str, data: dict[str, Any]) -> "Candle":
        return cls(
            symbol=normalize_symbol(symbol),
            open=to_decimal(data["open"], "open"),
            high=to_decimal(data["high"], "high"),
            low=to_decimal(data["low"], "low"),
            close=to_decimal(data["close"], "close"),
            timestamp=data.get("timestamp") or data.get("time") or data.get("candle_time"),
        )


@dataclass
class PaperEngineResult:
    filled_orders: list[PaperOrderRecord] = field(default_factory=list)
    closed_positions: list[PaperPositionRecord] = field(default_factory=list)
    rejected_orders: list[PaperOrderRecord] = field(default_factory=list)
    events: list[Any] = field(default_factory=list)
    snapshot: Optional[Any] = None


def append_event(result: Optional[PaperEngineResult], event: Any) -> None:
    if result is not None:
        result.events.append(event)


def place_paper_order(
    db: Session,
    trader_id: str,
    symbol: str,
    side: str,
    quantity: Any,
    leverage: Any = Decimal("1"),
    order_type: str = "market",
    limit_price: Optional[Any] = None,
    take_profit_price: Optional[Any] = None,
    stop_loss_price: Optional[Any] = None,
    fee_type: Optional[str] = None,
    payload: Optional[dict] = None,
) -> PaperOrderRecord:
    settings = ensure_risk_settings(db, trader_id, symbol)
    ensure_trader_state(db, trader_id, settings.initial_equity)
    return create_paper_order(
        db=db,
        trader_id=trader_id,
        symbol=symbol,
        side=side,
        quantity=quantity,
        leverage=leverage,
        order_type=order_type,
        limit_price=limit_price,
        take_profit_price=take_profit_price,
        stop_loss_price=stop_loss_price,
        fee_type=fee_type,
        payload=payload,
    )


def cancel_paper_order(
    db: Session,
    order: PaperOrderRecord,
    reason: str,
    result: Optional[PaperEngineResult] = None,
) -> Any:
    if order.status != "open":
        return None
    order.status = "canceled"
    order.error_message = reason
    order.updated_at = utc_now()
    event = create_trade_event(
        db,
        order.trader_id or "",
        order.symbol or "",
        "order_canceled_by_ai",
        order_id=order.id,
        price=order.limit_price or order.filled_price,
        quantity=order.quantity,
        payload={"paperOnly": True, "reason": reason, "source": "position_management_ai"},
    )
    append_event(result, event)
    return event


def update_paper_order_limit(
    db: Session,
    order: PaperOrderRecord,
    new_limit_price: Any,
    reason: str,
    result: Optional[PaperEngineResult] = None,
) -> Any:
    if order.status != "open" or order.order_type != "limit":
        return None
    new_price = to_decimal(new_limit_price, "new_limit_price")
    previous_price = order.limit_price
    order.limit_price = new_price
    order.updated_at = utc_now()
    event = create_trade_event(
        db,
        order.trader_id or "",
        order.symbol or "",
        "order_adjusted_by_ai",
        order_id=order.id,
        price=new_price,
        quantity=order.quantity,
        payload={
            "paperOnly": True,
            "reason": reason,
            "previousLimitPrice": previous_price,
            "newLimitPrice": new_price,
            "source": "position_management_ai",
        },
    )
    append_event(result, event)
    return event


def update_position_stop(
    db: Session,
    position: PaperPositionRecord,
    new_stop_price: Any,
    reason: str,
    result: Optional[PaperEngineResult] = None,
) -> Any:
    if position.status != "open":
        return None
    new_stop = to_decimal(new_stop_price, "new_stop_price")
    previous_stop = position.stop_loss_price
    if previous_stop is not None:
        if position.side == "long" and new_stop <= previous_stop:
            return None
        if position.side == "short" and new_stop >= previous_stop:
            return None
    position.stop_loss_price = new_stop
    position.updated_at = utc_now()
    event = create_trade_event(
        db,
        position.trader_id or "",
        position.symbol or "",
        "stop_updated_by_ai",
        order_id=position.order_id,
        position_id=position.id,
        price=new_stop,
        quantity=position.quantity,
        payload={
            "paperOnly": True,
            "reason": reason,
            "previousStop": previous_stop,
            "newStop": new_stop,
            "source": "position_management_ai",
        },
    )
    append_event(result, event)
    return event


def close_position_by_management(
    db: Session,
    state: TraderStateRecord,
    position: PaperPositionRecord,
    exit_price: Any,
    candle: Union[Candle, dict[str, Any]],
    reason: str,
    result: Optional[PaperEngineResult] = None,
) -> Any:
    parsed_candle = candle if isinstance(candle, Candle) else Candle.from_mapping(position.symbol or "", candle)
    local_result = result or PaperEngineResult()
    _close_position(db, state, position, to_decimal(exit_price, "exit_price"), reason, parsed_candle, local_result)
    return local_result.events[-1] if local_result.events else None


def reduce_position_by_management(
    db: Session,
    state: TraderStateRecord,
    position: PaperPositionRecord,
    exit_price: Any,
    quantity_fraction: Any,
    candle: Union[Candle, dict[str, Any]],
    reason: str,
    result: Optional[PaperEngineResult] = None,
) -> Any:
    if position.status != "open":
        return None
    fraction = to_decimal(quantity_fraction, "quantity_fraction")
    fraction = max(Decimal("0"), min(fraction, Decimal("1")))
    if fraction <= 0:
        return None
    if fraction >= Decimal("0.999"):
        return close_position_by_management(db, state, position, exit_price, candle, reason, result)

    parsed_candle = candle if isinstance(candle, Candle) else Candle.from_mapping(position.symbol or "", candle)
    price = to_decimal(exit_price, "exit_price")
    close_qty = position.quantity * fraction
    if close_qty <= 0:
        return None
    remaining_fraction = Decimal("1") - fraction
    settings = ensure_risk_settings(db, position.trader_id or "", position.symbol)
    gross_pnl = (price - position.entry_price) * close_qty if position.side == "long" else (position.entry_price - price) * close_qty
    exit_fee = price * close_qty * settings.taker_fee_rate
    prorated_entry_fee = position.entry_fee * fraction
    net_pnl = gross_pnl - prorated_entry_fee - exit_fee
    released_margin = position.margin * fraction

    position.quantity -= close_qty
    position.notional *= remaining_fraction
    position.margin *= remaining_fraction
    position.entry_fee *= remaining_fraction
    position.realized_pnl += net_pnl
    position.updated_at = utc_now()

    state.cash_balance += released_margin + gross_pnl - exit_fee
    state.realized_pnl += net_pnl
    state.total_fees += exit_fee
    state.updated_at = utc_now()

    event = create_trade_event(
        db,
        position.trader_id or "",
        position.symbol or "",
        "position_reduced_by_ai",
        order_id=position.order_id,
        position_id=position.id,
        price=price,
        quantity=close_qty,
        fee=exit_fee,
        realized_pnl=net_pnl,
        equity=state.equity,
        payload={
            "paperOnly": True,
            "reason": reason,
            "side": position.side,
            "entryPrice": position.entry_price,
            "averageEntryPrice": position.entry_price,
            "exitPrice": price,
            "leverage": position.leverage,
            "stopLossPrice": position.stop_loss_price,
            "takeProfitPrice": position.take_profit_price,
            "grossPnl": gross_pnl,
            "quantityFraction": fraction,
            "source": "position_management_ai",
        },
    )
    append_event(result, event)
    _mark_to_market(db, state, position.trader_id or "", position.symbol or parsed_candle.symbol, parsed_candle.close)
    return event


def process_candle(db: Session, trader_id: str, symbol: str, candle: Union[Candle, dict[str, Any]]) -> PaperEngineResult:
    clean_trader_id = normalize_trader_id(trader_id)
    parsed_candle = candle if isinstance(candle, Candle) else Candle.from_mapping(symbol, candle)
    clean_symbol = normalize_symbol(parsed_candle.symbol)
    state = ensure_trader_state(db, clean_trader_id)
    result = PaperEngineResult()

    for order in list_open_orders(db, clean_trader_id, clean_symbol):
        fill_price = _fill_price(order, parsed_candle)
        if fill_price is None:
            continue
        if _fill_order(db, state, order, fill_price, parsed_candle, result):
            result.filled_orders.append(order)
        else:
            result.rejected_orders.append(order)

    for position in list_open_positions(db, clean_trader_id, clean_symbol):
        exit_price, reason = _exit_signal(position, parsed_candle)
        if exit_price is None:
            exit_price, reason = _management_exit_signal(position, parsed_candle)
        if exit_price is not None:
            _close_position(db, state, position, exit_price, reason, parsed_candle, result)
            result.closed_positions.append(position)
            continue
        _maybe_move_stop_to_breakeven(db, position, parsed_candle, result)

    _mark_to_market(db, state, clean_trader_id, clean_symbol, parsed_candle.close)
    settings = get_settings()
    force_snapshot = bool(result.filled_orders or result.closed_positions or result.rejected_orders or result.events)
    result.snapshot = create_equity_snapshot_if_needed(
        db,
        state,
        clean_symbol,
        candle_time=parsed_candle.timestamp,
        payload={"open": parsed_candle.open, "high": parsed_candle.high, "low": parsed_candle.low, "close": parsed_candle.close},
        interval_seconds=settings.equity_snapshot_interval_seconds,
        min_change_percent=settings.equity_snapshot_min_change_percent,
        force=force_snapshot,
    )
    db.flush()
    return result


def _fill_price(order: PaperOrderRecord, candle: Candle) -> Optional[Decimal]:
    if order.order_type == "market":
        return candle.open
    if order.limit_price is None:
        return None
    return order.limit_price if candle.low <= order.limit_price <= candle.high else None


def _fill_order(
    db: Session,
    state: TraderStateRecord,
    order: PaperOrderRecord,
    fill_price: Decimal,
    candle: Candle,
    result: PaperEngineResult,
) -> bool:
    settings = ensure_risk_settings(db, order.trader_id or "", order.symbol)
    notional = order.quantity * fill_price
    if settings.max_notional is not None and notional > settings.max_notional:
        order.status = "rejected"
        order.error_message = "Paper order rejected: notional exceeds risk settings."
        event = create_trade_event(
            db,
            order.trader_id or "",
            order.symbol or candle.symbol,
            "order_rejected",
            order_id=order.id,
            price=fill_price,
            quantity=order.quantity,
            payload={"reason": "max_notional"},
        )
        result.events.append(event)
        return False

    fee_rate = settings.maker_fee_rate if order.fee_type == "maker" else settings.taker_fee_rate
    margin = notional / order.leverage
    fee = notional * fee_rate
    if state.cash_balance < margin + fee:
        order.status = "rejected"
        order.error_message = "Paper order rejected: insufficient paper cash balance."
        event = create_trade_event(
            db,
            order.trader_id or "",
            order.symbol or candle.symbol,
            "order_rejected",
            order_id=order.id,
            price=fill_price,
            quantity=order.quantity,
            payload={"reason": "insufficient_cash"},
        )
        result.events.append(event)
        return False

    # Check for existing open position to merge (Binance futures style)
    existing_position = db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id == order.trader_id,
            PaperPositionRecord.symbol == order.symbol,
            PaperPositionRecord.side == order.side,
            PaperPositionRecord.status == "open",
        )
    ).scalar_one_or_none()

    if existing_position:
        # Merge order into existing position
        new_qty = existing_position.quantity + order.quantity
        new_notional = existing_position.notional + notional
        # Weighted entry price
        new_entry_price = new_notional / new_qty
        
        # Update existing position
        existing_position.quantity = new_qty
        existing_position.entry_price = new_entry_price
        existing_position.notional = new_notional
        existing_position.margin += margin
        existing_position.entry_fee += fee
        
        # If the order specifies a new take_profit or stop_loss, update them. Otherwise keep existing.
        if order.take_profit_price is not None:
            existing_position.take_profit_price = order.take_profit_price
        if order.stop_loss_price is not None:
            existing_position.stop_loss_price = order.stop_loss_price
            
        existing_position.updated_at = utc_now()
        position = existing_position
    else:
        position = PaperPositionRecord(
            order_id=order.id,
            trader_id=order.trader_id,
            symbol=order.symbol,
            status="open",
            side=order.side,
            quantity=order.quantity,
            entry_price=fill_price,
            leverage=order.leverage,
            notional=notional,
            margin=margin,
            entry_fee=fee,
            unrealized_pnl=Decimal("0"),
            realized_pnl=Decimal("0"),
            take_profit_price=order.take_profit_price,
            stop_loss_price=order.stop_loss_price,
            payload_json=order.payload_json,
            opened_at=candle.timestamp or utc_now(),
        )
        db.add(position)
        db.flush()

    order.status = "filled"
    order.filled_price = fill_price
    order.filled_quantity = order.quantity
    order.notional = notional
    order.margin = margin
    order.fee = fee
    order.position_id = position.id
    order.filled_at = candle.timestamp or utc_now()
    order.updated_at = utc_now()

    state.cash_balance -= margin + fee
    state.margin_used += margin
    state.total_fees += fee
    state.updated_at = utc_now()

    event = create_trade_event(
        db,
        order.trader_id or "",
        order.symbol or candle.symbol,
        "order_filled",
        order_id=order.id,
        position_id=position.id,
        price=fill_price,
        quantity=order.quantity,
        fee=fee,
        equity=state.equity,
        payload={"paperOnly": True, "feeType": order.fee_type, "leverage": order.leverage},
    )
    result.events.append(event)
    return True


def _exit_signal(position: PaperPositionRecord, candle: Candle) -> tuple[Optional[Decimal], Optional[str]]:
    if position.side == "long":
        if position.stop_loss_price is not None and candle.low <= position.stop_loss_price:
            return position.stop_loss_price, "stop_loss"
        if position.take_profit_price is not None and candle.high >= position.take_profit_price:
            return position.take_profit_price, "take_profit"
    if position.side == "short":
        if position.stop_loss_price is not None and candle.high >= position.stop_loss_price:
            return position.stop_loss_price, "stop_loss"
        if position.take_profit_price is not None and candle.low <= position.take_profit_price:
            return position.take_profit_price, "take_profit"
    return None, None


def _risk_distance(position: PaperPositionRecord) -> Optional[Decimal]:
    if position.stop_loss_price is None:
        return None
    distance = abs(position.entry_price - position.stop_loss_price)
    return distance if distance > 0 else None


def _management_exit_signal(position: PaperPositionRecord, candle: Candle) -> tuple[Optional[Decimal], Optional[str]]:
    policy = trader_holding_policy(position.trader_id or "")
    risk_distance = _risk_distance(position)
    if risk_distance is not None:
        if position.side == "long" and candle.close <= position.entry_price - risk_distance * policy.early_failure_adverse_r:
            return candle.close, "early_thesis_failure"
        if position.side == "short" and candle.close >= position.entry_price + risk_distance * policy.early_failure_adverse_r:
            return candle.close, "early_thesis_failure"

    if position.take_profit_price is None:
        return None, None
    target_distance = abs(position.take_profit_price - position.entry_price)
    if target_distance <= 0:
        return None, None
    if position.side == "long":
        reached_near_target = candle.high >= position.entry_price + target_distance * policy.profit_protect_target_progress
        gave_back = candle.close <= position.entry_price + target_distance * policy.giveback_target_progress
        if reached_near_target and gave_back and candle.close > position.entry_price:
            return candle.close, "early_profit_protect"
    if position.side == "short":
        reached_near_target = candle.low <= position.entry_price - target_distance * policy.profit_protect_target_progress
        gave_back = candle.close >= position.entry_price - target_distance * policy.giveback_target_progress
        if reached_near_target and gave_back and candle.close < position.entry_price:
            return candle.close, "early_profit_protect"
    return None, None


def _maybe_move_stop_to_breakeven(
    db: Session,
    position: PaperPositionRecord,
    candle: Candle,
    result: PaperEngineResult,
) -> None:
    risk_distance = _risk_distance(position)
    if risk_distance is None:
        return
    policy = trader_holding_policy(position.trader_id or "")
    should_move = False
    if position.side == "long":
        should_move = candle.high >= position.entry_price + risk_distance * policy.breakeven_progress_r and position.stop_loss_price < position.entry_price
    if position.side == "short":
        should_move = candle.low <= position.entry_price - risk_distance * policy.breakeven_progress_r and position.stop_loss_price > position.entry_price
    if not should_move:
        return

    previous_stop = position.stop_loss_price
    position.stop_loss_price = position.entry_price
    position.updated_at = utc_now()
    event = create_trade_event(
        db,
        position.trader_id or "",
        position.symbol or candle.symbol,
        "stop_moved_to_breakeven",
        order_id=position.order_id,
        position_id=position.id,
        price=position.entry_price,
        quantity=position.quantity,
        payload={
            "paperOnly": True,
            "previousStop": previous_stop,
            "newStop": position.entry_price,
            "reason": "strategy_holding_policy_breakeven",
            "holdingPolicy": policy.as_prompt_dict(),
        },
    )
    result.events.append(event)


def _position_gross_pnl(position: PaperPositionRecord, price: Decimal) -> Decimal:
    if position.side == "long":
        return (price - position.entry_price) * position.quantity
    return (position.entry_price - price) * position.quantity


def _close_position(
    db: Session,
    state: TraderStateRecord,
    position: PaperPositionRecord,
    exit_price: Decimal,
    reason: str,
    candle: Candle,
    result: PaperEngineResult,
) -> None:
    settings = ensure_risk_settings(db, position.trader_id or "", position.symbol)
    gross_pnl = _position_gross_pnl(position, exit_price)
    exit_fee = exit_price * position.quantity * settings.taker_fee_rate
    net_pnl = gross_pnl - position.entry_fee - exit_fee

    position.status = "closed"
    position.exit_price = exit_price
    position.exit_fee = exit_fee
    position.realized_pnl = net_pnl
    position.unrealized_pnl = Decimal("0")
    position.close_reason = reason
    position.closed_at = candle.timestamp or utc_now()
    position.updated_at = utc_now()

    state.cash_balance += position.margin + gross_pnl - exit_fee
    state.realized_pnl += net_pnl
    state.total_fees += exit_fee
    state.updated_at = utc_now()

    event = create_trade_event(
        db,
        position.trader_id or "",
        position.symbol or candle.symbol,
        "position_closed",
        order_id=position.order_id,
        position_id=position.id,
        price=exit_price,
        quantity=position.quantity,
        fee=exit_fee,
        realized_pnl=net_pnl,
        equity=state.equity,
        payload={
            "reason": reason,
            "side": position.side,
            "entryPrice": position.entry_price,
            "averageEntryPrice": position.entry_price,
            "exitPrice": exit_price,
            "leverage": position.leverage,
            "stopLossPrice": position.stop_loss_price,
            "takeProfitPrice": position.take_profit_price,
            "grossPnl": gross_pnl,
            "paperOnly": True,
        },
    )
    result.events.append(event)


def _mark_to_market(db: Session, state: TraderStateRecord, trader_id: str, symbol: str, mark_price: Decimal) -> None:
    symbol_positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "open",
        )
    ).scalars().all()
    for position in symbol_positions:
        position.unrealized_pnl = _position_gross_pnl(position, mark_price)
        position.updated_at = utc_now()

    all_positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.status == "open",
        )
    ).scalars().all()
    state.margin_used = sum((position.margin for position in all_positions), Decimal("0"))
    state.unrealized_pnl = sum((position.unrealized_pnl for position in all_positions), Decimal("0"))
    state.equity = state.cash_balance + state.margin_used + state.unrealized_pnl
    state.updated_at = utc_now()
