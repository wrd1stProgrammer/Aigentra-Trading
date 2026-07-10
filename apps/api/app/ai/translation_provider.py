import json
import time
from typing import Any, Protocol

import httpx
from sqlalchemy.orm import Session

from app.ai.translation_contract import (
    TRANSLATION_SYSTEM_PROMPT,
    translation_request_payload,
    translation_style_contract_for_payload,
)
from app.core.config import Settings, normalize_ai_provider_name
from app.repositories import create_provider_call_log, sanitize_error_message


class AITranslationProvider(Protocol):
    name: str
    model: str

    async def translate_json(self, *, payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
        ...

class OpenAIJSONTranslationProvider:
    name = "openai"

    def __init__(self, *, api_key: str, model: str, timeout_seconds: float = 30.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def translate_json(self, *, payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(translation_request_payload(payload, target_locale), ensure_ascii=False, sort_keys=True),
                },
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        if isinstance(parsed, dict) and isinstance(parsed.get("content"), dict):
            return parsed["content"]
        if isinstance(parsed, dict):
            return parsed
        raise ValueError("Translation provider returned non-object JSON.")

def get_translation_provider(settings: Settings) -> AITranslationProvider:
    requested = settings.ai_translation_provider
    if requested == "codex_cli":
        from app.ai.codex_cli_provider import CodexCliClient, CodexCliConfig
        from app.ai.codex_translation_provider import CodexCliJSONTranslationProvider, FallbackTranslationProvider

        primary = CodexCliJSONTranslationProvider(
            client=CodexCliClient(
                CodexCliConfig(
                    command=settings.codex_cli_command,
                    model=settings.codex_cli_translation_model or settings.codex_cli_model,
                    timeout_seconds=float(settings.codex_cli_timeout_seconds or 120.0),
                    workdir=settings.codex_cli_workdir,
                    codex_home=settings.codex_cli_home,
                    access_token=settings.codex_cli_access_token,
                )
            ),
            model=settings.codex_cli_translation_model or settings.codex_cli_model,
        )
        fallback_provider = normalize_ai_provider_name(settings.codex_cli_fallback_provider, "codex_cli")
        if fallback_provider == "openai" and settings.openai_api_key:
            return FallbackTranslationProvider(
                primary=primary,
                fallback=OpenAIJSONTranslationProvider(
                    api_key=settings.openai_api_key,
                    model=settings.openai_translation_model or settings.openai_model,
                    timeout_seconds=float(settings.ai_translation_timeout_seconds or 30.0),
                ),
            )
        return primary
    if requested != "openai":
        raise RuntimeError(f"AI_TRANSLATION_PROVIDER={requested} is not supported.")
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for AI translation.")
    return OpenAIJSONTranslationProvider(
        api_key=settings.openai_api_key,
        model=settings.openai_translation_model or settings.openai_model,
        timeout_seconds=float(settings.ai_translation_timeout_seconds or 30.0),
    )


async def translate_json_with_logging(
    db: Session,
    *,
    settings: Settings,
    payload: dict[str, Any],
    target_locale: str,
    symbol: str | None,
    trader_id: str | None,
    provider: AITranslationProvider | None = None,
) -> dict[str, Any]:
    active_provider = provider or get_translation_provider(settings)
    start = time.perf_counter()
    try:
        translated = await active_provider.translate_json(payload=payload, target_locale=target_locale)
        latency_ms = int((time.perf_counter() - start) * 1000)
        create_provider_call_log(
            db,
            provider=active_provider.name,
            model=active_provider.model,
            success=True,
            latency_ms=latency_ms,
            decision=f"translate:{target_locale}",
            symbol=symbol,
            trader_id=trader_id,
            status="ai_translation",
        )
        return translated
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        create_provider_call_log(
            db,
            provider=getattr(active_provider, "name", "openai"),
            model=getattr(active_provider, "model", getattr(settings, "openai_translation_model", "translation")),
            success=False,
            latency_ms=latency_ms,
            decision=f"translate:{target_locale}",
            symbol=symbol,
            trader_id=trader_id,
            status="ai_translation_error",
            error_message=sanitize_error_message(str(exc)),
        )
        raise
