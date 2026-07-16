from __future__ import annotations

from datetime import datetime
from typing import Final, Literal, TypedDict

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import WhopCheckoutRecord
from app.whop_payload import normalize_email
from app.whop_settings import whop_sandbox_enabled


WhopSubscriptionState = Literal["none", "pending", "active", "inactive"]

ACTIVE_CHECKOUT_STATUSES: Final = frozenset({"payment_succeeded", "membership_active", "cancel_at_period_end"})
PENDING_CHECKOUT_STATUSES: Final = frozenset({"created"})
ENDING_CHECKOUT_STATUSES: Final = frozenset({"membership_inactive", "refunded", "disputed"})


class WhopSubscriptionStatusPayload(TypedDict):
    status: WhopSubscriptionState
    checkoutStatus: str
    planKey: str | None
    planId: str | None
    checkoutId: str | None
    paymentId: str | None
    membershipId: str | None
    currency: str | None
    amount: float | None
    cancelAtPeriodEnd: bool
    currentPeriodEnd: str | None
    sandbox: bool


def read_whop_subscription_status(
    db: Session,
    *,
    user_id: str,
    email: str,
    settings: Settings,
) -> WhopSubscriptionStatusPayload:
    clean_user_id = user_id.strip()
    clean_email = normalize_email(email)
    latest_record = latest_checkout_record(db, user_id=clean_user_id, email=clean_email)
    active_record = latest_checkout_record(
        db,
        user_id=clean_user_id,
        email=clean_email,
        statuses=ACTIVE_CHECKOUT_STATUSES,
    )
    status_record = active_record or latest_record
    if status_record is None:
        return empty_status_payload(settings)

    return {
        "status": subscription_state(latest_record=latest_record, active_record=active_record),
        "checkoutStatus": status_record.status,
        "planKey": status_record.plan_key,
        "planId": status_record.whop_plan_id,
        "checkoutId": status_record.checkout_id,
        "paymentId": status_record.whop_payment_id,
        "membershipId": status_record.whop_membership_id,
        "currency": status_record.currency,
        "amount": status_record.amount,
        "cancelAtPeriodEnd": status_record.cancel_at_period_end,
        "currentPeriodEnd": iso_datetime(status_record.current_period_end),
        "sandbox": whop_sandbox_enabled(settings),
    }


def latest_checkout_record(
    db: Session,
    *,
    user_id: str,
    email: str,
    statuses: frozenset[str] | None = None,
) -> WhopCheckoutRecord | None:
    return newer_checkout_record(
        latest_checkout_record_by_user_id(db, user_id=user_id, statuses=statuses),
        latest_checkout_record_by_email(db, email=email, statuses=statuses),
    )


def latest_checkout_record_by_user_id(
    db: Session,
    *,
    user_id: str,
    statuses: frozenset[str] | None = None,
) -> WhopCheckoutRecord | None:
    query = select(WhopCheckoutRecord).where(WhopCheckoutRecord.user_id == user_id)
    if statuses is not None:
        query = query.where(WhopCheckoutRecord.status.in_(statuses))
    return db.execute(
        query.order_by(
            desc(WhopCheckoutRecord.updated_at),
            desc(WhopCheckoutRecord.created_at),
            desc(WhopCheckoutRecord.id),
        )
        .limit(1)
    ).scalars().first()


def latest_checkout_record_by_email(
    db: Session,
    *,
    email: str,
    statuses: frozenset[str] | None = None,
) -> WhopCheckoutRecord | None:
    query = select(WhopCheckoutRecord).where(WhopCheckoutRecord.email == email)
    if statuses is not None:
        query = query.where(WhopCheckoutRecord.status.in_(statuses))
    return db.execute(
        query.order_by(
            desc(WhopCheckoutRecord.updated_at),
            desc(WhopCheckoutRecord.created_at),
            desc(WhopCheckoutRecord.id),
        )
        .limit(1)
    ).scalars().first()


def newer_checkout_record(
    first: WhopCheckoutRecord | None,
    second: WhopCheckoutRecord | None,
) -> WhopCheckoutRecord | None:
    if first is None:
        return second
    if second is None:
        return first
    if (second.updated_at, second.created_at, second.id) > (first.updated_at, first.created_at, first.id):
        return second
    return first


def subscription_state(
    *,
    latest_record: WhopCheckoutRecord | None,
    active_record: WhopCheckoutRecord | None,
) -> WhopSubscriptionState:
    if active_record is not None:
        if (
            latest_record is not None
            and latest_record.status in ENDING_CHECKOUT_STATUSES
            and latest_record.updated_at >= active_record.updated_at
        ):
            return "inactive"
        return "active"
    if latest_record is None:
        return "none"
    if latest_record.status in PENDING_CHECKOUT_STATUSES:
        return "pending"
    return "inactive"


def empty_status_payload(settings: Settings) -> WhopSubscriptionStatusPayload:
    return {
        "status": "none",
        "checkoutStatus": "none",
        "planKey": None,
        "planId": None,
        "checkoutId": None,
        "paymentId": None,
        "membershipId": None,
        "currency": None,
        "amount": None,
        "cancelAtPeriodEnd": False,
        "currentPeriodEnd": None,
        "sandbox": whop_sandbox_enabled(settings),
    }


def iso_datetime(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None
