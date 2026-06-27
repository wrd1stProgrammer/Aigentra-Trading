import json
from typing import Any

from app.ai.codex_cli_provider import CodexCliError, CodexJsonClient
from app.ai.translation_contract import TRANSLATION_SYSTEM_PROMPT, translation_request_payload
from app.ai.translation_provider import AITranslationProvider


class CodexCliJSONTranslationProvider:
    name = "codex_cli"

    def __init__(self, *, client: CodexJsonClient, model: str) -> None:
        self.client = client
        self.model = model

    async def translate_json(self, *, payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
        parsed = await self.client.run_json(
            system_prompt=TRANSLATION_SYSTEM_PROMPT,
            user_prompt=json.dumps(translation_request_payload(payload, target_locale), ensure_ascii=False, sort_keys=True),
            output_schema={"type": "object", "additionalProperties": True},
            model=self.model,
        )
        if isinstance(parsed.get("content"), dict):
            return parsed["content"]
        return parsed


class FallbackTranslationProvider:
    def __init__(self, *, primary: AITranslationProvider, fallback: AITranslationProvider) -> None:
        self.primary = primary
        self.fallback = fallback
        self.name = primary.name
        self.model = primary.model

    async def translate_json(self, *, payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
        try:
            return await self.primary.translate_json(payload=payload, target_locale=target_locale)
        except CodexCliError:
            return await self.fallback.translate_json(payload=payload, target_locale=target_locale)
