from math import isfinite
from typing import Any, Dict, Optional


def _positive_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) and number > 0 else None


def _finite_number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if isfinite(number) else default


def _finite_number_or_none(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) else None


def _valid_timestamp(row: Dict[str, Any]) -> bool:
    return _positive_number(row.get("timestamp", row.get("time"))) is not None


def _valid_open_interest_rows(rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    return [
        row
        for row in rows
        if _valid_timestamp(row) and _positive_number(row.get("sumOpenInterest")) is not None
    ]


def _valid_taker_rows(rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    valid: list[Dict[str, Any]] = []
    for row in rows:
        ratio = _positive_number(row.get("buySellRatio"))
        buy = _positive_number(row.get("buyVol"))
        sell = _positive_number(row.get("sellVol"))
        expected_ratio = buy / sell if buy is not None and sell is not None else None
        ratio_consistent = (
            ratio is not None
            and expected_ratio is not None
            and abs(ratio - expected_ratio) <= max(0.05, expected_ratio * 0.10)
        )
        if _valid_timestamp(row) and ratio_consistent:
            valid.append(row)
    return valid


def latest_number(rows: list[Dict[str, Any]], field: str, default: float = 0.0) -> float:
    if not rows:
        return default
    try:
        return _finite_number(rows[-1].get(field, default), default)
    except (TypeError, ValueError):
        return default


def change_percent(rows: list[Dict[str, Any]], field: str, periods: int) -> Optional[float]:
    if len(rows) <= periods:
        return None
    previous = latest_number(rows[-periods - 1 : -periods], field)
    current = latest_number(rows, field)
    if previous <= 0:
        return None
    return (current - previous) / previous * 100


def percentile_rank(values: list[float], current: float) -> Optional[float]:
    if not values:
        return None
    lower_or_equal = sum(1 for value in values if value <= current)
    return lower_or_equal / len(values) * 100


def ratio_stats(rows: list[Dict[str, Any]]) -> Dict[str, Any]:
    ratio = latest_number(rows, "longShortRatio", 1.0)
    long_account = latest_number(rows, "longAccount")
    short_account = latest_number(rows, "shortAccount")
    return {
        "longAccount": long_account,
        "shortAccount": short_account,
        "longShortRatio": ratio,
        "longSkew": ratio - 1.0,
    }


def derivative_context(
    *,
    open_interest: Dict[str, Any],
    premium_index: Dict[str, Any],
    open_interest_history: list[Dict[str, Any]],
    funding_history: list[Dict[str, Any]],
    global_long_short: list[Dict[str, Any]],
    top_account_ratio: list[Dict[str, Any]],
    top_position_ratio: list[Dict[str, Any]],
    taker_buy_sell: list[Dict[str, Any]],
) -> Dict[str, Any]:
    valid_oi_history = _valid_open_interest_rows(open_interest_history)
    valid_taker_history = _valid_taker_rows(taker_buy_sell)
    raw_funding_rate = premium_index.get("lastFundingRate")
    parsed_funding_rate = _finite_number_or_none(raw_funding_rate)
    funding_rate = parsed_funding_rate if parsed_funding_rate is not None else 0.0
    funding_values = [
        abs(value)
        for row in funding_history
        if (value := _finite_number_or_none(row.get("fundingRate"))) is not None
    ]
    funding_abs_percentile = percentile_rank(funding_values, abs(funding_rate))
    funding_available = (
        _positive_number(premium_index.get("markPrice")) is not None
        and _positive_number(premium_index.get("indexPrice")) is not None
        and _positive_number(premium_index.get("nextFundingTime")) is not None
        and parsed_funding_rate is not None
    )
    taker_ratio = latest_number(valid_taker_history, "buySellRatio", 1.0)
    taker_buy_volume = latest_number(valid_taker_history, "buyVol")
    taker_sell_volume = latest_number(valid_taker_history, "sellVol")
    current_open_interest_available = (
        _positive_number(open_interest.get("openInterest")) is not None
        and _valid_timestamp(open_interest)
    )
    current_open_interest = _positive_number(open_interest.get("openInterest"))
    current_open_interest_time = _positive_number(open_interest.get("timestamp", open_interest.get("time")))
    mark_price = _positive_number(premium_index.get("markPrice")) or 0.0
    index_price = _positive_number(premium_index.get("indexPrice")) or 0.0
    next_funding_time = _positive_number(premium_index.get("nextFundingTime")) or 0.0
    open_interest_available = current_open_interest_available or bool(valid_oi_history)
    taker_flow_available = bool(valid_taker_history)
    oi_5m = change_percent(valid_oi_history, "sumOpenInterest", 1)
    oi_30m = change_percent(valid_oi_history, "sumOpenInterest", 6)
    global_ratio = ratio_stats(global_long_short)
    top_account = ratio_stats(top_account_ratio)
    top_position = ratio_stats(top_position_ratio)
    long_crowded = (
        taker_flow_available
        and open_interest_available
        and funding_rate > 0
        and (global_ratio["longShortRatio"] >= 1.08 or top_position["longShortRatio"] >= 1.12)
        and taker_ratio >= 1.05
    )
    short_crowded = (
        taker_flow_available
        and open_interest_available
        and funding_rate < 0
        and (global_ratio["longShortRatio"] <= 0.92 or top_position["longShortRatio"] <= 0.88)
        and taker_ratio <= 0.95
    )
    return {
        "openInterest": current_open_interest or latest_number(valid_oi_history, "sumOpenInterest"),
        "openInterestTime": current_open_interest_time or 0.0,
        "openInterestStats": {
            "available": open_interest_available,
            "historyAvailable": bool(valid_oi_history),
            "changeAvailable5m": oi_5m is not None,
            "changeAvailable30m": oi_30m is not None,
            "sumOpenInterest": latest_number(valid_oi_history, "sumOpenInterest", current_open_interest or 0.0),
            "sumOpenInterestValue": latest_number(valid_oi_history, "sumOpenInterestValue"),
            "changePercent5m": oi_5m,
            "changePercent30m": oi_30m,
        },
        "markPrice": mark_price,
        "indexPrice": index_price,
        "premiumPercent": (
            (mark_price - index_price) / index_price * 100
            if index_price
            else 0.0
        ),
        "fundingRate": funding_rate,
        "nextFundingTime": next_funding_time,
        "fundingStats": {
            "available": funding_available,
            "historyAvailable": bool(funding_history),
            "absPercentile": funding_abs_percentile,
            "latest": funding_rate,
            "averageAbs": sum(funding_values) / len(funding_values) if funding_values else None,
        },
        "longShortRatios": {
            "globalAccount": global_ratio,
            "topAccount": top_account,
            "topPosition": top_position,
        },
        "takerBuySell": {
            "available": taker_flow_available,
            "buySellRatio": taker_ratio,
            "buyVol": taker_buy_volume,
            "sellVol": taker_sell_volume,
            "buyShare": taker_ratio / (1 + taker_ratio) if taker_flow_available else None,
        },
        "crowding": {
            "longCrowded": long_crowded,
            "shortCrowded": short_crowded,
            "crowdedSide": "LONG" if long_crowded else "SHORT" if short_crowded else None,
            "oiChangePercent30m": oi_30m,
            "fundingAbsPercentile": funding_abs_percentile,
        },
    }


def classify_market_regime(timeframes: Dict[str, Any], derivatives: Dict[str, Any]) -> Dict[str, Any]:
    one_hour = timeframes.get("1h", {})
    four_hour = timeframes.get("4h", {})
    fifteen = timeframes.get("15m", {})
    adx_1h = one_hour.get("adx14") or 0.0
    adx_4h = four_hour.get("adx14") or 0.0
    volume_z = fifteen.get("volumeZscore") or 0.0
    bb_width = (one_hour.get("bollinger") or {}).get("widthPercent") or 0.0
    kc_width = (one_hour.get("keltner") or {}).get("widthPercent") or bb_width
    price_change_1h = abs((one_hour.get("priceChange") or {}).get("1") or 0.0)
    funding_percentile = (derivatives.get("fundingStats") or {}).get("absPercentile") or 0.0
    if price_change_1h >= 0.007 or volume_z >= 2.2:
        regime = "shock"
    elif bb_width and kc_width and bb_width <= kc_width and adx_1h < 22:
        regime = "squeeze"
    elif adx_4h >= 22 or adx_1h >= 25:
        regime = "trend"
    elif adx_4h <= 18 and abs(funding_percentile) < 70:
        regime = "range"
    else:
        regime = "mixed"
    return {
        "primary": regime,
        "adx1h": adx_1h,
        "adx4h": adx_4h,
        "volumeZscore15m": volume_z,
        "priceChange1h": price_change_1h,
        "bollingerWidth1h": bb_width,
        "keltnerWidth1h": kc_width,
    }
