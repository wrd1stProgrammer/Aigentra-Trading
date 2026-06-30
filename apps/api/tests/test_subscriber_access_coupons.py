from fastapi.testclient import TestClient

import pytest
from sqlalchemy import event

import app.db as db_module
import app.subscriber_access as subscriber_access
from app.core.config import get_settings
from app.db import ReviewUnlockRecord, WhopCheckoutRecord, init_db, reset_db_engine, session_scope
from app.main import app
from app.subscriber_access import FREE_REVIEW_COUPON_LIMIT, unlock_review_source
from app.whop_status import read_whop_subscription_status


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "subscriber-access.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_free_user_can_unlock_three_review_sources_without_duplicate_charges(temp_db):
    with session_scope() as db:
        first = unlock_review_source(
            db,
            user_id="google-1",
            email="Operator@Example.com",
            source_key="scenario:range-maker:BTCUSDT:review-1",
            source_type="scenario",
            trader_id="range-maker",
            symbol="BTCUSDT",
            settings=get_settings(),
        )
        duplicate = unlock_review_source(
            db,
            user_id="google-1",
            email="operator@example.com",
            source_key="scenario:range-maker:BTCUSDT:review-1",
            source_type="scenario",
            trader_id="range-maker",
            symbol="BTCUSDT",
            settings=get_settings(),
        )
        for index in range(2, FREE_REVIEW_COUPON_LIMIT + 1):
            unlock_review_source(
                db,
                user_id="google-1",
                email="operator@example.com",
                source_key=f"scenario:range-maker:BTCUSDT:review-{index}",
                source_type="scenario",
                trader_id="range-maker",
                symbol="BTCUSDT",
                settings=get_settings(),
            )
        db.commit()

        assert first.charged is True
        assert duplicate.charged is False
        assert duplicate.access.coupons_used == 1
        assert db.query(ReviewUnlockRecord).filter_by(email="operator@example.com").count() == FREE_REVIEW_COUPON_LIMIT


def test_free_user_fourth_unlock_is_rejected(temp_db):
    with session_scope() as db:
        for index in range(1, FREE_REVIEW_COUPON_LIMIT + 1):
            unlock_review_source(
                db,
                user_id="google-1",
                email="operator@example.com",
                source_key=f"scenario:range-maker:BTCUSDT:review-{index}",
                source_type="scenario",
                trader_id="range-maker",
                symbol="BTCUSDT",
                settings=get_settings(),
            )

        with pytest.raises(ValueError, match="review_coupon_limit_reached"):
            unlock_review_source(
                db,
                user_id="google-1",
                email="operator@example.com",
                source_key="scenario:range-maker:BTCUSDT:review-4",
                source_type="scenario",
                trader_id="range-maker",
                symbol="BTCUSDT",
                settings=get_settings(),
            )


def test_active_whop_subscriber_is_not_charged_for_review_unlocks(temp_db):
    with session_scope() as db:
        db.add(
            WhopCheckoutRecord(
                checkout_id="ch_active",
                internal_order_id="atl_active",
                user_id="google-1",
                email="operator@example.com",
                plan_key="aigentra_pro_monthly",
                status="payment_succeeded",
                purchase_url="https://whop.com/checkout/ch_active",
            )
        )
        db.flush()
        result = unlock_review_source(
            db,
            user_id="google-1",
            email="operator@example.com",
            source_key="scenario:range-maker:BTCUSDT:review-1",
            source_type="scenario",
            trader_id="range-maker",
            symbol="BTCUSDT",
            settings=get_settings(),
        )
        db.commit()

        assert result.access.is_subscribed is True
        assert result.charged is False
        assert db.query(ReviewUnlockRecord).filter_by(email="operator@example.com").count() == 0


def test_subscriber_access_api_requires_token_and_reports_remaining_coupons(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    get_settings.cache_clear()
    client = TestClient(app)

    unauthorized = client.get("/api/subscribers/access?userId=google-1&email=operator@example.com")
    authorized = client.get(
        "/api/subscribers/access?userId=google-1&email=operator@example.com",
        headers={"X-Subscriber-Api-Token": "internal-token"},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
    assert authorized.json()["couponsRemaining"] == FREE_REVIEW_COUPON_LIMIT
    assert authorized.json()["isSubscribed"] is False


def test_subscriber_access_reuses_unlocked_keys_for_coupon_count(temp_db, monkeypatch):
    def fake_whop_status(*args, **kwargs):
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
            "sandbox": True,
        }

    def fail_count_query(*args, **kwargs):
        raise AssertionError("subscriber access should not issue a second unlock count query")

    monkeypatch.setattr(subscriber_access, "read_whop_subscription_status", fake_whop_status)
    monkeypatch.setattr(subscriber_access, "count_review_unlocks", fail_count_query)
    with session_scope() as db:
        db.add_all(
            [
                ReviewUnlockRecord(
                    user_id="google-1",
                    email="operator@example.com",
                    source_key="scenario:range-maker:BTCUSDT:review-1",
                    source_type="scenario",
                    status="used",
                ),
                ReviewUnlockRecord(
                    user_id="google-1",
                    email="operator@example.com",
                    source_key="scenario:range-maker:BTCUSDT:review-2",
                    source_type="scenario",
                    status="used",
                ),
            ]
        )
        db.flush()

        state = subscriber_access.read_subscriber_access_state(
            db,
            user_id="google-1",
            email="operator@example.com",
            settings=get_settings(),
        )

    assert state.coupons_used == 2
    assert state.coupons_remaining == FREE_REVIEW_COUPON_LIMIT - 2


def test_whop_subscription_status_bounds_checkout_selects(temp_db):
    with session_scope() as db:
        db.add(
            WhopCheckoutRecord(
                checkout_id="ch_active",
                internal_order_id="atl_active",
                user_id="google-1",
                email="operator@example.com",
                plan_key="aigentra_pro_monthly",
                status="payment_succeeded",
                purchase_url="https://whop.com/checkout/ch_active",
            )
        )
        db.commit()

    checkout_selects: list[str] = []

    def capture_sql(_conn, _cursor, statement, _parameters, _context, _executemany):
        lowered = statement.lower()
        if lowered.lstrip().startswith("select") and "whop_checkouts" in lowered:
            checkout_selects.append(statement)

    event.listen(db_module.engine, "before_cursor_execute", capture_sql)
    try:
        with session_scope() as db:
            payload = read_whop_subscription_status(
                db,
                user_id="google-1",
                email="operator@example.com",
                settings=get_settings(),
            )
    finally:
        event.remove(db_module.engine, "before_cursor_execute", capture_sql)

    assert payload["status"] == "active"
    assert len(checkout_selects) == 4
    assert all("limit" in statement.lower() for statement in checkout_selects)
    assert all(" or " not in statement.lower() for statement in checkout_selects)
