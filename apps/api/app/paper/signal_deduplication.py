from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import ObservationCandidateRecord
from app.repositories import from_json


APPROVED_OBSERVATION_STATUSES = {"approved"}


def candidate_signal_fingerprint(
    snapshot: dict[str, Any],
    *,
    trader_id: str,
    symbol: str,
    setup_type: str | None,
    side: str | None,
) -> str | None:
    completed = snapshot.get("timeframes", {}).get("15m", {}).get("completedCandle")
    if not isinstance(completed, dict):
        return None
    close_time = completed.get("closeTime")
    if close_time is None or not setup_type or not side:
        return None
    try:
        normalized_close_time = int(float(close_time))
    except (TypeError, ValueError):
        return None
    return ":".join(
        (
            trader_id,
            symbol.upper(),
            str(setup_type).upper(),
            str(side).upper(),
            str(normalized_close_time),
        )
    )


def attach_candidate_signal_fingerprint(
    candidate: Any,
    snapshot: dict[str, Any],
    *,
    trader_id: str,
    symbol: str,
) -> str | None:
    fingerprint = candidate_signal_fingerprint(
        snapshot,
        trader_id=trader_id,
        symbol=symbol,
        setup_type=getattr(candidate, "setupType", None),
        side=getattr(candidate, "side", None),
    )
    if fingerprint is not None:
        audit = getattr(candidate, "audit", None)
        if not isinstance(audit, dict):
            audit = {}
            candidate.audit = audit
        audit["signalFingerprint"] = fingerprint
    return fingerprint


def observation_signal_fingerprint(record: ObservationCandidateRecord) -> str | None:
    payload = from_json(record.payload_json) or {}
    candidate = payload.get("candidate") if isinstance(payload, dict) else None
    audit = candidate.get("audit") if isinstance(candidate, dict) else None
    value = audit.get("signalFingerprint") if isinstance(audit, dict) else None
    return str(value) if value else None


def latest_reviewed_signal_fingerprint(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
) -> str | None:
    record = db.execute(
        select(ObservationCandidateRecord)
        .where(
            ObservationCandidateRecord.trader_id == trader_id,
            ObservationCandidateRecord.symbol == symbol,
            ObservationCandidateRecord.status.in_(APPROVED_OBSERVATION_STATUSES),
        )
        .order_by(desc(ObservationCandidateRecord.created_at), desc(ObservationCandidateRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    return observation_signal_fingerprint(record) if record is not None else None
