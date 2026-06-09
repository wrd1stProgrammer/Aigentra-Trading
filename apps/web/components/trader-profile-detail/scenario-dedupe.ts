import type { TraderScenario } from "@/lib/league";

type ScenarioDedupeShape = {
  id: string;
  source: string;
  createdAt?: string | null;
  title?: string | null;
  status?: string | null;
  side?: string | null;
  price?: number | null;
  phase?: string | null;
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

