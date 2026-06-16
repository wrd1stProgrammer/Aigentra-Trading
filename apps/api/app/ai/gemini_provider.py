from typing import Any, Dict

import httpx

from app.ai.base import BaseAIProvider, entry_approval_prompt, extract_json_object, position_management_review_prompt
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


class GeminiProvider(BaseAIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    async def review_trade_candidate(
        self, payload: TradeReviewPayload
    ) -> TradeReviewResult:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        body: Dict[str, Any] = {
            "contents": [
                {"role": "user", "parts": [{"text": entry_approval_prompt(payload)}]},
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=body)
            if response.status_code >= 400:
                raise RuntimeError(f"Gemini request failed with status {response.status_code}.")
            data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return self.normalize_result(extract_json_object(text))

    async def review_position_management(
        self, payload: PositionManagementPayload
    ) -> PositionManagementResult:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        body: Dict[str, Any] = {
            "contents": [
                {"role": "user", "parts": [{"text": position_management_review_prompt(payload)}]},
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=body)
            if response.status_code >= 400:
                raise RuntimeError(f"Gemini request failed with status {response.status_code}.")
            data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return self.normalize_management_result(extract_json_object(text))
