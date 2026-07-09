import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

import app.main as main_module
from app.ai.factory import get_ai_provider
from app.ai.context import build_management_review_context
from app.ai.mock_provider import MockAIProvider
from app.core.config import Settings
from app.db import (
    AIReviewRecord,
    CandidateTradeRecord,
    EquitySnapshotRecord,
    MarketSnapshotRecord,
    ObservationCandidateRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    RiskSettingsRecord,
    SubscriberPreferenceRecord,
    TelegramAlertDeliveryRecord,
    TradeEventRecord,
    TradePlanRecord,
    TraderAgentStateRecord,
    TraderLeaderboardSnapshotRecord,
    TraderStateRecord,
    TraderRunLogRecord,
    db_status,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.ops.trader_history_reset import RESET_CONFIRMATION_TEXT, reset_trader_history
from app.paper.engine import process_candle, place_paper_order
from app.paper.loss_discipline import latest_post_loss_cooldown, recent_loss_review_context
from app.paper.management import order_management_events
from app.paper.management_actions import create_position_add_order
from app.paper.planner import create_paper_orders_from_plan
from app.paper.plan_state import latest_active_trade_plan, list_active_trade_plans
from app.main import (
    process_existing_paper_exposure,
    run_scanner_once,
    run_trader_cycle,
    suppress_inactive_pending_plan_summary,
)
from app.repositories import list_records
from app.repositories import (
    create_ai_review,
    create_candidate_trade,
    create_market_snapshot,
    create_position_management_review,
    create_trade_plan,
    create_trader_run_log,
    to_json,
    update_trader_run_log,
    upsert_trader_agent_state,
)
from app.traders.models import (
    EntryPlan,
    ManagementAction,
    ReviewFact,
    TakeProfitPlan,
    TradeCandidate,
    TradePlan,
    TradeReviewResult,
)
from app.traders.registry import list_scanner_traders


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


def seed_closed_position(
    db,
    *,
    trader_id: str = "channel-rider",
    symbol: str = "BTCUSDT",
    close_reason: str = "stop_loss",
    realized_pnl: Decimal = Decimal("-42.5"),
    closed_at: datetime | None = None,
) -> PaperPositionRecord:
    position = PaperPositionRecord(
        trader_id=trader_id,
        symbol=symbol,
        status="closed",
        side="long",
        quantity=Decimal("0.01"),
        entry_price=Decimal("68000"),
        leverage=Decimal("5"),
        notional=Decimal("3400"),
        margin=Decimal("680"),
        exit_price=Decimal("67150"),
        exit_fee=Decimal("1.2"),
        realized_pnl=realized_pnl,
        unrealized_pnl=Decimal("0"),
        take_profit_price=Decimal("70000"),
        stop_loss_price=Decimal("67200"),
        close_reason=close_reason,
        opened_at=(closed_at or datetime.now(timezone.utc)) - timedelta(minutes=30),
        closed_at=closed_at or datetime.now(timezone.utc),
        payload_json=to_json({"source": "test"}),
    )
    db.add(position)
    db.flush()
    return position


def test_post_loss_reentry_cooldown_blocks_recent_stop_loss(temp_db):
    with session_scope() as db:
        position = seed_closed_position(db)
        cooldown = latest_post_loss_cooldown(db, "channel-rider", "BTCUSDT", cooldown_seconds=900)

    assert cooldown is not None
    assert cooldown["positionId"] == position.id
    assert cooldown["closeReason"] == "stop_loss"
    assert cooldown["remainingSeconds"] > 0
    assert cooldown["cooldownSeconds"] == 900


def test_post_loss_reentry_cooldown_ignores_profitable_and_take_profit_exits(temp_db):
    with session_scope() as db:
        seed_closed_position(db, trader_id="channel-rider", close_reason="take_profit", realized_pnl=Decimal("70"))
        seed_closed_position(db, trader_id="volume-breaker", close_reason="stop_loss", realized_pnl=Decimal("12"))

        assert latest_post_loss_cooldown(db, "channel-rider", "BTCUSDT", cooldown_seconds=900) is None
        assert latest_post_loss_cooldown(db, "volume-breaker", "BTCUSDT", cooldown_seconds=900) is None


def test_recent_loss_review_context_is_compact_and_limited(temp_db):
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        seed_closed_position(db, close_reason="stop_loss", realized_pnl=Decimal("-42.5"), closed_at=now - timedelta(minutes=6))
        seed_closed_position(db, close_reason="early_thesis_failure", realized_pnl=Decimal("-18.2"), closed_at=now - timedelta(minutes=18))
        seed_closed_position(db, close_reason="stop_loss", realized_pnl=Decimal("-11.4"), closed_at=now - timedelta(minutes=30))
        seed_closed_position(db, close_reason="take_profit", realized_pnl=Decimal("24.0"), closed_at=now - timedelta(minutes=42))
        seed_closed_position(db, close_reason="stop_loss", realized_pnl=Decimal("-9.0"), closed_at=now - timedelta(minutes=54))

        reviews = recent_loss_review_context(db, "channel-rider", "BTCUSDT", limit=3)

    assert len(reviews) == 3
    assert [review["closeReason"] for review in reviews] == ["stop_loss", "early_thesis_failure", "stop_loss"]
    assert all(len(review["summary"]) <= 180 for review in reviews)
    assert all("entryPrice" in review and "exitPrice" in review for review in reviews)


def seed_trader_history_for_reset(db) -> dict[str, int]:
    subscriber = SubscriberPreferenceRecord(
        trader_id=None,
        symbol=None,
        status="active",
        user_id="google-reset",
        email="reset@example.com",
        subscription_status="active",
        favorite_trader_ids_json=to_json(["channel-rider"]),
        telegram_enabled=True,
        telegram_chat_id="123456789",
        telegram_event_types_json=to_json(["entry", "exit"]),
        telegram_min_return_pct=0,
        locale="ko",
    )
    db.add(subscriber)
    db.flush()

    market = create_market_snapshot(db, "BTCUSDT", sample_snapshot())
    run = create_trader_run_log(db, "BTCUSDT", "channel-rider", "mock", payload={"source": "reset-test"})
    seeded_candidate = TradeCandidate(
        created=False,
        reason="test",
        setupScore=0,
    )
    candidate = create_candidate_trade(
        db,
        run.id,
        "BTCUSDT",
        "channel-rider",
        seeded_candidate,
    )
    seeded_review = TradeReviewResult(
        decision="REJECT",
        confidence=32,
        riskLevel="HIGH",
        approvalReason="Rejected.",
        counterThesis="No edge.",
        userSummary="Legacy summary.",
    )
    review = create_ai_review(
        db,
        run.id,
        "BTCUSDT",
        "channel-rider",
        seeded_review,
    )
    db.add(
        ObservationCandidateRecord(
            run_id=run.id,
            candidate_trade_id=candidate.id,
            ai_review_id=review.id,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="observed",
            observation_type="OBSERVE_ONLY",
            side="long",
            setup_type="TEST_OBSERVATION",
            setup_score=71,
            decision="WATCH",
            entry_price=68000,
            stop_loss=67000,
            first_take_profit=70000,
        )
    )
    seeded_plan = TradePlan(status="REJECTED", symbol="BTCUSDT", notes=["test"])
    plan = create_trade_plan(
        db,
        run.id,
        "BTCUSDT",
        "channel-rider",
        seeded_plan,
    )
    update_trader_run_log(
        db,
        run,
        status="completed",
        payload={
            "candidate": seeded_candidate.model_dump(),
            "aiReview": seeded_review.model_dump(),
            "tradePlan": seeded_plan.model_dump(),
        },
        market_snapshot_id=market.id,
        candidate_trade_id=candidate.id,
        ai_review_id=review.id,
        trade_plan_id=plan.id,
    )

    order = PaperOrderRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="open",
        side="long",
        order_type="limit",
        fee_type="maker",
        quantity=Decimal("0.01"),
        leverage=Decimal("5"),
        limit_price=Decimal("68000"),
        take_profit_price=Decimal("70000"),
        stop_loss_price=Decimal("67000"),
        payload_json=to_json({"source": "reset-test"}),
    )
    db.add(order)
    db.flush()
    position = PaperPositionRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="closed",
        order_id=order.id,
        side="long",
        quantity=Decimal("0.01"),
        entry_price=Decimal("68000"),
        leverage=Decimal("5"),
        notional=Decimal("3400"),
        margin=Decimal("680"),
        exit_price=Decimal("67200"),
        exit_fee=Decimal("1"),
        realized_pnl=Decimal("-41"),
        unrealized_pnl=Decimal("0"),
        take_profit_price=Decimal("70000"),
        stop_loss_price=Decimal("67200"),
        close_reason="stop_loss",
        opened_at=datetime.now(timezone.utc) - timedelta(hours=1),
        closed_at=datetime.now(timezone.utc),
        payload_json=to_json({"source": "reset-test"}),
    )
    db.add(position)
    db.flush()
    event = TradeEventRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="recorded",
        event_type="STOP_LOSS",
        order_id=order.id,
        position_id=position.id,
        price=Decimal("67200"),
        quantity=Decimal("0.01"),
        fee=Decimal("1"),
        realized_pnl=Decimal("-41"),
        payload_json=to_json({"source": "reset-test"}),
    )
    db.add(event)
    db.flush()
    delivery = TelegramAlertDeliveryRecord(
        subscriber_preference_id=subscriber.id,
        trade_event_id=event.id,
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="sent",
        telegram_event_type="exit",
        chat_id="123456789",
        payload_json=to_json({"message": "test"}),
    )
    db.add(delivery)
    mgmt = PositionManagementReviewRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="ok",
        order_id=order.id,
        position_id=position.id,
        event_type="heartbeat",
        phase="OPEN_POSITION",
        provider="mock",
        model="mock-position-manager",
        decision="HOLD",
        confidence=72,
        action_type="HOLD",
        payload_json=to_json({"review": {"rationale": "test"}}),
    )
    db.add(mgmt)
    db.flush()
    upsert_trader_agent_state(
        db,
        symbol="BTCUSDT",
        trader_id="channel-rider",
        phase="OPEN_POSITION",
        mode="WATCHING",
        last_review_id=mgmt.id,
    )
    db.add(
        TraderLeaderboardSnapshotRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="active",
            trader_name="Channel Cartographer",
        )
    )
    db.add(
        TraderStateRecord(
            trader_id="channel-rider",
            status="active",
            cash_balance=Decimal("9950"),
            equity=Decimal("9950"),
            margin_used=Decimal("0"),
            realized_pnl=Decimal("-50"),
            unrealized_pnl=Decimal("0"),
            total_fees=Decimal("2"),
        )
    )
    db.add(
        RiskSettingsRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="active",
            initial_equity=Decimal("10000"),
            max_leverage=Decimal("10"),
            maker_fee_rate=Decimal("0.0002"),
            taker_fee_rate=Decimal("0.0005"),
        )
    )
    db.add(
        EquitySnapshotRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            cash_balance=Decimal("9950"),
            equity=Decimal("9950"),
            margin_used=Decimal("0"),
            realized_pnl=Decimal("-50"),
            unrealized_pnl=Decimal("0"),
            total_fees=Decimal("2"),
            candle_time=datetime.now(timezone.utc),
        )
    )
    db.flush()
    return {"subscriberId": subscriber.id, "tradeEventId": event.id, "deliveryId": delivery.id}


