import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.db import AIReviewRecord, Base, EquitySnapshotRecord, PaperOrderRecord, PaperPositionRecord, PositionManagementReviewRecord, TraderLeaderboardSnapshotRecord, init_db, reset_db_engine, session_scope
from app.main import app
from app.repositories import to_json, upsert_translation_cache_record


client = TestClient(app)
OPS_TOKEN = "test-ops-token"


def ops_headers() -> dict[str, str]:
    return {"x-ops-api-token": OPS_TOKEN}


@pytest.fixture()
def temp_api_db(tmp_path):
    db_path = tmp_path / "api-test.db"
    reset_db_engine(f"sqlite:///{db_path}")
    main.OVERVIEW_REVIEWS_CACHE.clear()
    init_db()
    yield db_path
    main.OVERVIEW_REVIEWS_CACHE.clear()
    reset_db_engine("sqlite:///:memory:")
    init_db()


def test_health(monkeypatch):
    monkeypatch.setattr(main.settings, "build_sha", "test-build-sha")

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["buildSha"] == "test-build-sha"


@pytest.mark.parametrize(
    ("requested_locale", "translated_payload"),
    [
        (
            "ko",
            {
                "approvalReason": "상위 시간대 EMA 정렬이 회복되어 추세 감시관의 롱 진입을 승인합니다.",
                "structuredReview": {
                    "headline": "조정 뒤 트리거 구간을 회수해 추세 지속 롱 근거가 성립했습니다.",
                    "action": "계획된 트리거 구간 안에서만 진입하고 무효화 기준은 엄격히 유지합니다.",
                    "keyReasons": ["4시간 추세 지지가 회복되었습니다."],
                    "risks": ["펀딩이 이미 혼잡합니다."],
                    "watchConditions": ["트리거 구간 위에서는 추격하지 않습니다."],
                },
            },
        ),
        (
            "ru",
            {
                "approvalReason": "Trend Sentinel может открыть LONG, потому что EMA на старших таймфреймах восстановились.",
                "structuredReview": {
                    "headline": "LONG по продолжению тренда допустим после возврата в зону триггера.",
                    "action": "Входить только внутри запланированной зоны триггера и строго держать уровень отмены.",
                    "keyReasons": ["Поддержка 4h тренда восстановилась."],
                    "risks": ["Фандинг уже перегружен."],
                    "watchConditions": ["Не догонять цену выше зоны триггера."],
                },
            },
        ),
    ],
)
def test_paper_endpoints_localize_embedded_ai_review_when_locale_requested(
    temp_api_db,
    requested_locale,
    translated_payload,
):
    review_payload = {
        "decision": "APPROVE",
        "approvalReason": "Trend Sentinel can take the LONG because the higher-timeframe EMA stack recovered.",
        "structuredReview": {
            "headline": "Trend continuation LONG is valid after the pullback reclaimed the trigger zone.",
            "action": "Enter only inside the planned trigger zone and keep the invalidation strict.",
            "keyReasons": ["4h trend support has recovered."],
            "risks": ["Funding is already crowded."],
            "watchConditions": ["Do not chase above the trigger zone."],
        },
    }
    with session_scope() as db:
        review = AIReviewRecord(
            trader_id="trend-sentinel",
            symbol="BTCUSDT",
            status="ok",
            decision="APPROVE",
            payload_json=to_json(review_payload),
        )
        db.add(review)
        db.flush()
        upsert_translation_cache_record(
            db,
            source_type=main.AI_TRANSLATION_SOURCE_AI_REVIEW,
            source_id=review.id,
            source_hash=main.stable_source_hash(review_payload),
            locale=requested_locale,
            status="ok",
            payload=translated_payload,
        )
        embedded_payload = {
            "aiReviewId": review.id,
            "aiReview": review_payload,
            "aiApprovalReason": review_payload["approvalReason"],
            "aiStructuredReview": review_payload["structuredReview"],
        }
        db.add_all(
            [
                PaperPositionRecord(
                    trader_id="trend-sentinel",
                    symbol="BTCUSDT",
                    status="open",
                    side="long",
                    quantity=Decimal("0.1"),
                    entry_price=Decimal("62844.4"),
                    leverage=Decimal("5"),
                    notional=Decimal("6284.44"),
                    margin=Decimal("1256.888"),
                    payload_json=to_json(embedded_payload),
                ),
                PaperOrderRecord(
                    trader_id="trend-sentinel",
                    symbol="BTCUSDT",
                    status="open",
                    side="long",
                    order_type="limit",
                    quantity=Decimal("0.1"),
                    leverage=Decimal("5"),
                    limit_price=Decimal("62844.4"),
                    notional=Decimal("6284.44"),
                    margin=Decimal("1256.888"),
                    payload_json=to_json(embedded_payload),
                ),
            ]
        )

    positions_response = client.get(f"/api/paper/positions/active?symbol=BTCUSDT&locale={requested_locale}")
    all_positions_response = client.get(f"/api/paper/positions?symbol=BTCUSDT&status=open&locale={requested_locale}")
    orders_response = client.get(f"/api/paper/orders?symbol=BTCUSDT&status=open&locale={requested_locale}")

    assert positions_response.status_code == 200
    position_payload = positions_response.json()["positions"][0]["payload"]
    assert position_payload["aiApprovalReason"] == translated_payload["approvalReason"]
    assert position_payload["aiStructuredReview"]["headline"] == translated_payload["structuredReview"]["headline"]
    assert positions_response.json()["positions"][0]["translation"]["embeddedAiReview"]["status"] == "ok"

    assert all_positions_response.status_code == 200
    all_position_payload = all_positions_response.json()["positions"][0]["payload"]
    assert all_position_payload["aiApprovalReason"] == translated_payload["approvalReason"]
    assert all_position_payload["aiReview"]["structuredReview"]["headline"] == translated_payload["structuredReview"]["headline"]
    assert all_positions_response.json()["positions"][0]["translation"]["embeddedAiReview"]["status"] == "ok"

    assert orders_response.status_code == 200
    order_payload = orders_response.json()["orders"][0]["payload"]
    assert order_payload["aiApprovalReason"] == translated_payload["approvalReason"]
    assert order_payload["aiReview"]["structuredReview"]["headline"] == translated_payload["structuredReview"]["headline"]
    assert orders_response.json()["orders"][0]["translation"]["embeddedAiReview"]["status"] == "ok"


