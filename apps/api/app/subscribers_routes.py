import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import SubscriberPreferenceRecord, get_db, session_scope
from app.subscribers import (
    TelegramSettingsInput,
    get_or_create_subscriber_preferences,
    preferences_payload,
    upsert_subscriber_preferences,
)
from app.subscriber_access import access_payload, read_subscriber_access_state, unlock_payload, unlock_review_source
from app.telegram_client import get_telegram_bot_username, send_telegram_message
from app.telegram_linking import connect_telegram_chat, create_telegram_start_link


router = APIRouter(prefix="/api/subscribers", tags=["subscribers"])


class TelegramSettingsPayload(BaseModel):
    enabled: bool = False
    chatId: str = ""
    eventTypes: list[str] | None = None
    reviewSections: list[str] | None = None
    minReturnPct: float = 0.0


class SubscriberPreferencesPayload(BaseModel):
    userId: str
    email: str
    favoriteTraderIds: list[str] = Field(default_factory=list)
    telegramSettings: TelegramSettingsPayload = Field(default_factory=TelegramSettingsPayload)
    locale: str = "ko"


class TelegramLinkPayload(BaseModel):
    userId: str
    email: str


class SubscriberAccessUnlockPayload(BaseModel):
    userId: str
    email: str
    sourceKey: str
    sourceType: str = "scenario"
    traderId: str | None = None
    symbol: str | None = None


def require_subscriber_api_token(x_subscriber_api_token: str = Header(default="")) -> None:
    expected_token = (os.getenv("SUBSCRIBER_API_TOKEN") or get_settings().subscriber_api_token).strip()
    if not expected_token or x_subscriber_api_token != expected_token:
        raise HTTPException(status_code=401, detail="subscriber API token required")


def require_telegram_webhook_secret(secret_token: str) -> None:
    expected_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if expected_secret and secret_token != expected_secret:
        raise HTTPException(status_code=401, detail="telegram webhook secret required")


def telegram_update_message(update: dict[str, Any]) -> dict[str, Any] | None:
    message = update.get("message") or update.get("edited_message")
    return message if isinstance(message, dict) else None


def telegram_message_chat_id(message: dict[str, Any]) -> str:
    chat = message.get("chat")
    if not isinstance(chat, dict):
        return ""
    chat_id = chat.get("id")
    return str(chat_id).strip() if chat_id is not None else ""


def telegram_message_text(message: dict[str, Any]) -> str:
    text = message.get("text")
    return text.strip() if isinstance(text, str) else ""


def telegram_start_token(text: str) -> str:
    parts = text.split(maxsplit=1)
    if len(parts) != 2 or parts[0] != "/start":
        return ""
    return parts[1].strip()


def telegram_start_reply(chat_id: str) -> str:
    return "\n".join(
        [
            "AI Trader League 알림 연결 준비가 끝났습니다.",
            f"Chat ID: {chat_id}",
            "계정 설정에서 Telegram 연결 버튼을 사용하면 다음부터 자동 연결됩니다.",
        ]
    )


def telegram_connected_reply(email: str) -> str:
    return "\n".join(
        [
            "AI Trader League 텔레그램 연결 완료",
            f"계정: {email}",
            "이제 선택한 AI 트레이더의 알림이 이 채팅으로 전송됩니다.",
        ]
    )


def telegram_invalid_token_reply() -> str:
    return "\n".join(
        [
            "AI Trader League 연결 링크가 만료되었거나 유효하지 않습니다.",
            "웹의 내 알림 화면에서 Telegram 연결 버튼을 다시 눌러주세요.",
        ]
    )


def resolve_telegram_bot_username() -> str:
    configured_username = os.getenv("TELEGRAM_BOT_USERNAME", "").strip()
    if configured_username:
        return configured_username.lstrip("@")
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    return get_telegram_bot_username(bot_token=bot_token) if bot_token else ""


@router.get("/preferences")
def read_subscriber_preferences(
    user_id: str = Query(alias="userId"),
    email: str = Query(),
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        preferences = get_or_create_subscriber_preferences(db, user_id=user_id, email=email)
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return preferences_payload(preferences)


@router.get("/access")
def read_subscriber_access(
    user_id: str = Query(alias="userId"),
    email: str = Query(),
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    try:
        state = read_subscriber_access_state(db, user_id=user_id, email=email, settings=get_settings())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return access_payload(state)


@router.post("/access/unlock")
def unlock_subscriber_review_source(
    payload: SubscriberAccessUnlockPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    try:
        result = unlock_review_source(
            db,
            user_id=payload.userId,
            email=payload.email,
            source_key=payload.sourceKey,
            source_type=payload.sourceType,
            trader_id=payload.traderId,
            symbol=payload.symbol,
            settings=get_settings(),
        )
        db.commit()
    except ValueError as exc:
        detail = str(exc)
        status_code = 402 if detail == "review_coupon_limit_reached" else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return unlock_payload(result)


@router.post("/telegram/link")
def create_telegram_link(
    payload: TelegramLinkPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    bot_username = resolve_telegram_bot_username()
    if not bot_username:
        raise HTTPException(status_code=503, detail="missing Telegram bot username")
    try:
        get_or_create_subscriber_preferences(db, user_id=payload.userId, email=payload.email)
        record = db.query(SubscriberPreferenceRecord).filter_by(email=payload.email.strip().lower()).one()
        link = create_telegram_start_link(db, record, bot_username)
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"telegramUrl": link.telegram_url, "expiresAt": link.expires_at_iso, "botUsername": bot_username}


@router.put("/preferences")
def update_subscriber_preferences(
    payload: SubscriberPreferencesPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        preferences = upsert_subscriber_preferences(
            db,
            user_id=payload.userId,
            email=payload.email,
            favorite_trader_ids=payload.favoriteTraderIds,
            telegram_settings=TelegramSettingsInput(
                enabled=payload.telegramSettings.enabled,
                chat_id=payload.telegramSettings.chatId,
                event_types=payload.telegramSettings.eventTypes,
                review_sections=payload.telegramSettings.reviewSections,
                min_return_pct=payload.telegramSettings.minReturnPct,
            ),
            locale=payload.locale,
        )
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return preferences_payload(preferences)


@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(default="", alias="X-Telegram-Bot-Api-Secret-Token"),
) -> dict[str, bool]:
    require_telegram_webhook_secret(x_telegram_bot_api_secret_token)
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not bot_token:
        raise HTTPException(status_code=503, detail="missing TELEGRAM_BOT_TOKEN")

    update = await request.json()
    if not isinstance(update, dict):
        return {"ok": True}

    message = telegram_update_message(update)
    if message is None:
        return {"ok": True}

    chat_id = telegram_message_chat_id(message)
    text = telegram_message_text(message)
    start_token = telegram_start_token(text)
    if chat_id and start_token:
        with session_scope() as db:
            result = connect_telegram_chat(db, start_token, chat_id)
        reply = telegram_connected_reply(result.email) if result.connected else telegram_invalid_token_reply()
        send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=reply)
    elif chat_id and text.startswith("/start"):
        send_telegram_message(bot_token=bot_token, chat_id=chat_id, text=telegram_start_reply(chat_id))
    return {"ok": True}