def trader_history_counts(db) -> dict[str, int]:
    models = {
        "market_snapshots": MarketSnapshotRecord,
        "trader_run_logs": TraderRunLogRecord,
        "candidate_trades": CandidateTradeRecord,
        "observation_candidates": ObservationCandidateRecord,
        "ai_reviews": AIReviewRecord,
        "trade_plans": TradePlanRecord,
        "position_management_reviews": PositionManagementReviewRecord,
        "trader_agent_states": TraderAgentStateRecord,
        "trader_leaderboard_snapshots": TraderLeaderboardSnapshotRecord,
        "trader_states": TraderStateRecord,
        "risk_settings": RiskSettingsRecord,
        "paper_orders": PaperOrderRecord,
        "paper_positions": PaperPositionRecord,
        "trade_events": TradeEventRecord,
        "telegram_alert_deliveries": TelegramAlertDeliveryRecord,
        "equity_snapshots": EquitySnapshotRecord,
        "subscriber_preferences": SubscriberPreferenceRecord,
    }
    return {table: db.query(model).count() for table, model in models.items()}


def test_trader_history_reset_dry_run_counts_without_mutation(temp_db):
    with session_scope() as db:
        seed_trader_history_for_reset(db)
        before = trader_history_counts(db)
        result = reset_trader_history(db, trader_ids=["channel-rider"], symbols=["BTCUSDT"], dry_run=True)
        after = trader_history_counts(db)

    assert result["dryRun"] is True
    assert result["executed"] is False
    assert result["resettableCounts"]["trade_events"] == 1
    assert result["resettableCounts"]["telegram_alert_deliveries"] == 1
    assert result["resettableCounts"]["observation_candidates"] == 1
    assert result["preservedTables"] == ["subscriber_preferences"]
    assert after == before


