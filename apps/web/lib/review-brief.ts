import type { StructuredReview } from "@/lib/api";

export type ReviewBrief = {
  title: string | null;
  verdict: string | null;
  headline: string | null;
  action: string | null;
  keyReasons: string[];
  risks: string[];
  watchConditions: string[];
  managerNote: string | null;
};

const ENTRY_TRIGGER_PATTERNS: readonly RegExp[] = [
  /트리거|확인|체결|반등|되돌림|조정|회복|돌파|재테스트|거부|눌림|평균\s*구역|채널|추세|스윕|흡수|임밸런스|\b(?:VWAP|EMA|RSI)\b|funding|open interest|trigger|confirmation|retest|reclaim|breakout|pullback|sweep|absorption|imbalance|trend|channel/i
];

const ENTRY_CONTEXT_PATTERNS: readonly RegExp[] = [
  /진입|entry/i
];

const RISK_CONTROL_PATTERNS: readonly RegExp[] = [
  /레버리지|위험|손절|익절|목표|수수료|손익비|보상률|리스크|규모|크기|무효화|청산|LIMIT|limit|leverage|risk|stop|target|take[-\s]?profit|fee|RR|reward|invalidation|size/i
];

const ENTRY_DECISION_PREFIX_PATTERNS: readonly RegExp[] = [
  /^\s*(?:APPROVE|ADJUST_AND_APPROVE|DEFER|REJECT|NEEDS_MORE_DATA)\s*[:：\-–]\s*/i,
  /^\s*(?:approved entry|adjusted approval|approval|defer|reject|needs more data)\s*[:：\-–]\s*/i,
  /^\s*(?:승인|조정\s*후\s*승인|보류|거절|추가\s*확인)\s*[:：\-–]\s*/i
];

const ENTRY_MANAGEMENT_ONLY_PATTERNS: readonly RegExp[] = [
  /현재\s*포지션|포지션\s*유지|다음\s*리뷰|계속\s*관찰|관리\s*판단|미실현\s*손익|current position|already open position|keep holding|holding\b.*\bopen position|maintain the position|hold the position|continue monitoring|next review|pnl management/i
];

