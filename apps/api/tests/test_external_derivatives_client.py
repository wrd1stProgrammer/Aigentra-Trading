from unittest.mock import AsyncMock
from datetime import datetime, timedelta, timezone

import pytest

from app.clients.external_derivatives_client import (
    ExternalDerivativesClient,
    _DERIBIT_SKEW_HISTORY,
    _parse_option_row,
    _restore_skew_history,
    _same_expiry_option_pair,
    _serialize_skew_history,
    _skew_history_state,
)


@pytest.mark.asyncio
async def test_get_context_returns_completed_sources_when_external_requests_succeed(monkeypatch):
    client = ExternalDerivativesClient()
    client.enabled = True
    coinalyze = {"available": True, "source": "coinalyze"}
    deribit = {"available": True, "source": "deribit", "putCallIvSpread": 1.25}
    monkeypatch.setattr(client, "_coinalyze_context", AsyncMock(return_value=coinalyze))
    monkeypatch.setattr(client, "_deribit_context", AsyncMock(return_value=deribit))

    context = await client.get_context("BTCUSDT")

    assert context == {
        "enabled": True,
        "symbol": "BTCUSDT",
        "coinalyze": coinalyze,
        "deribit": deribit,
    }


def test_same_expiry_option_pair_never_mixes_tenors() -> None:
    rows = [
        {"type": "C", "strike": 105.0, "daysToExpiry": 14, "markIv": 50.0, "volume": 1.0},
        {"type": "P", "strike": 95.0, "daysToExpiry": 14, "markIv": 56.0, "volume": 1.0},
        {"type": "C", "strike": 105.0, "daysToExpiry": 30, "markIv": 45.0, "volume": 1.0},
        {"type": "P", "strike": 95.0, "daysToExpiry": 45, "markIv": 70.0, "volume": 1.0},
    ]

    call, put, expiry_days = _same_expiry_option_pair(rows, 100.0)

    assert expiry_days == 14
    assert call["daysToExpiry"] == put["daysToExpiry"] == 14


def test_same_expiry_option_pair_uses_exact_expiry_key_not_rounded_days() -> None:
    rows = [
        {"type": "C", "strike": 105.0, "daysToExpiry": 14, "expiryKey": "01AUG26", "markIv": 50.0, "volume": 1.0},
        {"type": "P", "strike": 95.0, "daysToExpiry": 14, "expiryKey": "02AUG26", "markIv": 70.0, "volume": 1.0},
        {"type": "C", "strike": 106.0, "daysToExpiry": 14, "expiryKey": "03AUG26", "markIv": 51.0, "volume": 1.0},
        {"type": "P", "strike": 94.0, "daysToExpiry": 14, "expiryKey": "03AUG26", "markIv": 57.0, "volume": 1.0},
    ]

    call, put, _ = _same_expiry_option_pair(rows, 100.0)

    assert call["expiryKey"] == put["expiryKey"] == "03AUG26"


def test_skew_persistence_counts_consecutive_same_expiry_zscore_anomalies() -> None:
    _DERIBIT_SKEW_HISTORY.clear()
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    baseline = [0.0, 0.2, -0.1, 0.1, -0.2, 0.15, -0.05, 0.05]
    for index, spread in enumerate(baseline):
        _skew_history_state(spread, start + timedelta(minutes=15 * index), "01AUG26")

    first = _skew_history_state(10.0, start + timedelta(minutes=120), "01AUG26")
    second = _skew_history_state(10.0, start + timedelta(minutes=135), "01AUG26")
    other_expiry = _skew_history_state(10.0, start + timedelta(minutes=135), "08AUG26")

    assert first[0] >= 1.25 and first[2] == 1
    assert second[0] >= 1.25 and second[2] == 2
    assert other_expiry[1:] == (1, 0)


