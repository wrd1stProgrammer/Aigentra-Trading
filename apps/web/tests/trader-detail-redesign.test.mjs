import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const sourceFiles = [
  "../components/trader-profile-page-client.tsx",
  "../components/trader-profile-detail/data.ts",
  "../components/trader-profile-detail/holdings.ts",
  "../components/trader-profile-detail/holding-metrics.ts",
  "../components/trader-profile-detail/plan.ts",
  "../components/trader-profile-detail/chart.tsx",
  "../components/live-candle-chart.tsx",
  "../components/trader-profile-detail/header.tsx",
  "../components/trader-profile-detail/timeline.tsx",
  "../components/trader-profile-detail/status-feed-thread.tsx",
  "../components/trader-profile-detail/side-panels.tsx",
  "../components/trader-profile-detail/trading-journal.tsx",
  "../components/trader-profile-detail/scenario-modal.tsx"
];
const source = sourceFiles.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");

test("trader detail exposes reference-style monitoring layout regions", () => {
  assert.match(source, /data-testid="trader-detail-monitoring-shell"/, "detail page should expose the redesigned monitoring shell");
  assert.match(source, /data-testid="top-chart-panel"/, "detail page should keep the chart in a top monitoring panel");
  assert.match(source, /data-testid="trader-status-feed-thread"/, "detail page should expose the trader status feed thread next to the chart");
  assert.match(source, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(300px,1fr\)\]/, "top monitoring row should split chart and feed at roughly 3/4 to 1/4 width");
  assert.match(source, /data-testid="scenario-timeline"/, "detail page should expose a latest scenario timeline region");
  assert.match(source, /data-testid="holding-panel"/, "detail page should expose the right holding allocation panel");
  assert.match(source, /data-testid="trade-history-panel"/, "detail page should expose the right trade history panel");
  assert.match(source, /data-testid="management-journal"/, "detail page should expose the lower management journal region");
});

test("scenario timeline uses real trading review and plan data", () => {
  assert.match(source, /scenarioTimelineItems/, "scenario timeline should be driven by a derived view model");
  assert.match(source, /latestPlan/, "scenario timeline should include latest trade plan data");
  assert.match(source, /reviews/, "scenario timeline should include management review data");
  assert.match(source, /timelineRail/, "scenario timeline should render a visible rail like the reference");
});

test("holding panel weights use exposure data instead of pnl", () => {
  assert.match(source, /positionExposureValue/, "position holdings should derive weights from position exposure");
  assert.match(source, /orderExposureValue/, "open orders should derive weights from order exposure");
  assert.doesNotMatch(source, /numberValue\(position\.unrealizedPnl, standing\?\.totalPnl/, "holding weights must not use pnl as allocation");
});

test("holding panel shows entry price, side, leverage, size, and allocation detail", () => {
  assert.match(source, /positionHoldingNumbers/, "position holdings should include detailed position metrics");
  assert.match(source, /orderHoldingNumbers/, "pending order holdings should include detailed order metrics");
  assert.match(source, /item\.badges\.map/, "holding rows should render side and leverage badges");
  assert.match(source, /item\.details\.map/, "holding rows should render compact price, size, exposure, and allocation facts");
  assert.match(source, /detail\.averageEntry/, "holding and chart copy should use localized average-entry wording");
  assert.match(source, /detail\.entryWeight/, "holding rows should show the original staged entry weight when present");
  assert.match(source, /detail\.allocationWeight/, "holding rows should distinguish current holding weight from entry weight");
  assert.match(source, /chart\.averageEntry/, "chart should explicitly label average entry lines");
});

test("detail page avoids raw backend status and scammy paper wording in the redesigned surface", () => {
  assert.doesNotMatch(source, />Paper</, "detail page should not render a raw Paper badge");
  assert.doesNotMatch(source, /Paper only/, "detail page should not render Paper only copy");
  assert.doesNotMatch(source, /PAPER_TRADING_PENDING[^"]*<\/span>/, "detail page should not directly render raw pending constants");
});
