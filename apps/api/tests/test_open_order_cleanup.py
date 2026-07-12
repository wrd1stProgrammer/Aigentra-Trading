import json
from decimal import Decimal

import pytest
from sqlalchemy import select, text

from app.db import (
    AIReviewRecord,
    AITranslationCacheRecord,
    CandidateTradeRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    SubscriberPreferenceRecord,
    TelegramAlertDeliveryRecord,
    TradeEventRecord,
    TradePlanRecord,
    TraderRunLogRecord,
    TraderStatusFeedRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.ops.open_order_cleanup import cleanup_open_pending_orders
from app.subscribers import TelegramSettingsInput, upsert_subscriber_preferences


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "open-order-cleanup.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    with session_scope() as db:
        db.execute(text("PRAGMA foreign_keys=ON"))
    try:
        yield db_path
    finally:
        reset_db_engine("sqlite:///:memory:")
        init_db()


def _order(*, status: str, run_id: int, plan_id: int, review_id: int) -> PaperOrderRecord:
    return PaperOrderRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status=status,
        side="long",
        order_type="limit",
        fee_type="maker",
        quantity=Decimal("0.10"),
        leverage=Decimal("5"),
        limit_price=Decimal("64000"),
        stop_loss_price=Decimal("63000"),
        take_profit_price=Decimal("66000"),
        payload_json=json.dumps({"runId": run_id, "tradePlanId": plan_id, "aiReviewId": review_id}),
    )


def _lineage(db, suffix: str):
    run = TraderRunLogRecord(trader_id="channel-rider", symbol="BTCUSDT", status=f"run-{suffix}")
    db.add(run)
    db.flush()
    candidate = CandidateTradeRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="created",
        run_id=run.id,
        setup_type="channel-edge",
        side="long",
        setup_score=80,
    )
    review = AIReviewRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="ok",
        run_id=run.id,
        decision="APPROVE",
        confidence=80,
        risk_level="MEDIUM",
        fallback=False,
    )
    plan = TradePlanRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="approved",
        run_id=run.id,
        side="long",
        risk_percent=1.0,
    )
    db.add_all([candidate, review, plan])
    db.flush()
    run.candidate_trade_id = candidate.id
    run.ai_review_id = review.id
    run.trade_plan_id = plan.id
    return run, candidate, review, plan


def test_cleanup_dry_run_is_immutable_and_destructive_run_requires_exact_token(temp_db):
    with session_scope() as db:
        run, _candidate, review, plan = _lineage(db, "exclusive")
        order = _order(status="open", run_id=run.id, plan_id=plan.id, review_id=review.id)
        db.add(order)
        db.flush()

        preview = cleanup_open_pending_orders(db, dry_run=True)

        assert preview["targetOrderIds"] == [order.id]
        assert preview["executed"] is False
        assert db.get(PaperOrderRecord, order.id) is not None
        with pytest.raises(ValueError, match="OPEN_ORDER_CLEANUP_EXPECTED_IDS_REQUIRED"):
            cleanup_open_pending_orders(db, dry_run=False, confirmation_token="wrong")
        with pytest.raises(ValueError, match="OPEN_ORDER_CLEANUP_CONFIRMATION_REQUIRED"):
            cleanup_open_pending_orders(
                db,
                dry_run=False,
                confirmation_token="wrong",
                expected_order_ids=preview["targetOrderIds"],
            )
        assert db.get(PaperOrderRecord, order.id) is not None


