import type { StructuredReview } from "@/lib/api";

export type ReviewBrief = {
  verdict: string | null;
  headline: string | null;
  action: string | null;
  keyReasons: string[];
  risks: string[];
  watchConditions: string[];
  managerNote: string | null;
};

export function normalizeStructuredReview(value: unknown): ReviewBrief | null {
  const record = recordValue(value);
  if (!record) return null;
  const brief: ReviewBrief = {
    verdict: textValue(record.verdict),
    headline: textValue(record.headline),
    action: textValue(record.action),
    keyReasons: textList(record.keyReasons, 3),
    risks: textList(record.risks, 2),
    watchConditions: textList(record.watchConditions, 3),
    managerNote: textValue(record.managerNote)
  };
  return hasBriefContent(brief) ? brief : null;
}

export function firstStructuredReview(...values: unknown[]): ReviewBrief | null {
  for (const value of values) {
    const brief = normalizeStructuredReview(value);
    if (brief) return brief;
  }
  return null;
}

export function reviewBriefFromRecord(value: unknown): ReviewBrief | null {
  const record = recordValue(value);
  const payload = recordValue(record?.payload);
  const nestedReview = recordValue(record?.review) ?? recordValue(payload?.review);
  const payloadAiReview = recordValue(payload?.aiReview);
  return firstStructuredReview(
    record?.structuredReview,
    nestedReview?.structuredReview,
    payload?.aiStructuredReview,
    payloadAiReview?.structuredReview
  );
}

export function reviewBriefText(brief: ReviewBrief | null): string | null {
  if (!brief) return null;
  const parts = [
    brief.headline,
    brief.action,
    ...brief.keyReasons.slice(0, 2),
    ...brief.watchConditions.slice(0, 1)
  ].filter((item): item is string => Boolean(item));
  return parts.length ? parts.join(" ") : null;
}

export function structuredReviewValue(value: StructuredReview | null | undefined): ReviewBrief | null {
  return normalizeStructuredReview(value);
}

function hasBriefContent(brief: ReviewBrief) {
  return Boolean(
    brief.verdict ||
      brief.headline ||
      brief.action ||
      brief.keyReasons.length ||
      brief.risks.length ||
      brief.watchConditions.length ||
      brief.managerNote
  );
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(textValue)
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
