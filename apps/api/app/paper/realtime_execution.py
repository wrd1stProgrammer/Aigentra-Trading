from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Awaitable, Callable, Optional

import httpx

try:
    import redis.asyncio as redis
    from redis.exceptions import RedisError
except ImportError:
    redis = None

    class RedisError(Exception):
        pass
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients.binance_client import ALLOWED_SYMBOLS, Candle as MarketCandle
from app.clients.market_data_client import MarketDataClient
from app.core.config import get_settings
from app.db import PaperOrderRecord, PaperPositionRecord, session_scope
from app.paper.engine import PaperEngineResult, process_candle
from app.paper.planner import list_active_paper_exposure
from app.paper.settings import sync_default_paper_settings
from app.repositories import sanitize_error_message, serialize_record


RealtimeResultCallback = Callable[[Session, str, str, PaperEngineResult], Awaitable[None] | None]


REALTIME_EXECUTION_STATE: dict[str, Any] = {
    "enabled": False,
    "running": False,
    "mode": "paper",
    "symbols": [],
    "intervalSeconds": 1.0,
    "cycles": 0,
    "ticks": 0,
    "skippedTicks": 0,
    "scanInProgress": False,
    "currentScanStartedAt": None,
    "lastTickAt": None,
    "lastSkippedAt": None,
    "lastSkipReason": None,
    "nextTickAt": None,
    "lastStartedAt": None,
    "lastFinishedAt": None,
    "lastError": None,
    "lastResult": None,
    "subscribers": 0,
    "redisPubSub": False,
}

_EXECUTION_LOCK = asyncio.Lock()
PAPER_EXECUTION_LOCK = _EXECUTION_LOCK
_LAST_PRICE_BY_SYMBOL: dict[str, Decimal] = {}
_EVENT_SEQUENCE = 0
_PROCESS_ID = uuid.uuid4().hex
_REDIS_CLIENT: Optional[Any] = None
_REDIS_DISABLED_UNTIL = 0.0
_REDIS_CHANNEL_SUFFIX = "paper_execution_events:v1"


def normalize_execution_symbol(symbol: str) -> str:
    clean_symbol = str(symbol or "").strip().upper()
    if clean_symbol not in ALLOWED_SYMBOLS:
        raise ValueError("Only BTCUSDT and ETHUSDT are supported.")
    return clean_symbol


def execution_tick_candle(symbol: str, price: Decimal, previous_price: Optional[Decimal] = None) -> dict[str, Any]:
    open_price = previous_price if previous_price is not None and previous_price > 0 else price
    high = max(open_price, price)
    low = min(open_price, price)
    return {
        "symbol": normalize_execution_symbol(symbol),
        "open": open_price,
        "high": high,
        "low": low,
        "close": price,
        "timestamp": datetime.now(timezone.utc),
    }


def execution_market_candle(symbol: str, candle: MarketCandle) -> dict[str, Any]:
    return {
        "symbol": normalize_execution_symbol(symbol),
        "open": Decimal(str(candle.open)),
        "high": Decimal(str(candle.high)),
        "low": Decimal(str(candle.low)),
        "close": Decimal(str(candle.close)),
        "timestamp": datetime.fromtimestamp(candle.openTime / 1000, timezone.utc),
    }


def execution_live_market_candle(
    symbol: str,
    candle: dict[str, Any],
    price: Decimal,
    previous_price: Optional[Decimal] = None,
) -> dict[str, Any]:
    open_price = previous_price if previous_price is not None and previous_price > 0 else candle["open"]
    high = max(candle["high"], open_price, price)
    low = min(candle["low"], open_price, price)
    return {
        "symbol": normalize_execution_symbol(symbol),
        "open": open_price,
        "high": high,
        "low": low,
        "close": price,
        "timestamp": datetime.now(timezone.utc),
    }