def test_cleanup_removes_direct_graph_but_preserves_shared_lineage_and_positions(temp_db):
    with session_scope() as db:
        shared_run, shared_candidate, shared_review, shared_plan = _lineage(db, "shared")
        exclusive_run, exclusive_candidate, exclusive_review, exclusive_plan = _lineage(db, "exclusive")
        target_shared = _order(
            status="open",
            run_id=shared_run.id,
            plan_id=shared_plan.id,
            review_id=shared_review.id,
        )
        surviving_order = _order(
            status="filled",
            run_id=shared_run.id,
            plan_id=shared_plan.id,
            review_id=shared_review.id,
        )
        target_exclusive = _order(
            status="pending",
            run_id=exclusive_run.id,
            plan_id=exclusive_plan.id,
            review_id=exclusive_review.id,
        )
        db.add_all([target_shared, surviving_order, target_exclusive])
        db.flush()
        position = PaperPositionRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="open",
            order_id=surviving_order.id,
            side="long",
            quantity=Decimal("0.10"),
            entry_price=Decimal("64000"),
            leverage=Decimal("5"),
            notional=Decimal("6400"),
            margin=Decimal("1280"),
            entry_fee=Decimal("1.28"),
            payload_json=surviving_order.payload_json,
        )
        event = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type="paper_order_created",
            order_id=target_exclusive.id,
            price=Decimal("64000"),
            quantity=Decimal("0.10"),
        )
        db.add_all([position, event])
        db.flush()
        linked_position = PaperPositionRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="open",
            order_id=target_shared.id,
            side="long",
            quantity=Decimal("0.05"),
            entry_price=Decimal("64100"),
            leverage=Decimal("5"),
            notional=Decimal("3205"),
            margin=Decimal("641"),
            entry_fee=Decimal("0.641"),
            payload_json=target_shared.payload_json,
        )
        db.add(linked_position)
        db.flush()
        linked_event = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type="order_filled",
            order_id=target_shared.id,
            position_id=linked_position.id,
            price=Decimal("64100"),
            quantity=Decimal("0.05"),
        )
        linked_review = PositionManagementReviewRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            order_id=target_shared.id,
            position_id=linked_position.id,
            event_type="position_heartbeat",
            phase="OPEN_POSITION",
            decision="HOLD",
            action_type="HOLD",
            fallback=False,
        )
        db.add_all([linked_event, linked_review])
        db.flush()
        feed = TraderStatusFeedRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            state_key="pending_entry",
            event_type="pending_entry_created",
            source_type="paper_order",
            source_id=target_exclusive.id,
            refresh_reason="event",
            provider="openai",
            model="fake",
            fallback=False,
            payload_json='{"headline":"Pending","message":"Waiting."}',
        )
        db.add(feed)
        db.flush()
        translation = AITranslationCacheRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            source_type="trader_status_feed",
            source_id=feed.id,
            source_hash="cleanup-test",
            locale="ko",
            provider="openai",
            model="fake",
            payload_json='{"headline":"대기","message":"기다립니다."}',
        )
        subscriber = upsert_subscriber_preferences(
            db,
            user_id="cleanup-user",
            email="cleanup@example.com",
            favorite_trader_ids=[],
            telegram_settings=TelegramSettingsInput(
                enabled=True,
                chat_id="900",
                event_types=["trader_status_feed"],
                min_return_pct=0,
            ),
            locale="ko",
        )
        subscriber_record = db.scalar(
            select(SubscriberPreferenceRecord).where(SubscriberPreferenceRecord.user_id == subscriber.user_id)
        )
        assert subscriber_record is not None
        delivery = TelegramAlertDeliveryRecord(
            subscriber_preference_id=subscriber_record.id,
            trader_status_feed_id=feed.id,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="sent",
            telegram_event_type="trader_status_feed",
            chat_id="900",
        )
        db.add_all([translation, delivery])
        db.flush()
        protected_position_payload = position.payload_json
        preview = cleanup_open_pending_orders(db, dry_run=True)

        result = cleanup_open_pending_orders(
            db,
            dry_run=False,
            confirmation_token=preview["confirmationToken"],
            expected_order_ids=preview["targetOrderIds"],
        )

        assert result["executed"] is True
        assert db.get(PaperOrderRecord, target_shared.id) is None
        assert db.get(PaperOrderRecord, target_exclusive.id) is None
        assert db.get(TradeEventRecord, event.id) is None
        assert db.get(TraderStatusFeedRecord, feed.id) is None
        assert db.get(AITranslationCacheRecord, translation.id) is None
        assert db.get(TelegramAlertDeliveryRecord, delivery.id) is None
        assert db.get(TraderRunLogRecord, exclusive_run.id) is None
        assert db.get(CandidateTradeRecord, exclusive_candidate.id) is None
        assert db.get(AIReviewRecord, exclusive_review.id) is None
        assert db.get(TradePlanRecord, exclusive_plan.id) is None
        assert db.get(PaperOrderRecord, surviving_order.id) is not None
        assert db.get(PaperPositionRecord, position.id).payload_json == protected_position_payload
        assert db.get(PaperPositionRecord, linked_position.id).order_id is None
        assert db.get(TradeEventRecord, linked_event.id).order_id is None
        assert db.get(PositionManagementReviewRecord, linked_review.id).order_id is None
        assert db.get(TraderRunLogRecord, shared_run.id) is not None
        assert db.get(CandidateTradeRecord, shared_candidate.id) is not None
        assert db.get(AIReviewRecord, shared_review.id) is not None
        assert db.get(TradePlanRecord, shared_plan.id) is not None


