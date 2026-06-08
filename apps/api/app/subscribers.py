from dataclasses import dataclass
from decimal import Decimal
import os
from typing import Any, Iterable, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SubscriberPreferenceRecord, TelegramAlertDeliveryRecord, TradeEventRecord, utc_now
from app.repositories import from_json, to_json


TELEGRAM_EVENT_TYPES = ("entry", "exit", "management", "risk")
EVENT_TYPE_MAP = {
    "order_filled": "entry",
    "position_closed": "exit",
    "position_reduced_by_ai": "exit",
    "order_canceled_by_ai": "management",
    "order_adjusted_by_ai": "management",
    "stop_updated_by_ai": "management",
    "stop_moved_to_breakeven": "management",
    "order_rejected": "risk",
}
TRADER_NAMES = {
    "channel-rider": "Channel Rider",
    "volume-breaker": "Volume Breaker",
    "pullback-architect": "Pullback Architect",
    "leverage-hunter": "Leverage Hunter",
    "liquidity-reaper": "Liquidity Reaper",
    "volatility-squeezer": "Volatility Squeeze",
    "trend-sentinel": "Trend Sentinel",
    "range-maker": "Range Maker",
    "funding-contrarian": "Funding Contrarian",
    "orderflow-sniper": "Orderflow Sniper",
}


@dataclass(frozen=True)
class TelegramSettingsInput:
    enabled: bool = False
    chat_id: str = ""
    event_types: Iterable[str] = ()
    min_return_pct: float = 0.0


@dataclass(frozen=True)
class TelegramSettingsView:
    enabled: bool
    chat_id: str
    event_types: list[str]
    min_return_pct: float


@dataclass(frozen=True)
class SubscriberPreferencesView:
    user_id: str
    email: str
    subscription_status: str
    favorite_trader_ids: list[str]
    telegram_settings: TelegramSettingsView
    locale: str


def get_or_create_subscriber_preferences(db: Session, user_id: str, email: str) -> SubscriberPreferencesView:
    clean_email = normalize_email(email)
    record = db.execute(select(SubscriberPreferenceRecord).where(SubscriberPreferenceRecord.email == clean_email)).scalar_one_or_none()
    if record is None:
        record = SubscriberPreferenceRecord(
            user_id=normalize_text(user_id),
            email=clean_email,
            status="active",
            subscription_status="active",
            favorite_trader_ids_json="[]",
            telegram_event_types_json="[]",
        )
        db.add(record)
        db.flush()
    return to_preferences_view(record)


def upsert_subscriber_preferences(
    db: Session,
    *,
    user_id: str,
    email: str,
    favorite_trader_ids: Iterable[str],
    telegram_settings: TelegramSettingsInput,
    locale: str = "ko",
) -> SubscriberPreferencesView:
    clean_email = normalize_email(email)
    record = db.execute(select(SubscriberPreferenceRecord).where(SubscriberPreferenceRecord.email == clean_email)).scalar_one_or_none()
    if record is None:
        record = SubscriberPreferenceRecord(email=clean_email, user_id=normalize_text(user_id), status="active")
        db.add(record)

    record.user_id = normalize_text(user_id)
    record.email = clean_email
    record.subscription_status = "active"
    record.favorite_trader_ids_json = to_json(normalize_favorite_trader_ids(favorite_trader_ids))
    record.telegram_enabled = bool(telegram_settings.enabled)
    record.telegram_chat_id = normalize_optional_text(telegram_settings.chat_id)
    record.telegram_event_types_json = to_json(normalize_event_types(telegram_settings.event_types))
    record.telegram_min_return_pct = normalize_float(telegram_settings.min_return_pct)
    record.locale = normalize_locale(locale)
    record.updated_at = utc_now()
    db.flush()
    return to_preferences_view(record)


def list_matching_telegram_subscribers(db: Session, event: TradeEventRecord) -> list[SubscriberPreferencesView]:
    telegram_event_type = telegram_event_type_for(event)
    if telegram_event_type is None:
        return []
    return [to_preferences_view(record) for record in matching_subscriber_records(db, event, telegram_event_type)]


def notify_subscribers_for_trade_event(db: Session, event: TradeEventRecord) -> None:
    telegram_event_type = telegram_event_type_for(event)
    if telegram_event_type is None or event.id is None:
        return

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    for record in matching_subscriber_records(db, event, telegram_event_type):
        if delivery_exists(db, record.id, event.id):
            continue
        text = compose_event_message(to_preferences_view(record), event, telegram_event_type)
        status = "missing_token"
        response_payload: dict[str, Any] = {"ok": False, "description": "missing TELEGRAM_BOT_TOKEN"}
        if bot_token:
            try:
                response_payload = send_telegram_message(bot_token=bot_token, chat_id=record.telegram_chat_id or "", text=text)
                status = "sent" if response_payload.get("ok") else "failed"
            except Exception as exc:
                response_payload = {"ok": False, "description": str(exc)}
                status = "failed"
        db.add(
            TelegramAlertDeliveryRecord(
                subscriber_preference_id=record.id,
                trade_event_id=event.id,
                trader_id=event.trader_id,
                symbol=event.symbol,
                status=status,
                telegram_event_type=telegram_event_type,
                chat_id=record.telegram_chat_id or "",
                payload_json=to_json({"message": text}),
                response_json=to_json(response_payload),
            )
        )
    db.flush()