def active_exposure_trader_ids(db: Session, symbol: str) -> list[str]:
    clean_symbol = normalize_execution_symbol(symbol)
    order_traders = db.execute(
        select(PaperOrderRecord.trader_id).where(
            PaperOrderRecord.symbol == clean_symbol,
            PaperOrderRecord.status == "open",
            PaperOrderRecord.trader_id.isnot(None),
        )
    ).scalars()
    position_traders = db.execute(
        select(PaperPositionRecord.trader_id).where(
            PaperPositionRecord.symbol == clean_symbol,
            PaperPositionRecord.status == "open",
            PaperPositionRecord.trader_id.isnot(None),
        )
    ).scalars()
    return sorted({trader_id for trader_id in [*order_traders, *position_traders] if trader_id})


async def fetch_execution_price(symbol: str, market_client: Optional[MarketDataClient] = None) -> Decimal:
    client = market_client or MarketDataClient(timeout_seconds=3.0)
    premium = await client.get_premium_index(normalize_execution_symbol(symbol))
    price = Decimal(str(premium.get("markPrice") or 0))
    if price <= 0:
        raise ValueError("market data provider returned an invalid mark price")
    return price


async def fetch_execution_candle(
    symbol: str,
    market_client: Optional[MarketDataClient] = None,
    *,
    previous_price: Optional[Decimal] = None,
) -> tuple[Decimal, dict[str, Any]]:
    client = market_client or MarketDataClient(timeout_seconds=3.0)
    candles = await client.get_klines(normalize_execution_symbol(symbol), "1m", 2)
    if candles:
        candle = execution_market_candle(symbol, candles[-1])
        try:
            price = await fetch_execution_price(symbol, client)
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            price = to_positive_execution_price(candle["close"])
        return price, execution_live_market_candle(symbol, candle, price, previous_price)
    price = await fetch_execution_price(symbol, client)
    return price, execution_tick_candle(symbol, price, previous_price)


def to_positive_execution_price(value: Decimal) -> Decimal:
    if value <= 0:
        raise ValueError("market data provider returned an invalid execution price")
    return value


def _result_has_execution_change(result: PaperEngineResult) -> bool:
    return bool(result.filled_orders or result.closed_positions or result.rejected_orders or result.events)


def _result_payload(
    *,
    trader_id: str,
    symbol: str,
    price: Decimal,
    candle: dict[str, Any],
    result: PaperEngineResult,
) -> dict[str, Any]:
    event_types = [event.event_type for event in result.events if getattr(event, "event_type", None)]
    return {
        "type": "paper_execution",
        "traderId": trader_id,
        "symbol": symbol,
        "price": float(price),
        "candle": {
            "open": float(candle["open"]),
            "high": float(candle["high"]),
            "low": float(candle["low"]),
            "close": float(candle["close"]),
            "timestamp": candle["timestamp"].isoformat() if candle.get("timestamp") else None,
        },
        "eventTypes": event_types,
        "filledOrderIds": [order.id for order in result.filled_orders if order.id is not None],
        "closedPositionIds": [position.id for position in result.closed_positions if position.id is not None],
        "rejectedOrderIds": [order.id for order in result.rejected_orders if order.id is not None],
        "events": [serialize_record(event) for event in result.events],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceId": _PROCESS_ID,
    }


class RealtimeExecutionEventHub:
    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.Queue[dict[str, Any]], Optional[str], Optional[str]]] = set()

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def subscribe(self, *, trader_id: Optional[str] = None, symbol: Optional[str] = None) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=20)
        clean_symbol = normalize_execution_symbol(symbol) if symbol else None
        self._subscribers.add((queue, trader_id, clean_symbol))
        REALTIME_EXECUTION_STATE["subscribers"] = self.subscriber_count
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers = {item for item in self._subscribers if item[0] is not queue}
        REALTIME_EXECUTION_STATE["subscribers"] = self.subscriber_count

    def publish(self, payload: dict[str, Any]) -> None:
        if not self._subscribers:
            return
        for queue, trader_id, symbol in list(self._subscribers):
            if trader_id and payload.get("traderId") != trader_id:
                continue
            if symbol and payload.get("symbol") != symbol:
                continue
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass


EXECUTION_EVENT_HUB = RealtimeExecutionEventHub()


def _redis_channel() -> str:
    prefix = get_settings().redis_key_prefix.strip() or "aigentra"
    return f"{prefix}:{_REDIS_CHANNEL_SUFFIX}"