def test_skew_persistence_resets_across_missing_fifteen_minute_buckets() -> None:
    _DERIBIT_SKEW_HISTORY.clear()
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    for index, spread in enumerate([0.0, 0.2, -0.1, 0.1, -0.2, 0.15, -0.05, 0.05]):
        _skew_history_state(spread, start + timedelta(minutes=15 * index), "01AUG26")
    _skew_history_state(10.0, start + timedelta(minutes=120), "01AUG26")

    after_gap = _skew_history_state(10.0, start + timedelta(minutes=180), "01AUG26")

    assert after_gap[0] >= 1.25
    assert after_gap[2] == 1


def test_option_parser_preserves_exchange_source_timestamp() -> None:
    source_time = int(datetime.now(timezone.utc).timestamp() * 1000)

    parsed = _parse_option_row(
        {
            "instrument_name": "BTC-01AUG26-70000-C",
            "mark_iv": 52.0,
            "creation_timestamp": source_time,
        },
        68_000.0,
    )

    assert parsed["expiryKey"] == "01AUG26"
    assert parsed["sourceTimestamp"] == source_time


def test_skew_history_can_resume_after_process_local_state_is_cleared() -> None:
    _DERIBIT_SKEW_HISTORY.clear()
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    for index, spread in enumerate([0.0, 0.2, -0.1, 0.1, -0.2, 0.15, -0.05, 0.05]):
        _skew_history_state(spread, start + timedelta(minutes=15 * index), "01AUG26")
    first = _skew_history_state(10.0, start + timedelta(minutes=120), "01AUG26")
    persisted = _serialize_skew_history()

    _DERIBIT_SKEW_HISTORY.clear()
    _restore_skew_history(persisted)
    second = _skew_history_state(10.0, start + timedelta(minutes=135), "01AUG26")

    assert first[2] == 1
    assert second[2] == 2


@pytest.mark.asyncio
async def test_deribit_context_rejects_stale_exchange_source_timestamp() -> None:
    client = ExternalDerivativesClient()
    expiry = (datetime.now(timezone.utc) + timedelta(days=21)).strftime("%d%b%y").upper()
    stale_timestamp = int((datetime.now(timezone.utc) - timedelta(minutes=11)).timestamp() * 1000)
    client._deribit_get = AsyncMock(
        side_effect=[
            {
                "result": [
                    {
                        "instrument_name": f"BTC-{expiry}-71400-C",
                        "underlying_price": 68_000.0,
                        "mark_iv": 50.0,
                        "volume": 10.0,
                        "creation_timestamp": stale_timestamp,
                    },
                    {
                        "instrument_name": f"BTC-{expiry}-64600-P",
                        "underlying_price": 68_000.0,
                        "mark_iv": 57.0,
                        "volume": 10.0,
                        "creation_timestamp": stale_timestamp,
                    },
                ]
            },
            {"result": []},
        ]
    )

    context = await client._deribit_context(AsyncMock())

    assert context["available"] is False
    assert context["reason"] == "stale_source_timestamp"


@pytest.mark.asyncio
async def test_deribit_context_rejects_future_exchange_source_timestamp() -> None:
    client = ExternalDerivativesClient()
    expiry = (datetime.now(timezone.utc) + timedelta(days=21)).strftime("%d%b%y").upper()
    future_timestamp = int((datetime.now(timezone.utc) + timedelta(hours=24)).timestamp() * 1000)
    rows = [
        {"instrument_name": f"BTC-{expiry}-71400-C", "underlying_price": 68_000.0, "mark_iv": 50.0, "volume": 10.0, "creation_timestamp": future_timestamp},
        {"instrument_name": f"BTC-{expiry}-64600-P", "underlying_price": 68_000.0, "mark_iv": 57.0, "volume": 10.0, "creation_timestamp": future_timestamp},
    ]
    client._deribit_get = AsyncMock(side_effect=[{"result": rows}, {"result": []}])

    context = await client._deribit_context(AsyncMock())

    assert context["available"] is False
    assert context["reason"] == "future_source_timestamp"
