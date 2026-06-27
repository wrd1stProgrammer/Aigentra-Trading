from datetime import datetime, timezone

import pytest

from app.ai.codex_translation_provider import CodexCliJSONTranslationProvider
from app.ai.translation_cache import fanout_ai_translations
from app.core.config import Settings
from app.db import AITranslationCacheRecord, init_db, reset_db_engine, session_scope
from app.locales import AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT
from app.trader_status_feed.generator import CodexCliTraderStatusFeedGenerator
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
