import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.ai.factory import get_ai_provider
from app.ai.mock_provider import MockAIProvider
from app.core.config import Settings
from app.db import (
    AIReviewRecord,
    CandidateTradeRecord,
    MarketSnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradePlanRecord,
    TraderAgentStateRecord,
    TraderStateRecord,
    TraderRunLogRecord,
    db_status,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.paper.engine import process_candle, place_paper_order
from app.paper.management import order_management_events
from app.paper.management_actions import create_position_add_order
from app.paper.planner import create_paper_orders_from_plan
from app.paper.plan_state import latest_active_trade_plan, list_active_trade_plans
from app.main import run_scanner_once, run_trader_cycle, suppress_inactive_pending_plan_summary
from app.repositories import list_records
from app.repositories import to_json
from app.traders.models import EntryPlan, ManagementAction, TakeProfitPlan, TradeCandidate, TradePlan, TradeReviewResult


def sample_snapshot():
    price = 68000.0
    return {
        "symbol": "BTCUSDT",
        "price": price,
        "intervals": ["1m", "5m", "15m", "1h", "4h"],
        "timeframes": {
            "1m": {"close": price, "volume": 180.0},
            "5m": {"close": price, "volume": 740.0},
            "15m": {
                "open": 68100.0,
                "high": 68600.0,
                "low": 67400.0,
                "close": price,
                "volume": 1600.0,
                "rsi14": 49.0,
                "atr14": 520.0,
                "volumeZscore": 1.2,
                "latestCandle": {
                    "open": 68100.0,
                    "high": 68600.0,
                    "low": 67400.0,
                    "close": price,
                    "volume": 1600.0,
                },
            },
            "1h": {
                "open": 67900.0,
                "high": 68500.0,
                "low": 67100.0,
                "close": price,
                "ema20": 67800.0,
                "ema50": 67000.0,
                "rsi14": 47.0,
                "atr14": 780.0,
                "volumeZscore": 1.1,
                "trend": "bullish",
                "swings": {"highs": [67200.0, 67800.0, 68400.0], "lows": [65000.0, 65800.0, 66800.0]},
                "channel": {"slope": 18.0, "lower": 67500.0, "mid": 68400.0, "upper": 69300.0, "position": 0.28},
                "priceChange": {"1": 0.001, "4": 0.004, "12": 0.011},
            },
            "4h": {
                "open": 66600.0,
                "high": 69000.0,
                "low": 65000.0,
                "close": price,
                "ema20": 67200.0,
                "ema50": 65800.0,
                "rsi14": 54.0,
                "atr14": 1600.0,
                "volumeZscore": 0.4,
                "trend": "bullish",
                "swings": {"highs": [65000.0, 67000.0, 69000.0], "lows": [62000.0, 64000.0, 66000.0]},
                "channel": {"slope": 45.0, "lower": 65500.0, "mid": 67500.0, "upper": 69500.0, "position": 0.63},
            },
        },
        "derivatives": {
            "openInterest": 123456.7,
            "fundingRate": 0.00004,
            "markPrice": price,
            "indexPrice": price * 0.9998,
            "openInterestStats": {
                "historyAvailable": True,
                "sumOpenInterest": 123456.7,
                "sumOpenInterestValue": 8395000000.0,
                "changePercent5m": 0.35,
                "changePercent30m": 0.9,
            },
            "fundingStats": {
                "historyAvailable": True,
                "absPercentile": 62.0,
                "latest": 0.00004,
                "averageAbs": 0.00003,
            },
            "longShortRatios": {
                "globalAccount": {"longAccount": 0.52, "shortAccount": 0.48, "longShortRatio": 1.08, "longSkew": 0.08},
                "topAccount": {"longAccount": 0.54, "shortAccount": 0.46, "longShortRatio": 1.17, "longSkew": 0.17},
                "topPosition": {"longAccount": 0.55, "shortAccount": 0.45, "longShortRatio": 1.22, "longSkew": 0.22},
            },
            "takerBuySell": {
                "buySellRatio": 1.08,
                "buyVol": 5600.0,
                "sellVol": 5185.0,
                "buyShare": 1.08 / 2.08,
            },
            "crowding": {
                "longCrowded": False,
                "shortCrowded": False,
                "crowdedSide": None,
                "oiChangePercent30m": 0.9,
                "fundingAbsPercentile": 62.0,
            },
        },
        "marketRegime": {
            "primary": "trend",
            "adx1h": 26.0,
            "adx4h": 24.0,
            "volumeZscore15m": 1.2,
            "priceChange1h": 0.001,
            "bollingerWidth1h": 1.8,
            "keltnerWidth1h": 2.1,
        },
    }


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "test.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_db_status(temp_db):
    status = db_status()
    assert status["status"] == "ok"
    assert "trader_run_logs" in status["tables"]
    assert "paper_orders" in status["tables"]
    assert "paper_positions" in status["tables"]
    assert "equity_snapshots" in status["tables"]
    assert "position_management_reviews" in status["tables"]
    assert "trader_agent_states" in status["tables"]


def test_active_trade_plan_requires_open_exposure(temp_db):
    with session_scope() as db:
        stale_plan = TradePlanRecord(
            run_id=1,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="PAPER_TRADING_PENDING",
            side="SHORT",
            risk_percent=0.7,
            payload_json=to_json({"status": "PAPER_TRADING_PENDING", "entries": [{"price": 73932.2}]}),
        )
        db.add(stale_plan)
        db.flush()

        assert list_active_trade_plans(db, "channel-rider", "BTCUSDT") == []
        assert latest_active_trade_plan(db, "channel-rider", "BTCUSDT") is None

        order = place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="short",
            order_type="limit",
            limit_price=73932.2,
            quantity=0.01,
            leverage=2,
            take_profit_price=71981.9,
            stop_loss_price=74636.9,
            payload={"tradePlanId": stale_plan.id},
        )

        assert [plan.id for plan in list_active_trade_plans(db, "channel-rider", "BTCUSDT")] == [stale_plan.id]

        order.status = "canceled"
        db.flush()

        assert list_active_trade_plans(db, "channel-rider", "BTCUSDT") == []
        assert latest_active_trade_plan(db, "channel-rider", "BTCUSDT") is None


