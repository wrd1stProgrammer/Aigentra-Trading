import type { TraderScenario } from "@/lib/league";

type ScenarioDedupeShape = {
  id: string;
  source: string;
  createdAt?: string | null;
  title?: string | null;
  status?: string | null;
  action?: string | null;
  eventType?: string | null;
  side?: string | null;
  price?: number | null;
  phase?: string | null;
  rationale?: string | null;
  summary?: string | null;
  reviewBrief?: {
    title?: string | null;
    headline?: string | null;
    action?: string | null;
    keyReasons?: readonly string[] | null;
    risks?: readonly string[] | null;
    watchConditions?: readonly string[] | null;
    managerNote?: string | null;
  } | null;
};

export function dedupeScenarioTimelineScenarios(scenarios: readonly TraderScenario[]): TraderScenario[] {
  const seenKeys = new Set<string>();
  const deduped: TraderScenario[] = [];

  for (const scenario of scenarios) {
    if (isPassivePendingHeartbeatPairedWithPosition(scenario, scenarios)) continue;
    const key = scenarioTimelineDedupeKey(scenario);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const contentKey = scenarioTimelineContentDedupeKey(scenario);
    if (contentKey && seenKeys.has(contentKey)) continue;
    if (contentKey) seenKeys.add(contentKey);
    deduped.push(scenario);
  }

  return deduped;
}

export function scenarioTimelineDedupeKey(scenario: ScenarioDedupeShape): string {
  if (scenario.source === "review") {
    if (scenario.id !== undefined && scenario.id !== null && scenario.id !== "") {
      return `review:${scenario.id}`;
    }
    if (scenario.createdAt) {
      const timeKey = new Date(scenario.createdAt).getTime();
      if (!Number.isNaN(timeKey)) {
        const roundedTime = Math.round(timeKey / 60000) * 60000;
        // Round price to nearest $50 bucket so split orders at same price collapse
        const priceBucket = scenario.price != null && Number.isFinite(scenario.price)
          ? Math.round(scenario.price / 50) * 50
          : "noprice";
        const phaseKey = scenario.phase ?? "";
        return `review-deduped-${roundedTime}-${phaseKey}-${scenario.side ?? ""}-${priceBucket}`;
      }
    }
  }
  return `${scenario.source}:${scenario.id}`;
}

export function scenarioTimelineContentDedupeKey(scenario: ScenarioDedupeShape): string | null {
  if (scenario.source !== "review") return null;
  const content = normalizeContent(
    [
      scenario.reviewBrief?.title,
      scenario.reviewBrief?.headline,
      scenario.reviewBrief?.action,
      ...(scenario.reviewBrief?.keyReasons ?? []),
      ...(scenario.reviewBrief?.risks ?? []),
      ...(scenario.reviewBrief?.watchConditions ?? []),
      scenario.reviewBrief?.managerNote,
      scenario.rationale,
      scenario.summary,
    ].join(" ")
  );
  if (content.length < 48) return null;
  return [
    "review-content",
    normalizeToken(scenario.phase),
    normalizeToken(scenario.eventType).replace(/_\\d+$/, ""),
    normalizeToken(scenario.action || scenario.status),
    normalizeToken(scenario.side),
    content,
  ].join(":");
}

function isPassivePendingHeartbeatPairedWithPosition(
  scenario: ScenarioDedupeShape,
  scenarios: readonly ScenarioDedupeShape[]
): boolean {
  if (scenario.source !== "review") return false;
  if (!isPendingHeartbeat(scenario)) return false;
  if (!isHoldReview(scenario)) return false;
  const scenarioTime = timestampMs(scenario.createdAt);
  if (scenarioTime === null) return false;
  return scenarios.some((candidate) => {
    if (candidate === scenario) return false;
    if (!isPositionHeartbeat(candidate)) return false;
    if (!isHoldReview(candidate)) return false;
    if (scenario.side && candidate.side && String(scenario.side).toUpperCase() !== String(candidate.side).toUpperCase()) {
      return false;
    }
    const candidateTime = timestampMs(candidate.createdAt);
    if (candidateTime === null) return false;
    if (Math.abs(candidateTime - scenarioTime) > 120000) return false;
    return priceBucket(candidate.price) === priceBucket(scenario.price);
  });
}

function isPendingHeartbeat(scenario: ScenarioDedupeShape): boolean {
  return normalizeToken(scenario.phase).includes("PENDING_ORDER") && normalizeToken(scenario.eventType).endsWith("PENDING_HEARTBEAT");
}

function isPositionHeartbeat(scenario: ScenarioDedupeShape): boolean {
  return (
    scenario.source === "review" &&
    normalizeToken(scenario.phase).includes("OPEN_POSITION") &&
    normalizeToken(scenario.eventType).endsWith("POSITION_HEARTBEAT")
  );
}

function isHoldReview(scenario: ScenarioDedupeShape): boolean {
  const action = normalizeToken(scenario.action);
  const status = normalizeToken(scenario.status);
  return action === "HOLD" || (!action && status === "HOLD");
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function priceBucket(value: number | null | undefined): number | "noprice" {
  return value != null && Number.isFinite(value) ? Math.round(value / 50) * 50 : "noprice";
}

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/[-\s]+/g, "_").toUpperCase();
}

function normalizeContent(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}
