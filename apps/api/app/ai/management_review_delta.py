from typing import Any, Final

from app.traders.models import PositionManagementPayload


PRIMARY_LEVEL_KEYS: Final = (
    "channelMid",
    "rangeMid",
    "ema50",
    "ema50_4h",
    "ema20",
    "vwap",
    "sessionMid",
    "imbalanceMidpoint",
    "failureLine",
    "invalidationLine",
)

STRATEGY_METRIC_KEYS: Final = (
    "channelLower",
    "channelMid",
    "channelUpper",
    "rangeLower",
    "rangeMid",
    "rangeUpper",
    "ema20",
    "ema50",
    "ema50_4h",
    "vwap",
    "sessionMid",
    "imbalanceMidpoint",
    "failureLine",
    "invalidationLine",
    "fifteenMinuteClose",
    "volumeZscore",
    "fundingRate",
    "takerBuyRatio",
    "adx1h",
    "stallPrice",
)

PRICE_BOX_CHANGE_KEYS: Final = (
    "price",
    "unrealizedPnl",
    "progressR",
    "targetProgress",
    "distanceToStopR",
)


def current_management_review_delta(payload: PositionManagementPayload) -> dict[str, Any]:
    current_metrics = payload.event.metrics or {}
    current_price_box = price_box(
        current_metrics,
        exposure=payload.exposure.model_dump(),
        market_price=payload.marketSnapshot.get("price"),
    )
    previous_review = payload.recentManagementReviews[0] if payload.recentManagementReviews else {}
    previous_metrics = previous_event_metrics(previous_review)
    previous_price_box = (
        price_box(previous_metrics, exposure=previous_exposure(previous_review), market_price=None)
        if previous_metrics or previous_exposure(previous_review)
        else {}
    )
    changes = numeric_changes(current_price_box, previous_price_box, PRICE_BOX_CHANGE_KEYS)
    current_anchors = management_anchor_context(
        current_metrics,
        entry=current_price_box.get("entry"),
        stop=current_price_box.get("stop"),
    )
    previous_anchors = (
        management_anchor_context(
            previous_metrics,
            entry=previous_price_box.get("entry"),
            stop=previous_price_box.get("stop"),
        )
        if previous_price_box
        else {}
    )
    current_strategy = management_strategy_metrics(
        current_metrics,
        entry=current_price_box.get("entry"),
        stop=current_price_box.get("stop"),
    )
    previous_strategy = (
        management_strategy_metrics(
            previous_metrics,
            entry=previous_price_box.get("entry"),
            stop=previous_price_box.get("stop"),
        )
        if previous_price_box
        else {}
    )
    strategy_changes = numeric_changes(current_strategy, previous_strategy, tuple(current_strategy))
    has_previous = bool(previous_price_box)
    return {
        "currentDecisionFrame": {
            "phase": payload.event.phase,
            "eventType": payload.event.eventType,
            "suggestedAction": payload.event.suggestedAction,
            "eventReason": payload.event.reason,
        },
        "previousDecisionFrame": previous_decision_frame(previous_review) if has_previous else None,
        "priceBox": current_price_box,
        "previousPriceBox": previous_price_box,
        "changes": changes,
        "managementAnchors": current_anchors,
        "previousManagementAnchors": previous_anchors,
        "strategyTriggers": current_strategy,
        "previousStrategyTriggers": previous_strategy,
        "changedStrategyTriggers": strategy_changes,
        "reviewContinuity": review_continuity(has_previous, changes, strategy_changes),
        "writeThisReviewDifferently": (
            "Use the explicit previous/current changes as the new angle. If the frame is stable, say so briefly and keep the existing trigger instead of inventing novelty."
        ),
    }


