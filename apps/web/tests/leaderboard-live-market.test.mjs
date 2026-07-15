import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const liveMarket = loadOptionalTsModule("../lib/leaderboard-live-market.ts");

test("live market parser accepts an OKX candle close and rejects non-price messages", () => {
  assert.equal(typeof liveMarket.parseOkxLiveMarkPrice, "function");
  assert.equal(
    liveMarket.parseOkxLiveMarkPrice(JSON.stringify({ data: [["1784000000000", "64000", "64100", "63900", "64050"]] })),
    64050
  );
  assert.equal(liveMarket.parseOkxLiveMarkPrice(JSON.stringify({ event: "subscribe" })), null);
  assert.equal(liveMarket.parseOkxLiveMarkPrice("not-json"), null);
});

test("live position ROI marks long and short positions to the supplied price", () => {
  assert.equal(typeof liveMarket.livePositionRoi, "function");
  const base = { quantity: 0.2, entryPrice: 60_000, openMargin: 2_400, unrealizedPnl: 0 };

  assert.equal(liveMarket.livePositionRoi({ ...base, side: "long" }, 60_600), 5);
  assert.equal(liveMarket.livePositionRoi({ ...base, side: "short" }, 59_400), 5);
  assert.equal(liveMarket.livePositionRoi({ ...base, side: "long", unrealizedPnl: -24 }, null), -1);
});

function loadOptionalTsModule(relativePath) {
  let source = "";
  try {
    source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
