from typing import Any, Iterable, Optional

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.orm import Session

from app.db import (
    AIReviewRecord,
    CandidateTradeRecord,
    EquitySnapshotRecord,
    MarketSnapshotRecord,
    ObservationCandidateRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    RiskSettingsRecord,
    SubscriberPreferenceRecord,
    TelegramAlertDeliveryRecord,
    TradeEventRecord,
    TradePlanRecord,
    TraderAgentStateRecord,
    TraderLeaderboardSnapshotRecord,
    TraderRunLogRecord,
    TraderStateRecord,
)


RESET_CONFIRMATION_TEXT = "RESET_TRADER_HISTORY"
PRESERVED_TABLES = [SubscriberPreferenceRecord.__tablename__]


TABLE_MODELS = {
    MarketSnapshotRecord.__tablename__: MarketSnapshotRecord,
    TraderRunLogRecord.__tablename__: TraderRunLogRecord,
    CandidateTradeRecord.__tablename__: CandidateTradeRecord,
    ObservationCandidateRecord.__tablename__: ObservationCandidateRecord,
    AIReviewRecord.__tablename__: AIReviewRecord,
    TradePlanRecord.__tablename__: TradePlanRecord,
    PositionManagementReviewRecord.__tablename__: PositionManagementReviewRecord,
    TraderAgentStateRecord.__tablename__: TraderAgentStateRecord,
    TraderLeaderboardSnapshotRecord.__tablename__: TraderLeaderboardSnapshotRecord,
    TraderStateRecord.__tablename__: TraderStateRecord,
    RiskSettingsRecord.__tablename__: RiskSettingsRecord,
    PaperOrderRecord.__tablename__: PaperOrderRecord,
    PaperPositionRecord.__tablename__: PaperPositionRecord,
    TradeEventRecord.__tablename__: TradeEventRecord,
    TelegramAlertDeliveryRecord.__tablename__: TelegramAlertDeliveryRecord,
    EquitySnapshotRecord.__tablename__: EquitySnapshotRecord,
}

DELETE_ORDER = [
    TelegramAlertDeliveryRecord.__tablename__,
    TraderAgentStateRecord.__tablename__,
    PositionManagementReviewRecord.__tablename__,
    TradeEventRecord.__tablename__,
    PaperPositionRecord.__tablename__,
    PaperOrderRecord.__tablename__,
    TradePlanRecord.__tablename__,
    ObservationCandidateRecord.__tablename__,
    AIReviewRecord.__tablename__,
    CandidateTradeRecord.__tablename__,
    TraderRunLogRecord.__tablename__,
    MarketSnapshotRecord.__tablename__,
    EquitySnapshotRecord.__tablename__,
    TraderLeaderboardSnapshotRecord.__tablename__,
    TraderStateRecord.__tablename__,
    RiskSettingsRecord.__tablename__,
]


def reset_trader_history(
    db: Session,
    *,
    trader_ids: Optional[Iterable[str]] = None,
    symbols: Optional[Iterable[str]] = None,
    dry_run: bool = True,
    confirmation_text: Optional[str] = None,
) -> dict[str, Any]:
    clean_trader_ids = sorted({value.strip() for value in trader_ids or [] if value and value.strip()})
    clean_symbols = sorted({value.strip().upper() for value in symbols or [] if value and value.strip()})
    if not dry_run and confirmation_text != RESET_CONFIRMATION_TEXT:
        raise ValueError("RESET_CONFIRMATION_REQUIRED")

    target_ids = collect_reset_target_ids(db, clean_trader_ids, clean_symbols)
    counts = {table: len(ids) for table, ids in target_ids.items()}
    result = {
        "dryRun": dry_run,
        "executed": False,
        "filters": {
            "traderIds": clean_trader_ids,
            "symbols": clean_symbols,
        },
        "resettableCounts": counts,
        "deletedTables": [table for table in DELETE_ORDER if counts.get(table, 0) > 0],
        "preservedTables": PRESERVED_TABLES,
    }
    if dry_run:
        return result

    if target_ids[TraderRunLogRecord.__tablename__]:
        db.execute(
            update(TraderRunLogRecord)
            .where(TraderRunLogRecord.id.in_(target_ids[TraderRunLogRecord.__tablename__]))
            .values(
                market_snapshot_id=None,
                candidate_trade_id=None,
                ai_review_id=None,
                trade_plan_id=None,
            )
        )
    if target_ids[TraderAgentStateRecord.__tablename__]:
        db.execute(
            update(TraderAgentStateRecord)
            .where(TraderAgentStateRecord.id.in_(target_ids[TraderAgentStateRecord.__tablename__]))
            .values(last_review_id=None)
        )
    for table in DELETE_ORDER:
        ids = target_ids[table]
        if not ids:
            continue
        model = TABLE_MODELS[table]
        db.execute(delete(model).where(model.id.in_(ids)))
    db.flush()
    result["executed"] = True
    return result


