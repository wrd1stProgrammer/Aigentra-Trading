import asyncio
import json
from decimal import Decimal

import pytest

from app.ai.translation_cache import (
    ensure_localized_payload_for_source,
    fanout_ai_translations,
    localized_payload_for_source,
    merge_validated_translation,
    merge_translation_overlay,
    normalize_status_feed_translation,
    stable_source_hash,
    validate_status_feed_translation_semantics,
    TranslationShapeError,
)
from app.ai.translation_contract import translation_request_payload
from app.ai.translation_provider import translation_style_contract_for_payload
from app.core.config import Settings
from app.db import AIReviewRecord, AITranslationCacheRecord, PaperPositionRecord, init_db, reset_db_engine, session_scope
from app.locales import AI_TRANSLATION_SOURCE_AI_REVIEW, AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT, AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT, AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
from app.main import record_review_translation_ready, serialize_record_for_ui, trader_detail_translations_ready


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
        self.open_transactions: list[bool] = []

    async def translate_json(self, *, payload: dict, target_locale: str) -> dict:
        self.saw_open_transaction = self.db.in_transaction()
        self.open_transactions.append(self.saw_open_transaction)
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


def test_embedded_review_locale_is_returned_without_translation_cache(temp_db):
    payload = {
        "decision": "HOLD",
        "sourceLocale": "en",
        "structuredReview": {"headline": "Hold the LONG.", "action": "Keep the stop protected."},
        "rationale": "The pullback thesis remains intact.",
        "translations": {
            "ko": {
                "structuredReview": {"headline": "롱을 유지합니다.", "action": "손절 보호를 유지합니다."},
                "rationale": "눌림목 진입 논리가 유지되고 있습니다.",
            }
        },
    }

    with session_scope() as db:
        localized, meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
            source_id=991,
            payload=payload,
            locale="ko",
        )

        assert meta["status"] == "ok"
        assert meta["source"] == "embedded"
        assert localized["structuredReview"]["headline"] == "롱을 유지합니다."
        assert localized["rationale"] == "눌림목 진입 논리가 유지되고 있습니다."
        assert "translations" not in localized
        assert db.query(AITranslationCacheRecord).count() == 0


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


def test_localized_payload_uses_matching_source_locale_without_translation_cache(temp_db):
    entry_payload = {
        "sourceLocale": "ko",
        "decision": "ADJUST_AND_APPROVE",
        "approvalReason": "눌림 이후 추세가 회복되어 진입을 승인합니다.",
        "structuredReview": {
            "headline": "되돌림 확인 후 롱 진입이 유효합니다.",
            "action": "확인된 가격에서만 작게 진입합니다.",
        },
        "reviewFacts": [
            {"code": "trend_reclaim", "labelKey": "reviewFact.trendReclaim", "severity": "info"}
        ],
    }
    management_payload = {
        "event": {"eventType": "heartbeat", "reason": "정기 점검"},
        "review": {
            "sourceLocale": "ko",
            "decision": "HOLD",
            "rationale": "진입 근거가 아직 깨지지 않아 보유합니다.",
            "reviewFacts": [
                {"code": "still_valid", "labelKey": "reviewFact.stillValid", "severity": "info"}
            ],
        },
    }

    with session_scope() as db:
        localized_entry, entry_meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=501,
            payload=entry_payload,
            locale="ko",
        )
        localized_management, management_meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
            source_id=502,
            payload=management_payload,
            locale="ko",
        )

        assert localized_entry == entry_payload
        assert entry_meta["status"] == "canonical"
        assert entry_meta["locale"] == "ko"
        assert entry_meta["sourceLocale"] == "ko"
        assert localized_management == management_payload
        assert management_meta["status"] == "canonical"
        assert management_meta["locale"] == "ko"
        assert management_meta["sourceLocale"] == "ko"
        assert db.query(AITranslationCacheRecord).count() == 0


