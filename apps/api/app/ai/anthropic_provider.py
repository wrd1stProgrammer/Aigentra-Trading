from typing import Any, Dict, Iterable

import httpx

from app.ai.base import (
    BaseAIProvider,
    VALID_DECISIONS,
    VALID_MANAGEMENT_ACTIONS,
    VALID_MANAGEMENT_DECISIONS,
    VALID_RISK_LEVELS,
    entry_approval_prompt,
    extract_json_object,
    position_management_review_prompt,
)
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


TRADE_REVIEW_TOOL_NAME = "submit_trade_review"
MANAGEMENT_REVIEW_TOOL_NAME = "submit_position_management_review"
ANTHROPIC_REVIEW_MAX_TOKENS = 4096
ANTHROPIC_JSON_SYSTEM_PROMPT = (
    "Return only the JSON object matching the response schema. "
    "Do not use markdown. Keep checklist/action array items concise, "
    "but let approvalReason, rationale, and counterThesis use the detail required by their field descriptions."
)


def string_array_schema() -> dict[str, Any]:
    return {"type": "array", "items": {"type": "string"}}


def review_fact_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "code": {"type": "string"},
            "labelKey": {"type": "string"},
            "severity": {"type": "string", "enum": ["info", "warn", "error"]},
            "detail": {"type": "string"},
            "value": {"type": "string"},
        },
        "required": ["code", "labelKey", "severity"],
        "additionalProperties": False,
    }


def json_output_config(schema: dict[str, Any]) -> dict[str, Any]:
    return {"format": {"type": "json_schema", "schema": schema}}


def trade_review_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "decision": {"type": "string", "enum": sorted(VALID_DECISIONS)},
            "confidence": {"type": "integer", "description": "Integer confidence from 0 to 100."},
            "riskLevel": {"type": "string", "enum": sorted(VALID_RISK_LEVELS)},
            "reviewCode": {"type": "string"},
            "reviewFacts": {"type": "array", "items": review_fact_schema()},
            "riskFlags": string_array_schema(),
            "adjustments": string_array_schema(),
            "leverageOverride": {"type": "number"},
            "riskPercentOverride": {"type": "number"},
            "earlyExitRecommendations": string_array_schema(),
            "approvalReason": {
                "type": "string",
                "description": (
                    "user-visible entry approval rationale. For APPROVE or ADJUST_AND_APPROVE, write 3-5 "
                    "compact sentences explaining thesis, execution geometry, fee-aware RR, leverage/risk "
                    "adjustments, early exits, and residual invalidation risk. Do not cite setupScore as the "
                    "main reason or describe approval as paper-trading learning."
                ),
            },
            "counterThesis": {
                "type": "string",
                "description": "Concrete opposing market story or kill-switch that would invalidate the entry approval.",
            },
        },
        "required": [
            "decision",
            "confidence",
            "riskLevel",
            "reviewCode",
            "reviewFacts",
            "riskFlags",
            "adjustments",
            "earlyExitRecommendations",
            "approvalReason",
            "counterThesis",
        ],
        "additionalProperties": False,
    }


def management_action_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": sorted(VALID_MANAGEMENT_ACTIONS)},
            "price": {"type": "number"},
            "quantityFraction": {"type": "number", "description": "Fraction from 0 to 1."},
            "reason": {"type": "string"},
        },
        "required": ["type", "reason"],
        "additionalProperties": False,
    }


def management_review_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "decision": {"type": "string", "enum": sorted(VALID_MANAGEMENT_DECISIONS)},
            "confidence": {"type": "integer", "description": "Integer confidence from 0 to 100."},
            "riskLevel": {"type": "string", "enum": sorted(VALID_RISK_LEVELS)},
            "reviewCode": {"type": "string"},
            "reviewFacts": {"type": "array", "items": review_fact_schema()},
            "riskFlags": string_array_schema(),
            "actions": {"type": "array", "items": management_action_schema()},
            "riskChange": {"type": "string"},
            "nextReviewInSeconds": {"type": "integer", "description": "Seconds until the next review, from 60 to 3600."},
            "rationale": {"type": "string"},
            "counterThesis": {"type": "string"},
        },
        "required": [
            "decision",
            "confidence",
            "riskLevel",
            "reviewCode",
            "reviewFacts",
            "riskFlags",
            "actions",
            "riskChange",
            "nextReviewInSeconds",
            "rationale",
            "counterThesis",
        ],
        "additionalProperties": False,
    }


