from __future__ import annotations

from typing import Any, Callable, Coroutine, Dict, List, Optional, TypeVar

import httpx

from app.clients.binance_client import ALLOWED_DATA_PERIODS, ALLOWED_INTERVALS, ALLOWED_SYMBOLS, Candle
from app.core.config import get_settings


OKX_INTERVALS = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1w": "1W",
}
BITGET_INTERVALS = {**OKX_INTERVALS}
INTERVAL_MS = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
}
T = TypeVar("T")


class MarketDataClient:
    def __init__(self, timeout_seconds: float = 12.0) -> None:
        settings = get_settings()
        primary = settings.market_data_provider.lower()
        fallback = settings.market_data_fallback_provider.lower()
        self.timeout_seconds = timeout_seconds
        self.primary_name = primary if primary in {"okx", "bitget"} else "okx"
        self.fallback_name = fallback if fallback in {"okx", "bitget"} else "bitget"
        if self.fallback_name == self.primary_name:
            self.fallback_name = "bitget" if self.primary_name == "okx" else "okx"
        self.user_agent = settings.market_data_user_agent

    async def get_klines(
        self,
        symbol: str,
        interval: str = "1m",
        limit: int = 20,
        before: Optional[int] = None,
    ) -> List[Candle]:
        clean_symbol = self._validate_symbol(symbol)
        clean_interval = self._validate_interval(interval)
        safe_limit = self._safe_limit(limit)
        return await self._with_fallback(
            lambda provider: self._provider_klines(provider, clean_symbol, clean_interval, safe_limit, before)
        )

    async def get_open_interest(self, symbol: str) -> Dict[str, Any]:
        clean_symbol = self._validate_symbol(symbol)
        return await self._with_fallback(lambda provider: self._provider_open_interest(provider, clean_symbol))

    async def get_premium_index(self, symbol: str) -> Dict[str, Any]:
        clean_symbol = self._validate_symbol(symbol)
        return await self._with_fallback(lambda provider: self._provider_premium_index(provider, clean_symbol))

    async def get_funding_rate_history(self, symbol: str, limit: int = 100) -> List[Dict[str, Any]]:
        clean_symbol = self._validate_symbol(symbol)
        safe_limit = self._safe_limit(limit)
        return await self._with_fallback(lambda provider: self._provider_funding_history(provider, clean_symbol, safe_limit))

    async def get_open_interest_history(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        self._validate_symbol(symbol)
        self._validate_data_period(period)
        return []

    async def get_global_long_short_account_ratio(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        self._validate_symbol(symbol)
        self._validate_data_period(period)
        return []

    async def get_top_long_short_account_ratio(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        self._validate_symbol(symbol)
        self._validate_data_period(period)
        return []

    async def get_top_long_short_position_ratio(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        self._validate_symbol(symbol)
        self._validate_data_period(period)
        return []

    async def get_taker_buy_sell_volume(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        self._validate_symbol(symbol)
        self._validate_data_period(period)
        return []

    async def test_public_data(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "status": "ok",
            "binanceReachable": True,
            "marketDataReachable": True,
            "provider": self.primary_name,
            "fallbackProvider": self.fallback_name,
            "testedSymbols": ["BTCUSDT"],
            "klines": {},
        }
        for symbol in ["BTCUSDT"]:
            try:
                candles = await self.get_klines(symbol=symbol, interval="1m", limit=5)
                result["klines"][symbol] = {
                    "success": True,
                    "count": len(candles),
                    "latestClose": candles[-1].close if candles else None,
                }
            except httpx.HTTPError as exc:
                result["status"] = "error"
                result["binanceReachable"] = False
                result["marketDataReachable"] = False
                result["klines"][symbol] = {"success": False, "count": 0, "latestClose": None, "error": str(exc)}
        return result

    async def _with_fallback(self, call: Callable[[str], Coroutine[Any, Any, T]]) -> T:
        try:
            return await call(self.primary_name)
        except httpx.HTTPError:
            return await call(self.fallback_name)

    async def _provider_klines(
        self, provider: str, symbol: str, interval: str, limit: int, before: Optional[int]
    ) -> List[Candle]:
        if provider == "bitget":
            return await self._bitget_klines(symbol, interval, limit, before)
        return await self._okx_klines(symbol, interval, limit, before)

    async def _provider_open_interest(self, provider: str, symbol: str) -> Dict[str, Any]:
        if provider == "bitget":
            data = await self._get_json(
                "https://api.bitget.com",
                "/api/v2/mix/market/open-interest",
                {"symbol": symbol, "productType": "USDT-FUTURES"},
            )
            row = data.get("data", {})
            return {"symbol": symbol, "openInterest": _float(row.get("openInterest")), "time": _int(data.get("requestTime"))}
        data = await self._get_json(
            "https://www.okx.com",
            "/api/v5/public/open-interest",
            {"instType": "SWAP", "uly": self._okx_underlying(symbol)},
        )
        row = _first_dict(data.get("data"))
        return {"symbol": symbol, "openInterest": _float(row.get("oiCcy") or row.get("oi")), "time": _int(row.get("ts"))}

    async def _provider_premium_index(self, provider: str, symbol: str) -> Dict[str, Any]:
        if provider == "bitget":
            funding = await self._get_json(
                "https://api.bitget.com",
                "/api/v2/mix/market/current-fund-rate",
                {"symbol": symbol, "productType": "USDT-FUTURES"},
            )
            ticker = await self._get_json(
                "https://api.bitget.com",
                "/api/v2/mix/market/ticker",
                {"symbol": symbol, "productType": "USDT-FUTURES"},
            )
            funding_row = funding.get("data", {})
            ticker_row = ticker.get("data", [{}])[0] if isinstance(ticker.get("data"), list) else ticker.get("data", {})
            return {
                "symbol": symbol,
                "markPrice": _float(ticker_row.get("markPrice") or ticker_row.get("lastPr")),
                "indexPrice": _float(ticker_row.get("indexPrice")),
                "lastFundingRate": _float(funding_row.get("fundingRate")),
                "nextFundingTime": _int(funding_row.get("nextUpdate")),
                "time": _int(ticker.get("requestTime")),
            }
        mark, index, funding = await self._okx_mark_index_funding(symbol)
        return {
            "symbol": symbol,
            "markPrice": _float(mark.get("markPx")),
            "indexPrice": _float(index.get("idxPx")),
            "lastFundingRate": _float(funding.get("fundingRate")),
            "nextFundingTime": _int(funding.get("nextFundingTime")),
            "time": _int(mark.get("ts") or funding.get("ts")),
        }

    async def _provider_funding_history(self, provider: str, symbol: str, limit: int) -> List[Dict[str, Any]]:
        if provider == "bitget":
            data = await self._get_json(
                "https://api.bitget.com",
                "/api/v2/mix/market/history-fund-rate",
                {"symbol": symbol, "productType": "USDT-FUTURES", "pageSize": min(limit, 100)},
            )
            return [
                {"symbol": symbol, "fundingTime": _int(row.get("fundingTime")), "fundingRate": _float(row.get("fundingRate")), "markPrice": 0.0}
                for row in data.get("data", [])
                if isinstance(row, dict)
            ]
        data = await self._get_json(
            "https://www.okx.com",
            "/api/v5/public/funding-rate-history",
            {"instId": self._okx_inst_id(symbol), "limit": min(limit, 100)},
        )
        return [
            {"symbol": symbol, "fundingTime": _int(row.get("fundingTime")), "fundingRate": _float(row.get("fundingRate")), "markPrice": 0.0}
            for row in data.get("data", [])
            if isinstance(row, dict)
        ]

    async def _okx_klines(self, symbol: str, interval: str, limit: int, before: Optional[int]) -> List[Candle]:
        params: Dict[str, Any] = {"instId": self._okx_inst_id(symbol), "bar": OKX_INTERVALS[interval], "limit": limit}
        path = "/api/v5/market/candles"
        if before:
            path = "/api/v5/market/history-candles"
            params["after"] = before
        data = await self._get_json("https://www.okx.com", path, params)
        rows = [row for row in data.get("data", []) if isinstance(row, list)]
        return [self._okx_candle(row, interval) for row in reversed(rows)]

    async def _bitget_klines(self, symbol: str, interval: str, limit: int, before: Optional[int]) -> List[Candle]:
        params: Dict[str, Any] = {
            "symbol": symbol,
            "productType": "USDT-FUTURES",
            "granularity": BITGET_INTERVALS[interval],
            "limit": limit,
        }
        if before:
            params["endTime"] = before
        data = await self._get_json("https://api.bitget.com", "/api/v2/mix/market/candles", params)
        rows = [row for row in data.get("data", []) if isinstance(row, list)]
        return [self._bitget_candle(row, interval) for row in rows]

    async def _okx_mark_index_funding(self, symbol: str) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
        mark = await self._get_json("https://www.okx.com", "/api/v5/public/mark-price", {"instType": "SWAP", "instId": self._okx_inst_id(symbol)})
        index = await self._get_json("https://www.okx.com", "/api/v5/market/index-tickers", {"instId": self._okx_underlying(symbol)})
        funding = await self._get_json("https://www.okx.com", "/api/v5/public/funding-rate", {"instId": self._okx_inst_id(symbol)})
        return _first_dict(mark.get("data")), _first_dict(index.get("data")), _first_dict(funding.get("data"))

    async def _get_json(self, base_url: str, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds, headers={"User-Agent": self.user_agent}) as client:
            response = await client.get(f"{base_url}{path}", params=params)
            response.raise_for_status()
            payload = response.json()
        return payload if isinstance(payload, dict) else {}

    def _okx_candle(self, row: List[Any], interval: str) -> Candle:
        open_time = _int(row[0])
        return Candle(openTime=open_time, open=_float(row[1]), high=_float(row[2]), low=_float(row[3]), close=_float(row[4]), volume=_float(row[6] if len(row) > 6 else row[5]), closeTime=open_time + INTERVAL_MS[interval] - 1, quoteVolume=_float(row[7] if len(row) > 7 else 0), trades=0, takerBuyBaseVolume=0.0, takerBuyQuoteVolume=0.0)

    def _bitget_candle(self, row: List[Any], interval: str) -> Candle:
        open_time = _int(row[0])
        return Candle(openTime=open_time, open=_float(row[1]), high=_float(row[2]), low=_float(row[3]), close=_float(row[4]), volume=_float(row[5]), closeTime=open_time + INTERVAL_MS[interval] - 1, quoteVolume=_float(row[6] if len(row) > 6 else 0), trades=0, takerBuyBaseVolume=0.0, takerBuyQuoteVolume=0.0)

    def _validate_symbol(self, symbol: str) -> str:
        clean_symbol = symbol.upper()
        if clean_symbol not in ALLOWED_SYMBOLS:
            raise ValueError("Only BTCUSDT and ETHUSDT are supported in this demo.")
        return clean_symbol

    def _validate_interval(self, interval: str) -> str:
        if interval not in ALLOWED_INTERVALS:
            raise ValueError("Unsupported interval for this demo.")
        return interval

    def _validate_data_period(self, period: str) -> str:
        if period not in ALLOWED_DATA_PERIODS:
            raise ValueError("Unsupported futures data period for this demo.")
        return period

    def _safe_limit(self, limit: int) -> int:
        return max(1, min(int(limit), get_settings().market_data_max_limit))

    def _okx_inst_id(self, symbol: str) -> str:
        base = symbol.replace("USDT", "")
        return f"{base}-USDT-SWAP"

    def _okx_underlying(self, symbol: str) -> str:
        base = symbol.replace("USDT", "")
        return f"{base}-USDT"


def _first_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    return value if isinstance(value, dict) else {}


def _float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0
