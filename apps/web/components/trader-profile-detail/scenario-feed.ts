import type { ManagementReview } from "@/lib/api";
import type { TraderScenario } from "@/lib/league";
import type { ReviewBrief } from "@/lib/review-brief";
import { reviewBriefFromRecord } from "@/lib/review-brief";
import { cleanReviewDisplayItems, cleanReviewDisplayText } from "@/lib/review-display";
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
      {
        const briefText = managementReviewTimelineBody(scenario.reviewBrief ?? reviewBriefFromRecord(matchingReview), { omitHeadline: true });
        if (briefText) return localizedTimelineText(briefText);
      }
      if (matchingReview?.rationale) return localizedTimelineText(matchingReview.rationale);
      if (Array.isArray(matchingReview?.reviewFacts) && matchingReview.reviewFacts.length) {
        return matchingReview.reviewFacts.map((fact) => t(fact.labelKey ?? `reviewFact.${fact.code}`)).join(", ");
      }
      return localizedTimelineText(scenario.summary ?? scenario.rationale);
    case "position":
    case "order":
      {
        const briefText = managementReviewTimelineBody(scenario.reviewBrief ?? null, { omitHeadline: true });
        if (briefText) return localizedTimelineText(briefText);
      }
      return localizedTimelineText(scenarioDetailRationaleText(scenario, t));
    case "event":
    case "strategy":
      return localizedTimelineText(scenario.rationale ?? scenario.summary);
  }
}

function localizedTimelineText(value: string | null | undefined) {
  const text = cleanReviewDisplayText(value);
  if (!text) return "-";
  return text;
}

function managementReviewTimelineBody(brief: ReviewBrief | null, options: { omitHeadline?: boolean } = {}) {
  if (!brief) return null;
  const includeHeadline = !options.omitHeadline || Boolean(brief.title);
  const parts = cleanReviewDisplayItems([
    includeHeadline ? brief.headline : null,
    brief.action,
    ...brief.keyReasons.slice(0, 2),
    ...brief.risks.slice(0, 1),
    ...brief.watchConditions.slice(0, 1),
    brief.managerNote
  ]);
  return cleanReviewDisplayText(parts.join(" ")) || null;
}

function hasSavedAiApproval(scenario: TraderScenario): boolean {
  if (typeof scenario.rationale === "string" && scenario.rationale.trim().length > 0) return true;
  const brief = scenario.reviewBrief;
  return Boolean(
    brief?.title ||
      brief?.headline ||
      brief?.action ||
      brief?.managerNote ||
      brief?.keyReasons?.length ||
      brief?.risks?.length ||
      brief?.watchConditions?.length
  );
}
