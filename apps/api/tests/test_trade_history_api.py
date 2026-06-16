import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.db import (
    PositionManagementReviewRecord,
    TradeEventRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.main import app


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "trade-history-api.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    main.TRADER_DETAIL_CACHE.clear()
    yield db_path
    main.TRADER_DETAIL_CACHE.clear()
    reset_db_engine("sqlite:///:memory:")


def test_trade_history_includes_lowercase_realized_events(temp_db):
    with session_scope() as db:
        db.add(
            TradeEventRecord(
                trader_id="channel-rider",
                symbol="BTCUSDT",
                event_type="take_partial_profit",
                price=Decimal("62524.30"),
                quantity=Decimal("0.016"),
                realized_pnl=Decimal("27.40"),
                created_at=datetime(2026, 6, 13, 15, 0, tzinfo=timezone.utc),
                payload_json=json.dumps({"side": "SHORT", "entryPrice": 64100, "reason": "TP1 filled"}),
            )
        )

    client = TestClient(app)
    response = client.get("/api/league/traders/channel-rider/trade-history?symbol=BTCUSDT&limit=10")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["time"].startswith("2026-06-13T15:00:00")
    assert data["items"][0]["pnl"] == 27.4
    assert data["items"][0]["closeReason"] == "TP1 filled"


def test_trader_detail_exposes_review_counts_by_utc_day(temp_db):
    with session_scope() as db:
        db.add_all(
            [
                PositionManagementReviewRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    event_type="position_review",
                    created_at=datetime(2026, 6, 13, 0, 10, tzinfo=timezone.utc),
                ),
                PositionManagementReviewRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    event_type="position_review",
                    created_at=datetime(2026, 6, 13, 23, 50, tzinfo=timezone.utc),
                ),
                PositionManagementReviewRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    event_type="position_review",
                    created_at=datetime(2026, 6, 12, 23, 59, tzinfo=timezone.utc),
                ),
            ]
        )

    client = TestClient(app)
    response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT&reviewsLimit=1&eventsLimit=1")

    assert response.status_code == 200
    counts = {item["date"]: item["count"] for item in response.json()["reviewCountsByDay"]}
    assert counts["2026-06-13"] == 2
    assert counts["2026-06-12"] == 1