def test_active_position_detail_keeps_entry_approval_separate_from_management_review(temp_api_db):
    entry_review_payload = {
        "decision": "ADJUST_AND_APPROVE",
        "approvalReason": "ENTRY APPROVAL MARKER: breakout trigger made this position worth opening.",
        "structuredReview": {
            "headline": "ENTRY APPROVAL MARKER: breakout trigger explains why the LONG was opened.",
            "action": "Enter only while the breakout trigger remains active.",
            "keyReasons": ["ENTRY APPROVAL MARKER: buyers reclaimed the trigger zone."],
            "risks": ["The entry is invalid if the reclaimed zone fails."],
            "watchConditions": ["Watch whether the breakout trigger holds."],
            "managerNote": "Entry approval is not a management update.",
        },
    }
    management_payload = {
        "event": {"eventType": "heartbeat", "phase": "OPEN_POSITION", "reason": "MANAGEMENT REVIEW MARKER event"},
        "review": {
            "decision": "HOLD",
            "rationale": "MANAGEMENT REVIEW MARKER: keep holding the already open position.",
            "structuredReview": {
                "headline": "MANAGEMENT REVIEW MARKER: current position is being monitored.",
                "action": "MANAGEMENT REVIEW MARKER: hold and wait for the next review.",
                "keyReasons": ["MANAGEMENT REVIEW MARKER: unrealized PnL is positive."],
                "risks": ["MANAGEMENT REVIEW MARKER: stop can be approached."],
                "watchConditions": ["MANAGEMENT REVIEW MARKER: next candle close."],
                "managerNote": "MANAGEMENT REVIEW MARKER: management-only note.",
            },
        },
    }
    with session_scope() as db:
        review = AIReviewRecord(
            trader_id="entry-detail-test",
            symbol="BTCUSDT",
            status="ok",
            decision="ADJUST_AND_APPROVE",
            payload_json=to_json(entry_review_payload),
        )
        db.add(review)
        db.flush()
        position = PaperPositionRecord(
            trader_id="entry-detail-test",
            symbol="BTCUSDT",
            status="open",
            side="long",
            quantity=Decimal("0.1"),
            entry_price=Decimal("64000"),
            leverage=Decimal("5"),
            notional=Decimal("6400"),
            margin=Decimal("1280"),
            payload_json=to_json(
                {
                    "aiReviewId": review.id,
                    "aiReview": entry_review_payload,
                    "aiApprovalReason": entry_review_payload["approvalReason"],
                    "aiStructuredReview": entry_review_payload["structuredReview"],
                }
            ),
        )
        db.add(position)
        db.flush()
        db.add(
            PositionManagementReviewRecord(
                trader_id="entry-detail-test",
                symbol="BTCUSDT",
                status="ok",
                position_id=position.id,
                phase="OPEN_POSITION",
                decision="HOLD",
                action_type="HOLD",
                payload_json=to_json(management_payload),
                created_at=datetime.now(timezone.utc) + timedelta(minutes=5),
            )
        )

    response = client.get("/api/paper/positions/active?symbol=BTCUSDT&trader_id=entry-detail-test&locale=en")

    assert response.status_code == 200
    returned_position = response.json()["positions"][0]
    serialized = str(returned_position)
    payload = returned_position["payload"]
    assert payload["aiApprovalReason"].startswith("ENTRY APPROVAL MARKER")
    assert payload["aiStructuredReview"]["headline"].startswith("ENTRY APPROVAL MARKER")
    assert "MANAGEMENT REVIEW MARKER" not in serialized


