from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.paper.repositories import ensure_trader_state, upsert_risk_settings


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
