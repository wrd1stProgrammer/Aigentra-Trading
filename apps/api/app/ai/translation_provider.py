import json
import time
from typing import Any, Protocol

import httpx
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.locales import CANONICAL_AI_LOCALE
from app.repositories import create_provider_call_log, sanitize_error_message


class AITranslationProvider(Protocol):
    name: str
    model: str

    async def translate_json(self, *, payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
        ...


TRANSLATION_SYSTEM_PROMPT = """You are Aigentra's localization engine for AI trading review JSON.
Return only a strict JSON object.
Translate ONLY human-readable natural-language string values.
Do not translate JSON keys.
Do not translate enum/status/code/id/provider/model/ticker/symbol/timeframe/order side values.
Preserve all numbers, booleans, nulls, arrays, object shape, and array length.
Preserve technical trading abbreviations when natural in the target language: BTC, USDT, LONG, SHORT, TP, SL, PnL, RSI, EMA, VWAP, OI, RR, ADX, ATR.
Keep prices, percentages, timestamps, and candle intervals exactly as provided.
Use natural, concise product-language for the target locale. Do not sound machine-translated.
If a string mixes an enum with prose, preserve the enum token and translate only the prose around it."""


TARGET_LOCALE_GUIDES = {
    "ko": "Korean. Natural, concise service Korean for beginner-friendly trading UI.",
    "ru": "Russian. Natural fintech/trading UI Russian; keep market abbreviations intact.",
    "pt-BR": "Brazilian Portuguese. Natural Brazilian trading UI Portuguese; avoid European phrasing.",
    "tr": "Turkish. Natural Turkish trading UI wording; keep market abbreviations intact.",
}


class OpenAIJSONTranslationProvider:
    name = "openai"

    def __init__(self, *, api_key: str, model: str, timeout_seconds: float = 30.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def translate_json(self, *, payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
        guide = TARGET_LOCALE_GUIDES.get(target_locale, target_locale)
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": TRANSLATION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "sourceLocale": CANONICAL_AI_LOCALE,
                            "targetLocale": target_locale,
                            "targetGuide": guide,
                            "rules": [
                                "same JSON shape",
                                "do not translate keys",
                                "preserve enum/status/code/id/provider/model values",
                                "translate natural-language values only",
                            ],
                            "content": payload,
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                    ),
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
