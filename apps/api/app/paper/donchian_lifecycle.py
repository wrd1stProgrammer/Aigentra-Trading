from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord, PaperPositionRecord
from app.paper.engine import (
    PaperEngineResult,
    append_event,
    cancel_paper_order,
    close_position_by_management,
    place_paper_order,
)
from app.paper.pending_exposure import pending_order_exposure
from app.paper.repositories import create_trade_event, ensure_risk_settings, lock_trader_state
from app.repositories import from_json, to_json


RETEST_ACTIVATION_TTL_SECONDS = 1800
MIN_RETEST_QUANTITY = Decimal("0.001")
QUANTITY_STEP = Decimal("0.001")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _completed_candle(snapshot: dict[str, Any]) -> Optional[dict[str, Any]]:
    candle = snapshot.get("timeframes", {}).get("15m", {}).get("completedCandle")
    return candle if isinstance(candle, dict) else None


def _milliseconds(value: Any) -> Optional[int]:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _payload(record: PaperOrderRecord | PaperPositionRecord) -> dict[str, Any]:
    value = from_json(record.payload_json) or {}
    return value if isinstance(value, dict) else {}


def _context(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    value = payload.get("donchianContext")
    return value if isinstance(value, dict) else None


def _inside_range(side: str, close: Decimal, context: dict[str, Any]) -> bool:
    upper = Decimal(str(context.get("upperBoundary") or 0))
    lower = Decimal(str(context.get("lowerBoundary") or 0))
    return (side == "long" and close <= upper) or (side == "short" and close >= lower)


def _expire_retest(
    db: Session,
    position: PaperPositionRecord,
    payload: dict[str, Any],
    reason: str,
) -> None:
    retest = payload.get("dormantRetest")
    if not isinstance(retest, dict) or retest.get("status") not in {"DORMANT", "ACTIVATED"}:
        return
    payload["dormantRetest"] = {
        **retest,
        "status": "EXPIRED",
        "expirationReason": reason,
        "expiredAt": datetime.now(timezone.utc).isoformat(),
    }
    position.payload_json = to_json(payload)
    db.flush()


def _stage_one_exists(db: Session, trader_id: str, symbol: str, trade_plan_id: int) -> bool:
    orders = db.execute(
        select(PaperOrderRecord)
        .where(
            PaperOrderRecord.trader_id == trader_id,
            PaperOrderRecord.symbol == symbol,
        )
        .order_by(PaperOrderRecord.id.desc())
        .limit(1000)
    ).scalars().all()
    for order in orders:
        payload = _payload(order)
        if payload.get("tradePlanId") == trade_plan_id and payload.get("entryIndex") == 1:
            return True
    return False


def _first_take_profit(position: PaperPositionRecord, payload: dict[str, Any]) -> Decimal:
    take_profits = payload.get("takeProfits")
    if isinstance(take_profits, list) and take_profits and isinstance(take_profits[0], dict):
        return Decimal(str(take_profits[0].get("price") or 0))
    return Decimal(str(position.take_profit_price or 0))


def enforce_donchian_lifecycle(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    snapshot: dict[str, Any],
    result: Optional[PaperEngineResult] = None,
) -> dict[str, Any]:
    outcome = {"activatedOrderId": None, "hardInvalidation": False, "expiredReason": None}
    if trader_id != "donchian-breakout":
        return outcome

    candle = _completed_candle(snapshot)
    if candle is None:
        return outcome
    close = Decimal(str(candle.get("close") or 0))
    high = Decimal(str(candle.get("high") or close))
    low = Decimal(str(candle.get("low") or close))
    candle_close_time = _milliseconds(candle.get("closeTime"))
    if close <= 0:
        return outcome
    current_mark = Decimal(str(snapshot.get("price") or close))
    if current_mark <= 0:
        current_mark = close

    state = lock_trader_state(db, trader_id)
    open_orders = db.execute(
        select(PaperOrderRecord).where(
            PaperOrderRecord.trader_id == trader_id,
            PaperOrderRecord.symbol == symbol,
            PaperOrderRecord.status == "open",
        )
    ).scalars().all()
    positions = db.execute(
        select(PaperPositionRecord).where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "open",
        )
    ).scalars().all()

    if not positions:
        now = datetime.now(timezone.utc)
        for order in open_orders:
            payload = _payload(order)
            context = _context(payload)
            if context is None:
                continue
            submitted_at = order.submitted_at or order.created_at or now
            stale = (now - _aware(submitted_at)).total_seconds() >= RETEST_ACTIVATION_TTL_SECONDS
            signal_close_time = _milliseconds(context.get("signalCandleCloseTime"))
            subsequent_close_inside = (
                candle_close_time is not None
                and signal_close_time is not None
                and candle_close_time > signal_close_time
                and _inside_range((order.side or "").lower(), close, context)
            )
            if subsequent_close_inside or stale:
                cancel_paper_order(
                    db,
                    order,
                    "Donchian confirmation expired or the completed 15m candle closed back inside the frozen range.",
                    result,
                    event_type="donchian_order_canceled",
                )
        return outcome

    position = positions[0]
    payload = _payload(position)
    context = _context(payload)
    if context is None:
        return outcome
    side = (position.side or "").lower()
    opened_at = position.opened_at or datetime.now(timezone.utc)
    signal_close_time = _milliseconds(context.get("signalCandleCloseTime"))
    opened_at_ms = int(_aware(opened_at).timestamp() * 1000)
    is_subsequent_completed_candle = (
        candle_close_time is not None
        and signal_close_time is not None
        and candle_close_time > max(signal_close_time, opened_at_ms)
    )

    if is_subsequent_completed_candle and _inside_range(side, close, context):
        _expire_retest(db, position, payload, "range_reentry")
        for order in open_orders:
            if _context(_payload(order)) is not None:
                cancel_paper_order(
                    db,
                    order,
                    "Completed 15m candle closed back inside the frozen Donchian range.",
                    result,
                    event_type="donchian_retest_canceled",
                )
        close_position_by_management(
            db,
            state,
            position,
            current_mark,
            {
                "open": candle.get("open", close),
                "high": high,
                "low": low,
                "close": close,
            },
            "donchian_range_reentry",
            result,
        )
        if result is not None:
            result.closed_positions.append(position)
        outcome["hardInvalidation"] = True
        return outcome

    retest = payload.get("dormantRetest")
    if not isinstance(retest, dict) or retest.get("status") not in {"DORMANT", "ACTIVATED"}:
        return outcome

    now = datetime.now(timezone.utc)
    ttl_seconds = int(retest.get("activationTtlSeconds") or RETEST_ACTIVATION_TTL_SECONDS)
    trade_plan_id = int(payload.get("tradePlanId") or 0)
    stage_orders = [
        order
        for order in open_orders
        if _payload(order).get("tradePlanId") == trade_plan_id
        and _payload(order).get("entryIndex") == 1
    ]
    if (now - _aware(opened_at)).total_seconds() >= ttl_seconds:
        for order in stage_orders:
            cancel_paper_order(
                db,
                order,
                "Donchian retest activation window elapsed.",
                result,
                event_type="donchian_retest_expired",
            )
        _expire_retest(db, position, payload, "activation_ttl_elapsed")
        outcome["expiredReason"] = "activation_ttl_elapsed"
        return outcome

    first_take_profit = _first_take_profit(position, payload)
    target_reached = first_take_profit > 0 and (
        (side == "long" and high >= first_take_profit)
        or (side == "short" and low <= first_take_profit)
    )
    if target_reached:
        for order in stage_orders:
            cancel_paper_order(
                db,
                order,
                "First take-profit was reached before the Donchian retest completed.",
                result,
                event_type="donchian_retest_expired",
            )
        _expire_retest(db, position, payload, "take_profit_reached_before_retest")
        outcome["expiredReason"] = "take_profit_reached_before_retest"
        return outcome

    if retest.get("status") == "ACTIVATED":
        return outcome

    if not is_subsequent_completed_candle:
        return outcome

    boundary = Decimal(str(context.get("brokenBoundary") or 0))
    touched = (side == "long" and low <= boundary) or (side == "short" and high >= boundary)
    accepted_outside = (side == "long" and close > boundary) or (side == "short" and close < boundary)
    if boundary <= 0 or not touched or not accepted_outside:
        return outcome

    if trade_plan_id <= 0 or _stage_one_exists(db, trader_id, symbol, trade_plan_id):
        _expire_retest(db, position, payload, "stage_already_created")
        return outcome

    settings = ensure_risk_settings(db, trader_id, symbol)
    pending = pending_order_exposure(db, trader_id, settings.maker_fee_rate, settings.taker_fee_rate)
    remaining_cash = max(Decimal("0"), state.cash_balance - pending.cash_required)
    risk_budget = Decimal(str(payload.get("riskBudget") or 0))
    used_risk = Decimal(str(payload.get("plannedRisk") or 0))
    remaining_risk = max(Decimal("0"), risk_budget - used_risk)
    stop = Decimal(str(position.stop_loss_price or 0))
    retest_price = Decimal(str(retest.get("price") or boundary))
    risk_per_unit = abs(retest_price - stop) + retest_price * (settings.maker_fee_rate + settings.taker_fee_rate)
    deployment_percent = Decimal(str(payload.get("marginDeploymentPercent") or 100))
    target_total_margin = state.equity * deployment_percent / Decimal("100")
    remaining_margin = max(Decimal("0"), target_total_margin - state.margin_used - pending.margin)
    margin_cap = min(remaining_cash, remaining_margin)
    risk_quantity = remaining_risk / risk_per_unit if risk_per_unit > 0 else Decimal("0")
    margin_quantity = margin_cap * position.leverage / retest_price if retest_price > 0 else Decimal("0")
    quantity = min(risk_quantity, margin_quantity).quantize(QUANTITY_STEP, rounding=ROUND_DOWN)
    if quantity < MIN_RETEST_QUANTITY:
        _expire_retest(db, position, payload, "insufficient_remaining_risk_or_cash")
        outcome["expiredReason"] = "insufficient_remaining_risk_or_cash"
        return outcome

    order_payload = {
        **payload,
        "source": "donchian_conditional_retest",
        "entryIndex": 1,
        "entryWeight": retest.get("weight"),
        "entryReason": retest.get("reason"),
        "plannedEntryPrice": float(retest_price),
        "parentPositionId": position.id,
        "plannedRisk": float(quantity * risk_per_unit),
        "riskPerUnit": float(risk_per_unit),
        "dormantRetest": {**retest, "status": "ACTIVATED"},
    }
    order = place_paper_order(
        db,
        trader_id=trader_id,
        symbol=symbol,
        side=side,
        quantity=quantity,
        leverage=position.leverage,
        order_type="limit",
        limit_price=retest_price,
        take_profit_price=position.take_profit_price,
        stop_loss_price=position.stop_loss_price,
        fee_type="maker",
        payload=order_payload,
    )
    event = create_trade_event(
        db,
        trader_id,
        symbol,
        "donchian_retest_activated",
        order_id=order.id,
        position_id=position.id,
        price=retest_price,
        quantity=quantity,
        payload={
            "paperOnly": True,
            "source": "donchian_conditional_retest",
            "tradePlanId": trade_plan_id,
            "entryIndex": 1,
            "boundaryFingerprint": context.get("boundaryFingerprint"),
        },
    )
    append_event(result, event)
    payload["dormantRetest"] = {
        **retest,
        "status": "ACTIVATED",
        "activatedOrderId": order.id,
        "activatedAt": now.isoformat(),
        "activationCandleCloseTime": candle.get("closeTime"),
    }
    position.payload_json = to_json(payload)
    db.flush()
    outcome["activatedOrderId"] = order.id
    return outcome
