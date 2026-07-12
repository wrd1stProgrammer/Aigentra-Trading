from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.db import TradeEventRecord, init_db, reset_db_engine, session_scope
from app.paper.engine import place_paper_order, process_candle
from app.paper.planner import create_paper_orders_from_plan
from app.repositories import from_json
from app.traders.models import EntryPlan, StructuredReview, TakeProfitPlan, TradeCandidate, TradePlan, TradeReviewResult


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "review-events.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_pending_entry_event_carries_ai_review_payload(temp_db):
    candidate = TradeCandidate(
        created=True,
        side="SHORT",
        setupType="SESSION_BREAK",
        setupScore=64,
        entries=[EntryPlan(price=64862.2, weight=1.0, reason="Confirmed session break")],
        stopLoss=65120,
        takeProfits=[TakeProfitPlan(price=64537.9, weight=1.0, reason="TP1")],
        riskPercent=0.5,
    )
    plan = TradePlan(
        status="PAPER_TRADING_PENDING",
        symbol="BTCUSDT",
        side="SHORT",
        entries=candidate.entries,
        stopLoss=65120,
        takeProfits=candidate.takeProfits,
        riskPercent=0.5,
        leverage=7,
    )
    review = TradeReviewResult(
        decision="ADJUST_AND_APPROVE",
        confidence=72,
        riskLevel="MEDIUM",
        structuredReview=StructuredReview(
            verdict="조정 후 승인",
            headline="BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다.",
            action="주문이 채워지지 않으면 2개의 15분 캔들 후 자동 취소하세요.",
        ),
        approvalReason="승인 근거가 여기에 있습니다.",
        counterThesis="15분 종가가 세션 상단을 회복하면 무효입니다.",
    )

    with session_scope() as db:
        create_paper_orders_from_plan(
            db,
            trader_id="session-raider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=plan,
            review=review,
            settings=SimpleNamespace(
                paper_default_equity=10000,
                paper_max_leverage=10,
                paper_maker_fee_rate=0.0002,
                paper_taker_fee_rate=0.0005,
                paper_slippage_rate=0.0001,
                paper_min_margin_deployment_percent=10,
            ),
        )

        event = db.execute(select(TradeEventRecord).where(TradeEventRecord.event_type == "paper_order_created")).scalar_one()
        payload = from_json(event.payload_json)

    assert payload["aiReviewDecision"] == "ADJUST_AND_APPROVE"
    assert payload["aiReview"]["decision"] == "ADJUST_AND_APPROVE"
    assert payload["aiStructuredReview"]["headline"] == "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다."
    assert payload["aiReview"]["structuredReview"]["headline"] == "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다."
    assert payload["aiApprovalReason"] == "승인 근거가 여기에 있습니다."


def test_order_filled_event_inherits_ai_review_payload_from_order(temp_db):
    with session_scope() as db:
        place_paper_order(
            db,
            trader_id="session-raider",
            symbol="BTCUSDT",
            side="short",
            quantity=Decimal("0.2"),
            leverage=7,
            payload={
                "aiReviewDecision": "ADJUST_AND_APPROVE",
                "aiReview": {
                    "decision": "ADJUST_AND_APPROVE",
                    "structuredReview": {
                        "verdict": "조정 후 승인",
                        "headline": "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다.",
                        "action": "주문이 채워지지 않으면 2개의 15분 캔들 후 자동 취소하세요.",
                    },
                    "approvalReason": "승인 근거가 여기에 있습니다.",
                },
                "aiStructuredReview": {
                    "verdict": "조정 후 승인",
                    "headline": "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다.",
                    "action": "주문이 채워지지 않으면 2개의 15분 캔들 후 자동 취소하세요.",
                },
                "aiApprovalReason": "승인 근거가 여기에 있습니다.",
            },
        )

        process_candle(db, "session-raider", "BTCUSDT", {"open": 64880, "high": 64920, "low": 64700, "close": 64840})
        event = db.execute(select(TradeEventRecord).where(TradeEventRecord.event_type == "order_filled")).scalar_one()
        payload = from_json(event.payload_json)

    assert payload["aiReviewDecision"] == "ADJUST_AND_APPROVE"
    assert payload["aiReview"]["decision"] == "ADJUST_AND_APPROVE"
    assert payload["aiStructuredReview"]["headline"] == "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다."
    assert payload["aiReview"]["structuredReview"]["headline"] == "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다."
    assert payload["aiApprovalReason"] == "승인 근거가 여기에 있습니다."
