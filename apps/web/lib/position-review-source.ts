import type { PaperPosition } from "@/lib/api";

export function selectMergedPositionReviewSource(positions: readonly PaperPosition[]): PaperPosition {
  return [...positions].sort((left, right) => {
    const reviewDelta = entryApprovalScore(right) - entryApprovalScore(left);
    if (reviewDelta !== 0) return reviewDelta;
    return positionTimeValue(right) - positionTimeValue(left);
  })[0] ?? positions[0];
}

function entryApprovalScore(position: PaperPosition): number {
  const payload = recordValue(position.payload);
  const payloadAiReview = recordValue(payload?.aiReview);
  if (
    payload?.aiStructuredReview ||
    textValue(payload?.aiApprovalReason) ||
    textValue(payloadAiReview?.approvalReason) ||
    textValue(payload?.approvalReason)
  ) {
    return 2;
  }

  const nestedReview = recordValue(position.review) ?? recordValue(payload?.review);
  if (!position.structuredReview && !nestedReview && (textValue(position.rationale) || textValue(position.reason))) {
    return 1;
  }

  return 0;
}

function positionTimeValue(position: PaperPosition): number {
  const value = position.updatedAt ?? position.openedAt ?? position.createdAt ?? position.created_at;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
