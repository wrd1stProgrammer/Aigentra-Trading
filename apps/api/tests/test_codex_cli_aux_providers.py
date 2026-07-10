from datetime import datetime, timezone

import pytest

from app.ai.codex_translation_provider import (
    CodexCliJSONTranslationProvider,
    FallbackTranslationProvider,
    translation_output_schema,
)
from app.ai.translation_cache import fanout_ai_translations
from app.ai.translation_provider import get_translation_provider
from app.core.config import Settings
from app.db import AITranslationCacheRecord, init_db, reset_db_engine, session_scope
from app.locales import AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT
from app.trader_status_feed.generator import (
    CodexCliTraderStatusFeedGenerator,
    FallbackTraderStatusFeedGenerator,
    get_status_feed_generator,
)
from app.trader_status_feed.models import StatusFeedPersona, StatusFeedRequest


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "codex-cli-translation.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")
    init_db()


@pytest.mark.asyncio
async def test_codex_cli_translation_provider_returns_translated_content():
    class FakeClient:
        async def run_json(self, *, system_prompt, user_prompt, output_schema, model):
            return {"content": {"headline": "진입 근거가 명확합니다.", "riskLevel": "MEDIUM"}}

    provider = CodexCliJSONTranslationProvider(client=FakeClient(), model="gpt-translation")

    translated = await provider.translate_json(
        payload={"headline": "Entry case is clear.", "riskLevel": "MEDIUM"},
        target_locale="ko",
    )

    assert translated == {"headline": "진입 근거가 명확합니다.", "riskLevel": "MEDIUM"}


def test_codex_cli_translation_schema_is_strict_and_matches_payload_shape():
    schema = translation_output_schema(
        {
            "headline": "Hold the position.",
            "review": {
                "confidence": 81,
                "actions": [{"type": "HOLD", "price": None, "reason": "Wait for confirmation."}],
            },
        }
    )

    assert schema["additionalProperties"] is False
    assert schema["required"] == ["content"]
    content = schema["properties"]["content"]
    assert content["additionalProperties"] is False
    assert set(content["required"]) == {"headline", "review"}
    action = content["properties"]["review"]["properties"]["actions"]["items"]
    assert action["additionalProperties"] is False
    assert set(action["required"]) == {"type", "price", "reason"}
    assert action["properties"]["price"] == {"type": "null"}


@pytest.mark.asyncio
async def test_fanout_translation_uses_codex_cli_without_openai_key(temp_db):
    class FakeProvider:
        name = "codex_cli"
        model = "gpt-translation"

        async def translate_json(self, *, payload, target_locale):
            return {**payload, "headline": "CLI 번역 성공"}

    settings = Settings(
        openai_api_key="",
        ai_translation_enabled=True,
        ai_translation_provider="codex_cli",
        ai_translation_target_locales=["ko"],
    )
    with session_scope() as db:
        await fanout_ai_translations(
            db,
            settings=settings,
            source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
            source_id=77,
            payload={"headline": "CLI translation works", "riskLevel": "MEDIUM"},
            provider=FakeProvider(),
        )
        record = db.query(AITranslationCacheRecord).one()
        assert record.status == "ok"
        assert record.provider == "codex_cli"
        assert "CLI 번역 성공" in record.payload_json


@pytest.mark.asyncio
async def test_codex_cli_status_feed_generator_returns_status_result():
    class FakeClient:
        async def run_json(self, *, system_prompt, user_prompt, output_schema, model):
            return {
                "headline": "I am in, risk first",
                "message": "I got the fill and now I am managing the stop before thinking about the target.",
                "mood": "focused",
                "stance": "managing",
                "watch": "ignored",
            }

    generator = CodexCliTraderStatusFeedGenerator(client=FakeClient(), model="gpt-feed")
    request = StatusFeedRequest(
        trader=StatusFeedPersona(
            traderId="trend-sentinel",
            name="Trend Sentinel",
            alias="Trend Desk",
            voice="patient trend trader",
            cadence="compact",
            avoid="report language",
        ),
        symbol="BTCUSDT",
        stateKey="position_entry",
        eventType="order_filled",
        generatedAt=datetime(2026, 6, 27, 1, 0, tzinfo=timezone.utc),
        trigger={"entry": 60000},
        context={},
    )

    result = await generator.generate(request)

    assert result.provider == "codex_cli"
    assert result.model == "gpt-feed"
    assert result.headline == "I am in, risk first"
    assert result.watch == ""


def test_codex_cli_auxiliary_providers_do_not_use_openai_without_explicit_fallback():
    settings = Settings(
        openai_api_key="present-but-disabled",
        ai_translation_provider="codex_cli",
        trader_status_feed_provider="codex_cli",
        codex_cli_fallback_provider="codex_cli",
    )

    translation_provider = get_translation_provider(settings)
    status_feed_generator = get_status_feed_generator(settings)

    assert isinstance(translation_provider, CodexCliJSONTranslationProvider)
    assert not isinstance(translation_provider, FallbackTranslationProvider)
    assert isinstance(status_feed_generator, CodexCliTraderStatusFeedGenerator)
    assert not isinstance(status_feed_generator, FallbackTraderStatusFeedGenerator)


def test_codex_cli_auxiliary_providers_allow_explicit_openai_fallback():
    settings = Settings(
        openai_api_key="explicit-fallback-key",
        ai_translation_provider="codex_cli",
        trader_status_feed_provider="codex_cli",
        codex_cli_fallback_provider="openai",
    )

    assert isinstance(get_translation_provider(settings), FallbackTranslationProvider)
    assert isinstance(get_status_feed_generator(settings), FallbackTraderStatusFeedGenerator)