def test_translation_request_payload_preserves_source_locale():
    request = translation_request_payload(
        {
            "sourceLocale": "ko",
            "approvalReason": "한국어 원문 승인 사유",
            "reviewFacts": [
                {"code": "trend_reclaim", "labelKey": "reviewFact.trendReclaim", "severity": "info"}
            ],
        },
        "en",
    )

    assert request["sourceLocale"] == "ko"
    assert request["targetLocale"] == "en"
    assert request["content"]["reviewFacts"][0]["labelKey"] == "reviewFact.trendReclaim"


def test_review_translation_ready_uses_source_locale_instead_of_fixed_english(temp_db):
    payload = {
        "sourceLocale": "ko",
        "approvalReason": "한국어 원문 승인 사유",
        "structuredReview": {
            "headline": "한국어 진입 근거",
            "action": "확인된 가격에서만 진입합니다.",
        },
    }
    review = AIReviewRecord(
        id=8801,
        symbol="BTCUSDT",
        trader_id="trend-sentinel",
        status="ok",
        fallback=False,
        payload_json=json.dumps(payload),
    )

    with session_scope() as db:
        assert record_review_translation_ready(db, review, locale="ko") is True
        assert record_review_translation_ready(db, review, locale="en") is False


def test_trader_detail_translation_readiness_checks_english_against_source_locale(temp_db):
    ai_review_payload = {
        "sourceLocale": "ko",
        "approvalReason": "한국어 원문 승인 사유",
        "structuredReview": {
            "headline": "한국어 진입 근거",
            "action": "확인된 가격에서만 진입합니다.",
        },
    }

    with session_scope() as db:
        db.add(
            PaperPositionRecord(
                id=8802,
                symbol="BTCUSDT",
                trader_id="trend-sentinel",
                status="open",
                side="long",
                quantity=Decimal("0.1"),
                entry_price=Decimal("60000"),
                leverage=Decimal("5"),
                notional=Decimal("6000"),
                margin=Decimal("1200"),
                payload_json=json.dumps({"aiReviewId": 9901, "aiReview": ai_review_payload}),
            )
        )
        db.commit()

        assert trader_detail_translations_ready(
            db,
            trader_id="trend-sentinel",
            clean_symbol="BTCUSDT",
            locale="ko",
            reviews_limit=10,
            events_limit=10,
        ) is True
        assert trader_detail_translations_ready(
            db,
            trader_id="trend-sentinel",
            clean_symbol="BTCUSDT",
            locale="en",
            reviews_limit=10,
            events_limit=10,
        ) is False


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


def test_background_fanout_commits_each_locale_before_next_provider_call(temp_db):
    payload = {"decision": "HOLD", "approvalReason": "Wait for more data."}
    settings = Settings(
        openai_api_key="test-key",
        ai_translation_enabled=True,
        ai_translation_target_locales=["ko", "ru"],
        openai_translation_model="gpt-4.1-nano",
    )

    with session_scope() as db:
        provider = TransactionObservingTranslationProvider(db)

        asyncio.run(
            fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=708,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="range-maker",
                provider=provider,
                release_clean_transaction_before_call=True,
            )
        )

        assert provider.open_transactions == [False, False]
        assert db.query(AITranslationCacheRecord).count() == 2


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


@pytest.mark.parametrize("requested_locale", ["ko", "ru"])
def test_localized_payload_does_not_reuse_latest_source_translation_after_payload_shape_change(
    temp_db,
    requested_locale,
):
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
                settings=Settings(
                    openai_api_key="test-key",
                    ai_translation_enabled=True,
                    ai_translation_target_locales=[requested_locale],
                ),
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
            locale=requested_locale,
        )

        assert meta["status"] == "missing"
        assert meta["staleSourceHash"] is True
        assert localized["approvalReason"] == changed_payload["approvalReason"]
        assert localized["structuredReview"]["headline"] == changed_payload["structuredReview"]["headline"]
        assert localized["reviewFacts"] == changed_payload["reviewFacts"]


