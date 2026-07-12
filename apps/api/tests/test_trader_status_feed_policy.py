from app.trader_status_feed.policy import material_status_snapshot, status_feed_interval_seconds


def test_feed_refresh_interval_is_holding_horizon_aware():
    assert status_feed_interval_seconds("SCALP") == 1_800
    assert status_feed_interval_seconds("INTRADAY") == 3_600
    assert status_feed_interval_seconds("SWING") == 10_800
    assert status_feed_interval_seconds("POSITION") == 21_600


def test_material_snapshot_ignores_storage_timestamps_but_tracks_trade_changes():
    before = {
        "position": {
            "id": 41,
            "status": "open",
            "side": "long",
            "quantity": 0.15,
            "entry_price": 64_000,
            "stop_loss_price": 63_200,
            "take_profit_price": 66_000,
            "unrealized_pnl": 120,
            "updated_at": "2026-07-12T08:00:00Z",
        }
    }
    timestamp_only = {
        "position": {
            **before["position"],
            "updated_at": "2026-07-12T09:00:00Z",
        }
    }
    changed = {
        "position": {
            **timestamp_only["position"],
            "quantity": 0.10,
            "stop_loss_price": 63_700,
        }
    }

    assert material_status_snapshot(timestamp_only) == material_status_snapshot(before)
    assert material_status_snapshot(changed) != material_status_snapshot(before)
