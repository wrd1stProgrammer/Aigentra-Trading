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
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.clients.binance_client import ALLOWED_SYMBOLS, Candle as MarketCandle
from app.clients.market_data_client import MarketDataClient
from app.core.config import get_settings
from app.db import PaperExecutionCursorRecord, PaperOrderRecord, PaperPositionRecord, session_scope, utc_now
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
_LAST_CANDLE_OPEN_TIME_BY_SYMBOL: dict[str, int] = {}
_EVENT_SEQUENCE = 0
_PROCESS_ID = uuid.uuid4().hex
_REDIS_CLIENT: Optional[Any] = None
_REDIS_DISABLED_UNTIL = 0.0
_REDIS_CHANNEL_SUFFIX = "paper_execution_events:v1"
_EXECUTION_CANDLE_INTERVAL = "1m"


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
        "openTimeMs": None,
    }


def execution_market_candle(symbol: str, candle: MarketCandle) -> dict[str, Any]:
    return {
        "symbol": normalize_execution_symbol(symbol),
        "open": Decimal(str(candle.open)),
        "high": Decimal(str(candle.high)),
        "low": Decimal(str(candle.low)),
        "close": Decimal(str(candle.close)),
        "timestamp": datetime.fromtimestamp(candle.openTime / 1000, timezone.utc),
        "openTimeMs": int(candle.openTime),
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
        "openTimeMs": candle.get("openTimeMs"),
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


def oldest_active_exposure_started_at(db: Session, symbol: str) -> Optional[datetime]:
    clean_symbol = normalize_execution_symbol(symbol)
    order_times = db.execute(
        select(PaperOrderRecord.submitted_at).where(
            PaperOrderRecord.symbol == clean_symbol,
            PaperOrderRecord.status == "open",
        )
    ).scalars()
    position_times = db.execute(
        select(PaperPositionRecord.opened_at).where(
            PaperPositionRecord.symbol == clean_symbol,
            PaperPositionRecord.status == "open",
        )
    ).scalars()
    started_times = [started_at for started_at in [*order_times, *position_times] if started_at is not None]
    if not started_times:
        return None
    return min(_aware_utc(started_at) for started_at in started_times)


def execution_cursor_open_time_ms(db: Session, symbol: str, interval: str = _EXECUTION_CANDLE_INTERVAL) -> Optional[int]:
    clean_symbol = normalize_execution_symbol(symbol)
    cursor = db.execute(
        select(PaperExecutionCursorRecord.last_open_time_ms).where(
            PaperExecutionCursorRecord.symbol == clean_symbol,
            PaperExecutionCursorRecord.interval == interval,
        )
    ).scalar_one_or_none()
    if cursor is None:
        return None
    return int(cursor)


async def fetch_execution_price(symbol: str, market_client: Optional[MarketDataClient] = None) -> Decimal:
    client = market_client or MarketDataClient(timeout_seconds=3.0)
    premium = await client.get_premium_index(normalize_execution_symbol(symbol))
    price = Decimal(str(premium.get("markPrice") or 0))
    if price <= 0:
        raise ValueError("market data provider returned an invalid mark price")
    return price


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _candle_open_time_ms(candle: dict[str, Any]) -> Optional[int]:
    raw_value = candle.get("openTimeMs")
    if raw_value is None:
        return None
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return None


def _execution_backfill_since(
    symbol: str,
    oldest_active_at: Optional[datetime],
    now: datetime,
    last_open_time_ms: Optional[int] = None,
) -> Optional[datetime]:
    settings = get_settings()
    effective_open_time_ms = last_open_time_ms if last_open_time_ms is not None else _LAST_CANDLE_OPEN_TIME_BY_SYMBOL.get(symbol)
    if effective_open_time_ms is not None:
        return datetime.fromtimestamp(effective_open_time_ms / 1000, timezone.utc)
    if oldest_active_at is None:
        return None
    lookback_minutes = max(1, int(settings.realtime_paper_execution_backfill_minutes or 1))
    backfill_floor = now - timedelta(minutes=lookback_minutes)
    return max(_aware_utc(oldest_active_at), backfill_floor)


def _filter_execution_candles_since(candles: list[dict[str, Any]], since: Optional[datetime]) -> list[dict[str, Any]]:
    if since is None:
        return candles
    since_ms = int(_aware_utc(since).timestamp() * 1000)
    return [candle for candle in candles if (_candle_open_time_ms(candle) is None or _candle_open_time_ms(candle) >= since_ms)]


def _latest_candle_open_time_ms(candles: list[dict[str, Any]]) -> Optional[int]:
    open_times = [_candle_open_time_ms(candle) for candle in candles]
    valid_open_times = [open_time for open_time in open_times if open_time is not None]
    if not valid_open_times:
        return None
    return max(valid_open_times)


def _mark_symbol_candles_processed(symbol: str, last_open_time_ms: Optional[int]) -> None:
    if last_open_time_ms is not None:
        _LAST_CANDLE_OPEN_TIME_BY_SYMBOL[symbol] = last_open_time_ms


def upsert_execution_cursor(
    db: Session,
    symbol: str,
    last_open_time_ms: Optional[int],
    interval: str = _EXECUTION_CANDLE_INTERVAL,
) -> Optional[int]:
    if last_open_time_ms is None:
        return None
    clean_symbol = normalize_execution_symbol(symbol)
    last_candle_at = datetime.fromtimestamp(last_open_time_ms / 1000, timezone.utc)
    cursor = db.execute(
        select(PaperExecutionCursorRecord).where(
            PaperExecutionCursorRecord.symbol == clean_symbol,
            PaperExecutionCursorRecord.interval == interval,
        )
    ).scalar_one_or_none()
    if cursor is None:
        cursor = PaperExecutionCursorRecord(
            symbol=clean_symbol,
            interval=interval,
            last_open_time_ms=last_open_time_ms,
            last_candle_at=last_candle_at,
        )
        db.add(cursor)
    elif cursor.last_open_time_ms <= last_open_time_ms:
        cursor.last_open_time_ms = last_open_time_ms
        cursor.last_candle_at = last_candle_at
        cursor.updated_at = utc_now()
    db.flush()
    persisted_open_time_ms = int(cursor.last_open_time_ms)
    _mark_symbol_candles_processed(clean_symbol, persisted_open_time_ms)
    return persisted_open_time_ms


def _merge_paper_engine_result(target: PaperEngineResult, source: PaperEngineResult) -> None:
    target.filled_orders.extend(source.filled_orders)
    target.closed_positions.extend(source.closed_positions)
    target.rejected_orders.extend(source.rejected_orders)
    target.events.extend(source.events)
    if source.snapshot is not None:
        target.snapshot = source.snapshot


async def fetch_execution_candles(
    symbol: str,
    market_client: Optional[MarketDataClient] = None,
    *,
    previous_price: Optional[Decimal] = None,
    since: Optional[datetime] = None,
) -> tuple[Decimal, list[dict[str, Any]]]:
    client = market_client or MarketDataClient(timeout_seconds=3.0)
    settings = get_settings()
    page_limit = max(2, int(settings.realtime_paper_execution_backfill_page_limit or 300))
    try:
        candles = await client.get_klines(normalize_execution_symbol(symbol), "1m", page_limit)
    except (httpx.HTTPError, KeyError, RuntimeError, TypeError, ValueError):
        price = await fetch_execution_price(symbol, client)
        return price, [execution_tick_candle(symbol, price, previous_price)]
    if not candles:
        price = await fetch_execution_price(symbol, client)
        return price, [execution_tick_candle(symbol, price, previous_price)]

    all_candles = list(candles)
    if since is not None:
        since_ms = int(_aware_utc(since).timestamp() * 1000)
        backfill_minutes = max(1, int(settings.realtime_paper_execution_backfill_minutes or 1))
        max_pages = max(1, min(30, (backfill_minutes // page_limit) + 3))
        pages_read = 1
        while all_candles and min(int(candle.openTime) for candle in all_candles) > since_ms and pages_read < max_pages:
            before = min(int(candle.openTime) for candle in all_candles) - 1
            previous_page = await client.get_klines(normalize_execution_symbol(symbol), "1m", page_limit, before=before)
            if not previous_page:
                break
            all_candles.extend(previous_page)
            pages_read += 1

    deduped = {int(candle.openTime): candle for candle in all_candles}
    market_candles = [
        execution_market_candle(symbol, candle)
        for _, candle in sorted(deduped.items(), key=lambda item: item[0])
    ]
    market_candles = _filter_execution_candles_since(market_candles, since)

    if not market_candles:
        latest_candle = execution_market_candle(symbol, deduped[max(deduped)])
        try:
            price = await fetch_execution_price(symbol, client)
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            price = to_positive_execution_price(latest_candle["close"])
        return price, [execution_live_market_candle(symbol, latest_candle, price, previous_price)]

    try:
        price = await fetch_execution_price(symbol, client)
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        price = to_positive_execution_price(market_candles[-1]["close"])
    market_candles[-1] = execution_live_market_candle(symbol, market_candles[-1], price, previous_price)
    return price, market_candles


async def fetch_execution_candle(
    symbol: str,
    market_client: Optional[MarketDataClient] = None,
    *,
    previous_price: Optional[Decimal] = None,
) -> tuple[Decimal, dict[str, Any]]:
    price, candles = await fetch_execution_candles(symbol, market_client, previous_price=previous_price)
    return price, candles[-1]


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
                        oldest_active_at = oldest_active_exposure_started_at(db, symbol)
                        cursor_open_time_ms = execution_cursor_open_time_ms(db, symbol)
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

                _mark_symbol_candles_processed(symbol, cursor_open_time_ms)
                try:
                    previous_price = _LAST_PRICE_BY_SYMBOL.get(symbol)
                    if price_by_symbol and symbol in price_by_symbol:
                        price = to_positive_execution_price(Decimal(str(price_by_symbol[symbol])))
                        candles = [execution_tick_candle(symbol, price, previous_price)]
                    else:
                        since = _execution_backfill_since(symbol, oldest_active_at, started_at, cursor_open_time_ms)
                        price, candles = await fetch_execution_candles(
                            symbol,
                            market_client_factory(),
                            previous_price=previous_price,
                            since=since,
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
                latest_open_time_ms = _latest_candle_open_time_ms(candles)
                latest_candle = candles[-1]
                symbol_changed_traders: list[str] = []
                symbol_error_count = 0

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
                            result = PaperEngineResult()
                            for execution_candle in candles:
                                candle_result = process_candle(db, trader_id, symbol, execution_candle)
                                _merge_paper_engine_result(result, candle_result)
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
                                    candle=latest_candle,
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
                        symbol_error_count += 1
                        counts["errors"] += 1
                        results.append(
                            {
                                "traderId": trader_id,
                                "symbol": symbol,
                                "status": "ERROR",
                                "error": sanitize_error_message(str(exc)),
                            }
                        )

                cursor_status = "UNCHANGED"
                persisted_cursor_open_time_ms = None
                if symbol_error_count == 0:
                    try:
                        with session_scope() as db:
                            persisted_cursor_open_time_ms = upsert_execution_cursor(db, symbol, latest_open_time_ms)
                        if persisted_cursor_open_time_ms is not None:
                            cursor_status = "ADVANCED"
                    except SQLAlchemyError as exc:
                        counts["errors"] += 1
                        cursor_status = "ERROR"
                        results.append(
                            {
                                "symbol": symbol,
                                "status": "CURSOR_ERROR",
                                "error": sanitize_error_message(str(exc)),
                            }
                        )
                else:
                    cursor_status = "SKIPPED_AFTER_TRADER_ERROR"

                results.append(
                    {
                        "symbol": symbol,
                        "status": "PROCESSED",
                        "price": float(price),
                        "candlesProcessed": len(candles),
                        "tradersChecked": len(active_traders),
                        "changedTraders": symbol_changed_traders,
                        "cursorStatus": cursor_status,
                        "cursorOpenTimeMs": persisted_cursor_open_time_ms,
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