def test_ensure_localized_payload_refreshes_stale_source_translation(temp_db):
    payload = {
        "decision": "HOLD",
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
                source_id=809,
                payload=payload,
                symbol="BTCUSDT",
                trader_id="atr-trail-commander",
                provider=FakeTranslationProvider(),
            )
        )
        refresh_provider = FakeTranslationProvider()

        localized, meta = asyncio.run(
            ensure_localized_payload_for_source(
                db,
                settings=Settings(openai_api_key="test-key", ai_translation_enabled=True, ai_translation_target_locales=["ko"]),
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=809,
                payload=changed_payload,
                locale="ko",
                symbol="BTCUSDT",
                trader_id="atr-trail-commander",
                provider=refresh_provider,
            )
        )

        assert refresh_provider.calls == ["ko"]
        assert meta["status"] == "ok"
        assert "staleSourceHash" not in meta
        assert localized["approvalReason"] == "ko: translated approval reason"
        assert localized["structuredReview"]["headline"] == "ko: translated headline"
        assert localized["reviewFacts"] == changed_payload["reviewFacts"]


def test_ensure_localized_payload_uses_codex_provider_without_openai_key(temp_db):
    payload = {
        "event": {"reason": "Heartbeat review."},
        "review": {
            "decision": "HOLD",
            "rationale": "Hold while the trend anchor is intact.",
            "structuredReview": {
                "headline": "Hold the long while the ATR trail is intact.",
                "action": "Do not close before the trail fails.",
            },
        },
        "appliedActions": [],
    }
    provider = PartialTranslationProvider()

    with session_scope() as db:
        localized, meta = asyncio.run(
            ensure_localized_payload_for_source(
                db,
                settings=Settings(
                    openai_api_key="",
                    ai_translation_provider="codex_cli",
                    ai_translation_enabled=True,
                    ai_translation_target_locales=["ko"],
                ),
                source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
                source_id=910,
                payload=payload,
                locale="ko",
                symbol="BTCUSDT",
                trader_id="atr-trail-commander",
                provider=provider,
            )
        )

        assert provider.calls == ["ko"]
        assert meta["status"] == "ok"
        assert localized["event"]["reason"] == "ko: 이벤트 사유"
        assert localized["review"]["rationale"] == "ko: 포지션 유지"


