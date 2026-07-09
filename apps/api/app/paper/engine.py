from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional, Union

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import PaperOrderRecord, PaperPositionRecord, TradeEventRecord, TraderStateRecord, utc_now
from app.paper.holding_policy import trader_holding_policy
from app.paper.loss_discipline import close_review_context
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
from app.paper.review_payload import review_payload_subset
from app.repositories import from_json, to_json, update_observation_candidate_outcome_for_position

PROFITABLE_HOLD_BREAKEVEN_HOURS = 60
PROFITABLE_HOLD_BREAKEVEN_SECONDS = PROFITABLE_HOLD_BREAKEVEN_HOURS * 60 * 60
FIRST_TAKE_PROFIT_BREAKEVEN_PROGRESS = Decimal("0.5")
MIN_FIRST_TAKE_PROFIT_EXIT_FRACTION = Decimal("0.5")
BREAKEVEN_NET_PNL_TOLERANCE = Decimal("0.01")
PAPER_PRICE_QUANT = Decimal("0.0000000001")


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


def handle_take_profit_exit(
    db: Session,
    state: TraderStateRecord,
    position: PaperPositionRecord,
    exit_price: Any,
    candle: Union[Candle, dict[str, Any]],
    result: Optional[PaperEngineResult] = None,
) -> None:
    if position.status != "open":
        return
    parsed_candle = candle if isinstance(candle, Candle) else Candle.from_mapping(position.symbol or "", candle)
    price = to_decimal(exit_price, "exit_price")
    
    payload = from_json(position.payload_json) or {}
    take_profits = payload.get("takeProfits")
    
    if not take_profits or not isinstance(take_profits, list) or len(take_profits) <= 1:
        _close_position(db, state, position, price, "take_profit", parsed_candle, result)
        if result:
            result.closed_positions.append(position)
        return

    is_long = position.side == "long"
    target_idx = -1
    executable_targets = _take_profit_targets_in_execution_order(position, take_profits)
    for idx, tp, tp_price in executable_targets:
        crossed = (is_long and parsed_candle.high >= tp_price) or (not is_long and parsed_candle.low <= tp_price)
        if crossed:
            target_idx = idx
            break

    if target_idx == -1:
        _close_position(db, state, position, price, "take_profit", parsed_candle, result)
        if result:
            result.closed_positions.append(position)
        return

    target = take_profits[target_idx]

    # Mark target as filled
    target["status"] = "filled"
    payload["takeProfits"] = take_profits
    position.payload_json = to_json(payload)
    
    closed_qty = _closed_quantity_for_open_position(db, position)
    raw_initial_qty = Decimal(str(payload.get("initialQuantity", position.quantity)))
    initial_qty = max(raw_initial_qty, position.quantity + closed_qty)
    cumulative_weight = Decimal("0")
    for sequence_idx, (idx, take_profit, _) in enumerate(executable_targets):
        target_weight = Decimal(str(take_profit.get("weight", 0.5)))
        target_weight = max(Decimal("0"), min(target_weight, Decimal("1")))
        if sequence_idx == 0:
            target_weight = max(target_weight, MIN_FIRST_TAKE_PROFIT_EXIT_FRACTION)
        cumulative_weight += target_weight
        if idx == target_idx:
            break
    planned_closed_qty = initial_qty * min(cumulative_weight, Decimal("1"))
    close_qty = min(max(planned_closed_qty - closed_qty, Decimal("0")), position.quantity)
    
    is_last = all(tp.get("status") == "filled" for tp in take_profits)
    remaining_qty = position.quantity - close_qty
    
    if is_last or remaining_qty < Decimal("0.001"):
        _close_position(db, state, position, price, "take_profit", parsed_candle, result)
        if result:
            result.closed_positions.append(position)
    else:
        if close_qty <= 0:
            next_tp = _next_take_profit_target(position, take_profits)
            if next_tp:
                position.take_profit_price = Decimal(str(next_tp["price"]))
            else:
                position.take_profit_price = None
            _move_stop_to_breakeven(db, position, parsed_candle, result, reason="first_take_profit_already_reduced")
            return
        fraction = close_qty / position.quantity
        reason = target.get("reason", f"Take Profit Target {target_idx + 1}")
        
        event = reduce_position_by_management(db, state, position, price, fraction, parsed_candle, reason, result)
        if event:
            event.event_type = "take_partial_profit"
            event_payload = from_json(event.payload_json) or {}
            event_payload["source"] = "strategy_take_profit"
            event_payload["takeProfitIndex"] = target_idx
            event.payload_json = to_json(event_payload)
            
        next_tp = _next_take_profit_target(position, take_profits)
        if next_tp:
            position.take_profit_price = Decimal(str(next_tp["price"]))
        else:
            position.take_profit_price = None
        _move_stop_to_breakeven(db, position, parsed_candle, result, reason="first_take_profit_breakeven")