export function normalizeStructuredReview(value: unknown): ReviewBrief | null {
  const record = recordValue(value);
  if (!record) return null;
  const brief: ReviewBrief = {
    title: textValue(record.title),
    verdict: textValue(record.verdict),
    headline: textValue(record.headline),
    action: textLine(record.action, 3),
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
  const embeddedReviewIsDisplayable = embeddedAiReviewStructuredReviewIsDisplayable(record, payload);
  return firstStructuredReview(
    record?.structuredReview,
    nestedReview?.structuredReview,
    embeddedReviewIsDisplayable ? payload?.aiStructuredReview : null,
    embeddedReviewIsDisplayable ? payloadAiReview?.structuredReview : null
  );
}

export function entryApprovalBriefFromRecord(value: unknown): ReviewBrief | null {
  const record = recordValue(value);
  const payload = recordValue(record?.payload);
  const payloadAiReview = recordValue(payload?.aiReview);
  const embeddedReviewIsDisplayable = embeddedAiReviewStructuredReviewIsDisplayable(record, payload);
  return cleanEntryApprovalBrief(firstStructuredReview(
    embeddedReviewIsDisplayable ? payload?.aiStructuredReview : null,
    embeddedReviewIsDisplayable ? payloadAiReview?.structuredReview : null
  ));
}

export function cleanEntryApprovalRationale(value: unknown): string | null {
  return cleanEntryApprovalCopy(textValue(value));
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

export function entryRationaleItems(brief: ReviewBrief): string[] {
  const candidates = [...brief.keyReasons, brief.action].filter((item): item is string => Boolean(item?.trim()));
  const entryEvidence = candidates.filter(isEntryEvidence);
  if (entryEvidence.length) return uniqueStrings(entryEvidence).slice(0, 2);

  const nonRiskCopy = candidates.filter((item) => !isRiskControlOnly(item));
  const fallback = nonRiskCopy.length ? nonRiskCopy : candidates;
  return uniqueStrings(fallback).slice(0, 2);
}

export function structuredReviewValue(value: StructuredReview | null | undefined): ReviewBrief | null {
  return normalizeStructuredReview(value);
}

function hasBriefContent(brief: ReviewBrief) {
  return Boolean(
    brief.verdict ||
      brief.title ||
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

function isEntryEvidence(value: string): boolean {
  return ENTRY_TRIGGER_PATTERNS.some((pattern) => pattern.test(value)) || (ENTRY_CONTEXT_PATTERNS.some((pattern) => pattern.test(value)) && !isRiskControlOnly(value));
}

function isRiskControlOnly(value: string): boolean {
  return RISK_CONTROL_PATTERNS.some((pattern) => pattern.test(value)) && !ENTRY_TRIGGER_PATTERNS.some((pattern) => pattern.test(value));
}

function cleanEntryApprovalBrief(brief: ReviewBrief | null): ReviewBrief | null {
  if (!brief) return null;
  const clean: ReviewBrief = {
    ...brief,
    title: cleanEntryApprovalCopy(brief.title),
    headline: cleanEntryApprovalCopy(brief.headline),
    action: cleanEntryApprovalCopy(brief.action),
    keyReasons: brief.keyReasons.map(cleanEntryApprovalCopy).filter((item): item is string => Boolean(item)),
    risks: brief.risks.map(cleanEntryApprovalCopy).filter((item): item is string => Boolean(item)),
    watchConditions: brief.watchConditions.map(cleanEntryApprovalCopy).filter((item): item is string => Boolean(item)),
    managerNote: cleanEntryApprovalCopy(brief.managerNote)
  };
  return hasBriefContent(clean) ? clean : null;
}

function cleanEntryApprovalCopy(value: string | null): string | null {
  if (!value) return null;
  let clean = stripBulletPrefix(value);
  for (const pattern of ENTRY_DECISION_PREFIX_PATTERNS) {
    clean = clean.replace(pattern, "");
  }
  clean = clean.trim();
  if (!clean) return null;
  if (isManagementOnlyEntryCopy(clean)) return null;
  return clean;
}

function isManagementOnlyEntryCopy(value: string): boolean {
  return ENTRY_MANAGEMENT_ONLY_PATTERNS.some((pattern) => pattern.test(value)) && !isEntryEvidence(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }
  return unique;
}

function textLine(value: unknown, limit: number): string | null {
  const items = textList(value, limit);
  if (items.length) return items.join(" ");
  return textValue(value);
}

function textList(value: unknown, limit: number): string[] {
  const values = Array.isArray(value) ? value : literalStringList(value) ?? (typeof value === "string" ? splitTextLines(value) : []);
  return values
    .map((item) => stripBulletPrefix(textValue(item) ?? ""))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit);
}

function splitTextLines(value: string): string[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 ? lines : [value];
}

function literalStringList(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean.startsWith("[") || !clean.endsWith("]")) return null;
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // Python-style single quoted arrays are common in legacy AI responses; parse those below.
  }
  const matches = clean.match(/(['"])(.*?)\1/g);
  if (!matches?.length) return null;
  return matches.map((item) => item.slice(1, -1));
}

function stripBulletPrefix(value: string): string {
  let clean = value.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of ["- ", "• ", "* "]) {
      if (clean.startsWith(prefix)) {
        clean = clean.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return clean;
}

function embeddedAiReviewStructuredReviewIsDisplayable(record: Record<string, unknown> | null, payload: Record<string, unknown> | null): boolean {
  const translation = recordValue(record?.translation) ?? recordValue(payload?.translation);
  const embeddedAiReview = recordValue(translation?.embeddedAiReview);
  if (!embeddedAiReview) return true;
  const status = textValue(embeddedAiReview.status)?.toLowerCase();
  if (!status) return true;
  return status === "ok" || status === "canonical" || status === "fallback" || status === "missing" || status === "error" || status === "failed";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}
