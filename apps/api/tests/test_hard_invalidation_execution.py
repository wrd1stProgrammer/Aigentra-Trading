from decimal import Decimal

import pytest
from sqlalchemy import select

import app.main as main_module
from app.db import (
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradeEventRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
from app.paper.engine import place_paper_order, process_candle
from app.paper.repositories import upsert_risk_settings
from app.traders.models import ManagementEvent, PositionManagementResult


@pytest.fixture()
def management_db(tmp_path):
    db_path = tmp_path / "hard-invalidation.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def _invalidated_channel_snapshot() -> dict[str, object]:
    return {
        "symbol": "BTCUSDT",
        "price": 94.0,
        "timeframes": {
            "15m": {
                "open": 95.0,
                "high": 96.0,
                "low": 93.0,
                "close": 94.0,
                "volumeZscore": 0.0,
                "completedVolumeZscore": 0.0,
                "latestCandle": {
                    "open": 95.0,
                    "high": 96.0,
                    "low": 93.0,
                    "close": 94.0,
                    "volume": 100.0,
                    "takerBuyBaseVolume": 50.0,
                },
                "completedCandle": {
                    "open": 95.0,
                    "high": 96.0,
                    "low": 93.0,
                    "close": 94.0,
                    "volume": 100.0,
                    "takerBuyBaseVolume": 50.0,
                },
            },
            "1h": {
                "ema50": 100.0,
                "trend": "bullish",
                "channel": {"lower": 95.0, "mid": 105.0, "upper": 115.0},
                "completedCandle": {"close": 94.0},
            },
            "4h": {
                "ema50": 100.0,
                "trend": "bullish",
                "completedCandle": {"close": 106.0},
            },
        },
        "derivatives": {
            "fundingRate": 0.0,
            "openInterestStats": {"changePercent30m": 0.0},
        },
    }


def _hold_review() -> PositionManagementResult:
    return PositionManagementResult(
        decision="HOLD",
        confidence=90,
        riskLevel="LOW",
        actions=[],
        rationale="Keep waiting.",
        counterThesis="The model prefers to hold.",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider_fails", "ai_enabled"),
    [(False, True), (True, True), (False, False)],
)
async def test_hard_invalidation_closes_position_despite_ai_outcome(
    management_db,
    monkeypatch,
    provider_fails,
    ai_enabled,
):
    with session_scope() as db:
        upsert_risk_settings(db, "channel-rider", "BTCUSDT", max_leverage=5)
        place_paper_order(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            side="long",
            quantity=1,
            leverage=1,
            take_profit_price=120,
            stop_loss_price=90,
            payload={"managementPlan": {"allowedActions": ["HOLD"]}},
        )
        process_candle(
            db,
            "channel-rider",
            "BTCUSDT",
            {"open": 100, "high": 101, "low": 99, "close": 100},
        )
        db.commit()

        async def provider_review(*args, **kwargs):
            if provider_fails:
                raise RuntimeError("provider unavailable")
            return _hold_review()

        async def skip_translations(*args, **kwargs):
            return None

        monkeypatch.setattr(main_module.settings, "enable_position_management_ai", ai_enabled)
        monkeypatch.setattr(main_module.settings, "position_management_max_reviews_per_cycle", 3 if ai_enabled else 0)
        monkeypatch.setattr(main_module.settings, "position_management_cooldown_seconds", 0)
        monkeypatch.setattr(main_module.settings, "position_management_urgent_cooldown_seconds", 0)
        monkeypatch.setattr(main_module, "run_position_management_with_logging", provider_review)
        monkeypatch.setattr(main_module, "fanout_ai_translations", skip_translations)
        monkeypatch.setattr("app.subscribers.notify_subscribers_for_management_review", lambda *args, **kwargs: None)

        await main_module.run_management_reviews(
            db,
            trader_id="channel-rider",
            symbol="BTCUSDT",
            snapshot=_invalidated_channel_snapshot(),
            provider_name="mock",
            locale="en",
            result=None,
        )

        position = db.execute(select(PaperPositionRecord)).scalar_one()
        review = db.execute(select(PositionManagementReviewRecord)).scalar_one()
        close_event = db.execute(
            select(TradeEventRecord).where(TradeEventRecord.event_type == "position_closed")
        ).scalar_one()

        assert position.status == "closed"
        assert position.exit_price == Decimal("93.9906000000")
        assert review.decision == "CLOSE_POSITION"
        assert review.action_type == "CLOSE_POSITION"
        assert review.status == ("error" if provider_fails else "ok")
        assert close_event.position_id == position.id


def test_price_shock_does_not_replace_a_simultaneous_hard_invalidation() -> None:
    hard = ManagementEvent(
        eventType="structure_failed",
        phase="OPEN_POSITION",
        severity="HIGH",
        reason="Completed structure failed.",
        suggestedAction="CLOSE_POSITION",
        metrics={"hardInvalidation": True},
    )
    normal = ManagementEvent(
        eventType="heartbeat",
        phase="OPEN_POSITION",
        reason="Routine review.",
    )
    shock = ManagementEvent(
        eventType=main_module.PRICE_SHOCK_EVENT_TYPE,
        phase="OPEN_POSITION",
        severity="HIGH",
        reason="Price shock.",
    )

    events = main_module.management_events_with_shock_priority([normal, hard], shock)

    assert events == [hard, shock]
