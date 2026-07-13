import json
from decimal import Decimal

import pytest

from app.db import PaperPositionRecord
from app.paper.engine import _first_take_profit_breakeven_trigger
from app.paper.management import position_management_events


def _long_position(
    trader_id: str,
    *,
    payload: dict[str, object] | None = None,
) -> PaperPositionRecord:
    return PaperPositionRecord(
        trader_id=trader_id,
        symbol="BTCUSDT",
        status="open",
        side="long",
        quantity=Decimal("1"),
        entry_price=Decimal("100"),
        leverage=Decimal("2"),
        notional=Decimal("100"),
        margin=Decimal("50"),
        unrealized_pnl=Decimal("6"),
        take_profit_price=Decimal("120"),
        stop_loss_price=Decimal("90"),
        payload_json=json.dumps(payload or {}),
    )


def _snapshot(
    *,
    price: float = 106.0,
    live_15m_close: float = 106.0,
    completed_15m_close: float = 106.0,
    completed_4h_close: float = 106.0,
) -> dict[str, object]:
    return {
        "price": price,
        "timeframes": {
            "15m": {
                "latestCandle": {
                    "close": live_15m_close,
                    "volume": 100.0,
                    "takerBuyBaseVolume": 50.0,
                },
                "completedCandle": {
                    "close": completed_15m_close,
                    "volume": 100.0,
                    "takerBuyBaseVolume": 50.0,
                },
                "volumeZscore": 0.0,
                "completedVolumeZscore": 0.0,
            },
            "1h": {
                "channel": {"lower": 95.0, "mid": 105.0, "upper": 115.0},
                "ema50": 100.0,
                "trend": "bullish",
                "completedCandle": {"close": completed_15m_close},
            },
            "4h": {
                "ema50": 100.0,
                "trend": "bullish",
                "completedCandle": {"close": completed_4h_close},
            },
        },
        "derivatives": {
            "fundingRate": 0.0,
            "openInterestStats": {"changePercent30m": 0.0},
        },
    }


@pytest.mark.parametrize(
    ("trader_id", "expected_trigger"),
    [
        ("channel-rider", Decimal("116.0")),
        ("donchian-breakout", Decimal("115.0")),
        ("trend-sentinel", Decimal("118.0")),
        ("atr-trail-commander", Decimal("118.0")),
        ("liquidity-reaper", Decimal("112.0")),
    ],
)
def test_first_take_profit_breakeven_trigger_is_policy_specific(
    trader_id: str,
    expected_trigger: Decimal,
) -> None:
    position = _long_position(trader_id)

    assert _first_take_profit_breakeven_trigger(position) == expected_trigger


@pytest.mark.parametrize(
    ("trader_id", "payload", "snapshot", "expected_event"),
    [
        (
            "channel-rider",
            {},
            _snapshot(completed_15m_close=94.0),
            "channel_thesis_failed",
        ),
        (
            "donchian-breakout",
            {
                "donchianContext": {
                    "upperBoundary": 105.0,
                    "lowerBoundary": 95.0,
                    "participationCount": 0,
                }
            },
            _snapshot(completed_15m_close=104.0),
            "donchian_breakout_failed",
        ),
        (
            "trend-sentinel",
            {},
            _snapshot(completed_4h_close=99.0),
            "htf_trend_break_exit",
        ),
        (
            "atr-trail-commander",
            {},
            _snapshot(completed_4h_close=99.0),
            "atr_trend_break_exit",
        ),
        (
            "liquidity-reaper",
            {},
            _snapshot(completed_15m_close=89.0),
            "sweep_failure_exit",
        ),
    ],
)
def test_structural_invalidation_uses_completed_candle(
    trader_id: str,
    payload: dict[str, object],
    snapshot: dict[str, object],
    expected_event: str,
) -> None:
    events = position_management_events(
        trader_id,
        _long_position(trader_id, payload=payload),
        snapshot,
    )

    assert events[0].eventType == expected_event
    assert events[0].suggestedAction == "CLOSE_POSITION"
    assert events[0].metrics["hardInvalidation"] is True


@pytest.mark.parametrize(
    ("trader_id", "payload", "snapshot"),
    [
        ("channel-rider", {}, _snapshot(live_15m_close=94.0)),
        (
            "donchian-breakout",
            {
                "donchianContext": {
                    "upperBoundary": 105.0,
                    "lowerBoundary": 95.0,
                    "participationCount": 0,
                }
            },
            _snapshot(live_15m_close=104.0),
        ),
        ("trend-sentinel", {}, _snapshot(price=99.0)),
        ("atr-trail-commander", {}, _snapshot(price=99.0)),
        ("liquidity-reaper", {}, _snapshot(live_15m_close=89.0)),
    ],
)
def test_unfinished_price_does_not_fire_structural_invalidation(
    trader_id: str,
    payload: dict[str, object],
    snapshot: dict[str, object],
) -> None:
    events = position_management_events(
        trader_id,
        _long_position(trader_id, payload=payload),
        snapshot,
    )

    assert all(event.suggestedAction != "CLOSE_POSITION" for event in events)
