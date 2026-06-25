from typing import Any, Dict

import httpx

from app.ai.base import BaseAIProvider, entry_approval_prompt, extract_json_object, league_sentiment_prompt, position_management_review_prompt
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult, LeagueSentimentPayload
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


class OpenAIProvider(BaseAIProvider):
    name = "openai"

    def __init__(
        self,
        api_key: str,
        model: str,
        *,
        trade_review_model: str = "",
        position_management_model: str = "",
        league_sentiment_model: str = "",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.trade_review_model = trade_review_model or model
        self.position_management_model = position_management_model or model
        self.league_sentiment_model = league_sentiment_model or model

    async def review_trade_candidate(
        self, payload: TradeReviewPayload
    ) -> TradeReviewResult:
        body: Dict[str, Any] = {
            "model": self.trade_review_model,
            "messages": [
                {"role": "system", "content": "Return only strict JSON."},
                {"role": "user", "content": entry_approval_prompt(payload)},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        review = self.normalize_result(extract_json_object(content))
        return review.model_copy(update={"model": self.trade_review_model})

    async def review_position_management(
        self, payload: PositionManagementPayload
    ) -> PositionManagementResult:
        body: Dict[str, Any] = {
            "model": self.position_management_model,
            "messages": [
                {"role": "system", "content": "Return only strict JSON."},
                {"role": "user", "content": position_management_review_prompt(payload)},
            ],
            "temperature": 0.35,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
            )
            response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        review = self.normalize_management_result(extract_json_object(content))
        return review.model_copy(update={"model": self.position_management_model})

    async def review_league_sentiment(
        self, payload: LeagueSentimentPayload
    ) -> LeagueSentimentOpinionResult:
        body: Dict[str, Any] = {
            "model": self.league_sentiment_model,
            "messages": [
                {"role": "system", "content": "Return only strict JSON."},
                {"role": "user", "content": league_sentiment_prompt(payload)},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=body,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        opinion = self.normalize_league_sentiment_result(extract_json_object(content))
        return opinion.model_copy(update={"model": self.league_sentiment_model})
