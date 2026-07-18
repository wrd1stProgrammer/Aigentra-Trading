import asyncio
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.db import (
    AITranslationCacheRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    SessionLocal,
    TradeEventRecord,
    TraderStatusFeedRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED
from app.trader_status_feed import generator as status_feed_generator
from app.trader_status_feed.models import StatusFeedPersona, StatusFeedRequest, StatusFeedResult
from app.trader_status_feed.constants import (
    STATUS_FEED_STATE_PENDING_ENTRY,
    STATUS_FEED_STATE_POSITION_CLOSED,
    STATUS_FEED_STATE_POSITION_ENTRY,
    STATUS_FEED_STATE_REVIEW_REJECTED,
)
from app.trader_status_feed.context import management_summary, payload_from_record, review_summary
from app.trader_status_feed.service import (
    create_status_feed_for_event,
    create_status_feeds_for_trade_events,
)
from app.trader_status_feed.state import current_status_feed_candidate


class FakeStatusFeedGenerator:
    name = "openai"
    model = "fake-status-feed"

    def __init__(self) -> None:
        self.calls = []

    async def generate(self, request):
        self.calls.append(request)
        return StatusFeedResult(
            headline=f"{request.stateKey} update",
            message=f"{request.trader.name} is tracking {request.eventType} with a clean, short desk note.",
            mood="focused",
            stance="patient",
            watch="",
            provider=self.name,
            model=self.model,
            fallback=False,
        )


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "trader-status-feed.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    try:
        yield db_path
    finally:
        reset_db_engine("sqlite:///:memory:")
        init_db()


def test_status_feed_created_for_required_lifecycle_events(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=True, ai_translation_target_locales=["ko"])
    generator = FakeStatusFeedGenerator()
    events = [
        (STATUS_FEED_STATE_REVIEW_REJECTED, "ai_review_rejected", "ai_review", 101),
        (STATUS_FEED_STATE_PENDING_ENTRY, "pending_entry_created", "trade_plan", 202),
        (STATUS_FEED_STATE_POSITION_ENTRY, "order_filled", "trade_event", 303),
        (STATUS_FEED_STATE_POSITION_CLOSED, "position_closed", "trade_event", 404),
    ]

    with session_scope() as db:
        for state_key, event_type, source_type, source_id in events:
            record = asyncio.run(
                create_status_feed_for_event(
                    db,
                    settings=settings,
                    trader_id="volume-breaker",
                    symbol="BTCUSDT",
                    state_key=state_key,
                    event_type=event_type,
                    source_type=source_type,
                    source_id=source_id,
                    trigger_payload={"eventType": event_type},
                    generator=generator,
                )
            )
            assert record.state_key == state_key
            assert record.event_type == event_type
            assert record.provider == "openai"

        duplicate = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="volume-breaker",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_PENDING_ENTRY,
                event_type="pending_entry_created",
                source_type="trade_plan",
                source_id=202,
                trigger_payload={"eventType": "pending_entry_created"},
                generator=generator,
            )
        )

        assert duplicate.source_id == 202
        assert db.query(TraderStatusFeedRecord).count() == 4
        assert db.query(AITranslationCacheRecord).filter_by(source_type=AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED).count() == 4
        assert len(generator.calls) == 4


def test_status_feed_is_committed_before_translation(monkeypatch, temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=True, ai_translation_target_locales=["ko"])
    generator = FakeStatusFeedGenerator()
    visible_during_translation: list[bool] = []

    async def inspect_committed_feed(db, *, source_id, **kwargs):
        with session_scope() as verification_db:
            visible_during_translation.append(verification_db.get(TraderStatusFeedRecord, source_id) is not None)

    monkeypatch.setattr("app.trader_status_feed.service.fanout_ai_translations", inspect_committed_feed)

    with session_scope() as db:
        record = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="volume-breaker",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="order_filled",
                source_type="trade_event",
                source_id=303,
                trigger_payload={"eventType": "order_filled"},
                generator=generator,
            )
        )

    assert record.id is not None
    assert visible_during_translation == [True]


