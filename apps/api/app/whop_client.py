from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import Settings
from app.whop_settings import (
    active_whop_api_base_url,
    active_whop_api_key,
    active_whop_company_id,
    active_whop_plan_id,
)


class WhopCheckoutAPIError(RuntimeError):
    def __init__(self, message: str, *, public_detail: str = "whop_checkout_failed") -> None:
        super().__init__(message)
        self.public_detail = public_detail


class WhopMembershipAPIError(RuntimeError):
    def __init__(self, message: str, *, public_detail: str = "whop_membership_update_failed") -> None:
        super().__init__(message)
        self.public_detail = public_detail


def create_checkout_configuration(
    *,
    settings: Settings,
    metadata: dict[str, str],
    redirect_url: str,
    source_url: str,
    plan_key: str = "",
) -> dict[str, Any]:
    body = whop_checkout_configuration_payload(
        settings=settings,
        metadata=metadata,
        redirect_url=redirect_url,
        source_url=source_url,
        plan_key=plan_key,
    )

    try:
        with httpx.Client(timeout=_timeout(settings), follow_redirects=True) as client:
            response = client.post(_endpoint(settings), headers=_headers(settings), json=body)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        public_detail = whop_rejection_detail(exc.response)
        raise WhopCheckoutAPIError(
            f"Whop checkout API rejected the request: {status_code}",
            public_detail=public_detail,
        ) from exc
    except httpx.RequestError as exc:
        raise WhopCheckoutAPIError("Whop checkout API request failed") from exc
    except ValueError as exc:
        raise WhopCheckoutAPIError("Whop checkout API returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise WhopCheckoutAPIError("Whop checkout API returned an invalid payload")
    return payload


def cancel_membership_at_period_end(*, settings: Settings, membership_id: str) -> dict[str, Any]:
    clean_membership_id = membership_id.strip()
    if not clean_membership_id:
        raise ValueError("membership id required")

    endpoint = active_whop_api_base_url(settings).rstrip("/") + f"/memberships/{clean_membership_id}/cancel"
    try:
        with httpx.Client(timeout=_timeout(settings), follow_redirects=True) as client:
            response = client.post(
                endpoint,
                headers=_headers(settings),
                json={"cancellation_mode": "at_period_end"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        raise WhopMembershipAPIError(
            f"Whop membership API rejected the request: {exc.response.status_code}",
            public_detail=whop_rejection_detail(exc.response).replace("whop_checkout", "whop_membership", 1),
        ) from exc
    except httpx.RequestError as exc:
        raise WhopMembershipAPIError("Whop membership API request failed") from exc
    except ValueError as exc:
        raise WhopMembershipAPIError("Whop membership API returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise WhopMembershipAPIError("Whop membership API returned an invalid payload")
    return payload


def whop_checkout_configuration_payload(
    *,
    settings: Settings,
    metadata: dict[str, str],
    redirect_url: str,
    source_url: str,
    plan_key: str = "",
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "mode": "payment",
        "metadata": metadata,
        "allow_promo_codes": True,
    }
    plan_id = active_whop_plan_id(settings, plan_key)
    if plan_id:
        body["plan_id"] = plan_id
    else:
        body["plan"] = whop_plan_payload(settings)
    if redirect_url:
        body["redirect_url"] = redirect_url
    if source_url:
        body["source_url"] = source_url
    return body


def whop_plan_payload(settings: Settings) -> dict[str, Any]:
    plan: dict[str, Any] = {
        "company_id": active_whop_company_id(settings),
        "initial_price": settings.whop_plan_initial_price,
        "plan_type": settings.whop_plan_type.strip().lower(),
        "currency": settings.whop_plan_currency.strip().lower(),
    }
    title = settings.whop_plan_title.strip()
    if title:
        plan["title"] = title
    if plan["plan_type"] == "renewal":
        plan["renewal_price"] = settings.whop_plan_renewal_price
        plan["billing_period"] = settings.whop_plan_billing_period_days
    return plan


def _endpoint(settings: Settings) -> str:
    return active_whop_api_base_url(settings).rstrip("/") + "/checkout_configurations"


def _headers(settings: Settings) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {active_whop_api_key(settings)}",
        "Content-Type": "application/json",
    }
    version_date = settings.whop_api_version_date.strip()
    if version_date:
        headers["Api-Version-Date"] = version_date
    return headers


def _timeout(settings: Settings) -> httpx.Timeout:
    read_timeout = max(1.0, settings.whop_checkout_timeout_seconds)
    return httpx.Timeout(read=read_timeout, connect=5.0, write=5.0, pool=5.0)


def whop_rejection_detail(response: httpx.Response) -> str:
    status_code = response.status_code
    message = response_error_message(response)
    if not message:
        return f"whop_checkout_rejected_{status_code}"
    return f"whop_checkout_rejected_{status_code}: {sanitize_error_message(message)}"


def response_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text
    if not isinstance(payload, dict):
        return str(payload)
    error = payload.get("error")
    if isinstance(error, dict):
        for key in ("message", "detail", "type"):
            value = error.get(key)
            if isinstance(value, str) and value.strip():
                return value
    for key in ("message", "detail", "error"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return str(payload)


def sanitize_error_message(message: str) -> str:
    compact = re.sub(r"\s+", " ", message).strip()
    compact = re.sub(r"(?i)(bearer\s+)[a-z0-9._\-]+", r"\1<redacted>", compact)
    compact = re.sub(r"(?i)(api[_-]?key[\"':=\s]+)[a-z0-9._\-]+", r"\1<redacted>", compact)
    return compact[:240]
