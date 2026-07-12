from unittest.mock import AsyncMock

import pytest

from app.clients.external_derivatives_client import ExternalDerivativesClient


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
