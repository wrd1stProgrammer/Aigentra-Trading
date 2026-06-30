from dataclasses import dataclass
from typing import Literal

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import ReviewUnlockRecord, utc_now
from app.whop_payload import normalize_email
from app.whop_status import WhopSubscriptionState, read_whop_subscription_status


FREE_REVIEW_COUPON_LIMIT = 3
ReviewSourceType = Literal["scenario", "review", "trader_detail"]


@dataclass(frozen=True)
class SubscriberAccessState:
    user_id: str
    email: str
    subscription_status: WhopSubscriptionState
    is_subscribed: bool
    coupon_limit: int
    coupons_used: int
    coupons_remaining: int
    unlocked_source_keys: list[str]


@dataclass(frozen=True)
class ReviewUnlockResult:
    access: SubscriberAccessState
    source_key: str
    source_type: str
    unlocked: bool
    charged: bool


def read_subscriber_access_state(
    db: Session,
    *,
    user_id: str,
    email: str,
    settings: Settings,
) -> SubscriberAccessState:
    clean_user_id = normalize_user_id(user_id)
    clean_email = normalize_email(email)
    whop_status = read_whop_subscription_status(db, user_id=clean_user_id, email=clean_email, settings=settings)
    unlocked_keys = read_unlocked_source_keys(db, email=clean_email)
    coupons_used = len(unlocked_keys)
    is_subscribed = whop_status["status"] == "active"
    coupons_remaining = max(0, FREE_REVIEW_COUPON_LIMIT - coupons_used)
    return SubscriberAccessState(
        user_id=clean_user_id,
        email=clean_email,
        subscription_status=whop_status["status"],
        is_subscribed=is_subscribed,
        coupon_limit=FREE_REVIEW_COUPON_LIMIT,
        coupons_used=coupons_used,
        coupons_remaining=coupons_remaining,
        unlocked_source_keys=unlocked_keys,
    )


def unlock_review_source(
    db: Session,
    *,
    user_id: str,
    email: str,
    source_key: str,
    source_type: str,
    trader_id: str | None,
    symbol: str | None,
    settings: Settings,
) -> ReviewUnlockResult:
    clean_user_id = normalize_user_id(user_id)
    clean_email = normalize_email(email)
    clean_source_key = normalize_source_key(source_key)
    clean_source_type = normalize_source_type(source_type)
    access = read_subscriber_access_state(db, user_id=clean_user_id, email=clean_email, settings=settings)
    if access.is_subscribed:
        return ReviewUnlockResult(
            access=access,
            source_key=clean_source_key,
            source_type=clean_source_type,
            unlocked=True,
            charged=False,
        )

    existing_record = read_review_unlock(db, email=clean_email, source_key=clean_source_key)
    if existing_record is not None:
        return ReviewUnlockResult(
            access=access,
            source_key=clean_source_key,
            source_type=clean_source_type,
            unlocked=True,
            charged=False,
        )

    if access.coupons_remaining <= 0:
        raise ValueError("review_coupon_limit_reached")

    db.add(
        ReviewUnlockRecord(
            user_id=clean_user_id,
            email=clean_email,
            source_key=clean_source_key,
            source_type=clean_source_type,
            symbol=normalize_optional_text(symbol),
            trader_id=normalize_optional_text(trader_id),
            status="used",
            payload_json="{}",
            raw_json=None,
            updated_at=utc_now(),
        )
    )
    db.flush()
    next_access = read_subscriber_access_state(db, user_id=clean_user_id, email=clean_email, settings=settings)
    return ReviewUnlockResult(
        access=next_access,
        source_key=clean_source_key,
        source_type=clean_source_type,
        unlocked=True,
        charged=True,
    )


def access_payload(access: SubscriberAccessState) -> dict[str, object]:
    return {
        "userId": access.user_id,
        "email": access.email,
        "subscriptionStatus": access.subscription_status,
        "isSubscribed": access.is_subscribed,
        "couponLimit": access.coupon_limit,
        "couponsUsed": access.coupons_used,
        "couponsRemaining": access.coupons_remaining,
        "unlockedSourceKeys": access.unlocked_source_keys,
    }


def unlock_payload(result: ReviewUnlockResult) -> dict[str, object]:
    return {
        "sourceKey": result.source_key,
        "sourceType": result.source_type,
        "unlocked": result.unlocked,
        "charged": result.charged,
        "access": access_payload(result.access),
    }


def read_unlocked_source_keys(db: Session, *, email: str) -> list[str]:
    rows = db.execute(
        select(ReviewUnlockRecord.source_key)
        .where(ReviewUnlockRecord.email == email)
        .order_by(desc(ReviewUnlockRecord.created_at), desc(ReviewUnlockRecord.id))
    ).all()
    return [row[0] for row in rows if isinstance(row[0], str)]


def count_review_unlocks(db: Session, *, email: str) -> int:
    value = db.execute(
        select(func.count(ReviewUnlockRecord.id)).where(ReviewUnlockRecord.email == email)
    ).scalar_one()
    return int(value)


def read_review_unlock(db: Session, *, email: str, source_key: str) -> ReviewUnlockRecord | None:
    return db.execute(
        select(ReviewUnlockRecord).where(
            ReviewUnlockRecord.email == email,
            ReviewUnlockRecord.source_key == source_key,
        )
    ).scalar_one_or_none()


def normalize_user_id(value: str) -> str:
    clean_value = value.strip()
    if not clean_value:
        raise ValueError("userId is required")
    return clean_value[:180]


def normalize_source_key(value: str) -> str:
    clean_value = value.strip()
    if not clean_value:
        raise ValueError("sourceKey is required")
    return clean_value[:520]


def normalize_source_type(value: str) -> str:
    clean_value = value.strip().lower()
    if clean_value not in {"scenario", "review", "trader_detail"}:
        raise ValueError("invalid sourceType")
    return clean_value


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    clean_value = value.strip()
    return clean_value or None
