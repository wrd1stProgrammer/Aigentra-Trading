from __future__ import annotations

from typing import Final

from app.core.config import Settings


WHOP_PRODUCTION_MODE: Final = "production"
WHOP_SANDBOX_MODE: Final = "sandbox"
WHOP_MODES: Final = {WHOP_PRODUCTION_MODE, WHOP_SANDBOX_MODE}
WHOP_PRO_MONTHLY_PLAN_KEY: Final = "aigentra_pro_monthly"
WHOP_PRO_ANNUAL_PLAN_KEY: Final = "aigentra_pro_annual"
WHOP_PRO_PLAN_KEYS: Final = {WHOP_PRO_MONTHLY_PLAN_KEY, WHOP_PRO_ANNUAL_PLAN_KEY}


def whop_mode(settings: Settings) -> str:
    return settings.whop_mode.strip().lower()


def whop_sandbox_mode(settings: Settings) -> bool:
    return whop_mode(settings) == WHOP_SANDBOX_MODE


def active_whop_api_key(settings: Settings) -> str:
    return settings.whop_api_key_sandbox.strip() if whop_sandbox_mode(settings) else settings.whop_api_key.strip()


def active_whop_company_id(settings: Settings) -> str:
    return settings.whop_company_id_sandbox.strip() if whop_sandbox_mode(settings) else settings.whop_company_id.strip()


def active_whop_webhook_secret(settings: Settings) -> str:
    if whop_sandbox_mode(settings):
        return settings.whop_webhook_secret_sandbox.strip()
    return settings.whop_webhook_secret.strip()


def active_whop_api_base_url(settings: Settings) -> str:
    if whop_sandbox_mode(settings):
        return settings.whop_api_base_url_sandbox.strip()
    return settings.whop_api_base_url.strip()


def active_whop_plan_id(settings: Settings, plan_key: str = "") -> str:
    selected_plan_key = active_whop_plan_key(settings, plan_key)
    if selected_plan_key == WHOP_PRO_ANNUAL_PLAN_KEY:
        return (
            settings.whop_pro_annual_plan_id_sandbox.strip()
            if whop_sandbox_mode(settings)
            else settings.whop_pro_annual_plan_id.strip()
        )
    if selected_plan_key == WHOP_PRO_MONTHLY_PLAN_KEY:
        monthly_plan_id = (
            settings.whop_pro_monthly_plan_id_sandbox.strip()
            if whop_sandbox_mode(settings)
            else settings.whop_pro_monthly_plan_id.strip()
        )
        if monthly_plan_id:
            return monthly_plan_id
    return settings.whop_plan_id_sandbox.strip() if whop_sandbox_mode(settings) else settings.whop_plan_id.strip()


def active_whop_plan_key(settings: Settings, plan_key: str = "") -> str:
    configured_plan_key = settings.whop_plan_key.strip() or WHOP_PRO_MONTHLY_PLAN_KEY
    selected_plan_key = plan_key.strip() or configured_plan_key
    if selected_plan_key in WHOP_PRO_PLAN_KEYS or selected_plan_key == configured_plan_key:
        return selected_plan_key
    raise ValueError("unsupported_whop_plan_key")


def whop_sandbox_enabled(settings: Settings) -> bool:
    return whop_sandbox_mode(settings) or "sandbox-api.whop.com" in active_whop_api_base_url(settings).lower()
