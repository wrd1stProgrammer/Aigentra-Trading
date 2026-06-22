from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import (
    AIReviewRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradeEventRecord,
    TraderStateRecord,
)
from app.core.config import get_settings
from app.paper.loss_discipline import latest_loss_discipline_context, recent_loss_review_context
from app.repositories import from_json


def _payload(record: Any) -> dict[str, Any]:
    value = from_json(getattr(record, "payload_json", None))
    return value if isinstance(value, dict) else {}


def _review_summary(record: AIReviewRecord) -> dict[str, Any]:
    payload = _payload(record)
    return {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "provider": record.provider,
        "model": record.model,
        "decision": record.decision,
        "confidence": record.confidence,
        "riskLevel": record.risk_level,
        "approvalReason": payload.get("approvalReason"),
        "counterThesis": payload.get("counterThesis"),
        "reviewCode": payload.get("reviewCode"),
        "reviewFacts": payload.get("reviewFacts") or [],
        "riskFlags": payload.get("riskFlags") or [],
        "structuredReview": payload.get("structuredReview"),
        "adjustments": payload.get("adjustments") or [],
    }


def _management_summary(record: PositionManagementReviewRecord) -> dict[str, Any]:
    payload = _payload(record)
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    applied = payload.get("appliedActions") if isinstance(payload.get("appliedActions"), list) else []
    return {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "eventType": record.event_type,
        "phase": record.phase,
        "decision": record.decision,
        "actionType": record.action_type,
        "confidence": record.confidence,
        "rationale": review.get("rationale"),
        "counterThesis": review.get("counterThesis"),
        "reviewCode": review.get("reviewCode"),
        "reviewFacts": review.get("reviewFacts") or [],
        "riskFlags": review.get("riskFlags") or [],
        "structuredReview": review.get("structuredReview"),
        "appliedActions": applied[:3],
    }


def _order_summary(record: PaperOrderRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "status": record.status,
        "side": record.side,
        "orderType": record.order_type,
        "quantity": float(record.quantity),
        "leverage": float(record.leverage),
        "limitPrice": float(record.limit_price) if record.limit_price is not None else None,
        "stopLoss": float(record.stop_loss_price) if record.stop_loss_price is not None else None,
        "takeProfit": float(record.take_profit_price) if record.take_profit_price is not None else None,
    }


def _position_summary(record: PaperPositionRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "status": record.status,
        "side": record.side,
        "quantity": float(record.quantity),
        "entryPrice": float(record.entry_price),
        "leverage": float(record.leverage),
        "margin": float(record.margin),
        "notional": float(record.notional),
        "unrealizedPnl": float(record.unrealized_pnl),
        "stopLoss": float(record.stop_loss_price) if record.stop_loss_price is not None else None,
        "takeProfit": float(record.take_profit_price) if record.take_profit_price is not None else None,
    }


def _event_summary(record: TradeEventRecord) -> dict[str, Any]:
    return {
        "id": record.id,
        "createdAt": record.created_at.isoformat() if record.created_at else None,
        "eventType": record.event_type,
        "orderId": record.order_id,
        "positionId": record.position_id,
        "price": float(record.price) if record.price is not None else None,
        "quantity": float(record.quantity) if record.quantity is not None else None,
        "realizedPnl": float(record.realized_pnl),
        "fee": float(record.fee),
        "payload": _payload(record),
    }


def active_exposure_context(db: Session, trader_id: str, symbol: str) -> dict[str, Any]:
    orders = db.execute(
        select(PaperOrderRecord)
        .where(PaperOrderRecord.trader_id == trader_id, PaperOrderRecord.symbol == symbol, PaperOrderRecord.status == "open")
        .order_by(PaperOrderRecord.id.asc())
        .limit(10)
    ).scalars().all()
    positions = db.execute(
        select(PaperPositionRecord)
        .where(PaperPositionRecord.trader_id == trader_id, PaperPositionRecord.symbol == symbol, PaperPositionRecord.status == "open")
        .order_by(PaperPositionRecord.id.asc())
        .limit(10)
    ).scalars().all()
    return {
        "openOrders": [_order_summary(order) for order in orders],
        "openPositions": [_position_summary(position) for position in positions],
    }


def account_state_context(db: Session, trader_id: str) -> dict[str, Any]:
    state: Optional[TraderStateRecord] = db.execute(
        select(TraderStateRecord).where(TraderStateRecord.trader_id == trader_id)
    ).scalar_one_or_none()
    if state is None:
        return {}
    return {
        "equity": float(state.equity),
        "cashBalance": float(state.cash_balance),
        "marginUsed": float(state.margin_used),
        "realizedPnl": float(state.realized_pnl),
        "unrealizedPnl": float(state.unrealized_pnl),
        "totalFees": float(state.total_fees),
    }


def recent_trade_events_context(db: Session, trader_id: str, symbol: str, limit: int = 8) -> list[dict[str, Any]]:
    records = db.execute(
        select(TradeEventRecord)
        .where(TradeEventRecord.trader_id == trader_id, TradeEventRecord.symbol == symbol)
        .order_by(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id))
        .limit(limit)
    ).scalars().all()
    return [_event_summary(record) for record in records]


def build_trade_review_context(db: Session, trader_id: str, symbol: str) -> dict[str, Any]:
    ai_reviews = db.execute(
        select(AIReviewRecord)
        .where(AIReviewRecord.trader_id == trader_id, AIReviewRecord.symbol == symbol)
        .order_by(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
        .limit(4)
    ).scalars().all()
    management_reviews = db.execute(
        select(PositionManagementReviewRecord)
        .where(PositionManagementReviewRecord.trader_id == trader_id, PositionManagementReviewRecord.symbol == symbol)
        .order_by(desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
        .limit(5)
    ).scalars().all()
    settings = get_settings()
    loss_discipline = latest_loss_discipline_context(
        db,
        trader_id,
        symbol,
        cooldown_seconds=max(0, int(settings.paper_reentry_cooldown_seconds or 0)),
    )
    return {
        "recentAiReviews": [_review_summary(record) for record in ai_reviews],
        "recentManagementReviews": [_management_summary(record) for record in management_reviews],
        "activeExposure": active_exposure_context(db, trader_id, symbol),
        "recentTradeEvents": recent_trade_events_context(db, trader_id, symbol, limit=8),
        "lossDiscipline": loss_discipline or {},
        "recentLossReviews": recent_loss_review_context(db, trader_id, symbol, limit=3),
    }


def build_management_review_context(db: Session, trader_id: str, symbol: str) -> dict[str, Any]:
    management_reviews = db.execute(
        select(PositionManagementReviewRecord)
        .where(PositionManagementReviewRecord.trader_id == trader_id, PositionManagementReviewRecord.symbol == symbol)
        .order_by(desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
        .limit(8)
    ).scalars().all()
    return {
        "recentManagementReviews": [_management_summary(record) for record in management_reviews],
        "recentTradeEvents": recent_trade_events_context(db, trader_id, symbol, limit=10),
        "siblingExposures": active_exposure_context(db, trader_id, symbol),
        "accountState": account_state_context(db, trader_id),
    }
