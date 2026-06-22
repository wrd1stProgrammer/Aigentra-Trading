import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";

const chartData = loadTsModule("../components/live-candle-chart-data.ts");

test("low timeframe candle windows keep enough history for usable chart navigation", () => {
  assert.equal(chartData.candleLimitForInterval("1m"), 500);
  assert.equal(chartData.candleLimitForInterval("5m"), 500);
  assert.equal(chartData.candleLimitForInterval("15m"), 500);
  assert.equal(chartData.candleLimitForInterval("30m"), 500);
  assert.equal(chartData.candleLimitForInterval("1h"), 120);
});

test("initial chart viewport keeps cached history but opens near the latest candles", () => {
  assert.equal(chartData.initialVisibleBarsForInterval("5m"), 500);
  assert.deepEqual(chartData.latestVisibleLogicalRange(5_000, "5m"), { from: 4500, to: 5007 });
  assert.deepEqual(chartData.latestVisibleLogicalRange(80, "5m"), { from: 0, to: 87 });
  assert.equal(chartData.latestVisibleLogicalRange(0, "5m"), null);
});

test("REST backfill runs quickly when websocket updates go stale", () => {
  assert.equal(chartData.restBackfillCandleLimit(), 2);
  assert.equal(
    chartData.shouldBackfillFromRest({ now: 20_000, lastSocketUpdateAt: 1_000, staleWindowMs: 12_000 }),
    true
  );
  assert.equal(
    chartData.shouldBackfillFromRest({ now: 8_000, lastSocketUpdateAt: 1_000, staleWindowMs: 12_000 }),
    false
  );
  assert.ok(chartData.restFallbackIntervalMs("1m") <= 20_000);
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
