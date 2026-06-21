import os
from typing import Any, Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.ai.translation_cache import localized_payload_for_source
from app.db import SubscriberPreferenceRecord, TelegramAlertDeliveryRecord, TraderStatusFeedRecord
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
from app.repositories import to_json
from app.subscribers import read_string_list, to_preferences_view
from app.telegram_client import send_telegram_message
from app.telegram_messages import TRADER_NAMES
from app.trader_status_feed.context import payload_from_record


TELEGRAM_EVENT_TYPE = "trader_status_feed"


class StatusFeedTelegramSettings(Protocol):
    event_types: list[str]


class StatusFeedPreferences(Protocol):
    locale: str
    telegram_settings: StatusFeedTelegramSettings


def notify_subscribers_for_status_feed(db: Session, feed: TraderStatusFeedRecord) -> None:
    if feed.id is None or feed.status != "ok":
        return
    if feed.refresh_reason == "scheduled":
        return

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    for record in matching_status_feed_subscriber_records(db, feed):
        if status_feed_delivery_exists(db, record.id, feed.id):
            continue
        text = compose_status_feed_message(to_preferences_view(record), feed)
        status = "missing_token"
        response_payload: dict[str, Any] = {"ok": False, "description": "missing TELEGRAM_BOT_TOKEN"}
        if bot_token:
            try:
                response_payload = send_telegram_message(bot_token=bot_token, chat_id=record.telegram_chat_id or "", text=text)
                status = "sent" if response_payload.get("ok") else "failed"
            except (httpx.HTTPError, ValueError) as exc:
                response_payload = {"ok": False, "description": str(exc)}
                status = "failed"
        db.add(
            TelegramAlertDeliveryRecord(
                subscriber_preference_id=record.id,
                trade_event_id=None,
                position_management_review_id=None,
                league_sentiment_opinion_id=None,
                trader_status_feed_id=feed.id,
                trader_id=feed.trader_id,
                symbol=feed.symbol,
                status=status,
                telegram_event_type=TELEGRAM_EVENT_TYPE,
                chat_id=record.telegram_chat_id or "",
                payload_json=to_json({"message": text}),
                response_json=to_json(response_payload),
            )
        )
    db.flush()


def matching_status_feed_subscriber_records(db: Session, feed: TraderStatusFeedRecord) -> list[SubscriberPreferenceRecord]:
    records = db.execute(
        select(SubscriberPreferenceRecord)
        .where(
            SubscriberPreferenceRecord.subscription_status == "active",
            SubscriberPreferenceRecord.telegram_enabled.is_(True),
            SubscriberPreferenceRecord.telegram_chat_id.is_not(None),
        )
        .order_by(SubscriberPreferenceRecord.id.asc())
    ).scalars().all()
    return [record for record in records if status_feed_subscriber_matches(record, feed)]


def status_feed_subscriber_matches(record: SubscriberPreferenceRecord, feed: TraderStatusFeedRecord) -> bool:
    settings = to_preferences_view(record).telegram_settings
    if TELEGRAM_EVENT_TYPE not in settings.event_types:
        return False
    favorite_ids = read_string_list(record.favorite_trader_ids_json)
    return not favorite_ids or (feed.trader_id or "") in favorite_ids


def status_feed_delivery_exists(db: Session, subscriber_id: int, feed_id: int) -> bool:
    return db.execute(
        select(TelegramAlertDeliveryRecord.id).where(
            TelegramAlertDeliveryRecord.subscriber_preference_id == subscriber_id,
            TelegramAlertDeliveryRecord.trader_status_feed_id == feed_id,
        )
    ).scalar_one_or_none() is not None


def compose_status_feed_message(preferences: StatusFeedPreferences, feed: TraderStatusFeedRecord) -> str:
    payload = localized_status_feed_payload(preferences, feed)
    trader_name = TRADER_NAMES.get(feed.trader_id or "", feed.trader_id or "-")
    label = status_feed_label(preferences.locale)
    headline = text_value(payload.get("headline")) or label
    message = text_value(payload.get("message")) or "-"
    return "\n".join(
        [
            f"[AI Trader League] {label}",
            f"{trader_name} · {feed.symbol or '-'}",
            headline,
            message,
        ]
    )


def localized_status_feed_payload(preferences: StatusFeedPreferences, feed: TraderStatusFeedRecord) -> dict[str, Any]:
    payload = payload_from_record(feed)
    if not payload:
        return {}
    session = object_session(feed)
    if session is None or feed.id is None:
        return payload
    localized_payload, _translation_meta = localized_payload_for_source(
        session,
        source_type=AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
        source_id=feed.id,
        payload=payload,
        locale=preferences.locale,
    )
    return localized_payload


def status_feed_label(locale: str) -> str:
    labels = {
        "en": "Trader Feed",
        "ko": "트레이더 피드",
        "ru": "Лента трейдера",
        "pt-BR": "Feed do trader",
        "tr": "Trader akışı",
    }
    return labels.get(locale, labels["en"])


def text_value(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None
