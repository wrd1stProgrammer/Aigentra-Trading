import pytest
from decimal import Decimal
from types import SimpleNamespace

from app.db import init_db, reset_db_engine, session_scope
from app.repositories import (
    create_first_stage_audit_report,
    create_observation_candidate,
    create_trader_run_log,
    from_json,
    to_json,
    update_observation_candidate_outcome_for_position,
)
from app.traders.registry import get_strategy

from test_trader_cycle import sample_snapshot


@pytest.fixture()
def temp_db(tmp_path):
    db_path = tmp_path / "strategy-observations.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")


def test_observation_candidate_stores_compact_audit_payload(temp_db):
    snapshot = sample_snapshot()
    candidate = get_strategy("donchian-breakout").evaluate(snapshot)

    with session_scope() as db:
        record = create_observation_candidate(
            db,
            symbol="BTCUSDT",
            trader_id="donchian-breakout",
            candidate=candidate,
            observation_type=candidate.observationType,
            decision="APPROVE" if candidate.created else None,
            status="approved" if candidate.created else "observe_only",
            payload={"source": "test"},
        )
        payload = from_json(record.payload_json)

    assert record.observation_type in {"CANDIDATE_READY", "OBSERVE_ONLY", "NO_TRADE"}
    assert payload["candidate"]["holdingProfile"] in {"swing", "trend", "tactical", "intraday", "micro"}
    assert payload["candidate"]["audit"]["executionProfile"]["primaryTimeframe"]
    assert "entries" not in payload["candidate"]


def test_first_stage_audit_report_aggregates_scanner_results(temp_db):
    results = [
        {
            "traderId": "donchian-breakout",
            "symbol": "BTCUSDT",
            "status": "CANDIDATE_READY",
            "candidateCreated": True,
            "setupScore": 72,
            "aiDecision": "APPROVE",
        },
        {
            "traderId": "session-raider",
            "symbol": "BTCUSDT",
            "status": "NO_CANDIDATE",
            "candidateCreated": False,
            "candidateReason": "Session window inactive.",
            "setupScore": 54,
        },
        {
            "traderId": "range-maker",
            "symbol": "BTCUSDT",
            "status": "AI_REVIEW_COOLDOWN",
            "candidateCreated": False,
            "setupScore": 0,
        },
        {
            "traderId": "vwap-reclaimer",
            "symbol": "BTCUSDT",
            "status": "REVIEW_REJECT",
            "candidateCreated": True,
            "setupScore": 68,
            "aiDecision": "REJECT",
        },
    ]

    with session_scope() as db:
        report = create_first_stage_audit_report(
            db,
            symbol="BTCUSDT",
            scanner_started_at=None,
            scanner_finished_at=None,
            market_regime="range",
            counts={"tradersChecked": 3},
            results=results,
        )
        payload = from_json(report.payload_json)

    assert report.total_traders == 4
    assert report.candidate_ready_count == 1
    assert report.observe_only_count == 1
    assert report.ai_rejected_count == 1
    assert report.cooldown_count == 1
    assert payload["storagePolicy"] == "compact_first_stage_audit_v1"


def test_observation_candidate_receives_closed_position_r_outcome(temp_db):
    snapshot = sample_snapshot()
    candidate = get_strategy("donchian-breakout").evaluate(snapshot)

    with session_scope() as db:
        run = create_trader_run_log(db, symbol="BTCUSDT", trader_id="donchian-breakout", provider="mock")
        observation = create_observation_candidate(
            db,
            symbol="BTCUSDT",
            trader_id="donchian-breakout",
            candidate=candidate,
            observation_type="CANDIDATE_READY",
            run_id=run.id,
            decision="APPROVE",
            status="approved",
        )
        position = SimpleNamespace(
            id=77,
            trader_id="donchian-breakout",
            symbol="BTCUSDT",
            side="long",
            entry_price=Decimal("100"),
            stop_loss_price=Decimal("90"),
            payload_json=to_json({"runId": run.id}),
        )
        updated = update_observation_candidate_outcome_for_position(db, position, "take_profit", Decimal("120"))
        payload = from_json(updated.payload_json)

    assert updated.id == observation.id
    assert updated.outcome_status == "take_profit"
    assert updated.outcome_r == pytest.approx(2.0)
    assert payload["outcome"]["positionId"] == 77


def test_liquidation_pressure_sniper_rejects_bullish_same_side_short_retry():
    snapshot = sample_snapshot()
    snapshot["timeframes"]["15m"].update(
        {
            "open": 68100.0,
            "high": 68600.0,
            "low": 67880.0,
            "close": 68000.0,
            "volumeZscore": 0.0,
        }
    )
    snapshot["timeframes"]["1h"]["trend"] = "bullish"
    snapshot["timeframes"]["4h"]["trend"] = "range"
    snapshot["externalDerivatives"] = {
        "coinalyze": {
            "available": True,
            "longLiquidations6h": 100000.0,
            "shortLiquidations6h": 20000.0,
            "longAccountPercent": 68.0,
            "openInterestChange6hPercent": 0.5,
            "takerBuyShare": 0.49,
            "source": "test",
        }
    }

    candidate = get_strategy("liquidation-pressure-sniper").evaluate(snapshot)

    assert not candidate.created
    assert candidate.reason == "Liquidation pressure has not aligned with a confirmed 15m structure trigger."
