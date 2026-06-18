import json
from typing import Any

import httpx

from app.core.config import Settings, normalize_ai_provider_name
from app.trader_status_feed.models import StatusFeedRequest, StatusFeedResult, TraderStatusFeedGenerator


STATUS_FEED_SYSTEM_PROMPT = """You write short status-feed notes for Aigentra AI traders.
Return only a strict JSON object with exactly these keys:
headline, message, mood, stance, watch.

Source locale is English. A separate lightweight GPT translation step localizes later, so do not write Korean or mixed-language text.

Rules:
- Write as the trader in first person or close desk-note voice.
- Keep headline <= 48 characters, message <= 180 characters, watch <= 80 characters.
- Be casual and trader-like, but still professional and grounded.
- Use the trader persona, current trigger, recent reviews, recent trade events, and recent feed notes.
- Do not repeat a recent feed note.
- Do not invent prices, PnL, fills, or decisions not present in the input.
- Do not give personalized financial advice, promises, guaranteed outcomes, or direct user commands.
- Avoid emojis, hashtags, markdown, and long explanations."""


class OpenAITraderStatusFeedGenerator:
    name = "openai"

    def __init__(self, *, api_key: str, model: str, timeout_seconds: float = 30.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def generate(self, request: StatusFeedRequest) -> StatusFeedResult:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": STATUS_FEED_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "task": "Create one concise trader status feed note.",
                            "requiredEvent": {
                                "stateKey": request.stateKey,
                                "eventType": request.eventType,
                                "symbol": request.symbol,
                                "generatedAt": request.generatedAt.isoformat(),
                            },
                            "traderPersona": request.trader.model_dump(mode="json"),
                            "trigger": request.trigger,
                            "context": request.context,
                        },
                        ensure_ascii=False,
                        sort_keys=True,
                        default=str,
                    ),
                },
            ],
            "temperature": 0.55,
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
        if not isinstance(parsed, dict):
            raise ValueError("Status feed provider returned non-object JSON.")
        return StatusFeedResult(
            headline=str(parsed.get("headline") or "Status update"),
            message=str(parsed.get("message") or "I am waiting for a cleaner confirmation before the next move."),
            mood=str(parsed.get("mood") or "focused"),
            stance=str(parsed.get("stance") or "patient"),
            watch=str(parsed.get("watch") or "Next confirmation candle."),
            provider=self.name,
            model=self.model,
            fallback=False,
        )


class MockTraderStatusFeedGenerator:
    name = "mock"
    model = "mock-status-feed"

    async def generate(self, request: StatusFeedRequest) -> StatusFeedResult:
        templates = {
            "review_rejected": (
                "Setup passed on paper, not on review",
                "I passed on that setup after the second review. The idea was close, but the edge was not clean enough to force it.",
                "Next clean setup, not the old one.",
            ),
            "pending_entry": (
                "Entry is parked",
                "My plan is live, but I am still waiting for price to tag the entry zone. No need to chase the middle.",
                "Entry zone behavior.",
            ),
            "position_entry": (
                "Position is on",
                "I got the fill. Now it is management mode: protect the invalidation and let the next candles prove the trade.",
                "Stop behavior and first reaction.",
            ),
            "position_closed": (
                "Position wrapped",
                "That position is closed. I am logging the result and waiting for the next setup instead of forcing a re-entry.",
                "Fresh setup quality.",
            ),
        }
        headline, message, watch = templates.get(
            request.stateKey,
            (
                "Desk note",
                "I am keeping the desk quiet until the next useful market event shows up.",
                "Next meaningful event.",
            ),
        )
        return StatusFeedResult(
            headline=headline,
            message=message,
            mood="focused",
            stance="patient",
            watch=watch,
            provider=self.name,
            model=self.model,
            fallback=True,
        )


def get_status_feed_generator(settings: Settings, provider_override: str | None = None) -> TraderStatusFeedGenerator:
    requested = normalize_ai_provider_name(provider_override or settings.trader_status_feed_provider, "openai")
    if requested != "openai":
        return MockTraderStatusFeedGenerator()
    if not settings.openai_api_key and settings.ai_missing_key_fallback_to_mock:
        return MockTraderStatusFeedGenerator()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for trader status feed generation.")
    return OpenAITraderStatusFeedGenerator(
        api_key=settings.openai_api_key,
        model=settings.trader_status_feed_model or settings.openai_model,
        timeout_seconds=float(settings.trader_status_feed_timeout_seconds or 30.0),
    )
