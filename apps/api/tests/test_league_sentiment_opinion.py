from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import anyio
import pytest
from fastapi.testclient import TestClient

from app.ai.anthropic_provider import league_sentiment_schema
from app.ai.base import BaseAIProvider, league_sentiment_prompt
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult
from app.ai.mock_provider import MockAIProvider
from app.db import (
    AIReviewRecord,
    AITranslationCacheRecord,
    LeagueSentimentOpinionRecord,
    MarketSnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradeEventRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.league_sentiment import (
    LEAGUE_SENTIMENT_BRIEFING_VERSION,
    build_league_sentiment_payload,
    get_or_create_league_sentiment_opinion,
    scrub_banned_opinion_terms,
    serialize_league_sentiment_record,
)
from app.main import app
from app.repositories import to_json


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "league-sentiment.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")
    init_db()


def seed_sentiment_context() -> None:
    with session_scope() as db:
        db.add_all(
            [
                PaperPositionRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="open",
                    side="long",
                    quantity=Decimal("0.12"),
                    entry_price=Decimal("64000"),
                    leverage=Decimal("5"),
                    notional=Decimal("7680"),
                    margin=Decimal("1536"),
                    unrealized_pnl=Decimal("42.5"),
                    take_profit_price=Decimal("65000"),
                    stop_loss_price=Decimal("63500"),
                    opened_at=datetime(2026, 6, 18, 8, 10, tzinfo=timezone.utc),
                ),
                PaperOrderRecord(
                    trader_id="session-raider",
                    symbol="BTCUSDT",
                    status="open",
                    side="short",
                    order_type="LIMIT",
                    quantity=Decimal("0.08"),
                    leverage=Decimal("6"),
                    limit_price=Decimal("63800"),
                    take_profit_price=Decimal("63200"),
                    stop_loss_price=Decimal("64100"),
                    submitted_at=datetime(2026, 6, 18, 8, 20, tzinfo=timezone.utc),
                ),
                PaperPositionRecord(
                    trader_id="liquidity-reaper",
                    symbol="BTCUSDT",
                    status="closed",
                    side="short",
                    quantity=Decimal("0.05"),
                    entry_price=Decimal("64600"),
                    leverage=Decimal("5"),
                    notional=Decimal("3230"),
                    margin=Decimal("646"),
                    realized_pnl=Decimal("18.2"),
                    close_reason="take_profit",
                    closed_at=datetime(2026, 6, 18, 7, 40, tzinfo=timezone.utc),
                ),
                TradeEventRecord(
                    trader_id="liquidity-reaper",
                    symbol="BTCUSDT",
                    event_type="take_profit",
                    price=Decimal("63200"),
                    quantity=Decimal("0.05"),
                    realized_pnl=Decimal("18.2"),
                    payload_json='{"side":"SHORT","reason":"TP reached"}',
                    created_at=datetime(2026, 6, 18, 7, 42, tzinfo=timezone.utc),
                ),
                AIReviewRecord(
                    trader_id="session-raider",
                    symbol="BTCUSDT",
                    status="ok",
                    provider="anthropic",
                    model="claude-haiku-4-5",
                    decision="ADJUST_AND_APPROVE",
                    confidence=78,
                    risk_level="MEDIUM",
                    payload_json='{"approvalReason":"세션 하단 돌파가 유효하지만 빠른 만료가 필요합니다.","structuredReview":{"headline":"짧은 숏 셋업은 가능하지만 빠르게 확인해야 합니다."}}',
                    created_at=datetime(2026, 6, 18, 8, 18, tzinfo=timezone.utc),
                ),
                PositionManagementReviewRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="ok",
                    phase="OPEN_POSITION",
                    provider="openai",
                    model="gpt-4.1-mini",
                    decision="HOLD",
                    confidence=82,
                    action_type="HOLD",
                    payload_json='{"review":{"structuredReview":{"headline":"범위 하단 롱 논리는 아직 유지됩니다.","action":"손절은 유지하고 1시간 종가를 확인하세요."},"rationale":"범위 하단 논리 유지"}}',
                    created_at=datetime(2026, 6, 18, 8, 30, tzinfo=timezone.utc),
                ),
            ]
        )


@pytest.mark.asyncio
async def test_league_sentiment_releases_read_transaction_before_provider(monkeypatch, temp_db):
    seed_sentiment_context()
    provider_transaction_states: list[bool] = []
    current_time = datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc)

    with session_scope() as db:
        class InspectingProvider:
            name = "mock"
            model = "mock-v1"
            fallback = False

            async def review_league_sentiment(self, payload):
                provider_transaction_states.append(db.in_transaction())
                return await MockAIProvider().review_league_sentiment(payload)

        monkeypatch.setattr(
            "app.league_sentiment.get_ai_provider",
            lambda settings, provider_name=None: InspectingProvider(),
        )
        from app.main import settings

        generated = await get_or_create_league_sentiment_opinion(
            db,
            symbol="BTCUSDT",
            locale="ko",
            settings=settings,
            now=current_time,
        )

    assert generated["status"] == "ok"
    assert provider_transaction_states == [False]


def seed_market_context() -> None:
    with session_scope() as db:
        db.add(
            MarketSnapshotRecord(
                symbol="BTCUSDT",
                status="ok",
                price=63377.7,
                payload_json=to_json(
                    {
                        "price": 63377.7,
                        "marketRegime": {"label": "retest compression", "bias": "upside_retest"},
                        "timeframes": {
                            "1h": {
                                "close": 63377.7,
                                "ema50": 62920.0,
                                "rsi14": 58.4,
                                "trend": "uptrend",
                            },
                            "4h": {
                                "close": 63377.7,
                                "ema50": 63180.0,
                                "rsi14": 54.2,
                                "trend": "range",
                            },
                        },
                    }
                ),
                created_at=datetime(2026, 6, 18, 8, 34, tzinfo=timezone.utc),
            )
        )