def _redis_pubsub_client() -> Optional[Any]:
    global _REDIS_CLIENT
    settings = get_settings()
    if not settings.redis_url or redis is None:
        REALTIME_EXECUTION_STATE["redisPubSub"] = False
        return None
    if time.monotonic() < _REDIS_DISABLED_UNTIL:
        REALTIME_EXECUTION_STATE["redisPubSub"] = False
        return None
    if _REDIS_CLIENT is None:
        _REDIS_CLIENT = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=settings.redis_socket_timeout_seconds,
            socket_connect_timeout=settings.redis_socket_timeout_seconds,
        )
    REALTIME_EXECUTION_STATE["redisPubSub"] = True
    return _REDIS_CLIENT


async def _publish_redis_event(payload: dict[str, Any]) -> None:
    global _REDIS_DISABLED_UNTIL
    client = _redis_pubsub_client()
    if client is None:
        return
    try:
        await client.publish(_redis_channel(), json.dumps(payload, ensure_ascii=False, default=str))
    except (RedisError, TypeError):
        _REDIS_DISABLED_UNTIL = time.monotonic() + 30
        REALTIME_EXECUTION_STATE["redisPubSub"] = False


async def publish_execution_event(payload: dict[str, Any]) -> None:
    EXECUTION_EVENT_HUB.publish(payload)
    await _publish_redis_event(payload)


