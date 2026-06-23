import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const summarySource = readFileSync(new URL("../components/review-brief-summary.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/ai-review-panel.tsx", import.meta.url), "utf8");

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
