import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const overlayHelpers = loadTsModule("../components/live-candle-chart-overlays.ts");

test("live candle chart uses compact overlay price lines", () => {
  assert.match(source, /compactOverlayLines/, "overlay lines should be compacted before rendering");
  assert.match(source, /priceLineTitle\(line\)/, "price line titles should be intentionally shortened");
  assert.doesNotMatch(source, /title: `\$\{line\.label\} \$\{formatter\.format\(line\.value\)\}`/, "price line title should not repeat the axis price");
  assert.doesNotMatch(source, /lineWidth: 2,/, "overlay lines should not use the previous heavy width");
});

test("live candle chart merges nearby overlay labels by priority", () => {
  // Given: stop, entry, and take-profit overlays are close enough to stack on the axis.
  const lines = [
    { value: 100, label: "Entry 1", tone: "entry" },
    { value: 100.2, label: "Stop", tone: "stop" },
    { value: 100.35, label: "Take Profit 1", tone: "takeProfit" },
    { value: 104, label: "Order LONG", tone: "order" }
  ];

  // When: the chart compacts overlay lines.
  const compacted = overlayHelpers.compactOverlayLines(lines);

  // Then: the near group keeps the highest-priority label and a short count suffix.
  assert.equal(compacted.length, 2);
  assert.deepEqual(compacted[0], { value: 100.2, label: "Stop", tone: "stop", count: 3 });
  assert.equal(overlayHelpers.priceLineTitle(compacted[0]), "Stop +2");
  assert.equal(overlayHelpers.priceLineTitle(compacted[1]), "Order LONG");
  assert.equal(overlayHelpers.overlaySideLabel("sell"), "SHORT");
  assert.equal(overlayHelpers.overlaySideLabel("buy"), "LONG");
});

test("live candle chart treats paper trading statuses as open exposure", () => {
  // Given: API statuses use backend names, not only the literal string "open".
  const openStatuses = ["open", "OPEN_POSITION", "PENDING_ORDER", "paper trading pending", undefined];
  const closedStatuses = ["CLOSED", "FILLED", "CANCELED", "cancelled", "EXPIRED", "REJECTED"];

  // When/Then: active statuses allow plan overlays, while closed statuses do not.
  for (const status of openStatuses) {
    assert.equal(overlayHelpers.isOpenChartExposure({ status }), true, `${String(status)} should be open`);
  }
  for (const status of closedStatuses) {
    assert.equal(overlayHelpers.isOpenChartExposure({ status }), false, `${status} should be closed`);
  }
});

test("pending order take-profit targets are not marked completed before entry fills", () => {
  // Given: a short pending order whose target is already below the latest price path.
  const args = { side: "SHORT", targetPrice: 62524.3, latestPrice: 62393.3 };

  // When/Then: completion badges are only valid for filled positions, not pending orders.
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "order" }), false);
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "plan" }), false);
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "position" }), true);
});

test("chart overlays do not mix saved open orders with latest plan preview lines", () => {
  // Given: the detail chart has both a fresh/latest plan prop and persisted paper order props.
  // When/Then: once real open orders exist, plan preview lines must not render extra synthetic entries.
  assert.match(source, /visibleOpenPaperOrders = useMemo/);
  assert.match(source, /!isSyntheticPaperOrder\(order\)/);
  assert.match(source, /if \(hasOpenPaperOrder\) return false;/);
  assert.match(source, /return isFreshRunCycleResult;/);
  assert.doesNotMatch(source, /return hasOpenPaperOrder \|\| isFreshRunCycleResult;/);
});

function loadTsModule(relativePath) {
  const tsSource = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
