import asyncio
import json
import time
from typing import Any, Dict, Optional

import httpx

try:
    import redis.asyncio as redis
    from redis.exceptions import RedisError
except ImportError:
    redis = None

    class RedisError(Exception):
        pass

from app.clients.binance_client import BinanceClient, Candle
from app.clients.market_data_client import MarketDataClient
from app.core.config import get_settings


KLINE_CACHE: Dict[tuple[str, str, int], tuple[float, list[Candle]]] = {}
DERIVATIVES_CACHE: Dict[tuple[str, str], tuple[float, Dict[str, Any]]] = {}
SERIES_CACHE: Dict[tuple[str, str, str, int], tuple[float, list[Dict[str, Any]]]] = {}
_REDIS_CLIENT: Optional[Any] = None
_REDIS_DISABLED_UNTIL = 0.0


def interval_cache_ttl(interval: str) -> int:
    if interval == "1m":
        return 35
    if interval == "5m":
        return 120
    if interval in {"15m", "30m"}:
        return 300
    if interval == "1h":
        return 900
    if interval == "4h":
        return 1800
    return 3600


def redis_cache_configured() -> bool:
    settings = get_settings()
    return bool(settings.redis_url and settings.redis_market_cache_enabled and redis is not None)


def market_cache_runtime() -> dict[str, Any]:
    settings = get_settings()
    return {
        "marketDataProvider": settings.market_data_provider,
        "marketDataFallbackProvider": settings.market_data_fallback_provider,
        "marketDataWarmEnabled": settings.market_data_warm_enabled,
        "marketDataWarmSymbols": settings.market_data_warm_symbols,
        "marketDataWarmIntervals": settings.market_data_warm_intervals,
        "marketDataWarmLimit": settings.market_data_warm_limit,
        "redisConfigured": bool(settings.redis_url),
        "redisMarketCacheEnabled": bool(settings.redis_market_cache_enabled),
        "redisAvailable": bool(redis_cache_configured() and time.monotonic() >= _REDIS_DISABLED_UNTIL),
        "redisKeyPrefix": settings.redis_key_prefix,
        "memoryKlineEntries": len(KLINE_CACHE),
        "memoryDerivativeEntries": len(DERIVATIVES_CACHE),
        "memorySeriesEntries": len(SERIES_CACHE),
    }


def _redis_client() -> Optional[Any]:
    global _REDIS_CLIENT
    settings = get_settings()
    if not redis_cache_configured():
        return None
    if _REDIS_CLIENT is None:
        _REDIS_CLIENT = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=settings.redis_socket_timeout_seconds,
            socket_connect_timeout=settings.redis_socket_timeout_seconds,
        )
    return _REDIS_CLIENT


def _cache_key(namespace: str, *parts: Any) -> str:
    prefix = get_settings().redis_key_prefix.strip() or "aigentra"
    clean_parts = [str(part).replace(" ", "_").replace(":", "_") for part in parts]
    return ":".join([prefix, "market", namespace, *clean_parts])


def shared_cache_key(namespace: str, *parts: Any) -> str:
    return _cache_key(namespace, *parts)


async def _redis_get_json(key: str) -> Optional[Any]:
    global _REDIS_DISABLED_UNTIL
    if time.monotonic() < _REDIS_DISABLED_UNTIL:
        return None
    client = _redis_client()
    if client is None:
        return None
    try:
        raw = await client.get(key)
    except RedisError:
        _REDIS_DISABLED_UNTIL = time.monotonic() + 30
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def _redis_set_json(key: str, value: Any, ttl: int) -> None:
    global _REDIS_DISABLED_UNTIL
    if time.monotonic() < _REDIS_DISABLED_UNTIL:
        return
    client = _redis_client()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value, separators=(",", ":"), default=str), ex=max(1, ttl))
    except (RedisError, TypeError):
        _REDIS_DISABLED_UNTIL = time.monotonic() + 30


async def redis_get_json(key: str) -> Optional[Any]:
    return await _redis_get_json(key)


async def redis_set_json(key: str, value: Any, ttl: int) -> None:
    await _redis_set_json(key, value, ttl)


def _trim_cache(cache: Dict[Any, tuple[float, Any]], max_entries: int = 240) -> None:
    if len(cache) <= max_entries:
        return
    oldest_key = min(cache, key=lambda cache_key: cache[cache_key][0])
    cache.pop(oldest_key, None)


def _candles_from_json(data: Any) -> list[Candle]:
    if not isinstance(data, list):
        return []
    candles: list[Candle] = []
    for item in data:
        if isinstance(item, dict):
            candles.append(Candle.model_validate(item))
    return candles


