from typing import Any, Dict, Iterable

import httpx

from app.ai.base import (
    BaseAIProvider,
    VALID_DECISIONS,
    VALID_LEAGUE_BIASES,
    VALID_MANAGEMENT_ACTIONS,
    VALID_MANAGEMENT_DECISIONS,
    VALID_RISK_LEVELS,
    entry_approval_prompt,
    extract_json_object,
    league_sentiment_prompt,
    position_management_review_prompt,
)
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult, LeagueSentimentPayload
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


TRADE_REVIEW_TOOL_NAME = "submit_trade_review"
MANAGEMENT_REVIEW_TOOL_NAME = "submit_position_management_review"
LEAGUE_SENTIMENT_TOOL_NAME = "submit_league_sentiment_opinion"
ANTHROPIC_REVIEW_MAX_TOKENS = 4096
ANTHROPIC_JSON_SYSTEM_PROMPT = (
    "Return only the JSON object matching the response schema. "
    "Do not use markdown. Keep array items concise and structuredReview beginner-readable; "
    "approvalReason, rationale, and counterThesis are legacy compatibility fields, not long essays."
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


def structured_review_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "verdict": {"type": "string", "description": "Short decision label in the requested language."},
            "headline": {
                "type": "string",
                "description": (
                    "One plain-language sentence. For entry approval, headline must be the plain answer to why this trader entered now: "
                    "name the trader concept or setup family, the entry zone, and the market trigger before risk controls; "
                    "for position management, explain whether the current position is working, weakening, protected, or invalidated."
                ),
            },
            "action": {
                "type": "string",
                "description": "One standalone review sentence that can be merged into a short briefing. Never return a list, list-like text, bullet prefix, or section label.",
            },
            "keyReasons": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Up to two standalone evidence sentences. For entry approval, the first reason must name the concrete market trigger or entry thesis; "
                    "read it through the trader-specific strategy concept, not as a generic indicator list. The second may cover current price versus entry, stop, target, PnL, recent candles, or recent reviews."
                ),
            },
            "risks": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Up to one standalone caution sentence.",
            },
            "watchConditions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Up to two standalone trigger sentences that would change the decision.",
            },
            "managerNote": {
                "type": "string",
                "description": "One concise desk note shown separately from the short review briefing.",
            },
        },
        "required": ["verdict", "headline", "action", "keyReasons", "risks", "watchConditions", "managerNote"],
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
            "structuredReview": structured_review_schema(),
            "adjustments": string_array_schema(),
            "leverageOverride": {"type": "number"},
            "riskPercentOverride": {"type": "number"},
            "earlyExitRecommendations": string_array_schema(),
            "approvalReason": {
                "type": "string",
                "description": (
                    "Legacy entry approval rationale. Write 1-2 compact sentences mirroring structuredReview, with entry decision, trader-specific interpretation, then risk boundary. "
                    "Do not write a scattered chain that mixes price, RSI, stop, targets, fee-aware RR, and recent-loss memory before naming the entry thesis. "
                    "Do not answer only with higher-timeframe trend, stop/target geometry, RR, leverage, or risk percentage. "
                    "Do not cite setupScore as the main reason or describe approval as paper-trading learning."
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
            "structuredReview",
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
            "type": {
                "type": "string",
                "enum": sorted(VALID_MANAGEMENT_ACTIONS),
                "description": (
                    "Use TAKE_PARTIAL_PROFIT for partial take-profit, REDUCE_SIZE or REDUCE_RISK for defensive trims, "
                    "and CLOSE_POSITION for an early full close or early full take-profit of the remaining position."
                ),
            },
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
            "structuredReview": structured_review_schema(),
            "actions": {"type": "array", "items": management_action_schema()},
            "riskChange": {"type": "string"},
            "nextReviewInSeconds": {"type": "integer", "description": "Seconds until the next review, from 60 to 3600."},
            "rationale": {
                "type": "string",
                "description": "Legacy management rationale. Write 1-2 compact sentences mirroring the current exposure briefing in structuredReview.",
            },
            "counterThesis": {"type": "string"},
        },
        "required": [
            "decision",
            "confidence",
            "riskLevel",
            "reviewCode",
            "reviewFacts",
            "riskFlags",
            "structuredReview",
            "actions",
            "riskChange",
            "nextReviewInSeconds",
            "rationale",
            "counterThesis",
        ],
        "additionalProperties": False,
    }


