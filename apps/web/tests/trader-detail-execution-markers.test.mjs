import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

test("execution markers keep split entries and exits as separate chart marks", () => {
  const markers = loadTsModule("../components/trader-profile-detail/execution-markers.ts");
  const t = translator({
    "detail.markerEntry": "진입",
    "detail.markerTakeProfit": "익절",
    "detail.markerStopLoss": "손절",
    "detail.markerPartialExit": "분할 청산",
    "detail.markerExit": "청산",
    "detail.markerBuy": "매수",
    "detail.markerSell": "매도",
    "detail.markerLongEntryShort": "B",
    "detail.markerShortEntryShort": "S",
    "detail.markerTakeProfitShort": "TP",
    "detail.markerStopLossShort": "SL",
    "detail.markerPartialExitShort": "PX",
    "detail.markerExitShort": "EX"
  });

  const result = markers.buildExecutionMarkers({
    symbol: "BTCUSDT",
    locale: "ko",
    t,
    closedPositions: [{ id: 7, symbol: "BTCUSDT", side: "long", openedAt: "2026-06-20T00:00:00Z" }],
    events: [
      { id: 1, eventType: "order_filled", symbol: "BTCUSDT", positionId: 7, price: 1000, quantity: 0.1, createdAt: "2026-06-20T00:05:00Z" },
      { id: 2, eventType: "order_filled", symbol: "BTCUSDT", positionId: 7, price: 1050, quantity: 0.1, createdAt: "2026-06-20T00:35:00Z" },
      { id: 3, eventType: "order_filled", symbol: "BTCUSDT", positionId: 7, price: 1075, quantity: 0.1, createdAt: "2026-06-20T00:45:00Z" },
      { id: 4, eventType: "position_reduced_by_ai", symbol: "BTCUSDT", positionId: 7, price: 1120, quantity: 0.05, realizedPnl: 6, payload: { side: "long" }, createdAt: "2026-06-20T01:00:00Z" },
      { id: 5, eventType: "PARTIAL_TAKE_PROFIT", symbol: "BTCUSDT", positionId: 7, price: 1180, quantity: 0.05, realizedPnl: 10, payload: { side: "long" }, createdAt: "2026-06-20T02:00:00Z" },
      { id: 6, eventType: "position_closed", symbol: "BTCUSDT", positionId: 7, price: 1210, quantity: 0.1, realizedPnl: 18, payload: { side: "long", reason: "take_profit" }, createdAt: "2026-06-20T03:00:00Z" }
    ]
  });

  assert.equal(result.length, 6);
  assert.deepEqual(result.map((marker) => marker.price).sort((a, b) => a - b), [1000, 1050, 1075, 1120, 1180, 1210]);
  assert.equal(result.filter((marker) => marker.action === "entry").length, 3);
  assert.equal(result.filter((marker) => marker.action === "takeProfit").length, 3);
  const entries = result.filter((marker) => marker.action === "entry").sort((a, b) => a.timeMs - b.timeMs);
  const exits = result.filter((marker) => marker.action === "takeProfit").sort((a, b) => a.timeMs - b.timeMs);
  assert.deepEqual(entries.map((marker) => marker.shortLabel), ["B1", "B2", "B3"]);
  assert.deepEqual(entries.map((marker) => marker.markerLabel), ["LONG 매수1", "LONG 매수2", "LONG 매수3"]);
  assert.deepEqual(exits.map((marker) => marker.shortLabel), ["S1", "S2", "S3"]);
  assert.equal(new Set(result.map((marker) => marker.cycleId)).size, 1);
});

