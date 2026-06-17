from dataclasses import dataclass
from datetime import timedelta
import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SubscriberPreferenceRecord, utc_now
from app.repositories import from_json, to_json
from app.subscriber_alert_types import DEFAULT_TELEGRAM_EVENT_TYPES, normalize_event_types


TELEGRAM_LINK_TTL_SECONDS = 15 * 60


@dataclass(frozen=True)
class TelegramStartLink:
    telegram_url: str
    expires_at_iso: str


@dataclass(frozen=True)
class TelegramConnectResult:
    connected: bool
    email: str = ""


def create_telegram_start_link(
    db: Session,
    preferences: SubscriberPreferenceRecord,
    bot_username: str,
    ttl_seconds: int = TELEGRAM_LINK_TTL_SECONDS,
) -> TelegramStartLink:
    token = secrets.token_urlsafe(24)
    expires_at = utc_now() + timedelta(seconds=max(60, ttl_seconds))
    preferences.telegram_link_token_hash = telegram_start_token_hash(token)
    preferences.telegram_link_expires_at = expires_at
    preferences.updated_at = utc_now()
    db.flush()
    return TelegramStartLink(
        telegram_url=f"https://t.me/{bot_username.lstrip('@')}?start={token}",
        expires_at_iso=expires_at.isoformat(),
    )


def connect_telegram_chat(db: Session, start_token: str, chat_id: str) -> TelegramConnectResult:
    clean_token = start_token.strip()
    clean_chat_id = chat_id.strip()
    if not clean_token or not clean_chat_id:
        return TelegramConnectResult(connected=False)

    now = utc_now()
    preferences = db.execute(
        select(SubscriberPreferenceRecord).where(
            SubscriberPreferenceRecord.telegram_link_token_hash == telegram_start_token_hash(clean_token),
            SubscriberPreferenceRecord.telegram_link_expires_at.is_not(None),
            SubscriberPreferenceRecord.telegram_link_expires_at >= now,
        )
    ).scalar_one_or_none()
    if preferences is None:
        return TelegramConnectResult(connected=False)

    preferences.telegram_chat_id = clean_chat_id
    preferences.telegram_enabled = True
    preferences.telegram_link_token_hash = None
    preferences.telegram_link_expires_at = None
    if not normalize_event_types(read_event_type_list(preferences.telegram_event_types_json)):
        preferences.telegram_event_types_json = to_json(DEFAULT_TELEGRAM_EVENT_TYPES)
    preferences.updated_at = now
    db.flush()
    return TelegramConnectResult(connected=True, email=preferences.email)


def telegram_start_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def read_event_type_list(value: str) -> list[str]:
    data = from_json(value)
    if not isinstance(data, list):
        return []
    return [item.strip() for item in data if isinstance(item, str) and item.strip()]
