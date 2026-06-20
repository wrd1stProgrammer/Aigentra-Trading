from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import time
from collections.abc import Mapping


MAX_WEBHOOK_TIMESTAMP_SKEW_SECONDS = 300


class WhopWebhookVerificationError(ValueError):
    pass


def verify_whop_webhook_signature(
    *,
    body: str,
    headers: Mapping[str, str],
    secret: str,
    now_seconds: int | None = None,
) -> str:
    header_map = {key.lower(): value for key, value in headers.items()}
    webhook_id = header_map.get("webhook-id", "").strip()
    timestamp = header_map.get("webhook-timestamp", "").strip()
    signature_header = header_map.get("webhook-signature", "").strip()
    if not webhook_id or not timestamp or not signature_header:
        raise WhopWebhookVerificationError("missing Whop webhook signature headers")
    if "." in webhook_id or "." in timestamp:
        raise WhopWebhookVerificationError("invalid Whop webhook signature metadata")

    signed_at = _parse_timestamp(timestamp)
    current_time = int(now_seconds if now_seconds is not None else time.time())
    if abs(current_time - signed_at) > MAX_WEBHOOK_TIMESTAMP_SKEW_SECONDS:
        raise WhopWebhookVerificationError("stale Whop webhook signature")

    key = _decode_secret(secret)
    signed_content = f"{webhook_id}.{timestamp}.{body}".encode("utf-8")
    expected = base64.b64encode(hmac.new(key, signed_content, hashlib.sha256).digest()).decode("ascii")
    if not any(_signature_matches(candidate, expected) for candidate in signature_header.split()):
        raise WhopWebhookVerificationError("invalid Whop webhook signature")
    return webhook_id


def _parse_timestamp(value: str) -> int:
    try:
        return int(value)
    except ValueError as exc:
        raise WhopWebhookVerificationError("invalid Whop webhook timestamp") from exc


def _signature_matches(candidate: str, expected: str) -> bool:
    if "," not in candidate:
        return False
    version, signature = candidate.split(",", 1)
    return version == "v1" and hmac.compare_digest(signature, expected)


def _decode_secret(secret: str) -> bytes:
    clean_secret = secret.strip()
    if not clean_secret:
        raise WhopWebhookVerificationError("missing Whop webhook secret")
    if clean_secret.startswith("whsec_"):
        encoded_secret = clean_secret.removeprefix("whsec_")
        try:
            return base64.b64decode(_base64_padded(encoded_secret), validate=True)
        except binascii.Error as exc:
            raise WhopWebhookVerificationError("invalid Whop webhook secret") from exc
    try:
        return base64.b64decode(_base64_padded(clean_secret), validate=True)
    except binascii.Error:
        return clean_secret.encode("utf-8")


def _base64_padded(value: str) -> str:
    return value + ("=" * (-len(value) % 4))
