export type OverviewReviewSource = "entry_review" | "management_review";

export type OverviewReviewRecord = Record<string, unknown> & {
  overviewSource?: OverviewReviewSource;
};

const ENTRY_OVERVIEW_DECISIONS = new Set(["APPROVE", "ADJUST_AND_APPROVE", "APPROVED"]);
const MANAGEMENT_OVERVIEW_DECISIONS = new Set([
  "HOLD",
  "LET_PROFIT_RUN",
  "MOVE_STOP",
  "MOVE_STOP_TO_BREAKEVEN",
  "TRAIL_STOP",
  "TAKE_PARTIAL_PROFIT",
  "PARTIAL_TAKE_PROFIT",
  "REDUCE_RISK",
  "REDUCE_SIZE",
  "CLOSE_POSITION",
  "CANCEL_PENDING_ORDER",
  "CANCEL_REMAINING_ORDERS",
  "ADJUST_PENDING_ORDER",
  "ADD_TO_POSITION",
  "PYRAMID_POSITION"
]);
const HIDDEN_OVERVIEW_DECISIONS = new Set(["REJECT", "REJECTED", "DEFER", "NEEDS_MORE_DATA"]);
const OK_REVIEW_STATUSES = new Set(["", "OK", "SUCCESS", "COMPLETED"]);
const PROVIDER_FAILURE_FLAGS = new Set(["PROVIDER_FAILED", "PROVIDER_FAILURE", "PROVIDER_ERROR"]);
const PROVIDER_FAILURE_TEXT = ["position management provider failed", "provider failed", "provider error"];

export function isDisplayableOverviewReview(review: OverviewReviewRecord) {
  const traderId = String(review.traderId ?? review.trader_id ?? "");
  const createdAt = String(review.createdAt ?? review.created_at ?? "");
  if (!traderId || !createdAt) return false;

  const source = normalizeReviewToken(review.source ?? review.type ?? review.eventType ?? review.event_type);
  if (source.includes("SCAN") || source.includes("PLAN")) return false;
  if (hasProviderFailureSignal(review)) return false;

  const decision = overviewReviewDecision(review);
  if (!decision || HIDDEN_OVERVIEW_DECISIONS.has(decision)) return false;
  if (review.overviewSource === "entry_review") return ENTRY_OVERVIEW_DECISIONS.has(decision);
  if (review.overviewSource === "management_review") return MANAGEMENT_OVERVIEW_DECISIONS.has(decision);
  return false;
}

export function overviewReviewDecision(review: OverviewReviewRecord) {
  const payload = recordValue(review.payload);
  const nestedReview = recordValue(review.review) ?? recordValue(payload?.review);
  const event = recordValue(review.event) ?? recordValue(payload?.event);
  const aiReview = recordValue(payload?.aiReview);
  return firstReviewToken([
    review.decision,
    review.action,
    review.actionType,
    review.action_type,
    nestedReview?.decision,
    nestedReview?.action,
    nestedReview?.actionType,
    nestedReview?.action_type,
    aiReview?.decision,
    aiReview?.action,
    aiReview?.actionType,
    aiReview?.action_type,
    payload?.decision,
    payload?.action,
    payload?.actionType,
    payload?.action_type,
    event?.decision,
    event?.suggestedAction,
    event?.actionType,
    event?.action_type
  ]);
}

function hasProviderFailureSignal(review: OverviewReviewRecord) {
  const payload = recordValue(review.payload);
  const nestedReview = recordValue(review.review) ?? recordValue(payload?.review);
  const event = recordValue(review.event) ?? recordValue(payload?.event);
  const aiReview = recordValue(payload?.aiReview);

  const status = firstReviewToken([
    review.status,
    nestedReview?.status,
    payload?.status,
    aiReview?.status
  ]);
  if (status && !OK_REVIEW_STATUSES.has(status)) return true;

  const hasFailureFlag = [
    ...readStringList(review.riskFlags),
    ...readStringList(review.risk_flags),
    ...readStringList(nestedReview?.riskFlags),
    ...readStringList(nestedReview?.risk_flags),
    ...readStringList(payload?.riskFlags),
    ...readStringList(payload?.risk_flags),
    ...readStringList(aiReview?.riskFlags),
    ...readStringList(aiReview?.risk_flags)
  ].some((flag) => PROVIDER_FAILURE_FLAGS.has(normalizeReviewToken(flag)));
  if (hasFailureFlag) return true;

  const decision = overviewReviewDecision(review);
  const fallback = Boolean(review.fallback ?? nestedReview?.fallback ?? payload?.fallback ?? aiReview?.fallback);
  if (fallback && decision === "NEEDS_MORE_DATA") return true;

  const errorMessage = firstString([
    review.errorMessage,
    review.error_message,
    nestedReview?.errorMessage,
    nestedReview?.error_message,
    payload?.errorMessage,
    payload?.error_message,
    aiReview?.errorMessage,
    aiReview?.error_message
  ]);
  if (errorMessage) return true;

  const failureText = firstString([
    review.rationale,
    review.reason,
    nestedReview?.rationale,
    nestedReview?.reason,
    payload?.rationale,
    payload?.reason,
    aiReview?.rationale,
    aiReview?.reason,
    event?.reason
  ]).toLowerCase();
  return PROVIDER_FAILURE_TEXT.some((text) => failureText.includes(text));
}

function firstReviewToken(values: readonly unknown[]) {
  for (const value of values) {
    const normalized = normalizeReviewToken(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeReviewToken(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function firstString(values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}
