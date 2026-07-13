from __future__ import annotations

from datetime import datetime, timezone
import json
import time
from statistics import mean, pstdev
from typing import Any, Dict, Iterable, Optional

import httpx

try:
    import redis.asyncio as redis
    from redis.exceptions import RedisError
except ImportError:
    redis = None

    class RedisError(Exception):
        pass

from app.core.config import get_settings


COINALYZE_BTC_SYMBOLS = ("BTCUSDT_PERP.A", "BTCUSDT.6", "BTCUSDT_PERP.3")
_DERIBIT_SKEW_HISTORY: dict[str, dict[int, float]] = {}


def _skew_history_state(spread: float, now: datetime, expiry_key: str) -> tuple[float, int, int]:
    bucket = int(now.timestamp() // (15 * 60))
    expiry_history = _DERIBIT_SKEW_HISTORY.setdefault(expiry_key, {})
    expiry_history[bucket] = spread
    minimum_bucket = bucket - (7 * 24 * 4)
    for history in _DERIBIT_SKEW_HISTORY.values():
        for stale_bucket in [key for key in history if key < minimum_bucket]:
            history.pop(stale_bucket, None)
    records = [(key, value) for key, value in sorted(expiry_history.items()) if key <= bucket]
    observations = [value for _, value in records]
    zscores: list[float] = []
    for index, value in enumerate(observations):
        prior = observations[:index]
        if len(prior) < 8:
            zscores.append(0.0)
            continue
        deviation = pstdev(prior)
        zscores.append((value - mean(prior)) / deviation if deviation > 0 else 0.0)
    current_zscore = zscores[-1] if zscores else 0.0
    direction = 1 if current_zscore >= 1.25 else -1 if current_zscore <= -1.25 else 0
    persistence = 0
    previous_bucket: Optional[int] = None
    for (observation_bucket, _), zscore in zip(reversed(records), reversed(zscores)):
        if previous_bucket is not None and previous_bucket - observation_bucket != 1:
            break
        zscore_direction = 1 if zscore >= 1.25 else -1 if zscore <= -1.25 else 0
        if direction == 0 or zscore_direction != direction:
            break
        persistence += 1
        previous_bucket = observation_bucket
    return current_zscore, len(observations), persistence


def _serialize_skew_history() -> dict[str, dict[str, float]]:
    return {
        expiry_key: {str(bucket): spread for bucket, spread in history.items()}
        for expiry_key, history in _DERIBIT_SKEW_HISTORY.items()
    }


def _restore_skew_history(payload: Any) -> None:
    if not isinstance(payload, dict):
        return
    restored: dict[str, dict[int, float]] = {}
    for expiry_key, history in payload.items():
        if not isinstance(history, dict):
            continue
        clean_history: dict[int, float] = {}
        for bucket, spread in history.items():
            try:
                clean_history[int(bucket)] = float(spread)
            except (TypeError, ValueError):
                continue
        if clean_history:
            restored[str(expiry_key)] = clean_history
    _DERIBIT_SKEW_HISTORY.update(restored)


async def _persistent_skew_history_state(
    spread: float,
    now: datetime,
    expiry_key: str,
) -> tuple[float, int, int]:
    settings = get_settings()
    if redis is None or not settings.redis_url or not settings.redis_market_cache_enabled:
        return _skew_history_state(spread, now, expiry_key)
    client = redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_timeout=settings.redis_socket_timeout_seconds,
        socket_connect_timeout=settings.redis_socket_timeout_seconds,
    )
    cache_key = f"{settings.redis_key_prefix.strip() or 'aigentra'}:market:deribit_skew_history:v2"
    try:
        raw = await client.get(cache_key)
        if raw:
            _restore_skew_history(json.loads(raw))
        result = _skew_history_state(spread, now, expiry_key)
        await client.set(cache_key, json.dumps(_serialize_skew_history()), ex=8 * 24 * 60 * 60)
        return result
    except (RedisError, json.JSONDecodeError, TypeError, ValueError):
        return _skew_history_state(spread, now, expiry_key)
    finally:
        await client.aclose()