def price_box(metrics: dict[str, Any], *, exposure: dict[str, Any], market_price: Any) -> dict[str, Any]:
    return {
        "side": exposure.get("side"),
        "price": first_value(metrics.get("price"), market_price),
        "entry": first_value(metrics.get("entryPrice"), exposure.get("entryPrice"), exposure.get("limitPrice")),
        "stop": first_value(metrics.get("stopLoss"), exposure.get("stopLoss")),
        "target": first_value(metrics.get("takeProfit"), exposure.get("takeProfit")),
        "unrealizedPnl": first_value(metrics.get("unrealizedPnl"), exposure.get("unrealizedPnl")),
        "progressR": metrics.get("progressR"),
        "targetProgress": metrics.get("targetProgress"),
        "distanceToStopR": metrics.get("distanceToStopR"),
    }


def management_anchor_context(metrics: dict[str, Any], *, entry: Any, stop: Any) -> dict[str, Any]:
    primary_name = "entry"
    primary_level = entry
    for key in PRIMARY_LEVEL_KEYS:
        value = metrics.get(key)
        if value is not None:
            primary_name = key
            primary_level = value
            break
    return {
        "primaryLevelName": primary_name,
        "primaryLevel": primary_level,
        "invalidationLine": first_value(metrics.get("failureLine"), metrics.get("invalidationLine"), stop),
        "entryOrLimit": entry,
        "mustNotRepeatRecentReview": True,
    }


def management_strategy_metrics(metrics: dict[str, Any], *, entry: Any, stop: Any) -> dict[str, Any]:
    strategy_metrics = {key: metrics[key] for key in STRATEGY_METRIC_KEYS if metrics.get(key) is not None}
    return {
        "failureLine": first_value(strategy_metrics.get("failureLine"), strategy_metrics.get("invalidationLine"), stop),
        "imbalanceMidpoint": first_value(strategy_metrics.get("imbalanceMidpoint"), entry),
        **strategy_metrics,
    }


def previous_event_metrics(review: dict[str, Any]) -> dict[str, Any]:
    direct = review.get("eventMetrics")
    if isinstance(direct, dict):
        return direct
    event = review.get("event")
    if isinstance(event, dict) and isinstance(event.get("metrics"), dict):
        return event["metrics"]
    return {}


def previous_exposure(review: dict[str, Any]) -> dict[str, Any]:
    exposure = review.get("exposure")
    return exposure if isinstance(exposure, dict) else {}


def previous_decision_frame(review: dict[str, Any]) -> dict[str, Any]:
    return {
        "phase": review.get("phase"),
        "eventType": review.get("eventType"),
        "decision": review.get("decision"),
        "actionType": review.get("actionType"),
        "createdAt": review.get("createdAt"),
    }


def numeric_changes(
    current: dict[str, Any],
    previous: dict[str, Any],
    keys: tuple[str, ...],
) -> dict[str, dict[str, float]]:
    changes: dict[str, dict[str, float]] = {}
    for key in keys:
        current_value = number(current.get(key))
        previous_value = number(previous.get(key))
        if current_value is None or previous_value is None:
            continue
        delta = current_value - previous_value
        change = {
            "previous": previous_value,
            "current": current_value,
            "delta": round(delta, 8),
        }
        if previous_value != 0:
            change["deltaPercent"] = round(delta / abs(previous_value) * 100, 8)
        changes[key] = change
    return changes


def review_continuity(
    has_previous: bool,
    changes: dict[str, dict[str, float]],
    strategy_changes: dict[str, dict[str, float]],
) -> str:
    if not has_previous:
        return "FIRST_REVIEW"
    price_change = abs((changes.get("price") or {}).get("deltaPercent", 0.0))
    progress_change = abs((changes.get("progressR") or {}).get("delta", 0.0))
    target_change = abs((changes.get("targetProgress") or {}).get("delta", 0.0))
    stop_change = abs((changes.get("distanceToStopR") or {}).get("delta", 0.0))
    strategy_moved = any(abs(change.get("delta", 0.0)) > 1e-9 for change in strategy_changes.values())
    if price_change >= 0.1 or progress_change >= 0.1 or target_change >= 0.05 or stop_change >= 0.1 or strategy_moved:
        return "MATERIAL_CHANGE"
    return "STABLE"


def first_value(*values: Any) -> Any:
    return next((value for value in values if value is not None), None)


def number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
