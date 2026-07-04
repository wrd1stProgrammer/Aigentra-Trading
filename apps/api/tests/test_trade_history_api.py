import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.db import (
    PaperPositionRecord,
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


def test_trade_history_keeps_partial_take_profits_for_closed_position(temp_db):
    with session_scope() as db:
        position = PaperPositionRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="closed",
            side="long",
            quantity=Decimal("0.300"),
            entry_price=Decimal("64000"),
            leverage=Decimal("5"),
            notional=Decimal("96000"),
            margin=Decimal("19200"),
            exit_price=Decimal("65500"),
            realized_pnl=Decimal("75.00"),
            close_reason="take_profit",
            opened_at=datetime(2026, 6, 23, 7, 0, tzinfo=timezone.utc),
            closed_at=datetime(2026, 6, 23, 9, 30, tzinfo=timezone.utc),
        )
        db.add(position)
        db.flush()
        db.add_all(
            [
                TradeEventRecord(
                    trader_id="trend-sentinel",
                    symbol="BTCUSDT",
                    event_type="take_partial_profit",
                    position_id=position.id,
                    price=Decimal("65000"),
                    quantity=Decimal("0.100"),
                    realized_pnl=Decimal("120.10"),
                    created_at=datetime(2026, 6, 23, 8, 10, tzinfo=timezone.utc),
                    payload_json=json.dumps({"side": "LONG", "entryPrice": 64000, "reason": "TP1 filled"}),
                ),
                TradeEventRecord(
                    trader_id="trend-sentinel",
                    symbol="BTCUSDT",
                    event_type="take_partial_profit",
                    position_id=position.id,
                    price=Decimal("65350"),
                    quantity=Decimal("0.100"),
                    realized_pnl=Decimal("180.33"),
                    created_at=datetime(2026, 6, 23, 8, 55, tzinfo=timezone.utc),
                    payload_json=json.dumps({"side": "LONG", "entryPrice": 64000, "reason": "TP2 filled"}),
                ),
                TradeEventRecord(
                    trader_id="trend-sentinel",
                    symbol="BTCUSDT",
                    event_type="position_closed",
                    position_id=position.id,
                    price=Decimal("65500"),
                    quantity=Decimal("0.100"),
                    realized_pnl=Decimal("75.00"),
                    created_at=datetime(2026, 6, 23, 9, 30, tzinfo=timezone.utc),
                    payload_json=json.dumps({"side": "LONG", "entryPrice": 64000, "reason": "take_profit"}),
                ),
            ]
        )

    client = TestClient(app)
    response = client.get("/api/league/traders/trend-sentinel/trade-history?symbol=BTCUSDT&limit=10")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert [item["closeReason"] for item in data["items"]] == ["take_profit", "TP2 filled", "TP1 filled"]
    assert [item["exitPrice"] for item in data["items"]] == [65500.0, 65350.0, 65000.0]
    assert sum(item["pnl"] for item in data["items"]) == pytest.approx(375.43)


def test_trade_history_returns_next_offset_and_has_more_for_stable_pagination(temp_db):
    with session_scope() as db:
        for index in range(12):
            db.add(
                TradeEventRecord(
                    trader_id="vwap-reclaimer",
                    symbol="BTCUSDT",
                    event_type="position_closed",
                    price=Decimal("61000") + index,
                    quantity=Decimal("0.010"),
                    realized_pnl=Decimal("5.00"),
                    created_at=datetime(2026, 7, 3, 12, index, tzinfo=timezone.utc),
                    payload_json=json.dumps(
                        {
                            "side": "LONG",
                            "entryPrice": 60900 + index,
                            "reason": "take_profit",
                        }
                    ),
                )
            )

    client = TestClient(app)
    first = client.get("/api/league/traders/vwap-reclaimer/trade-history?symbol=BTCUSDT&limit=10&offset=0")
    second = client.get("/api/league/traders/vwap-reclaimer/trade-history?symbol=BTCUSDT&limit=10&offset=10")

    assert first.status_code == 200
    first_page = first.json()
    assert len(first_page["items"]) == 10
    assert first_page["nextOffset"] == 10
    assert first_page["hasMore"] is True

    assert second.status_code == 200
    second_page = second.json()
    assert len(second_page["items"]) == 2
    assert second_page["nextOffset"] == 12
    assert second_page["hasMore"] is False


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
