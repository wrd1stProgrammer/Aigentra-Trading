import pytest

from app.clients.binance_client import BinanceClient
from app.core.config import get_settings


@pytest.mark.asyncio
async def test_binance_btcusdt_kline_fetch():
    client = BinanceClient(get_settings().binance_futures_base_url)
    candles = await client.get_klines("BTCUSDT", "1m", 5)
    assert len(candles) == 5
    assert candles[-1].close > 0


@pytest.mark.asyncio
async def test_binance_ethusdt_kline_fetch():
    client = BinanceClient(get_settings().binance_futures_base_url)
    candles = await client.get_klines("ETHUSDT", "1m", 5)
    assert len(candles) == 5
    assert candles[-1].close > 0
