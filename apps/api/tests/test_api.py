import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.db import AIReviewRecord, EquitySnapshotRecord, PositionManagementReviewRecord, init_db, reset_db_engine, session_scope
from app.main import app
from app.repositories import to_json


client = TestClient(app)
OPS_TOKEN = "test-ops-token"


def ops_headers() -> dict[str, str]:
    return {"x-ops-api-token": OPS_TOKEN}


@pytest.fixture()
def temp_api_db(tmp_path):
    db_path = tmp_path / "api-test.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()
    yield db_path
    reset_db_engine("sqlite:///:memory:")
    init_db()


def test_health(monkeypatch):
    monkeypatch.setattr(main.settings, "build_sha", "test-build-sha")

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["buildSha"] == "test-build-sha"


def test_traders_list():
    response = client.get("/api/traders")
    assert response.status_code == 200
    data = response.json()
    assert len(data["traders"]) == 20
    assert {trader["id"] for trader in data["traders"]} == {
        "channel-rider",
        "volume-breaker",
        "pullback-architect",
        "leverage-hunter",
        "liquidity-reaper",
        "volatility-squeezer",
        "trend-sentinel",
        "range-maker",
        "funding-contrarian",
        "orderflow-sniper",
        "donchian-breakout",
        "ichimoku-cloud-pilot",
        "vwap-reclaimer",
        "wyckoff-spring",
        "rsi-divergence-scout",
        "session-raider",
        "imbalance-hunter",
        "momentum-ignition",
        "bollinger-reversion",
        "atr-trail-commander",
    }


def test_ai_provider_status_defaults_to_mock():
    response = client.get("/api/ai/providers")
    assert response.status_code == 200
    data = response.json()
    assert data["providers"]["mock"]["configured"] is True


def test_scanner_status_defaults_to_btc_only():
    response = client.get("/api/scanner/status")
    assert response.status_code == 200
    data = response.json()
    assert data["paperOnly"] is True
    assert data["symbols"] == ["BTCUSDT"]
    assert data["privateTradingApi"] is False
    assert "ticks" in data
    assert "skippedTicks" in data
    assert "scanInProgress" in data
    assert "realtimeExecutionLoop" in data
    assert data["realtimeExecutionLoop"]["mode"] == "paper"


def test_snapshot_to_engine_candle_includes_live_mark_price_for_execution_checks():
    candle = main.snapshot_to_engine_candle(
        {
            "price": 105,
            "timeframes": {
                "1m": {
                    "latestCandle": {
                        "openTime": 1_786_000_000_000,
                        "open": 100,
                        "high": 101,
                        "low": 99,
                        "close": 100,
                    }
                }
            },
        }
    )

    assert candle["high"] == 105
    assert candle["low"] == 99
    assert candle["close"] == 105