def test_trader_history_reset_preserves_subscriber_preferences(temp_db):
    with session_scope() as db:
        ids = seed_trader_history_for_reset(db)
        result = reset_trader_history(
            db,
            trader_ids=["channel-rider"],
            symbols=["BTCUSDT"],
            dry_run=False,
            confirmation_text=RESET_CONFIRMATION_TEXT,
        )
        after = trader_history_counts(db)
        subscriber = db.get(SubscriberPreferenceRecord, ids["subscriberId"])

    assert result["executed"] is True
    assert after["subscriber_preferences"] == 1
    assert subscriber is not None
    assert subscriber.favorite_trader_ids_json == to_json(["channel-rider"])
    for table, count in after.items():
        if table != "subscriber_preferences":
            assert count == 0, table


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


def test_paper_order_sizing_lifts_margin_for_high_confidence_review(temp_db):
    with session_scope() as db:
        candidate = TradeCandidate(
            created=True,
            side="LONG",
            setupType="TEST_SETUP",
            setupScore=70,
            entries=[
                EntryPlan(price=68000, weight=1.0, reason="single starter"),
            ],
            stopLoss=66000,
            takeProfits=[TakeProfitPlan(price=72400, weight=1.0, reason="target")],
            riskPercent=1.0,
        )
        review = TradeReviewResult(
            decision="ADJUST_AND_APPROVE",
            confidence=92,
            riskLevel="MEDIUM",
            riskPercentOverride=1.8,
            approvalReason="Clean setup with strong RR.",
            counterThesis="Invalid if structure fails.",
        )

        result = create_paper_orders_from_plan(
            db,
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            run_id=1,
            trade_plan_id=1,
            candidate=candidate,
            plan=build_orderable_plan(candidate, leverage=6),
            settings=build_sizing_settings(minimum=10, maximum=100),
            review=review,
        )

        assert result["created"]
        assert result["marginDeploymentPercent"] == pytest.approx(60)
        assert result["targetMarginBudget"] == pytest.approx(6000)


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
            reviewFacts=[
                ReviewFact(
                    code="entry_geometry_checked",
                    labelKey="reviewFact.entryGeometryChecked",
                    value="상단 채널 실패 확인",
                )
            ],
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
        assert payload["aiReviewCode"] == "ENTRY_REVIEW"
        assert payload["aiReviewFacts"]
        assert "aiUserSummary" not in payload
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
    provider_transaction_states: list[bool] = []
    orders_visible_before_status_feed: list[bool] = []

    async def fake_snapshot(client, symbol):
        return sample_snapshot()

    async def fake_review(review_db, payload, provider_name, *, settings):
        provider_transaction_states.append(review_db.in_transaction())
        return await MockAIProvider().review_trade_candidate(payload)

    async def fake_pending_status_feed(db, *, settings, plan, created_orders):
        order_ids = [order["id"] for order in created_orders]
        with session_scope() as verification_db:
            persisted = verification_db.query(PaperOrderRecord).filter(PaperOrderRecord.id.in_(order_ids)).count()
        orders_visible_before_status_feed.append(persisted == len(order_ids))
        return None

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)
    monkeypatch.setattr("app.main.run_review_with_logging", fake_review)
    monkeypatch.setattr("app.main.create_status_feed_for_pending_trade_plan", fake_pending_status_feed)
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
    assert provider_transaction_states == [False]
    assert orders_visible_before_status_feed == [True]


