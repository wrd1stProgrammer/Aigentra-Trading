import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db import WhopCheckoutRecord, WhopWebhookEventRecord, init_db, reset_db_engine, session_scope
from app.main import app
from app.whop_client import whop_checkout_configuration_payload
from app.whop_service import validate_checkout_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "whop-billing.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_whop_tables_are_registered(temp_db):
    with session_scope() as db:
        assert db.query(WhopCheckoutRecord).count() == 0
        assert db.query(WhopWebhookEventRecord).count() == 0


def test_whop_checkout_requires_internal_token_and_configuration(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    get_settings.cache_clear()
    client = TestClient(app)

    unauthorized = client.post(
        "/api/billing/whop/checkout",
        json={"userId": "google-1", "email": "operator@example.com"},
    )
    unavailable = client.post(
        "/api/billing/whop/checkout",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"userId": "google-1", "email": "operator@example.com"},
    )

    assert unauthorized.status_code == 401
    assert unavailable.status_code == 503
    assert unavailable.json()["detail"] == "whop_not_configured"


def test_whop_checkout_creates_record_with_safe_metadata(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    monkeypatch.setenv("WHOP_API_KEY", "whop-api-key")
    monkeypatch.setenv("WHOP_COMPANY_ID", "biz_test")
    monkeypatch.setenv("WHOP_PLAN_INITIAL_PRICE", "29")
    monkeypatch.setenv("WHOP_PLAN_RENEWAL_PRICE", "29")
    monkeypatch.setenv("WHOP_API_BASE_URL", "https://sandbox-api.whop.com/api/v1")
    get_settings.cache_clear()
    captured = {}

    def fake_create_checkout_configuration(*, settings, metadata, redirect_url, source_url):
        captured["metadata"] = metadata
        captured["redirect_url"] = redirect_url
        captured["source_url"] = source_url
        captured["base_url"] = settings.whop_api_base_url
        return {
            "id": "ch_test_123",
            "purchase_url": "/checkout/plan_test?session=ch_test_123",
            "plan": {"id": "plan_test"},
            "metadata": metadata,
        }

    monkeypatch.setattr("app.whop_service.create_checkout_configuration", fake_create_checkout_configuration)
    client = TestClient(app)

    response = client.post(
        "/api/billing/whop/checkout",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={
            "userId": "google-1",
            "email": "Operator@Example.com",
            "locale": "ko",
            "redirectUrl": "https://app.example.com/account?billing=whop-return",
            "sourceUrl": "https://app.example.com/account",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "checkoutId": "ch_test_123",
        "planId": "plan_test",
        "purchaseUrl": "https://sandbox.whop.com/checkout/plan_test?session=ch_test_123",
        "sandbox": True,
    }
    assert captured["base_url"] == "https://sandbox-api.whop.com/api/v1"
    assert captured["metadata"]["user_id"] == "google-1"
    assert captured["metadata"]["email"] == "operator@example.com"
    assert captured["metadata"]["locale"] == "ko"
    assert captured["metadata"]["plan_key"] == "aigentra_pro_monthly"
    assert captured["metadata"]["order_id"].startswith("atl_")

    with session_scope() as db:
        record = db.query(WhopCheckoutRecord).filter_by(checkout_id="ch_test_123").one()
        assert record.email == "operator@example.com"
        assert record.user_id == "google-1"
        assert record.plan_key == "aigentra_pro_monthly"
        assert record.status == "created"
        assert record.whop_plan_id == "plan_test"
        assert record.purchase_url == "https://sandbox.whop.com/checkout/plan_test?session=ch_test_123"
        assert record.internal_order_id == captured["metadata"]["order_id"]


def test_whop_checkout_uses_existing_plan_id_without_dynamic_plan_prices(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    monkeypatch.setenv("WHOP_API_KEY", "whop-api-key")
    monkeypatch.setenv("WHOP_COMPANY_ID", "biz_test")
    monkeypatch.setenv("WHOP_PLAN_ID", "plan_existing_123")
    monkeypatch.setenv("WHOP_API_BASE_URL", "https://sandbox-api.whop.com/api/v1")
    monkeypatch.delenv("WHOP_PLAN_INITIAL_PRICE", raising=False)
    monkeypatch.delenv("WHOP_PLAN_RENEWAL_PRICE", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    validate_checkout_settings(settings)
    request_body = whop_checkout_configuration_payload(
        settings=settings,
        metadata={"order_id": "atl_existing_plan", "user_id": "google-1"},
        redirect_url="https://app.example.com/account?billing=whop-return",
        source_url="https://app.example.com/account",
    )

    assert request_body["company_id"] == "biz_test"
    assert request_body["plan_id"] == "plan_existing_123"
    assert "plan" not in request_body

    def fake_create_checkout_configuration(*, settings, metadata, redirect_url, source_url):
        return {
            "id": "ch_existing_plan",
            "purchase_url": "/checkout/plan_existing_123?session=ch_existing_plan",
            "metadata": metadata,
        }

    monkeypatch.setattr("app.whop_service.create_checkout_configuration", fake_create_checkout_configuration)
    client = TestClient(app)

    response = client.post(
        "/api/billing/whop/checkout",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={
            "userId": "google-1",
            "email": "operator@example.com",
            "redirectUrl": "https://app.example.com/account?billing=whop-return",
            "sourceUrl": "https://app.example.com/account",
        },
    )

    assert response.status_code == 200
    assert response.json()["planId"] == "plan_existing_123"
    with session_scope() as db:
        record = db.query(WhopCheckoutRecord).filter_by(checkout_id="ch_existing_plan").one()
        assert record.whop_plan_id == "plan_existing_123"


def test_whop_webhook_rejects_invalid_signature(temp_db, monkeypatch):
    monkeypatch.setenv("WHOP_WEBHOOK_SECRET", whsec(b"test-webhook-secret"))
    get_settings.cache_clear()
    client = TestClient(app)
    body = json.dumps({"type": "payment.succeeded", "data": {}})

    response = client.post(
        "/api/billing/whop/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "webhook-id": "msg_bad",
            "webhook-timestamp": str(int(time.time())),
            "webhook-signature": "v1,invalid",
        },
    )

    assert response.status_code == 401


def test_whop_signed_webhook_updates_checkout_once(temp_db, monkeypatch):
    secret = whsec(b"test-webhook-secret")
    monkeypatch.setenv("WHOP_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()
    order_id = "atl_existing_order"
    with session_scope() as db:
        db.add(
            WhopCheckoutRecord(
                checkout_id="ch_existing",
                user_id="google-1",
                email="operator@example.com",
                plan_key="aigentra_pro_monthly",
                internal_order_id=order_id,
                status="created",
                purchase_url="https://sandbox.whop.com/checkout/plan_test?session=ch_existing",
            )
        )

    event = {
        "id": "evt_payment_1",
        "type": "payment.succeeded",
        "api_version": "v1",
        "data": {
            "id": "pay_test_1",
            "status": "succeeded",
            "currency": "usd",
            "amount_after_fees": 28.17,
            "member": {"id": "mem_test_1"},
            "metadata": {"order_id": order_id, "email": "operator@example.com"},
        },
    }
    body = json.dumps(event, separators=(",", ":"))
    headers = signed_headers(secret, "msg_payment_1", body)
    client = TestClient(app)

    first = client.post("/api/billing/whop/webhook", content=body, headers=headers)
    second = client.post("/api/billing/whop/webhook", content=body, headers=headers)

    assert first.status_code == 200
    assert first.json() == {"ok": True, "duplicate": False}
    assert second.status_code == 200
    assert second.json() == {"ok": True, "duplicate": True}

    with session_scope() as db:
        assert db.query(WhopWebhookEventRecord).filter_by(webhook_id="msg_payment_1").count() == 1
        checkout = db.query(WhopCheckoutRecord).filter_by(internal_order_id=order_id).one()
        assert checkout.status == "payment_succeeded"
        assert checkout.whop_payment_id == "pay_test_1"
        assert checkout.whop_membership_id == "mem_test_1"
        assert checkout.currency == "usd"
        assert checkout.amount == 28.17


@pytest.mark.parametrize(
    ("event_type", "data", "expected_status", "expected_payment_id", "expected_membership_id"),
    [
        (
            "payment_succeeded",
            {
                "id": "pay_dashboard_1",
                "status": "succeeded",
                "currency": "usd",
                "amount_after_fees": 28.17,
                "member": {"id": "mem_dashboard_1"},
            },
            "payment_succeeded",
            "pay_dashboard_1",
            "mem_dashboard_1",
        ),
        (
            "membership_activated",
            {
                "object": "membership",
                "id": "mem_dashboard_2",
                "currency": "usd",
            },
            "membership_active",
            None,
            "mem_dashboard_2",
        ),
    ],
)
def test_whop_webhook_accepts_dashboard_event_names(
    temp_db,
    monkeypatch,
    event_type,
    data,
    expected_status,
    expected_payment_id,
    expected_membership_id,
):
    secret = whsec(b"test-webhook-secret")
    monkeypatch.setenv("WHOP_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()
    order_id = "atl_dashboard_order"
    data["metadata"] = {"order_id": order_id, "email": "operator@example.com"}
    with session_scope() as db:
        db.add(
            WhopCheckoutRecord(
                checkout_id="ch_dashboard",
                user_id="google-1",
                email="operator@example.com",
                plan_key="aigentra_pro_monthly",
                internal_order_id=order_id,
                status="created",
                purchase_url="https://sandbox.whop.com/checkout/plan_test?session=ch_dashboard",
            )
        )

    event = {"id": f"evt_{event_type}", "type": event_type, "api_version": "v1", "data": data}
    body = json.dumps(event, separators=(",", ":"))
    headers = signed_headers(secret, f"msg_{event_type}", body)
    client = TestClient(app)

    response = client.post("/api/billing/whop/webhook", content=body, headers=headers)

    assert response.status_code == 200
    assert response.json() == {"ok": True, "duplicate": False}
    with session_scope() as db:
        checkout = db.query(WhopCheckoutRecord).filter_by(internal_order_id=order_id).one()
        assert checkout.status == expected_status
        assert checkout.whop_payment_id == expected_payment_id
        assert checkout.whop_membership_id == expected_membership_id


def whsec(raw: bytes) -> str:
    return "whsec_" + base64.b64encode(raw).decode("ascii")


def signed_headers(secret: str, message_id: str, body: str) -> dict[str, str]:
    timestamp = str(int(time.time()))
    key = base64.b64decode(secret.removeprefix("whsec_"))
    signature_payload = f"{message_id}.{timestamp}.{body}".encode("utf-8")
    signature = base64.b64encode(hmac.new(key, signature_payload, hashlib.sha256).digest()).decode("ascii")
    return {
        "content-type": "application/json",
        "webhook-id": message_id,
        "webhook-timestamp": timestamp,
        "webhook-signature": f"v1,{signature}",
    }
