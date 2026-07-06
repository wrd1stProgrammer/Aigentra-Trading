from typing import Any, Final, Optional

from app.traders.models import TradeReviewResult


ENTRY_REVIEW_PAYLOAD_KEYS: Final[tuple[str, ...]] = (
    "aiReview",
    "aiReviewDecision",
    "aiReviewConfidence",
    "aiRiskLevel",
    "aiReviewSourceLocale",
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
    structured_review = review.structuredReview.model_dump() if review.structuredReview else None
    review_payload = {
        "decision": review.decision,
        "confidence": review.confidence,
        "riskLevel": review.riskLevel,
        "sourceLocale": review.sourceLocale,
        "reviewCode": review.reviewCode,
        "reviewFacts": [fact.model_dump() for fact in review.reviewFacts],
        "riskFlags": review.riskFlags,
        "structuredReview": structured_review,
        "adjustments": review.adjustments,
        "approvalReason": review.approvalReason,
        "counterThesis": review.counterThesis,
        "provider": review.provider,
        "model": review.model,
        "fallback": review.fallback,
    }
    return {
        "aiReview": review_payload,
        "aiReviewDecision": review.decision,
        "aiReviewConfidence": review.confidence,
        "aiRiskLevel": review.riskLevel,
        "aiReviewSourceLocale": review.sourceLocale,
        "aiReviewCode": review.reviewCode,
        "aiReviewFacts": [fact.model_dump() for fact in review.reviewFacts],
        "aiRiskFlags": review.riskFlags,
        "aiStructuredReview": structured_review,
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