def league_sentiment_translations() -> dict[str, dict[str, Any]]:
    return {
        "en": {
            "confidenceReason": "Fresh exposure is split, so confidence stays capped.",
            "brief": {
                "conclusion": "BTC league pressure is mixed and needs confirmation.",
                "reason": "One active LONG and one pending SHORT keep the read balanced.",
                "watch": "Check the next 1H close and whether the pending SHORT fills.",
            },
            "headline": "BTC league pressure is mixed and needs confirmation.",
            "summary": "One active LONG and one pending SHORT keep the read balanced.",
            "keyDrivers": ["The active LONG has risk on while the pending SHORT is not confirmed exposure yet."],
            "risks": ["Counting pending entries as filled exposure can overstate direction."],
            "watchConditions": ["Watch the next 1H close and the pending SHORT fill status."],
            "action": "Check the next 1H close and whether the pending SHORT fills.",
            "longShortContext": "LONG exposure is active, but SHORT pressure is still pending.",
        },
        "ko": {
            "confidenceReason": "새 노출이 엇갈려 있어 신뢰도는 제한됩니다.",
            "brief": {
                "conclusion": "BTC 리그 압력은 혼조라 확인이 필요합니다.",
                "reason": "활성 LONG 1건과 진입 대기 SHORT 1건이 균형을 만듭니다.",
                "watch": "다음 1시간 종가와 대기 SHORT 체결 여부를 확인하세요.",
            },
            "headline": "BTC 리그 압력은 혼조라 확인이 필요합니다.",
            "summary": "활성 LONG 1건과 진입 대기 SHORT 1건이 균형을 만듭니다.",
            "keyDrivers": ["활성 LONG은 리스크가 걸려 있지만 대기 SHORT는 아직 확정 노출이 아닙니다."],
            "risks": ["진입 대기 주문을 체결 노출처럼 보면 방향성이 과장될 수 있습니다."],
            "watchConditions": ["다음 1시간 종가와 대기 SHORT 체결 여부를 확인하세요."],
            "action": "다음 1시간 종가와 대기 SHORT 체결 여부를 확인하세요.",
            "longShortContext": "LONG 노출은 활성 상태이고 SHORT 압력은 아직 대기 중입니다.",
        },
        "ru": {
            "confidenceReason": "Свежая экспозиция разделена, поэтому уверенность ограничена.",
            "brief": {
                "conclusion": "Давление лиги по BTC смешанное и требует подтверждения.",
                "reason": "Один активный LONG и один ожидающий SHORT удерживают баланс.",
                "watch": "Проверьте следующее закрытие 1H и исполнение ожидающего SHORT.",
            },
            "headline": "Давление лиги по BTC смешанное и требует подтверждения.",
            "summary": "Один активный LONG и один ожидающий SHORT удерживают баланс.",
            "keyDrivers": ["Активный LONG уже несет риск, а ожидающий SHORT еще не подтвержден."],
            "risks": ["Ожидающие входы могут преувеличить направление, если считать их исполненной экспозицией."],
            "watchConditions": ["Следите за закрытием 1H и статусом ожидающего SHORT."],
            "action": "Проверьте следующее закрытие 1H и исполнение ожидающего SHORT.",
            "longShortContext": "LONG экспозиция активна, а SHORT давление еще ожидает исполнения.",
        },
        "pt-BR": {
            "confidenceReason": "A exposição recente está dividida, então a confiança segue limitada.",
            "brief": {
                "conclusion": "A pressão da liga em BTC está mista e precisa de confirmação.",
                "reason": "Um LONG ativo e um SHORT pendente mantêm a leitura equilibrada.",
                "watch": "Confira o próximo fechamento de 1H e se o SHORT pendente executa.",
            },
            "headline": "A pressão da liga em BTC está mista e precisa de confirmação.",
            "summary": "Um LONG ativo e um SHORT pendente mantêm a leitura equilibrada.",
            "keyDrivers": ["O LONG ativo já tem risco, enquanto o SHORT pendente ainda não é exposição confirmada."],
            "risks": ["Ler entradas pendentes como exposição executada pode exagerar a direção."],
            "watchConditions": ["Observe o fechamento de 1H e o status do SHORT pendente."],
            "action": "Confira o próximo fechamento de 1H e se o SHORT pendente executa.",
            "longShortContext": "A exposição LONG está ativa, mas a pressão SHORT ainda está pendente.",
        },
        "tr": {
            "confidenceReason": "Yeni maruziyet bölünmüş olduğu için güven sınırlı kalıyor.",
            "brief": {
                "conclusion": "BTC lig baskısı karışık ve onay gerektiriyor.",
                "reason": "Bir aktif LONG ve bir bekleyen SHORT okumayı dengede tutuyor.",
                "watch": "Sonraki 1H kapanışını ve bekleyen SHORT emrinin gerçekleşip gerçekleşmediğini kontrol edin.",
            },
            "headline": "BTC lig baskısı karışık ve onay gerektiriyor.",
            "summary": "Bir aktif LONG ve bir bekleyen SHORT okumayı dengede tutuyor.",
            "keyDrivers": ["Aktif LONG risk taşıyor, bekleyen SHORT ise henüz doğrulanmış maruziyet değil."],
            "risks": ["Bekleyen girişleri gerçekleşmiş maruziyet gibi okumak yönü abartabilir."],
            "watchConditions": ["1H kapanışını ve bekleyen SHORT durumunu izleyin."],
            "action": "Sonraki 1H kapanışını ve bekleyen SHORT emrinin gerçekleşip gerçekleşmediğini kontrol edin.",
            "longShortContext": "LONG maruziyet aktif, SHORT baskısı ise hala beklemede.",
        },
    }


def test_league_sentiment_scrubs_awkward_user_facing_terms():
    payload = {
        "ko": "페이퍼 트레이딩은 노타시온과 stop zone을 봅니다. 모델 시뮬레이션은 약합니다.",
        "en": "paper trading notional and stop zone are what the desk says.",
    }

    scrubbed = scrub_banned_opinion_terms(payload)

    assert scrubbed["ko"] == "Aigentra 리그는 노출과 무효화 구역을 봅니다. Aigentra 리그 의견은 약합니다."
    assert scrubbed["en"] == "Aigentra league exposure and invalidation area are what the league read."
    assert "페이퍼" not in str(scrubbed)
    assert "시뮬레이션" not in str(scrubbed)
    assert "notional" not in str(scrubbed).lower()
    assert "stop zone" not in str(scrubbed).lower()


def test_league_sentiment_opinion_generates_one_record_per_utc_hour(temp_db, monkeypatch):
    seed_sentiment_context()
    calls: list[Any] = []

    class FakeProvider:
        name = "mock"
        model = "mock-league-opinion"
        fallback = False

        async def review_league_sentiment(self, payload):
            calls.append(payload)
            translations = league_sentiment_translations()
            english = translations["en"]
            return LeagueSentimentOpinionResult(
                bias="MIXED",
                confidence=72,
                riskLevel="MEDIUM",
                confidenceReason=english["confidenceReason"],
                brief=english["brief"],
                headline=english["headline"],
                summary=english["summary"],
                keyDrivers=english["keyDrivers"],
                risks=english["risks"],
                watchConditions=english["watchConditions"],
                action=english["action"],
                longShortContext=english["longShortContext"],
                sourceCounts={"activePositions": 1, "pendingOrders": 1, "recentClosedPositions": 1},
                sourceBreakdown={"activeExposure": {"total": 1}, "pendingOrders": {"total": 1}},
                dataFreshness={"generatedAt": "2026-06-18T08:35:00+00:00"},
                evidenceRefs=[{"id": "position:1", "sourceType": "active_position", "label": "range-maker LONG"}],
                invalidatesAt="2026-06-18T09:00:00+00:00",
                provider="mock",
                model="mock-league-opinion",
                fallback=False,
                translations=translations,
            )

    monkeypatch.setattr("app.league_sentiment.get_ai_provider", lambda settings, provider_name=None: FakeProvider())

    client = TestClient(app)
    first = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")
    second = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["cacheHit"] is False
    assert second.json()["cacheHit"] is True
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["intervalStart"].endswith(":00:00+00:00")
    assert first.json()["nextRefreshAt"] == first.json()["intervalEnd"]
    assert first.json()["opinion"]["bias"] == "MIXED"
    assert first.json()["translation"]["status"] == "embedded"
    assert first.json()["opinion"]["brief"]["conclusion"] == "BTC 리그 압력은 혼조라 확인이 필요합니다."
    assert first.json()["opinion"]["sourceCounts"]["activePositions"] == 1
    assert first.json()["opinion"]["confidenceReason"] == "새 노출이 엇갈려 있어 신뢰도는 제한됩니다."
    assert first.json()["opinion"]["evidenceRefs"][0]["sourceType"] == "active_position"
    assert first.json()["opinion"]["dataFreshness"]["generatedAt"]
    assert "translations" not in first.json()["opinion"]
    assert "dataQuality" not in first.json()["opinion"]
    assert "페이퍼 트레이딩" not in str(first.json()["opinion"])
    assert "paper trading" not in str(first.json()["opinion"]).lower()
    assert len(calls) == 1
    assert "dataQuality" not in calls[0].model_dump()

    with session_scope() as db:
      records = db.query(LeagueSentimentOpinionRecord).all()
      assert len(records) == 1
      assert records[0].locale == "en"
      assert records[0].interval_start.isoformat() == first.json()["intervalStart"]
      assert '"ko"' in records[0].payload_json
      assert "페이퍼 트레이딩" not in str(records[0].payload_json)
      assert "paper trading" not in str(records[0].payload_json).lower()
      assert db.query(AITranslationCacheRecord).count() == 0