def extract_anthropic_tool_input(data: dict[str, Any], tool_name: str) -> dict[str, Any]:
    for block in tool_blocks(data.get("content", [])):
        if block.get("name") != tool_name:
            continue
        tool_input = block.get("input")
        if isinstance(tool_input, dict):
            return tool_input
        raise ValueError("Anthropic tool input was not an object.")
    text = "\n".join(block.get("text", "") for block in text_blocks(data.get("content", [])))
    if text.strip():
        return extract_json_object(text)
    raise ValueError(f"Anthropic response did not include {tool_name} tool input.")


def extract_anthropic_json_output(data: dict[str, Any]) -> dict[str, Any]:
    text = "\n".join(block.get("text", "") for block in text_blocks(data.get("content", []))).strip()
    if text:
        try:
            return extract_json_object(text)
        except ValueError as exc:
            raise ValueError(anthropic_response_error(data, text)) from exc

    content_types = ",".join(content_block_types(data.get("content", []))) or "none"
    stop_reason = str(data.get("stop_reason") or "unknown")
    raise ValueError(
        f"Anthropic JSON output was empty; stop_reason={stop_reason}; content_types={content_types}"
    )


def anthropic_response_error(data: dict[str, Any], text: str) -> str:
    content_types = ",".join(content_block_types(data.get("content", []))) or "none"
    stop_reason = str(data.get("stop_reason") or "unknown")
    preview = " ".join(text.split())[:280]
    return (
        "Anthropic JSON output could not be parsed; "
        f"stop_reason={stop_reason}; content_types={content_types}; preview={preview}"
    )


def extract_anthropic_review_payload(data: dict[str, Any], tool_name: str) -> dict[str, Any]:
    try:
        return extract_anthropic_json_output(data)
    except ValueError as json_error:
        try:
            return extract_anthropic_tool_input(data, tool_name)
        except ValueError as tool_error:
            raise ValueError(f"{json_error}; tool_error={tool_error}") from tool_error


def tool_blocks(content: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(content, list):
        return []
    return [block for block in content if isinstance(block, dict) and block.get("type") == "tool_use"]


def text_blocks(content: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(content, list):
        return []
    return [block for block in content if isinstance(block, dict) and block.get("type") == "text"]


def content_block_types(content: Any) -> list[str]:
    if not isinstance(content, list):
        return []
    return [str(block.get("type") or "unknown") for block in content if isinstance(block, dict)]


class AnthropicProvider(BaseAIProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def review_trade_candidate(
        self, payload: TradeReviewPayload
    ) -> TradeReviewResult:
        body: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": ANTHROPIC_REVIEW_MAX_TOKENS,
            "temperature": 0.2,
            "system": ANTHROPIC_JSON_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": entry_approval_prompt(payload)}],
            "output_config": json_output_config(trade_review_schema()),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()
        return self.normalize_result(extract_anthropic_review_payload(data, TRADE_REVIEW_TOOL_NAME))

    async def review_position_management(
        self, payload: PositionManagementPayload
    ) -> PositionManagementResult:
        body: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": ANTHROPIC_REVIEW_MAX_TOKENS,
            "temperature": 0.2,
            "system": ANTHROPIC_JSON_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": position_management_review_prompt(payload)}],
            "output_config": json_output_config(management_review_schema()),
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()
        return self.normalize_management_result(extract_anthropic_review_payload(data, MANAGEMENT_REVIEW_TOOL_NAME))