def test_inactive_pending_plan_summary_is_not_reported_as_active():
    summary = suppress_inactive_pending_plan_summary(
        {
            "openOrders": 0,
            "openPositions": 0,
            "latestRunStatus": "no_candidate",
            "latestPlanStatus": "PAPER_TRADING_PENDING",
            "currentPlanKo": "최근 plan 상태: PAPER_TRADING_PENDING. 활성 paper 포지션은 없습니다.",
            "currentPlanEn": "Latest plan status: PAPER_TRADING_PENDING. No active paper exposure.",
        }
    )

    assert summary["latestPlanStatus"] is None
    assert summary["currentPlanKo"] == "최근 run 상태: no_candidate. 현재 활성 셋업은 없습니다."


def build_orderable_plan(candidate: TradeCandidate, leverage: int = 5) -> TradePlan:
    return TradePlan(
        status="PAPER_TRADING_PENDING",
        symbol="BTCUSDT",
        side=candidate.side,
        entries=candidate.entries,
        stopLoss=candidate.stopLoss,
        takeProfits=candidate.takeProfits,
        riskPercent=candidate.riskPercent,
        leverage=leverage,
    )


def build_sizing_settings(minimum: int = 10, maximum: int = 100):
    return SimpleNamespace(
        paper_default_equity=10000,
        paper_max_leverage=10,
        paper_maker_fee_rate=0.0002,
        paper_taker_fee_rate=0.0005,
        paper_slippage_rate=0.0001,
        paper_min_margin_deployment_percent=minimum,
        paper_max_margin_deployment_percent=maximum,
    )


