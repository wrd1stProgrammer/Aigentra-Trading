from datetime import datetime, timezone
from decimal import Decimal
from urllib.parse import parse_qs, urlparse

import pytest

from fastapi.testclient import TestClient

from app.db import (
    AITranslationCacheRecord,
    LeagueSentimentOpinionRecord,
    PositionManagementReviewRecord,
    SubscriberPreferenceRecord,
    TelegramAlertDeliveryRecord,
    TraderStatusFeedRecord,
    db_status,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.ai.translation_cache import stable_source_hash
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
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
    assert authorized.json()["telegramSettings"]["eventTypes"] == [
        "pending_entry",
        "position_entry",
        "take_profit",
        "stop_loss",
        "ai_review_low",
        "ai_review_medium",
        "ai_review_high",
        "league_sentiment",
        "risk",
    ]
    assert authorized.json()["telegramSettings"]["reviewSections"] == [
        "status",
        "position",
        "summary",
        "action",
        "key_reasons",
        "risks",
        "watch_conditions",
        "manager_note",
        "rationale",
    ]


def test_telegram_webhook_replies_with_chat_id(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret")
    monkeypatch.setattr("app.subscribers_routes.send_telegram_message", fake_send_telegram_message)
    client = TestClient(app)

    unauthorized = client.post(
        "/api/subscribers/telegram/webhook",
        json={"message": {"chat": {"id": 987654321}, "text": "/start"}},
    )
    authorized = client.post(
        "/api/subscribers/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": "webhook-secret"},
        json={"message": {"chat": {"id": 987654321}, "text": "/start"}},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
    assert sent_messages == [
        {
            "bot_token": "test-token",
            "chat_id": "987654321",
            "text": sent_messages[0]["text"],
        }
    ]
    assert "Chat ID: 987654321" in sent_messages[0]["text"]


def test_telegram_link_api_creates_user_bound_start_link(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    monkeypatch.setenv("TELEGRAM_BOT_USERNAME", "AigentraAlertsBot")
    client = TestClient(app)

    response = client.post(
        "/api/subscribers/telegram/link",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"userId": "google-1", "email": "operator@example.com"},
    )

    assert response.status_code == 200
    payload = response.json()
    parsed_url = urlparse(payload["telegramUrl"])
    token = parse_qs(parsed_url.query)["start"][0]
    assert parsed_url.netloc == "t.me"
    assert parsed_url.path == "/AigentraAlertsBot"
    assert len(token) >= 24

    with session_scope() as db:
        preferences = db.query(SubscriberPreferenceRecord).filter_by(email="operator@example.com").one()
        assert preferences.telegram_link_token_hash
        assert preferences.telegram_link_token_hash != token
        assert preferences.telegram_link_expires_at is not None


def test_telegram_webhook_connects_chat_id_from_start_token(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setenv("TELEGRAM_BOT_USERNAME", "AigentraAlertsBot")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret")
    monkeypatch.setattr("app.subscribers_routes.send_telegram_message", fake_send_telegram_message)
    client = TestClient(app)

    link_response = client.post(
        "/api/subscribers/telegram/link",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"userId": "google-1", "email": "operator@example.com"},
    )
    start_token = parse_qs(urlparse(link_response.json()["telegramUrl"]).query)["start"][0]

    webhook_response = client.post(
        "/api/subscribers/telegram/webhook",
        headers={"X-Telegram-Bot-Api-Secret-Token": "webhook-secret"},
        json={"message": {"chat": {"id": 987654321}, "text": f"/start {start_token}"}},
    )

    assert webhook_response.status_code == 200
    with session_scope() as db:
        preferences = db.query(SubscriberPreferenceRecord).filter_by(email="operator@example.com").one()
        assert preferences.telegram_enabled is True
        assert preferences.telegram_chat_id == "987654321"
        assert preferences.telegram_link_token_hash is None
        assert preferences.telegram_link_expires_at is None

    assert sent_messages == [
        {
            "bot_token": "test-token",
            "chat_id": "987654321",
            "text": sent_messages[0]["text"],
        }
    ]
    assert "연결 완료" in sent_messages[0]["text"]


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
                event_types=["entry", "ai_review_high", "invalid"],
                review_sections=["action", "risks", "invalid"],
                min_return_pct=1.5,
            ),
        )

        assert preferences.email == "operator@example.com"
        assert preferences.favorite_trader_ids == ["channel-rider", "pullback-architect"]
        assert preferences.telegram_settings.chat_id == "123456789"
        assert preferences.telegram_settings.event_types == ["pending_entry", "position_entry", "ai_review_high"]
        assert preferences.telegram_settings.review_sections == ["action", "risks"]
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
                event_types=["position_entry"],
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
        assert deliveries[0].telegram_event_type == "position_entry"

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
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="1", event_types=["position_entry"], min_return_pct=0),
        )
        upsert_subscriber_preferences(
            db,
            user_id="wrong-event",
            email="wrong-event@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="2", event_types=["take_profit"], min_return_pct=0),
        )
        upsert_subscriber_preferences(
            db,
            user_id="wrong-trader",
            email="wrong-trader@example.com",
            favorite_trader_ids=["pullback-architect"],
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="3", event_types=["position_entry"], min_return_pct=0),
        )

        event = create_trade_event(db, "channel-rider", "BTCUSDT", "order_filled", price=Decimal("64167.1"))
        matches = list_matching_telegram_subscribers(db, event)

        assert [match.email for match in matches] == ["match@example.com"]


