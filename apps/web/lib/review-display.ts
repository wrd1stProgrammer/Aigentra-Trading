const MAX_REVIEW_COPY_CHARS = 140;

const REVIEW_COPY_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/위험-보상/g, "손익비"],
  [/risk[-\s]?reward/gi, "risk/reward"],
  [/지오메트리/g, "가격 구조"],
  [/geometry/gi, "structure"],
  [/무효화\s*포인트/g, "실패 기준"],
  [/무효화\s*신호/g, "실패 신호"],
  [/무효화/g, "실패"],
  [/모니터링/g, "확인"],
  [/리워드/g, "보상"],
  [/;+/g, ". "],
  [/；+/g, ". "]
];

export function cleanReviewDisplayText(value: unknown, maxChars = MAX_REVIEW_COPY_CHARS) {
  if (typeof value !== "string") return "";
  let text = value
    .replace(/^\s*\[[A-Z_]+\]\s*/g, "")
    .replace(/^(?:리스크\s*심사\s*완료|관리\s*검토\s*완료|risk\s*review\s*complete|management\s*review\s*complete)[:：\s-]*/i, "")
    .trim();

  for (const [pattern, replacement] of REVIEW_COPY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\s*\.\s*\./g, ".")
    .replace(/\s*([,.!?])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();

  if (maxChars > 0 && text.length > maxChars) {
    return `${text.slice(0, maxChars - 1).trimEnd()}…`;
  }
  return text;
}

export function cleanReviewDisplayItems(items: readonly unknown[], maxChars = 120) {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of items) {
    const text = cleanReviewDisplayText(item, maxChars);
    const normalized = text.toLowerCase();
    if (!text || seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(text);
  }
  return cleaned;
}
