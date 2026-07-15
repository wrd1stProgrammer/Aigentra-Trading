from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import TypedDict
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin_tables import time_payload
from app.db import PasswordAccountRecord, SiteDailyVisitorRecord, SubscriberPreferenceRecord, WhopCheckoutRecord, utc_now
from app.whop_status import ACTIVE_CHECKOUT_STATUSES


REPORT_TIME_ZONE = ZoneInfo("Asia/Seoul")
REPORT_TIME_ZONE_NAME = "Asia/Seoul"
REPORT_DAYS = 7


class DailyGrowthPayload(TypedDict):
    date: str
    uniqueVisitors: int
    signups: int
    paidConversions: int
    signupConversionRate: float


class GrowthMetricsPayload(TypedDict):
    timezone: str
    trackingStartedAt: str | None
    today: DailyGrowthPayload
    yesterday: DailyGrowthPayload
    series: list[DailyGrowthPayload]


def record_daily_visit(db: Session, visitor_key: str, user_key: str | None) -> None:
    now = utc_now()
    visit_date = now.astimezone(REPORT_TIME_ZONE).date()
    record = db.execute(
        select(SiteDailyVisitorRecord).where(
            SiteDailyVisitorRecord.visit_date == visit_date,
            SiteDailyVisitorRecord.visitor_key == visitor_key,
        )
    ).scalar_one_or_none()
    if record is None:
        db.add(SiteDailyVisitorRecord(visit_date=visit_date, visitor_key=visitor_key, user_key=user_key))
        return
    record.user_key = user_key or record.user_key
    record.visit_count += 1
    record.updated_at = now


def growth_metrics_payload(db: Session, now: datetime) -> GrowthMetricsPayload:
    today = now.astimezone(REPORT_TIME_ZONE).date()
    first_day = today - timedelta(days=REPORT_DAYS - 1)
    first_instant = datetime.combine(first_day, time.min, REPORT_TIME_ZONE).astimezone(timezone.utc)
    visitor_groups = daily_visitor_groups(db, first_day)
    signup_groups = daily_signup_groups(db, first_instant)
    conversion_groups = daily_conversion_groups(db, first_instant)
    series = [
        daily_metric_payload(
            day,
            len(visitor_groups.get(day, set())),
            len(signup_groups.get(day, set())),
            len(conversion_groups.get(day, set())),
        )
        for day in (first_day + timedelta(days=offset) for offset in range(REPORT_DAYS))
    ]
    tracking_started_at = db.execute(select(func.min(SiteDailyVisitorRecord.created_at))).scalar_one()
    return {
        "timezone": REPORT_TIME_ZONE_NAME,
        "trackingStartedAt": time_payload(tracking_started_at),
        "today": series[-1],
        "yesterday": series[-2],
        "series": series,
    }


def daily_visitor_groups(db: Session, first_day: date) -> dict[date, set[str]]:
    rows = db.execute(
        select(SiteDailyVisitorRecord.visit_date, SiteDailyVisitorRecord.visitor_key, SiteDailyVisitorRecord.user_key)
        .where(SiteDailyVisitorRecord.visit_date >= first_day)
    ).all()
    groups: dict[date, set[str]] = {}
    for visit_date, visitor_key, user_key in rows:
        groups.setdefault(visit_date, set()).add(user_key or visitor_key)
    return groups


def daily_signup_groups(db: Session, first_instant: datetime) -> dict[date, set[str]]:
    groups: dict[date, set[str]] = {}
    for model in (PasswordAccountRecord, SubscriberPreferenceRecord):
        rows = db.execute(select(model.email, model.created_at).where(model.created_at >= first_instant)).all()
        for email, timestamp in rows:
            groups.setdefault(reporting_date(timestamp), set()).add(email.strip().lower())
    return groups


def daily_conversion_groups(db: Session, first_instant: datetime) -> dict[date, set[str]]:
    rows = db.execute(
        select(WhopCheckoutRecord.email, WhopCheckoutRecord.updated_at).where(
            WhopCheckoutRecord.updated_at >= first_instant,
            WhopCheckoutRecord.status.in_(ACTIVE_CHECKOUT_STATUSES),
        )
    ).all()
    groups: dict[date, set[str]] = {}
    for email, timestamp in rows:
        groups.setdefault(reporting_date(timestamp), set()).add(email.strip().lower())
    return groups


def reporting_date(timestamp: datetime) -> date:
    utc_timestamp = timestamp if timestamp.tzinfo is not None else timestamp.replace(tzinfo=timezone.utc)
    return utc_timestamp.astimezone(REPORT_TIME_ZONE).date()


def daily_metric_payload(day: date, visitors: int, signups: int, paid_conversions: int) -> DailyGrowthPayload:
    conversion_rate = round((paid_conversions / signups) * 100, 1) if signups else 0.0
    return {
        "date": day.isoformat(),
        "uniqueVisitors": visitors,
        "signups": signups,
        "paidConversions": paid_conversions,
        "signupConversionRate": conversion_rate,
    }
