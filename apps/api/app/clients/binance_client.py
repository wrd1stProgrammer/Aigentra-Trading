from typing import Any, Dict, List

import httpx
from pydantic import BaseModel


ALLOWED_SYMBOLS = {"BTCUSDT", "ETHUSDT"}
ALLOWED_INTERVALS = {"1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"}
ALLOWED_DATA_PERIODS = {"5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"}


class Candle(BaseModel):
    openTime: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    closeTime: int
    quoteVolume: float
    trades: int
    takerBuyBaseVolume: float
    takerBuyQuoteVolume: float


class BinanceClient:
    """Binance USD-M Futures public market data client.

    This client intentionally contains no account, private key, order,
    leverage, position, transfer, deposit, or withdrawal methods.
    """

    def __init__(self, base_url: str, timeout_seconds: float = 12.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

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
            raise ValueError("Unsupported Binance futures data period for this demo.")
        return period

    async def _get(self, path: str, params: Dict[str, Any]) -> Any:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()

    async def get_klines(
        self, symbol: str, interval: str = "1m", limit: int = 20
    ) -> List[Candle]:
        clean_symbol = self._validate_symbol(symbol)
        clean_interval = self._validate_interval(interval)
        safe_limit = max(1, min(int(limit), 500))
        data = await self._get(
            "/fapi/v1/klines",
            {"symbol": clean_symbol, "interval": clean_interval, "limit": safe_limit},
        )
        return [self._parse_candle(row) for row in data]

    async def get_open_interest(self, symbol: str) -> Dict[str, Any]:
        clean_symbol = self._validate_symbol(symbol)
        data = await self._get("/fapi/v1/openInterest", {"symbol": clean_symbol})
        return {
            "symbol": clean_symbol,
            "openInterest": float(data.get("openInterest", 0.0)),
            "time": int(data.get("time", 0)),
        }

    async def get_premium_index(self, symbol: str) -> Dict[str, Any]:
        clean_symbol = self._validate_symbol(symbol)
        data = await self._get("/fapi/v1/premiumIndex", {"symbol": clean_symbol})
        return {
            "symbol": clean_symbol,
            "markPrice": float(data.get("markPrice", 0.0)),
            "indexPrice": float(data.get("indexPrice", 0.0)),
            "lastFundingRate": float(data.get("lastFundingRate", 0.0)),
            "nextFundingTime": int(data.get("nextFundingTime", 0)),
            "time": int(data.get("time", 0)),
        }

    async def get_open_interest_history(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        clean_symbol = self._validate_symbol(symbol)
        clean_period = self._validate_data_period(period)
        safe_limit = max(1, min(int(limit), 500))
        data = await self._get(
            "/futures/data/openInterestHist",
            {"symbol": clean_symbol, "period": clean_period, "limit": safe_limit},
        )
        return [
            {
                "symbol": clean_symbol,
                "sumOpenInterest": float(row.get("sumOpenInterest", 0.0)),
                "sumOpenInterestValue": float(row.get("sumOpenInterestValue", 0.0)),
                "timestamp": int(row.get("timestamp", 0)),
            }
            for row in data
        ]

    async def get_funding_rate_history(self, symbol: str, limit: int = 100) -> List[Dict[str, Any]]:
        clean_symbol = self._validate_symbol(symbol)
        safe_limit = max(1, min(int(limit), 1000))
        data = await self._get("/fapi/v1/fundingRate", {"symbol": clean_symbol, "limit": safe_limit})
        return [
            {
                "symbol": clean_symbol,
                "fundingTime": int(row.get("fundingTime", 0)),
                "fundingRate": float(row.get("fundingRate", 0.0)),
                "markPrice": float(row.get("markPrice", 0.0)),
            }
            for row in data
        ]

    async def get_global_long_short_account_ratio(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        return await self._long_short_ratio("/futures/data/globalLongShortAccountRatio", symbol, period, limit)

    async def get_top_long_short_account_ratio(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        return await self._long_short_ratio("/futures/data/topLongShortAccountRatio", symbol, period, limit)

    async def get_top_long_short_position_ratio(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        return await self._long_short_ratio("/futures/data/topLongShortPositionRatio", symbol, period, limit)

    async def get_taker_buy_sell_volume(
        self, symbol: str, period: str = "5m", limit: int = 30
    ) -> List[Dict[str, Any]]:
        clean_symbol = self._validate_symbol(symbol)
        clean_period = self._validate_data_period(period)
        safe_limit = max(1, min(int(limit), 500))
        data = await self._get(
            "/futures/data/takerlongshortRatio",
            {"symbol": clean_symbol, "period": clean_period, "limit": safe_limit},
        )
        return [
            {
                "symbol": clean_symbol,
                "buySellRatio": float(row.get("buySellRatio", 0.0)),
                "buyVol": float(row.get("buyVol", 0.0)),
                "sellVol": float(row.get("sellVol", 0.0)),
                "timestamp": int(row.get("timestamp", 0)),
            }
            for row in data
        ]

    async def _long_short_ratio(
        self, path: str, symbol: str, period: str, limit: int
    ) -> List[Dict[str, Any]]:
        clean_symbol = self._validate_symbol(symbol)
        clean_period = self._validate_data_period(period)
        safe_limit = max(1, min(int(limit), 500))
        data = await self._get(
            path,
            {"symbol": clean_symbol, "period": clean_period, "limit": safe_limit},
        )
        return [
            {
                "symbol": clean_symbol,
                "longAccount": float(row.get("longAccount", 0.0)),
                "shortAccount": float(row.get("shortAccount", 0.0)),
                "longShortRatio": float(row.get("longShortRatio", 0.0)),
                "timestamp": int(row.get("timestamp", 0)),
            }
            for row in data
        ]

    async def test_public_data(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "status": "ok",
            "binanceReachable": True,
            "testedSymbols": sorted(ALLOWED_SYMBOLS),
            "klines": {},
        }
        for symbol in sorted(ALLOWED_SYMBOLS):
            try:
                klines = await self.get_klines(symbol=symbol, interval="1m", limit=5)
                result["klines"][symbol] = {
                    "success": True,
                    "count": len(klines),
                    "latestClose": klines[-1].close if klines else None,
                }
            except Exception as exc:
                result["status"] = "error"
                result["binanceReachable"] = False
                result["klines"][symbol] = {
                    "success": False,
                    "count": 0,
                    "latestClose": None,
                    "error": str(exc),
                }
        return result

    def _parse_candle(self, row: List[Any]) -> Candle:
        return Candle(
            openTime=int(row[0]),
            open=float(row[1]),
            high=float(row[2]),
            low=float(row[3]),
            close=float(row[4]),
            volume=float(row[5]),
            closeTime=int(row[6]),
            quoteVolume=float(row[7]),
            trades=int(row[8]),
            takerBuyBaseVolume=float(row[9]),
            takerBuyQuoteVolume=float(row[10]),
        )
