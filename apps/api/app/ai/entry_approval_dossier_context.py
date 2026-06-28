from typing import Any, Final

from app.ai.entry_approval_dossier_common import compact_mapping, compact_text, model_dump, price_plan
from app.traders.models import TradeReviewPayload

TIMEFRAME_KEYS: Final[tuple[str, ...]] = (
    "open",
    "high",
    "low",
    "close",
    "ema20",
    "ema50",
    "rsi14",
    "atr14",
    "volumeZscore",
    "trend",
)
DERIVATIVE_KEYS: Final[tuple[str, ...]] = ("openInterest", "fundingRate", "markPrice", "indexPrice")


def trader_summary(payload: TradeReviewPayload) -> dict[str, Any]:
    trader = payload.trader
    return {
        "id": trader.id,
        "name": trader.name,
        "concept": trader.concept,
        "riskLevel": trader.riskLevel,
        "baseRiskPercent": trader.baseRiskPercent,
        "holdingProfile": trader.holdingProfile,
        "primaryTimeframe": trader.primaryTimeframe,
        "expectedHoldMinutes": trader.expectedHoldMinutes,
        "reviewChecklist": trader.aiReviewChecklist[:4],
    }


def candidate_summary(payload: TradeReviewPayload) -> dict[str, Any]:
    candidate = payload.candidate
    return {
        "created": candidate.created,
        "reason": candidate.reason,
        "side": candidate.side,
        "setupType": candidate.setupType,
        "setupScore": candidate.setupScore,
        "observationType": candidate.observationType,
        "holdingProfile": candidate.holdingProfile,
        "timeHorizon": candidate.timeHorizon,
        "entries": [price_plan(entry) for entry in candidate.entries[:3]],
        "stopLoss": candidate.stopLoss,
        "takeProfits": [price_plan(target) for target in candidate.takeProfits[:3]],
        "riskPercent": candidate.riskPercent,
        "riskPlan": model_dump(candidate.riskPlan),
        "leveragePlan": model_dump(candidate.leveragePlan),
        "orderIntent": model_dump(candidate.orderIntent),
        "earlyExitRules": candidate.earlyExitRules[:3],
        "invalidation": candidate.invalidation,
        "notes": candidate.notes[:3],
        "managementNotes": candidate.managementNotes[:2],
        "auditSignals": audit_signals(candidate.audit),
    }


def market_summary(payload: TradeReviewPayload) -> dict[str, Any]:
    snapshot = payload.marketSnapshot
    return {
        "symbol": snapshot.get("symbol") or payload.symbol,
        "price": snapshot.get("price"),
        "regime": compact_mapping(snapshot.get("marketRegime"), ("primary", "adx1h", "adx4h", "volumeZscore15m", "priceChange1h")),
        "timeframes": timeframes(snapshot.get("timeframes")),
        "derivatives": derivatives(snapshot.get("derivatives")),
    }


def context_summary(payload: TradeReviewPayload) -> dict[str, Any]:
    return {
        **loss_context(payload),
        "activeExposure": active_exposure(payload.activeExposure),
        "recentEntryReviewMemory": recent_entry_memory(payload.recentAiReviews),
        "recentManagementContext": recent_management_context(payload.recentManagementReviews),
        "recentTradeEvents": recent_trade_events(payload.recentTradeEvents),
    }


def active_exposure(value: dict[str, Any]) -> dict[str, Any]:
    orders = value.get("openOrders") if isinstance(value.get("openOrders"), list) else []
    positions = value.get("openPositions") if isinstance(value.get("openPositions"), list) else []
    return {
        "openOrderCount": len(orders),
        "openPositionCount": len(positions),
        "openOrders": orders[:2],
        "openPositions": positions[:2],
    }


def loss_context(payload: TradeReviewPayload) -> dict[str, Any]:
    return {
        "lossDiscipline": compact_mapping(payload.lossDiscipline, ("active", "remainingSeconds", "closeReason", "realizedPnl", "closedAt")),
        "recentLossReviews": [
            compact_mapping(item, ("createdAt", "side", "closeReason", "realizedPnl", "summary", "counterThesis"))
            for item in payload.recentLossReviews[:3]
            if isinstance(item, dict)
        ],
    }


def recent_entry_memory(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [memory for review in reviews[:4] if (memory := recent_review_memory(review))]


def recent_review_memory(review: dict[str, Any]) -> dict[str, Any]:
    snippets: list[str] = []
    structured = review.get("structuredReview") if isinstance(review.get("structuredReview"), dict) else {}
    for key in ("headline", "action", "managerNote"):
        if snippet := compact_text(structured.get(key), 180):
            snippets.append(snippet)
    for key in ("keyReasons", "risks", "watchConditions"):
        items = structured.get(key)
        if isinstance(items, list):
            snippets.extend(snippet for item in items[:2] if (snippet := compact_text(item, 180)))
    for key in ("approvalReason", "counterThesis"):
        if snippet := compact_text(review.get(key), 180):
            snippets.append(snippet)
    if not snippets:
        return {}
    return {
        "decision": review.get("decision"),
        "reviewCode": review.get("reviewCode"),
        "createdAt": review.get("createdAt"),
        "avoidRepeating": snippets[:5],
    }


def recent_management_context(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    context: list[dict[str, Any]] = []
    for review in reviews[:3]:
        compact = compact_mapping(review, ("decision", "actionType", "eventType", "reviewCode", "createdAt"))
        actions = review.get("appliedActions")
        if isinstance(actions, list):
            compact["appliedActionTypes"] = [str(action.get("type")) for action in actions[:3] if isinstance(action, dict) and action.get("type")]
        if compact:
            context.append(compact)
    return context


def recent_trade_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        compact_mapping(event, ("createdAt", "eventType", "price", "quantity", "realizedPnl", "fee"))
        for event in events[:5]
        if isinstance(event, dict)
    ]


def audit_signals(audit: dict[str, Any]) -> dict[str, Any]:
    return {
        key: audit[key]
        for key in ("reasonCode", "gateScores", "executionProfile")
        if audit.get(key) not in (None, "", [], {})
    }


def timeframes(value: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(value, dict):
        return {}
    return {
        interval: compact_mapping(value.get(interval), TIMEFRAME_KEYS)
        for interval in ("15m", "1h", "4h", "1d")
        if isinstance(value.get(interval), dict)
    }


def derivatives(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    compact = compact_mapping(value, DERIVATIVE_KEYS)
    for target, source, keys in (
        ("openInterestStats", value.get("openInterestStats"), ("changePercent5m", "changePercent30m")),
        ("fundingStats", value.get("fundingStats"), ("absPercentile", "latest", "averageAbs")),
        ("takerBuySell", value.get("takerBuySell"), ("buySellRatio", "buyShare")),
        ("crowding", value.get("crowding"), ("crowdedSide", "oiChangePercent30m", "fundingAbsPercentile")),
    ):
        nested = compact_mapping(source, keys)
        if nested:
            compact[target] = nested
    return compact