class ExternalDerivativesClient:
    def __init__(self) -> None:
        settings = get_settings()
        self.enabled = settings.external_derivatives_enabled
        self.timeout_seconds = settings.external_market_data_timeout_seconds
        self.coinalyze_api_key = settings.coinalyze_api_key
        self.coinalyze_base_url = settings.coinalyze_base_url.rstrip("/")
        self.deribit_base_url = settings.deribit_base_url.rstrip("/")
        self.user_agent = settings.market_data_user_agent

    async def get_context(self, symbol: str) -> dict[str, Any]:
        clean_symbol = symbol.upper()
        if not self.enabled or clean_symbol != "BTCUSDT":
            return {
                "enabled": bool(self.enabled),
                "symbol": clean_symbol,
                "coinalyze": {"available": False, "reason": "unsupported_symbol_or_disabled"},
                "deribit": {"available": False, "reason": "unsupported_symbol_or_disabled"},
            }
        async with httpx.AsyncClient(timeout=self.timeout_seconds, headers={"User-Agent": self.user_agent}) as client:
            coinalyze, deribit = await _gather_best_effort(
                self._coinalyze_context(client),
                self._deribit_context(client),
            )
        return {
            "enabled": True,
            "symbol": clean_symbol,
            "coinalyze": coinalyze,
            "deribit": deribit,
        }

    async def _coinalyze_context(self, client: httpx.AsyncClient) -> dict[str, Any]:
        if not self.coinalyze_api_key:
            return {"available": False, "reason": "missing_api_key", "source": "coinalyze"}
        to_ts = int(time.time())
        from_ts = to_ts - 6 * 60 * 60
        params = {
            "symbols": ",".join(COINALYZE_BTC_SYMBOLS),
            "interval": "1hour",
            "from": from_ts,
            "to": to_ts,
        }
        try:
            liquidation, oi_history, long_short, ohlcv = await _gather_best_effort(
                self._coinalyze_get(client, "/liquidation-history", params),
                self._coinalyze_get(client, "/open-interest-history", params),
                self._coinalyze_get(client, "/long-short-ratio-history", params),
                self._coinalyze_get(client, "/ohlcv-history", params),
            )
        except httpx.HTTPError as exc:
            return {"available": False, "reason": "http_error", "error": str(exc), "source": "coinalyze"}

        liquidation_rows = _as_payload_list(liquidation)
        oi_rows = _as_payload_list(oi_history)
        long_short_rows = _as_payload_list(long_short)
        ohlcv_rows = _as_payload_list(ohlcv)
        long_liq, short_liq = _sum_liquidations(liquidation_rows)
        oi_change = _open_interest_change_percent(oi_rows)
        long_account_percent = _latest_weighted_field(long_short_rows, "l")
        short_account_percent = _latest_weighted_field(long_short_rows, "s")
        taker_buy_share = _buy_volume_share(ohlcv_rows)
        total_liq = long_liq + short_liq
        return {
            "available": bool(total_liq or oi_change or long_account_percent),
            "source": "coinalyze",
            "symbols": list(COINALYZE_BTC_SYMBOLS),
            "longLiquidations6h": round(long_liq, 4),
            "shortLiquidations6h": round(short_liq, 4),
            "liquidationImbalance": round((long_liq - short_liq) / total_liq, 4) if total_liq > 0 else 0.0,
            "openInterestChange6hPercent": round(oi_change, 4),
            "longAccountPercent": round(long_account_percent, 4) if long_account_percent is not None else None,
            "shortAccountPercent": round(short_account_percent, 4) if short_account_percent is not None else None,
            "takerBuyShare": round(taker_buy_share, 4) if taker_buy_share is not None else None,
            "windowHours": 6,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    async def _coinalyze_get(self, client: httpx.AsyncClient, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        response = await client.get(
            f"{self.coinalyze_base_url}{path}",
            params=params,
            headers={"api_key": self.coinalyze_api_key},
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, list) else []

    async def _deribit_context(self, client: httpx.AsyncClient) -> dict[str, Any]:
        try:
            summary = await self._deribit_get(
                client,
                "/public/get_book_summary_by_currency",
                {"currency": "BTC", "kind": "option"},
            )
            volatility = await self._deribit_get(client, "/public/get_historical_volatility", {"currency": "BTC"})
        except httpx.HTTPError as exc:
            return {"available": False, "reason": "http_error", "error": str(exc), "source": "deribit"}
        rows = [row for row in summary.get("result", []) if isinstance(row, dict)]
        if not rows:
            return {"available": False, "reason": "empty_summary", "source": "deribit"}

        underlying = _first_positive(row.get("underlying_price") for row in rows)
        option_rows = [_parse_option_row(row, underlying) for row in rows]
        option_rows = [row for row in option_rows if row]
        if not option_rows:
            return {"available": False, "reason": "unparsed_options", "source": "deribit"}

        near_rows = [row for row in option_rows if row["daysToExpiry"] is not None and 7 <= row["daysToExpiry"] <= 45]
        if not near_rows:
            return {"available": False, "reason": "missing_target_expiry", "source": "deribit"}
        target_underlying = underlying or _median([row["strike"] for row in near_rows])
        call, put, expiry_days = _same_expiry_option_pair(near_rows, target_underlying)
        if not call or not put:
            return {"available": False, "reason": "missing_put_or_call_iv", "source": "deribit"}
        expiry_key = str(call["expiryKey"])
        expiry_rows = [row for row in near_rows if row.get("expiryKey") == expiry_key]
        call_rows = [row for row in expiry_rows if row["type"] == "C" and row["markIv"] > 0]
        put_rows = [row for row in expiry_rows if row["type"] == "P" and row["markIv"] > 0]

        call_source = _source_datetime(call.get("sourceTimestamp"))
        put_source = _source_datetime(put.get("sourceTimestamp"))
        if call_source is None or put_source is None:
            return {"available": False, "reason": "missing_source_timestamp", "source": "deribit"}
        if abs((call_source - put_source).total_seconds()) > 60:
            return {"available": False, "reason": "noncontemporaneous_option_pair", "source": "deribit"}

        spread = float(put["markIv"]) - float(call["markIv"])
        now = datetime.now(timezone.utc)
        source_updated_at = min(call_source, put_source)
        if (source_updated_at - now).total_seconds() > 60:
            return {"available": False, "reason": "future_source_timestamp", "source": "deribit"}
        if (now - source_updated_at).total_seconds() > 600:
            return {"available": False, "reason": "stale_source_timestamp", "source": "deribit"}
        skew_zscore, skew_sample_count, skew_persistence = await _persistent_skew_history_state(
            spread,
            source_updated_at,
            expiry_key,
        )
        call_volume = sum(float(row["volume"]) for row in call_rows)
        put_volume = sum(float(row["volume"]) for row in put_rows)
        iv_values = [float(row["markIv"]) for row in near_rows if row["markIv"] > 0]
        current_iv = (float(call["markIv"]) + float(put["markIv"])) / 2
        hist_vol = volatility.get("result") if isinstance(volatility.get("result"), list) else []
        realized_vol = _latest_historical_volatility(hist_vol)
        return {
            "available": True,
            "source": "deribit",
            "underlyingPrice": round(target_underlying, 4),
            "callStrike": call["strike"],
            "putStrike": put["strike"],
            "callMarkIv": round(float(call["markIv"]), 4),
            "putMarkIv": round(float(put["markIv"]), 4),
            "putCallIvSpread": round(spread, 4),
            "putCallIvSpreadZscore": round(skew_zscore, 4),
            "skewSampleCount": skew_sample_count,
            "skewPersistence": skew_persistence,
            "sameExpiry": True,
            "expiryDays": expiry_days,
            "expiryKey": expiry_key,
            "callPutVolumeRatio": round(call_volume / put_volume, 4) if put_volume > 0 else round(call_volume, 4),
            "ivPercentile": round(_percentile_rank(iv_values, current_iv), 4),
            "realizedVolatility30d": round(realized_vol, 4),
            "sampleOptions": len(near_rows),
            "updatedAt": source_updated_at.isoformat(),
            "retrievedAt": now.isoformat(),
        }

    async def _deribit_get(self, client: httpx.AsyncClient, path: str, params: dict[str, Any]) -> dict[str, Any]:
        response = await client.get(f"{self.deribit_base_url}{path}", params=params)
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {}


async def _gather_best_effort(*awaitables):
    import asyncio

    results = await asyncio.gather(*awaitables, return_exceptions=True)
    normalized = []
    for result in results:
        if isinstance(result, Exception):
            normalized.append({"available": False, "reason": "request_failed", "error": str(result)})
        else:
            normalized.append(result)
    return tuple(normalized)


def _history_rows(payload: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for item in payload:
        history = item.get("history")
        if isinstance(history, list):
            for row in history:
                if isinstance(row, dict):
                    yield row


def _as_payload_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) else []


def _sum_liquidations(payload: Iterable[dict[str, Any]]) -> tuple[float, float]:
    long_liq = 0.0
    short_liq = 0.0
    for row in _history_rows(payload):
        long_liq += _float(row.get("l"))
        short_liq += _float(row.get("s"))
    return long_liq, short_liq


def _open_interest_change_percent(payload: Iterable[dict[str, Any]]) -> float:
    first_values: list[float] = []
    last_values: list[float] = []
    for item in payload:
        history = [row for row in item.get("history", []) if isinstance(row, dict)]
        if not history:
            continue
        first_values.append(_float(history[0].get("c") or history[0].get("o")))
        last_values.append(_float(history[-1].get("c") or history[-1].get("o")))
    first = sum(value for value in first_values if value > 0)
    last = sum(value for value in last_values if value > 0)
    return ((last - first) / first) * 100 if first > 0 else 0.0


def _latest_weighted_field(payload: Iterable[dict[str, Any]], field: str) -> Optional[float]:
    values = []
    for item in payload:
        history = [row for row in item.get("history", []) if isinstance(row, dict)]
        if not history:
            continue
        value = _float(history[-1].get(field))
        if value > 0:
            values.append(value)
    if not values:
        return None
    return sum(values) / len(values)


def _buy_volume_share(payload: Iterable[dict[str, Any]]) -> Optional[float]:
    total_volume = 0.0
    buy_volume = 0.0
    for row in _history_rows(payload):
        volume = _float(row.get("v"))
        buy = _float(row.get("bv"))
        total_volume += volume
        buy_volume += buy
    if total_volume <= 0:
        return None
    return buy_volume / total_volume


def _parse_option_row(row: dict[str, Any], underlying: float) -> Optional[dict[str, Any]]:
    name = str(row.get("instrument_name") or "")
    parts = name.split("-")
    if len(parts) < 4:
        return None
    try:
        expiry = datetime.strptime(parts[1], "%d%b%y").replace(tzinfo=timezone.utc)
        strike = float(parts[2])
    except (TypeError, ValueError):
        return None
    days_to_expiry = max(0, int((expiry - datetime.now(timezone.utc)).total_seconds() // 86400))
    option_type = parts[3].upper()
    if option_type not in {"C", "P"}:
        return None
    return {
        "name": name,
        "expiryKey": parts[1].upper(),
        "type": option_type,
        "strike": strike,
        "daysToExpiry": days_to_expiry,
        "markIv": _float(row.get("mark_iv")),
        "volume": _float(row.get("volume")),
        "openInterest": _float(row.get("open_interest")),
        "distance": abs(strike - underlying) if underlying > 0 else 0.0,
        "sourceTimestamp": int(_float(row.get("creation_timestamp") or row.get("timestamp"))),
    }


def _closest_option(rows: list[dict[str, Any]], target: float) -> Optional[dict[str, Any]]:
    if not rows:
        return None
    return min(rows, key=lambda row: abs(float(row["strike"]) - target))


def _same_expiry_option_pair(
    rows: list[dict[str, Any]],
    underlying: float,
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]], Optional[int]]:
    expiry_groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        days = row.get("daysToExpiry")
        if days is None or not 7 <= int(days) <= 45:
            continue
        key = str(row.get("expiryKey") or f"DTE:{int(days)}")
        expiry_groups.setdefault(key, []).append(row)
    ordered_groups = sorted(
        expiry_groups.values(),
        key=lambda group: abs(int(group[0]["daysToExpiry"]) - 21),
    )
    for expiry_rows in ordered_groups:
        expiry_days = int(expiry_rows[0]["daysToExpiry"])
        call_rows = [row for row in expiry_rows if row.get("type") == "C" and float(row.get("markIv") or 0) > 0]
        put_rows = [row for row in expiry_rows if row.get("type") == "P" and float(row.get("markIv") or 0) > 0]
        call = _closest_option(call_rows, underlying * 1.05)
        put = _closest_option(put_rows, underlying * 0.95)
        if call is not None and put is not None:
            return call, put, expiry_days
    return None, None, None


def _source_datetime(value: Any) -> Optional[datetime]:
    timestamp = _float(value)
    if timestamp <= 0:
        return None
    if timestamp > 10_000_000_000:
        timestamp /= 1000
    try:
        return datetime.fromtimestamp(timestamp, timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _percentile_rank(values: list[float], value: float) -> float:
    clean_values = sorted(v for v in values if v > 0)
    if not clean_values:
        return 50.0
    below = sum(1 for item in clean_values if item <= value)
    return (below / len(clean_values)) * 100


def _latest_historical_volatility(rows: list[Any]) -> float:
    for row in reversed(rows):
        if isinstance(row, list) and len(row) >= 2:
            return _float(row[1])
        if isinstance(row, dict):
            return _float(row.get("value") or row.get("volatility"))
    return 0.0


def _first_positive(values: Iterable[Any]) -> float:
    for value in values:
        number = _float(value)
        if number > 0:
            return number
    return 0.0


def _median(values: list[float]) -> float:
    clean = sorted(value for value in values if value > 0)
    if not clean:
        return 0.0
    return clean[len(clean) // 2]


def _float(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0
