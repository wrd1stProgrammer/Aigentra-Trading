import asyncio

import pytest

from app.ai.translation_cache import fanout_ai_translations, localized_payload_for_source, merge_validated_translation
from app.ai.translation_provider import translation_style_contract_for_payload
from app.core.config import Settings
from app.db import AITranslationCacheRecord, init_db, reset_db_engine, session_scope
from app.locales import AI_TRANSLATION_SOURCE_AI_REVIEW, AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT, AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT, AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED


class FakeTranslationProvider:
    name = "openai"
    model = "fake-translation"

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def translate_json(self, *, payload: dict, target_locale: str) -> dict:
        self.calls.append(target_locale)
        translated = dict(payload)
        translated["approvalReason"] = f"{target_locale}: translated approval reason"
        translated["structuredReview"] = {
            **payload["structuredReview"],
            "headline": f"{target_locale}: translated headline",
            "action": f"{target_locale}: translated action",
        }
        return translated


class BannedTermTranslationProvider:
    name = "openai"
    model = "fake-translation"

    async def translate_json(self, *, payload: dict, target_locale: str) -> dict:
        translated = dict(payload)
        translated["summary"] = "페이퍼 트레이딩 표현이 번역에서 다시 들어오면 안 됩니다."
        translated["dataQuality"] = ["paper trading wording should be scrubbed."]
        return translated


class PartialTranslationProvider:
    name = "openai"
    model = "fake-translation"

    def __init__(self) -> None:
        self.payloads: list[dict] = []
        self.calls: list[str] = []

    async def translate_json(self, *, payload: dict, target_locale: str) -> dict:
        self.calls.append(target_locale)
        self.payloads.append(payload)
        if "review" in payload:
            return {
                "event": {"reason": f"{target_locale}: 이벤트 사유"},
                "review": {"rationale": f"{target_locale}: 포지션 유지"},
                "appliedActions": payload.get("appliedActions", []),
            }
        return {"approvalReason": f"{target_locale}: 승인 사유"}


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "translation-cache.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    try:
        yield db_path
    finally:
        reset_db_engine("sqlite:///:memory:")
        init_db()


def test_merge_validated_translation_preserves_codes_and_numbers():
    original = {
        "decision": "APPROVE",
        "confidence": 82,
        "approvalReason": "Entry is valid.",
        "structuredReview": {"headline": "Hold the setup.", "riskLevel": "MEDIUM"},
    }
    translated = {
        "decision": "APROBAR",
        "confidence": 99,
        "approvalReason": "La entrada es válida.",
        "structuredReview": {"headline": "Mantén la configuración.", "riskLevel": "ALTO"},
    }

    merged = merge_validated_translation(original, translated)

    assert merged["decision"] == "APPROVE"
    assert merged["confidence"] == 82
    assert merged["approvalReason"] == "La entrada es válida."
    assert merged["structuredReview"]["headline"] == "Mantén la configuración."
    assert merged["structuredReview"]["riskLevel"] == "MEDIUM"


def test_merge_validated_translation_keeps_missing_optional_fields():
    original = {
        "decision": "REJECT",
        "approvalReason": "Do not enter.",
        "userSummary": None,
        "structuredReview": {"headline": "Risk is too high.", "action": "Wait."},
    }
    translated = {
        "decision": "거절",
        "approvalReason": "진입하지 않습니다.",
        "structuredReview": {"headline": "위험이 너무 큽니다."},
    }

    merged = merge_validated_translation(original, translated)

    assert merged["decision"] == "REJECT"
    assert merged["approvalReason"] == "진입하지 않습니다."
    assert merged["userSummary"] is None
    assert merged["structuredReview"]["headline"] == "위험이 너무 큽니다."
    assert merged["structuredReview"]["action"] == "Wait."


def test_merge_validated_translation_allows_structured_action_lines():
    original = {
        "decision": "HOLD",
        "structuredReview": {
            "headline": "Stay short.",
            "action": "['- Keep the short open.', '- Do not widen the stop.']",
        },
    }
    translated = {
        "decision": "유지",
        "structuredReview": {
            "headline": "숏은 유지합니다.",
            "action": ["- 숏 포지션은 유지하세요.", "- 손절을 넓히지 마세요."],
        },
    }

    merged = merge_validated_translation(original, translated)

    assert merged["decision"] == "HOLD"
    assert merged["structuredReview"]["headline"] == "숏은 유지합니다."
    assert merged["structuredReview"]["action"] == ["- 숏 포지션은 유지하세요.", "- 손절을 넓히지 마세요."]