def test_auto_scanner_provider_accepts_anthropic_typo(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setenv("AUTO_SCANNER_PROVIDER", "anthriopic")

    settings = Settings()

    assert settings.auto_scanner_provider == "anthropic"
    assert main.normalize_provider("anthriopic") == "anthropic"


def test_trader_history_reset_endpoint_rejects_missing_ops_token(temp_api_db):
    response = client.post("/api/ops/trader-history/reset", json={"dryRun": True})

    assert response.status_code == 401
    assert response.json()["detail"] == "ops API token required"


def test_trader_history_reset_endpoint_dry_run(temp_api_db, monkeypatch):
    monkeypatch.setenv("OPS_API_TOKEN", OPS_TOKEN)

    response = client.post("/api/ops/trader-history/reset", headers=ops_headers(), json={"dryRun": True})

    assert response.status_code == 200
    data = response.json()
    assert data["dryRun"] is True
    assert data["executed"] is False
    assert "subscriber_preferences" in data["preservedTables"]
    assert "database" in data
    assert "://" in data["database"]["databaseUrl"]


def test_trader_history_reset_endpoint_rejects_destructive_without_confirmation(temp_api_db, monkeypatch):
    monkeypatch.setenv("OPS_API_TOKEN", OPS_TOKEN)

    response = client.post("/api/ops/trader-history/reset", headers=ops_headers(), json={"dryRun": False})

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RESET_CONFIRMATION_REQUIRED"
    assert "requiredConfirmationText" not in response.json()["detail"]


def test_trader_history_reset_endpoint_rejects_production_reset_without_server_flag(temp_api_db, monkeypatch):
    monkeypatch.setenv("OPS_API_TOKEN", OPS_TOKEN)
    monkeypatch.setattr(main.settings, "app_env", "production")
    monkeypatch.setattr(main.settings, "ops_allow_production_reset", False)

    response = client.post(
        "/api/ops/trader-history/reset",
        headers=ops_headers(),
        json={"dryRun": False, "confirmationText": "RESET_TRADER_HISTORY", "allowProduction": True},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "RESET_PRODUCTION_DISABLED_BY_SERVER"


def test_trader_history_reset_endpoint_rejects_remote_reset_without_server_flag(temp_api_db, monkeypatch):
    monkeypatch.setenv("OPS_API_TOKEN", OPS_TOKEN)
    monkeypatch.setattr(main.settings, "app_env", "local")
    monkeypatch.setattr(main.settings, "ops_allow_remote_reset", False)
    monkeypatch.setattr(main, "normalized_database_url", lambda: "postgresql+psycopg://operator@db.example/main")

    response = client.post(
        "/api/ops/trader-history/reset",
        headers=ops_headers(),
        json={"dryRun": False, "confirmationText": "RESET_TRADER_HISTORY", "allowRemote": True},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "RESET_REMOTE_DATABASE_DISABLED_BY_SERVER"


def test_trader_current_state_prioritizes_active_exposure():
    state = main.trader_current_state_payload(
        open_orders=2,
        open_positions=1,
        latest_plan_status="PAPER_TRADING_PENDING",
        latest_run_status="NO_CANDIDATE",
        agent_phase="PENDING_ORDER",
        last_decision="HOLD",
        last_action="MOVE_STOP",
    )

    assert state["key"] == "open_position"
    assert state["labelKey"] == "status.summary.openPosition"
    assert state["source"] == "position"


def test_trader_current_state_reports_watching_without_exposure():
    state = main.trader_current_state_payload(
        open_orders=0,
        open_positions=0,
        latest_plan_status=None,
        latest_run_status="NO_CANDIDATE",
        agent_phase=None,
        last_decision=None,
        last_action=None,
    )

    assert state["key"] == "watching"
    assert state["labelKey"] == "status.summary.watching"


def test_leaderboard_fast_serves_expired_cache_while_refreshing_in_background(monkeypatch):
    cache_key = ("BTCUSDT", True, True, "en", "current")
    main.LEAGUE_BUNDLE_CACHE.clear()
    main.LEAGUE_BUNDLE_CACHE[cache_key] = (
        0,
        {
            "symbol": "BTCUSDT",
            "lastUpdatedAt": "old-cache",
            "traders": [],
            "summaries": [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
        },
    )
    scheduled: list[tuple[str, bool, bool, str]] = []

    def fake_payload(*args, **kwargs):
        raise AssertionError("expired fast cache should be served before synchronous DB rebuild")

    def fake_schedule(_func, symbol, include_empty, include_related, locale):
        scheduled.append((symbol, include_empty, include_related, locale))

    monkeypatch.setattr(main, "list_traders", lambda: [])
    monkeypatch.setattr(main, "build_league_bundle_payload", fake_payload)
    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule)

    response = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&includeRelated=true")

    assert response.status_code == 200
    data = response.json()
    assert data["lastUpdatedAt"] == "old-cache"
    assert data["cacheHit"] is True
    assert data["stale"] is True
    assert data["scheduledRefresh"] is True
    assert scheduled == [("BTCUSDT", True, True, "en")]


def test_leaderboard_fast_returns_utc_monthly_league_without_live_cache_pollution(temp_api_db):
    main.LEAGUE_BUNDLE_CACHE.clear()
    may_start = datetime(2026, 5, 1, tzinfo=timezone.utc)
    june_start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        db.add_all(
            [
                EquitySnapshotRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="recorded",
                    cash_balance=Decimal("10000"),
                    equity=Decimal("10000"),
                    margin_used=Decimal("0"),
                    realized_pnl=Decimal("0"),
                    unrealized_pnl=Decimal("0"),
                    total_fees=Decimal("0"),
                    candle_time=may_start,
                    created_at=may_start,
                ),
                EquitySnapshotRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="recorded",
                    cash_balance=Decimal("11200"),
                    equity=Decimal("11200"),
                    margin_used=Decimal("0"),
                    realized_pnl=Decimal("1200"),
                    unrealized_pnl=Decimal("0"),
                    total_fees=Decimal("1"),
                    candle_time=june_start - timedelta(minutes=1),
                    created_at=june_start - timedelta(minutes=1),
                ),
                EquitySnapshotRecord(
                    trader_id="volume-breaker",
                    symbol="BTCUSDT",
                    status="recorded",
                    cash_balance=Decimal("10000"),
                    equity=Decimal("10000"),
                    margin_used=Decimal("0"),
                    realized_pnl=Decimal("0"),
                    unrealized_pnl=Decimal("0"),
                    total_fees=Decimal("0"),
                    candle_time=may_start,
                    created_at=may_start,
                ),
                EquitySnapshotRecord(
                    trader_id="volume-breaker",
                    symbol="BTCUSDT",
                    status="recorded",
                    cash_balance=Decimal("10400"),
                    equity=Decimal("10400"),
                    margin_used=Decimal("0"),
                    realized_pnl=Decimal("400"),
                    unrealized_pnl=Decimal("0"),
                    total_fees=Decimal("1"),
                    candle_time=june_start - timedelta(minutes=1),
                    created_at=june_start - timedelta(minutes=1),
                ),
            ]
        )

    monthly = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&leagueMonth=2026-05")
    live = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko")

    assert monthly.status_code == 200
    monthly_data = monthly.json()
    assert monthly_data["period"] == {
        "type": "monthly",
        "month": "2026-05",
        "start": "2026-05-01T00:00:00+00:00",
        "end": "2026-06-01T00:00:00+00:00",
        "timezone": "UTC",
    }
    assert monthly_data["source"] == "equity_snapshots_monthly"
    assert monthly_data["summaries"][0]["traderId"] == "channel-rider"
    assert monthly_data["summaries"][0]["monthlyReturn"] == 12.0
    assert monthly_data["summaries"][1]["monthlyReturn"] == 4.0
    assert monthly_data["positions"] == []
    assert monthly_data["orders"] == []

    assert live.status_code == 200
    live_data = live.json()
    assert live_data["period"]["type"] == "current"
    assert live_data["source"] != "equity_snapshots_monthly"


def test_leaderboard_fast_rejects_invalid_utc_month():
    response = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&leagueMonth=2026-13")

    assert response.status_code == 400
    assert response.json()["detail"] == "leagueMonth must use UTC YYYY-MM format."


def test_trader_detail_rebuilds_expired_cache(monkeypatch):
    cache_key = ("channel-rider", "BTCUSDT", 20, 10, "en", main.TRADER_DETAIL_CACHE_VERSION)
    main.TRADER_DETAIL_CACHE.clear()
    main.TRADER_DETAIL_CACHE[cache_key] = (
        0,
        {
            "symbol": "BTCUSDT",
            "trader": {"id": "channel-rider", "name": "Channel Cartographer"},
            "summaries": [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "lastUpdatedAt": "old-detail-cache",
        },
    )

    def fake_payload(db, trader_id, clean_symbol, trader, summaries=None, **kwargs):
        return {
            "symbol": clean_symbol,
            "trader": trader,
            "summaries": summaries or [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "lastUpdatedAt": "fresh-detail-cache",
            "cacheHit": False,
            "stale": False,
        }

    monkeypatch.setattr(main, "build_trader_detail_payload", fake_payload)

    response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT")

    assert response.status_code == 200
    data = response.json()
    assert data["lastUpdatedAt"] == "fresh-detail-cache"
    assert data["cacheHit"] is False
    assert data["stale"] is False


def test_trader_detail_uses_snapshot_summary_without_full_recompute(monkeypatch):
    main.TRADER_DETAIL_CACHE.clear()
    snapshot = {
        "traderId": "channel-rider",
        "symbol": "BTCUSDT",
        "currentState": {"key": "watching", "labelKey": "status.summary.watching", "source": "snapshot"},
    }

    def fake_snapshot(db, trader_id, clean_symbol):
        assert trader_id == "channel-rider"
        assert clean_symbol == "BTCUSDT"
        return snapshot

    def fail_summary(*args, **kwargs):
        raise AssertionError("detail route should use snapshot summary on the fast path")

    def fake_payload(db, trader_id, clean_symbol, trader, summaries=None, **kwargs):
        assert summaries == [snapshot]
        return {
            "symbol": clean_symbol,
            "trader": trader,
            "summaries": summaries,
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "events": [],
            "tradePlans": [],
            "cacheHit": False,
            "stale": False,
        }

    monkeypatch.setattr(main, "trader_snapshot_summary", fake_snapshot)
    monkeypatch.setattr(main, "trader_summary_for_profile", fail_summary)
    monkeypatch.setattr(main, "build_trader_detail_payload", fake_payload)

    response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT")

    assert response.status_code == 200
    assert response.json()["summaries"][0] == snapshot


def test_trader_detail_refresh_query_replaces_cached_payload(monkeypatch):
    cache_key = ("channel-rider", "BTCUSDT", 20, 10, "en", main.TRADER_DETAIL_CACHE_VERSION)
    main.TRADER_DETAIL_CACHE.clear()
    main.TRADER_DETAIL_CACHE[cache_key] = (
        time.monotonic() + 300,
        {
            "symbol": "BTCUSDT",
            "trader": {"id": "channel-rider", "name": "Channel Cartographer"},
            "summaries": [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "lastUpdatedAt": "fresh-but-forced-old",
        },
    )

    def fake_payload(db, trader_id, clean_symbol, trader, summaries=None, **kwargs):
        return {
            "symbol": clean_symbol,
            "trader": trader,
            "summaries": summaries or [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "lastUpdatedAt": "forced-fresh-detail",
            "cacheHit": False,
            "stale": False,
        }

    monkeypatch.setattr(main, "build_trader_detail_payload", fake_payload)

    response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT&refresh=true")

    assert response.status_code == 200
    data = response.json()
    assert data["lastUpdatedAt"] == "forced-fresh-detail"
    assert data["cacheHit"] is False
    assert data["stale"] is False
    assert main.TRADER_DETAIL_CACHE[cache_key][1]["lastUpdatedAt"] == "forced-fresh-detail"


def test_trader_detail_rejects_oversized_review_windows(monkeypatch):
    main.TRADER_DETAIL_CACHE.clear()

    async def fake_ensure_translations(*args, **kwargs):
        return True

    def fake_payload(db, trader_id, clean_symbol, trader, summaries=None, **kwargs):
        return {
            "symbol": clean_symbol,
            "trader": trader,
            "summaries": summaries or [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "events": [],
            "cacheHit": False,
            "stale": False,
        }

    monkeypatch.setattr(main, "ensure_trader_detail_translations", fake_ensure_translations)
    monkeypatch.setattr(main, "build_trader_detail_payload", fake_payload)

    reviews_response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT&reviewsLimit=51")
    events_response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT&eventsLimit=51")

    assert reviews_response.status_code == 422
    assert events_response.status_code == 422


def test_league_overview_reviews_returns_one_slim_combined_page(temp_api_db):
    now = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
    large_payload_blob = "x" * 10_000
    with session_scope() as db:
        for index in range(15):
            db.add(
                AIReviewRecord(
                    trader_id="session-raider",
                    symbol="BTCUSDT",
                    created_at=now - timedelta(minutes=index * 2),
                    decision="APPROVE",
                    risk_level="medium",
                    payload_json=to_json(
                        {
                            "approvalReason": f"entry review {index}",
                            "structuredReview": {"headline": f"entry headline {index}"},
                            "largeDebugPayload": large_payload_blob,
                        }
                    ),
                )
            )
            db.add(
                PositionManagementReviewRecord(
                    trader_id="volatility-squeezer",
                    symbol="BTCUSDT",
                    created_at=now - timedelta(minutes=index * 2 + 1),
                    decision="HOLD",
                    action_type="HOLD",
                    phase="OPEN_POSITION",
                    payload_json=to_json(
                        {
                            "event": {
                                "eventType": "position_heartbeat",
                                "phase": "OPEN_POSITION",
                                "reason": f"management event {index}",
                                "suggestedAction": "HOLD",
                            },
                            "review": {
                                "rationale": f"management review {index}",
                                "structuredReview": {"headline": f"management headline {index}"},
                            },
                            "largeDebugPayload": large_payload_blob,
                        }
                    ),
                )
            )

    first_page = client.get("/api/league/overview-reviews?limit=20&offset=0&locale=ko")
    assert first_page.status_code == 200
    data = first_page.json()
    assert len(data["reviews"]) == 20
    assert data["nextOffset"] == 20
    assert data["hasMore"] is True
    assert {review["overviewSource"] for review in data["reviews"]} == {"entry_review", "management_review"}
    assert "payload" not in data["reviews"][0]
    assert "largeDebugPayload" not in str(data)

    second_page = client.get("/api/league/overview-reviews?limit=10&offset=20&locale=ko")
    assert second_page.status_code == 200
    second_data = second_page.json()
    assert len(second_data["reviews"]) == 10
    assert second_data["nextOffset"] == 30
    assert second_data["hasMore"] is False


def test_league_overview_reviews_filters_hidden_reviews_before_pagination(temp_api_db):
    now = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        db.add_all(
            [
                AIReviewRecord(
                    trader_id="session-raider",
                    symbol="BTCUSDT",
                    status="ok",
                    decision="REJECT",
                    payload_json=to_json({"approvalReason": "rejected setup"}),
                    created_at=now,
                ),
                PositionManagementReviewRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="error",
                    decision="NEEDS_MORE_DATA",
                    action_type="NEEDS_MORE_DATA",
                    fallback=True,
                    payload_json=to_json(
                        {
                            "event": {"reason": "Position management provider failed."},
                            "review": {"rationale": "Position management provider failed."},
                        }
                    ),
                    created_at=now - timedelta(minutes=1),
                ),
                AIReviewRecord(
                    trader_id="session-raider",
                    symbol="BTCUSDT",
                    status="ok",
                    decision="ADJUST_AND_APPROVE",
                    payload_json=to_json({"approvalReason": "approved setup"}),
                    created_at=now - timedelta(minutes=2),
                ),
                PositionManagementReviewRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="ok",
                    decision="HOLD",
                    action_type="HOLD",
                    payload_json=to_json({"review": {"rationale": "hold open position"}}),
                    created_at=now - timedelta(minutes=3),
                ),
            ]
        )

    response = client.get("/api/league/overview-reviews?limit=20&offset=0&locale=ko")

    assert response.status_code == 200
    data = response.json()
    assert data["hasMore"] is False
    assert data["nextOffset"] == 2
    assert [review["decision"] for review in data["reviews"]] == ["ADJUST_AND_APPROVE", "HOLD"]


def test_trader_detail_repairs_missing_korean_management_review_translation(temp_api_db, monkeypatch):
    main.TRADER_DETAIL_CACHE.clear()
    monkeypatch.setattr(main.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(main.settings, "ai_translation_enabled", True)
    monkeypatch.setattr(main.settings, "ai_translation_target_locales", ["ko"])
    calls: list[str] = []

    async def fake_translate_json_with_logging(
        db,
        *,
        settings,
        payload,
        target_locale,
        symbol,
        trader_id,
        provider=None,
    ):
        calls.append(target_locale)
        assert target_locale == "ko"
        assert symbol == "BTCUSDT"
        assert trader_id == "imbalance-hunter"
        return {
            "event": {
                **payload["event"],
                "reason": "새 하락 변위가 숏 근거를 유지합니다.",
            },
            "review": {
                **payload["review"],
                "rationale": "새 하락 변위는 아직 숏 근거를 지지하지만, 손절 기준 접근 여부를 먼저 확인해야 합니다.",
                "structuredReview": {
                    **payload["review"]["structuredReview"],
                    "headline": "숏 근거는 아직 살아 있습니다.",
                    "action": "62853.7 위로 15분 종가가 닫히는지만 확인하세요.",
                },
            },
            "appliedActions": payload.get("appliedActions", []),
        }

    monkeypatch.setattr("app.ai.translation_cache.translate_json_with_logging", fake_translate_json_with_logging)

    with session_scope() as db:
        db.add(
            PositionManagementReviewRecord(
                trader_id="imbalance-hunter",
                symbol="BTCUSDT",
                status="ok",
                decision="HOLD",
                action_type="HOLD",
                phase="OPEN_POSITION",
                event_type="position_heartbeat",
                payload_json=to_json(
                    {
                        "event": {
                            "eventType": "position_heartbeat",
                            "phase": "OPEN_POSITION",
                            "reason": "Fresh bearish displacement still supports the short.",
                            "suggestedAction": "HOLD",
                        },
                        "review": {
                            "decision": "HOLD",
                            "rationale": "Fresh bearish displacement still supports the short, but repeated short losses require a cleaner invalidation check.",
                            "structuredReview": {
                                "headline": "Fresh bearish displacement still supports the short.",
                                "action": "Keep watching 62853.7 as the invalidation trigger.",
                                "riskLevel": "MEDIUM",
                            },
                        },
                        "appliedActions": [],
                    }
                ),
            )
        )

    response = client.get(
        "/api/league/traders/imbalance-hunter?symbol=BTCUSDT&locale=ko&reviewsLimit=5&eventsLimit=1"
    )

    assert response.status_code == 200
    review = response.json()["managementReviews"][0]
    assert calls == ["ko"]
    assert review["translation"]["status"] == "ok"
    assert review["rationale"] == "새 하락 변위는 아직 숏 근거를 지지하지만, 손절 기준 접근 여부를 먼저 확인해야 합니다."
    assert review["review"]["structuredReview"]["headline"] == "숏 근거는 아직 살아 있습니다."
    assert "Fresh bearish displacement" not in str(review)
