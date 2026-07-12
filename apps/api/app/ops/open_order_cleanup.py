import hashlib
import json
from typing import Any, Iterable

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.db import (
    AIReviewRecord,
    AITranslationCacheRecord,
    CandidateTradeRecord,
    ObservationCandidateRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TelegramAlertDeliveryRecord,
    TradeEventRecord,
    TradePlanRecord,
    TraderAgentStateRecord,
    TraderRunLogRecord,
    TraderStatusFeedRecord,
)
from app.locales import (
    AI_TRANSLATION_SOURCE_AI_REVIEW,
    AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
    AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
)
from app.repositories import from_json


OPEN_ORDER_STATUSES = ("open", "pending")


def cleanup_open_pending_orders(
    db: Session,
    *,
    dry_run: bool = True,
    confirmation_token: str | None = None,
    expected_order_ids: Iterable[int] | None = None,
) -> dict[str, Any]:
    if dry_run:
        graph = collect_open_order_cleanup_graph(db)
        order_ids = graph[PaperOrderRecord.__tablename__]
        return _cleanup_result(graph, dry_run=True, executed=False)
    if expected_order_ids is None:
        raise ValueError("OPEN_ORDER_CLEANUP_EXPECTED_IDS_REQUIRED")
    expected = sorted({int(value) for value in expected_order_ids})
    required_token = cleanup_confirmation_token(expected)
    if confirmation_token != required_token:
        raise ValueError("OPEN_ORDER_CLEANUP_CONFIRMATION_REQUIRED")

    with db.begin_nested():
        locked_order_ids = _open_pending_order_ids(db, lock=True)
        if locked_order_ids != expected:
            raise ValueError("OPEN_ORDER_CLEANUP_TARGETS_CHANGED")
        graph = collect_open_order_cleanup_graph(db)
        if graph[PaperOrderRecord.__tablename__] != expected:
            raise ValueError("OPEN_ORDER_CLEANUP_TARGETS_CHANGED")
        _execute_cleanup_graph(db, graph)
        remaining = _open_pending_order_ids(db)
        if remaining:
            raise RuntimeError(f"OPEN_ORDER_CLEANUP_INCOMPLETE:{remaining}")
    return _cleanup_result(graph, dry_run=False, executed=True)


def _cleanup_result(
    graph: dict[str, list[int]],
    *,
    dry_run: bool,
    executed: bool,
) -> dict[str, Any]:
    order_ids = graph[PaperOrderRecord.__tablename__]
    result = {
        "dryRun": dry_run,
        "executed": executed,
        "targetOrderIds": order_ids,
        "confirmationToken": cleanup_confirmation_token(order_ids),
        "counts": {table: len(ids) for table, ids in graph.items()},
    }
    return result


def cleanup_confirmation_token(order_ids: list[int]) -> str:
    digest = hashlib.sha256(json.dumps(order_ids, separators=(",", ":")).encode("utf-8")).hexdigest()[:20]
    return f"DELETE_OPEN_PENDING_ORDERS:{digest}"