async def run_realtime_execution_once(
    *,
    symbols: Optional[list[str]] = None,
    price_by_symbol: Optional[dict[str, Decimal | float | int | str]] = None,
    market_client_factory: Callable[[], MarketDataClient] = MarketDataClient,
    on_result: Optional[RealtimeResultCallback] = None,
) -> dict[str, Any]:
    settings = get_settings()
    requested_symbols = symbols or settings.realtime_paper_execution_symbols or settings.auto_scanner_symbols or ["BTCUSDT"]
    clean_symbols = [normalize_execution_symbol(symbol) for symbol in requested_symbols]
    started_at = datetime.now(timezone.utc)
    counts = {
        "symbols": len(clean_symbols),
        "tradersChecked": 0,
        "activeExposure": 0,
        "openOrders": 0,
        "openPositions": 0,
        "events": 0,
        "fills": 0,
        "closes": 0,
        "rejections": 0,
        "errors": 0,
    }
    results: list[dict[str, Any]] = []

    if _EXECUTION_LOCK.locked():
        REALTIME_EXECUTION_STATE.update(
            {
                "skippedTicks": int(REALTIME_EXECUTION_STATE.get("skippedTicks") or 0) + 1,
                "lastSkippedAt": datetime.now(timezone.utc).isoformat(),
                "lastSkipReason": "previous_realtime_execution_tick_still_running",
            }
        )
        return {
            "status": "skipped",
            "reason": "previous_realtime_execution_tick_still_running",
            "symbols": clean_symbols,
            "counts": counts,
            "results": results,
        }

    async with _EXECUTION_LOCK:
        REALTIME_EXECUTION_STATE.update(
            {
                "scanInProgress": True,
                "currentScanStartedAt": started_at.isoformat(),
                "lastStartedAt": started_at.isoformat(),
            }
        )
        try:
            for symbol in clean_symbols:
                try:
                    with session_scope() as db:
                        active_traders = active_exposure_trader_ids(db, symbol)
                except Exception as exc:
                    counts["errors"] += 1
                    results.append(
                        {
                            "symbol": symbol,
                            "status": "ERROR",
                            "error": sanitize_error_message(str(exc)),
                        }
                    )
                    continue

                if not active_traders:
                    results.append({"symbol": symbol, "status": "NO_ACTIVE_EXPOSURE", "tradersChecked": 0})
                    continue

                try:
                    previous_price = _LAST_PRICE_BY_SYMBOL.get(symbol)
                    if price_by_symbol and symbol in price_by_symbol:
                        price = to_positive_execution_price(Decimal(str(price_by_symbol[symbol])))
                        candle = execution_tick_candle(symbol, price, previous_price)
                    else:
                        price, candle = await fetch_execution_candle(
                            symbol,
                            market_client_factory(),
                            previous_price=previous_price,
                        )
                except Exception as exc:
                    counts["errors"] += 1
                    results.append(
                        {
                            "symbol": symbol,
                            "status": "PRICE_ERROR",
                            "error": sanitize_error_message(str(exc)),
                        }
                    )
                    continue

                _LAST_PRICE_BY_SYMBOL[symbol] = price
                symbol_changed_traders: list[str] = []

                for trader_id in active_traders:
                    counts["tradersChecked"] += 1
                    try:
                        result_payload: Optional[dict[str, Any]] = None
                        result_status = "MARKED_TO_MARKET"
                        result_event_types: list[str] = []
                        before_counts = {"openOrders": 0, "openPositions": 0}
                        after_counts = {"openOrders": 0, "openPositions": 0}
                        with session_scope() as db:
                            before = list_active_paper_exposure(db, trader_id, symbol)
                            sync_default_paper_settings(db, trader_id, symbol, settings)
                            result = process_candle(db, trader_id, symbol, candle)
                            after = list_active_paper_exposure(db, trader_id, symbol)
                            before_counts = {
                                "openOrders": len(before.get("openOrders") or []),
                                "openPositions": len(before.get("openPositions") or []),
                            }
                            after_counts = {
                                "openOrders": len(after.get("openOrders") or []),
                                "openPositions": len(after.get("openPositions") or []),
                            }
                            counts["activeExposure"] += 1
                            counts["openOrders"] += after_counts["openOrders"]
                            counts["openPositions"] += after_counts["openPositions"]
                            counts["events"] += len(result.events)
                            counts["fills"] += len(result.filled_orders)
                            counts["closes"] += len(result.closed_positions)
                            counts["rejections"] += len(result.rejected_orders)
                            if _result_has_execution_change(result):
                                if on_result:
                                    callback_result = on_result(db, trader_id, symbol, result)
                                    if callback_result is not None:
                                        await callback_result
                                global _EVENT_SEQUENCE
                                _EVENT_SEQUENCE += 1
                                result_payload = _result_payload(
                                    trader_id=trader_id,
                                    symbol=symbol,
                                    price=price,
                                    candle=candle,
                                    result=result,
                                )
                                result_payload["sequence"] = _EVENT_SEQUENCE
                                result_status = "UPDATED"
                                result_event_types = [event.event_type for event in result.events]
                        if result_payload:
                            await publish_execution_event(result_payload)
                            symbol_changed_traders.append(trader_id)
                        results.append(
                            {
                                "traderId": trader_id,
                                "symbol": symbol,
                                "status": result_status,
                                "before": before_counts,
                                "after": after_counts,
                                "eventTypes": result_event_types,
                            }
                        )
                    except Exception as exc:
                        counts["errors"] += 1
                        results.append(
                            {
                                "traderId": trader_id,
                                "symbol": symbol,
                                "status": "ERROR",
                                "error": sanitize_error_message(str(exc)),
                            }
                        )

                results.append(
                    {
                        "symbol": symbol,
                        "status": "PROCESSED",
                        "price": float(price),
                        "tradersChecked": len(active_traders),
                        "changedTraders": symbol_changed_traders,
                    }
                )
        finally:
            finished_at = datetime.now(timezone.utc)
            status = "ok" if counts["errors"] == 0 else "partial_error"
            payload = {
                "status": status,
                "mode": "paper",
                "paperOnly": True,
                "symbols": clean_symbols,
                "startedAt": started_at.isoformat(),
                "finishedAt": finished_at.isoformat(),
                "durationMs": int((finished_at - started_at).total_seconds() * 1000),
                "counts": counts,
                "results": results,
            }
            REALTIME_EXECUTION_STATE.update(
                {
                    "cycles": int(REALTIME_EXECUTION_STATE.get("cycles") or 0) + 1,
                    "lastFinishedAt": payload["finishedAt"],
                    "lastError": None if counts["errors"] == 0 else "One or more realtime execution checks failed.",
                    "lastResult": payload,
                    "scanInProgress": False,
                    "currentScanStartedAt": None,
                }
            )
    return REALTIME_EXECUTION_STATE["lastResult"]


