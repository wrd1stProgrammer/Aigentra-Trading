import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const sourceFiles = [
  "../components/leaderboard-page-client.tsx",
  "../components/leaderboard-sidebar-equity-chart.tsx"
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