def process_candle(db: Session, trader_id: str, symbol: str, candle: Union[Candle, dict[str, Any]]) -> PaperEngineResult:
    clean_trader_id = normalize_trader_id(trader_id)
    parsed_candle = candle if isinstance(candle, Candle) else Candle.from_mapping(symbol, candle)
    clean_symbol = normalize_symbol(parsed_candle.symbol)
    state = ensure_trader_state(db, clean_trader_id)
    result = PaperEngineResult()
    preexisting_position_ids = {
        position.id
        for position in list_open_positions(db, clean_trader_id, clean_symbol)
        if position.id is not None
    }

    for order in list_open_orders(db, clean_trader_id, clean_symbol):
        if not _record_is_active_for_candle(order.submitted_at or order.created_at, parsed_candle):
            continue
        fill_price = _fill_price(order, parsed_candle)
        if fill_price is None:
            continue
        if _fill_order(db, state, order, fill_price, parsed_candle, result):
            result.filled_orders.append(order)
        else:
            result.rejected_orders.append(order)

    for position in list_open_positions(db, clean_trader_id, clean_symbol):
        if position.id not in preexisting_position_ids:
            continue
        if not _record_is_active_for_candle(position.opened_at, parsed_candle):
            continue
        if _should_upgrade_fee_inclusive_breakeven_stop(db, position):
            _move_stop_to_breakeven(
                db,
                position,
                parsed_candle,
                result,
                reason="fee_inclusive_breakeven_upgrade",
                payload_extra={"feeInclusiveUpgrade": True},
            )
        exit_price, reason = _exit_signal(position, parsed_candle)
        if exit_price is None:
            exit_price, reason = _management_exit_signal(position, parsed_candle)
        if exit_price is not None:
            if reason == "take_profit":
                handle_take_profit_exit(db, state, position, exit_price, parsed_candle, result)
            else:
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
    
    side = (order.side or "long").lower()
    if side == "long":
        # Buy Limit: price falls to or below the limit price
        if candle.low <= order.limit_price:
            return order.limit_price if candle.open >= order.limit_price else candle.open
    else:
        # Sell Limit: price rises to or above the limit price
        if candle.high >= order.limit_price:
            return order.limit_price if candle.open <= order.limit_price else candle.open
            
    return None


def _payload_decimal(payload: dict[str, Any], key: str) -> Optional[Decimal]:
    value = payload.get(key)
    if value is None:
        return None
    try:
        return to_decimal(value, key)
    except ValueError:
        return None


def _reanchor_price(planned_entry: Decimal, planned_price: Decimal, fill_price: Decimal) -> Decimal:
    return fill_price + (planned_price - planned_entry)


