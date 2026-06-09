import time

from fastapi.testclient import TestClient

import app.main as main
from app.main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


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


def test_leaderboard_fast_rebuilds_expired_cache(monkeypatch):
    cache_key = ("BTCUSDT", True, True)
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

    def fake_payload(db, clean_symbol, *, include_empty=True, include_related=False, refreshed=False, scheduled_refresh=False, missing_ids=None):
        return {
            "symbol": clean_symbol,
            "lastUpdatedAt": "fresh-cache",
            "traders": [],
            "summaries": [],
            "positions": [],
            "orders": [],
            "managementReviews": [],
            "cacheHit": False,
            "stale": False,
            "scheduledRefresh": scheduled_refresh,
            "refreshed": refreshed,
            "missingSnapshotCount": len(missing_ids or set()),
        }

    monkeypatch.setattr(main, "list_traders", lambda: [])
    monkeypatch.setattr(main, "build_league_bundle_payload", fake_payload)

    response = client.get("/api/league/leaderboard-fast?symbol=BTCUSDT&includeRelated=true")

    assert response.status_code == 200
    data = response.json()
    assert data["lastUpdatedAt"] == "fresh-cache"
    assert data["cacheHit"] is False
    assert data["stale"] is False


def test_trader_detail_rebuilds_expired_cache(monkeypatch):
    cache_key = ("channel-rider", "BTCUSDT", 20, 10)
    main.TRADER_DETAIL_CACHE.clear()
    main.TRADER_DETAIL_CACHE[cache_key] = (
        0,
        {
            "symbol": "BTCUSDT",
            "trader": {"id": "channel-rider", "name": "Channel Rider"},
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
    cache_key = ("channel-rider", "BTCUSDT", 20, 10)
    main.TRADER_DETAIL_CACHE.clear()
    main.TRADER_DETAIL_CACHE[cache_key] = (
        time.monotonic() + 300,
        {
            "symbol": "BTCUSDT",
            "trader": {"id": "channel-rider", "name": "Channel Rider"},
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