def test_existing_league_sentiment_opinion_hydrates_requested_locale_translation(temp_db, monkeypatch):
    interval_start = datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc)
    payload = {
        "bias": "MIXED",
        "confidence": 74,
        "riskLevel": "MEDIUM",
        "confidenceReason": "Both sides are present, so confidence is moderate.",
        "brief": {
            "conclusion": "Mixed BTC positioning needs confirmation.",
            "reason": "Both long and short plans remain active.",
            "watch": "Wait for the next hourly close.",
        },
        "headline": "Mixed BTC positioning needs confirmation.",
        "summary": "Long and short plans are both active, so the next hourly close matters.",
        "keyDrivers": ["One active LONG", "One pending SHORT"],
        "risks": ["Signals are split."],
        "watchConditions": ["Watch the next 1H close."],
        "action": "Avoid chasing until direction clears.",
        "longShortContext": "LONG 1 / SHORT 1",
        "sourceCounts": {"activePositions": 1, "pendingOrders": 1},
        "sourceBreakdown": {"activeExposure": {"total": 1}, "pendingOrders": {"total": 1}},
        "dataFreshness": {"generatedAt": interval_start.isoformat()},
        "evidenceRefs": [{"id": "position:1", "sourceType": "active_position", "label": "range-maker LONG"}],
        "invalidatesAt": (interval_start + timedelta(hours=1)).isoformat(),
        "provider": "mock",
        "model": "mock-league-opinion",
        "fallback": False,
        "briefingVersion": LEAGUE_SENTIMENT_BRIEFING_VERSION,
    }

    with session_scope() as db:
        db.add(
            LeagueSentimentOpinionRecord(
                symbol="BTCUSDT",
                trader_id="aigentra-opinion",
                status="ok",
                locale="en",
                interval_start=interval_start,
                interval_end=interval_start + timedelta(hours=1),
                provider="mock",
                model="mock-league-opinion",
                bias="MIXED",
                confidence=74,
                risk_level="MEDIUM",
                fallback=False,
                created_at=interval_start,
                payload_json=to_json(payload),
            )
        )

    async def fake_translate_json_with_logging(db, *, settings, payload, target_locale, symbol, trader_id, provider=None):
        assert target_locale == "ko"
        return {
            **payload,
            "brief": {
                "conclusion": "BTC 포지션이 엇갈려 확인이 필요합니다.",
                "reason": "롱과 숏 계획이 모두 살아 있어 방향 신뢰도가 제한됩니다.",
                "watch": "다음 1시간 종가만 먼저 확인하세요.",
            },
            "headline": "BTC 포지션이 엇갈려 확인이 필요합니다.",
            "summary": "롱과 숏 계획이 모두 살아 있어 다음 1시간 종가가 중요합니다.",
            "keyDrivers": ["진입 중 LONG 1건", "진입대기 SHORT 1건"],
            "risks": ["신호가 갈려 있습니다."],
            "watchConditions": ["다음 1시간 종가를 확인하세요."],
            "action": "방향이 정리될 때까지 추격 진입은 피하세요.",
            "longShortContext": "LONG 1 / SHORT 1",
            "confidenceReason": "양쪽 근거가 있어 신뢰도는 중간 수준입니다.",
        }

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: interval_start + timedelta(minutes=12))
    monkeypatch.setattr("app.ai.translation_cache.translate_json_with_logging", fake_translate_json_with_logging)
    monkeypatch.setattr("app.main.settings.openai_api_key", "test-key")
    monkeypatch.setattr("app.main.settings.ai_translation_enabled", True)
    monkeypatch.setattr("app.main.settings.ai_translation_target_locales", ["ko"])

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert response.status_code == 200
    data = response.json()
    assert data["cacheHit"] is True
    assert data["locale"] == "ko"
    assert data["sourceLocale"] == "en"
    assert data["translation"]["status"] == "ok"
    assert data["opinion"]["headline"] == "BTC 포지션이 엇갈려 확인이 필요합니다."
    assert data["opinion"]["brief"]["conclusion"] == "BTC 포지션이 엇갈려 확인이 필요합니다."
    assert data["opinion"]["brief"]["watch"] == "다음 1시간 종가만 먼저 확인하세요."
    assert data["opinion"]["summary"] == "롱과 숏 계획이 모두 살아 있어 다음 1시간 종가가 중요합니다."
    assert data["opinion"]["confidenceReason"] == "양쪽 근거가 있어 신뢰도는 중간 수준입니다."
    assert data["opinion"]["evidenceRefs"][0]["id"] == "position:1"

    with session_scope() as db:
        translations = db.query(AITranslationCacheRecord).all()
        assert len(translations) == 1
        assert translations[0].locale == "ko"
        assert translations[0].status == "ok"


