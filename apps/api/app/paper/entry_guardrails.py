from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import EquitySnapshotRecord, PaperPositionRecord, TraderStateRecord


def _percent_loss(current: Decimal, baseline: Decimal) -> Decimal:
    if baseline <= 0 or current >= baseline:
        return Decimal("0")
    return (baseline - current) / baseline * Decimal("100")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def entry_guardrail_context(
    db: Session,
    trader_id: str,
    *,
    candidate_risk_percent: float | Decimal | None = None,
    now: datetime | None = None,
    settings: Any | None = None,
) -> dict[str, Any]:
    settings = settings or get_settings()
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    day_start = now.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    state = db.execute(
        select(TraderStateRecord).where(TraderStateRecord.trader_id == trader_id)
    ).scalar_one_or_none()
    if state is None:
        candidate_risk = max(Decimal("0"), Decimal(str(candidate_risk_percent or 0)))
        return {
            "blocked": False,
            "blockReasons": [],
            "riskMultiplier": 1.0,
            "riskCapPercent": float(candidate_risk),
            "dailyLossPercent": 0.0,
            "drawdownPercent": 0.0,
            "consecutiveLosses": 0,
        }

    current_equity = Decimal(str(state.equity))
    snapshots = db.execute(
        select(EquitySnapshotRecord)
        .where(EquitySnapshotRecord.trader_id == trader_id)
        .order_by(EquitySnapshotRecord.created_at.asc(), EquitySnapshotRecord.id.asc())
    ).scalars().all()
    before_day = [row for row in snapshots if row.created_at and _aware(row.created_at) < day_start]
    during_day = [row for row in snapshots if row.created_at and _aware(row.created_at) >= day_start]
    daily_baseline = Decimal(str((before_day[-1] if before_day else during_day[0]).equity)) if (before_day or during_day) else current_equity
    peak_equity = max([Decimal(str(row.equity)) for row in snapshots] + [current_equity])
    daily_loss = _percent_loss(current_equity, daily_baseline)
    drawdown = _percent_loss(current_equity, peak_equity)

    recent_closed = db.execute(
        select(PaperPositionRecord)
        .where(PaperPositionRecord.trader_id == trader_id, PaperPositionRecord.status == "closed")
        .order_by(desc(PaperPositionRecord.closed_at), desc(PaperPositionRecord.id))
        .limit(max(20, int(getattr(settings, "paper_consecutive_loss_limit", 3)) + 2))
    ).scalars().all()
    consecutive_losses = 0
    for position in recent_closed:
        if position.closed_at is None or _aware(position.closed_at) < day_start:
            break
        if Decimal(str(position.realized_pnl)) >= 0:
            break
        consecutive_losses += 1

    candidate_risk = max(Decimal("0"), Decimal(str(candidate_risk_percent or 0)))
    configured_daily_limit = Decimal(str(getattr(settings, "paper_daily_loss_limit_percent", 1.5)))
    two_r_limit = candidate_risk * Decimal("2") if candidate_risk > 0 else configured_daily_limit
    effective_daily_limit = min(configured_daily_limit, two_r_limit)
    reasons: list[str] = []
    if daily_loss >= effective_daily_limit > 0:
        reasons.append(f"Daily loss {daily_loss:.2f}% reached the {effective_daily_limit:.2f}% entry limit.")
    consecutive_limit = int(getattr(settings, "paper_consecutive_loss_limit", 3))
    if consecutive_losses >= consecutive_limit:
        reasons.append(f"{consecutive_losses} consecutive daily losses reached the entry limit.")
    drawdown_block = Decimal(str(getattr(settings, "paper_drawdown_block_percent", 12)))
    drawdown_reduce = Decimal(str(getattr(settings, "paper_drawdown_reduce_percent", 8)))
    if drawdown >= drawdown_block:
        reasons.append(f"Account drawdown {drawdown:.2f}% reached the hard entry limit.")

    risk_multiplier = Decimal("1")
    if drawdown >= drawdown_reduce:
        risk_multiplier = min(Decimal("1"), max(Decimal("0"), Decimal(str(getattr(settings, "paper_drawdown_risk_multiplier", 0.5)))))
    if reasons:
        risk_multiplier = Decimal("0")
    return {
        "blocked": bool(reasons),
        "blockReasons": reasons,
        "riskMultiplier": float(risk_multiplier),
        "riskCapPercent": float(candidate_risk * risk_multiplier),
        "equity": float(current_equity),
        "dailyBaselineEquity": float(daily_baseline),
        "peakEquity": float(peak_equity),
        "dailyLossPercent": float(daily_loss),
        "dailyLossLimitPercent": float(effective_daily_limit),
        "drawdownPercent": float(drawdown),
        "drawdownReducePercent": float(drawdown_reduce),
        "drawdownBlockPercent": float(drawdown_block),
        "consecutiveLosses": consecutive_losses,
        "consecutiveLossLimit": consecutive_limit,
        "resetsAt": (day_start + timedelta(days=1)).isoformat(),
    }