def send_telegram_message(*, bot_token: str, chat_id: str, text: str) -> dict[str, Any]:
    response = httpx.post(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        timeout=5.0,
    )
    if response.headers.get("content-type", "").startswith("application/json"):
        data = response.json()
    else:
        data = {"ok": response.is_success, "description": response.text}
    if not response.is_success and "ok" not in data:
        data["ok"] = False
    return data


def preferences_payload(preferences: SubscriberPreferencesView) -> dict[str, Any]:
    return {
        "userId": preferences.user_id,
        "email": preferences.email,
        "subscriptionStatus": preferences.subscription_status,
        "favoriteTraderIds": preferences.favorite_trader_ids,
        "telegramSettings": {
            "enabled": preferences.telegram_settings.enabled,
            "chatId": preferences.telegram_settings.chat_id,
            "eventTypes": preferences.telegram_settings.event_types,
            "minReturnPct": preferences.telegram_settings.min_return_pct,
        },
        "locale": preferences.locale,
    }


def matching_subscriber_records(db: Session, event: TradeEventRecord, telegram_event_type: str) -> list[SubscriberPreferenceRecord]:
    records = db.execute(
        select(SubscriberPreferenceRecord)
        .where(
            SubscriberPreferenceRecord.subscription_status == "active",
            SubscriberPreferenceRecord.telegram_enabled.is_(True),
            SubscriberPreferenceRecord.telegram_chat_id.is_not(None),
        )
        .order_by(SubscriberPreferenceRecord.id.asc())
    ).scalars().all()
    return [record for record in records if subscriber_matches(record, event, telegram_event_type)]


def subscriber_matches(record: SubscriberPreferenceRecord, event: TradeEventRecord, telegram_event_type: str) -> bool:
    settings = to_preferences_view(record).telegram_settings
    if telegram_event_type not in settings.event_types:
        return False
    favorite_ids = read_string_list(record.favorite_trader_ids_json)
    if favorite_ids and (event.trader_id or "") not in favorite_ids:
        return False
    if telegram_event_type == "exit" and settings.min_return_pct > 0:
        return abs(event_return_pct(event)) >= settings.min_return_pct
    return True


def to_preferences_view(record: SubscriberPreferenceRecord) -> SubscriberPreferencesView:
    return SubscriberPreferencesView(
        user_id=record.user_id,
        email=record.email,
        subscription_status=record.subscription_status,
        favorite_trader_ids=read_string_list(record.favorite_trader_ids_json),
        telegram_settings=TelegramSettingsView(
            enabled=record.telegram_enabled,
            chat_id=record.telegram_chat_id or "",
            event_types=normalize_event_types(read_string_list(record.telegram_event_types_json)),
            min_return_pct=record.telegram_min_return_pct,
        ),
        locale=record.locale,
    )


def compose_event_message(preferences: SubscriberPreferencesView, event: TradeEventRecord, telegram_event_type: str) -> str:
    trader_name = TRADER_NAMES.get(event.trader_id or "", event.trader_id or "-")
    label = {"entry": "진입", "exit": "청산", "management": "관리", "risk": "리스크"}[telegram_event_type] if preferences.locale == "ko" else telegram_event_type.title()
    price = f"{float(event.price):,.1f}" if event.price is not None else "-"
    pnl = f"{float(event.realized_pnl):+,.2f}" if event.realized_pnl else "-"
    return "\n".join([f"[AI Trader League] {label}", f"{trader_name} · {event.symbol or '-'}", f"Event: {event.event_type}", f"Price: {price}", f"PnL: {pnl}"])


def telegram_event_type_for(event: TradeEventRecord) -> Optional[str]:
    return EVENT_TYPE_MAP.get(event.event_type)


def delivery_exists(db: Session, subscriber_id: int, event_id: int) -> bool:
    return db.execute(
        select(TelegramAlertDeliveryRecord.id).where(
            TelegramAlertDeliveryRecord.subscriber_preference_id == subscriber_id,
            TelegramAlertDeliveryRecord.trade_event_id == event_id,
        )
    ).scalar_one_or_none() is not None


def event_return_pct(event: TradeEventRecord) -> float:
    if not event.equity or not event.realized_pnl:
        return 0.0
    equity = Decimal(event.equity)
    if equity == 0:
        return 0.0
    return float((Decimal(event.realized_pnl) / equity) * Decimal("100"))


def normalize_event_types(values: Iterable[str]) -> list[str]:
    return [event_type for event_type in TELEGRAM_EVENT_TYPES if event_type in {normalize_text(value) for value in values}]


def normalize_favorite_trader_ids(values: Iterable[str]) -> list[str]:
    return sorted({normalize_text(value) for value in values if normalize_text(value)})


def read_string_list(value: Optional[str]) -> list[str]:
    data = from_json(value)
    if not isinstance(data, list):
        return []
    return [item.strip() for item in data if isinstance(item, str) and item.strip()]


def normalize_email(value: str) -> str:
    clean = value.strip().lower()
    if not clean:
        raise ValueError("email is required")
    return clean


def normalize_text(value: Any) -> str:
    return str(value).strip()


def normalize_optional_text(value: Any) -> Optional[str]:
    clean = normalize_text(value)
    return clean or None


def normalize_float(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    return parsed if parsed == parsed else 0.0


def normalize_locale(value: str) -> str:
    return "en" if value == "en" else "ko"
