from fastapi.testclient import TestClient

import pytest

from app.core.config import get_settings
from app.db import ReviewUnlockRecord, WhopCheckoutRecord, init_db, reset_db_engine, session_scope
from app.main import app
from app.subscriber_access import FREE_REVIEW_COUPON_LIMIT, unlock_review_source


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