def test_stale_embedded_ai_review_translation_preserves_english_structured_review(temp_db):
    # Given: an open position embeds a newer English AI review, but only an older Korean translation is cached.
    review_payload = {
        "decision": "ADJUST_AND_APPROVE",
        "approvalReason": (
            "ADJUST_AND_APPROVE: Channel Cartographer can enter this SHORT as BTC retests the upper-channel probe."
        ),
        "structuredReview": {
            "verdict": "ADJUST_AND_APPROVE",
            "headline": "Channel Cartographer can enter this SHORT as BTC retests the upper-channel probe.",
            "action": "Take the SHORT only with reduced risk and strict invalidation.",
            "keyReasons": ["The fee-aware reward-to-risk clears the minimum."],
            "risks": ["The last two closed trades were SHORT stopouts."],
            "watchConditions": ["Exit if price closes above the channel boundary."],
            "managerNote": "Treat the boundary as fragile.",
        },
    }
    stale_ko_payload = {
        "approvalReason": (
            "ADJUST_AND_APPROVE: 채널 지도자는 BTC가 상단 채널을 다시 테스트하는 동안 축소된 위험으로만 숏 진입할 수 있습니다."
        ),
        "structuredReview": {
            "verdict": "ADJUST_AND_APPROVE",
            "headline": "채널 지도자는 상단 채널 재테스트에서 축소된 숏 진입만 허용됩니다.",
            "action": "위험을 줄이고 무효화 기준을 엄격히 유지하세요.",
            "keyReasons": ["수수료 반영 손익비가 최소 기준을 넘습니다."],
            "risks": ["최근 두 번의 숏 거래가 손절로 끝났습니다."],
            "watchConditions": ["가격이 채널 경계 위에서 마감하면 종료하세요."],
            "managerNote": "경계는 약하다고 보고 다루세요.",
        },
    }

    with session_scope() as db:
        review = AIReviewRecord(
            symbol="BTCUSDT",
            trader_id="channel-rider",
            status="ok",
            decision="ADJUST_AND_APPROVE",
            payload_json=json.dumps(review_payload),
        )
        db.add(review)
        db.flush()
        db.add(
            AITranslationCacheRecord(
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=review.id,
                source_hash="older-review-shape",
                locale="ko",
                status="ok",
                payload_json=json.dumps(stale_ko_payload, ensure_ascii=False),
            )
        )
        position = PaperPositionRecord(
            symbol="BTCUSDT",
            trader_id="channel-rider",
            status="open",
            side="short",
            quantity=Decimal("0.01"),
            entry_price=Decimal("60025.6"),
            leverage=Decimal("5"),
            notional=Decimal("600.256"),
            margin=Decimal("120.0512"),
            payload_json=json.dumps(
                {
                    "aiReviewId": review.id,
                    "aiReview": review_payload,
                    "aiApprovalReason": review_payload["approvalReason"],
                    "aiStructuredReview": review_payload["structuredReview"],
                }
            ),
        )
        db.add(position)
        db.flush()

        # When: the Korean trader detail response is serialized.
        data = serialize_record_for_ui(position, include_payload=True, locale="ko")

        payload = data["payload"]
        assert data["translation"]["embeddedAiReview"]["staleSourceHash"] is True
        assert data["translation"]["embeddedAiReview"]["status"] == "missing"
        assert "canonicalStructuredReview" not in data["translation"]["embeddedAiReview"]
        assert payload["aiApprovalReason"] == review_payload["approvalReason"]
        assert payload["aiReview"]["approvalReason"] == review_payload["approvalReason"]
        assert payload["aiStructuredReview"]["headline"] == review_payload["structuredReview"]["headline"]
        assert payload["aiReview"]["structuredReview"]["headline"] == review_payload["structuredReview"]["headline"]


