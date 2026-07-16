from __future__ import annotations

import json
from typing import Any, Final


class WhopWebhookPayloadError(ValueError):
    pass


DASHBOARD_EVENT_TYPE_ALIASES: Final = {
    "payment_succeeded": "payment.succeeded",
    "payment_failed": "payment.failed",
    "membership_activated": "membership.activated",
    "membership_went_valid": "membership.went_valid",
    "membership_deactivated": "membership.deactivated",
    "refund_created": "refund.created",
    "dispute_created": "dispute.created",
}


def parse_event(body: str) -> dict[str, Any]:
    try:
        event = json.loads(body)
    except json.JSONDecodeError as exc:
        raise WhopWebhookPayloadError("invalid Whop webhook JSON") from exc
    if not isinstance(event, dict):
        raise WhopWebhookPayloadError("invalid Whop webhook payload")
    return event


def event_data(event: dict[str, Any]) -> dict[str, Any]:
    data = event.get("data")
    return data if isinstance(data, dict) else {}


def metadata_from_data(data: dict[str, Any]) -> dict[str, Any]:
    metadata = data.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def checkout_id_from_data(data: dict[str, Any]) -> str:
    checkout = data.get("checkout")
    if isinstance(checkout, dict):
        checkout_id = read_string(checkout, "id")
        if checkout_id:
            return checkout_id
    return read_string(data, "checkout_configuration_id") or read_string(data, "checkout_id")


def membership_id_from_data(data: dict[str, Any]) -> str:
    if read_string(data, "object") == "membership":
        return read_string(data, "id")
    if read_string(data, "id").startswith("mem_"):
        return read_string(data, "id")
    membership = data.get("membership")
    if isinstance(membership, dict):
        membership_id = read_string(membership, "id")
        if membership_id:
            return membership_id
    direct_membership_id = read_string(data, "membership_id")
    if direct_membership_id:
        return direct_membership_id
    member = data.get("member")
    if isinstance(member, dict):
        member_id = read_string(member, "id")
        if member_id:
            return member_id
    return ""


def payment_id_from_event(event_type: str, data: dict[str, Any]) -> str:
    if canonical_event_type(event_type).startswith("payment."):
        return read_string(data, "id")
    return read_string(data, "payment_id")


def canonical_event_type(event_type: str) -> str:
    clean_event_type = event_type.strip()
    return DASHBOARD_EVENT_TYPE_ALIASES.get(clean_event_type, clean_event_type)


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized:
        raise ValueError("valid email required")
    return normalized


def read_string(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    return value.strip() if isinstance(value, str) else ""


def read_nested_string(payload: dict[str, Any], object_key: str, key: str) -> str:
    nested = payload.get(object_key)
    return read_string(nested, key) if isinstance(nested, dict) else ""


def read_number(payload: dict[str, Any], key: str) -> float | None:
    value = payload.get(key)
    if isinstance(value, (int, float)):
        return float(value)
    return None


def dumps_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
