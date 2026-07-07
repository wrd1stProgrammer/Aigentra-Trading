import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const summarySource = readFileSync(new URL("../components/review-brief-summary.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/ai-review-panel.tsx", import.meta.url), "utf8");
const scenarioFeedSource = readFileSync(new URL("../components/trader-profile-detail/scenario-feed.ts", import.meta.url), "utf8");

test("structured reviews render as a short briefing plus manager note", () => {
  assert.match(summarySource, /ReviewBriefSummary/, "shared compact structured review component should exist");
  assert.match(summarySource, /reviewLinesFromBrief/, "structured review details should be merged into simple briefing lines");
  assert.doesNotMatch(summarySource, /aiReview\.nextAction/, "review body should not render a separate next-action section");
  assert.doesNotMatch(summarySource, /aiReview\.keyReasons/, "review body should not render a separate key-reasons section");
  assert.doesNotMatch(summarySource, /aiReview\.risks/, "review body should not render a separate risks section");
  assert.doesNotMatch(summarySource, /aiReview\.watchConditions/, "review body should not render a separate watch-conditions section");
  assert.match(summarySource, /aiReview\.managerNote/, "manager note should remain as the only explicit review subsection");
  assert.doesNotMatch(summarySource, /sm:grid-cols-3/, "review details should not split into three narrow columns");
  assert.doesNotMatch(summarySource, /<ul/, "review details should not render bullet lists");
  assert.match(modalSource, /ReviewBriefSummary/, "scenario modal should use the compact review summary");
  assert.match(panelSource, /ReviewBriefSummary/, "AI review panel should use the compact review summary");
});

test("scenario modal suppresses duplicate management rationale heading inside the summary card", () => {
  assert.match(summarySource, /showHeader/, "shared review summary should support hiding its internal heading");
  assert.match(modalSource, /showHeader=\{false\}/, "scenario modal already labels the rationale section outside the summary");
  assert.match(summarySource, /showHeader && verdict/, "embedded summaries should not render a separate verdict chip");
  assert.doesNotMatch(summarySource, /: verdict \? \(/, "hidden headers should not fall back to a standalone verdict badge");
  assert.doesNotMatch(
    modalSource,
    /<ReviewBriefSummary brief=\{scenario\.reviewBrief\} title=\{rationaleLabel\} t=\{t\} \/>/,
    "scenario modal should not render the same rationale label twice"
  );
});

test("structured review raw decision tokens are localized before display", () => {
  assert.match(summarySource, /localizedBriefToken/, "brief verdicts should pass through a localization helper");
  assert.match(summarySource, /APPROVE: "status\.approved"/, "approve verdicts should use status localization");
  assert.match(summarySource, /MOVE_STOP_TO_BREAKEVEN: "status\.moveStopToBreakeven"/, "breakeven stop actions should use status localization");
});

test("entry rationale paragraphs are not force-truncated with ellipses", () => {
  assert.doesNotMatch(
    summarySource,
    /cleanReviewDisplayText\([^)]*,\s*compact \? \d+ : \d+\)/,
    "visible review summary text should not use small character clamps that append ellipses"
  );
  assert.doesNotMatch(
    summarySource,
    /compact \? (?:72|92|96|110) : (?:100|132|140|160)/,
    "entry rationale lines should preserve the server review copy instead of truncating each paragraph"
  );
  assert.doesNotMatch(
    panelSource,
    /line-clamp-3/,
    "management and entry review detail copy should wrap naturally instead of hiding text after three lines"
  );
  assert.doesNotMatch(
    scenarioFeedSource,
    /cleanReviewDisplayItems\([\s\S]*,\s*96\)/,
    "scenario timeline review parts should not insert hard ellipses before the user opens the detail"
  );
  assert.doesNotMatch(
    scenarioFeedSource,
    /cleanReviewDisplayText\([\s\S]*,\s*260\)/,
    "scenario timeline copy should not insert hard ellipses before the user opens the detail"
  );
});
