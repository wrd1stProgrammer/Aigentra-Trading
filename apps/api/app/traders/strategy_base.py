from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from app.traders.models import (
    CandidateRiskPlan,
    EntryPlan,
    LeveragePlan,
    OrderIntent,
    TakeProfitPlan,
    TraderProfile,
    TradeCandidate,
)
from app.paper.holding_policy import trader_execution_profile_payload


class TraderStrategy(ABC):
    profile: TraderProfile

    @abstractmethod
    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        raise NotImplementedError


def round_price(price: float) -> float:
    if price >= 1000:
        return round(price, 1)
    return round(price, 2)


def choose_side_by_trend(snapshot: Dict[str, Any]) -> str:
    trend = snapshot["timeframes"]["4h"].get("trend", "sideways")
    if trend == "bearish":
        return "SHORT"
    return "LONG"


def make_rejection(reason: str, score: int = 0) -> TradeCandidate:
    return TradeCandidate(created=False, reason=reason, setupScore=score)


def apply_execution_profile(profile: TraderProfile) -> TraderProfile:
    execution_profile = trader_execution_profile_payload(profile.id)
    return profile.model_copy(
        update={
            "holdingProfile": str(execution_profile["holdingProfile"]),
            "primaryTimeframe": str(execution_profile["primaryTimeframe"]),
            "expectedHoldMinutes": int(execution_profile["expectedHoldMinutes"]),
        }
    )


def candidate_with_audit(
    candidate: TradeCandidate,
    *,
    trader_id: str,
    gate_scores: Optional[dict[str, Any]] = None,
    reason_code: Optional[str] = None,
    observation_type: Optional[str] = None,
) -> TradeCandidate:
    execution_profile = trader_execution_profile_payload(trader_id)
    audit = {
        **(candidate.audit or {}),
        "reasonCode": reason_code or ("candidate_ready" if candidate.created else "no_trade"),
        "gateScores": gate_scores or {},
        "executionProfile": execution_profile,
    }
    return candidate.model_copy(
        update={
            "observationType": observation_type or ("CANDIDATE_READY" if candidate.created else "NO_TRADE"),
            "holdingProfile": str(execution_profile["holdingProfile"]),
            "timeHorizon": str(execution_profile["policyName"]),
            "audit": audit,
        }
    )


def timeframe(snapshot: Dict[str, Any], interval: str) -> Dict[str, Any]:
    return snapshot.get("timeframes", {}).get(interval, {})


def latest_candle(frame: Dict[str, Any]) -> Dict[str, Any]:
    return frame.get("latestCandle") or frame


