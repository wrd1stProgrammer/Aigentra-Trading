import type { TraderScenario } from "@/lib/league";

type ScenarioDedupeShape = {
  id: string;
  source: string;
  createdAt?: string | null;
  title?: string | null;
  status?: string | null;
  side?: string | null;
};

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
  if (scenario.source === "review") {
    if (scenario.createdAt) {
      const timeKey = new Date(scenario.createdAt).getTime();
      if (!Number.isNaN(timeKey)) {
        const roundedTime = Math.round(timeKey / 60000) * 60000;
        return `review-deduped-${roundedTime}-${scenario.title ?? ""}-${scenario.status ?? ""}-${scenario.side ?? ""}`;
      }
    }
  }
  return `${scenario.source}:${scenario.id}`;
}
