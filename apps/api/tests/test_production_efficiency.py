import json
import inspect
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect as inspect_database

import app.core.config as config
import app.db as db_module
import app.subscribers_routes as subscribers_routes
import app.whop_status as whop_status
from app.db import (
    MarketSnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    ReviewUnlockRecord,
    SubscriberPreferenceRecord,
    TraderLeaderboardSnapshotRecord,
    TraderRunLogRecord,
    TradePlanRecord,
    WhopCheckoutRecord,
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


def test_api_container_runs_multiple_uvicorn_workers_by_default():
    dockerfile = Path(__file__).resolve().parents[1] / "Dockerfile"
    source = dockerfile.read_text()

    assert "--workers ${API_WEB_CONCURRENCY:-2}" in source


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
        "trader": "Channel Cartographer",
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


def test_latency_sensitive_public_routes_have_covering_indexes():
    def columns_for(model, index_name: str) -> tuple[str, ...]:
        for index in model.__table__.indexes:
            if index.name == index_name:
                return tuple(column.name for column in index.columns)
        return ()

    assert columns_for(PaperOrderRecord, "ix_paper_orders_symbol_status_created") == (
        "symbol",
        "status",
        "created_at",
        "id",
    )
    assert columns_for(PaperPositionRecord, "ix_paper_positions_symbol_status_created") == (
        "symbol",
        "status",
        "created_at",
        "id",
    )
    assert columns_for(PaperPositionRecord, "ix_paper_positions_trader_symbol_status_closed") == (
        "trader_id",
        "symbol",
        "status",
        "closed_at",
        "id",
    )
    assert columns_for(PaperPositionRecord, "ix_paper_positions_symbol_status_closed") == (
        "symbol",
        "status",
        "closed_at",
        "id",
    )
    assert columns_for(TradePlanRecord, "ix_trade_plans_symbol_status_created") == (
        "symbol",
        "status",
        "created_at",
        "id",
    )
    assert columns_for(WhopCheckoutRecord, "ix_whop_checkouts_user_status_updated") == (
        "user_id",
        "status",
        "updated_at",
        "created_at",
        "id",
    )
    assert columns_for(WhopCheckoutRecord, "ix_whop_checkouts_email_status_updated") == (
        "email",
        "status",
        "updated_at",
        "created_at",
        "id",
    )
    assert columns_for(ReviewUnlockRecord, "ix_review_unlocks_email_created_id") == (
        "email",
        "created_at",
        "id",
    )


def test_public_read_timeout_indexes_are_applied_by_alembic(tmp_path, monkeypatch):
    db_path = tmp_path / "migration-indexes.db"
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)
    config.get_settings.cache_clear()
    project_root = Path(__file__).resolve().parents[3]
    alembic_config = Config(str(project_root / "alembic.ini"))
    alembic_config.set_main_option("script_location", str(project_root / "apps/api/alembic"))
    alembic_config.set_main_option("prepend_sys_path", str(project_root / "apps/api"))
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE trade_plans (id INTEGER PRIMARY KEY, symbol VARCHAR(32), status VARCHAR(80), created_at DATETIME)")
        connection.exec_driver_sql("CREATE TABLE paper_orders (id INTEGER PRIMARY KEY, symbol VARCHAR(32), status VARCHAR(80), created_at DATETIME)")
        connection.exec_driver_sql(
            "CREATE TABLE paper_positions (id INTEGER PRIMARY KEY, trader_id VARCHAR(80), symbol VARCHAR(32), status VARCHAR(80), created_at DATETIME, closed_at DATETIME)"
        )
        connection.exec_driver_sql(
            "CREATE TABLE whop_checkouts (id INTEGER PRIMARY KEY, user_id VARCHAR(180), email VARCHAR(240), status VARCHAR(60), updated_at DATETIME, created_at DATETIME)"
        )
        connection.exec_driver_sql("CREATE TABLE review_unlocks (id INTEGER PRIMARY KEY, email VARCHAR(240), created_at DATETIME)")
    engine.dispose()

    command.stamp(alembic_config, "202606300001")
    command.upgrade(alembic_config, "head")

    engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        inspector = inspect_database(engine)
        index_names_by_table = {
            table_name: {index["name"] for index in inspector.get_indexes(table_name)}
            for table_name in [
                "paper_orders",
                "paper_positions",
                "trade_plans",
                "whop_checkouts",
                "review_unlocks",
            ]
        }
    finally:
        engine.dispose()
        config.get_settings.cache_clear()

    assert "ix_paper_orders_symbol_status_created" in index_names_by_table["paper_orders"]
    assert "ix_paper_positions_symbol_status_created" in index_names_by_table["paper_positions"]
    assert "ix_paper_positions_trader_symbol_status_closed" in index_names_by_table["paper_positions"]
    assert "ix_paper_positions_symbol_status_closed" in index_names_by_table["paper_positions"]
    assert "ix_trade_plans_symbol_status_created" in index_names_by_table["trade_plans"]
    assert "ix_whop_checkouts_user_status_updated" in index_names_by_table["whop_checkouts"]
    assert "ix_whop_checkouts_email_status_updated" in index_names_by_table["whop_checkouts"]
    assert "ix_review_unlocks_email_created_id" in index_names_by_table["review_unlocks"]


