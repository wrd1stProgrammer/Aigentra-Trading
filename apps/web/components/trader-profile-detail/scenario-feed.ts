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
        const briefText = managementReviewTimelineBody(scenario.reviewBrief ?? reviewBriefFromRecord(matchingReview));
        if (briefText) return localizedTimelineText(briefText, scenario, t);
      }
      if (matchingReview?.rationale) return localizedTimelineText(matchingReview.rationale, scenario, t);
      if (Array.isArray(matchingReview?.reviewFacts) && matchingReview.reviewFacts.length) {
        return matchingReview.reviewFacts.map((fact) => t(fact.labelKey ?? `reviewFact.${fact.code}`)).join(", ");
      }
      return localizedTimelineText(scenario.summary ?? scenario.rationale, scenario, t);
    case "position":
    case "order":
      {
        const briefText = managementReviewTimelineBody(scenario.reviewBrief ?? null);
        if (briefText) return localizedTimelineText(briefText, scenario, t);
      }
      return localizedTimelineText(scenarioDetailRationaleText(scenario, t), scenario, t);
    case "event":
    case "strategy":
      return localizedTimelineText(scenario.rationale ?? scenario.summary, scenario, t);
  }
}

function localizedTimelineText(value: string | null | undefined, scenario: TraderScenario, t: Translator) {
  const text = cleanReviewDisplayText(value);
  if (!text) return "-";
  if (isLocalizedScreen(t) && looksLikeEnglishProse(text)) {
    return localizedTimelineFallback(scenario, t);
  }
  return text;
}

function localizedTimelineFallback(scenario: TraderScenario, t: Translator) {
  const key =
    scenario.source === "review"
      ? "scenario.fallback.managementReviewPendingTranslation"
      : "scenario.fallback.entryReviewPendingTranslation";
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return cleanReviewDisplayText(scenarioDetailRationaleText(scenario, t)) || "-";
}

export function looksLikeEnglishProse(value: string) {
  if (/[가-힣]/.test(value)) return false;
  const words = value.match(/[A-Za-z]{3,}/g) ?? [];
  if (words.length < 5) return false;
  return /\b(the|and|with|but|while|entry|position|short|long|review|price|stop|target|market|confirm|support|approve|invalidate|invalidation)\b/i.test(
    value
  );
}

function isLocalizedScreen(t: Translator) {
  const dashboard = t("nav.dashboard");
  return dashboard !== "nav.dashboard" && dashboard !== "Dashboard";
}

function managementReviewTimelineBody(brief: ReviewBrief | null) {
  if (!brief) return null;
  const parts = cleanReviewDisplayItems([
    brief.headline,
    brief.action,
    ...brief.keyReasons.slice(0, 2),
    ...brief.risks.slice(0, 1),
    ...brief.watchConditions.slice(0, 1),
    brief.managerNote
  ], 96);
  return cleanReviewDisplayText(parts.join(" "), 260) || null;
}

function hasSavedAiApproval(scenario: TraderScenario): boolean {
  if (typeof scenario.rationale === "string" && scenario.rationale.trim().length > 0) return true;
  const brief = scenario.reviewBrief;
  return Boolean(
    brief?.headline ||
      brief?.action ||
      brief?.managerNote ||
      brief?.keyReasons?.length ||
      brief?.risks?.length ||
      brief?.watchConditions?.length
  );
}
