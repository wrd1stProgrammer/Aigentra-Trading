import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const holdingMetrics = loadTsModule("../components/trader-profile-detail/holding-metrics.ts");

test("holding metrics read average entry, leverage, notional, pnl, and entry weight", () => {
  const metrics = holdingMetrics.positionHoldingNumbers({
    averageEntryPrice: "67138",
    markPrice: "68200",
    quantity: "0.25",
    leverage: "7",
    unrealizedPnl: "125.5",
    payload: { entryWeight: 0.35 }
  });

  assert.equal(metrics.entryPrice, 67138);
  assert.equal(metrics.markPrice, 68200);
  assert.equal(metrics.quantity, 0.25);
  assert.equal(metrics.leverage, 7);
  assert.equal(metrics.notional, 17050);
  assert.equal(metrics.pnl, 125.5);
  assert.equal(metrics.entryWeight, 35);
});

test("holding metrics read pending order and plan entry price context", () => {
  const order = holdingMetrics.orderHoldingNumbers({
    limitPrice: "64500",
    quantity: "0.1",
    payload: { leveragePlan: { suggestedLeverage: "4" }, entryWeight: "25" }
  });
  const plan = holdingMetrics.planEntryHoldingNumbers(
    { price: "64100", weight: 0.4 },
    { leverage: "3" }
  );

  assert.equal(order.entryPrice, 64500);
  assert.equal(order.leverage, 4);
  assert.equal(order.entryWeight, 25);
  assert.equal(plan.entryPrice, 64100);
  assert.equal(plan.leverage, 3);
  assert.equal(plan.entryWeight, 40);
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

