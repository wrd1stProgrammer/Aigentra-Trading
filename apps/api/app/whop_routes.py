from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.subscribers_routes import require_subscriber_api_token
from app.whop_client import WhopCheckoutAPIError, WhopMembershipAPIError
from app.whop_service import (
    WhopConfigurationError,
    cancel_whop_subscription,
    create_whop_checkout,
    process_whop_webhook,
)
from app.whop_status import WhopSubscriptionStatusPayload, read_whop_subscription_status
from app.whop_payload import WhopWebhookPayloadError
from app.whop_signature import WhopWebhookVerificationError


router = APIRouter(prefix="/api/billing/whop", tags=["billing"])


class WhopCheckoutPayload(BaseModel):
    userId: str
    email: str
    locale: str = "ko"
    planKey: str = ""
    redirectUrl: str = ""
    sourceUrl: str = ""


class WhopSubscriptionPayload(BaseModel):
    userId: str
    email: str


@router.post("/checkout")
def create_checkout(
    payload: WhopCheckoutPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = create_whop_checkout(
            db,
            user_id=payload.userId,
            email=payload.email,
            locale=payload.locale,
            plan_key=payload.planKey,
            redirect_url=payload.redirectUrl,
            source_url=payload.sourceUrl,
            settings=get_settings(),
        )
        db.commit()
        return result
    except WhopConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WhopCheckoutAPIError as exc:
        raise HTTPException(status_code=502, detail=exc.public_detail) from exc


@router.get("/status")
def read_status(
    user_id: str = Query(alias="userId"),
    email: str = Query(),
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> WhopSubscriptionStatusPayload:
    try:
        return read_whop_subscription_status(
            db,
            user_id=user_id,
            email=email,
            settings=get_settings(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/cancel")
def cancel_subscription(
    payload: WhopSubscriptionPayload,
    _: None = Depends(require_subscriber_api_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = cancel_whop_subscription(
            db,
            user_id=payload.userId,
            email=payload.email,
            settings=get_settings(),
        )
        db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (WhopCheckoutAPIError, WhopMembershipAPIError) as exc:
        raise HTTPException(status_code=502, detail=exc.public_detail) from exc


@router.post("/webhook")
async def whop_webhook(
    request: Request,
    webhook_id: str = Header(default="", alias="webhook-id"),
    webhook_timestamp: str = Header(default="", alias="webhook-timestamp"),
    webhook_signature: str = Header(default="", alias="webhook-signature"),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    body = (await request.body()).decode("utf-8")
    headers = {
        "webhook-id": webhook_id,
        "webhook-timestamp": webhook_timestamp,
        "webhook-signature": webhook_signature,
    }
    try:
        result = process_whop_webhook(db, body=body, headers=headers, settings=get_settings())
        db.commit()
        return result
    except WhopConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except WhopWebhookVerificationError as exc:
        raise HTTPException(status_code=401, detail="invalid_whop_webhook_signature") from exc
    except WhopWebhookPayloadError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
