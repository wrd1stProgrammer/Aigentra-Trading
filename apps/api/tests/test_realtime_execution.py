import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.clients.binance_client import Candle
from app.db import (
    PaperExecutionCursorRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    RiskSettingsRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.paper.engine import place_paper_order
from app.paper.realtime_execution import (
    EXECUTION_EVENT_HUB,
    _LAST_CANDLE_OPEN_TIME_BY_SYMBOL,
    _LAST_PRICE_BY_SYMBOL,
    run_realtime_execution_once,
)
from app.paper.repositories import upsert_risk_settings


class FakeMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 104, "indexPrice": 104}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        return [
            Candle(
                openTime=1_783_000_000_000,
                open=100,
                high=106,
                low=99,
                close=104,
                volume=1,
                closeTime=1_783_000_059_999,
                quoteVolume=104,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            )
        ]


class LaggingCandleMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 106, "indexPrice": 106}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        return [
            Candle(
                openTime=1_783_000_000_000,
                open=100,
                high=104,
                low=99,
                close=104,
                volume=1,
                closeTime=1_783_000_059_999,
                quoteVolume=104,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            )
        ]


class MissedSecondTargetMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 116, "indexPrice": 116}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        if before is not None:
            return []
        base_open_time = int((datetime.now(timezone.utc) - timedelta(minutes=2)).timestamp() * 1000)
        return [
            Candle(
                openTime=base_open_time,
                open=115,
                high=121,
                low=114,
                close=119,
                volume=1,
                closeTime=base_open_time + 59_999,
                quoteVolume=119,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            ),
            Candle(
                openTime=base_open_time + 60_000,
                open=119,
                high=119,
                low=115,
                close=116,
                volume=1,
                closeTime=base_open_time + 119_999,
                quoteVolume=116,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            ),
        ]


class KlineFailureMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 99, "indexPrice": 99}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        raise RuntimeError("temporary kline provider failure")


class PersistentCursorMarketClient:
    client_count = 0
    base_open_time_ms = 0

    def __init__(self):
        self.run_index = PersistentCursorMarketClient.client_count
        PersistentCursorMarketClient.client_count += 1

    @classmethod
    def reset(cls, base_open_time_ms):
        cls.client_count = 0
        cls.base_open_time_ms = base_open_time_ms

    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 100, "indexPrice": 100}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        if before is not None:
            return []
        base_open_time_ms = PersistentCursorMarketClient.base_open_time_ms
        if self.run_index == 0:
            return [
                Candle(
                    openTime=base_open_time_ms,
                    open=100,
                    high=101,
                    low=95,
                    close=100,
                    volume=1,
                    closeTime=base_open_time_ms + 59_999,
                    quoteVolume=100,
                    trades=1,
                    takerBuyBaseVolume=0,
                    takerBuyQuoteVolume=0,
                ),
                Candle(
                    openTime=base_open_time_ms + 60_000,
                    open=100,
                    high=101,
                    low=95,
                    close=100,
                    volume=1,
                    closeTime=base_open_time_ms + 119_999,
                    quoteVolume=100,
                    trades=1,
                    takerBuyBaseVolume=0,
                    takerBuyQuoteVolume=0,
                ),
            ]
        return [
            Candle(
                openTime=base_open_time_ms,
                open=100,
                high=101,
                low=85,
                close=100,
                volume=1,
                closeTime=base_open_time_ms + 59_999,
                quoteVolume=100,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            ),
            Candle(
                openTime=base_open_time_ms + 60_000,
                open=100,
                high=101,
                low=95,
                close=100,
                volume=1,
                closeTime=base_open_time_ms + 119_999,
                quoteVolume=100,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            ),
            Candle(
                openTime=base_open_time_ms + 120_000,
                open=100,
                high=101,
                low=95,
                close=100,
                volume=1,
                closeTime=base_open_time_ms + 179_999,
                quoteVolume=100,
                trades=1,
                takerBuyBaseVolume=0,
                takerBuyQuoteVolume=0,
            ),
        ]


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "realtime-paper.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    _LAST_PRICE_BY_SYMBOL.clear()
    _LAST_CANDLE_OPEN_TIME_BY_SYMBOL.clear()
    yield db_path
    _LAST_PRICE_BY_SYMBOL.clear()
    _LAST_CANDLE_OPEN_TIME_BY_SYMBOL.clear()
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
async def test_realtime_execution_falls_back_to_mark_tick_when_kline_fetch_fails(temp_db):
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

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=KlineFailureMarketClient,
    )

    assert result["counts"]["errors"] == 0
    assert result["counts"]["fills"] == 1
    with session_scope() as db:
        order = db.execute(select(PaperOrderRecord)).scalar_one()
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert order.status == "filled"
        assert order.filled_price == 99
        assert position.status == "open"
        assert position.entry_price == 99


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