def test_cleanup_rejects_preview_when_target_set_changes(temp_db):
    with session_scope() as db:
        run, _candidate, review, plan = _lineage(db, "first")
        first = _order(status="open", run_id=run.id, plan_id=plan.id, review_id=review.id)
        db.add(first)
        db.flush()
        preview = cleanup_open_pending_orders(db, dry_run=True)
        second_run, _second_candidate, second_review, second_plan = _lineage(db, "second")
        second = _order(
            status="open",
            run_id=second_run.id,
            plan_id=second_plan.id,
            review_id=second_review.id,
        )
        db.add(second)
        db.flush()

        with pytest.raises(ValueError, match="OPEN_ORDER_CLEANUP_TARGETS_CHANGED"):
            cleanup_open_pending_orders(
                db,
                dry_run=False,
                confirmation_token=preview["confirmationToken"],
                expected_order_ids=preview["targetOrderIds"],
            )

        assert db.get(PaperOrderRecord, first.id) is not None
        assert db.get(PaperOrderRecord, second.id) is not None


def test_cleanup_rolls_back_nested_mutations_when_execution_fails(temp_db, monkeypatch):
    from app.ops import open_order_cleanup

    with session_scope() as db:
        run, _candidate, review, plan = _lineage(db, "rollback")
        order = _order(status="open", run_id=run.id, plan_id=plan.id, review_id=review.id)
        db.add(order)
        db.flush()
        position = PaperPositionRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="open",
            order_id=order.id,
            side="long",
            quantity=Decimal("0.05"),
            entry_price=Decimal("64000"),
            leverage=Decimal("5"),
            notional=Decimal("3200"),
            margin=Decimal("640"),
            entry_fee=Decimal("0.64"),
        )
        db.add(position)
        db.flush()
        preview = cleanup_open_pending_orders(db, dry_run=True)
        real_execute = open_order_cleanup._execute_cleanup_graph

        def fail_after_execute(session, graph):
            real_execute(session, graph)
            raise RuntimeError("injected cleanup failure")

        monkeypatch.setattr(open_order_cleanup, "_execute_cleanup_graph", fail_after_execute)
        with pytest.raises(RuntimeError, match="injected cleanup failure"):
            cleanup_open_pending_orders(
                db,
                dry_run=False,
                confirmation_token=preview["confirmationToken"],
                expected_order_ids=preview["targetOrderIds"],
            )

        db.expire_all()
        assert db.get(PaperOrderRecord, order.id) is not None
        assert db.get(PaperPositionRecord, position.id).order_id == order.id


def test_cleanup_preserves_entire_lineage_when_run_is_shared_by_a_survivor(temp_db):
    with session_scope() as db:
        run, candidate, target_review, target_plan = _lineage(db, "mixed-run")
        sibling_review = AIReviewRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="ok",
            run_id=run.id,
            decision="APPROVE",
            confidence=75,
            risk_level="MEDIUM",
            fallback=False,
        )
        sibling_plan = TradePlanRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="approved",
            run_id=run.id,
            side="long",
            risk_percent=0.8,
        )
        sibling_candidate = CandidateTradeRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="created",
            run_id=run.id,
            setup_type="shared-sibling",
            side="long",
            setup_score=70,
        )
        db.add_all([sibling_review, sibling_plan, sibling_candidate])
        db.flush()
        target = _order(status="open", run_id=run.id, plan_id=target_plan.id, review_id=target_review.id)
        survivor = _order(status="filled", run_id=run.id, plan_id=sibling_plan.id, review_id=sibling_review.id)
        db.add_all([target, survivor])
        db.flush()
        preview = cleanup_open_pending_orders(db, dry_run=True)

        cleanup_open_pending_orders(
            db,
            dry_run=False,
            confirmation_token=preview["confirmationToken"],
            expected_order_ids=preview["targetOrderIds"],
        )

        assert db.get(TraderRunLogRecord, run.id) is not None
        assert db.get(TradePlanRecord, target_plan.id) is not None
        assert db.get(AIReviewRecord, target_review.id) is not None
        assert db.get(CandidateTradeRecord, candidate.id) is not None
        assert db.get(CandidateTradeRecord, sibling_candidate.id) is not None
