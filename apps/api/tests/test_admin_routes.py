from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db import (
    APICallLogRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    ReviewUnlockRecord,
    SubscriberPreferenceRecord,
    TradeEventRecord,
    WhopCheckoutRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.main import app


ADMIN_TOKEN = "test-admin-token"


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def temp_admin_db(tmp_path):
    db_path = tmp_path / "admin-dashboard.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")
    init_db()


def admin_headers() -> dict[str, str]:
    return {"X-Admin-Api-Token": ADMIN_TOKEN}


def test_admin_overview_rejects_missing_token(temp_admin_db, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", ADMIN_TOKEN)
    client = TestClient(app)

    response = client.get("/api/admin/overview")

    assert response.status_code == 401
    assert response.json()["detail"] == "admin API token required"


def test_admin_overview_reports_operational_counts(temp_admin_db, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", ADMIN_TOKEN)
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        db.add_all(
            [
                SubscriberPreferenceRecord(
                    user_id="google-1",
                    email="operator@example.com",
                    subscription_status="active",
                    telegram_enabled=True,
                    telegram_chat_id="123",
                    locale="ko",
                ),
                WhopCheckoutRecord(
                    checkout_id="checkout-1",
                    internal_order_id="order-1",
                    user_id="google-1",
                    email="operator@example.com",
                    plan_key="aigentra_pro_monthly",
                    status="payment_succeeded",
                    purchase_url="https://whop.com/checkout/checkout-1",
                ),
                ReviewUnlockRecord(
                    user_id="google-2",
                    email="viewer@example.com",
                    source_key="scenario:channel-rider:BTCUSDT:1",
                    source_type="scenario",
                ),
                PaperOrderRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="open",
                    side="LONG",
                    order_type="LIMIT",
                    quantity=Decimal("0.10"),
                    leverage=Decimal("5"),
                    limit_price=Decimal("60000"),
                    notional=Decimal("6000"),
                    margin=Decimal("1200"),
                ),
                PaperPositionRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="open",
                    side="LONG",
                    quantity=Decimal("0.10"),
                    entry_price=Decimal("60000"),
                    leverage=Decimal("5"),
                    notional=Decimal("6000"),
                    margin=Decimal("1200"),
                    unrealized_pnl=Decimal("125.50"),
                ),
                PaperPositionRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="closed",
                    side="SHORT",
                    quantity=Decimal("0.20"),
                    entry_price=Decimal("61000"),
                    leverage=Decimal("3"),
                    notional=Decimal("12200"),
                    margin=Decimal("4066.67"),
                    realized_pnl=Decimal("88.25"),
                    closed_at=now - timedelta(hours=2),
                ),
                TradeEventRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    event_type="take_profit",
                    status="ok",
                    price=Decimal("61200"),
                    quantity=Decimal("0.05"),
                    realized_pnl=Decimal("44.50"),
                    created_at=now - timedelta(minutes=10),
                ),
                APICallLogRecord(
                    endpoint="/api/league/leaderboard-fast",
                    method="GET",
                    status="error",
                    latency_ms=12000,
                    error_message="gateway timeout",
                    created_at=now - timedelta(minutes=3),
                ),
            ]
        )

    client = TestClient(app)
    user_key = "a" * 64
    assert client.post(
        "/api/admin/visits",
        headers=admin_headers(),
        json={"visitorKey": "1" * 64, "userKey": user_key},
    ).status_code == 204
    assert client.post(
        "/api/admin/visits",
        headers=admin_headers(),
        json={"visitorKey": "1" * 64, "userKey": user_key},
    ).status_code == 204
    assert client.post(
        "/api/admin/visits",
        headers=admin_headers(),
        json={"visitorKey": "2" * 64, "userKey": user_key},
    ).status_code == 204
    assert client.post(
        "/api/admin/visits",
        headers=admin_headers(),
        json={"visitorKey": "3" * 64},
    ).status_code == 204
    response = client.get("/api/admin/overview", headers=admin_headers())

    assert response.status_code == 200
    data = response.json()
    assert data["database"]["status"] == "ok"
    assert data["database"]["tableCount"] > 0
    assert data["totals"]["subscribers"] == 1
    assert data["totals"]["activeSubscriptions"] == 1
    assert data["totals"]["telegramLinked"] == 1
    assert data["totals"]["reviewUnlocks"] == 1
    assert data["growth"]["timezone"] == "Asia/Seoul"
    assert data["growth"]["today"]["uniqueVisitors"] == 2
    assert data["growth"]["today"]["signups"] == 1
    assert data["growth"]["today"]["paidConversions"] == 1
    assert data["growth"]["today"]["signupConversionRate"] == 100.0
    assert len(data["growth"]["series"]) == 7
    assert data["paper"]["openOrders"] == 1
    assert data["paper"]["openPositions"] == 1
    assert data["paper"]["closedPositions"] == 1
    assert data["paper"]["unrealizedPnl"] == 125.5
    assert data["recentEvents"][0]["eventType"] == "take_profit"
    assert data["recentSubscribers"][0]["email"] == "operator@example.com"
    assert data["slowApiCalls"][0]["status"] == "error"


def test_site_visit_requires_admin_token(temp_admin_db, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", ADMIN_TOKEN)
    client = TestClient(app)

    response = client.post("/api/admin/visits", json={"visitorKey": "4" * 64})

    assert response.status_code == 401


def test_admin_table_browser_is_whitelisted_and_paginated(temp_admin_db, monkeypatch):
    monkeypatch.setenv("ADMIN_API_TOKEN", ADMIN_TOKEN)
    with session_scope() as db:
        db.add_all(
            [
                SubscriberPreferenceRecord(user_id="google-1", email="alpha@example.com"),
                SubscriberPreferenceRecord(user_id="google-2", email="beta@example.com"),
            ]
        )

    client = TestClient(app)
    unauthorized_table = client.get("/api/admin/table?table=subscriber_preferences", headers=admin_headers())
    forbidden_table = client.get("/api/admin/table?table=sqlite_master", headers=admin_headers())

    assert unauthorized_table.status_code == 200
    data = unauthorized_table.json()
    assert data["table"] == "subscriber_preferences"
    assert data["total"] == 2
    assert [row["email"] for row in data["rows"]] == ["beta@example.com", "alpha@example.com"]
    assert forbidden_table.status_code == 400
    assert forbidden_table.json()["detail"] == "unsupported admin table"
