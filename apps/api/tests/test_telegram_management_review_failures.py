import pytest

from app.db import (
    PositionManagementReviewRecord,
    TelegramAlertDeliveryRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.repositories import to_json
from app.subscribers import TelegramSettingsInput, notify_subscribers_for_management_review, upsert_subscriber_preferences


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "telegram-management-review-failures.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_provider_failure_management_reviews_do_not_send_telegram_alerts(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscribers.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="operator",
            email="operator@example.com",
            favorite_trader_ids=["range-maker"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="123456789",
                event_types=["ai_review_medium", "ai_review_high"],
                min_return_pct=0,
            ),
        )
        review = PositionManagementReviewRecord(
            trader_id="range-maker",
            symbol="BTCUSDT",
            status="error",
            error_message="401 invalid API key",
            event_type="range_position_heartbeat",
            phase="OPEN_POSITION",
            provider="openai",
            model="openai",
            decision="NEEDS_MORE_DATA",
            confidence=0,
            action_type="NEEDS_MORE_DATA",
            fallback=False,
            payload_json=to_json(
                {
                    "event": {"severity": "HIGH", "phase": "OPEN_POSITION"},
                    "review": {
                        "decision": "NEEDS_MORE_DATA",
                        "rationale": "Position management provider failed.",
                        "riskFlags": ["provider_failed"],
                    },
                }
            ),
        )
        db.add(review)
        db.flush()

        notify_subscribers_for_management_review(db, review)

        assert db.query(TelegramAlertDeliveryRecord).count() == 0

    assert sent_messages == []


def test_mock_fallback_management_reviews_do_not_send_telegram_alerts(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscribers.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="operator",
            email="operator@example.com",
            favorite_trader_ids=[],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="123456789",
                event_types=["ai_review_medium"],
                min_return_pct=0,
            ),
        )
        review = PositionManagementReviewRecord(
            trader_id="session-raider",
            symbol="BTCUSDT",
            status="ok",
            event_type="session_position_heartbeat",
            phase="OPEN_POSITION",
            provider="mock",
            model="mock",
            decision="HOLD",
            confidence=50,
            action_type="HOLD",
            fallback=True,
            payload_json=to_json(
                {
                    "event": {"severity": "MEDIUM", "phase": "OPEN_POSITION"},
                    "review": {
                        "decision": "HOLD",
                        "rationale": "Mock fallback management review.",
                        "fallback": True,
                    },
                }
            ),
        )
        db.add(review)
        db.flush()

        notify_subscribers_for_management_review(db, review)

        assert db.query(TelegramAlertDeliveryRecord).count() == 0

    assert sent_messages == []