@pytest.mark.asyncio
async def test_realtime_execution_fills_marketable_short_limit_order(temp_db):
    with session_scope() as db:
        upsert_risk_settings(db, "realtime-trader", "BTCUSDT", max_leverage=10)
        place_paper_order(
            db,
            trader_id="realtime-trader",
            symbol="BTCUSDT",
            side="short",
            order_type="limit",
            limit_price=100,
            quantity=1,
            leverage=5,
            take_profit_price=95,
            stop_loss_price=105,
        )

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        price_by_symbol={"BTCUSDT": 101},
    )

    assert result["counts"]["fills"] == 1
    with session_scope() as db:
        order = db.execute(select(PaperOrderRecord)).scalar_one()
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert order.status == "filled"
        assert position.status == "open"
        assert position.side == "short"
        assert position.entry_price == 101


@pytest.mark.asyncio
async def test_realtime_execution_uses_latest_candle_high_for_take_profit(temp_db):
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

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=FakeMarketClient,
    )

    assert result["counts"]["closes"] == 1
    with session_scope() as db:
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert position.status == "closed"
        assert position.close_reason == "take_profit"


@pytest.mark.asyncio
async def test_realtime_execution_uses_live_mark_price_for_breakeven_when_candle_lags(temp_db):
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
            take_profit_price=110,
            stop_loss_price=90,
            payload={
                "takeProfits": [
                    {"price": 110, "weight": 1.0, "reason": "first target"},
                ]
            },
        )

    await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        price_by_symbol={"BTCUSDT": 100},
    )

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=LaggingCandleMarketClient,
    )

    trader_result = next(item for item in result["results"] if item.get("traderId") == "realtime-trader")
    assert "stop_moved_to_breakeven" in trader_result["eventTypes"]
    with session_scope() as db:
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert position.status == "open"
        assert position.stop_loss_price > position.entry_price


@pytest.mark.asyncio
async def test_realtime_execution_does_not_rewrite_matching_default_risk_settings(temp_db):
    frozen_updated_at = datetime(2026, 7, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        risk_settings = upsert_risk_settings(db, "realtime-trader", "BTCUSDT", max_leverage=10)
        risk_settings.updated_at = frozen_updated_at
        place_paper_order(
            db,
            trader_id="realtime-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=90,
            quantity=1,
            leverage=5,
            take_profit_price=110,
            stop_loss_price=80,
        )

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        price_by_symbol={"BTCUSDT": 100},
    )

    assert result["counts"]["fills"] == 0
    with session_scope() as db:
        risk_settings = db.execute(select(RiskSettingsRecord)).scalar_one()
        assert risk_settings.updated_at.replace(tzinfo=timezone.utc) == frozen_updated_at


@pytest.mark.asyncio
async def test_realtime_execution_backfills_missed_second_take_profit(temp_db):
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
            take_profit_price=110,
            stop_loss_price=90,
            payload={
                "initialQuantity": 1,
                "takeProfits": [
                    {"price": 110, "weight": 0.4, "reason": "first target"},
                    {"price": 120, "weight": 0.6, "reason": "runner target"},
                ],
            },
        )

    await run_realtime_execution_once(symbols=["BTCUSDT"], price_by_symbol={"BTCUSDT": 100})
    await run_realtime_execution_once(symbols=["BTCUSDT"], price_by_symbol={"BTCUSDT": 111})

    with session_scope() as db:
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        position.opened_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        assert position.status == "open"
        assert position.take_profit_price == 120

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=MissedSecondTargetMarketClient,
    )

    assert result["counts"]["closes"] == 1
    trader_result = next(item for item in result["results"] if item.get("traderId") == "realtime-trader")
    assert "position_closed" in trader_result["eventTypes"]
    with session_scope() as db:
        position = db.execute(select(PaperPositionRecord)).scalar_one()
        assert position.status == "closed"
        assert position.close_reason == "take_profit"


@pytest.mark.asyncio
async def test_realtime_execution_persists_backfill_cursor_across_restart(temp_db):
    base_open_time_ms = int((datetime.now(timezone.utc) - timedelta(minutes=3)).timestamp() * 1000)
    PersistentCursorMarketClient.reset(base_open_time_ms)
    with session_scope() as db:
        upsert_risk_settings(db, "realtime-trader", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="realtime-trader",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=90,
            quantity=1,
            leverage=5,
            take_profit_price=110,
            stop_loss_price=80,
        )
        order.submitted_at = datetime.fromtimestamp((base_open_time_ms - 30_000) / 1000, timezone.utc)

    first_result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=PersistentCursorMarketClient,
    )

    assert first_result["counts"]["fills"] == 0
    with session_scope() as db:
        cursor = db.execute(select(PaperExecutionCursorRecord)).scalar_one()
        assert cursor.symbol == "BTCUSDT"
        assert cursor.interval == "1m"
        assert cursor.last_open_time_ms == base_open_time_ms + 60_000

    _LAST_CANDLE_OPEN_TIME_BY_SYMBOL.clear()

    second_result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=PersistentCursorMarketClient,
    )

    assert second_result["counts"]["fills"] == 0
    with session_scope() as db:
        order = db.execute(select(PaperOrderRecord)).scalar_one()
        cursor = db.execute(select(PaperExecutionCursorRecord)).scalar_one()
        assert order.status == "open"
        assert cursor.last_open_time_ms == base_open_time_ms + 120_000
