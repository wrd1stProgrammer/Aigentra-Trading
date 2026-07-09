from typing import Dict

from app.ai.anthropic_provider import AnthropicProvider
from app.ai.gemini_provider import GeminiProvider
from app.ai.grok_provider import GrokProvider
from app.ai.mock_provider import MockAIProvider
from app.ai.openai_provider import OpenAIProvider
from app.ai.codex_cli_provider import CodexCliAIProvider, CodexCliClient, CodexCliConfig, FallbackAIProvider
from app.core.config import Settings, normalize_ai_provider_name


def provider_status(settings: Settings, selected_override: str = None) -> Dict[str, dict]:
    selected = normalize_ai_provider_name(selected_override or settings.ai_provider or "mock")
    providers = {
        "mock": {"configured": True, "model": "mock-reviewer-v1"},
        "openai": {
            "configured": bool(settings.openai_api_key),
            "model": settings.openai_model,
            "tradeReviewModel": settings.openai_trade_review_model or settings.openai_model,
            "positionManagementModel": settings.openai_position_management_model or settings.openai_model,
            "leagueSentimentModel": settings.openai_league_sentiment_model or settings.openai_model,
        },
        "codex_cli": {
            "configured": bool(settings.codex_cli_command),
            "model": settings.codex_cli_model or "codex-cli-default",
            "tradeReviewModel": settings.codex_cli_trade_review_model or settings.codex_cli_model or "codex-cli-default",
            "positionManagementModel": settings.codex_cli_position_management_model
            or settings.codex_cli_model
            or "codex-cli-default",
            "leagueSentimentModel": settings.codex_cli_league_sentiment_model or settings.codex_cli_model or "codex-cli-default",
            "fallbackProvider": settings.codex_cli_fallback_provider,
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
        return OpenAIProvider(
            settings.openai_api_key,
            settings.openai_model,
            trade_review_model=settings.openai_trade_review_model,
            position_management_model=settings.openai_position_management_model,
            league_sentiment_model=settings.openai_league_sentiment_model,
        )
    if provider == "codex_cli" and settings.codex_cli_command:
        primary = CodexCliAIProvider(
            client=CodexCliClient(
                CodexCliConfig(
                    command=settings.codex_cli_command,
                    model=settings.codex_cli_model,
                    timeout_seconds=float(settings.codex_cli_timeout_seconds or 120.0),
                    workdir=settings.codex_cli_workdir,
                    codex_home=settings.codex_cli_home,
                    access_token=settings.codex_cli_access_token,
                )
            ),
            model=settings.codex_cli_model,
            trade_review_model=settings.codex_cli_trade_review_model,
            position_management_model=settings.codex_cli_position_management_model,
            league_sentiment_model=settings.codex_cli_league_sentiment_model,
        )
        fallback_name = settings.codex_cli_fallback_provider
        if fallback_name == "codex_cli":
            return primary
        return FallbackAIProvider(primary=primary, fallback=get_ai_provider(settings, fallback_name))
    if provider == "gemini" and settings.gemini_api_key:
        return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
    if provider == "anthropic" and settings.anthropic_api_key:
        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
    if provider == "grok" and settings.grok_api_key:
        return GrokProvider(settings.grok_api_key, settings.grok_model)
    if settings.ai_missing_key_fallback_to_mock:
        return MockAIProvider(fallback=True)
    raise RuntimeError(f"AI_PROVIDER={provider} selected but required API key is missing.")
