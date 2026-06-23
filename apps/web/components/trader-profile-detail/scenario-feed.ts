import type { ManagementReview } from "@/lib/api";
import type { TraderScenario } from "@/lib/league";
import type { ReviewBrief } from "@/lib/review-brief";
import { reviewBriefFromRecord } from "@/lib/review-brief";
import { cleanReviewDisplayText } from "@/lib/review-display";
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
        const briefText = managementReviewTimelineBody(scenario, scenario.reviewBrief ?? reviewBriefFromRecord(matchingReview), t);
        if (briefText) return briefText;
      }
      if (matchingReview?.rationale) return cleanReviewDisplayText(matchingReview.rationale);
      if (Array.isArray(matchingReview?.reviewFacts) && matchingReview.reviewFacts.length) {
        return matchingReview.reviewFacts.map((fact) => t(fact.labelKey ?? `reviewFact.${fact.code}`)).join(", ");
      }
      return cleanReviewDisplayText(scenario.summary ?? scenario.rationale) || "-";
    case "position":
    case "order":
      {
        const briefText = managementReviewTimelineBody(scenario, scenario.reviewBrief ?? null, t);
        if (briefText) return briefText;
      }
      return cleanReviewDisplayText(scenarioDetailRationaleText(scenario, t)) || "-";
    case "event":
    case "strategy":
      return cleanReviewDisplayText(scenario.rationale ?? scenario.summary) || "-";
  }
}

function managementReviewTimelineBody(scenario: TraderScenario, brief: ReviewBrief | null, t: Translator) {
  const lead = reviewTimelineLead(scenario, t);
  const reason = reviewReasonCue(brief, t);
  return [lead, reason].filter(Boolean).join(" ");
}

function reviewTimelineLead(scenario: TraderScenario, t: Translator) {
  const side = localizedSide(scenario.side, t);
  const normalized = normalizeReviewKey([scenario.action, scenario.status, scenario.eventType]);
  const phase = normalizeReviewKey([scenario.phase]);
  if (normalized.includes("CANCEL")) return fillSide(t("detail.reviewBody.cancelOrder"), side);
  if (normalized.includes("CLOSE") || normalized.includes("POSITION_CLOSED")) return fillSide(t("detail.reviewBody.closePosition"), side);
  if (normalized.includes("MOVE_STOP") || normalized.includes("BREAKEVEN")) return fillSide(t("detail.reviewBody.adjustStop"), side);
  if (phase.includes("PENDING_ORDER")) return fillSide(t("detail.reviewBody.pendingEntry"), side);
  if (phase.includes("OPEN_POSITION") || normalized.includes("HOLD")) return fillSide(t("detail.reviewBody.holdPosition"), side);
  return t("detail.reviewBody.watchMarket");
}

function reviewReasonCue(brief: ReviewBrief | null, t: Translator) {
  if (!brief) return null;
  const haystack = normalizeReviewKey([
    brief.headline,
    brief.action,
    brief.managerNote,
    ...brief.keyReasons,
    ...brief.risks,
    ...brief.watchConditions
  ]);
  if (haystack.includes("거래량") || haystack.includes("VOLUME") || haystack.includes("Z_SCORE")) return t("detail.reviewReason.volumeWeak");
  if (haystack.includes("손절") || haystack.includes("STOP") || haystack.includes("실패") || haystack.includes("INVALID")) return t("detail.reviewReason.stopWatch");
  if (haystack.includes("익절") || haystack.includes("목표") || haystack.includes("TAKE_PROFIT") || haystack.includes("TARGET")) return t("detail.reviewReason.profitWatch");
  const [firstSnippet] = [
    brief.headline,
    brief.action,
    brief.keyReasons[0],
    brief.risks[0],
    brief.watchConditions[0],
    brief.managerNote
  ]
    .map((item) => cleanReviewDisplayText(item, 72))
    .filter(Boolean);
  return firstSnippet ?? null;
}

function fillSide(template: string, side: string) {
  return template.replace("{side}", side).replace(/\s+/g, " ").trim();
}

function localizedSide(side: unknown, t: Translator) {
  const normalized = String(side ?? "").trim().toUpperCase();
  if (normalized === "LONG" || normalized === "BUY") return t("detail.sideLong");
  if (normalized === "SHORT" || normalized === "SELL") return t("detail.sideShort");
  return "";
}

function normalizeReviewKey(values: readonly unknown[]) {
  return values
    .map((value) => cleanReviewDisplayText(value, 0))
    .join(" ")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
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