def test_paper_order_sizing_uses_service_ten_percent_floor(temp_db):
    with session_scope() as db:
        candidate = TradeCandidate(
            created=True,
            side="LONG",
            setupType="TEST_SETUP",
            setupScore=45,
            entries=[
                EntryPlan(price=68000, weight=1.0, reason="single starter"),
            ],
            stopLoss=66000,
            takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
            riskPercent=0.7,
        )
        plan = build_orderable_plan(candidate)
        settings = build_sizing_settings(minimum=1, maximum=100)

        result = create_paper_orders_from_plan(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=plan,
            settings=settings,
        )

        total_margin = sum(order["quantity"] * order["limitPrice"] / order["leverage"] for order in result["created"])
        assert result["created"]
        assert result["marginDeploymentPercent"] == 10
        assert result["marginDeploymentPercent"] <= 100
        assert result["targetMarginBudget"] == pytest.approx(1000)
        assert total_margin >= 990
        assert result["actualMarginDeploymentPercent"] >= 9.9


def test_paper_order_sizing_can_use_full_equity_budget_for_high_score(temp_db):
    with session_scope() as db:
        candidate = TradeCandidate(
            created=True,
            side="LONG",
            setupType="TEST_SETUP",
            setupScore=100,
            entries=[
                EntryPlan(price=68000, weight=0.6, reason="first scale"),
                EntryPlan(price=67500, weight=0.4, reason="second scale"),
            ],
            stopLoss=66000,
            takeProfits=[TakeProfitPlan(price=72000, weight=1.0, reason="target")],
            riskPercent=0.7,
        )
        result = create_paper_orders_from_plan(
            db,
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=build_orderable_plan(candidate, leverage=5),
            settings=build_sizing_settings(minimum=10, maximum=100),
        )

        total_margin = sum(order["quantity"] * order["limitPrice"] / order["leverage"] for order in result["created"])
        assert result["created"]
        assert result["marginDeploymentPercent"] == 100
        assert result["targetMarginBudget"] <= 10000
        assert total_margin <= result["targetMarginBudget"]
        assert total_margin >= 9960
        assert result["actualMarginDeploymentPercent"] >= 99.6


def test_paper_order_payload_preserves_ai_review_rationale(temp_db):
    with session_scope() as db:
        candidate = TradeCandidate(
            created=True,
            side="SHORT",
            setupType="CHANNEL_UPPER_BAND_REJECTION",
            setupScore=82,
            entries=[EntryPlan(price=61416.2, weight=1.0, reason="15분 확인 캔들")],
            stopLoss=61985.1,
            takeProfits=[TakeProfitPlan(price=59080, weight=1.0, reason="채널 반대편")],
            riskPercent=0.7,
        )
        review = TradeReviewResult(
            decision="APPROVE",
            confidence=81,
            riskLevel="MEDIUM",
            approvalReason="AI는 상단 채널 실패와 하위 시간대 약세 전환이 겹쳐 이 대기 주문을 승인했습니다.",
            counterThesis="가격이 채널 위로 재진입하면 숏 논리는 무효화됩니다.",
            userSummary="상단 채널 리젝트 대기 주문입니다.",
            provider="gemini",
            model="gemini-test",
        )

        result = create_paper_orders_from_plan(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=build_orderable_plan(candidate, leverage=5),
            settings=build_sizing_settings(minimum=20, maximum=100),
            review=review,
        )

        assert result["created"]
        payload = result["created"][0]["payload"]
        assert payload["entryReason"] == "15분 확인 캔들"
        assert payload["aiApprovalReason"] == "AI는 상단 채널 실패와 하위 시간대 약세 전환이 겹쳐 이 대기 주문을 승인했습니다."
        assert payload["aiUserSummary"] == "상단 채널 리젝트 대기 주문입니다."
        assert payload["aiProvider"] == "gemini"