test("execution marker exit tooltip keeps the related entry time", () => {
  const markers = loadTsModule("../components/trader-profile-detail/execution-markers.ts");
  const t = translator({
    "detail.markerEntry": "Entry",
    "detail.markerTakeProfit": "Take profit",
    "detail.markerStopLoss": "Stop loss",
    "detail.markerPartialExit": "Partial exit",
    "detail.markerExit": "Exit",
    "detail.markerBuy": "Buy",
    "detail.markerSell": "Sell",
    "detail.markerLongEntryShort": "B",
    "detail.markerShortEntryShort": "S",
    "detail.markerTakeProfitShort": "TP",
    "detail.markerStopLossShort": "SL",
    "detail.markerPartialExitShort": "PX",
    "detail.markerExitShort": "EX"
  });

  const result = markers.buildExecutionMarkers({
    symbol: "BTCUSDT",
    locale: "en",
    t,
    closedPositions: [{ id: 11, symbol: "BTCUSDT", side: "short", openedAt: "2026-06-20T00:00:00Z" }],
    events: [
      { id: "fill", eventType: "order_filled", symbol: "BTCUSDT", positionId: 11, price: 64184, quantity: 0.2, createdAt: "2026-06-20T00:05:00Z" },
      { id: "close", eventType: "position_closed", symbol: "BTCUSDT", positionId: 11, price: 63620, quantity: 0.2, realizedPnl: 22.4, payload: { side: "short", reason: "take_profit" }, createdAt: "2026-06-20T01:20:00Z" },
      { id: "noise", eventType: "stop_moved_to_breakeven", symbol: "BTCUSDT", positionId: 11, price: 64184, createdAt: "2026-06-20T00:40:00Z" }
    ]
  });

  assert.equal(result.length, 2);
  const close = result.find((marker) => marker.eventId === "close");
  assert.ok(close);
  assert.equal(close.entryTimeLabel, result.find((marker) => marker.eventId === "fill")?.eventTimeLabel);
  assert.equal(result.some((marker) => marker.eventId === "noise"), false);
});

test("execution markers hide neutral generic exits", () => {
  const markers = loadTsModule("../components/trader-profile-detail/execution-markers.ts");
  const t = translator({
    "detail.markerEntry": "Entry",
    "detail.markerTakeProfit": "Take profit",
    "detail.markerStopLoss": "Stop loss",
    "detail.markerPartialExit": "Partial exit",
    "detail.markerExit": "Exit",
    "detail.markerBuy": "Buy",
    "detail.markerSell": "Sell",
    "detail.markerLongEntryShort": "B",
    "detail.markerShortEntryShort": "S",
    "detail.markerTakeProfitShort": "TP",
    "detail.markerStopLossShort": "SL",
    "detail.markerPartialExitShort": "PX",
    "detail.markerExitShort": "EX"
  });

  const result = markers.buildExecutionMarkers({
    symbol: "BTCUSDT",
    locale: "en",
    t,
    closedPositions: [{ id: 31, symbol: "BTCUSDT", side: "long", openedAt: "2026-06-20T00:00:00Z" }],
    events: [
      { id: "fill", eventType: "order_filled", symbol: "BTCUSDT", positionId: 31, price: 64000, quantity: 0.2, createdAt: "2026-06-20T00:05:00Z" },
      { id: "close", eventType: "position_closed", symbol: "BTCUSDT", positionId: 31, price: 64000, quantity: 0.2, realizedPnl: 0, payload: { side: "long" }, createdAt: "2026-06-20T01:20:00Z" }
    ]
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].eventId, "fill");
  assert.equal(result.some((marker) => marker.shortLabel === "EX"), false);
});

test("default execution marker selection only highlights current open positions", () => {
  const markers = loadTsModule("../components/trader-profile-detail/execution-markers.ts");
  const candidates = [
    { id: "closed-fill", action: "entry", positionId: "closed-1" },
    { id: "open-fill", action: "entry", positionId: "open-1" },
    { id: "open-tp", action: "takeProfit", positionId: "open-1" }
  ];

  assert.equal(markers.defaultExecutionMarkerSelection({ markers: candidates, positions: [] }), null);
  assert.equal(markers.defaultExecutionMarkerSelection({ markers: candidates, positions: [{ id: "open-1", status: "OPEN_POSITION" }] }), "open-fill");
  assert.equal(markers.defaultExecutionMarkerSelection({ markers: candidates, positions: [{ id: "closed-1", status: "closed" }] }), null);
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