def collect_open_order_cleanup_graph(db: Session) -> dict[str, list[int]]:
    order_ids = _open_pending_order_ids(db)
    target_orders = _records_by_ids(db, PaperOrderRecord, order_ids)
    surviving_orders = db.scalars(select(PaperOrderRecord).where(PaperOrderRecord.id.not_in(order_ids))).all()
    positions = db.scalars(select(PaperPositionRecord)).all()
    target_refs = _lineage_references(target_orders)
    survivor_refs = _lineage_references([*surviving_orders, *positions])
    linked_order_ids = {
        int(position.order_id)
        for position in positions
        if position.order_id is not None and int(position.order_id) in order_ids
    }
    linked_position_ids = {int(position.id) for position in positions if position.id is not None}
    linked_order_ids.update(
        int(order.id)
        for order in target_orders
        if order.id is not None and order.position_id is not None and int(order.position_id) in linked_position_ids
    )
    linked_target_orders = [order for order in target_orders if int(order.id) in linked_order_ids]
    _merge_lineage_references(survivor_refs, _lineage_references(linked_target_orders))
    candidate_plan_ids = sorted(target_refs["plan"] - survivor_refs["plan"])
    candidate_review_ids = sorted(target_refs["review"] - survivor_refs["review"])
    candidate_run_ids = target_refs["run"] - survivor_refs["run"]
    run_ids = _exclusive_run_ids(db, candidate_run_ids, candidate_plan_ids, candidate_review_ids)
    plan_ids = _ids_where(db, TradePlanRecord, TradePlanRecord.run_id.in_(run_ids))
    review_ids = _ids_where(db, AIReviewRecord, AIReviewRecord.run_id.in_(run_ids))
    candidate_ids = _ids_where(db, CandidateTradeRecord, CandidateTradeRecord.run_id.in_(run_ids))
    observation_ids = _ids_where(
        db,
        ObservationCandidateRecord,
        or_(
            ObservationCandidateRecord.run_id.in_(run_ids),
            ObservationCandidateRecord.candidate_trade_id.in_(candidate_ids),
            ObservationCandidateRecord.ai_review_id.in_(review_ids),
        ),
    )
    event_ids = _ids_where(
        db,
        TradeEventRecord,
        TradeEventRecord.order_id.in_(order_ids),
        TradeEventRecord.position_id.is_(None),
    )
    management_ids = _ids_where(
        db,
        PositionManagementReviewRecord,
        PositionManagementReviewRecord.order_id.in_(order_ids),
        PositionManagementReviewRecord.position_id.is_(None),
    )
    feed_ids = _status_feed_ids(
        db,
        order_ids=order_ids,
        event_ids=event_ids,
        management_ids=management_ids,
        plan_ids=plan_ids,
        review_ids=review_ids,
    )
    translation_ids = _translation_ids(
        db,
        feed_ids=feed_ids,
        management_ids=management_ids,
        review_ids=review_ids,
    )
    delivery_ids = _ids_where(
        db,
        TelegramAlertDeliveryRecord,
        or_(
            TelegramAlertDeliveryRecord.trade_event_id.in_(event_ids),
            TelegramAlertDeliveryRecord.position_management_review_id.in_(management_ids),
            TelegramAlertDeliveryRecord.trader_status_feed_id.in_(feed_ids),
        ),
    )
    return {
        PaperOrderRecord.__tablename__: order_ids,
        TradeEventRecord.__tablename__: event_ids,
        PositionManagementReviewRecord.__tablename__: management_ids,
        TraderStatusFeedRecord.__tablename__: feed_ids,
        AITranslationCacheRecord.__tablename__: translation_ids,
        TelegramAlertDeliveryRecord.__tablename__: delivery_ids,
        ObservationCandidateRecord.__tablename__: observation_ids,
        TradePlanRecord.__tablename__: plan_ids,
        AIReviewRecord.__tablename__: review_ids,
        CandidateTradeRecord.__tablename__: candidate_ids,
        TraderRunLogRecord.__tablename__: run_ids,
    }


def _open_pending_order_ids(db: Session, *, lock: bool = False) -> list[int]:
    statement = select(PaperOrderRecord.id).where(func.lower(PaperOrderRecord.status).in_(OPEN_ORDER_STATUSES))
    if lock and db.get_bind().dialect.name != "sqlite":
        statement = statement.with_for_update()
    return sorted(int(value) for value in db.scalars(statement).all())


def _records_by_ids(db: Session, model, ids: list[int]) -> list[Any]:
    if not ids:
        return []
    return list(db.scalars(select(model).where(model.id.in_(ids))).all())


def _lineage_references(records: Iterable[Any]) -> dict[str, set[int]]:
    refs = {"run": set(), "plan": set(), "review": set()}
    aliases = {
        "run": ("runId", "run_id"),
        "plan": ("tradePlanId", "trade_plan_id"),
        "review": ("aiReviewId", "ai_review_id"),
    }
    for record in records:
        payload = from_json(getattr(record, "payload_json", None))
        if not isinstance(payload, dict):
            continue
        for ref_type, keys in aliases.items():
            value = next((payload.get(key) for key in keys if payload.get(key) is not None), None)
            try:
                if value is not None:
                    refs[ref_type].add(int(value))
            except (TypeError, ValueError):
                continue
    return refs


def _merge_lineage_references(target: dict[str, set[int]], source: dict[str, set[int]]) -> None:
    for ref_type in target:
        target[ref_type].update(source[ref_type])