@pytest.mark.parametrize(
    ("raw_fraction", "expected_fraction"),
    [
        (0.01, 0.10),
        (1.50, 1.00),
    ],
)
def test_position_add_order_clamps_ai_fraction_to_service_band(temp_db, raw_fraction, expected_fraction):
    with session_scope() as db:
        order = place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="long",
            order_type="market",
            quantity=0.05,
            leverage=5,
            take_profit_price=70000,
            stop_loss_price=66000,
        )
        process_candle(db, "channel-rider", "BTCUSDT", {"open": 68000, "high": 68100, "low": 67900, "close": 68000})
        state = db.query(TraderStateRecord).filter_by(trader_id="channel-rider").one()
        position = db.query(PaperPositionRecord).filter_by(order_id=order.id, status="open").one()

        created = create_position_add_order(
            db,
            state=state,
            position=position,
            action=ManagementAction(type="ADD_TO_POSITION", price=68000, quantityFraction=raw_fraction, reason="test add"),
            mark_price=position.entry_price,
            reason="test add",
            result=None,
        )

        assert created is not None
        assert created["payload"]["quantityFraction"] == pytest.approx(expected_fraction)


@pytest.mark.asyncio
async def test_run_cycle_persists_snapshot_candidate_review_and_plan(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)
    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.persisted is True
    assert result.runId is not None
    assert result.recordIds["marketSnapshotId"] is not None
    assert result.recordIds["candidateTradeId"] is not None
    assert result.recordIds["aiReviewId"] is not None
    assert result.recordIds["tradePlanId"] is not None

    with session_scope() as db:
        assert len(list_records(db, MarketSnapshotRecord, 10)) == 1
        assert len(list_records(db, TraderRunLogRecord, 10)) == 1
        assert len(list_records(db, CandidateTradeRecord, 10)) == 1
        assert len(list_records(db, AIReviewRecord, 10)) == 1
        assert len(list_records(db, TradePlanRecord, 10)) == 1
        assert len(list_records(db, PaperOrderRecord, 10)) >= 1
        assert len(list_records(db, TraderStateRecord, 10)) == 1

    assert result.paper is not None
    assert result.recordIds["paperOrderIds"]
    assert result.paperOrders
    assert result.tradePlan.leverage is not None
    assert result.tradePlan.earlyExitRules


@pytest.mark.asyncio
async def test_run_cycle_manages_existing_pending_order_and_persists_review(monkeypatch, temp_db):
    snapshot = sample_snapshot()
    snapshot["price"] = 69000.0
    snapshot["timeframes"]["1m"] = {"close": 69000.0, "volume": 180.0}
    snapshot["timeframes"]["15m"]["close"] = 69000.0
    snapshot["timeframes"]["1h"]["channel"] = {
        "slope": 18.0,
        "lower": 67500.0,
        "mid": 68400.0,
        "upper": 69300.0,
        "position": 0.83,
    }

    async def fake_snapshot(client, symbol):
        return snapshot

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        order = place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=67500,
            quantity=0.01,
            leverage=2,
            take_profit_price=70000,
            stop_loss_price=66800,
        )
        order_id = order.id

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.managementReviews
    assert result.paper["managementReviews"]

    with session_scope() as db:
        original_order = db.get(PaperOrderRecord, order_id)
        assert original_order.status == "canceled"
        reviews = db.query(PositionManagementReviewRecord).all()
        assert len(reviews) == 1
        assert reviews[0].event_type == "channel_entry_stale"
        assert reviews[0].decision in {"CANCEL_PENDING_ORDER", "HOLD"}
        assert reviews[0].provider == "mock"
        agent_state = db.query(TraderAgentStateRecord).filter_by(trader_id="channel-rider", symbol="BTCUSDT").one()
        assert agent_state.phase == "PENDING_ORDER"
        assert agent_state.next_review_at is not None
        assert agent_state.last_review_id == reviews[0].id


