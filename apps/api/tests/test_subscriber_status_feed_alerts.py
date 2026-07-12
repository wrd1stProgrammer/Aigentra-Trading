import pytest

from app.db import TelegramAlertDeliveryRecord, TraderStatusFeedRecord, init_db, reset_db_engine, session_scope
from app.subscriber_status_feed_alerts import notify_subscribers_for_status_feed
from app.subscribers import TelegramSettingsInput, upsert_subscriber_preferences


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "subscriber-status-feed-alerts.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_scheduled_trader_status_feed_does_not_send_telegram_alert(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscriber_status_feed_alerts.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="feed",
            email="feed@example.com",
            favorite_trader_ids=["volume-breaker"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="777",
                event_types=["trader_status_feed"],
                min_return_pct=0,
            ),
            locale="ko",
        )
        feed = TraderStatusFeedRecord(
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            status="ok",
            state_key="position_entry",
            event_type="position_entry_active_refresh",
            source_type="trader_status_feed",
            source_id=12,
            refresh_reason="scheduled",
            provider="openai",
            model="gpt-4.1-mini",
            fallback=False,
            payload_json='{"feedType":"trader_status_feed","stateKey":"position_entry","eventType":"position_entry_active_refresh","headline":"Position still open","message":"Still watching the live position.","watch":""}',
        )
        db.add(feed)
        db.flush()

        notify_subscribers_for_status_feed(db, feed)

        assert db.query(TelegramAlertDeliveryRecord).count() == 0

    assert sent_messages == []


def test_no_setup_heartbeat_never_sends_telegram_alert(temp_db, monkeypatch):
    sent_messages = []
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr(
        "app.subscriber_status_feed_alerts.send_telegram_message",
        lambda **kwargs: sent_messages.append(kwargs) or {"ok": True},
    )

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="quiet-feed",
            email="quiet-feed@example.com",
            favorite_trader_ids=[],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="778",
                event_types=["trader_status_feed"],
                min_return_pct=0,
            ),
            locale="ko",
        )
        feed = TraderStatusFeedRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            state_key="no_setup",
            event_type="no_setup_heartbeat",
            source_type="candidate_trade",
            source_id=91,
            refresh_reason="event",
            provider="openai",
            model="gpt-5.4-mini",
            fallback=False,
            payload_json='{"headline":"No setup","message":"Still waiting."}',
        )
        db.add(feed)
        db.flush()

        notify_subscribers_for_status_feed(db, feed)

        assert db.query(TelegramAlertDeliveryRecord).count() == 0
        assert sent_messages == []
