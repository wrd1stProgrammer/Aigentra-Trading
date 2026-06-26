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
        translated["risks"] = ["paper trading wording should be scrubbed."]
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


class TransactionObservingTranslationProvider:
    name = "openai"
    model = "fake-translation"

    def __init__(self, db) -> None:
        self.db = db
        self.saw_open_transaction = False

    async def translate_json(self, *, payload: dict, target_locale: str) -> dict:
        self.saw_open_transaction = self.db.in_transaction()
        translated = dict(payload)
        translated["approvalReason"] = f"{target_locale}: translated approval reason"
        return translated


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


def test_background_fanout_releases_clean_transaction_before_provider_call(temp_db):
    payload = {"decision": "HOLD", "approvalReason": "Wait for more data."}
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=True,
        ai_translation_target_locales=["ko"],
        openai_translation_model="gpt-4.1-nano",
    )

    with session_scope() as db:
        db.query(AITranslationCacheRecord).count()
        assert db.in_transaction()
        provider = TransactionObservingTranslationProvider(db)

        asyncio.run(
            fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=707,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="range-maker",
                provider=provider,
                release_clean_transaction_before_call=True,
            )
        )

        assert provider.saw_open_transaction is False


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


def test_localized_payload_reuses_latest_source_translation_after_payload_shape_change(temp_db):
    payload = {
        "decision": "HOLD",
        "confidence": 72,
        "approvalReason": "Keep the short open while the invalidation level holds.",
        "structuredReview": {
            "headline": "Short is still valid.",
            "action": "Keep watching the invalidation trigger.",
            "riskLevel": "MEDIUM",
        },
    }
    changed_payload = {
        **payload,
        "reviewFacts": [
            {"code": "entryGeometryChecked", "labelKey": "reviewFact.entryGeometryChecked", "severity": "info"}
        ],
    }

    with session_scope() as db:
        asyncio.run(
            fanout_ai_translations(
                db,
                settings=Settings(openai_api_key="test-key", ai_translation_enabled=True, ai_translation_target_locales=["ko"]),
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=808,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="imbalance-hunter",
                provider=FakeTranslationProvider(),
            )
        )

        localized, meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=808,
            payload=changed_payload,
            locale="ko",
        )

        assert meta["status"] == "ok"
        assert meta["staleSourceHash"] is True
        assert localized["approvalReason"] == "ko: translated approval reason"
        assert localized["structuredReview"]["headline"] == "ko: translated headline"
        assert localized["reviewFacts"] == changed_payload["reviewFacts"]


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
        "risks": ["Simulation context only."],
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


def test_ai_review_translation_uses_user_facing_review_style_contract():
    payload = {
        "decision": "HOLD",
        "structuredReview": {
            "headline": "SHORT is under pressure at 60553.9 against entry 59681.6.",
            "action": "This review is tied to the latest event: periodic agent review.",
            "managerNote": "Previous wording should not override the current risk box.",
        },
        "rationale": "Hold while watching the next invalidation trigger.",
    }

    contract = translation_style_contract_for_payload(payload, "ko")

    assert contract["contentKind"] == "ai_trading_review"
    assert contract["tone"] == "plain_user_trading_briefing"
    assert "internal_event_log" in contract["forbiddenStyles"]
    assert "Latest event" in contract["avoidExamples"]
    assert "이 검토는 최신 이벤트" in contract["avoidExamples"]
    assert "고차원 손상" in contract["avoidExamples"]


def test_ai_review_translation_contract_preserves_korean_trading_semantics():
    payload = {
        "decision": "HOLD",
        "structuredReview": {
            "headline": "SHORT has unrealized profit and the stop is now at breakeven.",
            "action": "Keep the position open while loss risk is controlled.",
        },
        "rationale": "The thesis remains valid unless price reclaims the stop.",
    }

    contract = translation_style_contract_for_payload(payload, "ko")
    term_rules = " ".join(contract["koreanTermRules"])
    forbidden = " ".join(contract["forbiddenPhrases"])
    examples = " ".join(contract["avoidExamples"])

    assert "unrealized profit -> 미실현 이익" in term_rules
    assert "breakeven stop -> 본절 손절" in term_rules
    assert "stop loss -> 손절가/손절선" in term_rules
    assert "thesis -> 논리/가설" in term_rules
    assert "이익이 확정적" in forbidden
    assert "정지 손실" in forbidden
    assert "손실 제한" in forbidden
    assert "하락 위험" in forbidden
    assert "세타" in forbidden
    assert "locked in profit -> 수익 확정이 아니라 손실 위험을 줄인 상태" in examples


def test_trader_status_feed_translation_contract_blocks_mixed_language_and_boilerplate():
    payload = {
        "feedType": AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
        "headline": "Long still open",
        "message": "Price remains above the stop and I am waiting.",
        "watch": "",
        "stateKey": "position_entry",
    }

    contract = translation_style_contract_for_payload(payload, "ko")

    assert contract["languagePolicy"] == "korean_first_no_mixed_prose"
    assert "시장 상황은 지지적" in contract["avoidExamples"]
    assert "무효 신호는 감지되지 않음" in contract["avoidExamples"]
    assert "Price remains" in contract["avoidExamples"]
    assert "LONG" in contract["preserveTokens"]
    assert "SHORT" in contract["preserveTokens"]


def test_non_korean_status_feed_translation_does_not_inherit_korean_language_policy():
    payload = {
        "feedType": AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
        "headline": "Short still open",
        "message": "Price remains under VWAP.",
        "watch": "",
        "stateKey": "position_entry",
    }

    contract = translation_style_contract_for_payload(payload, "pt-BR")

    assert contract["languagePolicy"] == "target_locale_first_no_mixed_source_prose"
    assert "시장 상황은 지지적" not in contract["avoidExamples"]
    assert "Next watch" in contract["avoidExamples"]
    assert "VWAP" in contract["preserveTokens"]
