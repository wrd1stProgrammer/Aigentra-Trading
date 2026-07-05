from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import hmac
import secrets

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import PasswordAccountRecord, utc_now
from app.whop_payload import normalize_email


PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 310_000
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 200


@dataclass(frozen=True, slots=True)
class PasswordAccountView:
    user_id: str
    email: str
    name: str


class PasswordAccountError(ValueError):
    pass


class InvalidPasswordAccountInput(PasswordAccountError):
    pass


class PasswordAccountAlreadyExists(PasswordAccountError):
    pass


class InvalidPasswordAccountCredentials(PasswordAccountError):
    pass


def create_password_account(db: Session, *, name: str, email: str, password: str) -> PasswordAccountView:
    clean_email = normalized_account_email(email)
    clean_name = normalized_account_name(name, clean_email)
    clean_password = validated_password(password)

    if find_password_account(db, clean_email) is not None:
        raise PasswordAccountAlreadyExists("password_account_exists")

    record = PasswordAccountRecord(
        user_id=generate_password_user_id(),
        email=clean_email,
        name=clean_name,
        password_hash=hash_password(clean_password),
    )
    db.add(record)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise PasswordAccountAlreadyExists("password_account_exists") from exc
    return password_account_view(record)


def authenticate_password_account(db: Session, *, email: str, password: str) -> PasswordAccountView:
    clean_email = normalized_account_email(email)
    record = find_password_account(db, clean_email)
    if record is None or record.disabled_at is not None:
        raise InvalidPasswordAccountCredentials("invalid_credentials")
    if not verify_password(password, record.password_hash):
        raise InvalidPasswordAccountCredentials("invalid_credentials")

    now = utc_now()
    record.last_login_at = now
    record.updated_at = now
    db.flush()
    return password_account_view(record)


def find_password_account(db: Session, email: str) -> PasswordAccountRecord | None:
    return db.execute(select(PasswordAccountRecord).where(PasswordAccountRecord.email == email)).scalar_one_or_none()


def normalized_account_email(email: str) -> str:
    try:
        return normalize_email(email)
    except ValueError as exc:
        raise InvalidPasswordAccountInput("valid_email_required") from exc


def normalized_account_name(name: str, email: str) -> str:
    clean_name = " ".join(name.strip().split())
    if clean_name:
        return clean_name[:120]
    return email.split("@", 1)[0][:120] or "Aigentra User"


def validated_password(password: str) -> str:
    if not isinstance(password, str):
        raise InvalidPasswordAccountInput("password_required")
    if len(password) < PASSWORD_MIN_LENGTH:
        raise InvalidPasswordAccountInput("password_too_short")
    if len(password) > PASSWORD_MAX_LENGTH:
        raise InvalidPasswordAccountInput("password_too_long")
    return password


def generate_password_user_id() -> str:
    return f"credentials_{secrets.token_urlsafe(18)}"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS)
    return "$".join(
        [
            PASSWORD_HASH_ALGORITHM,
            str(PASSWORD_HASH_ITERATIONS),
            encode_base64_url(salt),
            encode_base64_url(digest),
        ]
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = password_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        iterations = int(iterations_text)
        salt = decode_base64_url(salt_text)
        expected_digest = decode_base64_url(digest_text)
    except (ValueError, TypeError):
        return False

    actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual_digest, expected_digest)


def encode_base64_url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def decode_base64_url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def password_account_view(record: PasswordAccountRecord) -> PasswordAccountView:
    return PasswordAccountView(user_id=record.user_id, email=record.email, name=record.name)
