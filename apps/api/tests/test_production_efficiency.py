import json

from fastapi.testclient import TestClient
from sqlalchemy import event

import app.core.config as config
import app.db as db_module
from app.db import (
    MarketSnapshotRecord,
    PositionManagementReviewRecord,
    TraderLeaderboardSnapshotRecord,
    TraderRunLogRecord,
    init_db,
    reset_db_engine,
    session_scope,
)
import app.main as main
from app.main import app
from app.repositories import create_market_snapshot, create_trader_run_log, from_json, to_json, update_trader_run_log


def test_settings_read_environment_at_instantiation(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example.com/db")
    config.get_settings.cache_clear()

    settings = config.get_settings()

    assert settings.app_env == "production"
    assert settings.database_url == "postgresql://user:pass@example.com/db"


def test_local_env_defaults_to_sqlite_even_when_neon_url_exists(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test_user:test_password@ep-test.neon.tech/testdb")
    monkeypatch.delenv("ALLOW_REMOTE_DATABASE_IN_LOCAL", raising=False)
    config.get_settings.cache_clear()

    url = db_module.normalized_database_url()

    assert url.startswith("sqlite:///")
    assert "neon.tech" not in url


def test_market_snapshot_persists_compact_summary_without_raw_duplication(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'prod-efficiency.db'}")
    init_db()
    full_snapshot = {
        "symbol": "BTCUSDT",
        "price": 62000.0,
        "intervals": ["1m", "1h", "4h"],
        "timeframes": {
            "1m": {"close": 62000.0, "volume": 12.3, "latestCandle": {"trades": 500}},
            "1h": {"close": 62000.0, "ema20": 61800.0, "rsi14": 48.0, "trend": "bearish"},
            "4h": {"close": 62100.0, "ema50": 63000.0, "channel": {"position": 0.2}},
        },
        "derivatives": {
            "openInterest": 123456.0,
            "fundingRate": 0.0001,
            "longShortRatios": {"large": "expensive"},
        },
    }

    with session_scope() as db:
        record = create_market_snapshot(db, "BTCUSDT", full_snapshot)
        record_id = record.id

    with session_scope() as db:
        stored = db.get(MarketSnapshotRecord, record_id)
        payload = from_json(stored.payload_json)

    assert stored.raw_json is None
    assert payload["storagePolicy"] == "compact_market_snapshot_v1"
    assert payload["price"] == 62000.0
    assert payload["timeframes"]["1h"] == {
        "close": 62000.0,
        "ema20": 61800.0,
        "rsi14": 48.0,
        "trend": "bearish",
    }
    assert "latestCandle" not in json.dumps(payload)
    assert "longShortRatios" not in json.dumps(payload)


def test_no_candidate_run_log_is_compact_and_has_no_raw_json(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'run-log.db'}")
    init_db()
    noisy_payload = {
        "trader": "Channel Rider",
        "symbol": "BTCUSDT",
        "marketSnapshot": {"timeframes": {"1m": {"latestCandle": {"trades": 500}}}},
        "candidate": {"created": False, "reason": "No setup", "setupScore": 42, "entries": []},
        "aiReview": None,
        "tradePlan": {"status": "NO_CANDIDATE", "notes": ["No setup"]},
        "paper": {"after": {"openOrders": [], "openPositions": []}},
    }

    with session_scope() as db:
        run = create_trader_run_log(db, "BTCUSDT", "channel-rider", "mock")
        update_trader_run_log(db, run, status="no_candidate", payload=noisy_payload)
        run_id = run.id

    with session_scope() as db:
        stored = db.get(TraderRunLogRecord, run_id)
        payload = from_json(stored.payload_json)

    assert stored.raw_json is None
    assert payload["storagePolicy"] == "compact_trader_run_log_v1"
    assert payload["candidate"] == {"created": False, "reason": "No setup", "setupScore": 42}
    assert payload["tradePlan"] == {"status": "NO_CANDIDATE"}
    assert "marketSnapshot" not in payload
    assert "latestCandle" not in json.dumps(payload)


def test_cache_status_reports_hot_market_data_policy():
    client = TestClient(app)

    response = client.get("/api/market/cache/status")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["hotMarketData"]["persistence"] == "memory_only"
    assert data["hotMarketData"]["databasePersistence"] is False
    assert "klines" in data["caches"]


def test_storage_policy_endpoint_reports_neon_safe_defaults():
    client = TestClient(app)

    response = client.get("/api/ops/storage-policy")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["policies"]["marketSnapshots"]["mode"] == "compact"
    assert data["policies"]["traderRunLogs"]["storesFullMarketSnapshot"] is False
    assert data["privateTradingApi"] is False


def test_slim_record_queries_do_not_fetch_json_payload_columns(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'slim-query.db'}")
    init_db()
    large_payload = {"review": {"rationale": "x" * 10_000}}
    with session_scope() as db:
        db.add(
            PositionManagementReviewRecord(
                trader_id="channel-rider",
                symbol="BTCUSDT",
                status="ok",
                event_type="heartbeat",
                phase="OPEN_POSITION",
                provider="mock",
                model="mock-position-manager",
                decision="HOLD",
                confidence=70,
                action_type="HOLD",
                payload_json=to_json(large_payload),
                raw_json=to_json({"unused": True}),
            )
        )

    captured_sql: list[str] = []

    def capture_sql(_conn, _cursor, statement, _parameters, _context, _executemany):
        captured_sql.append(statement.lower())

    event.listen(db_module.engine, "before_cursor_execute", capture_sql)
    try:
        with session_scope() as db:
            records = main.list_filtered_records(
                db,
                PositionManagementReviewRecord,
                limit=1,
                symbol="BTCUSDT",
                include_payload=False,
            )
    finally:
        event.remove(db_module.engine, "before_cursor_execute", capture_sql)

    select_sql = "\n".join(statement for statement in captured_sql if " from position_management_reviews" in statement)
    assert records[0]["decision"] == "HOLD"
    assert "payload" not in records[0]
    assert "payload_json" not in select_sql
    assert "raw_json" not in select_sql


def test_leaderboard_bundle_keeps_management_reviews_slim(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'leaderboard-slim.db'}")
    init_db()
    with session_scope() as db:
        db.add(
            TraderLeaderboardSnapshotRecord(
                trader_id="channel-rider",
                trader_name="Channel Rider",
                symbol="BTCUSDT",
                status="active",
                has_live_paper_data=True,
                rank=1,
                rank_score=100.0,
                equity=10_100.0,
                cash_balance=10_000.0,
                total_pnl=100.0,
                latest_run_status="COMPLETED",
                last_decision="HOLD",
            )
        )
        db.add(
            PositionManagementReviewRecord(
                trader_id="channel-rider",
                symbol="BTCUSDT",
                status="ok",
                event_type="heartbeat",
                phase="OPEN_POSITION",
                provider="mock",
                model="mock-position-manager",
                decision="HOLD",
                confidence=70,
                action_type="HOLD",
                payload_json=to_json(
                    {
                        "event": {"reason": "large event body"},
                        "exposure": {"payload": {"large": "x" * 10_000}},
                        "review": {"rationale": "hold the position"},
                        "appliedActions": [],
                    }
                ),
            )
        )

    with session_scope() as db:
        payload = main.build_league_bundle_payload(db, "BTCUSDT", include_related=True)

    review = payload["managementReviews"][0]
    assert review["decision"] == "HOLD"
    assert review["actionType"] == "HOLD"
    assert "payload" not in review
    assert "event" not in review
    assert "exposure" not in review
    assert "review" not in review