def test_embedded_ai_review_translation_failure_preserves_english_structured_review(temp_db):
    review_payload = {
        "decision": "ADJUST_AND_APPROVE",
        "approvalReason": "ATR Trail Boss can enter the LONG with reduced risk.",
        "structuredReview": {
            "verdict": "ADJUST_AND_APPROVE",
            "headline": "ATR continuation LONG is valid with reduced size.",
            "action": "Keep the 5x LONG and respect the invalidation stop.",
            "keyReasons": ["1h and 4h buyers are still holding trend support."],
            "risks": ["A late long can fail if BTC loses the breakout level."],
            "watchConditions": ["Do not widen the stop if the breakout fails."],
            "managerNote": "This is continuation, not a mean-reversion entry.",
        },
    }

    with session_scope() as db:
        review = AIReviewRecord(
            symbol="BTCUSDT",
            trader_id="atr-trail-commander",
            status="ok",
            decision="ADJUST_AND_APPROVE",
            payload_json=json.dumps(review_payload),
        )
        db.add(review)
        db.flush()
        db.add(
            AITranslationCacheRecord(
                source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
                source_id=review.id,
                source_hash=stable_source_hash(review_payload),
                locale="ko",
                status="fallback",
                payload_json=json.dumps(review_payload),
                error_message="translation provider failed",
            )
        )
        position = PaperPositionRecord(
            symbol="BTCUSDT",
            trader_id="atr-trail-commander",
            status="open",
            side="long",
            quantity=Decimal("0.166"),
            entry_price=Decimal("61984.8"),
            leverage=Decimal("5"),
            notional=Decimal("10289.4768"),
            margin=Decimal("2057.89536"),
            payload_json=json.dumps(
                {
                    "aiReviewId": review.id,
                    "aiReview": review_payload,
                    "aiApprovalReason": review_payload["approvalReason"],
                    "aiStructuredReview": review_payload["structuredReview"],
                }
            ),
        )
        db.add(position)
        db.flush()

        data = serialize_record_for_ui(position, include_payload=True, locale="ko")

        payload = data["payload"]
        assert data["translation"]["embeddedAiReview"]["status"] == "fallback"
        assert payload["aiApprovalReason"] == review_payload["approvalReason"]
        assert payload["aiReview"]["structuredReview"]["headline"] == review_payload["structuredReview"]["headline"]
        assert payload["aiStructuredReview"]["headline"] == review_payload["structuredReview"]["headline"]


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
            "sourceLocale": "en",
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
    assert "current price is X, entry is Y -> 현재가 X, 진입가 Y" in term_rules
    assert "R progress -> R 기준 이동" in term_rules
    assert "higher timeframe / HTF -> 상위 시간대" in term_rules
    assert "reward-to-risk -> 손익비" in term_rules
    assert "confirmation sizing -> 확인 후 추가 진입 규모" in term_rules
    assert "thesis -> 논리/가설" in term_rules
    assert "이익이 확정적" in forbidden
    assert "진입 대비" in forbidden
    assert "보상대위험비" in forbidden
    assert "확인 크기 지연" in forbidden
    assert "진행률" in forbidden
    assert "HTF 연속 SHORT -> 상위 시간대 하락 추세를 따라가는 숏" in examples
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
    assert "LONG" not in contract["preserveTokens"]
    assert "SHORT" not in contract["preserveTokens"]
    assert "LONG prose -> 롱" in contract["koreanTermRules"]
    assert "SHORT prose -> 숏" in contract["koreanTermRules"]
    assert "I'm flat -> 포지션 없이 대기 중" in contract["koreanTermRules"]
    assert "close SHORT -> 숏 청산" in contract["koreanTermRules"]


def test_trader_status_feed_semantic_context_is_protected_as_a_whole():
    original = {
        "headline": "Short remains open",
        "message": "I am protecting the short.",
        "semanticContext": {
            "side": "short",
            "strategyFamily": "TREND_FOLLOW",
            "holdingHorizon": "POSITION",
            "lifecycleAction": "hold",
            "entryPrice": 64_000,
            "stopLossPrice": 65_000,
        },
    }
    malicious = {
        "headline": "롱 유지",
        "message": "롱을 보호합니다.",
        "semanticContext": {
            "side": "long",
            "strategyFamily": "MEAN_REVERSION",
            "holdingHorizon": "SCALP",
            "lifecycleAction": "open",
            "entryPrice": 1,
            "stopLossPrice": 2,
        },
    }

    merged = merge_translation_overlay(original, malicious)

    assert merged["semanticContext"] == original["semanticContext"]


def test_korean_status_feed_translation_normalizes_direction_terms_and_rejects_reversal():
    original = {
        "feedType": AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
        "headline": "SHORT still open",
        "message": "I'm flat after closing the SHORT.",
        "semanticContext": {"side": "short", "lifecycleAction": "close"},
    }
    normalized = normalize_status_feed_translation(
        original,
        {
            **original,
            "headline": "SHORT 유지 중이에요",
            "message": "SHORT 청산 후 횡보 중이에요",
        },
        locale="ko",
    )

    assert normalized["headline"] == "숏 유지 중이에요"
    assert normalized["message"] == "숏 청산 후 포지션 없이 대기 중이에요"
    with pytest.raises(TranslationShapeError):
        validate_status_feed_translation_semantics(
            original,
            {**normalized, "headline": "롱 유지 중이에요", "message": "롱을 더 들고 있어요"},
            locale="ko",
        )
    with pytest.raises(TranslationShapeError):
        validate_status_feed_translation_semantics(
            original,
            {**normalized, "headline": "롱 진입 후 숏 청산", "message": "매수로 숏을 닫았어요"},
            locale="ko",
        )


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