def _reanchor_market_order_levels(
    order: PaperOrderRecord,
    order_payload: dict[str, Any],
    fill_price: Decimal,
) -> None:
    if order.order_type != "market":
        return
    planned_entry = _payload_decimal(order_payload, "plannedEntryPrice")
    if planned_entry is None or planned_entry == fill_price:
        return

    order_payload["plannedFillDrift"] = float(fill_price - planned_entry)
    if order.stop_loss_price is not None:
        order.stop_loss_price = _reanchor_price(planned_entry, order.stop_loss_price, fill_price)
        order_payload["stopLossPrice"] = float(order.stop_loss_price)

    take_profits = order_payload.get("takeProfits")
    if isinstance(take_profits, list):
        reanchored_take_profits: list[dict[str, Any]] = []
        for take_profit in take_profits:
            if not isinstance(take_profit, dict):
                continue
            planned_price = _payload_decimal(take_profit, "price")
            if planned_price is None:
                reanchored_take_profits.append(take_profit)
                continue
            updated_take_profit = dict(take_profit)
            updated_take_profit["price"] = float(_reanchor_price(planned_entry, planned_price, fill_price))
            reanchored_take_profits.append(updated_take_profit)
        order_payload["takeProfits"] = reanchored_take_profits
        if reanchored_take_profits:
            order.take_profit_price = to_decimal(reanchored_take_profits[0]["price"], "take_profit_price")
            target = order_payload.get("target")
            if isinstance(target, dict):
                order_payload["target"] = {**target, "price": reanchored_take_profits[0]["price"]}
    elif order.take_profit_price is not None:
        order.take_profit_price = _reanchor_price(planned_entry, order.take_profit_price, fill_price)
        order_payload["takeProfitPrice"] = float(order.take_profit_price)

    order.payload_json = to_json(order_payload)



def _fill_order(
    db: Session,
    state: TraderStateRecord,
    order: PaperOrderRecord,
    fill_price: Decimal,
    candle: Candle,
    result: PaperEngineResult,
) -> bool:
    settings = ensure_risk_settings(db, order.trader_id or "", order.symbol)
    order_payload = from_json(order.payload_json) or {}
    _reanchor_market_order_levels(order, order_payload, fill_price)
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
        
        # Merge payload properties
        pos_payload = from_json(existing_position.payload_json) or {}
        pos_payload["initialQuantity"] = float(new_qty)
        if "takeProfits" in order_payload:
            pos_payload["takeProfits"] = order_payload["takeProfits"]
        existing_position.payload_json = to_json(pos_payload)
        
        # Update take_profit_price and stop_loss_price
        tps = pos_payload.get("takeProfits")
        if tps:
            first_tp = _next_take_profit_target(existing_position, tps) if isinstance(tps, list) else None
            if first_tp:
                existing_position.take_profit_price = Decimal(str(first_tp["price"]))
            else:
                existing_position.take_profit_price = None
        elif order.take_profit_price is not None:
            existing_position.take_profit_price = order.take_profit_price
            
        if order.stop_loss_price is not None:
            existing_position.stop_loss_price = order.stop_loss_price
            
        existing_position.updated_at = utc_now()
        position = existing_position
    else:
        # Parse payload for new position
        pos_payload = dict(order_payload)
        pos_payload["initialQuantity"] = float(order.quantity)
        if "takeProfits" in order_payload:
            pos_payload["takeProfits"] = order_payload["takeProfits"]
            first_tp = order_payload["takeProfits"][0] if order_payload["takeProfits"] else None
            if first_tp:
                order.take_profit_price = Decimal(str(first_tp["price"]))
                
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
            payload_json=to_json(pos_payload),
            opened_at=candle.timestamp or utc_now(),
        )
        db.add(position)
        db.flush()

    position.take_profit_price = _next_take_profit_price(position)

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
        payload={
            "paperOnly": True,
            "feeType": order.fee_type,
            "leverage": order.leverage,
            **review_payload_subset(order_payload),
        },
    )
    result.events.append(event)
    return True


def _exit_signal(position: PaperPositionRecord, candle: Candle) -> tuple[Optional[Decimal], Optional[str]]:
    take_profit_price = _next_take_profit_price(position)
    if position.side == "long":
        if position.stop_loss_price is not None and candle.low <= position.stop_loss_price:
            return position.stop_loss_price, "stop_loss"
        if take_profit_price is not None and candle.high >= take_profit_price:
            return take_profit_price, "take_profit"
    if position.side == "short":
        if position.stop_loss_price is not None and candle.high >= position.stop_loss_price:
            return position.stop_loss_price, "stop_loss"
        if take_profit_price is not None and candle.low <= take_profit_price:
            return take_profit_price, "take_profit"
    return None, None


