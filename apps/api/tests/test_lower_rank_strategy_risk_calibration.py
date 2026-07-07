import pytest

from app.traders.registry import get_strategy
from tests.test_trader_cycle import neutral_internal_derivatives, sample_snapshot, session_orb_breakout_snapshot


def _base_snapshot() -> dict:
    return neutral_internal_derivatives(sample_snapshot())


def _latest_candle(open_: float, high: float, low: float, close: float, volume: float = 1800.0) -> dict:
    return {"open": open_, "high": high, "low": low, "close": close, "volume": volume, "takerBuyBaseVolume": 0.0}


def pullback_late_confirmation_snapshot() -> dict:
    snapshot = _base_snapshot()
    price = 67820.0
    snapshot["price"] = price
    snapshot["timeframes"]["1h"].update(
        {"close": price, "ema20": 67900.0, "ema50": 67250.0, "rsi14": 67.0, "trend": "bullish"}
    )
    snapshot["timeframes"]["4h"].update(
        {"close": price, "ema20": 67400.0, "ema50": 66000.0, "trend": "bullish"}
    )
    snapshot["derivatives"]["openInterestStats"]["changePercent30m"] = 1.9
    snapshot["marketRegime"].update({"primary": "trend", "priceChange1h": 0.001})
    return snapshot


def channel_upper_edge_without_reaction_snapshot() -> dict:
    snapshot = _base_snapshot()
    price = 69000.0
    snapshot["price"] = price
    snapshot["timeframes"]["15m"].update(
        {
            "open": 68950.0,
            "close": price,
            "volumeZscore": 1.25,
            "latestCandle": _latest_candle(68950.0, 69100.0, 68800.0, price),
        }
    )
    snapshot["timeframes"]["1h"].update(
        {
            "channel": {"slope": -20.0, "lower": 67000.0, "mid": 68000.0, "upper": 69200.0, "position": 0.82},
            "rsi14": 62.0,
            "trend": "bearish",
            "ema20": 68800.0,
            "ema50": 69500.0,
        }
    )
    snapshot["timeframes"]["4h"].update({"trend": "bearish", "ema20": 68200.0, "ema50": 69000.0})
    snapshot["marketRegime"].update({"primary": "trend", "priceChange1h": 0.003})
    return snapshot


def positive_funding_stall_with_squeeze_pressure_snapshot() -> dict:
    snapshot = _base_snapshot()
    price = 68000.0
    snapshot["price"] = price
    snapshot["timeframes"]["15m"].update(
        {
            "open": 68100.0,
            "close": price,
            "latestCandle": _latest_candle(68100.0, 68200.0, 67950.0, price, 1600.0),
        }
    )
    snapshot["timeframes"]["1h"].update(
        {
            "priceChange": {"1": 0.0024},
            "atr14": 780.0,
            "high": 68400.0,
            "low": 67400.0,
            "swings": {"highs": [67800.0, 68150.0, 68400.0], "lows": [67000.0, 67200.0, 67400.0]},
        }
    )
    snapshot["derivatives"].update(
        {"fundingRate": 0.00009, "markPrice": 68040.0, "indexPrice": 68000.0, "openInterest": 123456.7}
    )
    snapshot["derivatives"]["fundingStats"].update({"absPercentile": 93.0, "latest": 0.00009})
    snapshot["derivatives"]["openInterestStats"]["changePercent30m"] = 1.4
    snapshot["derivatives"]["crowding"].update({"crowdedSide": "LONG", "longCrowded": True, "shortCrowded": False})
    snapshot["derivatives"]["takerBuySell"].update({"buySellRatio": 1.35, "buyShare": 1.35 / 2.35})
    return snapshot


def range_upper_edge_breakout_pressure_snapshot() -> dict:
    snapshot = _base_snapshot()
    price = 69100.0
    snapshot["price"] = price
    snapshot["timeframes"]["15m"].update(
        {
            "open": 69030.0,
            "close": price,
            "volumeZscore": 1.2,
            "latestCandle": _latest_candle(69030.0, 69200.0, 68980.0, price, 1600.0),
        }
    )
    snapshot["timeframes"]["1h"].update({"atr14": 520.0})
    snapshot["timeframes"]["4h"].update(
        {
            "trend": "sideways",
            "adx14": 19.5,
            "channel": {"lower": 66800.0, "mid": 68000.0, "upper": 69200.0, "position": 0.96},
        }
    )
    snapshot["marketRegime"].update({"primary": "range", "adx1h": 18.0, "adx4h": 19.5})
    return snapshot


