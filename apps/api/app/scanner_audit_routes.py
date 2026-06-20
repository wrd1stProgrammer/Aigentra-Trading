from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import FirstStageAuditReportRecord, ObservationCandidateRecord, get_db
from app.repositories import serialize_record


router = APIRouter(prefix="/api/scanner", tags=["scanner"])


@router.get("/audit-reports")
def list_first_stage_audit_reports(
    symbol: str = Query("BTCUSDT"),
    limit: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
) -> dict:
    records = db.execute(
        select(FirstStageAuditReportRecord)
        .where(FirstStageAuditReportRecord.symbol == symbol.upper())
        .order_by(desc(FirstStageAuditReportRecord.created_at), desc(FirstStageAuditReportRecord.id))
        .limit(limit)
    ).scalars().all()
    return {"symbol": symbol.upper(), "reports": [serialize_record(record) for record in records]}


@router.get("/observations")
def list_observation_candidates(
    symbol: str = Query("BTCUSDT"),
    trader_id: Optional[str] = Query(None),
    observation_type: Optional[str] = Query(None),
    limit: int = Query(80, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(ObservationCandidateRecord).where(ObservationCandidateRecord.symbol == symbol.upper())
    if trader_id:
        stmt = stmt.where(ObservationCandidateRecord.trader_id == trader_id)
    if observation_type:
        stmt = stmt.where(ObservationCandidateRecord.observation_type == observation_type.upper())
    records = db.execute(
        stmt.order_by(desc(ObservationCandidateRecord.created_at), desc(ObservationCandidateRecord.id)).limit(limit)
    ).scalars().all()
    return {"symbol": symbol.upper(), "observations": [serialize_record(record) for record in records]}
