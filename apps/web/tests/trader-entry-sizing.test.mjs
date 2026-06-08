import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const holdingMetrics = loadTsModule("../components/trader-profile-detail/holding-metrics.ts");
const binancePanelSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-panel.tsx", import.meta.url), "utf8");

test("entry sizing explains margin notional account percent and entry weight", () => {
  // Given: a leveraged short position in a roughly 10,000 USD simulated account.
  const position = {
    side: "SHORT",
    entryPrice: 64232.3,
    quantity: 0.016,
    leverage: 5,
    notional: 1027.7168,
    payload: { entryWeight: 0.3 }
  };

  // When: holding metrics are calculated with account equity context.
  const metrics = holdingMetrics.positionHoldingNumbers(position, 10000);

  // Then: the UI can show both actual margin used and full exposure clearly.
  assert.equal(metrics.notional, 1027.7168);
  assert.equal(metrics.margin, 205.54336);
  assert.equal(metrics.accountMarginPercent, 2.0554336);
  assert.equal(metrics.accountNotionalPercent, 10.277168);
  assert.equal(metrics.entryWeight, 30);
});

test("open order sizing uses planned margin payload before zero filled margin", () => {
  // Given: an unfilled paper order has database margin 0, but planner payload contains intended sizing.
  const order = {
    side: "LONG",
    limitPrice: 61000,
    quantity: 0.025,
    leverage: 8,
    margin: 0,
    payload: {
      actualPlannedMargin: 190.625,
      plannedNotional: 1525,
      accountMarginPercent: 1.90625,
      notionalExposurePercent: 15.25,
      entryWeight: 0.5
    }
  };

  // When: the UI derives holding numbers for an open order.
  const metrics = holdingMetrics.orderHoldingNumbers(order, 10000);

  // Then: the visible order sizing reflects the plan, not the still-zero filled margin.
  assert.equal(metrics.margin, 190.625);
  assert.equal(metrics.notional, 1525);
  assert.equal(metrics.accountMarginPercent, 1.90625);
  assert.equal(metrics.accountNotionalPercent, 15.25);
  assert.equal(metrics.entryWeight, 50);
});

test("open order panel removes account/notional percent columns and adds detail action", () => {
  assert.doesNotMatch(
    binancePanelSource,
    /formatOrderSizingMeta/,
    "order sizing should not be hidden under the margin cell as a small sentence"
  );
  assert.doesNotMatch(binancePanelSource, /detail\.accountMargin/, "open-order table should not show account margin percent as a column");
  assert.doesNotMatch(binancePanelSource, /detail\.notionalExposure/, "open-order table should not show notional exposure percent as a column");
  assert.match(binancePanelSource, /detail\.exposure/, "orders should show exposure amount as a dedicated column");
  assert.match(binancePanelSource, /detail\.rowDetail/, "orders and positions need a localized detail action column");
  assert.match(binancePanelSource, /detail\.orderTime/, "orders should end with a compact time column");
  assert.match(binancePanelSource, /formatClockTime\(/, "the rightmost time column should use compact clock formatting");
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