def test_pending_entry_events_are_delivered_by_default(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscribers.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="pending",
            email="pending@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(enabled=True, chat_id="123", event_types=None, min_return_pct=0),
        )
        create_trade_event(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            event_type="paper_order_created",
            price=Decimal("64100"),
            quantity=Decimal("0.1"),
        )
        delivery = db.query(TelegramAlertDeliveryRecord).one()

        assert delivery.telegram_event_type == "pending_entry"
        assert delivery.status == "sent"

    assert "진입대기" in sent_messages[0]["text"]


def test_management_review_alerts_respect_importance(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscribers.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="review",
            email="review@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="456",
                event_types=["ai_review_high"],
                min_return_pct=0,
            ),
        )
        review = PositionManagementReviewRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            event_type="channel_position_heartbeat",
            phase="OPEN_POSITION",
            provider="anthropic",
            model="claude-haiku-4-5",
            decision="HOLD",
            confidence=82,
            action_type="MOVE_STOP",
            payload_json='{"event":{"severity":"HIGH","phase":"OPEN_POSITION"},"review":{"rationale":"손절선을 올려 방어합니다."}}',
        )
        db.add(review)
        db.flush()
        from app.subscribers import notify_subscribers_for_management_review

        notify_subscribers_for_management_review(db, review)
        delivery = db.query(TelegramAlertDeliveryRecord).one()

        assert delivery.trade_event_id is None
        assert delivery.position_management_review_id == review.id
        assert delivery.telegram_event_type == "ai_review_high"

    assert "AI 중간 리뷰 높음" in sent_messages[0]["text"]


