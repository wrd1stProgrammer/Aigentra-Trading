from typing import Dict

from app.ai.anthropic_provider import AnthropicProvider
from app.ai.gemini_provider import GeminiProvider
from app.ai.grok_provider import GrokProvider
from app.ai.mock_provider import MockAIProvider
from app.ai.openai_provider import OpenAIProvider
from app.core.config import Settings


def provider_status(settings: Settings, selected_override: str = None) -> Dict[str, dict]:
    selected = (selected_override or settings.ai_provider or "mock").lower()
    providers = {
        "mock": {"configured": True, "model": "mock-reviewer-v1"},
        "openai": {
            "configured": bool(settings.openai_api_key),
            "model": settings.openai_model,
        },
        "gemini": {
            "configured": bool(settings.gemini_api_key),
            "model": settings.gemini_model,
        },
        "anthropic": {
            "configured": bool(settings.anthropic_api_key),
            "model": settings.anthropic_model,
        },
        "grok": {
            "configured": bool(settings.grok_api_key),
            "model": settings.grok_model,
        },
    }
    for name, data in providers.items():
        data["selected"] = selected == name
        data["active"] = False
    active = selected if providers.get(selected, {}).get("configured") else "mock"
    providers[active]["active"] = True
    return providers


def get_ai_provider(settings: Settings, provider_override: str = None):
    provider = (provider_override or settings.ai_provider or "mock").lower()
    if provider == "mock":
        return MockAIProvider()
    if provider == "openai" and settings.openai_api_key:
        return OpenAIProvider(settings.openai_api_key, settings.openai_model)
    if provider == "gemini" and settings.gemini_api_key:
        return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
    if provider == "anthropic" and settings.anthropic_api_key:
        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
    if provider == "grok" and settings.grok_api_key:
        return GrokProvider(settings.grok_api_key, settings.grok_model)
    if settings.ai_missing_key_fallback_to_mock:
        return MockAIProvider(fallback=True)
    raise RuntimeError(f"AI_PROVIDER={provider} selected but required API key is missing.")
