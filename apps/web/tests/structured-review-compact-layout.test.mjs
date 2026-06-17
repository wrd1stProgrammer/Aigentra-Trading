import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const summarySource = readFileSync(new URL("../components/review-brief-summary.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/ai-review-panel.tsx", import.meta.url), "utf8");

test("structured review sections render as compact single-row summaries", () => {
  assert.match(summarySource, /ReviewBriefSummary/, "shared compact structured review component should exist");
  assert.match(summarySource, /BriefSummaryLine/, "structured review sections should use one row per section");
  assert.match(summarySource, /items\.join\(" · "\)/, "section items should be joined into one readable line");
  assert.doesNotMatch(summarySource, /sm:grid-cols-3/, "review details should not split into three narrow columns");
  assert.doesNotMatch(summarySource, /<ul/, "review details should not render bullet lists");
  assert.match(modalSource, /ReviewBriefSummary/, "scenario modal should use the compact review summary");
  assert.match(panelSource, /ReviewBriefSummary/, "AI review panel should use the compact review summary");
});
