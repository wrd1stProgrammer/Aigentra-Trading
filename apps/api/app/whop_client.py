from __future__ import annotations

from typing import Any

import httpx

from app.core.config import Settings


class WhopCheckoutAPIError(RuntimeError):
    pass


def create_checkout_configuration(
    *,
    settings: Settings,
    metadata: dict[str, str],
    redirect_url: str,
    source_url: str,
) -> dict[str, Any]:
    body = whop_checkout_configuration_payload(
        settings=settings,
        metadata=metadata,
        redirect_url=redirect_url,
        source_url=source_url,
    )

    try:
        with httpx.Client(timeout=_timeout(settings), follow_redirects=True) as client:
            response = client.post(_endpoint(settings), headers=_headers(settings), json=body)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        raise WhopCheckoutAPIError(f"Whop checkout API rejected the request: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        raise WhopCheckoutAPIError("Whop checkout API request failed") from exc
    except ValueError as exc:
        raise WhopCheckoutAPIError("Whop checkout API returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise WhopCheckoutAPIError("Whop checkout API returned an invalid payload")
    return payload


def whop_checkout_configuration_payload(
    *,
    settings: Settings,
    metadata: dict[str, str],
    redirect_url: str,
    source_url: str,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "mode": "payment",
        "metadata": metadata,
        "allow_promo_codes": True,
    }
    plan_id = settings.whop_plan_id.strip()
    if plan_id:
        body["company_id"] = settings.whop_company_id.strip()
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
        "company_id": settings.whop_company_id.strip(),
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


def whop_sandbox_enabled(settings: Settings) -> bool:
    return "sandbox-api.whop.com" in settings.whop_api_base_url.strip().lower()


def _endpoint(settings: Settings) -> str:
    return settings.whop_api_base_url.rstrip("/") + "/checkout_configurations"


def _headers(settings: Settings) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {settings.whop_api_key.strip()}",
        "Content-Type": "application/json",
    }
    version_date = settings.whop_api_version_date.strip()
    if version_date:
        headers["Api-Version-Date"] = version_date
    return headers


def _timeout(settings: Settings) -> httpx.Timeout:
    read_timeout = max(1.0, settings.whop_checkout_timeout_seconds)
    return httpx.Timeout(read=read_timeout, connect=5.0, write=5.0, pool=5.0)