def test_concurrent_duplicate_status_feed_reuses_committed_record(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)

    async def run_race():
        ready = asyncio.Event()

        class BarrierGenerator(FakeStatusFeedGenerator):
            async def generate(self, request):
                self.calls.append(request)
                if len(self.calls) >= 2:
                    ready.set()
                await ready.wait()
                await asyncio.sleep(0)
                return StatusFeedResult(
                    headline="Position filled",
                    message="I'm in and managing the invalidation now.",
                    mood="focused",
                    stance="patient",
                    watch="",
                    provider=self.name,
                    model=self.model,
                    fallback=False,
                )

        generator = BarrierGenerator()
        first_db = SessionLocal()
        second_db = SessionLocal()

        async def create(db):
            return await create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="volume-breaker",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="order_filled",
                source_type="trade_event",
                source_id=4406,
                trigger_payload={"eventId": 4406},
                generator=generator,
            )

        try:
            records = await asyncio.wait_for(
                asyncio.gather(create(first_db), create(second_db)),
                timeout=3,
            )
        finally:
            first_db.close()
            second_db.close()
        return records, generator

    records, generator = asyncio.run(run_race())

    assert records[0].id == records[1].id
    assert len(generator.calls) == 2
    with session_scope() as db:
        assert db.query(TraderStatusFeedRecord).count() == 1


def test_distinct_live_event_source_is_not_hidden_by_same_state_cooldown(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False, trader_status_feed_regeneration_seconds=10_800)
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 6, 22, 17, 8, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="vwap-reclaimer",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="order_filled",
                source_type="trade_event",
                source_id=1798,
                trigger_payload={"eventId": 1798},
                generator=generator,
                now=base_time,
            )
        )
        second_event = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="vwap-reclaimer",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="order_filled",
                source_type="trade_event",
                source_id=1799,
                trigger_payload={"eventId": 1799},
                generator=generator,
                now=base_time.replace(minute=20),
            )
        )

        assert second_event.id != first.id
        assert second_event.source_id == 1799
        assert db.query(TraderStatusFeedRecord).count() == 2
        assert len(generator.calls) == 2


def test_repeated_review_reject_reuses_recent_semantic_reason(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
                event_type="ai_review_rejected",
                source_type="ai_review",
                source_id=301,
                trigger_payload={"review": {"reviewCode": "ACCOUNT_DRAWDOWN_HARD_ENTRY_LIMIT_REJECT"}},
                generator=generator,
                now=base_time,
            )
        )
        repeated = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
                event_type="ai_review_rejected",
                source_type="ai_review",
                source_id=302,
                trigger_payload={"review": {"reviewCode": "ACCOUNT_DRAWDOWN_HARD_ENTRY_LIMIT_REJECT"}},
                generator=generator,
                now=base_time.replace(hour=11),
            )
        )

        assert repeated.id == first.id
        assert db.query(TraderStatusFeedRecord).count() == 1
        assert len(generator.calls) == 1


def test_repeated_review_reject_emits_when_material_reason_changes(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
                event_type="ai_review_rejected",
                source_type="ai_review",
                source_id=401,
                trigger_payload={"review": {"reviewCode": "ACCOUNT_DRAWDOWN_HARD_ENTRY_LIMIT_REJECT"}},
                generator=generator,
                now=base_time,
            )
        )
        changed = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
                event_type="ai_review_rejected",
                source_type="ai_review",
                source_id=402,
                trigger_payload={"review": {"reviewCode": "FEE_AWARE_RR_BELOW_MINIMUM_REJECT"}},
                generator=generator,
                now=base_time.replace(hour=9),
            )
        )

        assert changed.id != first.id
        assert db.query(TraderStatusFeedRecord).count() == 2
        assert len(generator.calls) == 2


