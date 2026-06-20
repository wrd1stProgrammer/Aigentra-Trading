from __future__ import annotations

from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import WhopCheckoutRecord, WhopWebhookEventRecord
from app.whop_client import WhopCheckoutAPIError, create_checkout_configuration, whop_sandbox_enabled
from app.whop_payload import (
    WhopWebhookPayloadError,
    canonical_event_type,
    checkout_id_from_data,
    dumps_json,
    event_data,
    membership_id_from_data,
    metadata_from_data,
    normalize_email,
    parse_event,
    payment_id_from_event,
    read_nested_string,
    read_number,
    read_string,
)
from app.whop_signature import verify_whop_webhook_signature


class WhopConfigurationError(ValueError):
    pass


def create_whop_checkout(
    db: Session,
    *,
    user_id: str,
    email: str,
    locale: str,
    redirect_url: str,
    source_url: str,
    settings: Settings,
) -> dict[str, Any]:
    validate_checkout_settings(settings)
    normalized_email = normalize_email(email)
    order_id = "atl_" + uuid4().hex
    metadata = {
        "order_id": order_id,
        "user_id": user_id.strip(),
        "email": normalized_email,
        "locale": locale.strip() or "ko",
        "plan_key": settings.whop_plan_key.strip(),
    }
    payload = create_checkout_configuration(
        settings=settings,
        metadata=metadata,
        redirect_url=safe_url(redirect_url, require_https=True),
        source_url=safe_url(source_url, require_https=True),
    )
    checkout_id = read_string(payload, "id")
    purchase_url = normalize_purchase_url(read_string(payload, "purchase_url"), settings)
    configured_plan_id = settings.whop_plan_id.strip()
    plan_id = read_nested_string(payload, "plan", "id") or read_string(payload, "plan_id") or configured_plan_id
    if not checkout_id or not purchase_url:
        raise WhopCheckoutAPIError("Whop checkout API response is missing checkout data")

    db.add(
        WhopCheckoutRecord(
            checkout_id=checkout_id,
            internal_order_id=order_id,
            user_id=user_id.strip(),
            email=normalized_email,
            plan_key=settings.whop_plan_key.strip(),
            status="created",
            whop_plan_id=plan_id or None,
            purchase_url=purchase_url,
            metadata_json=dumps_json(metadata),
            raw_json=dumps_json(payload),
        )
    )
    db.flush()
    return {
        "checkoutId": checkout_id,
        "planId": plan_id,
        "purchaseUrl": purchase_url,
        "sandbox": whop_sandbox_enabled(settings),
    }


def process_whop_webhook(
    db: Session,
    *,
    body: str,
    headers: dict[str, str],
    settings: Settings,
) -> dict[str, bool]:
    secret = settings.whop_webhook_secret.strip()
    if not secret:
        raise WhopConfigurationError("whop_webhook_not_configured")
    webhook_id = verify_whop_webhook_signature(body=body, headers=headers, secret=secret)
    if db.query(WhopWebhookEventRecord).filter_by(webhook_id=webhook_id).first() is not None:
        return {"ok": True, "duplicate": True}

    event = parse_event(body)
    event_type = read_string(event, "type")
    normalized_event_type = canonical_event_type(event_type)
    data = event_data(event)
    db.add(
        WhopWebhookEventRecord(
            webhook_id=webhook_id,
            event_type=event_type or "unknown",
            api_version=read_string(event, "api_version") or None,
            checkout_id=checkout_id_from_data(data) or None,
            payment_id=payment_id_from_event(normalized_event_type, data) or None,
            membership_id=membership_id_from_data(data) or None,
            payload_json=dumps_json(event),
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return {"ok": True, "duplicate": True}

    apply_webhook_to_checkout(db, normalized_event_type, data)
    db.flush()
    return {"ok": True, "duplicate": False}


def validate_checkout_settings(settings: Settings) -> None:
    if not settings.whop_api_key.strip() or not settings.whop_company_id.strip():
        raise WhopConfigurationError("whop_not_configured")
    if not safe_url(settings.whop_api_base_url):
        raise WhopConfigurationError("whop_not_configured")
    if not settings.whop_plan_key.strip():
        raise WhopConfigurationError("whop_not_configured")
    if settings.whop_plan_id.strip():
        return
    plan_type = settings.whop_plan_type.strip().lower()
    if plan_type not in {"one_time", "renewal"}:
        raise WhopConfigurationError("whop_not_configured")
    if settings.whop_plan_initial_price <= 0:
        raise WhopConfigurationError("whop_not_configured")
    if plan_type == "renewal" and (settings.whop_plan_renewal_price <= 0 or settings.whop_plan_billing_period_days <= 0):
        raise WhopConfigurationError("whop_not_configured")


def apply_webhook_to_checkout(db: Session, event_type: str, data: dict[str, Any]) -> None:
    status = {
        "payment.succeeded": "payment_succeeded",
        "payment.failed": "payment_failed",
        "membership.activated": "membership_active",
        "membership.went_valid": "membership_active",
        "membership.deactivated": "membership_inactive",
        "refund.created": "refunded",
        "dispute.created": "disputed",
    }.get(event_type)
    if not status:
        return
    checkout = find_checkout(db, data)
    if checkout is None:
        return
    checkout.status = status
    payment_id = payment_id_from_event(event_type, data)
    membership_id = membership_id_from_data(data)
    if payment_id:
        checkout.whop_payment_id = payment_id
    if membership_id:
        checkout.whop_membership_id = membership_id
    currency = read_string(data, "currency")
    if currency:
        checkout.currency = currency
    amount = read_number(data, "amount_after_fees")
    if amount is None:
        amount = read_number(data, "amount")
    if amount is not None:
        checkout.amount = amount
    checkout.raw_json = dumps_json(data)


def find_checkout(db: Session, data: dict[str, Any]) -> WhopCheckoutRecord | None:
    metadata = metadata_from_data(data)
    order_id = str(metadata.get("order_id", "")).strip()
    if order_id:
        checkout = db.query(WhopCheckoutRecord).filter_by(internal_order_id=order_id).first()
        if checkout is not None:
            return checkout
    checkout_id = checkout_id_from_data(data)
    return db.query(WhopCheckoutRecord).filter_by(checkout_id=checkout_id).first() if checkout_id else None


def normalize_purchase_url(purchase_url: str, settings: Settings) -> str:
    if not purchase_url:
        return ""
    if purchase_url.startswith("/"):
        host = "https://sandbox.whop.com" if whop_sandbox_enabled(settings) else "https://whop.com"
        purchase_url = host + purchase_url
    parsed = urlparse(purchase_url)
    allowed_hosts = {"whop.com", "www.whop.com", "sandbox.whop.com"}
    if parsed.scheme != "https" or parsed.netloc not in allowed_hosts:
        raise WhopCheckoutAPIError("Whop checkout API returned an unsafe purchase URL")
    return purchase_url


def safe_url(value: str, *, require_https: bool = False) -> str:
    clean_value = value.strip()
    if not clean_value:
        return ""
    parsed = urlparse(clean_value)
    allowed_schemes = {"https"} if require_https else {"http", "https"}
    return clean_value if parsed.scheme in allowed_schemes and parsed.netloc else ""