def test_existing_league_sentiment_opinion_uses_embedded_locale_without_translation_cache(temp_db, monkeypatch):
    interval_start = datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc)
    translations = league_sentiment_translations()
    english = translations["en"]
    payload = {
        "bias": "MIXED",
        "confidence": 74,
        "riskLevel": "MEDIUM",
        "confidenceReason": english["confidenceReason"],
        "brief": english["brief"],
        "headline": english["headline"],
        "summary": english["summary"],
        "keyDrivers": english["keyDrivers"],
        "risks": english["risks"],
        "watchConditions": english["watchConditions"],
        "action": english["action"],
        "longShortContext": english["longShortContext"],
        "sourceCounts": {"activePositions": 1, "pendingOrders": 1},
        "sourceBreakdown": {"activeExposure": {"total": 1}, "pendingOrders": {"total": 1}},
        "dataFreshness": {"generatedAt": interval_start.isoformat()},
        "evidenceRefs": [{"id": "position:1", "sourceType": "active_position", "label": "range-maker LONG"}],
        "invalidatesAt": (interval_start + timedelta(hours=1)).isoformat(),
        "provider": "mock",
        "model": "mock-league-opinion",
        "fallback": False,
        "translations": translations,
        "briefingVersion": LEAGUE_SENTIMENT_BRIEFING_VERSION,
    }

    with session_scope() as db:
        db.add(
            LeagueSentimentOpinionRecord(
                symbol="BTCUSDT",
                trader_id="aigentra-opinion",
                status="ok",
                locale="en",
                interval_start=interval_start,
                interval_end=interval_start + timedelta(hours=1),
                provider="mock",
                model="mock-league-opinion",
                bias="MIXED",
                confidence=74,
                risk_level="MEDIUM",
                fallback=False,
                created_at=interval_start,
                payload_json=to_json(payload),
            )
        )

    async def fail_translate_json_with_logging(*args, **kwargs):
        raise AssertionError("embedded league sentiment locales should not call translation cache")

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: interval_start + timedelta(minutes=12))
    monkeypatch.setattr("app.ai.translation_cache.translate_json_with_logging", fail_translate_json_with_logging)
    monkeypatch.setattr("app.main.settings.openai_api_key", "test-key")
    monkeypatch.setattr("app.main.settings.ai_translation_enabled", True)
    monkeypatch.setattr("app.main.settings.ai_translation_target_locales", ["ko"])

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert response.status_code == 200
    data = response.json()
    assert data["translation"]["status"] == "embedded"
    assert data["opinion"]["headline"] == "BTC 리그 압력은 혼조라 확인이 필요합니다."
    assert data["opinion"]["brief"]["watch"] == "다음 1시간 종가와 대기 SHORT 체결 여부를 확인하세요."
    assert "translations" not in data["opinion"]

    with session_scope() as db:
        assert db.query(AITranslationCacheRecord).count() == 0


def test_legacy_hourly_league_sentiment_record_is_replaced_with_market_first_brief(temp_db, monkeypatch):
    seed_sentiment_context()
    seed_market_context()
    current_hour = datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc)
    legacy_payload = {
        "bias": "MIXED",
        "confidence": 55,
        "riskLevel": "MEDIUM",
        "confidenceReason": "Old record.",
        "brief": {
            "conclusion": "최근 거래기록만 요약하는 구버전 의견입니다.",
            "reason": "익절/손절 이벤트를 먼저 읽습니다.",
            "watch": "체결 변화만 확인하세요.",
        },
        "headline": "최근 거래기록만 요약하는 구버전 의견입니다.",
        "summary": "익절/손절 이벤트를 먼저 읽습니다.",
        "keyDrivers": [],
        "risks": [],
        "watchConditions": [],
        "action": "체결 변화만 확인하세요.",
        "longShortContext": "LONG 1 / SHORT 1",
        "sourceCounts": {"activePositions": 1},
        "sourceBreakdown": {"activeExposure": {"total": 1}},
        "dataFreshness": {"generatedAt": current_hour.isoformat()},
        "evidenceRefs": [],
        "invalidatesAt": (current_hour + timedelta(hours=1)).isoformat(),
        "provider": "mock",
        "model": "old-league-opinion",
        "fallback": False,
    }
    with session_scope() as db:
        db.add(
            LeagueSentimentOpinionRecord(
                symbol="BTCUSDT",
                trader_id="aigentra-opinion",
                status="ok",
                locale="en",
                interval_start=current_hour,
                interval_end=current_hour + timedelta(hours=1),
                provider="mock",
                model="old-league-opinion",
                bias="MIXED",
                confidence=55,
                risk_level="MEDIUM",
                fallback=False,
                created_at=current_hour,
                payload_json=to_json(legacy_payload),
            )
        )

    class FailingProvider:
        name = "anthropic"
        model = "claude-haiku-4-5"
        fallback = False

        async def review_league_sentiment(self, payload):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: current_hour + timedelta(minutes=35))
    monkeypatch.setattr("app.league_sentiment.get_ai_provider", lambda settings, provider_name=None: FailingProvider())

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert response.status_code == 200
    data = response.json()
    brief = data["opinion"]["brief"]
    assert data["cacheHit"] is False
    assert data["status"] == "fallback"
    assert brief["conclusion"].startswith("BTC")
    assert "최근 거래기록만 요약" not in str(data["opinion"])
    with session_scope() as db:
        records = db.query(LeagueSentimentOpinionRecord).all()
        assert len(records) == 1
        assert records[0].status == "fallback"
        assert LEAGUE_SENTIMENT_BRIEFING_VERSION in records[0].payload_json
        assert "최근 거래기록만 요약" not in records[0].payload_json


def test_league_sentiment_opinion_can_return_previous_hour_without_blocking(temp_db, monkeypatch):
    seed_sentiment_context()
    current_hour = datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc)
    previous_hour = current_hour - timedelta(hours=1)
    payload = {
        "bias": "MIXED",
        "confidence": 68,
        "riskLevel": "MEDIUM",
        "confidenceReason": "Previous opinion is only a temporary read.",
        "brief": {
            "conclusion": "직전 시간대 의견입니다.",
            "reason": "새 시간대 생성 전까지 보여주는 임시 맥락입니다.",
            "watch": "새 의견이 생성되는지만 확인하세요.",
        },
        "headline": "직전 시간대 의견입니다.",
        "summary": "새 시간대 생성 중에도 먼저 보여줄 수 있는 최근 의견입니다.",
        "keyDrivers": ["최근 의견"],
        "risks": ["새 데이터는 아직 생성 중"],
        "watchConditions": ["다음 갱신 확인"],
        "action": "기존 의견을 참고하세요.",
        "longShortContext": "LONG 1 / SHORT 1",
        "sourceCounts": {"activePositions": 1},
        "sourceBreakdown": {"activeExposure": {"total": 1}},
        "dataFreshness": {"generatedAt": previous_hour.isoformat()},
        "evidenceRefs": [{"id": "position:1", "sourceType": "active_position", "label": "range-maker LONG"}],
        "invalidatesAt": current_hour.isoformat(),
        "provider": "mock",
        "model": "mock-league-opinion",
        "fallback": False,
        "briefingVersion": LEAGUE_SENTIMENT_BRIEFING_VERSION,
    }
    with session_scope() as db:
        db.add(
            LeagueSentimentOpinionRecord(
                symbol="BTCUSDT",
                trader_id="aigentra-opinion",
                status="ok",
                locale="en",
                interval_start=previous_hour,
                interval_end=current_hour,
                provider="mock",
                model="mock-league-opinion",
                bias="MIXED",
                confidence=68,
                risk_level="MEDIUM",
                fallback=False,
                created_at=previous_hour,
                payload_json=to_json(payload),
            )
        )

    class FailingProvider:
        name = "anthropic"
        model = "claude-haiku-4-5"
        fallback = False

        async def review_league_sentiment(self, payload):
            raise AssertionError("preferCached should not block on provider generation")

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: current_hour)
    monkeypatch.setattr("app.league_sentiment.get_ai_provider", lambda settings, provider_name=None: FailingProvider())

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko&preferCached=true")

    assert response.status_code == 200
    data = response.json()
    assert data["cacheHit"] is True
    assert data["stale"] is True
    assert data["intervalStart"] == previous_hour.isoformat()
    assert data["nextRefreshAt"] == current_hour.isoformat()
    assert data["staleReason"] == "previous_interval"
    assert data["opinionAgeMinutes"] == 60
    assert data["opinion"]["headline"] == "직전 시간대 의견입니다."
    assert data["opinion"]["brief"]["watch"] == "새 의견이 생성되는지만 확인하세요."


