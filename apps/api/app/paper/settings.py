from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.paper.repositories import ensure_risk_settings, ensure_trader_state, upsert_risk_settings
from app.traders.high_voltage_config import (
    HIGH_VOLTAGE_INITIAL_EQUITY,
    HIGH_VOLTAGE_MAX_LEVERAGE,
    is_high_voltage_trader,
)


def sync_default_paper_settings(db: Session, trader_id: str, symbol: str, settings: Any):
    high_voltage = is_high_voltage_trader(trader_id)
    initial_equity = HIGH_VOLTAGE_INITIAL_EQUITY if high_voltage else Decimal(str(settings.paper_default_equity))
    max_leverage = HIGH_VOLTAGE_MAX_LEVERAGE if high_voltage else Decimal(str(settings.paper_max_leverage))
    maker_fee_rate = Decimal(str(settings.paper_maker_fee_rate))
    taker_fee_rate = Decimal(str(settings.paper_taker_fee_rate))
    risk_settings = ensure_risk_settings(db, trader_id, symbol)
    if (
        risk_settings.initial_equity != initial_equity
        or risk_settings.max_leverage != max_leverage
        or risk_settings.max_notional is not None
        or risk_settings.maker_fee_rate != maker_fee_rate
        or risk_settings.taker_fee_rate != taker_fee_rate
    ):
        risk_settings = upsert_risk_settings(
            db,
            trader_id=trader_id,
            symbol=symbol,
            initial_equity=initial_equity,
            max_leverage=max_leverage,
            maker_fee_rate=maker_fee_rate,
            taker_fee_rate=taker_fee_rate,
        )
    state = ensure_trader_state(db, trader_id, risk_settings.initial_equity)
    return state, risk_settings