def fvalue(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def candle_body_ratio(candle: Dict[str, Any]) -> float:
    high = fvalue(candle.get("high"))
    low = fvalue(candle.get("low"))
    if high <= low:
        return 0.0
    return abs(fvalue(candle.get("close")) - fvalue(candle.get("open"))) / (high - low)


def wick_ratios(candle: Dict[str, Any]) -> tuple[float, float]:
    high = fvalue(candle.get("high"))
    low = fvalue(candle.get("low"))
    if high <= low:
        return 0.0, 0.0
    upper = high - max(fvalue(candle.get("open")), fvalue(candle.get("close")))
    lower = min(fvalue(candle.get("open")), fvalue(candle.get("close"))) - low
    width = high - low
    return max(0.0, upper / width), max(0.0, lower / width)


def funding_rate(snapshot: Dict[str, Any]) -> float:
    return fvalue(snapshot.get("derivatives", {}).get("fundingRate"), 0.0)


def derivatives(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    return snapshot.get("derivatives", {})


def market_regime(snapshot: Dict[str, Any]) -> str:
    return str(snapshot.get("marketRegime", {}).get("primary") or "mixed")


def funding_abs_percentile(snapshot: Dict[str, Any]) -> float:
    stats = derivatives(snapshot).get("fundingStats") or {}
    return fvalue(stats.get("absPercentile"), 0.0)


def open_interest_change(snapshot: Dict[str, Any], key: str = "changePercent30m") -> float:
    stats = derivatives(snapshot).get("openInterestStats") or {}
    return fvalue(stats.get(key), 0.0)


def taker_buy_share(snapshot: Dict[str, Any]) -> float:
    flow = derivatives(snapshot).get("takerBuySell") or {}
    return fvalue(flow.get("buyShare"), 0.5)


def taker_buy_sell_ratio(snapshot: Dict[str, Any]) -> float:
    flow = derivatives(snapshot).get("takerBuySell") or {}
    return fvalue(flow.get("buySellRatio"), 1.0)


def crowded_side(snapshot: Dict[str, Any]) -> Optional[str]:
    crowding = derivatives(snapshot).get("crowding") or {}
    side = crowding.get("crowdedSide")
    return str(side) if side in {"LONG", "SHORT"} else None


def trend_for(snapshot: Dict[str, Any], interval: str, default: str = "sideways") -> str:
    return str(timeframe(snapshot, interval).get("trend") or default)


def normalize_entries_for_side(side: str, current_price: float, entries: list[EntryPlan]) -> list[EntryPlan]:
    """Keep pending entry prices on the sensible side of the current price.

    In this demo, entries represent pending paper-trading levels, not live market
    fills. Long entries should not sit above the current price, and short entries
    should not sit below it.
    """
    normalized: list[EntryPlan] = []
    for entry in entries:
        price = entry.price
        if side == "SHORT" and price < current_price:
            price = current_price
        if side == "LONG" and price > current_price:
            price = current_price
        normalized.append(
            EntryPlan(
                price=round_price(price),
                weight=entry.weight,
                reason=entry.reason,
            )
        )
    return normalized


def weighted_average_entry(entries: list[EntryPlan]) -> float:
    total_weight = sum(max(entry.weight, 0.0) for entry in entries)
    if total_weight <= 0:
        return entries[0].price if entries else 0.0
    return sum(entry.price * max(entry.weight, 0.0) for entry in entries) / total_weight


def weighted_average_take_profit(take_profits: list[TakeProfitPlan]) -> float:
    total_weight = sum(max(tp.weight, 0.0) for tp in take_profits)
    if total_weight <= 0:
        return take_profits[0].price if take_profits else 0.0
    return sum(tp.price * max(tp.weight, 0.0) for tp in take_profits) / total_weight


def estimate_risk_reward(
    side: str,
    entries: list[EntryPlan],
    stop_loss: float,
    take_profits: list[TakeProfitPlan],
    fee_buffer_percent: float = 0.08,
) -> float:
    if not entries or not take_profits:
        return 0.0
    average_entry = weighted_average_entry(entries)
    average_target = weighted_average_take_profit(take_profits)
    fee_buffer = average_entry * (fee_buffer_percent / 100)
    if side == "LONG":
        risk = average_entry - stop_loss + fee_buffer
        reward = average_target - average_entry
    else:
        risk = stop_loss - average_entry + fee_buffer
        reward = average_entry - average_target
    if risk <= 0:
        return 0.0
    return round(max(reward, 0.0) / risk, 2)


def candidate_geometry_errors(
    side: str,
    current_price: float,
    entries: list[EntryPlan],
    stop_loss: float,
    take_profits: list[TakeProfitPlan],
    min_risk_reward: float = 1.3,
    fee_buffer_percent: float = 0.08,
) -> list[str]:
    errors: list[str] = []
    if side not in {"LONG", "SHORT"}:
        return ["Side must be LONG or SHORT."]
    if not entries:
        errors.append("At least one entry is required.")
    if not take_profits:
        errors.append("At least one take-profit is required.")
    if side == "LONG":
        if any(entry.price > current_price for entry in entries):
            errors.append("LONG entries must be at or below current price.")
        if entries and stop_loss >= min(entry.price for entry in entries):
            errors.append("LONG stop loss must be below every entry.")
        if entries and any(tp.price <= weighted_average_entry(entries) for tp in take_profits):
            errors.append("LONG take-profits must be above average entry.")
    if side == "SHORT":
        if any(entry.price < current_price for entry in entries):
            errors.append("SHORT entries must be at or above current price.")
        if entries and stop_loss <= max(entry.price for entry in entries):
            errors.append("SHORT stop loss must be above every entry.")
        if entries and any(tp.price >= weighted_average_entry(entries) for tp in take_profits):
            errors.append("SHORT take-profits must be below average entry.")
    risk_reward = estimate_risk_reward(
        side,
        entries,
        stop_loss,
        take_profits,
        fee_buffer_percent=fee_buffer_percent,
    )
    if risk_reward < min_risk_reward:
        errors.append(f"Estimated RR {risk_reward:.2f} is below minimum {min_risk_reward:.2f}.")
    return errors


def trend_conflicts_with_side(snapshot: Dict[str, Any], side: str) -> bool:
    trend = snapshot["timeframes"].get("4h", {}).get("trend", "unknown")
    if side == "LONG":
        return trend == "bearish"
    if side == "SHORT":
        return trend == "bullish"
    return True


def default_order_intent(execution: str = "PENDING_ENTRY", post_only: bool = True) -> OrderIntent:
    return OrderIntent(
        orderType="LIMIT",
        timeInForce="GTC",
        postOnly=post_only,
        reduceOnly=False,
        execution=execution,
        chaseLimitPercent=0.0,
    )


def default_leverage_plan(
    suggested: int,
    maximum: int,
    reason: str,
    margin_mode: str = "ISOLATED",
) -> LeveragePlan:
    safe_suggested = max(1, min(int(suggested), int(maximum)))
    return LeveragePlan(
        suggestedLeverage=safe_suggested,
        maxLeverage=max(1, int(maximum)),
        marginMode=margin_mode,
        reason=reason,
    )


def default_risk_plan(
    risk_percent: float,
    risk_reward: float,
    sizing_note: str,
    min_risk_reward: float = 1.3,
    fee_buffer_percent: float = 0.08,
) -> CandidateRiskPlan:
    return CandidateRiskPlan(
        minRiskReward=min_risk_reward,
        estimatedRiskReward=risk_reward,
        feeBufferPercent=fee_buffer_percent,
        maxLossPercent=risk_percent,
        sizingNote=sizing_note,
    )