def test_league_sentiment_opinion_alerts_are_short_localized_and_deduplicated(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscribers.send_telegram_message", fake_send_telegram_message)

    with session_scope() as db:
        upsert_subscriber_preferences(
            db,
            user_id="league",
            email="league@example.com",
            favorite_trader_ids=["range-maker"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="999",
                event_types=["league_sentiment"],
                min_return_pct=0,
            ),
            locale="ko",
        )
        opinion = LeagueSentimentOpinionRecord(
            trader_id="aigentra-opinion",
            symbol="BTCUSDT",
            status="ok",
            locale="en",
            interval_start=datetime(2026, 6, 19, 0, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 6, 19, 1, 0, tzinfo=timezone.utc),
            provider="openai",
            model="gpt-4.1-mini",
            bias="MIXED",
            confidence=72,
            risk_level="MEDIUM",
            fallback=False,
            payload_json='{"summary":"이 긴 종합 본문은 텔레그램으로 직접 보내지 않습니다. 페이퍼 트레이딩"}',
        )
        db.add(opinion)
        db.flush()

        from app.subscribers import notify_subscribers_for_league_sentiment_opinion

        notify_subscribers_for_league_sentiment_opinion(db, opinion)
        notify_subscribers_for_league_sentiment_opinion(db, opinion)
        delivery = db.query(TelegramAlertDeliveryRecord).one()

        assert delivery.trade_event_id is None
        assert delivery.position_management_review_id is None
        assert delivery.league_sentiment_opinion_id == opinion.id
        assert delivery.telegram_event_type == "league_sentiment"
        assert delivery.status == "sent"

    assert len(sent_messages) == 1
    text = sent_messages[0]["text"]
    assert "Aigentra 종합 의견" in text
    assert "홈 또는 AI 센티멘트 화면" in text
    assert "이 긴 종합 본문" not in text
    assert "페이퍼 트레이딩" not in text


def test_trader_status_feed_alerts_are_localized_filtered_and_deduplicated(temp_db, monkeypatch):
    sent_messages = []

    def fake_send_telegram_message(*, bot_token, chat_id, text):
        sent_messages.append({"bot_token": bot_token, "chat_id": chat_id, "text": text})
        return {"ok": True}

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr("app.subscriber_status_feed_alerts.send_telegram_message", fake_send_telegram_message)

    canonical_payload = {
        "feedType": "trader_status_feed",
        "stateKey": "position_entry",
        "eventType": "position_entry_active",
        "headline": "Short still open",
        "message": "I'm staying patient while the short keeps working.",
        "watch": "",
    }
    localized_payload = {
        "feedType": "trader_status_feed",
        "stateKey": "position_entry",
        "eventType": "position_entry_active",
        "headline": "숏 아직 열려 있어요",
        "message": "내 숏은 아직 살아 있고, 여기서는 괜히 손대지 않을게요.",
        "watch": "",
    }

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
        upsert_subscriber_preferences(
            db,
            user_id="wrong-feed",
            email="wrong-feed@example.com",
            favorite_trader_ids=["channel-rider"],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="888",
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
            event_type="position_entry_active",
            source_type="paper_position",
            source_id=12,
            refresh_reason="event",
            provider="openai",
            model="gpt-4.1-mini",
            fallback=False,
            payload_json='{"feedType":"trader_status_feed","stateKey":"position_entry","eventType":"position_entry_active","headline":"Short still open","message":"I\'m staying patient while the short keeps working.","watch":""}',
        )
        db.add(feed)
        db.flush()
        db.add(
            AITranslationCacheRecord(
                source_type=AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
                source_id=feed.id,
                source_hash=stable_source_hash(canonical_payload),
                locale="ko",
                status="ok",
                provider="openai",
                model="gpt-4.1-nano",
                payload_json='{"feedType":"trader_status_feed","stateKey":"position_entry","eventType":"position_entry_active","headline":"숏 아직 열려 있어요","message":"내 숏은 아직 살아 있고, 여기서는 괜히 손대지 않을게요.","watch":""}',
            )
        )
        db.flush()

        from app.subscriber_status_feed_alerts import notify_subscribers_for_status_feed

        notify_subscribers_for_status_feed(db, feed)
        notify_subscribers_for_status_feed(db, feed)
        delivery = db.query(TelegramAlertDeliveryRecord).one()

        assert delivery.trader_status_feed_id == feed.id
        assert delivery.telegram_event_type == "trader_status_feed"
        assert delivery.status == "sent"

    assert len(sent_messages) == 1
    text = sent_messages[0]["text"]
    assert "트레이더 피드" in text
    assert "Volume Breaker" in text
    assert "숏 아직 열려 있어요" in text
    assert "내 숏은 아직 살아 있고" in text
    assert "Short still open" not in text