def test_same_reject_code_emits_again_after_an_intervening_state(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()
    base_time = datetime(2026, 7, 12, 8, 0, tzinfo=timezone.utc)

    with session_scope() as db:
        first = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
                event_type="ai_review_rejected",
                source_type="ai_review",
                source_id=501,
                trigger_payload={"review": {"reviewCode": "ACCOUNT_DRAWDOWN_HARD_ENTRY_LIMIT_REJECT"}},
                generator=generator,
                now=base_time,
            )
        )
        asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key="no_setup",
                event_type="order_expired_by_ai",
                source_type="trade_event",
                source_id=502,
                trigger_payload={"reason": "expired"},
                generator=generator,
                now=base_time + timedelta(hours=1),
            )
        )
        repeated_after_transition = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_REVIEW_REJECTED,
                event_type="ai_review_rejected",
                source_type="ai_review",
                source_id=503,
                trigger_payload={"review": {"reviewCode": "ACCOUNT_DRAWDOWN_HARD_ENTRY_LIMIT_REJECT"}},
                generator=generator,
                now=base_time + timedelta(hours=2),
            )
        )

        assert repeated_after_transition.id != first.id
        assert len(generator.calls) == 3


@pytest.mark.parametrize(
    ("event_type", "expected_state"),
    [
        ("order_adjusted_by_ai", "pending_entry"),
        ("order_canceled_by_ai", "no_setup"),
        ("order_expired_by_ai", "no_setup"),
        ("position_add_order_created_by_ai", "position_entry"),
        ("position_pyramid_order_created_by_ai", "position_entry"),
        ("position_reduced_by_ai", "position_entry"),
        ("take_partial_profit", "position_entry"),
        ("stop_updated_by_ai", "position_entry"),
        ("stop_moved_to_breakeven", "position_entry"),
        ("stop_moved_to_take_profit", "position_entry"),
    ],
)
def test_management_and_order_lifecycle_events_are_routed(temp_db, event_type, expected_state):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        event = TradeEventRecord(
            trader_id="vwap-reclaimer",
            symbol="BTCUSDT",
            status="recorded",
            event_type=event_type,
            price=Decimal("64000"),
            quantity=Decimal("0.01"),
            payload_json=json.dumps({"managementAction": event_type}),
        )
        db.add(event)
        db.flush()

        records = asyncio.run(
            create_status_feeds_for_trade_events(
                db,
                settings=settings,
                events=[event],
                generator=generator,
            )
        )

        assert len(records) == 1
        assert records[0].state_key == expected_state
        assert records[0].event_type == event_type
        assert records[0].source_id == event.id


