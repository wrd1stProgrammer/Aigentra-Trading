import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

test("closed take-profit and stop-loss events produce completed chart overlays", () => {
  // Given: closed execution events carry realized prices.
  const chartEvents = loadTsModule("../components/trader-profile-detail/chart-realized-overlays.ts");
  const t = translator({
    "chart.takeProfit": "익절",
    "chart.stopLoss": "손절",
    "detail.takeProfitCompleted": "익절완료",
    "detail.stopLossCompleted": "손절완료",
    "status.completed": "완료"
  });

  // When: chart event overlays are derived for the current symbol.
  const lines = chartEvents.buildRealizedEventOverlayLines({
    events: [
      { id: 1, eventType: "TAKE_PROFIT", symbol: "BTCUSDT", positionId: 21, price: 62524.3 },
      { id: 2, eventType: "STOP_LOSS", symbol: "BTCUSDT", orderId: 11, stopLossPrice: 65838.3 },
      { id: 3, eventType: "TAKE_PROFIT", symbol: "ETHUSDT", price: 2200 }
    ],
    activeOrderIds: [11],
    activePositionIds: [21],
    symbol: "BTCUSDT",
    t
  });

  // Then: completed markers use dedicated labels and tones instead of active TP/SL styling.
  assert.deepEqual(lines, [
    { value: 62524.3, label: "익절완료", tone: "takeProfitDone" },
    { value: 65838.3, label: "손절완료", tone: "stopDone" }
  ]);
});

test("completed chart overlays ignore stale events from older positions", () => {
  const chartEvents = loadTsModule("../components/trader-profile-detail/chart-realized-overlays.ts");
  const t = translator({
    "detail.takeProfitCompleted": "익절완료",
    "detail.stopLossCompleted": "손절완료"
  });

  const lines = chartEvents.buildRealizedEventOverlayLines({
    events: [
      { id: 1, eventType: "STOP_LOSS", symbol: "BTCUSDT", positionId: 99, price: 65588.6 },
      { id: 2, eventType: "STOP_LOSS", symbol: "BTCUSDT", positionId: 21, price: 65279.7 },
      { id: 3, eventType: "TAKE_PROFIT", symbol: "BTCUSDT", payload: { positionId: 21, price: 64991.8 } }
    ],
    activePositionIds: [21],
    symbol: "BTCUSDT",
    t
  });

  assert.deepEqual(lines, [
    { value: 65279.7, label: "손절완료", tone: "stopDone" },
    { value: 64991.8, label: "익절완료", tone: "takeProfitDone" }
  ]);
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