def _risk_distance(position: PaperPositionRecord) -> Optional[Decimal]:
    if position.stop_loss_price is None:
        return None
    distance = abs(position.entry_price - position.stop_loss_price)
    return distance if distance > 0 else None


def _closed_quantity_for_open_position(db: Session, position: PaperPositionRecord) -> Decimal:
    if position.id is None:
        return Decimal("0")
    quantities = db.execute(
        select(TradeEventRecord.quantity).where(
            TradeEventRecord.position_id == position.id,
            TradeEventRecord.event_type.in_(("position_reduced_by_ai", "take_partial_profit")),
        )
    ).scalars().all()
    total = Decimal("0")
    for quantity in quantities:
        if quantity is not None:
            total += quantity
    return total


def _record_is_active_for_candle(started_at: Optional[datetime], candle: Candle) -> bool:
    if started_at is None or candle.timestamp is None:
        return True
    return _aware_utc(started_at) <= _aware_utc(candle.timestamp)


def _next_take_profit_price(position: PaperPositionRecord) -> Optional[Decimal]:
    payload = from_json(position.payload_json) or {}
    take_profits = payload.get("takeProfits")
    if isinstance(take_profits, list):
        next_target = _next_take_profit_target(position, take_profits)
        if next_target is not None:
            try:
                return to_decimal(next_target.get("price"), "take_profit_price")
            except ValueError:
                return None
    return position.take_profit_price


def _next_take_profit_target(position: PaperPositionRecord, take_profits: list[Any]) -> Optional[dict[str, Any]]:
    targets = _take_profit_targets_in_execution_order(position, take_profits)
    return targets[0][1] if targets else None


def _take_profit_targets_in_execution_order(
    position: PaperPositionRecord,
    take_profits: list[Any],
) -> list[tuple[int, dict[str, Any], Decimal]]:
    targets: list[tuple[int, dict[str, Any], Decimal]] = []
    for idx, take_profit in enumerate(take_profits):
        if not isinstance(take_profit, dict) or take_profit.get("status") == "filled":
            continue
        try:
            price = to_decimal(take_profit.get("price"), "take_profit_price")
        except ValueError:
            continue
        if position.side == "long" and price <= position.entry_price:
            continue
        if position.side == "short" and price >= position.entry_price:
            continue
        targets.append((idx, take_profit, price))
    return sorted(targets, key=lambda item: (abs(item[2] - position.entry_price), item[0]))


def _first_take_profit_breakeven_trigger(position: PaperPositionRecord) -> Optional[Decimal]:
    take_profit_price = _next_take_profit_price(position)
    if take_profit_price is None:
        return None
    target_distance = abs(take_profit_price - position.entry_price)
    if target_distance <= 0:
        return None
    if position.side == "long" and take_profit_price > position.entry_price:
        return position.entry_price + target_distance * FIRST_TAKE_PROFIT_BREAKEVEN_PROGRESS
    if position.side == "short" and take_profit_price < position.entry_price:
        return position.entry_price - target_distance * FIRST_TAKE_PROFIT_BREAKEVEN_PROGRESS
    return None


