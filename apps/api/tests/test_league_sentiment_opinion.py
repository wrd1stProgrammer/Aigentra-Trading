from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ai.league_sentiment_models import LeagueSentimentOpinionResult
from app.db import (
    AIReviewRecord,
    LeagueSentimentOpinionRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradeEventRecord,
    init_db,
    reset_db_engine,
    session_scope,
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


def test_league_sentiment_opinion_generates_one_record_per_utc_hour(temp_db, monkeypatch):
    seed_sentiment_context()
    calls: list[Any] = []

    class FakeProvider:
        name = "mock"
        model = "mock-league-opinion"
        fallback = False

        async def review_league_sentiment(self, payload):
            calls.append(payload)
            return LeagueSentimentOpinionResult(
                bias="MIXED",
                confidence=72,
                riskLevel="MEDIUM",
                headline="롱과 숏이 엇갈려 있어 확인 구간입니다.",
                summary="페이퍼 트레이딩이라는 표현 없이, 롱 포지션은 수익 중이고 숏 대기 주문도 있어 다음 1시간 종가 확인이 중요합니다.",
                keyDrivers=["진입 중 롱 1건", "진입대기 숏 1건", "최근 익절 1건"],
                risks=["양방향 신호가 충돌합니다."],
                watchConditions=["BTC가 64100 위에서 1시간 마감하는지 확인"],
                action="신규 추격보다 기존 계획의 무효화 조건을 우선하세요.",
                longShortContext="LONG 1 / SHORT 1",
                sourceCounts={"activePositions": 1, "pendingOrders": 1, "recentClosedPositions": 1},
                provider="mock",
                model="mock-league-opinion",
                fallback=False,
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
    assert first.json()["opinion"]["sourceCounts"]["activePositions"] == 1
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
      assert "페이퍼 트레이딩" not in str(records[0].payload_json)
      assert "paper trading" not in str(records[0].payload_json).lower()


def test_league_sentiment_opinion_can_return_previous_hour_without_blocking(temp_db, monkeypatch):
    seed_sentiment_context()
    current_hour = datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc)
    previous_hour = current_hour - timedelta(hours=1)
    payload = {
        "bias": "MIXED",
        "confidence": 68,
        "riskLevel": "MEDIUM",
        "headline": "직전 시간대 의견입니다.",
        "summary": "새 시간대 생성 중에도 먼저 보여줄 수 있는 최근 의견입니다.",
        "keyDrivers": ["최근 의견"],
        "risks": ["새 데이터는 아직 생성 중"],
        "watchConditions": ["다음 갱신 확인"],
        "action": "기존 의견을 참고하세요.",
        "longShortContext": "LONG 1 / SHORT 1",
        "sourceCounts": {"activePositions": 1},
        "provider": "mock",
        "model": "mock-league-opinion",
        "fallback": False,
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
    assert data["opinion"]["headline"] == "직전 시간대 의견입니다."


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
    assert "provider failed" not in data["opinion"]["summary"].lower()
