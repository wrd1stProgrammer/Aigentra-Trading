import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

test("realized take-profit and stop-loss events can build completed event rows", () => {
  // Given: trade events include realized exits that are not AI review records.
  const realizedEvents = loadTsModule("../components/trader-profile-detail/realized-events.ts");
  const t = translator({
    "detail.takeProfitCompleted": "익절완료",
    "detail.stopLossCompleted": "손절완료",
    "detail.positionClosed": "포지션 종료",
    "common.price": "가격",
    "common.pnl": "손익",
    "common.quantity": "수량",
    "chart.takeProfit": "익절",
    "chart.stopLoss": "손절"
  });

  // When: the completed-event view model is built from events.
  const items = realizedEvents.buildRealizedEventTimelineItems({
    events: [
      {
        id: 1,
        eventType: "TAKE_PROFIT",
        symbol: "BTCUSDT",
        side: "SHORT",
        price: 62524.3,
        quantity: 0.016,
        realizedPnl: 27.4,
        createdAt: "2026-06-04T15:00:00Z",
        payload: { reason: "TP1 filled" }
      },
      {
        id: 2,
        eventType: "STOP_LOSS",
        symbol: "BTCUSDT",
        side: "SHORT",
        stopLossPrice: 65838.3,
        quantity: 0.012,
        realizedPnl: -12.8,
        createdAt: "2026-06-04T16:00:00Z",
        message: "Stop filled"
      },
      { id: 3, eventType: "POSITION_HEARTBEAT", symbol: "BTCUSDT", createdAt: "2026-06-04T17:00:00Z" }
    ],
    locale: "ko",
    t
  });

  // Then: take-profit and stop-loss exits can be rendered newest first outside the AI-only scenario feed.
  assert.equal(items.length, 2);
  assert.match(items[0].title, /손절완료/);
  assert.equal(items[0].movement, "손절");
  assert.equal(items[0].movementTone, "bad");
  assert.match(items[0].priceLabel, /65,838/);
  assert.match(items[1].title, /익절완료/);
  assert.equal(items[1].movement, "익절");
  assert.equal(items[1].movementTone, "good");
  assert.match(items[1].body, /TP1 filled/);
  assert.match(items[1].priceLabel, /62,524/);
});

test("latest scenario feed is restricted to AI review scenarios", () => {
  const source = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /dedupeScenarioTimelineScenarios\(\s*scenarios\.filter\(\(scenario\) => scenario\.source === "review"\)/s,
    "latest scenarios should filter to AI review records before deduping"
  );
  assert.doesNotMatch(
    source,
    /buildRealizedEventTimelineItems\(\{/,
    "realized trade events should not be injected into the AI review scenario feed"
  );
  assert.doesNotMatch(source, /planScenario/, "trade plans should stay out of the AI review scenario feed");
});

function translator(messages) {
  return (key) => messages[key] ?? key;
}

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