def _management_exit_signal(position: PaperPositionRecord, candle: Candle) -> tuple[Optional[Decimal], Optional[str]]:
    policy = trader_holding_policy(position.trader_id or "")
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
    if _should_upgrade_fee_inclusive_breakeven_stop(db, position):
        _move_stop_to_breakeven(
            db,
            position,
            candle,
            result,
            reason="fee_inclusive_breakeven_upgrade",
            payload_extra={"feeInclusiveUpgrade": True},
        )
        return

    risk_distance = _risk_distance(position)
    if risk_distance is None:
        return
    policy = trader_holding_policy(position.trader_id or "")
    move_reason: Optional[str] = None
    first_take_profit_trigger = _first_take_profit_breakeven_trigger(position)
    first_take_profit_price = _next_take_profit_price(position)
    payload_extra: dict[str, Any] = {"holdingPolicy": policy.as_prompt_dict()}
    if position.side == "long":
        if (
            first_take_profit_trigger is not None
            and candle.high >= first_take_profit_trigger
            and position.stop_loss_price < position.entry_price
        ):
            move_reason = "first_take_profit_halfway_breakeven"
            payload_extra.update(
                {
                    "firstTakeProfitPrice": first_take_profit_price,
                    "breakevenTriggerPrice": first_take_profit_trigger,
                    "progressToFirstTakeProfit": FIRST_TAKE_PROFIT_BREAKEVEN_PROGRESS,
                }
            )
        elif candle.high >= position.entry_price + risk_distance * policy.breakeven_progress_r and position.stop_loss_price < position.entry_price:
            move_reason = "strategy_holding_policy_breakeven"
    if position.side == "short":
        if (
            first_take_profit_trigger is not None
            and candle.low <= first_take_profit_trigger
            and position.stop_loss_price > position.entry_price
        ):
            move_reason = "first_take_profit_halfway_breakeven"
            payload_extra.update(
                {
                    "firstTakeProfitPrice": first_take_profit_price,
                    "breakevenTriggerPrice": first_take_profit_trigger,
                    "progressToFirstTakeProfit": FIRST_TAKE_PROFIT_BREAKEVEN_PROGRESS,
                }
            )
        elif candle.low <= position.entry_price - risk_distance * policy.breakeven_progress_r and position.stop_loss_price > position.entry_price:
            move_reason = "strategy_holding_policy_breakeven"
    if move_reason is None and _held_profitably_for_breakeven_window(position, candle):
        move_reason = "profitable_after_60h_breakeven"
        payload_extra.update(
            {
                "minimumHoldingHours": PROFITABLE_HOLD_BREAKEVEN_HOURS,
                "holdingSeconds": _position_holding_seconds(position, candle),
                "closePrice": candle.close,
            }
        )
    if move_reason is None:
        return

    _move_stop_to_breakeven(
        db,
        position,
        candle,
        result,
        reason=move_reason,
        payload_extra=payload_extra,
    )


def _held_profitably_for_breakeven_window(position: PaperPositionRecord, candle: Candle) -> bool:
    if position.stop_loss_price is None:
        return False
    if position.side == "long":
        if position.stop_loss_price >= position.entry_price or candle.close <= position.entry_price:
            return False
    elif position.side == "short":
        if position.stop_loss_price <= position.entry_price or candle.close >= position.entry_price:
            return False
    else:
        return False
    return _position_holding_seconds(position, candle) >= PROFITABLE_HOLD_BREAKEVEN_SECONDS


def _position_holding_seconds(position: PaperPositionRecord, candle: Candle) -> int:
    opened_at = _aware_utc(position.opened_at or position.created_at or utc_now())
    reference = _aware_utc(candle.timestamp or utc_now())
    return max(0, int((reference - opened_at).total_seconds()))


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _move_stop_to_breakeven(
    db: Session,
    position: PaperPositionRecord,
    candle: Candle,
    result: PaperEngineResult,
    *,
    reason: str,
    payload_extra: Optional[dict[str, Any]] = None,
) -> None:
    if position.stop_loss_price is None:
        return

    new_stop = _fee_inclusive_breakeven_stop(db, position)
    previous_stop = position.stop_loss_price
    if position.side == "long" and previous_stop >= new_stop:
        return
    if position.side == "short" and previous_stop <= new_stop:
        return

    position.stop_loss_price = new_stop
    position.updated_at = utc_now()
    event = create_trade_event(
        db,
        position.trader_id or "",
        position.symbol or candle.symbol,
        "stop_moved_to_breakeven",
        order_id=position.order_id,
        position_id=position.id,
        price=new_stop,
        quantity=position.quantity,
        payload={
            "paperOnly": True,
            "previousStop": previous_stop,
            "newStop": new_stop,
            "feeInclusive": True,
            "entryPrice": position.entry_price,
            "reason": reason,
            **(payload_extra or {}),
        },
    )
    result.events.append(event)