def atr_continuation_after_extended_move_snapshot() -> dict:
    snapshot = _base_snapshot()
    price = 68300.0
    snapshot["price"] = price
    snapshot["timeframes"]["1h"].update(
        {"close": price, "ema20": 68000.0, "ema50": 67500.0, "atr14": 900.0, "trend": "bullish"}
    )
    snapshot["timeframes"]["4h"].update(
        {"close": price, "ema20": 67400.0, "ema50": 66200.0, "atr14": 1800.0, "trend": "bullish"}
    )
    snapshot["marketRegime"].update({"primary": "trend", "priceChange1h": 0.008, "adx1h": 29.0})
    return snapshot


def session_raider_breakout_snapshot() -> dict:
    snapshot = session_orb_breakout_snapshot()
    snapshot["timeframes"]["15m"]["latestCandle"]["openTime"] = 1767272400000
    return snapshot


@pytest.mark.parametrize(
    ("trader_id", "snapshot_factory", "setup_type", "max_risk", "max_score"),
    [
        ("channel-rider", channel_upper_edge_without_reaction_snapshot, "CHANNEL_UPPER_BAND_REJECTION", 0.55, 80),
        ("session-raider", session_raider_breakout_snapshot, "SESSION_RANGE_BREAK_LONG", 0.4, 70),
        ("atr-trail-commander", atr_continuation_after_extended_move_snapshot, "ATR_TREND_TRAIL_LONG", 0.42, 72),
    ],
)
def test_lower_rank_traders_keep_concept_entries_but_reduce_marginal_risk(
    trader_id: str,
    snapshot_factory,
    setup_type: str,
    max_risk: float,
    max_score: int,
) -> None:
    candidate = get_strategy(trader_id).evaluate(snapshot_factory())

    assert candidate.created is True
    assert candidate.setupType == setup_type
    assert candidate.riskPercent is not None
    assert candidate.riskPercent <= max_risk
    assert candidate.setupScore <= max_score
    assert candidate.entries


def test_pullback_architect_keeps_trade_but_makes_late_pullback_a_probe_first() -> None:
    candidate = get_strategy("pullback-architect").evaluate(pullback_late_confirmation_snapshot())

    assert candidate.created is True
    assert candidate.setupType == "THREE_STAGE_PULLBACK_LONG"
    assert candidate.riskPercent is not None
    assert candidate.riskPercent <= 0.55
    assert candidate.setupScore <= 70
    assert candidate.entries[0].weight <= 0.35
    assert len(candidate.entries) >= 2


def test_funding_contrarian_keeps_positive_funding_short_but_splits_squeeze_risk() -> None:
    candidate = get_strategy("funding-contrarian").evaluate(positive_funding_stall_with_squeeze_pressure_snapshot())

    assert candidate.created is True
    assert candidate.setupType == "POSITIVE_FUNDING_STALL_SHORT"
    assert candidate.riskPercent is not None
    assert candidate.riskPercent <= 0.32
    assert candidate.entries[0].weight <= 0.5
    assert candidate.setupScore <= 76


def test_range_maker_keeps_edge_fade_but_requires_smaller_probe_near_breakout_acceptance() -> None:
    candidate = get_strategy("range-maker").evaluate(range_upper_edge_breakout_pressure_snapshot())

    assert candidate.created is True
    assert candidate.setupType == "HIGH_RANGE_REVERSION_SHORT"
    assert candidate.riskPercent is not None
    assert candidate.riskPercent <= 0.32
    assert candidate.entries[0].weight <= 0.55
    assert candidate.setupScore <= 70


def test_channel_rider_reduces_all_valid_edges_without_reaction_confirmation() -> None:
    snapshot = channel_upper_edge_without_reaction_snapshot()
    snapshot["timeframes"]["1h"]["channel"]["position"] = 0.70

    candidate = get_strategy("channel-rider").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.setupType == "CHANNEL_UPPER_BAND_REJECTION"
    assert candidate.riskPercent is not None
    assert candidate.riskPercent <= 0.55
    assert candidate.setupScore <= 80
    assert candidate.entries[0].weight <= 0.35


def test_range_maker_breakout_pressure_stays_lower_confidence_even_in_clean_range() -> None:
    snapshot = range_upper_edge_breakout_pressure_snapshot()
    snapshot["timeframes"]["4h"]["adx14"] = 16.0
    snapshot["marketRegime"]["adx4h"] = 16.0

    candidate = get_strategy("range-maker").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.setupType == "HIGH_RANGE_REVERSION_SHORT"
    assert candidate.setupScore <= 70
    assert candidate.leveragePlan is not None
    assert candidate.leveragePlan.suggestedLeverage <= 5