def test_fanout_translations_are_cached_and_reused(temp_db):
    payload = {
        "decision": "ADJUST_AND_APPROVE",
        "confidence": 76,
        "approvalReason": "The setup is valid after reducing size.",
        "structuredReview": {
            "headline": "Approve with a smaller position.",
            "action": "Reduce size and keep a fast invalidation rule.",
            "riskLevel": "MEDIUM",
        },
    }
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=True,
        ai_translation_target_locales=["ko", "ru"],
        openai_translation_model="gpt-4.1-nano",
    )
    provider = FakeTranslationProvider()

    with session_scope() as db:
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=101,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="range-maker",
                provider=provider,
            )
        )
        ko_payload, ko_meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=101,
            payload=payload,
            locale="ko",
        )
        assert ko_meta["status"] == "ok"
        assert ko_payload["approvalReason"] == "ko: translated approval reason"
        assert ko_payload["decision"] == "ADJUST_AND_APPROVE"
        assert ko_payload["confidence"] == 76
        assert db.query(AITranslationCacheRecord).count() == 2

        asyncio.run(
            fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=202,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="range-maker",
                provider=provider,
            )
        )
        assert provider.calls == ["ko", "ru"]
        assert db.query(AITranslationCacheRecord).count() == 4


def test_fanout_translation_falls_back_without_openai_key(temp_db):
    payload = {"decision": "HOLD", "approvalReason": "Wait for more data."}
    settings = Settings(openai_api_key="", ai_translation_enabled=True, ai_translation_target_locales=["ko"])

    with session_scope() as db:
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=303,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="session-raider",
            )
        )
        localized, meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=303,
            payload=payload,
            locale="ko",
        )
        assert meta["status"] == "fallback"
        assert localized == payload


def test_fallback_translation_records_are_retried(temp_db):
    payload = {"decision": "HOLD", "approvalReason": "Keep waiting."}

    with session_scope() as db:
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=Settings(openai_api_key="", ai_translation_enabled=True, ai_translation_target_locales=["ko"]),
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=606,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="session-raider",
            )
        )
        _, fallback_meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=606,
            payload=payload,
            locale="ko",
        )
        assert fallback_meta["status"] == "fallback"

        provider = PartialTranslationProvider()
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=Settings(openai_api_key="test-key", ai_translation_enabled=True, ai_translation_target_locales=["ko"]),
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=606,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="session-raider",
                provider=provider,
            )
        )
        localized, meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=606,
            payload=payload,
            locale="ko",
        )

        assert provider.calls == ["ko"]
        assert meta["status"] == "ok"
        assert localized["approvalReason"] == "ko: 승인 사유"


def test_management_review_translation_uses_partial_overlay(temp_db):
    payload = {
        "event": {"reason": "Heartbeat review."},
        "exposure": {"symbol": "BTCUSDT", "plannedMargin": 2500, "entryReason": "Do not translate this large object."},
        "review": {"decision": "HOLD", "rationale": "Hold the short."},
        "appliedActions": [],
    }
    provider = PartialTranslationProvider()

    with session_scope() as db:
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=Settings(openai_api_key="test-key", ai_translation_enabled=True, ai_translation_target_locales=["ko"]),
                source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
                source_id=707,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="session-raider",
                provider=provider,
            )
        )
        localized, meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
            source_id=707,
            payload=payload,
            locale="ko",
        )

        assert provider.payloads[0] == {
            "event": {"reason": "Heartbeat review."},
            "review": {"decision": "HOLD", "rationale": "Hold the short."},
            "appliedActions": [],
        }
        assert meta["status"] == "ok"
        assert localized["event"]["reason"] == "ko: 이벤트 사유"
        assert localized["review"]["decision"] == "HOLD"
        assert localized["review"]["rationale"] == "ko: 포지션 유지"
        assert localized["exposure"] == payload["exposure"]


def test_league_sentiment_translation_scrubs_banned_terms(temp_db):
    payload = {
        "bias": "MIXED",
        "summary": "Use simulation wording only.",
        "dataQuality": ["Simulation context only."],
        "sourceCounts": {"activePositions": 1},
    }
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=True,
        ai_translation_target_locales=["ko"],
        openai_translation_model="gpt-4.1-nano",
    )

    with session_scope() as db:
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
                source_id=404,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="aigentra-opinion",
                provider=BannedTermTranslationProvider(),
            )
        )
        localized, meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
            source_id=404,
            payload=payload,
            locale="ko",
        )
        record = db.query(AITranslationCacheRecord).one()

        assert meta["status"] == "ok"
        assert "페이퍼 트레이딩" not in str(localized)
        assert "paper trading" not in str(localized).lower()
        assert "페이퍼 트레이딩" not in str(record.payload_json)
        assert "paper trading" not in str(record.payload_json).lower()


def test_trader_status_feed_translation_uses_thread_style_contract():
    payload = {
        "feedType": AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
        "headline": "Short closed clean",
        "message": "I took the profit and stepped aside. Volume is the part I care about now.",
        "watch": "",
        "stateKey": "position_closed",
    }

    contract = translation_style_contract_for_payload(payload, "ko")

    assert contract["contentKind"] == "trader_status_feed"
    assert contract["tone"] == "casual_trader_thread"
    assert "next_watch_label" in contract["forbiddenPhrases"]
    assert "journalist_summary" in contract["forbiddenStyles"]
    assert "다음 확인" in contract["avoidExamples"]
