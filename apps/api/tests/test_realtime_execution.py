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
from app.paper.engine import place_paper_order, process_candle
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


class DonchianInvalidationMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 68000, "indexPrice": 68000}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        if before is not None:
            return []
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        if interval == "15m":
            open_time = now_ms - 1_800_000
            return [
                Candle(
                    openTime=open_time,
                    open=67800,
                    high=67900,
                    low=67200,
                    close=67400,
                    volume=100,
                    closeTime=open_time + 899_999,
                    quoteVolume=6_740_000,
                    trades=100,
                    takerBuyBaseVolume=45,
                    takerBuyQuoteVolume=3_033_000,
                )
            ]
        return [
            Candle(
                openTime=now_ms - 60_000,
                open=67900,
                high=68100,
                low=67800,
                close=68000,
                volume=10,
                closeTime=now_ms - 1,
                quoteVolume=680_000,
                trades=10,
                takerBuyBaseVolume=6,
                takerBuyQuoteVolume=408_000,
            )
        ]


class DonchianReentryThenRecoveryMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 68000, "indexPrice": 68000}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        if before is not None:
            return []
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        if interval == "15m":
            first_open = now_ms - 2_100_000
            second_open = now_ms - 1_200_000
            return [
                Candle(
                    openTime=first_open,
                    open=67800,
                    high=67900,
                    low=67200,
                    close=67400,
                    volume=100,
                    closeTime=first_open + 899_999,
                    quoteVolume=6_740_000,
                    trades=100,
                    takerBuyBaseVolume=45,
                    takerBuyQuoteVolume=3_033_000,
                ),
                Candle(
                    openTime=second_open,
                    open=67400,
                    high=68100,
                    low=67300,
                    close=68000,
                    volume=100,
                    closeTime=second_open + 899_999,
                    quoteVolume=6_800_000,
                    trades=100,
                    takerBuyBaseVolume=60,
                    takerBuyQuoteVolume=4_080_000,
                ),
            ]
        return [
            Candle(
                openTime=now_ms - 60_000,
                open=67900,
                high=68100,
                low=67800,
                close=68000,
                volume=10,
                closeTime=now_ms - 1,
                quoteVolume=680_000,
                trades=10,
                takerBuyBaseVolume=6,
                takerBuyQuoteVolume=408_000,
            )
        ]


class DonchianTakeProfitBeforeReentryMarketClient:
    async def get_premium_index(self, symbol):
        return {"symbol": symbol, "markPrice": 67400, "indexPrice": 67400}

    async def get_klines(self, symbol, interval="1m", limit=20, before=None):
        if before is not None:
            return []
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        if interval == "15m":
            open_time = now_ms - 1_200_000
            return [
                Candle(
                    openTime=open_time,
                    open=68000,
                    high=68100,
                    low=67200,
                    close=67400,
                    volume=100,
                    closeTime=open_time + 899_999,
                    quoteVolume=6_740_000,
                    trades=100,
                    takerBuyBaseVolume=45,
                    takerBuyQuoteVolume=3_033_000,
                )
            ]
        first_open = now_ms - 1_500_000
        return [
            Candle(
                openTime=first_open,
                open=68000,
                high=71100,
                low=67900,
                close=71000,
                volume=10,
                closeTime=first_open + 59_999,
                quoteVolume=710_000,
                trades=10,
                takerBuyBaseVolume=6,
                takerBuyQuoteVolume=426_000,
            ),
            Candle(
                openTime=now_ms - 60_000,
                open=67500,
                high=67600,
                low=67300,
                close=67400,
                volume=10,
                closeTime=now_ms - 1,
                quoteVolume=674_000,
                trades=10,
                takerBuyBaseVolume=4,
                takerBuyQuoteVolume=269_600,
            ),
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
async def test_realtime_donchian_invalidation_cancels_before_marketable_fill(temp_db):
    signal_close_time = int((datetime.now(timezone.utc) - timedelta(minutes=30)).timestamp() * 1000)
    with session_scope() as db:
        upsert_risk_settings(db, "donchian-breakout", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=68000,
            quantity=1,
            leverage=5,
            take_profit_price=71000,
            stop_loss_price=66500,
            payload={
                "tradePlanId": 501,
                "entryIndex": 0,
                "donchianContext": {
                    "upperBoundary": 67500,
                    "lowerBoundary": 65000,
                    "brokenBoundary": 67500,
                    "signalCandleCloseTime": signal_close_time,
                },
            },
        )
        order_id = order.id

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=DonchianInvalidationMarketClient,
    )

    assert result["counts"]["fills"] == 0
    with session_scope() as db:
        order = db.get(PaperOrderRecord, order_id)
        assert order.status == "canceled"
        assert db.query(PaperPositionRecord).count() == 0