def test_league_sentiment_opinion_uses_safe_fallback_when_provider_fails(temp_db, monkeypatch):
    seed_sentiment_context()

    class FailingProvider:
        name = "anthropic"
        model = "claude-haiku-4-5"
        fallback = False

        async def review_league_sentiment(self, payload):
            raise RuntimeError("provider failed")

    monkeypatch.setattr("app.league_sentiment.get_ai_provider", lambda settings, provider_name=None: FailingProvider())

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "fallback"
    assert data["opinion"]["fallback"] is True
    assert data["opinion"]["bias"] in {"LONG_BIASED", "SHORT_BIASED", "NEUTRAL", "MIXED", "RISK_OFF"}
    assert data["opinion"]["confidenceReason"]
    assert data["opinion"]["brief"]["conclusion"]
    assert data["opinion"]["brief"]["reason"]
    assert data["opinion"]["brief"]["watch"]
    assert data["opinion"]["sourceBreakdown"]["activeExposure"]["total"] >= 1
    assert data["opinion"]["dataFreshness"]["generatedAt"]
    assert data["opinion"]["evidenceRefs"]
    assert "provider failed" not in data["opinion"]["summary"].lower()
    assert "provider failed" not in str(data["opinion"]["brief"]).lower()


def test_league_sentiment_normalizer_derives_compact_brief_when_missing():
    provider = BaseAIProvider()

    opinion = provider.normalize_league_sentiment_result(
        {
            "bias": "SHORT_BIASED",
            "confidence": 66,
            "riskLevel": "HIGH",
            "headline": "숏 압력이 우세하지만 추격보다 확인이 먼저입니다. 출처: position:1.",
            "summary": "활성 숏이 롱보다 많고 최근 손절도 있어 신뢰도는 제한됩니다. 출처: position:1.",
            "action": "다음 1시간 동안 숏 무효화 가격 회복 여부만 확인하세요. 출처: review:2.",
            "keyDrivers": ["활성 숏 우세. 출처: position:1."],
            "risks": ["손절 군집이 있어 과신하면 위험합니다. 출처: trade_event:3."],
            "watchConditions": ["숏 무효화 가격 회복 여부 확인. 출처: review:2."],
            "sourceCounts": {"activePositions": 2},
        }
    )

    assert opinion.brief.conclusion == "숏 압력이 우세하지만 추격보다 확인이 먼저입니다."
    assert opinion.brief.reason == "활성 숏이 롱보다 많고 최근 손절도 있어 신뢰도는 제한됩니다."
    assert opinion.brief.watch == "다음 1시간 동안 숏 무효화 가격 회복 여부만 확인하세요."


def test_league_sentiment_payload_exposes_freshness_breakdown_refs_and_quiet_reviews(temp_db):
    seed_sentiment_context()
    with session_scope() as db:
        db.add_all(
            [
                PositionManagementReviewRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="ok",
                    phase="OPEN_POSITION",
                    provider="openai",
                    model="gpt-4.1-mini",
                    decision="HOLD",
                    confidence=64,
                    action_type="HOLD",
                    payload_json='{"review":{"structuredReview":{"headline":"이전 반복 리뷰입니다."}}}',
                    created_at=datetime(2026, 6, 18, 8, 5, tzinfo=timezone.utc),
                ),
                PositionManagementReviewRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="ok",
                    phase="OPEN_POSITION",
                    provider="openai",
                    model="gpt-4.1-mini",
                    decision="HOLD",
                    confidence=86,
                    action_type="HOLD",
                    payload_json='{"review":{"structuredReview":{"headline":"최신 유지 리뷰입니다."}}}',
                    created_at=datetime(2026, 6, 18, 8, 45, tzinfo=timezone.utc),
                ),
            ]
        )
        db.flush()

        payload = build_league_sentiment_payload(
            db,
            symbol="BTCUSDT",
            locale="en",
            interval_start=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc),
            now=datetime(2026, 6, 18, 8, 50, tzinfo=timezone.utc),
            recent_hours=24,
        )

    dumped = payload.model_dump()
    assert dumped["dataFreshness"]["latestManagementReviewAt"] == "2026-06-18T08:45:00+00:00"
    assert dumped["dataFreshness"]["latestManagementReviewAgeMinutes"] == 5
    assert dumped["sourceBreakdown"]["activeExposure"]["total"] == 1
    assert dumped["sourceBreakdown"]["pendingOrders"]["short"] == 1
    assert dumped["sourceBreakdown"]["aiReviews"]["management"] >= 3
    assert dumped["derivedSignals"]["activeExposure"]["dominantSide"] in {"LONG", "SHORT", "BALANCED"}
    assert dumped["activePositions"][0]["sourceRef"].startswith("position:")
    assert any(ref["sourceType"] == "active_position" for ref in dumped["evidenceRefs"])
    latest_range_reviews = [
        item
        for item in dumped["recentManagementReviews"]
        if item.get("traderId") == "range-maker" and item.get("decision") == "HOLD" and item.get("action") == "HOLD"
    ]
    assert len(latest_range_reviews) == 1
    assert latest_range_reviews[0]["headline"] == "최신 유지 리뷰입니다."


def test_serialized_league_sentiment_record_marks_overdue_previous_opinion(temp_db):
    now = datetime(2026, 6, 18, 10, 30, tzinfo=timezone.utc)
    previous_hour = datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc)
    payload = {
        "bias": "MIXED",
        "confidence": 68,
        "riskLevel": "MEDIUM",
        "confidenceReason": "Previous opinion is stale.",
        "brief": {
            "conclusion": "Previous opinion.",
            "reason": "A previous read.",
            "watch": "Wait for refresh.",
        },
        "headline": "Previous opinion.",
        "summary": "A previous read.",
        "keyDrivers": ["Previous context"],
        "risks": ["Fresh context is missing"],
        "watchConditions": ["Wait for refresh"],
        "action": "Treat as stale.",
        "longShortContext": "Mixed.",
        "sourceCounts": {"activePositions": 1},
        "sourceBreakdown": {"activeExposure": {"total": 1}},
        "dataFreshness": {"generatedAt": previous_hour.isoformat()},
        "evidenceRefs": [],
        "invalidatesAt": (previous_hour + timedelta(hours=1)).isoformat(),
        "provider": "mock",
        "model": "mock-league-opinion",
        "fallback": False,
        "briefingVersion": LEAGUE_SENTIMENT_BRIEFING_VERSION,
    }
    with session_scope() as db:
        record = LeagueSentimentOpinionRecord(
            symbol="BTCUSDT",
            trader_id="aigentra-opinion",
            status="ok",
            locale="en",
            interval_start=previous_hour,
            interval_end=previous_hour + timedelta(hours=1),
            provider="mock",
            model="mock-league-opinion",
            bias="MIXED",
            confidence=68,
            risk_level="MEDIUM",
            fallback=False,
            created_at=previous_hour,
            payload_json=to_json(payload),
        )
        db.add(record)
        db.flush()

        serialized = serialize_league_sentiment_record(
            db,
            record,
            cache_hit=True,
            locale="en",
            stale=True,
            next_refresh_at=previous_hour + timedelta(hours=1),
            now=now,
        )

    assert serialized["stale"] is True
    assert serialized["staleReason"] == "previous_interval"
    assert serialized["refreshOverdue"] is True
    assert serialized["refreshOverdueMinutes"] == 90
    assert serialized["opinionAgeMinutes"] == 150


