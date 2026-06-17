from dataclasses import dataclass
from decimal import Decimal
import os
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import (
    PositionManagementReviewRecord,
    SubscriberPreferenceRecord,
    TelegramAlertDeliveryRecord,
    TradeEventRecord,
    utc_now,
)
from app.repositories import from_json, to_json
from app.subscriber_alert_types import DEFAULT_TELEGRAM_EVENT_TYPES, normalize_event_types
from app.telegram_client import send_telegram_message


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
    "donchian-breakout": "Donchian Breakout",
    "ichimoku-cloud-pilot": "Ichimoku Cloud Pilot",
    "vwap-reclaimer": "VWAP Reclaimer",
    "wyckoff-spring": "Wyckoff Spring",
    "rsi-divergence-scout": "RSI Divergence Scout",
    "session-raider": "Session Raider",
    "imbalance-hunter": "Imbalance Hunter",
    "momentum-ignition": "Momentum Ignition",
    "bollinger-reversion": "Bollinger Reversion",
    "atr-trail-commander": "ATR Trail Commander",
}


@dataclass(frozen=True)
class TelegramSettingsInput:
    enabled: bool = False
    chat_id: str = ""
    event_types: Iterable[str] | None = None
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
            telegram_event_types_json=to_json(DEFAULT_TELEGRAM_EVENT_TYPES),
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
                position_management_review_id=None,
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


def notify_subscribers_for_management_review(db: Session, review: PositionManagementReviewRecord) -> None:
    telegram_event_type = telegram_event_type_for_management_review(review)
    if telegram_event_type is None or review.id is None:
        return

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    for record in matching_management_subscriber_records(db, review, telegram_event_type):
        if management_delivery_exists(db, record.id, review.id):
            continue
        text = compose_management_message(to_preferences_view(record), review, telegram_event_type)
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
                trade_event_id=None,
                position_management_review_id=review.id,
                trader_id=review.trader_id,
                symbol=review.symbol,
                status=status,
                telegram_event_type=telegram_event_type,
                chat_id=record.telegram_chat_id or "",
                payload_json=to_json({"message": text}),
                response_json=to_json(response_payload),
            )
        )
    db.flush()


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


def matching_management_subscriber_records(
    db: Session,
    review: PositionManagementReviewRecord,
    telegram_event_type: str,
) -> list[SubscriberPreferenceRecord]:
    records = db.execute(
        select(SubscriberPreferenceRecord)
        .where(
            SubscriberPreferenceRecord.subscription_status == "active",
            SubscriberPreferenceRecord.telegram_enabled.is_(True),
            SubscriberPreferenceRecord.telegram_chat_id.is_not(None),
        )
        .order_by(SubscriberPreferenceRecord.id.asc())
    ).scalars().all()
    return [record for record in records if management_subscriber_matches(record, review, telegram_event_type)]


def subscriber_matches(record: SubscriberPreferenceRecord, event: TradeEventRecord, telegram_event_type: str) -> bool:
    settings = to_preferences_view(record).telegram_settings
    if telegram_event_type not in settings.event_types:
        return False
    favorite_ids = read_string_list(record.favorite_trader_ids_json)
    if favorite_ids and (event.trader_id or "") not in favorite_ids:
        return False
    if telegram_event_type in {"take_profit", "stop_loss"} and settings.min_return_pct > 0:
        return abs(event_return_pct(event)) >= settings.min_return_pct
    return True


def management_subscriber_matches(
    record: SubscriberPreferenceRecord,
    review: PositionManagementReviewRecord,
    telegram_event_type: str,
) -> bool:
    settings = to_preferences_view(record).telegram_settings
    if telegram_event_type not in settings.event_types:
        return False
    favorite_ids = read_string_list(record.favorite_trader_ids_json)
    return not favorite_ids or (review.trader_id or "") in favorite_ids


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
    label = telegram_event_label(telegram_event_type, preferences.locale)
    price = f"{float(event.price):,.1f}" if event.price is not None else "-"
    pnl = f"{float(event.realized_pnl):+,.2f}" if event.realized_pnl else "-"
    payload = from_json(event.payload_json)
    reason = payload.get("reason") if isinstance(payload, dict) else None
    return "\n".join(
        [
            f"[AI Trader League] {label}",
            f"{trader_name} · {event.symbol or '-'}",
            f"Event: {event.event_type}",
            f"Reason: {reason or '-'}",
            f"Price: {price}",
            f"PnL: {pnl}",
        ]
    )