def test_compound_management_events_coalesce_into_one_material_feed(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        partial = TradeEventRecord(
            trader_id="vwap-reclaimer",
            symbol="BTCUSDT",
            status="recorded",
            event_type="take_partial_profit",
            position_id=77,
            price=Decimal("65000"),
            quantity=Decimal("0.05"),
        )
        protected = TradeEventRecord(
            trader_id="vwap-reclaimer",
            symbol="BTCUSDT",
            status="recorded",
            event_type="stop_moved_to_breakeven",
            position_id=77,
            price=Decimal("64000"),
            quantity=Decimal("0.10"),
        )
        db.add_all([partial, protected])
        db.flush()

        records = asyncio.run(
            create_status_feeds_for_trade_events(
                db,
                settings=settings,
                events=[partial, protected],
                generator=generator,
            )
        )
        raw = json.loads(records[0].raw_json)

        assert len(records) == 1
        assert records[0].event_type == "take_partial_profit"
        assert raw["request"]["trigger"]["relatedEventTypes"] == ["stop_moved_to_breakeven"]


def test_residual_order_cleanup_coalesces_with_position_management_event(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        partial = TradeEventRecord(
            trader_id="vwap-reclaimer",
            symbol="BTCUSDT",
            status="recorded",
            event_type="position_reduced_by_ai",
            position_id=803,
            price=Decimal("63911.5"),
            quantity=Decimal("0.0604"),
        )
        canceled_retest = TradeEventRecord(
            trader_id="vwap-reclaimer",
            symbol="BTCUSDT",
            status="recorded",
            event_type="order_canceled_by_ai",
            order_id=1748,
            price=Decimal("63516.5"),
            quantity=Decimal("0.01"),
        )
        db.add_all([partial, canceled_retest])
        db.flush()

        records = asyncio.run(
            create_status_feeds_for_trade_events(
                db,
                settings=settings,
                events=[partial, canceled_retest],
                generator=generator,
            )
        )
        raw = json.loads(records[0].raw_json)

        assert len(records) == 1
        assert records[0].event_type == "position_reduced_by_ai"
        assert raw["request"]["trigger"]["relatedEventTypes"] == ["order_canceled_by_ai"]


def test_close_feed_suppresses_cleanup_cancel_feed_in_same_batch(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        closed = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type="position_closed",
            position_id=91,
            price=Decimal("65000"),
            quantity=Decimal("0.10"),
        )
        canceled = TradeEventRecord(
            trader_id="channel-rider",
            symbol="BTCUSDT",
            status="recorded",
            event_type="order_canceled_by_ai",
            order_id=92,
            price=Decimal("64000"),
            quantity=Decimal("0.05"),
        )
        db.add_all([closed, canceled])
        db.flush()

        records = asyncio.run(
            create_status_feeds_for_trade_events(
                db,
                settings=settings,
                events=[closed, canceled],
                generator=generator,
            )
        )

        assert len(records) == 1
        assert records[0].event_type == "position_closed"


def test_current_status_prefers_open_position_over_open_orders(temp_db):
    opened_at = datetime(2026, 6, 19, 1, 0, tzinfo=timezone.utc)
    submitted_at = datetime(2026, 6, 19, 1, 5, tzinfo=timezone.utc)

    with session_scope() as db:
        order = PaperOrderRecord(
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            status="open",
            side="long",
            order_type="limit",
            fee_type="maker",
            quantity=Decimal("0.01"),
            leverage=Decimal("5"),
            limit_price=Decimal("70000"),
            take_profit_price=Decimal("72000"),
            stop_loss_price=Decimal("69000"),
            submitted_at=submitted_at,
            payload_json='{"source":"protective-or-residual-order"}',
        )
        position = PaperPositionRecord(
            trader_id="volume-breaker",
            symbol="BTCUSDT",
            status="open",
            side="long",
            quantity=Decimal("0.01"),
            entry_price=Decimal("70000"),
            leverage=Decimal("5"),
            notional=Decimal("700"),
            margin=Decimal("140"),
            entry_fee=Decimal("0.28"),
            take_profit_price=Decimal("72000"),
            stop_loss_price=Decimal("69000"),
            opened_at=opened_at,
            payload_json='{"source":"filled-position"}',
        )
        db.add_all([order, position])
        db.flush()

        candidate = current_status_feed_candidate(db, trader_id="volume-breaker", symbol="BTCUSDT")

        assert candidate is not None
        assert candidate["stateKey"] == STATUS_FEED_STATE_POSITION_ENTRY
        assert candidate["eventType"] == "position_entry_active"
        assert candidate["sourceType"] == "paper_position"
        assert candidate["sourceId"] == position.id


def test_status_feed_prompt_contract_uses_thread_voice_without_watch_label():
    contract = status_feed_generator.STATUS_FEED_STYLE_CONTRACT

    assert contract["format"] == "trader_thread_post"
    assert contract["tone"] == "sns_like_trade_desk_note"
    assert contract["watchPolicy"] == "empty_string"
    assert "news_article" in contract["forbiddenStyles"]
    assert "analyst_report" in contract["forbiddenStyles"]
    assert "next_watch_label" in contract["forbiddenPhrases"]
    assert contract["evidenceShape"] == "one_current_fact_one_decision_one_next_trigger"
    assert contract["variationPolicy"] == "avoid_recent_wording_and_reasoning_reuse"
    assert contract["languagePolicy"] == "english_only_no_mixed_language"


def test_status_feed_prompt_requires_event_specific_non_repetitive_message():
    prompt = status_feed_generator.STATUS_FEED_SYSTEM_PROMPT

    assert "Do not reuse the same reason/action/watch pattern from recentStatusFeeds" in prompt
    assert "Name one concrete input fact that changed or still matters" in prompt
    assert "Make it feel like a live desk/SNS note from the AI trader" in prompt
    assert "not written by Aigentra about the trader" in prompt
    assert "Use a different sentence shape for review_rejected, no_setup, pending_entry, position_entry, and position_closed" in prompt


def test_status_feed_context_keeps_structured_review_details_for_variation():
    created_at = datetime(2026, 6, 25, 8, 30, tzinfo=timezone.utc)
    ai_review = SimpleNamespace(
        id=15,
        created_at=created_at,
        decision="APPROVE",
        confidence=82,
        risk_level="MEDIUM",
        payload_json=json.dumps(
            {
                "approvalReason": "채널 하단 반등과 손절 위치가 맞습니다.",
                "counterThesis": "15m 종가가 채널 하단 아래에 안착하면 취소입니다.",
                "structuredReview": {
                    "headline": "채널 하단 롱은 아직 근거가 있습니다.",
                    "action": "대기 주문은 유지하되 손절 기준을 먼저 확인합니다.",
                    "keyReasons": ["현재가가 계획 진입대 위에서 버티고 있습니다."],
                    "risks": ["거래량이 줄면 반등 근거가 약해질 수 있습니다."],
                    "watchConditions": ["15m 종가가 채널 하단 아래로 닫히면 취소합니다."],
                    "managerNote": "가격이 기준선을 잃으면 기다리지 않습니다.",
                },
            },
            ensure_ascii=False,
        ),
    )
    management_review = SimpleNamespace(
        id=16,
        created_at=created_at,
        event_type="position_heartbeat",
        phase="OPEN_POSITION",
        decision="HOLD",
        action_type="HOLD",
        payload_json=json.dumps(
            {
                "review": {
                    "rationale": "현재가는 진입가 위이고 손절까지 여유가 있습니다.",
                    "userSummary": "롱 유지",
                    "structuredReview": {
                        "headline": "롱은 아직 관리 범위 안에 있습니다.",
                        "action": "손절은 유지하고 다음 15m 종가를 봅니다.",
                        "keyReasons": ["현재가가 진입가 위에서 유지됩니다."],
                        "risks": ["거래량이 더 줄면 상승 추진력이 약해집니다."],
                        "watchConditions": ["15m 종가가 진입가 아래로 닫히면 축소합니다."],
                        "managerNote": "손절을 넓히지 않습니다.",
                    },
                }
            },
            ensure_ascii=False,
        ),
    )

    assert review_summary(ai_review)["keyReasons"] == ["현재가가 계획 진입대 위에서 버티고 있습니다."]
    assert review_summary(ai_review)["watchConditions"] == ["15m 종가가 채널 하단 아래로 닫히면 취소합니다."]
    assert management_summary(management_review)["risks"] == ["거래량이 더 줄면 상승 추진력이 약해집니다."]
    assert management_summary(management_review)["managerNote"] == "손절을 넓히지 않습니다."


def test_mock_status_feed_generator_keeps_watch_empty_and_human_thread_like():
    request = StatusFeedRequest(
        trader=StatusFeedPersona(
            traderId="volume-breaker",
            name="Volume Breaker",
            alias="Volume Desk",
            voice="brief breakout trader",
            cadence="compact thread post",
            avoid="report language",
        ),
        symbol="BTCUSDT",
        stateKey=STATUS_FEED_STATE_POSITION_CLOSED,
        eventType="position_closed",
        generatedAt=datetime(2026, 6, 19, 3, 0, tzinfo=timezone.utc),
        trigger={"reason": "take_profit"},
        context={},
    )

    result = asyncio.run(status_feed_generator.MockTraderStatusFeedGenerator().generate(request))

    assert result.watch == ""
    assert "next" not in result.watch.lower()
    assert "I " in result.message or "I'm" in result.message
    assert "key signal" not in result.headline.lower()


def test_generated_feed_persists_trade_semantics_in_payload_and_raw_request(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        record = asyncio.run(
            create_status_feed_for_event(
                db,
                settings=settings,
                trader_id="trend-sentinel",
                symbol="BTCUSDT",
                state_key=STATUS_FEED_STATE_POSITION_ENTRY,
                event_type="position_reduced_by_ai",
                source_type="trade_event",
                source_id=8_801,
                trigger_payload={
                    "position": {
                        "side": "short",
                        "entryPrice": 64_000,
                        "stopLossPrice": 65_000,
                        "takeProfitPrice": 61_000,
                        "payload": {
                            "managementPlan": {
                                "holdingHorizon": "POSITION",
                                "strategyFamily": "TREND_FOLLOW",
                            }
                        },
                    }
                },
                generator=generator,
            )
        )
        payload = payload_from_record(record)
        raw = json.loads(record.raw_json)

        assert payload["semanticContext"] == raw["request"]["semanticContext"]
        assert payload["semanticContext"]["side"] == "short"
        assert payload["semanticContext"]["holdingHorizon"] == "POSITION"
        assert payload["semanticContext"]["strategyFamily"] == "TREND_FOLLOW"
        assert payload["semanticContext"]["lifecycleAction"] == "reduce"
        assert payload["semanticContext"]["stopLossPrice"] == 65_000


def test_trade_event_semantics_read_side_and_levels_from_event_payload(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        event = TradeEventRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="recorded",
            event_type="take_partial_profit",
            position_id=101,
            price=Decimal("61000"),
            quantity=Decimal("0.05"),
            payload_json=json.dumps(
                {
                    "side": "short",
                    "entryPrice": 64_000,
                    "stopLossPrice": 64_000,
                    "takeProfitPrice": 60_000,
                    "managementPlan": {
                        "holdingHorizon": "POSITION",
                        "strategyFamily": "TREND_FOLLOW",
                    },
                }
            ),
        )
        db.add(event)
        db.flush()

        record = asyncio.run(
            create_status_feeds_for_trade_events(db, settings=settings, events=[event], generator=generator)
        )[0]
        semantic = payload_from_record(record)["semanticContext"]

        assert semantic["side"] == "short"
        assert semantic["entryPrice"] == 64_000
        assert semantic["lifecycleAction"] == "reduce"


def test_fill_event_semantics_fall_back_to_linked_position(temp_db):
    settings = Settings(openai_api_key="", ai_translation_enabled=False)
    generator = FakeStatusFeedGenerator()

    with session_scope() as db:
        position = PaperPositionRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="open",
            side="short",
            quantity=Decimal("0.15"),
            entry_price=Decimal("64000"),
            leverage=Decimal("5"),
            notional=Decimal("9600"),
            margin=Decimal("1920"),
            entry_fee=Decimal("1.92"),
            stop_loss_price=Decimal("65000"),
            take_profit_price=Decimal("61000"),
        )
        db.add(position)
        db.flush()
        event = TradeEventRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="recorded",
            event_type="order_filled",
            position_id=position.id,
            price=Decimal("64000"),
            quantity=Decimal("0.15"),
        )
        db.add(event)
        db.flush()

        record = asyncio.run(
            create_status_feeds_for_trade_events(db, settings=settings, events=[event], generator=generator)
        )[0]
        semantic = payload_from_record(record)["semanticContext"]

        assert semantic["side"] == "short"
        assert semantic["entryPrice"] == 64_000
        assert semantic["stopLossPrice"] == 65_000