def test_position_win_loss_counts_excludes_breakeven_from_losses(temp_api_db):
    with session_scope() as db:
        db.add_all(
            [
                PaperPositionRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="closed",
                    side="long",
                    quantity=Decimal("1"),
                    entry_price=Decimal("100"),
                    leverage=Decimal("1"),
                    notional=Decimal("100"),
                    margin=Decimal("100"),
                    realized_pnl=Decimal("12.5"),
                    close_reason="take_profit",
                    closed_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
                ),
                PaperPositionRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="closed",
                    side="short",
                    quantity=Decimal("1"),
                    entry_price=Decimal("100"),
                    leverage=Decimal("1"),
                    notional=Decimal("100"),
                    margin=Decimal("100"),
                    realized_pnl=Decimal("-3"),
                    close_reason="stop_loss",
                    closed_at=datetime(2026, 7, 2, tzinfo=timezone.utc),
                ),
                PaperPositionRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="closed",
                    side="long",
                    quantity=Decimal("1"),
                    entry_price=Decimal("100"),
                    leverage=Decimal("1"),
                    notional=Decimal("100"),
                    margin=Decimal("100"),
                    realized_pnl=Decimal("0"),
                    close_reason="breakeven",
                    closed_at=datetime(2026, 7, 3, tzinfo=timezone.utc),
                ),
            ]
        )

    with session_scope() as db:
        closed_positions, wins, losses = main.position_win_loss_counts(db, "channel-rider", "BTCUSDT")

    assert closed_positions == 3
    assert wins == 1
    assert losses == 1


def test_position_cycle_pnl_aggregates_partial_events_and_open_unrealized():
    positions = [
        SimpleNamespace(id=1, status="closed", realized_pnl=Decimal("-1.25"), unrealized_pnl=Decimal("0")),
        SimpleNamespace(id=2, status="open", realized_pnl=Decimal("0"), unrealized_pnl=Decimal("35.5")),
        SimpleNamespace(id=3, status="closed", realized_pnl=Decimal("-8.5"), unrealized_pnl=Decimal("0")),
    ]
    events_by_position_id = {
        1: [
            SimpleNamespace(position_id=1, realized_pnl=Decimal("42.50")),
            SimpleNamespace(position_id=1, realized_pnl=Decimal("-1.25")),
        ],
        2: [
            SimpleNamespace(position_id=2, realized_pnl=Decimal("7.25")),
        ],
    }

    values = main.position_cycle_pnl_values(positions, events_by_position_id)

    assert values == [41.25, 42.75, -8.5]
    assert main.biggest_win_from_pnls(values) == 42.75
    assert main.biggest_loss_from_pnls(values) == -8.5
    assert main.win_rate_from_counts(0, 0) == 0.0


def test_traders_list():
    response = client.get("/api/traders")
    assert response.status_code == 200
    data = response.json()
    assert len(data["traders"]) == 22
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
        "liquidation-pressure-sniper",
        "volatility-skew-sentinel",
    }
    by_id = {trader["id"]: trader for trader in data["traders"]}
    assert by_id["liquidation-pressure-sniper"]["lifecycleStatus"] == "new"
    assert by_id["volatility-skew-sentinel"]["lifecycleStatus"] == "new"
    assert by_id["volatility-squeezer"]["lifecycleStatus"] == "retired"
    assert by_id["imbalance-hunter"]["retiredFromMonth"] == "2026-07"
    assert by_id["leverage-hunter"]["lifecycleStatus"] == "retired"
    assert by_id["leverage-hunter"]["retiredFromMonth"] == "2026-07"


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


def test_leaderboard_fast_serves_expired_monthly_cache_while_refreshing_same_month(monkeypatch):
    cache_key = ("BTCUSDT", True, False, "ko", "2026-06")
    main.LEAGUE_BUNDLE_CACHE.clear()
    main.LEAGUE_BUNDLE_CACHE[cache_key] = (
        0,
        {
            "symbol": "BTCUSDT",
            "period": {"type": "monthly", "month": "2026-06"},
            "lastUpdatedAt": "old-monthly-cache",
            "traders": [],
            "summaries": [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
        },
    )
    scheduled: list[tuple[str, tuple]] = []

    def fail_inline_monthly_build(*args, **kwargs):
        raise AssertionError("expired monthly cache should be served before synchronous DB rebuild")

    def fake_schedule_thread_refresh(func, *args):
        scheduled.append((func.__name__, args))

    monkeypatch.setattr(main, "list_traders", lambda: [])
    monkeypatch.setattr(main, "build_monthly_league_bundle_payload", fail_inline_monthly_build)
    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)

    response = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&leagueMonth=2026-06")

    assert response.status_code == 200
    data = response.json()
    assert data["period"]["month"] == "2026-06"
    assert data["lastUpdatedAt"] == "old-monthly-cache"
    assert data["cacheHit"] is True
    assert data["stale"] is True
    assert data["scheduledRefresh"] is True
    assert scheduled == [("refresh_league_bundle_cache_background", ("BTCUSDT", True, False, "ko", "2026-06"))]


