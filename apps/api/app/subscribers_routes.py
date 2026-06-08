import os
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.subscribers import (
    TelegramSettingsInput,
    get_or_create_subscriber_preferences,
    preferences_payload,
    upsert_subscriber_preferences,
)


router = APIRouter(prefix="/api/subscribers", tags=["subscribers"])


class TelegramSettingsPayload(BaseModel):
    enabled: bool = False
    chatId: str = ""
    eventTypes: list[str] = Field(default_factory=list)
    minReturnPct: float = 0.0


class SubscriberPreferencesPayload(BaseModel):
    userId: str
    email: str
    favoriteTraderIds: list[str] = Field(default_factory=list)
    telegramSettings: TelegramSettingsPayload = Field(default_factory=TelegramSettingsPayload)
    locale: str = "ko"


def require_subscriber_api_token(x_subscriber_api_token: str = Header(default="")) -> None:
    expected_token = (os.getenv("SUBSCRIBER_API_TOKEN") or get_settings().subscriber_api_token).strip()
    if not expected_token or x_subscriber_api_token != expected_token:
        raise HTTPException(status_code=401, detail="subscriber API token required")


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
                min_return_pct=payload.telegramSettings.minReturnPct,
            ),
            locale=payload.locale,
        )
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return preferences_payload(preferences)
