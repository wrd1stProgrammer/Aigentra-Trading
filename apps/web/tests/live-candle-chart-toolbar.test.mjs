import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const chartSource = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("live candle chart uses a market status header instead of plan clutter chips", () => {
  assert.match(chartSource, /data-testid="chart-market-status"/, "chart should expose a compact market status header");
  assert.match(chartSource, /chart\.marketPrice/, "chart header should show current BTC price copy");
  assert.match(chartSource, /dayChangePct/, "chart header should calculate daily price change");
  assert.doesNotMatch(chartSource, /chart\.lastPrice/, "old current-price badge should be removed from the header");
  assert.doesNotMatch(chartSource, /chart\.planMarkers/, "target-marker header chip should be removed");
  assert.doesNotMatch(chartSource, /chart\.paperMarkers/, "simulation position/order header chip should be removed");
});

test("live candle drawing tools are collapsed behind an accessible toolbar toggle", () => {
  assert.match(chartSource, /data-testid="chart-tool-toggle"/, "chart should expose a tool toggle");
  assert.match(chartSource, /aria-expanded=\{showDrawingTools\}/, "tool toggle should communicate expanded state");
  assert.match(chartSource, /data-testid="chart-drawing-toolbar"/, "drawing toolbar should be testable when expanded");
  assert.match(chartSource, /pointerEvents: showDrawingTools && activeTool !== "cursor" \? "auto" : "none"/, "overlay canvas should only capture input for active drawing tools");
  assert.doesNotMatch(chartSource, />\s*Wide\s*</, "wide height option should be removed");
  assert.doesNotMatch(chartSource, />\s*Tall\s*</, "tall height option should be removed");
  assert.match(i18nSource, /"chart\.showTools"/, "tool toggle copy should be localized");
  assert.match(i18nSource, /"chart\.dayChange"/, "daily change copy should be localized");
});
