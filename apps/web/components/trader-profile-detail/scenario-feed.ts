import type { ManagementReview } from "@/lib/api";
import type { TraderScenario } from "@/lib/league";
import { dedupeScenarioTimelineScenarios } from "@/components/trader-profile-detail/scenario-dedupe";
import { scenarioDetailRationaleText } from "@/components/trader-profile-detail/scenario-copy";
import type { Translator } from "@/components/trader-profile-detail/types";

export function latestScenarioFeedScenarios(scenarios: readonly TraderScenario[]): TraderScenario[] {
  return dedupeScenarioTimelineScenarios(scenarios.filter(isLatestScenarioFeedScenario));
}

export function isLatestScenarioFeedScenario(scenario: TraderScenario): boolean {
  switch (scenario.source) {
    case "review":
      return true;
    case "position":
      return hasSavedAiApproval(scenario);
    case "order":
    case "event":
    case "strategy":
      return false;
  }
}

export function scenarioTimelineBody(scenario: TraderScenario, matchingReview: ManagementReview | undefined, t: Translator): string {
  switch (scenario.source) {
    case "review":
      if (matchingReview?.rationale) return matchingReview.rationale;
      if (Array.isArray(matchingReview?.reviewFacts) && matchingReview.reviewFacts.length) {
        return matchingReview.reviewFacts.map((fact) => t(fact.labelKey ?? `reviewFact.${fact.code}`)).join(", ");
      }
      return scenario.summary ?? scenario.rationale ?? "-";
    case "position":
    case "order":
      return scenarioDetailRationaleText(scenario, t);
    case "event":
    case "strategy":
      return scenario.rationale ?? scenario.summary ?? "-";
  }
}

function hasSavedAiApproval(scenario: TraderScenario): boolean {
  return typeof scenario.rationale === "string" && scenario.rationale.trim().length > 0;
}