@pytest.mark.asyncio
async def test_realtime_latest_reentry_uses_current_mark_for_forced_exit(temp_db):
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "donchian-breakout", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=68000,
            quantity=0.2,
            leverage=5,
            take_profit_price=71000,
            stop_loss_price=66500,
            payload={
                "tradePlanId": 504,
                "entryIndex": 0,
                "dormantRetest": {"status": "DORMANT", "activationTtlSeconds": 1800},
                "donchianContext": {
                    "upperBoundary": 67500,
                    "lowerBoundary": 65000,
                    "brokenBoundary": 67500,
                    "signalCandleCloseTime": int((now - timedelta(minutes=50)).timestamp() * 1000),
                },
            },
        )
        order.submitted_at = now - timedelta(minutes=46)
        db.flush()
        process_candle(
            db,
            "donchian-breakout",
            "BTCUSDT",
            {
                "open": 68000,
                "high": 68100,
                "low": 67900,
                "close": 68000,
                "timestamp": now - timedelta(minutes=45),
            },
        )
        position_id = db.query(PaperPositionRecord).filter_by(status="open").one().id

    await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=DonchianInvalidationMarketClient,
    )

    with session_scope() as db:
        position = db.get(PaperPositionRecord, position_id)
        assert position.status == "closed"
        assert position.close_reason == "donchian_range_reentry"
        assert float(position.exit_price) == pytest.approx(68000 * (1 - 0.0001))


@pytest.mark.asyncio
async def test_realtime_replays_intermediate_reentry_before_latest_recovery(temp_db):
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "donchian-breakout", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=68000,
            quantity=1,
            leverage=5,
            take_profit_price=71000,
            stop_loss_price=66500,
            payload={
                "tradePlanId": 502,
                "entryIndex": 0,
                "donchianContext": {
                    "upperBoundary": 67500,
                    "lowerBoundary": 65000,
                    "brokenBoundary": 67500,
                    "signalCandleCloseTime": int((now - timedelta(minutes=45)).timestamp() * 1000),
                },
            },
        )
        order.submitted_at = now - timedelta(minutes=40)
        order_id = order.id

    result = await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=DonchianReentryThenRecoveryMarketClient,
    )

    assert result["counts"]["fills"] == 0
    with session_scope() as db:
        assert db.get(PaperOrderRecord, order_id).status == "canceled"
        assert db.query(PaperPositionRecord).count() == 0


@pytest.mark.asyncio
async def test_realtime_backfill_applies_take_profit_before_later_range_reentry(temp_db):
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        upsert_risk_settings(db, "donchian-breakout", "BTCUSDT", max_leverage=10)
        order = place_paper_order(
            db,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=68000,
            quantity=0.2,
            leverage=5,
            take_profit_price=71000,
            stop_loss_price=66500,
            payload={
                "tradePlanId": 503,
                "entryIndex": 0,
                "takeProfits": [{"price": 71000, "weight": 1.0}],
                "dormantRetest": {"status": "DORMANT", "activationTtlSeconds": 1800},
                "donchianContext": {
                    "upperBoundary": 67500,
                    "lowerBoundary": 65000,
                    "brokenBoundary": 67500,
                    "signalCandleCloseTime": int((now - timedelta(minutes=50)).timestamp() * 1000),
                },
            },
        )
        order.submitted_at = now - timedelta(minutes=46)
        db.flush()
        process_candle(
            db,
            "donchian-breakout",
            "BTCUSDT",
            {
                "open": 68000,
                "high": 68100,
                "low": 67900,
                "close": 68000,
                "timestamp": now - timedelta(minutes=45),
            },
        )
        position_id = db.query(PaperPositionRecord).filter_by(status="open").one().id

    await run_realtime_execution_once(
        symbols=["BTCUSDT"],
        market_client_factory=DonchianTakeProfitBeforeReentryMarketClient,
    )

    with session_scope() as db:
        position = db.get(PaperPositionRecord, position_id)
        assert position.status == "closed"
        assert position.close_reason == "take_profit"


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
