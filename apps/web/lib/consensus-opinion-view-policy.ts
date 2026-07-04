export type CompactOpinionInsight = {
  readonly label: string;
  readonly item: string;
  readonly tone: "good" | "warn" | "neutral";
};

export function compactOpinionInsights(input: {
  readonly drivers?: readonly string[];
  readonly risks?: readonly string[];
  readonly watch?: readonly string[];
  readonly driverLabel: string;
  readonly riskLabel: string;
  readonly watchLabel: string;
  readonly emptyDriver: string;
  readonly emptyRisk: string;
  readonly emptyWatch: string;
}): readonly CompactOpinionInsight[] {
  return [
    { label: input.driverLabel, item: firstCompactItem(input.drivers, input.emptyDriver), tone: "good" },
    { label: input.riskLabel, item: firstCompactItem(input.risks, input.emptyRisk), tone: "warn" },
    { label: input.watchLabel, item: firstCompactItem(input.watch, input.emptyWatch), tone: "neutral" },
  ];
}

export function compactItems(items: readonly string[] | undefined, empty: string, limit: number) {
  const values = items?.map(stripEvidenceCitation).filter((item) => item.length > 0).slice(0, limit) ?? [];
  return values.length > 0 ? values : [empty];
}

export type CompactOpinionBriefInput = {
  readonly brief?: {
    readonly conclusion?: string | null;
    readonly reason?: string | null;
    readonly watch?: string | null;
  } | null;
  readonly headline?: string | null;
  readonly summary?: string | null;
  readonly action?: string | null;
  readonly watchConditions?: readonly string[] | null;
};

export function compactOpinionBriefLines(input: CompactOpinionBriefInput): readonly string[] {
  const candidates = [
    input.brief?.conclusion,
    input.brief?.reason,
    input.brief?.watch,
    input.headline,
    input.summary,
    input.action,
    input.watchConditions?.[0],
  ];
  const lines: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const clean = stripEvidenceCitation(candidate);
    if (!clean || lines.includes(clean)) continue;
    lines.push(clean);
    if (lines.length >= 3) break;
  }
  return lines;
}

export function stripEvidenceCitation(value: string) {
  return value
    .replace(/\s*(출처|Sources?|sourceRef|Evidence):\s*[^.。]+[.。]?$/iu, "")
    .replace(/\s*\([^)]*(position|order|review|trade_event|closed_position):[^)]*\)$/iu, "")
    .trim();
}

export function compactLongShortContext(value: string) {
  const cleanValue = stripEvidenceCitation(value);
  return cleanValue.split(/[,.，。]/, 1)[0]?.trim() || cleanValue || value;
}

function firstCompactItem(items: readonly string[] | undefined, empty: string) {
  return compactItems(items, empty, 1)[0] ?? empty;
}
