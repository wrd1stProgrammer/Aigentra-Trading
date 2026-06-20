from __future__ import annotations

from typing import Final

from app.core.config import Settings


WHOP_PRODUCTION_MODE: Final = "production"
WHOP_SANDBOX_MODE: Final = "sandbox"
WHOP_MODES: Final = {WHOP_PRODUCTION_MODE, WHOP_SANDBOX_MODE}


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


def active_whop_plan_id(settings: Settings) -> str:
    return settings.whop_plan_id_sandbox.strip() if whop_sandbox_mode(settings) else settings.whop_plan_id.strip()


def active_whop_plan_key(settings: Settings) -> str:
    return settings.whop_plan_key.strip()


def whop_sandbox_enabled(settings: Settings) -> bool:
    return whop_sandbox_mode(settings) or "sandbox-api.whop.com" in active_whop_api_base_url(settings).lower()