def test_leaderboard_fast_schedules_missing_snapshot_refresh_without_blocking(temp_api_db, monkeypatch):
    main.LEAGUE_BUNDLE_CACHE.clear()
    scheduled: list[tuple[str, tuple]] = []

    def fail_sync_refresh(*args, **kwargs):
        raise AssertionError("missing leaderboard snapshots should refresh after the response")

    def fake_schedule_thread_refresh(func, *args):
        scheduled.append((func.__name__, args))

    monkeypatch.setattr(main, "refresh_leaderboard_snapshots", fail_sync_refresh)
    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)

    response = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=en")

    assert response.status_code == 200
    data = response.json()
    assert data["cacheHit"] is False
    assert data["scheduledRefresh"] is True
    assert data["missingSnapshotCount"] == len(main.list_traders())
    assert scheduled == [("refresh_league_bundle_cache_background", ("BTCUSDT", True, False, "en"))]


def test_leaderboard_fast_schedules_monthly_cache_miss_without_blocking(temp_api_db, monkeypatch):
    main.LEAGUE_BUNDLE_CACHE.clear()
    scheduled: list[tuple[str, tuple]] = []

    def fail_inline_monthly_build(*args, **kwargs):
        raise AssertionError("monthly leaderboard cache miss should refresh after the response")

    def fake_schedule_thread_refresh(func, *args):
        scheduled.append((func.__name__, args))

    monkeypatch.setattr(main, "build_monthly_league_bundle_payload", fail_inline_monthly_build)
    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)

    response = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&leagueMonth=2026-06")

    assert response.status_code == 200
    data = response.json()
    assert data["period"]["type"] == "monthly"
    assert data["period"]["month"] == "2026-06"
    assert data["cacheHit"] is False
    assert data["stale"] is True
    assert data["scheduledRefresh"] is True
    assert data["warming"] is True
    assert data["summaries"] == []
    assert scheduled == [("refresh_league_bundle_cache_background", ("BTCUSDT", True, False, "ko", "2026-06"))]


