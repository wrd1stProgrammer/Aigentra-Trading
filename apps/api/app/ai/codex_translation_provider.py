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
            output_schema=translation_output_schema(payload),
            model=self.model,
        )
        if isinstance(parsed.get("content"), dict):
            return parsed["content"]
        return parsed


def translation_output_schema(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"content": json_value_schema(payload)},
        "required": ["content"],
        "additionalProperties": False,
    }


def json_value_schema(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        properties = {str(key): json_value_schema(item) for key, item in value.items()}
        return {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        }
    if isinstance(value, list):
        item_schemas: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in value:
            schema = json_value_schema(item)
            signature = json.dumps(schema, sort_keys=True)
            if signature not in seen:
                seen.add(signature)
                item_schemas.append(schema)
        if not item_schemas:
            items: dict[str, Any] = {"type": "string"}
        elif len(item_schemas) == 1:
            items = item_schemas[0]
        else:
            items = {"anyOf": item_schemas}
        return {"type": "array", "items": items}
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "boolean"}
    if isinstance(value, int):
        return {"type": "integer"}
    if isinstance(value, float):
        return {"type": "number"}
    return {"type": "string"}


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