def run_realtime_execution_once_sync(
    *,
    symbols: Optional[list[str]] = None,
    on_result: Optional[RealtimeResultCallback] = None,
) -> dict[str, Any]:
    return asyncio.run(run_realtime_execution_once(symbols=symbols, on_result=on_result))


async def auto_realtime_execution_loop(*, on_result: Optional[RealtimeResultCallback] = None) -> None:
    settings = get_settings()
    interval = max(0.5, min(10.0, float(settings.realtime_paper_execution_interval_seconds or 1.0)))
    symbols = settings.realtime_paper_execution_symbols or settings.auto_scanner_symbols or ["BTCUSDT"]
    REALTIME_EXECUTION_STATE.update(
        {
            "enabled": True,
            "running": True,
            "symbols": [normalize_execution_symbol(symbol) for symbol in symbols],
            "intervalSeconds": interval,
            "lastError": None,
        }
    )
    next_tick = time.monotonic()

    try:
        while True:
            sleep_seconds = max(0.0, next_tick - time.monotonic())
            REALTIME_EXECUTION_STATE["nextTickAt"] = (
                datetime.now(timezone.utc).replace(microsecond=0) + timedelta(seconds=sleep_seconds)
            )
            REALTIME_EXECUTION_STATE["nextTickAt"] = REALTIME_EXECUTION_STATE["nextTickAt"].isoformat()
            if sleep_seconds > 0:
                await asyncio.sleep(sleep_seconds)
            REALTIME_EXECUTION_STATE.update(
                {
                    "ticks": int(REALTIME_EXECUTION_STATE.get("ticks") or 0) + 1,
                    "lastTickAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            next_tick += interval
            try:
                await asyncio.to_thread(run_realtime_execution_once_sync, symbols=symbols, on_result=on_result)
            except Exception as exc:
                REALTIME_EXECUTION_STATE.update(
                    {
                        "lastError": sanitize_error_message(str(exc)),
                        "lastFinishedAt": datetime.now(timezone.utc).isoformat(),
                    }
                )
    except asyncio.CancelledError:
        REALTIME_EXECUTION_STATE.update({"running": False})
        raise


async def execution_event_stream(request: Any, *, trader_id: str, symbol: str):
    queue = EXECUTION_EVENT_HUB.subscribe(trader_id=trader_id, symbol=symbol)
    redis_task: Optional[asyncio.Task] = None
    seen: set[tuple[str, Any]] = set()

    async def redis_reader() -> None:
        global _REDIS_DISABLED_UNTIL
        client = _redis_pubsub_client()
        if client is None:
            return
        pubsub = client.pubsub()
        try:
            await pubsub.subscribe(_redis_channel())
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message.get("data") or "{}")
                except (json.JSONDecodeError, TypeError):
                    continue
                if payload.get("sourceId") == _PROCESS_ID:
                    continue
                if trader_id and payload.get("traderId") != trader_id:
                    continue
                if symbol and payload.get("symbol") != normalize_execution_symbol(symbol):
                    continue
                if queue.full():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                queue.put_nowait(payload)
        except (asyncio.CancelledError, GeneratorExit):
            raise
        except RedisError:
            _REDIS_DISABLED_UNTIL = time.monotonic() + 30
            REALTIME_EXECUTION_STATE["redisPubSub"] = False
        finally:
            try:
                await pubsub.unsubscribe(_redis_channel())
                await pubsub.close()
            except Exception:
                pass

    redis_task = asyncio.create_task(redis_reader())
    try:
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                payload = await asyncio.wait_for(queue.get(), timeout=15)
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
                continue
            event_key = (str(payload.get("sourceId") or ""), payload.get("sequence"))
            if event_key in seen:
                continue
            seen.add(event_key)
            if len(seen) > 200:
                seen = set(list(seen)[-100:])
            yield f"event: paper_execution\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"
    finally:
        if redis_task and not redis_task.done():
            redis_task.cancel()
            try:
                await redis_task
            except asyncio.CancelledError:
                pass
        EXECUTION_EVENT_HUB.unsubscribe(queue)