def _fee_inclusive_breakeven_stop(db: Session, position: PaperPositionRecord) -> Decimal:
    if position.quantity <= 0:
        return _quantize_paper_price(position.entry_price)
    settings = ensure_risk_settings(db, position.trader_id or "", position.symbol)
    taker_fee_rate = settings.taker_fee_rate
    match position.side:
        case "long":
            denominator = position.quantity * (Decimal("1") - taker_fee_rate)
            if denominator <= 0:
                return _quantize_paper_price(position.entry_price)
            return _quantize_paper_price(((position.entry_price * position.quantity) + position.entry_fee) / denominator)
        case "short":
            denominator = position.quantity * (Decimal("1") + taker_fee_rate)
            if denominator <= 0:
                return _quantize_paper_price(position.entry_price)
            return _quantize_paper_price(((position.entry_price * position.quantity) - position.entry_fee) / denominator)
        case _:
            return _quantize_paper_price(position.entry_price)


def _quantize_paper_price(value: Decimal) -> Decimal:
    return value.quantize(PAPER_PRICE_QUANT)


def _should_upgrade_fee_inclusive_breakeven_stop(db: Session, position: PaperPositionRecord) -> bool:
    if position.stop_loss_price is None:
        return False
    fee_inclusive_stop = _fee_inclusive_breakeven_stop(db, position)
    if position.side == "long":
        return position.stop_loss_price >= position.entry_price and position.stop_loss_price < fee_inclusive_stop
    if position.side == "short":
        return position.stop_loss_price <= position.entry_price and position.stop_loss_price > fee_inclusive_stop
    return False


def _position_gross_pnl(position: PaperPositionRecord, price: Decimal) -> Decimal:
    if position.side == "long":
        return (price - position.entry_price) * position.quantity
    return (position.entry_price - price) * position.quantity


def _close_reason_after_fees(reason: str, net_pnl: Decimal) -> str:
    if reason == "stop_loss" and abs(net_pnl) <= BREAKEVEN_NET_PNL_TOLERANCE:
        return "breakeven"
    return reason


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
    close_reason = _close_reason_after_fees(reason, net_pnl)

    position.status = "closed"
    position.exit_price = exit_price
    position.exit_fee = exit_fee
    position.realized_pnl = net_pnl
    position.unrealized_pnl = Decimal("0")
    position.close_reason = close_reason
    position.closed_at = candle.timestamp or utc_now()
    position.updated_at = utc_now()
    close_review = close_review_context(position, close_reason, exit_price)

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
            "reason": close_reason,
            "side": position.side,
            "entryPrice": position.entry_price,
            "averageEntryPrice": position.entry_price,
            "exitPrice": exit_price,
            "leverage": position.leverage,
            "stopLossPrice": position.stop_loss_price,
            "takeProfitPrice": position.take_profit_price,
            "grossPnl": gross_pnl,
            "closeReasonSummary": close_review["summary"],
            "closeReview": close_review,
            "lossReview": close_review if close_review["outcome"] == "loss" else None,
            "paperOnly": True,
        },
    )
    result.events.append(event)
    update_observation_candidate_outcome_for_position(db, position, close_reason, exit_price)

    # Cancel any remaining open orders for the same trade plan
    try:
        from app.paper.plan_state import trade_plan_id_from_payload
        pos_payload = from_json(position.payload_json) if isinstance(position.payload_json, str) else position.payload_json
        plan_id = trade_plan_id_from_payload(pos_payload)
        if plan_id is not None:
            open_orders = list_open_orders(db, position.trader_id or "", position.symbol or "")
            for order in open_orders:
                order_payload = from_json(order.payload_json) if isinstance(order.payload_json, str) else order.payload_json
                order_plan_id = trade_plan_id_from_payload(order_payload)
                if order_plan_id == plan_id:
                    cancel_paper_order(db, order, f"Position closed: {reason}", result)
    except Exception as e:
        # Avoid crashing core execution if order cleanup fails, but print it
        print(f"Failed to cancel remaining orders on position close: {e}")



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