def test_serialized_league_sentiment_record_backfills_legacy_brief(temp_db):
    interval_start = datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc)
    legacy_payload = {
        "bias": "SHORT_BIASED",
        "confidence": 61,
        "riskLevel": "HIGH",
        "confidenceReason": "Legacy payload predates brief.",
        "headline": "숏 압력이 우세하지만 추격보다 확인이 먼저입니다. 출처: position:1.",
        "summary": "활성 숏이 롱보다 많아 방향은 아래쪽으로 기울었습니다. 출처: position:1.",
        "keyDrivers": ["활성 숏 우세."],
        "risks": ["손절 군집."],
        "watchConditions": ["무효화 가격 회복 여부."],
        "action": "다음 1시간 무효화 가격 회복 여부만 보세요. 출처: review:2.",
        "longShortContext": "SHORT 압력이 강함",
        "sourceCounts": {"activePositions": 2},
        "sourceBreakdown": {"activeExposure": {"total": 2}},
        "dataFreshness": {"generatedAt": interval_start.isoformat()},
        "evidenceRefs": [],
        "invalidatesAt": (interval_start + timedelta(hours=1)).isoformat(),
        "provider": "mock",
        "model": "mock-league-opinion",
        "fallback": False,
    }
    with session_scope() as db:
        record = LeagueSentimentOpinionRecord(
            symbol="BTCUSDT",
            trader_id="aigentra-opinion",
            status="ok",
            locale="ko",
            interval_start=interval_start,
            interval_end=interval_start + timedelta(hours=1),
            provider="mock",
            model="mock-league-opinion",
            bias="SHORT_BIASED",
            confidence=61,
            risk_level="HIGH",
            fallback=False,
            created_at=interval_start,
            payload_json=to_json(legacy_payload),
        )
        db.add(record)
        db.flush()

        serialized = serialize_league_sentiment_record(db, record, cache_hit=True, locale="ko")

    assert serialized["opinion"]["brief"] == {
        "conclusion": "숏 압력이 우세하지만 추격보다 확인이 먼저입니다.",
        "reason": "활성 숏이 롱보다 많아 방향은 아래쪽으로 기울었습니다.",
        "watch": "다음 1시간 무효화 가격 회복 여부만 보세요.",
    }


def test_league_sentiment_prompt_prioritizes_user_usefulness_and_specificity(temp_db):
    seed_sentiment_context()
    seed_market_context()
    with session_scope() as db:
        payload = build_league_sentiment_payload(
            db,
            symbol="BTCUSDT",
            locale="en",
            interval_start=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc),
            now=datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc),
            recent_hours=24,
        )

    prompt = league_sentiment_prompt(payload)

    assert "brief" in prompt
    assert "The default UI reads only brief" in prompt
    assert "compact three-line market briefing" in prompt
    assert "brief.conclusion" in prompt
    assert "brief.reason" in prompt
    assert "brief.watch" in prompt
    assert "brief.conclusion must lead with BTC market state" in prompt
    assert "brief.reason must interpret the trader group positioning" in prompt
    assert "brief.conclusion, brief.reason, and brief.watch may each be one or two concise sentences" in prompt
    assert "summary may be two useful sentences" in prompt
    assert "confidenceReason should be two concise sentences when confidence is capped, high, or disputed" in prompt
    assert "Do not recap recent trade events as the briefing" in prompt
    assert "recent take-profit/stop-loss events are supporting context, not the main story" in prompt
    assert "translations is required" in prompt
    assert "en, ko, ru, pt-BR, tr" in prompt
    assert "Top-level user-facing fields must mirror translations.en exactly" in prompt
    assert "keyDrivers: one or two support items" in prompt
    assert "risks: one or two support items" in prompt
    assert "watchConditions: one or two support items" in prompt
    assert "at most one hidden support item" not in prompt
    assert "confidenceReason must explain why confidence is high, capped, or low" in prompt
    assert "active exposure, pending entries, invalidation area" in prompt
    assert "Use sourceRef or evidenceRefs labels" in prompt
    assert "Avoid generic sentences like 'monitor market conditions'" in prompt
    assert "notional" in prompt
    assert "stop zone" in prompt
    assert "summary: two to three sentences" not in prompt
    assert "futures simulation league" not in prompt
    assert "up to four bullets" not in prompt


def test_league_sentiment_prompt_requires_market_first_aggregate_briefing(temp_db):
    seed_sentiment_context()
    seed_market_context()
    with session_scope() as db:
        payload = build_league_sentiment_payload(
            db,
            symbol="BTCUSDT",
            locale="en",
            interval_start=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc),
            now=datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc),
            recent_hours=24,
        )

    prompt = league_sentiment_prompt(payload)

    assert "brief.conclusion must lead with BTC market state" in prompt
    assert "brief.reason must interpret the trader group positioning" in prompt
    assert "brief.watch must name the next market or positioning confirmation" in prompt
    assert "two useful sentences" in prompt
    assert "Do not recap recent trade events as the briefing" in prompt
    assert "BTC is doing now" in prompt
    assert "traders are positioned" in prompt
    assert "judgment follows" in prompt


def test_league_sentiment_prompt_requires_decisive_btc_market_briefing(temp_db):
    seed_sentiment_context()
    seed_market_context()
    with session_scope() as db:
        payload = build_league_sentiment_payload(
            db,
            symbol="BTCUSDT",
            locale="en",
            interval_start=datetime(2026, 6, 18, 8, 0, tzinfo=timezone.utc),
            interval_end=datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc),
            now=datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc),
            recent_hours=24,
        )

    prompt = league_sentiment_prompt(payload)

    assert "Write brief as a BTC market briefing, not as a transaction log." in prompt
    assert "brief.conclusion should be two punchy sentences when data allows" in prompt
    assert "name the current BTC regime and the directional pressure in the same field" in prompt
    assert "brief.reason must synthesize active exposure, pending orders, fresh AI reviews, and recent outcomes" in prompt
    assert "explain whether trader behavior confirms, fades, or hesitates around the BTC regime" in prompt
    assert "brief.watch must give one concrete level, zone, timeframe close, or exposure change" in prompt
    assert "Forbid limp summaries such as 'not one-sided', 'monitor closely', or only restating LONG/SHORT counts" in prompt


