from typing import Any, Dict

import httpx

from app.ai.base import BaseAIProvider, extract_json_object, management_prompt, review_prompt
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


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
            "max_tokens": 900,
            "temperature": 0.2,
            "system": "Return only strict JSON.",
            "messages": [{"role": "user", "content": review_prompt(payload)}],
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
        text = data["content"][0]["text"]
        return self.normalize_result(extract_json_object(text))

    async def review_position_management(
        self, payload: PositionManagementPayload
    ) -> PositionManagementResult:
        body: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": 900,
            "temperature": 0.2,
            "system": "Return only strict JSON.",
            "messages": [{"role": "user", "content": management_prompt(payload)}],
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
        text = data["content"][0]["text"]
        return self.normalize_management_result(extract_json_object(text))