def test_latency_sensitive_read_routes_run_in_fastapi_threadpool():
    for route_handler in [
        main.league_leaderboard_fast,
        main.league_trader_detail,
        main.trade_plans,
        main.paper_orders,
        main.paper_positions,
        main.active_paper_positions,
        main.paper_equity_snapshots,
    ]:
        assert not inspect.iscoroutinefunction(route_handler)


def test_subscriber_access_status_uses_index_specific_whop_checkout_queries(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'subscriber-access-sql.db'}")
    init_db()
    captured_sql: list[str] = []

    def capture_sql(_conn, _cursor, statement, _parameters, _context, _executemany):
        if "whop_checkouts" in statement.lower():
            captured_sql.append(statement.lower())

    event.listen(db_module.engine, "before_cursor_execute", capture_sql)
    try:
        with session_scope() as db:
            db.add(
                WhopCheckoutRecord(
                    user_id="user-1",
                    email="member@example.com",
                    status="payment_succeeded",
                    plan_key="pro",
                    checkout_id="checkout-1",
                    internal_order_id="order-1",
                    purchase_url="https://example.com/checkout",
                    raw_json="{}",
                )
            )
            db.commit()

        with session_scope() as db:
            payload = whop_status.read_whop_subscription_status(
                db,
                user_id="user-1",
                email="member@example.com",
                settings=config.get_settings(),
            )
    finally:
        event.remove(db_module.engine, "before_cursor_execute", capture_sql)
        config.get_settings.cache_clear()

    assert payload["status"] == "active"
    assert captured_sql
    assert all(" or " not in statement for statement in captured_sql)


def test_subscriber_preferences_existing_read_does_not_commit(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'subscriber-preferences-read.db'}")
    init_db()
    with session_scope() as db:
        db.add(
            SubscriberPreferenceRecord(
                user_id="google-1",
                email="operator@example.com",
                status="active",
                subscription_status="active",
                favorite_trader_ids_json="[]",
            )
        )

    commits: list[str] = []

    def capture_commit(_session):
        commits.append("commit")

    event.listen(db_module.SessionLocal, "after_commit", capture_commit)
    db = db_module.SessionLocal()
    try:
        payload = subscribers_routes.read_subscriber_preferences(
            user_id="google-1",
            email="operator@example.com",
            _=None,
            db=db,
        )
    finally:
        db.close()
        event.remove(db_module.SessionLocal, "after_commit", capture_commit)

    assert payload["email"] == "operator@example.com"
    assert commits == []


def test_leaderboard_bundle_keeps_management_reviews_slim(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'leaderboard-slim.db'}")
    init_db()
    with session_scope() as db:
        db.add(
            TraderLeaderboardSnapshotRecord(
                trader_id="channel-rider",
                trader_name="Channel Cartographer",
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


def test_trader_detail_management_reviews_are_compact_but_keep_visible_fields(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'trader-detail-slim.db'}")
    init_db()
    with session_scope() as db:
        db.add(
            PositionManagementReviewRecord(
                trader_id="channel-rider",
                symbol="BTCUSDT",
                status="ok",
                position_id=1717,
                event_type="position_heartbeat",
                phase="OPEN_POSITION",
                provider="mock",
                model="mock-position-manager",
                decision="HOLD",
                confidence=74,
                action_type="HOLD",
                payload_json=to_json(
                    {
                        "event": {
                            "eventType": "position_heartbeat",
                            "phase": "OPEN_POSITION",
                            "reason": "Price is still below the invalidation line.",
                            "metrics": {"price": 60100.0, "stopLoss": 61300.0, "takeProfit": 59100.0},
                        },
                        "exposure": {
                            "kind": "position",
                            "id": 1717,
                            "side": "SHORT",
                            "entryPrice": 60347.5,
                            "stopLoss": 61300.0,
                            "takeProfit": 59100.0,
                            "quantity": 0.2,
                            "payload": {"largeDebugPayload": "x" * 20_000},
                        },
                        "review": {
                            "decision": "HOLD",
                            "rationale": "The short remains manageable because price has not reclaimed the stop.",
                            "riskFlags": ["watch_reclaim"],
                            "structuredReview": {
                                "headline": "Short is still manageable below the stop.",
                                "action": "Hold while price stays below 61300.",
                                "keyReasons": ["Current price is still under the invalidation line."],
                                "watchConditions": ["Exit if price reclaims 61300."],
                            },
                        },
                        "appliedActions": [],
                    }
                ),
            )
        )

    with session_scope() as db:
        payload = main.build_trader_detail_payload(
            db,
            "channel-rider",
            "BTCUSDT",
            {"id": "channel-rider", "name": "Channel Cartographer"},
            summaries=[],
            reviews_limit=1,
            events_limit=1,
            locale="en",
        )

    review = payload["managementReviews"][0]
    serialized = json.dumps(review)
    assert "payload" not in review
    assert "largeDebugPayload" not in serialized
    assert review["event"]["eventType"] == "position_heartbeat"
    assert review["event"]["metrics"]["stopLoss"] == 61300.0
    assert review["exposure"]["kind"] == "position"
    assert review["exposure"]["entryPrice"] == 60347.5
    assert "payload" not in review["exposure"]
    assert review["review"]["structuredReview"]["headline"] == "Short is still manageable below the stop."
    assert review["structuredReview"]["action"] == "Hold while price stays below 61300."
    assert review["rationale"] == "The short remains manageable because price has not reclaimed the stop."