def test_league_sentiment_schema_allows_two_support_items():
    schema = league_sentiment_schema()
    localized = schema["properties"]["translations"]["properties"]["ko"]
    top_properties = schema["properties"]
    localized_properties = localized["properties"]

    for properties in (top_properties, localized_properties):
        assert properties["keyDrivers"]["maxItems"] == 2
        assert properties["risks"]["maxItems"] == 2
        assert properties["watchConditions"]["maxItems"] == 2


def test_league_sentiment_schema_requires_decisive_btc_briefing_descriptions():
    schema = league_sentiment_schema()
    localized = schema["properties"]["translations"]["properties"]["ko"]

    for properties in (schema["properties"], localized["properties"]):
        brief = properties["brief"]["properties"]
        descriptions = " ".join(
            [
                brief["conclusion"]["description"],
                brief["reason"]["description"],
                brief["watch"]["description"],
            ]
        )
        assert "BTC regime" in descriptions
        assert "directional pressure" in descriptions
        assert "trader positioning" in descriptions
        assert "confirms, fades, or hesitates" in descriptions
        assert "level, zone, timeframe close, or exposure change" in descriptions


def test_fallback_league_sentiment_brief_uses_btc_market_state_before_trade_counts():
    from app.league_sentiment import fallback_league_sentiment_opinion
    from app.ai.league_sentiment_models import LeagueSentimentPayload

    payload = LeagueSentimentPayload(
        symbol="BTCUSDT",
        locale="ko",
        generatedAt="2026-06-18T08:35:00+00:00",
        intervalStart="2026-06-18T08:00:00+00:00",
        intervalEnd="2026-06-18T09:00:00+00:00",
        market={
            "symbol": "BTCUSDT",
            "price": 63377.7,
            "dataAvailable": True,
            "timeframes": {
                "1h": {"trend": "uptrend", "close": 63377.7, "ema50": 62920.0, "rsi14": 58.4},
                "4h": {"trend": "range", "close": 63377.7, "ema50": 63180.0, "rsi14": 54.2},
            },
        },
        sourceCounts={
            "activeLongPositions": 2,
            "activeShortPositions": 1,
            "pendingLongOrders": 1,
            "pendingShortOrders": 0,
            "recentTakeProfits": 0,
            "recentStopLosses": 3,
        },
        activePositions=[
            {"side": "LONG", "notional": 12000, "distanceToTakeProfitPct": 1.2, "distanceToStopLossPct": 1.8},
            {"side": "LONG", "notional": 9000, "distanceToTakeProfitPct": 1.6, "distanceToStopLossPct": 1.5},
            {"side": "SHORT", "notional": 5000, "distanceToTakeProfitPct": 2.0, "distanceToStopLossPct": 1.1},
        ],
        pendingOrders=[{"side": "LONG", "notional": 4000, "distanceToTakeProfitPct": 1.0}],
        longShortContext={"dominantSide": "LONG", "longExposureCount": 3, "shortExposureCount": 1},
        sourceBreakdown={"activeExposure": {"dominantSide": "LONG"}},
        dataFreshness={"marketAgeMinutes": 1},
        derivedSignals={"recentOutcomeBalance": {"takeProfits": 0, "stopLosses": 3, "sampleSize": 3}},
    )

    opinion = fallback_league_sentiment_opinion(payload)
    brief_text = " ".join(
        [
            opinion.brief.conclusion,
            opinion.brief.reason,
            opinion.brief.watch,
        ]
    )

    assert opinion.brief.conclusion.startswith("BTC")
    assert "1H" in opinion.brief.conclusion or "4H" in opinion.brief.conclusion
    assert "LONG" in opinion.brief.reason
    assert "트레이더" in opinion.brief.reason or "리그" in opinion.brief.reason
    assert "익절/손절 이벤트" not in brief_text
    assert "최근 익절" not in brief_text
    assert "최근 손절" not in brief_text


def test_fallback_league_sentiment_brief_uses_decisive_btc_market_state():
    from app.league_sentiment import fallback_league_sentiment_opinion
    from app.ai.league_sentiment_models import LeagueSentimentPayload

    payload = LeagueSentimentPayload(
        symbol="BTCUSDT",
        locale="ko",
        generatedAt="2026-06-18T08:35:00+00:00",
        intervalStart="2026-06-18T08:00:00+00:00",
        intervalEnd="2026-06-18T09:00:00+00:00",
        market={
            "symbol": "BTCUSDT",
            "price": 63377.7,
            "dataAvailable": True,
            "timeframes": {
                "1h": {"trend": "uptrend", "close": 63377.7, "ema50": 62920.0, "rsi14": 58.4},
                "4h": {"trend": "range", "close": 63377.7, "ema50": 63180.0, "rsi14": 54.2},
            },
        },
        sourceCounts={
            "activeLongPositions": 2,
            "activeShortPositions": 1,
            "pendingLongOrders": 1,
            "pendingShortOrders": 0,
            "recentTakeProfits": 0,
            "recentStopLosses": 3,
        },
    )

    opinion = fallback_league_sentiment_opinion(payload)
    brief_text = " ".join([opinion.brief.conclusion, opinion.brief.reason, opinion.brief.watch])

    assert opinion.brief.conclusion.startswith("BTC")
    assert "추격" in opinion.brief.conclusion
    assert "확인" in opinion.brief.conclusion
    assert "트레이더" in opinion.brief.reason
    assert "LONG" in opinion.brief.reason
    assert "방어" in opinion.brief.reason or "리스크" in opinion.brief.reason
    assert "유지하면" in opinion.brief.watch
    assert "이탈하면" in opinion.brief.watch
    assert "시뮬레이션" not in brief_text
    assert "페이퍼" not in brief_text


def test_mock_league_sentiment_brief_avoids_simulation_terms_and_names_btc():
    from app.ai.league_sentiment_models import LeagueSentimentPayload
    from app.ai.mock_provider import MockAIProvider

    payload = LeagueSentimentPayload(
        symbol="BTCUSDT",
        locale="en",
        generatedAt="2026-06-18T08:35:00+00:00",
        intervalStart="2026-06-18T08:00:00+00:00",
        intervalEnd="2026-06-18T09:00:00+00:00",
        market={"symbol": "BTCUSDT", "price": 63377.7},
        sourceCounts={
            "activePositions": 3,
            "pendingOrders": 2,
            "activeLongPositions": 2,
            "activeShortPositions": 0,
            "pendingLongOrders": 1,
            "pendingShortOrders": 1,
            "recentTakeProfits": 1,
            "recentStopLosses": 2,
        },
    )

    opinion = anyio.run(MockAIProvider().review_league_sentiment, payload)
    visible_text = " ".join(
        [
            opinion.brief.conclusion,
            opinion.brief.reason,
            opinion.brief.watch,
            opinion.summary,
        ]
    )

    assert opinion.brief.conclusion.startswith("BTC")
    assert "league traders" in visible_text.lower()
    assert "simulation" not in visible_text.lower()
    assert "paper trading" not in visible_text.lower()