def test_leaderboard_fast_returns_utc_monthly_league_without_live_cache_pollution(temp_api_db):
    main.LEAGUE_BUNDLE_CACHE.clear()
    may_start = datetime(2026, 5, 1, tzinfo=timezone.utc)
    june_start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    with session_scope() as db:
        db.add_all(
            [
                TraderLeaderboardSnapshotRecord(
                    trader_id="channel-rider",
                    trader_name="Channel Rider",
                    symbol="BTCUSDT",
                    equity=12000,
                    cash_balance=12000,
                    total_pnl=2000,
                    return_7d=2.5,
                    return_30d=8.5,
                    rank_score=8.5,
                    has_live_paper_data=True,
                    max_drawdown=-1.0,
                    risk_percent=0.35,
                ),
                TraderLeaderboardSnapshotRecord(
                    trader_id="volume-breaker",
                    trader_name="Volume Breaker",
                    symbol="BTCUSDT",
                    equity=10400,
                    cash_balance=10400,
                    total_pnl=400,
                    return_7d=-1.25,
                    return_30d=4.0,
                    rank_score=4.0,
                    has_live_paper_data=True,
                    max_drawdown=-2.0,
                    risk_percent=0.35,
                ),
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

    monthly = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&leagueMonth=2026-05&refresh=true")
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
    assert monthly_data["summaries"][0]["cumulativeReturn"] == 12.0
    assert monthly_data["summaries"][0]["return24h"] == 12.0
    assert monthly_data["summaries"][0]["return7d"] == 12.0
    assert monthly_data["summaries"][0]["return30d"] == 12.0
    assert monthly_data["summaries"][1]["monthlyReturn"] == 4.0
    assert monthly_data["summaries"][1]["cumulativeReturn"] == 4.0
    assert monthly_data["summaries"][1]["return7d"] == 4.0
    assert monthly_data["summaries"][1]["return30d"] == 4.0
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


def test_monthly_leaderboard_retired_july_traders_are_hidden_but_current_keeps_catalog(temp_api_db):
    main.LEAGUE_BUNDLE_CACHE.clear()

    june = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&leagueMonth=2026-06&refresh=true")
    monthly = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&leagueMonth=2026-07&refresh=true")
    current = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&locale=ko&refresh=true")

    assert june.status_code == 200
    june_trader_ids = {trader["id"] for trader in june.json()["traders"]}
    assert "liquidation-pressure-sniper" not in june_trader_ids
    assert "volatility-skew-sentinel" not in june_trader_ids

    assert monthly.status_code == 200
    monthly_data = monthly.json()
    monthly_trader_ids = {trader["id"] for trader in monthly_data["traders"]}
    monthly_summary_ids = {summary["traderId"] for summary in monthly_data["summaries"]}
    assert "volatility-squeezer" not in monthly_trader_ids
    assert "imbalance-hunter" not in monthly_trader_ids
    assert "leverage-hunter" not in monthly_trader_ids
    assert "volatility-squeezer" not in monthly_summary_ids
    assert "imbalance-hunter" not in monthly_summary_ids
    assert "leverage-hunter" not in monthly_summary_ids
    assert {"liquidation-pressure-sniper", "volatility-skew-sentinel"}.issubset(monthly_trader_ids)
    assert {"liquidation-pressure-sniper", "volatility-skew-sentinel"}.issubset(monthly_summary_ids)

    assert current.status_code == 200
    current_ids = {trader["id"] for trader in current.json()["traders"]}
    assert {
        "volatility-squeezer",
        "imbalance-hunter",
        "leverage-hunter",
        "liquidation-pressure-sniper",
        "volatility-skew-sentinel",
    }.issubset(current_ids)


def test_scanner_trader_catalog_skips_retired_strategies_after_july_without_removing_them_from_management():
    started_at = datetime(2026, 7, 1, tzinfo=timezone.utc)

    scanner_ids = {trader.id for trader in main.list_scanner_traders(started_at)}
    all_ids = {trader.id for trader in main.list_traders()}

    assert "volatility-squeezer" not in scanner_ids
    assert "imbalance-hunter" not in scanner_ids
    assert "leverage-hunter" not in scanner_ids
    assert "volatility-squeezer" in all_ids
    assert "imbalance-hunter" in all_ids
    assert "leverage-hunter" in all_ids
    assert {"liquidation-pressure-sniper", "volatility-skew-sentinel"}.issubset(scanner_ids)


def test_monthly_leaderboard_reuses_position_rows_per_trader(monkeypatch):
    trader = SimpleNamespace(id="channel-rider", name="Channel Cartographer", baseRiskPercent=0.35)
    start_snapshot = SimpleNamespace(
        cash_balance=Decimal("10000"),
        equity=Decimal("10000"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("0"),
        total_fees=Decimal("0"),
    )
    end_snapshot = SimpleNamespace(
        cash_balance=Decimal("10500"),
        equity=Decimal("10500"),
        realized_pnl=Decimal("500"),
        unrealized_pnl=Decimal("0"),
        total_fees=Decimal("2"),
    )
    positions = [
        SimpleNamespace(
            id=101,
            status="closed",
            realized_pnl=Decimal("12.5"),
            unrealized_pnl=Decimal("0"),
            side="long",
            close_reason="take_profit",
            closed_at=datetime(2026, 6, 4, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=102,
            status="closed",
            realized_pnl=Decimal("-3"),
            unrealized_pnl=Decimal("0"),
            side="short",
            close_reason="stop_loss",
            closed_at=datetime(2026, 6, 3, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=103,
            status="closed",
            realized_pnl=Decimal("0"),
            unrealized_pnl=Decimal("0"),
            side="long",
            close_reason="breakeven",
            closed_at=datetime(2026, 6, 2, tzinfo=timezone.utc),
        ),
    ]
    position_query_calls = 0

    def fake_monthly_equity_points_by_trader(*args, **kwargs):
        return {trader.id: (start_snapshot, end_snapshot, [start_snapshot, end_snapshot])}

    def fake_monthly_positions_by_trader(*args, **kwargs):
        nonlocal position_query_calls
        position_query_calls += 1
        return {trader.id: positions}

    def fake_live_summary(*args, **kwargs):
        return {
            "cumulativeReturn": 5.0,
            "return24h": 0.25,
            "return7d": 1.5,
            "return30d": 4.0,
        }

    monkeypatch.setattr(main, "list_traders_for_league_month", lambda league_month: [trader])
    monkeypatch.setattr(main, "monthly_equity_points_by_trader", fake_monthly_equity_points_by_trader)
    monkeypatch.setattr(main, "monthly_positions_by_trader", fake_monthly_positions_by_trader)
    monkeypatch.setattr(main, "monthly_cycle_positions_by_trader", lambda *args, **kwargs: {trader.id: positions})
    monkeypatch.setattr(main, "all_time_biggest_wins_by_trader", lambda *args, **kwargs: {trader.id: 12.5}, raising=False)
    monkeypatch.setattr(main, "trade_events_by_position_id", lambda *args, **kwargs: {})
    monkeypatch.setattr(main, "trader_snapshot_summary", fake_live_summary)

    summaries = main.monthly_leaderboard_summaries(
        object(),
        "BTCUSDT",
        datetime(2026, 6, 1, tzinfo=timezone.utc),
        datetime(2026, 7, 1, tzinfo=timezone.utc),
    )

    assert position_query_calls == 1
    assert summaries[0]["closedPositions"] == 3
    assert summaries[0]["wins"] == 1
    assert summaries[0]["losses"] == 1
    assert summaries[0]["winRate"] == 50.0
    assert summaries[0]["biggestWin"] == 12.5
    assert summaries[0]["biggestLoss"] == -3.0
    assert summaries[0]["longTrades"] == 2
    assert summaries[0]["shortTrades"] == 1


def test_monthly_leaderboard_biggest_win_uses_all_time_value(monkeypatch):
    trader = SimpleNamespace(id="donchian-breakout", name="Donchian Breakout Boss", baseRiskPercent=0.35)
    start_snapshot = SimpleNamespace(
        cash_balance=Decimal("10000"),
        equity=Decimal("10000"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("0"),
        total_fees=Decimal("0"),
    )
    end_snapshot = SimpleNamespace(
        cash_balance=Decimal("10300"),
        equity=Decimal("10300"),
        realized_pnl=Decimal("120"),
        unrealized_pnl=Decimal("180"),
        total_fees=Decimal("6"),
    )
    closed_position = SimpleNamespace(
        id=201,
        status="closed",
        realized_pnl=Decimal("-1.25"),
        unrealized_pnl=Decimal("0"),
        side="short",
        close_reason="stop_loss",
        closed_at=datetime(2026, 7, 2, tzinfo=timezone.utc),
    )
    open_position = SimpleNamespace(
        id=202,
        status="open",
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("185"),
        side="long",
        close_reason=None,
        closed_at=None,
    )
    events_by_position_id = {
        201: [
            SimpleNamespace(position_id=201, realized_pnl=Decimal("42.50")),
            SimpleNamespace(position_id=201, realized_pnl=Decimal("-1.25")),
        ],
        202: [
            SimpleNamespace(position_id=202, realized_pnl=Decimal("7.25")),
        ],
    }

    monkeypatch.setattr(main, "list_traders_for_league_month", lambda league_month: [trader])
    monkeypatch.setattr(
        main,
        "monthly_equity_points_by_trader",
        lambda *args, **kwargs: {trader.id: (start_snapshot, end_snapshot, [start_snapshot, end_snapshot])},
    )
    monkeypatch.setattr(main, "monthly_positions_by_trader", lambda *args, **kwargs: {trader.id: [closed_position]})
    monkeypatch.setattr(
        main,
        "monthly_cycle_positions_by_trader",
        lambda *args, **kwargs: {trader.id: [closed_position, open_position]},
    )
    monkeypatch.setattr(
        main,
        "all_time_biggest_wins_by_trader",
        lambda *args, **kwargs: {trader.id: 420.75},
        raising=False,
    )
    monkeypatch.setattr(main, "trade_events_by_position_id", lambda *args, **kwargs: events_by_position_id)

    summaries = main.monthly_leaderboard_summaries(
        object(),
        "BTCUSDT",
        datetime(2026, 7, 1, tzinfo=timezone.utc),
        datetime(2026, 8, 1, tzinfo=timezone.utc),
    )

    assert summaries[0]["closedPositions"] == 1
    assert summaries[0]["wins"] == 1
    assert summaries[0]["losses"] == 0
    assert summaries[0]["winRate"] == 100.0
    assert summaries[0]["biggestWin"] == 420.75
    assert summaries[0]["biggestLoss"] == 0.0


def test_monthly_league_bundle_omits_status_feeds_unless_related_requested(monkeypatch):
    def fail_status_feeds(*args, **kwargs):
        raise AssertionError("summary monthly leaderboard should not serialize status feeds")

    monkeypatch.setattr(main, "monthly_leaderboard_summaries", lambda *args, **kwargs: [])
    monkeypatch.setattr(main, "list_traders_for_league_month", lambda league_month: [])
    monkeypatch.setattr(main, "list_status_feed_payloads", fail_status_feeds)

    payload = main.build_monthly_league_bundle_payload(
        object(),
        "BTCUSDT",
        "2026-07",
        datetime(2026, 7, 1, tzinfo=timezone.utc),
        datetime(2026, 8, 1, tzinfo=timezone.utc),
        include_empty=True,
        include_related=False,
        locale="ko",
    )

    assert payload["statusFeeds"] == []


def test_monthly_leaderboard_cache_uses_month_roster_size(monkeypatch):
    monthly_traders = [SimpleNamespace(id=f"monthly-{index}") for index in range(20)]
    all_traders = [*monthly_traders, SimpleNamespace(id="new-1"), SimpleNamespace(id="new-2")]
    payload = {
        "symbol": "BTCUSDT",
        "traders": [{"id": trader.id} for trader in monthly_traders],
        "summaries": [{"traderId": "monthly-0"}],
    }
    cache_key = ("BTCUSDT", True, False, "ko", "2026-07")

    monkeypatch.setattr(main, "init_db", lambda: None)
    monkeypatch.setattr(main, "list_traders", lambda: all_traders)
    monkeypatch.setattr(main, "list_traders_for_league_month", lambda league_month: monthly_traders)
    main.LEAGUE_BUNDLE_CACHE.clear()
    main.LEAGUE_BUNDLE_CACHE[cache_key] = (time.monotonic() + 60, payload)

    try:
        result = main.league_leaderboard_fast(
            symbol="BTCUSDT",
            include_empty=True,
            include_related=False,
            refresh=False,
            locale="ko",
            league_month="2026-07",
            db=object(),
        )
    finally:
        main.LEAGUE_BUNDLE_CACHE.clear()

    assert result["cacheHit"] is True
    assert result["summaries"] == payload["summaries"]


def test_trader_detail_serves_expired_cache_while_refreshing_in_background(monkeypatch):
    cache_key = ("channel-rider", "BTCUSDT", 20, 20, "en", main.TRADER_DETAIL_CACHE_VERSION)
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
    scheduled: list[tuple[str, tuple]] = []

    def fake_schedule_thread_refresh(func, *args):
        scheduled.append((func.__name__, args))

    def fail_sync_rebuild(*args, **kwargs):
        raise AssertionError("expired trader detail cache should return before synchronous rebuild")

    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)
    monkeypatch.setattr(main, "build_trader_detail_payload", fail_sync_rebuild)

    response = client.get("/api/league/traders/channel-rider?symbol=BTCUSDT")

    assert response.status_code == 200
    data = response.json()
    assert data["lastUpdatedAt"] == "old-detail-cache"
    assert data["cacheHit"] is True
    assert data["stale"] is True
    assert data["scheduledRefresh"] is True
    assert scheduled == [("refresh_trader_detail_cache_background", ("channel-rider", "BTCUSDT", "en"))]


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
    cache_key = ("channel-rider", "BTCUSDT", 20, 20, "en", main.TRADER_DETAIL_CACHE_VERSION)
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


def test_league_overview_reviews_returns_one_slim_combined_page(temp_api_db, monkeypatch):
    now = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
    large_payload_blob = "x" * 10_000
    translation_cache_calls = 0

    def fake_localized_payload_for_source(*args, **kwargs):
        nonlocal translation_cache_calls
        translation_cache_calls += 1
        raise AssertionError("overview review stream must not block first paint on per-row translation cache lookups")

    monkeypatch.setattr(main, "localized_payload_for_source", fake_localized_payload_for_source)

    with session_scope() as db:
        translated_entry_record_id = None
        for index in range(15):
            entry_payload = {
                "approvalReason": f"entry review {index}",
                "structuredReview": {"headline": f"entry headline {index}"},
                "largeDebugPayload": large_payload_blob,
            }
            entry_record = AIReviewRecord(
                trader_id="session-raider",
                symbol="BTCUSDT",
                created_at=now - timedelta(minutes=index * 2),
                decision="APPROVE",
                risk_level="medium",
                payload_json=to_json(entry_payload),
            )
            db.add(entry_record)
            db.flush()
            if index == 0:
                translated_entry_record_id = entry_record.id
                upsert_translation_cache_record(
                    db,
                    source_type=main.AI_TRANSLATION_SOURCE_AI_REVIEW,
                    source_id=entry_record.id,
                    source_hash=main.stable_source_hash(entry_payload),
                    locale="ko",
                    status="ok",
                    payload={
                        "approvalReason": "한국어 진입 검토 0",
                        "structuredReview": {"headline": "한국어 진입 헤드라인 0"},
                    },
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
    assert translation_cache_calls == 0
    translated_review = next(review for review in data["reviews"] if review["id"] == translated_entry_record_id)
    assert translated_review["rationale"] == "한국어 진입 검토 0"
    assert translated_review["translation"]["status"] == "ok"

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


def test_league_overview_reviews_accepts_case_variants_without_function_filters(temp_api_db):
    now = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        db.add_all(
            [
                AIReviewRecord(
                    trader_id="session-raider",
                    symbol="BTCUSDT",
                    status="OK",
                    decision="adjust_and_approve",
                    payload_json=to_json({"approvalReason": "mixed-case entry"}),
                    created_at=now,
                ),
                PositionManagementReviewRecord(
                    trader_id="range-maker",
                    symbol="BTCUSDT",
                    status="Success",
                    decision="hold",
                    action_type="hold",
                    payload_json=to_json({"review": {"rationale": "mixed-case management"}}),
                    created_at=now - timedelta(minutes=1),
                ),
            ]
        )

    response = client.get("/api/league/overview-reviews?limit=20&offset=0&locale=en")

    assert response.status_code == 200
    data = response.json()
    assert data["nextOffset"] == 2
    assert [review["decision"] for review in data["reviews"]] == ["adjust_and_approve", "hold"]


def test_trader_detail_hot_path_indexes_are_declared():
    required_indexes = {
        "trade_plans": {"ix_trade_plans_trader_symbol_created"},
        "position_management_reviews": {"ix_position_management_reviews_trader_symbol_created"},
        "paper_orders": {"ix_paper_orders_trader_symbol_status_created"},
        "paper_positions": {"ix_paper_positions_trader_symbol_status_created"},
        "trade_events": {"ix_trade_events_trader_symbol_created"},
        "equity_snapshots": {"ix_equity_snapshots_trader_symbol_created"},
    }

    for table_name, expected in required_indexes.items():
        actual = {index.name for index in Base.metadata.tables[table_name].indexes}
        assert expected <= actual


def test_trader_management_reviews_endpoint_returns_compact_pages(temp_api_db):
    now = datetime(2026, 6, 19, 12, 0, tzinfo=timezone.utc)
    with session_scope() as db:
        for index in range(3):
            db.add(
                PositionManagementReviewRecord(
                    trader_id="channel-rider",
                    symbol="BTCUSDT",
                    status="ok",
                    position_id=900 + index,
                    event_type="position_heartbeat",
                    phase="OPEN_POSITION",
                    decision="HOLD",
                    action_type="HOLD",
                    created_at=now - timedelta(minutes=index),
                    payload_json=to_json(
                        {
                            "event": {
                                "eventType": "position_heartbeat",
                                "phase": "OPEN_POSITION",
                                "metrics": {"price": 60100 + index, "stopLoss": 61300},
                            },
                            "exposure": {
                                "kind": "position",
                                "id": 900 + index,
                                "side": "SHORT",
                                "entryPrice": 60347.5,
                                "payload": {"largeDebugPayload": "x" * 10_000},
                            },
                            "review": {
                                "decision": "HOLD",
                                "rationale": f"compact review {index}",
                                "structuredReview": {"headline": f"headline {index}"},
                            },
                        }
                    ),
                )
            )

    response = client.get("/api/league/traders/channel-rider/management-reviews?symbol=BTCUSDT&limit=2&offset=0")

    assert response.status_code == 200
    data = response.json()
    assert len(data["managementReviews"]) == 2
    assert data["nextOffset"] == 2
    assert data["hasMore"] is True
    review = data["managementReviews"][0]
    assert "payload" not in review
    assert "largeDebugPayload" not in str(data)
    assert review["event"]["metrics"]["stopLoss"] == 61300
    assert review["exposure"]["entryPrice"] == 60347.5
    assert review["review"]["structuredReview"]["headline"] == "headline 0"

    second = client.get("/api/league/traders/channel-rider/management-reviews?symbol=BTCUSDT&limit=2&offset=2")
    assert second.status_code == 200
    assert second.json()["hasMore"] is False


def test_overview_warmup_primes_all_supported_locale_first_pages(temp_api_db, monkeypatch):
    warmed: list[tuple[int, int, str | None, str]] = []

    def fake_cached_overview_review_records(db, *, limit, offset, symbol=None, trader_id=None, locale="en"):
        warmed.append((limit, offset, symbol, locale))
        return {"reviews": [], "nextOffset": 0, "hasMore": False}

    monkeypatch.setattr(main, "cached_overview_review_records", fake_cached_overview_review_records)
    monkeypatch.setattr(main.settings, "ai_translation_target_locales", ["ko"])

    with session_scope() as db:
        main.warm_overview_review_cache(db, "BTCUSDT")

    assert {locale for _limit, _offset, _symbol, locale in warmed} == set(main.SUPPORTED_LOCALES)
    assert all((limit, offset, symbol) == (20, 0, "BTCUSDT") for limit, offset, symbol, _locale in warmed)


def test_overview_stale_cache_is_served_before_background_refresh(temp_api_db, monkeypatch):
    key = (20, 0, "BTCUSDT", None, "ko")
    main.OVERVIEW_REVIEWS_CACHE[key] = (0, {"reviews": [{"id": 1}], "nextOffset": 1, "hasMore": False})
    scheduled: list[tuple[int, int, str | None, str | None, str]] = []

    def fake_schedule_thread_refresh(func, limit, offset, symbol, trader_id, locale):
        scheduled.append((limit, offset, symbol, trader_id, locale))

    def fail_sync_rebuild(*args, **kwargs):
        raise AssertionError("stale overview cache should be served before synchronous rebuild")

    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)
    monkeypatch.setattr(main, "list_overview_review_records", fail_sync_rebuild)

    with session_scope() as db:
        payload = main.cached_overview_review_records(db, limit=20, offset=0, symbol="BTCUSDT", locale="ko")

    assert payload["reviews"] == [{"id": 1}]
    assert scheduled == [(20, 0, "BTCUSDT", None, "ko")]
    assert key in main.OVERVIEW_REVIEWS_REFRESHING
    main.OVERVIEW_REVIEWS_REFRESHING.clear()


def test_overview_prefer_cached_returns_warming_without_sync_db_on_cold_cache(temp_api_db, monkeypatch):
    scheduled: list[tuple[int, int, str | None, str | None, str]] = []

    def fake_schedule_thread_refresh(func, limit, offset, symbol, trader_id, locale):
        scheduled.append((limit, offset, symbol, trader_id, locale))

    def fail_sync_rebuild(*args, **kwargs):
        raise AssertionError("preferCached overview miss should warm in the background")

    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)
    monkeypatch.setattr(main, "list_overview_review_records", fail_sync_rebuild)

    response = client.get("/api/league/overview-reviews?limit=20&offset=0&symbol=BTCUSDT&locale=ko&prefer_cached=true")

    assert response.status_code == 200
    assert response.json() == {"reviews": [], "nextOffset": 0, "hasMore": True, "warming": True}
    assert scheduled == [(20, 0, "BTCUSDT", None, "ko")]
    main.OVERVIEW_REVIEWS_REFRESHING.clear()


def test_trader_detail_schedules_missing_korean_translation_repair_without_blocking(temp_api_db, monkeypatch):
    main.TRADER_DETAIL_CACHE.clear()
    monkeypatch.setattr(main.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(main.settings, "ai_translation_enabled", True)
    monkeypatch.setattr(main.settings, "ai_translation_target_locales", ["ko"])
    calls: list[str] = []
    scheduled: list[tuple[str, tuple]] = []

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

    def fake_schedule_thread_refresh(func, *args):
        scheduled.append((func.__name__, args))

    monkeypatch.setattr("app.ai.translation_cache.translate_json_with_logging", fake_translate_json_with_logging)
    monkeypatch.setattr(main, "schedule_thread_refresh", fake_schedule_thread_refresh)

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
    assert calls == []
    assert scheduled == [("refresh_trader_detail_cache_background", ("imbalance-hunter", "BTCUSDT", "ko"))]
    assert review["translation"]["status"] == "missing"