def test_order_management_flags_target_missed_before_pending_entry_fill(temp_db):
    snapshot = sample_snapshot()
    snapshot["price"] = 70500.0
    snapshot["timeframes"]["15m"]["close"] = 70500.0

    with session_scope() as db:
        order = place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="long",
            order_type="limit",
            limit_price=67500,
            quantity=0.01,
            leverage=5,
            take_profit_price=70000,
            stop_loss_price=66800,
        )

        events = order_management_events("channel-rider", order, snapshot)

    assert events
    assert events[0].phase == "PENDING_ORDER"
    assert events[0].severity == "HIGH"
    assert events[0].suggestedAction == "CANCEL_PENDING_ORDER"
    assert events[0].metrics["takeProfit"] == 70000.0


@pytest.mark.asyncio
async def test_run_cycle_heartbeat_reviews_active_position_without_event(monkeypatch, temp_db):
    snapshot = sample_snapshot()
    snapshot["price"] = 68100.0
    snapshot["timeframes"]["1m"] = {"open": 68100.0, "high": 68120.0, "low": 68020.0, "close": 68100.0, "volume": 180.0}
    snapshot["timeframes"]["15m"]["close"] = 68100.0
    snapshot["timeframes"]["1h"]["channel"] = {
        "slope": 18.0,
        "lower": 67500.0,
        "mid": 68400.0,
        "upper": 69300.0,
        "position": 0.4,
    }

    async def fake_snapshot(client, symbol):
        return snapshot

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="long",
            order_type="market",
            quantity=0.01,
            leverage=2,
            take_profit_price=70000,
            stop_loss_price=66800,
        )
        from app.paper.engine import process_candle

        process_candle(db, "channel-rider", "BTCUSDT", {"open": 68000, "high": 68120, "low": 67980, "close": 68100})
        position = db.query(PaperPositionRecord).filter_by(trader_id="channel-rider", symbol="BTCUSDT", status="open").one()
        old = datetime.now(timezone.utc) - timedelta(seconds=360)
        position.created_at = old
        position.updated_at = old

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.tradePlan.status == "ACTIVE_PAPER_EXPOSURE"
    assert result.managementReviews
    review = result.managementReviews[0]
    assert review["eventType"] == "channel_rider_position_heartbeat"
    assert review["agentState"]["phase"] == "OPEN_POSITION"

    with session_scope() as db:
        agent_state = db.query(TraderAgentStateRecord).filter_by(trader_id="channel-rider", symbol="BTCUSDT").one()
        assert agent_state.mode in {"ACTIVE_REVIEW", "PROFIT_MANAGEMENT", "RISK_MANAGEMENT", "DEFENSIVE"}
        assert agent_state.last_decision is not None


@pytest.mark.asyncio
async def test_heartbeat_reviews_each_pending_order_independently(monkeypatch, temp_db):
    snapshot = sample_snapshot()
    snapshot["price"] = 68000.0
    snapshot["timeframes"]["1m"] = {"open": 68000.0, "high": 68020.0, "low": 67980.0, "close": 68000.0, "volume": 180.0}
    snapshot["timeframes"]["15m"]["close"] = 68000.0
    snapshot["timeframes"]["1h"]["ema50"] = 67000.0

    async def fake_snapshot(client, symbol):
        return snapshot

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        old = datetime.now(timezone.utc) - timedelta(seconds=360)
        order_ids = []
        for index, limit_price in enumerate([67600, 67500, 67400, 67300]):
            order = place_paper_order(
                db,
                trader_id="pullback-architect",
                symbol="BTCUSDT",
                side="long",
                order_type="limit",
                limit_price=limit_price,
                quantity=0.01 + index * 0.001,
                leverage=5,
                take_profit_price=69000,
                stop_loss_price=66800,
            )
            order.submitted_at = old
            order.created_at = old
            order.updated_at = old
            order_ids.append(order.id)

    result = await run_trader_cycle("pullback-architect", "BTCUSDT", provider_override="mock")

    reviewed_order_ids = {review["orderId"] for review in result.managementReviews}
    assert reviewed_order_ids == set(order_ids)

    with session_scope() as db:
        reviews = db.query(PositionManagementReviewRecord).filter_by(
            trader_id="pullback-architect",
            symbol="BTCUSDT",
            event_type="pullback_architect_pending_heartbeat",
        ).all()
        assert {review.order_id for review in reviews} == set(order_ids)