@pytest.mark.asyncio
async def test_run_cycle_uses_recent_loss_as_review_context_without_blocking(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        seed_closed_position(db, trader_id="channel-rider", close_reason="stop_loss")

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.tradePlan is not None
    assert result.tradePlan.status != "POST_LOSS_COOLDOWN"
    assert result.recordIds["aiReviewId"] is not None
    assert result.aiReview is not None
    assert any(fact.code == "loss_discipline_checked" for fact in result.aiReview.reviewFacts)


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
async def test_position_management_releases_transaction_before_execution_lock_and_provider(monkeypatch, temp_db):
    snapshot = sample_snapshot()
    snapshot["price"] = 68100.0
    snapshot["timeframes"]["1m"] = {
        "open": 68100.0,
        "high": 68120.0,
        "low": 68020.0,
        "close": 68100.0,
        "volume": 180.0,
    }
    snapshot["timeframes"]["15m"]["close"] = 68100.0

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
        process_candle(
            db,
            "channel-rider",
            "BTCUSDT",
            {"open": 68000, "high": 68120, "low": 67980, "close": 68100},
        )
        position = db.query(PaperPositionRecord).filter_by(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="open",
        ).one()
        position.created_at = datetime.now(timezone.utc) - timedelta(minutes=10)

    lock_transaction_states: list[bool] = []
    provider_transaction_states: list[bool] = []

    with session_scope() as db:
        class InspectingLock:
            async def __aenter__(self):
                lock_transaction_states.append(db.in_transaction())

            async def __aexit__(self, exc_type, exc, traceback):
                return False

        async def fake_management_review(review_db, payload, provider_name, *, settings):
            provider_transaction_states.append(review_db.in_transaction())
            return await MockAIProvider().review_position_management(payload)

        monkeypatch.setattr(main_module, "PAPER_EXECUTION_LOCK", InspectingLock())
        monkeypatch.setattr(main_module, "run_position_management_with_logging", fake_management_review)
        result = await process_existing_paper_exposure(
            db,
            "channel-rider",
            "BTCUSDT",
            snapshot,
            "mock",
            "ko",
        )

    assert result["managementReviews"]
    assert lock_transaction_states == [False, False]
    assert provider_transaction_states == [False]


@pytest.mark.asyncio
async def test_open_position_suppresses_passive_pending_order_heartbeat(monkeypatch, temp_db):
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
        process_candle(db, "channel-rider", "BTCUSDT", {"open": 68000, "high": 68120, "low": 67980, "close": 68100})
        position = db.query(PaperPositionRecord).filter_by(trader_id="channel-rider", symbol="BTCUSDT", status="open").one()
        pending_order = place_paper_order(
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
        old = datetime.now(timezone.utc) - timedelta(seconds=360)
        position.created_at = old
        position.updated_at = old
        pending_order.created_at = old
        pending_order.submitted_at = old
        pending_order.updated_at = old

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    review_event_types = [review["eventType"] for review in result.managementReviews]
    assert review_event_types == ["channel_rider_position_heartbeat"]

    with session_scope() as db:
        pending_reviews = db.query(PositionManagementReviewRecord).filter_by(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            event_type="channel_rider_pending_heartbeat",
        ).all()
        assert pending_reviews == []


def test_management_context_skips_provider_failure_review_contamination(temp_db):
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        db.add(
            PositionManagementReviewRecord(
                trader_id="donchian-breakout",
                symbol="BTCUSDT",
                status="ok",
                event_type="donchian_breakout_position_heartbeat",
                phase="OPEN_POSITION",
                provider="openai",
                model="gpt-4.1-nano",
                decision="HOLD",
                confidence=35,
                action_type="HOLD",
                created_at=now - timedelta(minutes=2),
                payload_json=to_json(
                    {
                        "review": {
                            "rationale": "Provider failure prevents reliable assessment.",
                            "riskFlags": ["provider_failed"],
                        }
                    }
                ),
            )
        )
        db.add(
            PositionManagementReviewRecord(
                trader_id="donchian-breakout",
                symbol="BTCUSDT",
                status="ok",
                event_type="donchian_breakout_position_heartbeat",
                phase="OPEN_POSITION",
                provider="openai",
                model="gpt-4.1-nano",
                decision="HOLD",
                confidence=78,
                action_type="HOLD",
                created_at=now - timedelta(minutes=5),
                payload_json=to_json(
                    {
                        "review": {
                            "rationale": "Range expansion is still valid while price holds the breakout boundary.",
                            "riskFlags": ["breakout_boundary_watch"],
                        }
                    }
                ),
            )
        )
        db.flush()

        context = build_management_review_context(db, "donchian-breakout", "BTCUSDT")

    reviews = context["recentManagementReviews"]
    assert [review["rationale"] for review in reviews] == [
        "Range expansion is still valid while price holds the breakout boundary."
    ]
    assert reviews[0]["riskFlags"] == ["breakout_boundary_watch"]


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
    assert reviewed_order_ids == {order_ids[0]}

    with session_scope() as db:
        reviews = db.query(PositionManagementReviewRecord).filter_by(
            trader_id="pullback-architect",
            symbol="BTCUSDT",
            event_type="pullback_architect_pending_heartbeat",
        ).all()
        assert {review.order_id for review in reviews} == {order_ids[0]}


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
async def test_post_loss_context_does_not_skip_run_cycle_candidate_generation(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        seed_closed_position(db)

    result = await run_trader_cycle("channel-rider", "BTCUSDT", provider_override="mock")

    assert result.tradePlan.status != "POST_LOSS_COOLDOWN"
    assert result.aiReview is not None
    assert result.candidate.created is True

    with session_scope() as db:
        latest_run = list_records(db, TraderRunLogRecord, 10)[0]
        assert latest_run["status"] != "post_loss_cooldown"


@pytest.mark.asyncio
async def test_post_loss_context_does_not_skip_scanner_candidate_generation(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)

    with session_scope() as db:
        seed_closed_position(db)

    result = await run_scanner_once(symbols=["BTCUSDT"], provider="mock", locale="ko", defer_leaderboard_refresh=False)
    channel_results = [item for item in result["results"] if item.get("traderId") == "channel-rider"]

    assert channel_results
    assert channel_results[0]["status"] != "POST_LOSS_COOLDOWN"
    assert channel_results[0]["candidateCreated"] is True
    assert result["counts"]["cooldowns"] == 0
    assert result["symbolBreakdown"]["BTCUSDT"]["candidateJobs"] >= 1


@pytest.mark.asyncio
async def test_scanner_once_checks_btc_traders_and_persists_runs(monkeypatch, temp_db):
    async def fake_snapshot(client, symbol):
        assert symbol == "BTCUSDT"
        return sample_snapshot()

    monkeypatch.setattr("app.main.build_market_snapshot", fake_snapshot)
    result = await run_scanner_once(symbols=["BTCUSDT"], provider="mock", locale="ko", defer_leaderboard_refresh=False)

    assert result["symbols"] == ["BTCUSDT"]
    assert result["counts"]["tradersChecked"] == len(list_scanner_traders())
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
