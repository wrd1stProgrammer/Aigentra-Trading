import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const sourceFiles = [
  "../components/leaderboard-page-client.tsx",
  "../components/leaderboard-sidebar-equity-chart.tsx",
  "../components/leaderboard-sidebar-equity-chart-data.ts"
];
const source = sourceFiles
  .filter((file) => existsSync(new URL(file, import.meta.url)))
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");

test("sidebar equity chart uses a refined thin line treatment", () => {
  assert.match(source, /SIDEBAR_CHART_STROKE_WIDTH = "1\.25"/, "sidebar chart line should be thin enough for the compact panel");
  assert.match(source, /SIDEBAR_CHART_STROKE = "var\(--accent\)"/, "sidebar chart should use the calmer teal app accent");
  assert.match(source, /shapeRendering="geometricPrecision"/, "sidebar chart should render with precise vector edges");
  assert.doesNotMatch(source, /strokeWidth="2\.4"/, "sidebar chart line should not use the previous heavy stroke");
  assert.doesNotMatch(source, /<circle cx="100"/, "sidebar chart should not add a heavy terminal dot");
});

test("leaderboard hover chart keeps a sampled seven-day history instead of the latest day", () => {
  assert.match(source, /SEVEN_DAY_EQUITY_SNAPSHOT_LIMIT = 7 \* 24 \* 4/, "the hover request should cover seven days of 15-minute snapshots");
  assert.match(source, /getEquitySnapshots\(SEVEN_DAY_EQUITY_SNAPSHOT_LIMIT, activeTrader\?\.id/, "the hover request should use the seven-day limit");
  assert.match(source, /getEquitySnapshots\(LEGACY_EQUITY_SNAPSHOT_LIMIT, activeTrader\?\.id/, "the chart should remain available during a rolling backend deployment");
  assert.match(source, /sampleEquityChartPoints\(points, MAX_EQUITY_CHART_POINTS\)/, "long histories should be sampled across the whole range");
  assert.doesNotMatch(source, /\.slice\(-60\)/, "the chart must not discard the first six days");
});

test("sidebar equity chart keeps compact axis labels distinct and inside the plot", () => {
  assert.match(source, /const GRIDLINE_COUNT = 3/, "the compact chart should use three readable y-axis ticks");
  assert.match(source, /formatAxisPrice\(gridline\.price, paddedRange, locale\)/, "axis precision should adapt to the visible equity range");
  assert.match(source, /textAnchor=\{label\.anchor\}/, "edge date labels should anchor inward instead of clipping");
  assert.match(source, /max-w-\[55%\].*truncate/, "the current equity summary should not collide with the chart title");
  assert.match(source, /whitespace-nowrap.*font-mono text-xs/, "hovered equity and timestamp should stay on one readable line");
});