def compose_management_message(
    preferences: SubscriberPreferencesView,
    review: PositionManagementReviewRecord,
    telegram_event_type: str,
) -> str:
    trader_name = TRADER_NAMES.get(review.trader_id or "", review.trader_id or "-")
    label = telegram_event_label(telegram_event_type, preferences.locale)
    payload = from_json(review.payload_json)
    event_payload = payload.get("event", {}) if isinstance(payload, dict) else {}
    review_payload = payload.get("review", {}) if isinstance(payload, dict) else {}
    rationale = review_payload.get("rationale") or review.error_message or "-"
    return "\n".join(
        [
            f"[AI Trader League] {label}",
            f"{trader_name} · {review.symbol or '-'}",
            f"Phase: {review.phase or event_payload.get('phase') or '-'}",
            f"Decision: {review.decision or '-'} / Action: {review.action_type or '-'}",
            f"Confidence: {review.confidence if review.confidence is not None else '-'}",
            f"Reason: {rationale}",
        ]
    )


def telegram_event_label(telegram_event_type: str, locale: str) -> str:
    labels = {
        "ko": {
            "pending_entry": "진입대기",
            "position_entry": "진입완료",
            "take_profit": "익절완료",
            "stop_loss": "손절완료",
            "ai_review_low": "AI 중간 리뷰 낮음",
            "ai_review_medium": "AI 중간 리뷰 중간",
            "ai_review_high": "AI 중간 리뷰 높음",
            "risk": "리스크",
        },
        "en": {
            "pending_entry": "Entry Pending",
            "position_entry": "Entry Filled",
            "take_profit": "Take Profit",
            "stop_loss": "Stop Loss",
            "ai_review_low": "AI Review Low",
            "ai_review_medium": "AI Review Medium",
            "ai_review_high": "AI Review High",
            "risk": "Risk",
        },
    }
    return labels["en" if locale == "en" else "ko"].get(telegram_event_type, telegram_event_type)


def telegram_event_type_for(event: TradeEventRecord) -> Optional[str]:
    if event.event_type == "paper_order_created":
        return "pending_entry"
    if event.event_type == "order_filled":
        return "position_entry"
    if event.event_type == "position_closed":
        return closed_position_event_type(event)
    if event.event_type == "order_rejected":
        return "risk"
    return None


def closed_position_event_type(event: TradeEventRecord) -> str:
    payload = from_json(event.payload_json)
    reason = payload.get("reason") if isinstance(payload, dict) else None
    if reason == "take_profit":
        return "take_profit"
    if reason in {"stop_loss", "early_thesis_failure"}:
        return "stop_loss"
    if event.realized_pnl is not None and Decimal(event.realized_pnl) > 0:
        return "take_profit"
    return "stop_loss"


def telegram_event_type_for_management_review(review: PositionManagementReviewRecord) -> Optional[str]:
    payload = from_json(review.payload_json)
    event_payload = payload.get("event", {}) if isinstance(payload, dict) else {}
    review_payload = payload.get("review", {}) if isinstance(payload, dict) else {}
    severity = normalize_text(event_payload.get("severity") or review_payload.get("riskLevel") or "MEDIUM").upper()
    if severity == "HIGH":
        return "ai_review_high"
    if severity == "LOW":
        return "ai_review_low"
    return "ai_review_medium"


def delivery_exists(db: Session, subscriber_id: int, event_id: int) -> bool:
    return db.execute(
        select(TelegramAlertDeliveryRecord.id).where(
            TelegramAlertDeliveryRecord.subscriber_preference_id == subscriber_id,
            TelegramAlertDeliveryRecord.trade_event_id == event_id,
        )
    ).scalar_one_or_none() is not None


def management_delivery_exists(db: Session, subscriber_id: int, review_id: int) -> bool:
    return db.execute(
        select(TelegramAlertDeliveryRecord.id).where(
            TelegramAlertDeliveryRecord.subscriber_preference_id == subscriber_id,
            TelegramAlertDeliveryRecord.position_management_review_id == review_id,
        )
    ).scalar_one_or_none() is not None


def event_return_pct(event: TradeEventRecord) -> float:
    if not event.equity or not event.realized_pnl:
        return 0.0
    equity = Decimal(event.equity)
    if equity == 0:
        return 0.0
    return float((Decimal(event.realized_pnl) / equity) * Decimal("100"))


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