def test_mock_league_sentiment_http_surface_embeds_korean_market_brief(temp_db, monkeypatch):
    seed_sentiment_context()
    seed_market_context()

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc))
    monkeypatch.setattr("app.main.settings.league_sentiment_provider", "mock")

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko&refresh=true")

    assert response.status_code == 200
    data = response.json()
    brief = data["opinion"]["brief"]
    visible_text = " ".join([brief["conclusion"], brief["reason"], brief["watch"]])

    assert data["locale"] == "ko"
    assert data["translation"]["status"] == "embedded"
    assert brief["conclusion"].startswith("BTC")
    assert "리그 트레이더" in visible_text
    assert "유지하면" in brief["watch"]
    assert "이탈하면" in brief["watch"]
    assert "League traders" not in visible_text


def test_mock_league_sentiment_embeds_supported_locale_briefs():
    from app.ai.league_sentiment_models import LeagueSentimentPayload
    from app.ai.mock_provider import MockAIProvider

    payload = LeagueSentimentPayload(
        symbol="BTCUSDT",
        locale="en",
        generatedAt="2026-06-18T08:35:00+00:00",
        intervalStart="2026-06-18T08:00:00+00:00",
        intervalEnd="2026-06-18T09:00:00+00:00",
        market={
            "symbol": "BTCUSDT",
            "price": 63377.7,
            "timeframes": {"1h": {"trend": "uptrend", "close": 63377.7, "ema50": 62920.0}},
        },
        sourceCounts={
            "activePositions": 3,
            "pendingOrders": 2,
            "activeLongPositions": 2,
            "activeShortPositions": 0,
            "pendingLongOrders": 1,
            "pendingShortOrders": 1,
            "recentTakeProfits": 1,
            "recentStopLosses": 2,
        },
    )

    opinion = anyio.run(MockAIProvider().review_league_sentiment, payload)

    for locale in ("en", "ko", "ru", "pt-BR", "tr"):
        assert locale in opinion.translations
        assert opinion.translations[locale].brief.conclusion.startswith("BTC")
    assert "League traders" not in opinion.translations["ko"].brief.reason
    assert "League traders" not in opinion.translations["ru"].brief.reason
    assert "League traders" not in opinion.translations["pt-BR"].brief.reason
    assert "League traders" not in opinion.translations["tr"].brief.reason
    assert "리그 트레이더" in opinion.translations["ko"].brief.reason
    assert "трейдеров лиги" in opinion.translations["ru"].brief.reason.lower()
    assert "traders da liga" in opinion.translations["pt-BR"].brief.reason.lower()
    assert "lig trader" in opinion.translations["tr"].brief.reason.lower()


def test_league_sentiment_http_surface_returns_market_first_brief(temp_db, monkeypatch):
    seed_sentiment_context()
    seed_market_context()

    class ProviderUnavailableForTest(Exception):
        pass

    class FailingProvider:
        name = "anthropic"
        model = "claude-haiku-4-5"
        fallback = False

        async def review_league_sentiment(self, payload):
            raise ProviderUnavailableForTest("provider unavailable")

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc))
    monkeypatch.setattr("app.league_sentiment.get_ai_provider", lambda settings, provider_name=None: FailingProvider())

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert response.status_code == 200
    data = response.json()
    brief = data["opinion"]["brief"]
    visible_text = " ".join([brief["conclusion"], brief["reason"], brief["watch"]])

    assert brief["conclusion"].startswith("BTC")
    assert "1H" in brief["conclusion"] or "4H" in brief["conclusion"]
    assert "LONG" in brief["reason"] or "SHORT" in brief["reason"]
    assert "트레이더" in brief["reason"] or "리그" in brief["reason"]
    assert "익절/손절 이벤트" not in visible_text
    assert "최근 거래" not in visible_text


def test_league_sentiment_http_surface_times_out_to_market_first_fallback(temp_db, monkeypatch):
    seed_sentiment_context()
    seed_market_context()

    class SlowProvider:
        name = "codex_cli"
        model = "slow-league-sentiment"
        fallback = False

        async def review_league_sentiment(self, payload):
            await anyio.sleep(1)

    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc))
    monkeypatch.setattr("app.league_sentiment.get_ai_provider", lambda settings, provider_name=None: SlowProvider())
    monkeypatch.setattr("app.main.settings.league_sentiment_timeout_seconds", 0.01)

    client = TestClient(app)
    response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko&refresh=true")

    assert response.status_code == 200
    data = response.json()
    brief = data["opinion"]["brief"]
    visible_text = " ".join([brief["conclusion"], brief["reason"], brief["watch"]])

    assert data["opinion"]["fallback"] is True
    assert data["status"] == "fallback"
    assert data["opinion"]["briefingVersion"] == LEAGUE_SENTIMENT_BRIEFING_VERSION
    assert brief["conclusion"].startswith("BTC")
    assert "트레이더" in brief["reason"] or "리그" in brief["reason"]
    assert "유지하면" in brief["watch"]
    assert "이탈하면" in brief["watch"]
    assert "시뮬레이션" not in visible_text


def test_league_sentiment_fresh_request_retries_existing_fallback(temp_db, monkeypatch):
    seed_sentiment_context()
    seed_market_context()

    from app.ai.mock_provider import MockAIProvider

    class SlowProvider:
        name = "codex_cli"
        model = "slow-league-sentiment"
        fallback = False

        async def review_league_sentiment(self, payload):
            await anyio.sleep(1)

    providers = [SlowProvider(), MockAIProvider()]

    def provider_factory(settings, provider_name=None):
        return providers.pop(0)

    current_time = datetime(2026, 6, 18, 8, 35, tzinfo=timezone.utc)
    monkeypatch.setattr("app.league_sentiment.utc_now", lambda: current_time)
    monkeypatch.setattr("app.league_sentiment.get_ai_provider", provider_factory)
    monkeypatch.setattr("app.main.settings.league_sentiment_provider", "mock")
    monkeypatch.setattr("app.main.settings.league_sentiment_timeout_seconds", 0.01)

    client = TestClient(app)
    fallback_response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko&refresh=true")
    assert fallback_response.status_code == 200
    fallback_data = fallback_response.json()
    assert fallback_data["status"] == "fallback"
    assert fallback_data["opinion"]["fallback"] is True

    monkeypatch.setattr("app.main.settings.league_sentiment_timeout_seconds", 5)
    generated_response = client.get("/api/league/sentiment/opinion?symbol=BTCUSDT&locale=ko")

    assert generated_response.status_code == 200
    generated_data = generated_response.json()
    assert generated_data["id"] == fallback_data["id"]
    assert generated_data["cacheHit"] is False
    assert generated_data["status"] == "ok"
    assert generated_data["opinion"]["fallback"] is False
    assert generated_data["opinion"]["brief"]["conclusion"].startswith("BTC")
    assert generated_data["opinion"]["briefingVersion"] == LEAGUE_SENTIMENT_BRIEFING_VERSION
    with session_scope() as db:
        records = db.query(LeagueSentimentOpinionRecord).all()
        assert len(records) == 1
        assert records[0].status == "ok"
        assert records[0].fallback is False
