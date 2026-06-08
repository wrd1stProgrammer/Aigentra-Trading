from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import (
    EquitySnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    RiskSettingsRecord,
    TradeEventRecord,
    TraderStateRecord,
    utc_now,
)
from app.repositories import to_json


DEFAULT_INITIAL_EQUITY = Decimal("10000")
DEFAULT_MAX_LEVERAGE = Decimal("10")
DEFAULT_MAKER_FEE_RATE = Decimal("0.0002")
DEFAULT_TAKER_FEE_RATE = Decimal("0.0005")


def to_decimal(value: Any, field_name: str) -> Decimal:
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field_name} must be a decimal-compatible value.") from exc
    if not decimal.is_finite():
        raise ValueError(f"{field_name} must be finite.")
    return decimal


def require_positive(value: Any, field_name: str) -> Decimal:
    decimal = to_decimal(value, field_name)
    if decimal <= 0:
        raise ValueError(f"{field_name} must be greater than zero.")
    return decimal


def normalize_symbol(symbol: str) -> str:
    clean = symbol.upper().strip()
    if not clean:
        raise ValueError("symbol is required.")
    return clean


def normalize_trader_id(trader_id: str) -> str:
    clean = trader_id.strip()
    if not clean:
        raise ValueError("trader_id is required.")
    return clean


def ensure_trader_state(
    db: Session,
    trader_id: str,
    initial_equity: Any = DEFAULT_INITIAL_EQUITY,
) -> TraderStateRecord:
    clean_trader_id = normalize_trader_id(trader_id)
    state = db.execute(
        select(TraderStateRecord).where(TraderStateRecord.trader_id == clean_trader_id)
    ).scalar_one_or_none()
    if state:
        return state

    starting_equity = require_positive(initial_equity, "initial_equity")
    state = TraderStateRecord(
        trader_id=clean_trader_id,
        status="active",
        cash_balance=starting_equity,
        equity=starting_equity,
        margin_used=Decimal("0"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("0"),
        total_fees=Decimal("0"),
        payload_json=to_json({"source": "paper_engine"}),
    )
    db.add(state)
    db.flush()
    return state


def get_risk_settings(db: Session, trader_id: str, symbol: Optional[str] = None) -> Optional[RiskSettingsRecord]:
    clean_trader_id = normalize_trader_id(trader_id)
    clean_symbol = normalize_symbol(symbol) if symbol else None
    return db.execute(
        select(RiskSettingsRecord).where(
            RiskSettingsRecord.trader_id == clean_trader_id,
            RiskSettingsRecord.symbol == clean_symbol,
        )
    ).scalar_one_or_none()


def ensure_risk_settings(db: Session, trader_id: str, symbol: Optional[str] = None) -> RiskSettingsRecord:
    clean_trader_id = normalize_trader_id(trader_id)
    clean_symbol = normalize_symbol(symbol) if symbol else None
    settings = get_risk_settings(db, clean_trader_id, clean_symbol)
    if settings:
        return settings

    settings = RiskSettingsRecord(
        trader_id=clean_trader_id,
        symbol=clean_symbol,
        status="active",
        initial_equity=DEFAULT_INITIAL_EQUITY,
        max_leverage=DEFAULT_MAX_LEVERAGE,
        maker_fee_rate=DEFAULT_MAKER_FEE_RATE,
        taker_fee_rate=DEFAULT_TAKER_FEE_RATE,
        payload_json=to_json({"source": "paper_engine_default"}),
    )
    db.add(settings)
    db.flush()
    return settings


def upsert_risk_settings(
    db: Session,
    trader_id: str,
    symbol: Optional[str] = None,
    initial_equity: Any = DEFAULT_INITIAL_EQUITY,
    max_leverage: Any = DEFAULT_MAX_LEVERAGE,
    max_notional: Optional[Any] = None,
    maker_fee_rate: Any = DEFAULT_MAKER_FEE_RATE,
    taker_fee_rate: Any = DEFAULT_TAKER_FEE_RATE,
) -> RiskSettingsRecord:
    settings = ensure_risk_settings(db, trader_id, symbol)
    settings.initial_equity = require_positive(initial_equity, "initial_equity")
    settings.max_leverage = require_positive(max_leverage, "max_leverage")
    settings.max_notional = require_positive(max_notional, "max_notional") if max_notional is not None else None
    settings.maker_fee_rate = to_decimal(maker_fee_rate, "maker_fee_rate")
    settings.taker_fee_rate = to_decimal(taker_fee_rate, "taker_fee_rate")
    if settings.maker_fee_rate < 0 or settings.taker_fee_rate < 0:
        raise ValueError("fee rates cannot be negative.")
    settings.updated_at = utc_now()
    settings.payload_json = to_json(
        {
            "initialEquity": settings.initial_equity,
            "maxLeverage": settings.max_leverage,
            "maxNotional": settings.max_notional,
            "makerFeeRate": settings.maker_fee_rate,
            "takerFeeRate": settings.taker_fee_rate,
        }
    )
    db.flush()
    return settings


def create_paper_order(
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
    clean_trader_id = normalize_trader_id(trader_id)
    clean_symbol = normalize_symbol(symbol)
    clean_side = side.lower().strip()
    clean_order_type = order_type.lower().strip()
    if clean_side not in {"long", "short"}:
        raise ValueError("side must be 'long' or 'short'.")
    if clean_order_type not in {"market", "limit"}:
        raise ValueError("order_type must be 'market' or 'limit'.")
    if clean_order_type == "limit" and limit_price is None:
        raise ValueError("limit_price is required for limit paper orders.")

    settings = ensure_risk_settings(db, clean_trader_id, clean_symbol)
    qty = require_positive(quantity, "quantity")
    lev = require_positive(leverage, "leverage")
    if lev > settings.max_leverage:
        raise ValueError("leverage exceeds risk settings.")

    clean_fee_type = (fee_type or ("maker" if clean_order_type == "limit" else "taker")).lower().strip()
    if clean_fee_type not in {"maker", "taker"}:
        raise ValueError("fee_type must be 'maker' or 'taker'.")

    order = PaperOrderRecord(
        trader_id=clean_trader_id,
        symbol=clean_symbol,
        status="open",
        side=clean_side,
        order_type=clean_order_type,
        fee_type=clean_fee_type,
        quantity=qty,
        leverage=lev,
        limit_price=to_decimal(limit_price, "limit_price") if limit_price is not None else None,
        take_profit_price=to_decimal(take_profit_price, "take_profit_price") if take_profit_price is not None else None,
        stop_loss_price=to_decimal(stop_loss_price, "stop_loss_price") if stop_loss_price is not None else None,
        filled_quantity=Decimal("0"),
        notional=Decimal("0"),
        margin=Decimal("0"),
        fee=Decimal("0"),
        payload_json=to_json(payload or {}),
    )
    db.add(order)
    db.flush()
    return order


def list_open_orders(db: Session, trader_id: str, symbol: str) -> list[PaperOrderRecord]:
    return db.execute(
        select(PaperOrderRecord)
        .where(
            PaperOrderRecord.trader_id == normalize_trader_id(trader_id),
            PaperOrderRecord.symbol == normalize_symbol(symbol),
            PaperOrderRecord.status == "open",
        )
        .order_by(PaperOrderRecord.id.asc())
    ).scalars().all()


def list_open_positions(db: Session, trader_id: str, symbol: str) -> list[PaperPositionRecord]:
    return db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id == normalize_trader_id(trader_id),
            PaperPositionRecord.symbol == normalize_symbol(symbol),
            PaperPositionRecord.status == "open",
        )
        .order_by(PaperPositionRecord.id.asc())
    ).scalars().all()


