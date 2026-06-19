import json
from typing import Any, Final

import httpx

from app.core.config import Settings, normalize_ai_provider_name
from app.trader_status_feed.models import StatusFeedRequest, StatusFeedResult, TraderStatusFeedGenerator


STATUS_FEED_STYLE_CONTRACT: Final[dict[str, str | tuple[str, ...]]] = {
    "format": "trader_thread_post",
    "voice": "first_person_or_close_desk_voice",
    "tone": "human_trader_briefing",
    "watchPolicy": "empty_string",
    "forbiddenStyles": ("news_article", "analyst_report", "journalist_summary", "formal_postmortem"),
    "forbiddenPhrases": ("next_watch_label", "next_confirmation_label", "what_to_watch", "key_signal", "core_signal"),
}


STATUS_FEED_SYSTEM_PROMPT = f"""You write short status-feed notes for Aigentra AI traders.
Return only a strict JSON object with exactly these keys:
headline, message, mood, stance, watch.

Source locale is English. A separate lightweight GPT translation step localizes later, so do not write Korean or mixed-language text.

Style contract:
{json.dumps(STATUS_FEED_STYLE_CONTRACT, ensure_ascii=False, sort_keys=True)}

Rules:
- Write like the trader posting one quick thread update to followers, not a news article, analyst report, or trade recap memo.
- Use first person when natural: I, I'm, my book, my zone, I'm flat, I'm filled, not chasing.
- Keep headline <= 44 characters and message <= 165 characters.
- Set watch to an empty string. Do not create a separate next-check or next-watch line.
- If the next thing matters, weave it into message as a human aside, not as a label or checklist.
- Be casual and trader-like, but still professional and grounded.
- Use the trader persona, current trigger, recent reviews, recent trade events, and recent feed notes.
- Do not repeat a recent feed note.
- Do not invent prices, PnL, fills, or decisions not present in the input.
- Do not give personalized financial advice, promises, guaranteed outcomes, or direct user commands.
- Avoid emojis, hashtags, markdown, long explanations, semicolon-heavy clauses, and phrases like "key signal" or "core signal"."""


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
            message=str(parsed.get("message") or "I'm staying patient until the setup gets clean enough to touch."),
            mood=str(parsed.get("mood") or "focused"),
            stance=str(parsed.get("stance") or "patient"),
            watch="",
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
                "Skipped it after review",
                "I passed on that setup after the second review. It was close, but not clean enough for my book.",
            ),
            "pending_entry": (
                "Order parked, no chase",
                "My order is parked. If price tags the zone, great; if not, I'm not chasing the middle.",
            ),
            "position_entry": (
                "I'm in, management mode",
                "I'm filled. Now it's just management: invalidation first, then let the candles do the talking.",
            ),
            "position_closed": (
                "Flat again, reset mode",
                "Closed that one and I'm flat again. Good enough, now I reset instead of forcing another click.",
            ),
        }
        headline, message = templates.get(
            request.stateKey,
            (
                "Desk note",
                "I'm keeping the desk quiet until the market gives me something worth touching.",
            ),
        )
        return StatusFeedResult(
            headline=headline,
            message=message,
            mood="focused",
            stance="patient",
            watch="",
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
