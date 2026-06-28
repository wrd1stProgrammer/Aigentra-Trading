from typing import Any, Optional

from app.ai.entry_approval_dossier_checks import build_data_checks, decision_gate, geometry_summary, review_focus
from app.ai.entry_approval_dossier_context import candidate_summary, context_summary, market_summary, trader_summary
from app.traders.models import TradeReviewPayload


def build_entry_approval_dossier(payload: TradeReviewPayload, reviewer_policy: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    geometry = geometry_summary(payload)
    data_checks, hard_blockers, warnings = build_data_checks(payload, geometry)
    dossier = {
        "trader": trader_summary(payload),
        "market": market_summary(payload),
        "candidate": candidate_summary(payload),
        "geometry": geometry,
        "context": context_summary(payload),
        "dataChecks": data_checks,
        "decisionGate": decision_gate(hard_blockers, warnings),
        "reviewFocus": review_focus(hard_blockers, warnings),
    }
    if reviewer_policy:
        dossier["strategyReviewerPolicy"] = reviewer_policy
    return dossier