def league_sentiment_schema() -> dict[str, Any]:
    nullable_string = {"type": ["string", "null"]}
    nullable_integer = {"type": ["integer", "null"]}
    source_group_schema = {
        "type": "object",
        "properties": {
            "total": {"type": "integer"},
            "long": {"type": "integer"},
            "short": {"type": "integer"},
            "longNotional": {"type": "number"},
            "shortNotional": {"type": "number"},
            "dominantSide": {"type": "string"},
        },
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {
            "bias": {"type": "string", "enum": sorted(VALID_LEAGUE_BIASES)},
            "confidence": {"type": "integer", "description": "Integer confidence from 0 to 100."},
            "riskLevel": {"type": "string", "enum": sorted(VALID_RISK_LEVELS)},
            "confidenceReason": {"type": "string"},
            "brief": {
                "type": "object",
                "properties": {
                    "conclusion": {
                        "type": "string",
                        "description": "One plain sentence with the current league read.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "One plain sentence with the strongest reason this read matters.",
                    },
                    "watch": {
                        "type": "string",
                        "description": "One concrete next condition to watch before the next generation.",
                    },
                },
                "required": ["conclusion", "reason", "watch"],
                "additionalProperties": False,
            },
            "headline": {"type": "string"},
            "summary": {"type": "string"},
            "keyDrivers": {"type": "array", "items": {"type": "string"}, "maxItems": 1},
            "risks": {"type": "array", "items": {"type": "string"}, "maxItems": 1},
            "watchConditions": {"type": "array", "items": {"type": "string"}, "maxItems": 1},
            "action": {"type": "string"},
            "longShortContext": {"type": "string"},
            "sourceCounts": {"type": "object", "additionalProperties": {"type": "integer"}},
            "sourceBreakdown": {
                "type": "object",
                "properties": {
                    "activeExposure": source_group_schema,
                    "pendingOrders": source_group_schema,
                    "recentOutcomes": {
                        "type": "object",
                        "properties": {
                            "closedPositions": {"type": "integer"},
                            "tradeEvents": {"type": "integer"},
                            "takeProfits": {"type": "integer"},
                            "stopLosses": {"type": "integer"},
                        },
                        "additionalProperties": False,
                    },
                    "aiReviews": {
                        "type": "object",
                        "properties": {
                            "entry": {"type": "integer"},
                            "approvedEntry": {"type": "integer"},
                            "rejectedEntry": {"type": "integer"},
                            "management": {"type": "integer"},
                        },
                        "additionalProperties": False,
                    },
                },
                "required": ["activeExposure", "pendingOrders", "recentOutcomes", "aiReviews"],
                "additionalProperties": False,
            },
            "dataFreshness": {
                "type": "object",
                "properties": {
                    "generatedAt": {"type": "string"},
                    "marketUpdatedAt": nullable_string,
                    "marketAgeMinutes": nullable_integer,
                    "latestActivePositionAt": nullable_string,
                    "latestActivePositionAgeMinutes": nullable_integer,
                    "latestPendingOrderAt": nullable_string,
                    "latestPendingOrderAgeMinutes": nullable_integer,
                    "latestOutcomeAt": nullable_string,
                    "latestOutcomeAgeMinutes": nullable_integer,
                    "latestEntryReviewAt": nullable_string,
                    "latestEntryReviewAgeMinutes": nullable_integer,
                    "latestManagementReviewAt": nullable_string,
                    "latestManagementReviewAgeMinutes": nullable_integer,
                },
                "required": [
                    "generatedAt",
                    "marketUpdatedAt",
                    "marketAgeMinutes",
                    "latestActivePositionAt",
                    "latestActivePositionAgeMinutes",
                    "latestPendingOrderAt",
                    "latestPendingOrderAgeMinutes",
                    "latestOutcomeAt",
                    "latestOutcomeAgeMinutes",
                    "latestEntryReviewAt",
                    "latestEntryReviewAgeMinutes",
                    "latestManagementReviewAt",
                    "latestManagementReviewAgeMinutes",
                ],
                "additionalProperties": False,
            },
            "evidenceRefs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "sourceType": {"type": "string"},
                        "label": {"type": "string"},
                    },
                    "required": ["id", "sourceType", "label"],
                    "additionalProperties": False,
                },
            },
            "invalidatesAt": nullable_string,
        },
        "required": [
            "bias",
            "confidence",
            "riskLevel",
            "confidenceReason",
            "brief",
            "headline",
            "summary",
            "keyDrivers",
            "risks",
            "watchConditions",
            "action",
            "longShortContext",
            "sourceCounts",
            "sourceBreakdown",
            "dataFreshness",
            "evidenceRefs",
            "invalidatesAt",
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

    async def review_league_sentiment(
        self, payload: LeagueSentimentPayload
    ) -> LeagueSentimentOpinionResult:
        body: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": ANTHROPIC_REVIEW_MAX_TOKENS,
            "temperature": 0.2,
            "system": ANTHROPIC_JSON_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": league_sentiment_prompt(payload)}],
            "output_config": json_output_config(league_sentiment_schema()),
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
        return self.normalize_league_sentiment_result(extract_anthropic_review_payload(data, LEAGUE_SENTIMENT_TOOL_NAME))
