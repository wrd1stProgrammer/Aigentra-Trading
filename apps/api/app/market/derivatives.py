from typing import Any, Dict, Optional


def latest_number(rows: list[Dict[str, Any]], field: str, default: float = 0.0) -> float:
    if not rows:
        return default
    try:
        return float(rows[-1].get(field, default))
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
    funding_rate = float(premium_index["lastFundingRate"])
    funding_values = [abs(float(row.get("fundingRate", 0.0))) for row in funding_history]
    funding_abs_percentile = percentile_rank(funding_values, abs(funding_rate))
    taker_ratio = latest_number(taker_buy_sell, "buySellRatio", 1.0)
    taker_buy_volume = latest_number(taker_buy_sell, "buyVol")
    taker_sell_volume = latest_number(taker_buy_sell, "sellVol")
    oi_5m = change_percent(open_interest_history, "sumOpenInterest", 1)
    oi_30m = change_percent(open_interest_history, "sumOpenInterest", 6)
    global_ratio = ratio_stats(global_long_short)
    top_account = ratio_stats(top_account_ratio)
    top_position = ratio_stats(top_position_ratio)
    long_crowded = (
        funding_rate > 0
        and (global_ratio["longShortRatio"] >= 1.08 or top_position["longShortRatio"] >= 1.12)
        and taker_ratio >= 1.05
    )
    short_crowded = (
        funding_rate < 0
        and (global_ratio["longShortRatio"] <= 0.92 or top_position["longShortRatio"] <= 0.88)
        and taker_ratio <= 0.95
    )
    return {
        "openInterest": open_interest["openInterest"],
        "openInterestTime": open_interest["time"],
        "openInterestStats": {
            "historyAvailable": bool(open_interest_history),
            "sumOpenInterest": latest_number(open_interest_history, "sumOpenInterest", open_interest["openInterest"]),
            "sumOpenInterestValue": latest_number(open_interest_history, "sumOpenInterestValue"),
            "changePercent5m": oi_5m,
            "changePercent30m": oi_30m,
        },
        "markPrice": premium_index["markPrice"],
        "indexPrice": premium_index["indexPrice"],
        "premiumPercent": (
            (premium_index["markPrice"] - premium_index["indexPrice"]) / premium_index["indexPrice"] * 100
            if premium_index["indexPrice"]
            else 0.0
        ),
        "fundingRate": funding_rate,
        "nextFundingTime": premium_index["nextFundingTime"],
        "fundingStats": {
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
            "buySellRatio": taker_ratio,
            "buyVol": taker_buy_volume,
            "sellVol": taker_sell_volume,
            "buyShare": taker_ratio / (1 + taker_ratio) if taker_ratio > 0 else None,
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
