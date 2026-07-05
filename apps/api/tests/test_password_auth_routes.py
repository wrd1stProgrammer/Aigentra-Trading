from fastapi.testclient import TestClient
import pytest

from app.db import PasswordAccountRecord, init_db, reset_db_engine, session_scope
from app.main import app


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "password-auth.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_password_signup_requires_internal_token(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    client = TestClient(app)

    response = client.post(
        "/api/auth/password/signup",
        json={"name": "Operator", "email": "operator@example.com", "password": "correct-horse"},
    )

    assert response.status_code == 401


def test_password_signup_persists_hash_and_login_returns_account(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    client = TestClient(app)

    signup_response = client.post(
        "/api/auth/password/signup",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"name": "Operator", "email": "Operator@Example.com", "password": "correct-horse"},
    )
    login_response = client.post(
        "/api/auth/password/login",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"email": "operator@example.com", "password": "correct-horse"},
    )

    assert signup_response.status_code == 201
    assert login_response.status_code == 200
    assert login_response.json()["email"] == "operator@example.com"
    assert login_response.json()["userId"] == signup_response.json()["userId"]

    with session_scope() as db:
        record = db.query(PasswordAccountRecord).filter_by(email="operator@example.com").one()
        assert record.password_hash.startswith("pbkdf2_sha256$")
        assert record.password_hash != "correct-horse"
        assert record.last_login_at is not None


def test_password_signup_rejects_duplicate_email(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    client = TestClient(app)
    payload = {"name": "Operator", "email": "operator@example.com", "password": "correct-horse"}

    first_response = client.post("/api/auth/password/signup", headers={"X-Subscriber-Api-Token": "internal-token"}, json=payload)
    second_response = client.post("/api/auth/password/signup", headers={"X-Subscriber-Api-Token": "internal-token"}, json=payload)

    assert first_response.status_code == 201
    assert second_response.status_code == 409
    assert second_response.json()["detail"] == "password_account_exists"


def test_password_login_rejects_invalid_password(temp_db, monkeypatch):
    monkeypatch.setenv("SUBSCRIBER_API_TOKEN", "internal-token")
    client = TestClient(app)
    client.post(
        "/api/auth/password/signup",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"name": "Operator", "email": "operator@example.com", "password": "correct-horse"},
    )

    response = client.post(
        "/api/auth/password/login",
        headers={"X-Subscriber-Api-Token": "internal-token"},
        json={"email": "operator@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_credentials"
