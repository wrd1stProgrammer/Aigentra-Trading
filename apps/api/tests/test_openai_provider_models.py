import pytest

from app.ai.league_sentiment_models import LeagueSentimentPayload
from app.ai.openai_provider import OpenAIProvider
from app.traders.models import ManagedExposure, ManagementEvent, PositionManagementPayload, TradeReviewPayload
from app.traders.registry import get_strategy


def sample_review_payload() -> TradeReviewPayload:
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(
        {
            "symbol": "BTCUSDT",
            "price": 66000.0,
            "timeframes": {
                "15m": {"close": 66000, "rsi14": 42, "atr14": 120, "volumeZscore": 1.2, "trend": "UP"},
                "1h": {"close": 66000, "rsi14": 45, "atr14": 320, "volumeZscore": 1.0, "trend": "UP"},
                "4h": {"close": 66000, "ema20": 65500, "ema50": 64000, "rsi14": 55, "trend": "UP"},
            },
            "derivatives": {"fundingRate": 0.0001, "openInterest": 1000000},
            "marketRegime": {"primary": "trend"},
        }
    )
    return TradeReviewPayload(
        trader=strategy.profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 66000.0, "timeframes": {}, "derivatives": {}},
        candidate=candidate,
        locale="en",
    )


def sample_management_payload() -> PositionManagementPayload:
    strategy = get_strategy("channel-rider")
    return PositionManagementPayload(
        trader=strategy.profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 66000.0, "timeframes": {}, "derivatives": {}},
        event=ManagementEvent(
            eventType="position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Scheduled open-position review.",
            suggestedAction="HOLD",
        ),
        exposure=ManagedExposure(
            kind="position",
            id=7,
            status="OPEN",
            side="LONG",
            quantity=0.01,
            entryPrice=65500.0,
            stopLoss=65000.0,
            takeProfit=67000.0,
        ),
        locale="en",
    )


def sample_league_sentiment_payload() -> LeagueSentimentPayload:
    return LeagueSentimentPayload(
        symbol="BTCUSDT",
        locale="en",
        generatedAt="2026-06-24T00:00:00+00:00",
        intervalStart="2026-06-24T00:00:00+00:00",
        intervalEnd="2026-06-24T01:00:00+00:00",
        market={"price": 66000.0},
        sourceCounts={"activePositions": 1},
        activePositions=[{"traderId": "channel-rider", "side": "LONG"}],
        longShortContext={"longCount": 1, "shortCount": 0},
    )


@pytest.mark.asyncio
async def test_openai_provider_uses_separate_models_per_review_surface(monkeypatch):
    captured_models: list[str] = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                "{"
                                '"decision":"APPROVE",'
                                '"confidence":84,'
                                '"riskLevel":"MEDIUM",'
                                '"reviewCode":"ENTRY_REVIEW",'
                                '"reviewFacts":[],'
                                '"structuredReview":{"verdict":"Approved","headline":"Entry structure is acceptable.","action":"Place the planned order.","keyReasons":["Risk box is defined."],"risks":["Invalidation can trigger."],"watchConditions":["Watch the next close."],"managerNote":"Keep risk fixed."},'
                                '"adjustments":[],'
                                '"earlyExitRecommendations":[],'
                                '"approvalReason":"Entry structure is acceptable.",'
                                '"counterThesis":"Cancel if invalidation breaks."'
                                "}"
                            )
                        }
                    }
                ]
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            captured_models.append(json["model"])
            return FakeResponse()

    monkeypatch.setattr("app.ai.openai_provider.httpx.AsyncClient", FakeAsyncClient)

    provider = OpenAIProvider(
        "test-key",
        "gpt-default",
        trade_review_model="gpt-entry",
        position_management_model="gpt-management",
        league_sentiment_model="gpt-sentiment",
    )

    entry_review = await provider.review_trade_candidate(sample_review_payload())

    class FakeManagementResponse(FakeResponse):
        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                "{"
                                '"decision":"HOLD",'
                                '"confidence":82,'
                                '"riskLevel":"MEDIUM",'
                                '"reviewCode":"POSITION_MANAGEMENT_REVIEW",'
                                '"structuredReview":{"verdict":"Hold","headline":"Position remains valid.","action":"Hold the position.","keyReasons":["Stop is defined."],"risks":["Momentum can fade."],"watchConditions":["Watch invalidation."],"managerNote":"Do not widen risk."},'
                                '"actions":[{"type":"HOLD","reason":"Hold."}],'
                                '"riskChange":"UNCHANGED",'
                                '"nextReviewInSeconds":900,'
                                '"rationale":"Position remains valid.",'
                                '"counterThesis":"Exit if invalidated."'
                                "}"
                            )
                        }
                    }
                ]
            }

    class FakeLeagueSentimentResponse(FakeResponse):
        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                "{"
                                '"bias":"MIXED",'
                                '"confidence":70,'
                                '"riskLevel":"MEDIUM",'
                                '"headline":"Market is mixed.",'
                                '"summary":"Signals are balanced.",'
                                '"keyDrivers":["One active long."],'
                                '"risks":["Momentum can reverse."],'
                                '"watchConditions":["Watch the next hourly close."],'
                                '"action":"Avoid chasing.",'
                                '"longShortContext":"LONG 1 / SHORT 0",'
                                '"sourceCounts":{"activePositions":1}'
                                "}"
                            )
                        }
                    }
                ]
            }

    response_queue = [FakeManagementResponse(), FakeLeagueSentimentResponse()]

    class RoutedFakeAsyncClient(FakeAsyncClient):
        async def post(self, url, *, headers, json):
            captured_models.append(json["model"])
            return response_queue.pop(0)

    monkeypatch.setattr("app.ai.openai_provider.httpx.AsyncClient", RoutedFakeAsyncClient)

    management_review = await provider.review_position_management(sample_management_payload())
    league_sentiment = await provider.review_league_sentiment(sample_league_sentiment_payload())

    assert captured_models == ["gpt-entry", "gpt-management", "gpt-sentiment"]
    assert entry_review.model == "gpt-entry"
    assert management_review.model == "gpt-management"
    assert league_sentiment.model == "gpt-sentiment"


def test_openai_provider_surface_models_fallback_to_default_model():
    provider = OpenAIProvider("test-key", "gpt-default")

    assert provider.trade_review_model == "gpt-default"
    assert provider.position_management_model == "gpt-default"
    assert provider.league_sentiment_model == "gpt-default"
