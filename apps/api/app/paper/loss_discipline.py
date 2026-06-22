from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import PaperPositionRecord


LOSS_CLOSE_REASONS = {
    "stop_loss",
    "stop-loss",
    "early_thesis_failure",
    "thesis_failure",
    "close_position",
    "reduce_risk",
}


def latest_loss_discipline_context(
    db: Session,
    trader_id: str,
    symbol: str,
    *,
    cooldown_seconds: int,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    latest = db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "closed",
        )
        .order_by(desc(PaperPositionRecord.closed_at), desc(PaperPositionRecord.created_at), desc(PaperPositionRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    if latest is None or not is_loss_discipline_position(latest):
        return None

    closed_at = ensure_utc(latest.closed_at or latest.created_at)
    current = ensure_utc(now or datetime.now(timezone.utc))
    elapsed_seconds = max(0, int((current - closed_at).total_seconds()))
    safe_cooldown = max(0, int(cooldown_seconds or 0))
    remaining_seconds = max(0, safe_cooldown - elapsed_seconds)
    return {
        "active": remaining_seconds > 0,
        "positionId": latest.id,
        "closeReason": latest.close_reason,
        "summary": close_review_summary(latest, str(latest.close_reason or "")),
        "realizedPnl": float(latest.realized_pnl or Decimal("0")),
        "closedAt": closed_at.isoformat(),
        "cooldownSeconds": safe_cooldown,
        "elapsedSeconds": elapsed_seconds,
        "remainingSeconds": remaining_seconds,
    }


def recent_loss_review_context(
    db: Session,
    trader_id: str,
    symbol: str,
    *,
    limit: int = 3,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit or 3), 5))
    records = db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.trader_id == trader_id,
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "closed",
        )
        .order_by(desc(PaperPositionRecord.closed_at), desc(PaperPositionRecord.created_at), desc(PaperPositionRecord.id))
        .limit(safe_limit * 4)
    ).scalars().all()

    reviews: list[dict[str, Any]] = []
    for position in records:
        if not is_loss_discipline_position(position):
            continue
        reviews.append(close_review_context(position, str(position.close_reason or ""), position.exit_price))
        if len(reviews) >= safe_limit:
            break
    return reviews


def latest_post_loss_cooldown(
    db: Session,
    trader_id: str,
    symbol: str,
    *,
    cooldown_seconds: int,
    now: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    context = latest_loss_discipline_context(
        db,
        trader_id,
        symbol,
        cooldown_seconds=cooldown_seconds,
        now=now,
    )
    if context and context.get("active"):
        return context
    return None


def latest_post_loss_cooldown_map(
    db: Session,
    trader_ids: Iterable[str],
    symbol: str,
    *,
    cooldown_seconds: int,
) -> dict[str, dict[str, Any]]:
    cooldowns: dict[str, dict[str, Any]] = {}
    for trader_id in sorted({item for item in trader_ids if item}):
        cooldown = latest_post_loss_cooldown(db, trader_id, symbol, cooldown_seconds=cooldown_seconds)
        if cooldown:
            cooldowns[trader_id] = cooldown
    return cooldowns


def is_loss_discipline_position(position: PaperPositionRecord) -> bool:
    realized_pnl = Decimal(position.realized_pnl or 0)
    if realized_pnl >= 0:
        return False
    close_reason = str(position.close_reason or "").strip().lower()
    return close_reason in LOSS_CLOSE_REASONS or "stop" in close_reason or "loss" in close_reason


def close_review_context(
    position: PaperPositionRecord,
    close_reason: str,
    exit_price: Any,
) -> dict[str, Any]:
    opened_at = ensure_utc(position.opened_at) if position.opened_at else None
    closed_at = ensure_utc(position.closed_at) if position.closed_at else None
    duration_minutes = None
    if opened_at is not None and closed_at is not None:
        duration_minutes = max(0, int((closed_at - opened_at).total_seconds() // 60))
    realized_pnl = Decimal(position.realized_pnl or 0)
    return {
        "positionId": position.id,
        "side": position.side,
        "closeReason": close_reason,
        "summary": close_review_summary(position, close_reason),
        "entryPrice": float(position.entry_price) if position.entry_price is not None else None,
        "exitPrice": float(exit_price) if exit_price is not None else None,
        "stopLoss": float(position.stop_loss_price) if position.stop_loss_price is not None else None,
        "takeProfit": float(position.take_profit_price) if position.take_profit_price is not None else None,
        "realizedPnl": float(realized_pnl),
        "outcome": "loss" if realized_pnl < 0 else "profit" if realized_pnl > 0 else "flat",
        "closedAt": closed_at.isoformat() if closed_at else None,
        "durationMinutes": duration_minutes,
    }


def close_review_summary(position: PaperPositionRecord, close_reason: str) -> str:
    reason = close_reason.strip().lower()
    realized_pnl = Decimal(position.realized_pnl or 0)
    side = str(position.side or "position").upper()
    if realized_pnl < 0:
        if reason == "stop_loss":
            return f"{side} reached the planned hard stop; review whether the new setup avoids the same invalidation."
        if reason == "early_thesis_failure":
            return f"{side} was closed early after thesis failure; compare the new entry with that failed condition."
        if reason in {"close_position", "reduce_risk"}:
            return f"{side} was closed by management after risk review weakened the thesis."
        return f"{side} closed at a loss; compare the new setup with the prior failed condition."
    if reason == "take_profit":
        return f"{side} reached the planned take-profit; note what confirmation helped the trade work."
    if reason == "early_profit_protect":
        return f"{side} protected profit after nearing target and giving back part of the move."
    return f"{side} closed; use the outcome only as light context for the next review."


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