async def cached_klines(client: BinanceClient, symbol: str, interval: str, limit: int) -> list[Candle]:
    clean_symbol = symbol.upper()
    key = (clean_symbol, interval, limit)
    ttl = interval_cache_ttl(interval)
    now = time.monotonic()
    superset = _memory_kline_superset(clean_symbol, interval, limit, now)
    if superset:
        return superset
    cached = KLINE_CACHE.get(key)
    if cached and cached[0] > now:
        return cached[1]

    redis_key = _cache_key("klines:v1", clean_symbol, interval, limit)
    redis_payload = await _redis_get_json(redis_key)
    redis_candles = _candles_from_json(redis_payload)
    if redis_candles:
        KLINE_CACHE[key] = (now + ttl, redis_candles)
        _trim_cache(KLINE_CACHE)
        return redis_candles

    warm_limit = max(limit, get_settings().market_data_warm_limit)
    if warm_limit > limit:
        warm_payload = await _redis_get_json(_cache_key("klines:v1", clean_symbol, interval, warm_limit))
        warm_candles = _candles_from_json(warm_payload)
        if len(warm_candles) >= limit:
            sliced = warm_candles[-limit:]
            KLINE_CACHE[key] = (now + ttl, sliced)
            _trim_cache(KLINE_CACHE)
            return sliced

    candles = await client.get_klines(symbol=clean_symbol, interval=interval, limit=limit)
    KLINE_CACHE[key] = (now + ttl, candles)
    _trim_cache(KLINE_CACHE)
    await _redis_set_json(redis_key, [candle.model_dump() for candle in candles], ttl)
    return candles


async def cached_klines_before(client: MarketDataClient, symbol: str, interval: str, limit: int, before: int) -> list[Candle]:
    clean_symbol = symbol.upper()
    safe_before = int(before)
    safe_limit = max(1, min(int(limit), get_settings().market_data_max_limit))
    ttl = max(interval_cache_ttl(interval), 3600)
    redis_key = _cache_key("klines_page:v1", clean_symbol, interval, safe_limit, safe_before)
    redis_payload = await _redis_get_json(redis_key)
    redis_candles = _candles_from_json(redis_payload)
    if redis_candles:
        return redis_candles

    candles = await client.get_klines(symbol=clean_symbol, interval=interval, limit=safe_limit, before=safe_before)
    await _redis_set_json(redis_key, [candle.model_dump() for candle in candles], ttl)
    return candles


async def warm_market_cache(client: MarketDataClient) -> dict[str, Any]:
    settings = get_settings()
    if not settings.market_data_warm_enabled:
        return {"enabled": False, "warmed": 0, "errors": 0}
    intervals = [interval for interval in settings.market_data_warm_intervals if interval]
    tasks = [
        cached_klines(client, symbol=symbol, interval=interval, limit=settings.market_data_warm_limit)
        for symbol in settings.market_data_warm_symbols
        for interval in intervals
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    errors = sum(1 for result in results if isinstance(result, Exception))
    return {"enabled": True, "warmed": len(results) - errors, "errors": errors}


def _memory_kline_superset(symbol: str, interval: str, limit: int, now: float) -> list[Candle]:
    best: list[Candle] = []
    for (cached_symbol, cached_interval, cached_limit), (expires_at, candles) in KLINE_CACHE.items():
        if cached_symbol != symbol or cached_interval != interval or cached_limit < limit or expires_at <= now:
            continue
        if len(candles) > len(best):
            best = candles
    return best[-limit:] if len(best) >= limit else []


async def cached_derivative(client: BinanceClient, symbol: str, name: str) -> Dict[str, Any]:
    clean_symbol = symbol.upper()
    key = (clean_symbol, name)
    now = time.monotonic()
    cached = DERIVATIVES_CACHE.get(key)
    if cached and cached[0] > now:
        return cached[1]

    ttl = 45 if name == "open_interest" else 30
    redis_key = _cache_key("derivative:v1", clean_symbol, name)
    redis_payload = await _redis_get_json(redis_key)
    if isinstance(redis_payload, dict):
        DERIVATIVES_CACHE[key] = (now + ttl, redis_payload)
        return redis_payload

    data = await client.get_open_interest(clean_symbol) if name == "open_interest" else await client.get_premium_index(clean_symbol)
    DERIVATIVES_CACHE[key] = (now + ttl, data)
    await _redis_set_json(redis_key, data, ttl)
    return data


async def cached_series(
    client: BinanceClient,
    symbol: str,
    name: str,
    period: str = "5m",
    limit: int = 30,
) -> list[Dict[str, Any]]:
    clean_symbol = symbol.upper()
    key = (clean_symbol, name, period, limit)
    now = time.monotonic()
    cached = SERIES_CACHE.get(key)
    if cached and cached[0] > now:
        return cached[1]

    ttl = 300 if name == "funding_rate_history" else 120
    redis_key = _cache_key("series:v1", clean_symbol, name, period, limit)
    redis_payload = await _redis_get_json(redis_key)
    if isinstance(redis_payload, list):
        SERIES_CACHE[key] = (now + ttl, redis_payload)
        _trim_cache(SERIES_CACHE)
        return redis_payload

    method_by_name = {
        "open_interest_history": client.get_open_interest_history,
        "funding_rate_history": client.get_funding_rate_history,
        "global_long_short": client.get_global_long_short_account_ratio,
        "top_long_short_account": client.get_top_long_short_account_ratio,
        "top_long_short_position": client.get_top_long_short_position_ratio,
        "taker_buy_sell": client.get_taker_buy_sell_volume,
    }
    method = method_by_name[name]
    try:
        data = await method(clean_symbol, limit=limit) if name == "funding_rate_history" else await method(clean_symbol, period=period, limit=limit)
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        data = []
        ttl = 45
    SERIES_CACHE[key] = (now + ttl, data)
    _trim_cache(SERIES_CACHE)
    await _redis_set_json(redis_key, data, ttl)
    return data