@pytest.mark.asyncio
async def test_run_cycle_price_shock_uses_fast_market_review(monkeypatch, temp_db):
    snapshot = sample_snapshot()
    snapshot["price"] = 67550.0
    snapshot["timeframes"]["1m"] = {"open": 68100.0, "high": 68120.0, "low": 67500.0, "close": 67550.0, "volume": 280.0}
    snapshot["timeframes"]["15m"]["close"] = 67550.0
    snapshot["system"] = {
        "priceShock": {
            "active": True,
            "symbol": "BTCUSDT",
            "previousPrice": 68100.0,
            "currentPrice": 67550.0,
            "priceChangePercent": -0.8076,
            "absPriceChangePercent": 0.8076,
            "direction": "DOWN",
            "thresholdPercent": 0.7,
            "reviewSeconds": 120,
            "reviewCycles": 5,
            "reviewsRemaining": 5,
            "sequence": 1,
        }
    }

    async def fake_snapshot(client, symbol):
        return snapshot

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="long",
            order_type="market",
            quantity=0.01,
            leverage=5,
            take_profit_price=70000,
            stop_loss_price=66800,
        )
        from app.paper.engine import process_candle

        process_candle(db, "channel-rider", "BTCUSDT", {"open": 68000, "high": 68120, "low": 67500, "close": 67550})

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.tradePlan.status == "ACTIVE_PAPER_EXPOSURE"
    assert result.managementReviews
    review = result.managementReviews[0]
    assert review["eventType"] == "common_price_shock"
    assert review["agentState"]["mode"] == "FAST_MARKET_REVIEW"
    assert review["agentState"]["payload"]["review"]["nextReviewInSeconds"] == 120


@pytest.mark.asyncio
async def test_ai_rejection_cooldown_skips_new_first_stage_scan(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        db.add(
            AIReviewRecord(
                symbol="BTCUSDT",
                trader_id="channel-rider",
                status="ok",
                provider="mock",
                model="mock-reviewer-v1",
                decision="REJECT",
                confidence=30,
                risk_level="HIGH",
                created_at=datetime.now(timezone.utc),
                payload_json="{}",
                raw_json="{}",
            )
        )

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.tradePlan.status == "AI_REVIEW_COOLDOWN"
    assert result.aiReview is None
    assert result.candidate.created is False
    assert "paused" in result.candidate.reason

    with session_scope() as db:
        latest_run = list_records(db, TraderRunLogRecord, 10)[0]
        assert latest_run["status"] == "ai_review_cooldown"


@pytest.mark.asyncio
async def test_scanner_once_checks_btc_traders_and_persists_runs(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        assert symbol == "BTCUSDT"
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)
    result = await run_scanner_once(symbols=["BTCUSDT"], provider="mock", locale="ko", defer_leaderboard_refresh=False)

    assert result["symbols"] == ["BTCUSDT"]
    assert result["counts"]["tradersChecked"] == 10
    assert result["counts"]["candidates"] >= 1
    assert result["counts"]["aiReviews"] >= 1
    assert result["durationBreakdownMs"]["prefilterDbMs"] >= 0
    assert result["durationBreakdownMs"]["runCycleMs"] >= 0
    assert result["symbolBreakdown"]["BTCUSDT"]["candidateJobs"] >= 1
    assert all(item["symbol"] == "BTCUSDT" for item in result["results"])

    with session_scope() as db:
        assert len(list_records(db, TraderRunLogRecord, 20)) == result["counts"]["candidates"]
        assert len(list_records(db, MarketSnapshotRecord, 20)) == result["counts"]["candidates"]


def test_gemini_without_key_falls_back_to_mock():
    provider = get_ai_provider(Settings(ai_provider="gemini", gemini_api_key=""), "gemini")
    assert isinstance(provider, MockAIProvider)
    assert provider.fallback is True
