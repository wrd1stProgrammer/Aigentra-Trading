import asyncio

import pytest
from sqlalchemy import select

from app.db import PaperOrderRecord, PaperPositionRecord, init_db, reset_db_engine, session_scope
from app.paper.engine import place_paper_order
from app.paper.realtime_execution import (
    EXECUTION_EVENT_HUB,
    _LAST_PRICE_BY_SYMBOL,
    run_realtime_execution_once,
)
from app.paper.repositories import upsert_risk_settings


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "realtime-paper.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    _LAST_PRICE_BY_SYMBOL.clear()
    yield db_path
    _LAST_PRICE_BY_SYMBOL.clear()
    reset_db_engine("sqlite:///:memory:")
    init_db()


@pytest.mark.asyncio
async def test_realtime_execution_fills_order_and_streams_committed_event(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "realtime-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="realtime-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=105,
            stop_loss_price=95,
        )

    queue = EXECUTION_EVENT_HUB.subscribe(trader_id="realtime-trader", symbol="BTCUSDT")
    try:
        result = await run_realtime_execution_once(
            symbols=["BTCUSDT"],
            price_by_symbol={"BTCUSDT": 99},
        )
        payload = await asyncio.wait_for(queue.get(), timeout=1)
    finally:
        EXECUTION_EVENT_HUB.unsubscribe(queue)

    assert result["counts"]["fills"] == 1
    assert payload["eventTypes"] == ["order_filled"]
    assert payload["filledOrderIds"]

    with session_scope() as db:
        order = db.execute(select(PaperOrderRecord)).scalar_one()
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert order.status == "filled"
        assert position.status == "open"


@pytest.mark.asyncio
async def test_realtime_execution_closes_position_when_target_is_touched(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "realtime-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="realtime-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=105,
            stop_loss_price=95,
        )

    await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        price_by_symbol={"BTCUSDT": 100},
    )

    queue = EXECUTION_EVENT_HUB.subscribe(trader_id="realtime-trader", symbol="BTCUSDT")
    try:
        result = await run_realtime_execution_once(
            symbols=["BTCUSDT"],
            price_by_symbol={"BTCUSDT": 106},
        )
        payload = await asyncio.wait_for(queue.get(), timeout=1)
    finally:
        EXECUTION_EVENT_HUB.unsubscribe(queue)

    assert result["counts"]["closes"] == 1
    assert "position_closed" in payload["eventTypes"]
    assert payload["closedPositionIds"]

    with session_scope() as db:
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert position.status == "closed"
        assert position.close_reason == "take_profit"
