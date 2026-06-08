import type { TraderScenario } from "@/lib/league";

type ScenarioDedupeShape = Pick<TraderScenario, "id" | "source">;

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
  return `${scenario.source}:${scenario.id}`;
}