def create_trade_event(
    db: Session,
    trader_id: str,
    symbol: str,
    event_type: str,
    order_id: Optional[int] = None,
    position_id: Optional[int] = None,
    price: Optional[Decimal] = None,
    quantity: Optional[Decimal] = None,
    fee: Decimal = Decimal("0"),
    realized_pnl: Decimal = Decimal("0"),
    equity: Optional[Decimal] = None,
    payload: Optional[dict] = None,
) -> TradeEventRecord:
    event = TradeEventRecord(
        trader_id=normalize_trader_id(trader_id),
        symbol=normalize_symbol(symbol),
        status="recorded",
        event_type=event_type,
        order_id=order_id,
        position_id=position_id,
        price=price,
        quantity=quantity,
        fee=fee,
        realized_pnl=realized_pnl,
        equity=equity,
        payload_json=to_json(payload or {}),
    )
    db.add(event)
    db.flush()
    from app.subscribers import notify_subscribers_for_trade_event

    notify_subscribers_for_trade_event(db, event)
    return event


def create_equity_snapshot(
    db: Session,
    state: TraderStateRecord,
    symbol: str,
    candle_time: Optional[datetime] = None,
    payload: Optional[dict] = None,
) -> EquitySnapshotRecord:
    snapshot = EquitySnapshotRecord(
        trader_id=state.trader_id,
        symbol=normalize_symbol(symbol),
        status="recorded",
        cash_balance=state.cash_balance,
        equity=state.equity,
        margin_used=state.margin_used,
        realized_pnl=state.realized_pnl,
        unrealized_pnl=state.unrealized_pnl,
        total_fees=state.total_fees,
        candle_time=candle_time,
        payload_json=to_json(payload or {}),
    )
    db.add(snapshot)
    db.flush()
    return snapshot


def utc_comparable(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def create_equity_snapshot_if_needed(
    db: Session,
    state: TraderStateRecord,
    symbol: str,
    candle_time: Optional[datetime] = None,
    payload: Optional[dict] = None,
    interval_seconds: int = 60,
    min_change_percent: float = 0.02,
    force: bool = False,
) -> Optional[EquitySnapshotRecord]:
    clean_symbol = normalize_symbol(symbol)
    latest = db.execute(
        select(EquitySnapshotRecord)
        .where(
            EquitySnapshotRecord.trader_id == state.trader_id,
            EquitySnapshotRecord.symbol == clean_symbol,
        )
        .order_by(desc(EquitySnapshotRecord.created_at))
        .limit(1)
    ).scalar_one_or_none()
    if not force and latest is not None:
        minimum_created_at = utc_now() - timedelta(seconds=max(1, interval_seconds))
        if latest.created_at and utc_comparable(latest.created_at) >= utc_comparable(minimum_created_at):
            previous_equity = Decimal(str(latest.equity or 0))
            current_equity = Decimal(str(state.equity or 0))
            if previous_equity > 0:
                change_percent = abs(current_equity - previous_equity) / previous_equity * Decimal("100")
                if change_percent < Decimal(str(max(0.0, min_change_percent))):
                    return None
    return create_equity_snapshot(db, state, clean_symbol, candle_time=candle_time, payload=payload)