def _exclusive_run_ids(
    db: Session,
    candidate_run_ids: set[int],
    plan_ids: list[int],
    review_ids: list[int],
) -> list[int]:
    exclusive: list[int] = []
    plan_set = set(plan_ids)
    review_set = set(review_ids)
    for run_id in sorted(candidate_run_ids):
        run_plan_ids = set(db.scalars(select(TradePlanRecord.id).where(TradePlanRecord.run_id == run_id)).all())
        run_review_ids = set(db.scalars(select(AIReviewRecord.id).where(AIReviewRecord.run_id == run_id)).all())
        if run_plan_ids.issubset(plan_set) and run_review_ids.issubset(review_set):
            exclusive.append(run_id)
    return exclusive


def _ids_where(db: Session, model, *conditions) -> list[int]:
    return sorted(int(value) for value in db.scalars(select(model.id).where(*conditions)).all())


def _status_feed_ids(
    db: Session,
    *,
    order_ids: list[int],
    event_ids: list[int],
    management_ids: list[int],
    plan_ids: list[int],
    review_ids: list[int],
) -> list[int]:
    pairs = {
        "paper_order": order_ids,
        "trade_event": event_ids,
        "position_management_review": management_ids,
        "trade_plan": plan_ids,
        "ai_review": review_ids,
    }
    clauses = [
        (TraderStatusFeedRecord.source_type == source_type) & (TraderStatusFeedRecord.source_id.in_(source_ids))
        for source_type, source_ids in pairs.items()
        if source_ids
    ]
    feed_ids = set(
        int(value)
        for value in db.scalars(select(TraderStatusFeedRecord.id).where(or_(*clauses))).all()
    ) if clauses else set()
    while feed_ids:
        descendants = set(
            int(value)
            for value in db.scalars(
                select(TraderStatusFeedRecord.id).where(
                    TraderStatusFeedRecord.source_type == AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED,
                    TraderStatusFeedRecord.source_id.in_(feed_ids),
                )
            ).all()
        )
        expanded = feed_ids | descendants
        if expanded == feed_ids:
            break
        feed_ids = expanded
    return sorted(feed_ids)


def _translation_ids(
    db: Session,
    *,
    feed_ids: list[int],
    management_ids: list[int],
    review_ids: list[int],
) -> list[int]:
    pairs = {
        AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED: feed_ids,
        AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT: management_ids,
        AI_TRANSLATION_SOURCE_AI_REVIEW: review_ids,
    }
    clauses = [
        (AITranslationCacheRecord.source_type == source_type) & (AITranslationCacheRecord.source_id.in_(source_ids))
        for source_type, source_ids in pairs.items()
        if source_ids
    ]
    if not clauses:
        return []
    return sorted(int(value) for value in db.scalars(select(AITranslationCacheRecord.id).where(or_(*clauses))).all())


def _execute_cleanup_graph(db: Session, graph: dict[str, list[int]]) -> None:
    order_ids = graph[PaperOrderRecord.__tablename__]
    review_ids = graph[PositionManagementReviewRecord.__tablename__]
    run_ids = graph[TraderRunLogRecord.__tablename__]
    if order_ids:
        db.execute(
            update(PaperPositionRecord)
            .where(PaperPositionRecord.order_id.in_(order_ids))
            .values(order_id=None)
        )
        db.execute(
            update(TradeEventRecord)
            .where(TradeEventRecord.order_id.in_(order_ids), TradeEventRecord.position_id.is_not(None))
            .values(order_id=None)
        )
        db.execute(
            update(PositionManagementReviewRecord)
            .where(
                PositionManagementReviewRecord.order_id.in_(order_ids),
                PositionManagementReviewRecord.position_id.is_not(None),
            )
            .values(order_id=None)
        )
    if review_ids:
        db.execute(
            update(TraderAgentStateRecord)
            .where(TraderAgentStateRecord.last_review_id.in_(review_ids))
            .values(last_review_id=None)
        )
    if run_ids:
        db.execute(
            update(TraderRunLogRecord)
            .where(TraderRunLogRecord.id.in_(run_ids))
            .values(candidate_trade_id=None, ai_review_id=None, trade_plan_id=None)
        )
    delete_order = (
        TelegramAlertDeliveryRecord,
        AITranslationCacheRecord,
        TraderStatusFeedRecord,
        PositionManagementReviewRecord,
        TradeEventRecord,
        ObservationCandidateRecord,
        PaperOrderRecord,
        TradePlanRecord,
        AIReviewRecord,
        CandidateTradeRecord,
        TraderRunLogRecord,
    )
    for model in delete_order:
        ids = graph[model.__tablename__]
        if ids:
            db.execute(delete(model).where(model.id.in_(ids)))
    db.flush()
