import type { TraderScenario } from "@/lib/league";

type ScenarioDedupeShape = Pick<TraderScenario, "id" | "source" | "eventType" | "action" | "phase" | "side" | "status" | "title">;

export function dedupeScenarioTimelineScenarios(scenarios: readonly TraderScenario[]): TraderScenario[] {
  const seenKeys = new Set<string>();
  const deduped: TraderScenario[] = [];

  for (const scenario of scenarios) {
    const key = scenarioTimelineDedupeKey(scenario);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(scenario);
  }

  return deduped;
}

export function scenarioTimelineDedupeKey(scenario: ScenarioDedupeShape): string {
  if (scenario.source !== "review") return `${scenario.source}:${scenario.id}`;

  const phase = normalizeScenarioToken(scenario.phase);
  const eventType = normalizeScenarioToken(scenario.eventType ?? scenario.title);
  const action = normalizeScenarioToken(scenario.action ?? scenario.status);
  const side = normalizeScenarioToken(scenario.side);

  if (!phase && !eventType && !action && !side) return `review:${scenario.id}`;
  return ["review", phase, eventType, action, side].join("|");
}

function normalizeScenarioToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}
