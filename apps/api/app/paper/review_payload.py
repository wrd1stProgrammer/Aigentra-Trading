from typing import Any, Final, Optional

from app.traders.models import TradeReviewResult


ENTRY_REVIEW_PAYLOAD_KEYS: Final[tuple[str, ...]] = (
    "aiReviewDecision",
    "aiReviewConfidence",
    "aiRiskLevel",
    "aiReviewCode",
    "aiReviewFacts",
    "aiRiskFlags",
    "aiStructuredReview",
    "aiAdjustments",
    "aiApprovalReason",
    "aiCounterThesis",
    "aiProvider",
    "aiModel",
    "aiFallback",
)


def review_payload_fields(review: Optional[TradeReviewResult]) -> dict[str, Any]:
    if review is None:
        return {}
    return {
        "aiReviewDecision": review.decision,
        "aiReviewConfidence": review.confidence,
        "aiRiskLevel": review.riskLevel,
        "aiReviewCode": review.reviewCode,
        "aiReviewFacts": [fact.model_dump() for fact in review.reviewFacts],
        "aiRiskFlags": review.riskFlags,
        "aiStructuredReview": review.structuredReview.model_dump() if review.structuredReview else None,
        "aiAdjustments": review.adjustments,
        "aiApprovalReason": review.approvalReason,
        "aiCounterThesis": review.counterThesis,
        "aiProvider": review.provider,
        "aiModel": review.model,
        "aiFallback": review.fallback,
    }


def review_payload_subset(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return {key: payload[key] for key in ENTRY_REVIEW_PAYLOAD_KEYS if key in payload}
