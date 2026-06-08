from decimal import Decimal

import pytest

from fastapi.testclient import TestClient

from app.db import TelegramAlertDeliveryRecord, db_status, init_db, reset_db_engine, session_scope
from app.main import app
from app.paper.repositories import create_trade_event
from app.subscribers import TelegramSettingsInput, list_matching_telegram_subscribers, upsert_subscriber_preferences


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "subscriber-alerts.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_subscriber_tables_are_registered(temp_db):
    status = db_status()

    assert "subscriber_preferences" in status["tables"]
    assert "telegram_alert_deliveries" in status["tables"]


def test_subscriber_preference_api_requires_internal_token(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    client = TestClient(app)

    unauthorized = client.get("/api/subscribers/preferences?userId=qa-user&email=qa@example.com")
    authorized = client.get(
        "/api/subscribers/preferences?userId=qa-user&email=qa@example.com",
        headers={"X-Subscriber-Api-Token": "internal-token"},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
    assert authorized.json()["email"] == "qa@example.com"


def test_subscriber_preferences_persist_favorites_and_telegram_settings(temp_db):
    with session_scope() as db:
        preferences = upsert_subscriber_preferences(
            db,
            user_id="google-1",
            email="operator@example.com",
            favorite_trader_ids=["pullback-architect", "channel-rider", "channel-rider"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id=" 123456789 ",
                event_types=["entry", "management", "invalid"],
                min_return_pct=1.5,
            ),
        )

        assert preferences.email == "operator@example.com"
        assert preferences.favorite_trader_ids == ["channel-rider", "pullback-architect"]
        assert preferences.telegram_settings.chat_id == "123456789"
        assert preferences.telegram_settings.event_types == ["entry", "management"]
        assert preferences.telegram_settings.min_return_pct == 1.5


def test_trade_events_enqueue_matching_telegram_alerts(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True, "description": None}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscribers.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="google-1",
            email="operator@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="123456789",
                event_types=["entry"],
                min_return_pct=0,
            ),
        )
        create_trade_event(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            event_type="order_filled",
            price=Decimal("64167.1"),
            quantity=Decimal("0.2"),
            payload={"side": "short", "leverage": 5},
        )

        deliveries = db.query(TelegramAlertDeliveryRecord).all()
        assert len(deliveries) == 1
        assert deliveries[0].status == "sent"
        assert deliveries[0].telegram_event_type == "entry"

    assert sent_messages == [
        {
            "bot_token": "test-token",
            "chat_id": "123456789",
            "text": sent_messages[0]["text"],
        }
    ]
    assert "Channel Rider" in sent_messages[0]["text"]
    assert "BTCUSDT" in sent_messages[0]["text"]


def test_telegram_subscriber_matching_respects_favorites_and_event_types(temp_db):
    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="match",
            email="match@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="1", event_types=["entry"], min_return_pct=0),
        )
        upsert_subscriber_preferences(
            db,
            user_id="wrong-event",
            email="wrong-event@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="2", event_types=["exit"], min_return_pct=0),
        )
        upsert_subscriber_preferences(
            db,
            user_id="wrong-trader",
            email="wrong-trader@example.com",
            favorite_trader_ids=["pullback-architect"],
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="3", event_types=["entry"], min_return_pct=0),
        )

        event = create_trade_event(db, "channel-rider", "BTCUSDT", "order_filled", price=Decimal("64167.1"))
        matches = list_matching_telegram_subscribers(db, event)

        assert [match.email for match in matches] == ["match@example.com"]
