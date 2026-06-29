import type { PaperPosition } from "@/lib/api";

export function selectMergedPositionReviewSource(positions: readonly PaperPosition[]): PaperPosition {
  return [...positions].sort((left, right) => {
    const reviewDelta = Number(hasPositionReview(right)) - Number(hasPositionReview(left));
    if (reviewDelta !== 0) return reviewDelta;
    return positionTimeValue(right) - positionTimeValue(left);
  })[0] ?? positions[0];
}

function hasPositionReview(position: PaperPosition): boolean {
  const payload = recordValue(position.payload);
  const nestedReview = recordValue(position.review) ?? recordValue(payload?.review);
  const payloadAiReview = recordValue(payload?.aiReview);
  return Boolean(
    position.structuredReview ||
    nestedReview?.structuredReview ||
    payload?.aiStructuredReview ||
    payloadAiReview?.structuredReview ||
    textValue(position.rationale) ||
    textValue(position.reason) ||
    textValue(payload?.aiApprovalReason) ||
    textValue(payloadAiReview?.approvalReason) ||
    textValue(payload?.approvalReason)
  );
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