def collect_reset_target_ids(db: Session, trader_ids: list[str], symbols: list[str]) -> dict[str, list[int]]:
    run_ids = ids_for_model(db, TraderRunLogRecord, trader_ids, symbols)
    candidate_ids = ids_for_model(db, CandidateTradeRecord, trader_ids, symbols, run_ids=run_ids)
    observation_ids = ids_for_model(db, ObservationCandidateRecord, trader_ids, symbols, run_ids=run_ids)
    review_ids = ids_for_model(db, AIReviewRecord, trader_ids, symbols, run_ids=run_ids)
    plan_ids = ids_for_model(db, TradePlanRecord, trader_ids, symbols, run_ids=run_ids)
    management_ids = ids_for_model(db, PositionManagementReviewRecord, trader_ids, symbols)
    agent_ids = ids_for_model(db, TraderAgentStateRecord, trader_ids, symbols)
    leaderboard_ids = ids_for_model(db, TraderLeaderboardSnapshotRecord, trader_ids, symbols)
    risk_ids = ids_for_model(db, RiskSettingsRecord, trader_ids, symbols)
    order_ids = ids_for_model(db, PaperOrderRecord, trader_ids, symbols)
    position_ids = ids_for_model(db, PaperPositionRecord, trader_ids, symbols)
    event_ids = ids_for_model(db, TradeEventRecord, trader_ids, symbols)
    equity_ids = ids_for_model(db, EquitySnapshotRecord, trader_ids, symbols)
    state_ids = ids_for_model(db, TraderStateRecord, trader_ids, []) if trader_ids else ([] if symbols else ids_for_model(db, TraderStateRecord, [], []))
    delivery_ids = ids_for_event_deliveries(db, event_ids)
    snapshot_ids = market_snapshot_ids_for_runs(db, run_ids)
    if not trader_ids:
        snapshot_ids = sorted(set(snapshot_ids + ids_for_model(db, MarketSnapshotRecord, trader_ids, symbols)))
    return {
        MarketSnapshotRecord.__tablename__: snapshot_ids,
        TraderRunLogRecord.__tablename__: run_ids,
        CandidateTradeRecord.__tablename__: candidate_ids,
        ObservationCandidateRecord.__tablename__: observation_ids,
        AIReviewRecord.__tablename__: review_ids,
        TradePlanRecord.__tablename__: plan_ids,
        PositionManagementReviewRecord.__tablename__: management_ids,
        TraderAgentStateRecord.__tablename__: agent_ids,
        TraderLeaderboardSnapshotRecord.__tablename__: leaderboard_ids,
        TraderStateRecord.__tablename__: state_ids,
        RiskSettingsRecord.__tablename__: risk_ids,
        PaperOrderRecord.__tablename__: order_ids,
        PaperPositionRecord.__tablename__: position_ids,
        TradeEventRecord.__tablename__: event_ids,
        TelegramAlertDeliveryRecord.__tablename__: delivery_ids,
        EquitySnapshotRecord.__tablename__: equity_ids,
    }


def ids_for_model(
    db: Session,
    model,
    trader_ids: list[str],
    symbols: list[str],
    *,
    run_ids: Optional[list[int]] = None,
) -> list[int]:
    if not trader_ids and not symbols:
        return sorted({int(value) for value in db.scalars(select(model.id)).all()})
    conditions = []
    if trader_ids:
        conditions.append(model.trader_id.in_(trader_ids))
    if symbols:
        conditions.append(model.symbol.in_(symbols))
    stmt = select(model.id)
    if run_ids and hasattr(model, "run_id"):
        run_condition = model.run_id.in_(run_ids)
        filter_condition = and_(*conditions) if conditions else None
        stmt = stmt.where(or_(run_condition, filter_condition) if filter_condition is not None else run_condition)
    elif conditions:
        stmt = stmt.where(*conditions)
    return sorted({int(value) for value in db.scalars(stmt).all()})


def ids_for_event_deliveries(db: Session, event_ids: list[int]) -> list[int]:
    if not event_ids:
        return []
    return sorted(
        {
            int(value)
            for value in db.scalars(
                select(TelegramAlertDeliveryRecord.id).where(TelegramAlertDeliveryRecord.trade_event_id.in_(event_ids))
            ).all()
        }
    )


def market_snapshot_ids_for_runs(db: Session, run_ids: list[int]) -> list[int]:
    if not run_ids:
        return []
    return sorted(
        {
            int(value)
            for value in db.scalars(
                select(TraderRunLogRecord.market_snapshot_id)
                .where(TraderRunLogRecord.id.in_(run_ids), TraderRunLogRecord.market_snapshot_id.is_not(None))
            ).all()
            if value is not None
        }
    )
