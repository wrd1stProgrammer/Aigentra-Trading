import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const overlayHelpers = loadTsModule("../components/live-candle-chart-overlays.ts");
const volumeHelpers = loadTsModule("../components/live-candle-chart-volume.ts");

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

test("pending order overlays use user-facing waiting labels instead of raw order side copy", () => {
  const t = (key) => ({
    "chart.pendingLongOrder": "롱 대기",
    "chart.pendingShortOrder": "숏 대기",
    "chart.pendingOrder": "대기 주문"
  })[key] ?? key;

  assert.equal(overlayHelpers.pendingOrderLineLabel("LONG", 0, t), "롱 대기");
  assert.equal(overlayHelpers.pendingOrderLineLabel("SHORT", 0, t), "숏 대기");
  assert.equal(overlayHelpers.pendingOrderLineLabel("", 2, t), "대기 주문 3");
});

test("live candle chart treats paper trading statuses as open exposure", () => {
  // Given: API statuses use backend names, not only the literal string "open".
  const openStatuses = ["open", "OPEN_POSITION", "PENDING_ORDER", "paper trading pending", undefined];
  const closedStatuses = [
    "CLOSED",
    "FILLED",
    "CANCELED",
    "cancelled",
    "EXPIRED",
    "REJECTED",
    "stop_loss",
    "take-profit",
    "LIQUIDATION",
    "position closed"
  ];

  // When/Then: active statuses allow plan overlays, while closed statuses do not.
  for (const status of openStatuses) {
    assert.equal(overlayHelpers.isOpenChartExposure({ status }), true, `${String(status)} should be open`);
  }
  for (const status of closedStatuses) {
    assert.equal(overlayHelpers.isOpenChartExposure({ status }), false, `${status} should be closed`);
  }
});

test("realized completion markers render only while chart still has an active position", () => {
  assert.equal(
    overlayHelpers.shouldRenderRealizedEventOverlays({ hasOpenPaperPosition: false, hasOpenPaperOrder: false }),
    false,
    "fully closed traders should not keep stop-loss/take-profit completion price lines on the live chart"
  );
  assert.equal(overlayHelpers.shouldRenderRealizedEventOverlays({ hasOpenPaperPosition: true, hasOpenPaperOrder: false }), true);
  assert.equal(
    overlayHelpers.shouldRenderRealizedEventOverlays({ hasOpenPaperPosition: false, hasOpenPaperOrder: true }),
    false,
    "pending-entry traders should not inherit completed stop/take-profit markers from old trades"
  );
  assert.match(source, /shouldRenderRealizedEventOverlays/, "live chart should gate realized completion markers through the helper");
});

test("take-profit targets are completed only by explicit backend status", () => {
  // Given: a short pending order whose target is already below the latest price path.
  const args = { side: "SHORT", targetPrice: 62524.3, latestPrice: 62393.3 };

  // When/Then: price-path inference alone must not mark live exposures as done.
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "order" }), false);
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "plan" }), false);
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "position" }), false);
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "position", completed: "filled" }), true);
  assert.equal(overlayHelpers.shouldMarkTakeProfitCompleted({ ...args, exposureKind: "event" }), true);
});

test("managed stop lookup does not mix position and order exposure ids", () => {
  const records = [
    {
      symbol: "BTCUSDT",
      createdAt: "2026-06-13T10:00:00Z",
      exposure: { kind: "order", id: 7 },
      payload: { metrics: { stopLoss: 72000 } }
    },
    {
      symbol: "BTCUSDT",
      createdAt: "2026-06-13T09:00:00Z",
      exposure: { kind: "position", id: 7 },
      payload: { metrics: { stopLoss: 69000 } }
    }
  ];

  assert.equal(overlayHelpers.latestManagedStopLoss({ records, symbol: "BTCUSDT", positionId: 7 }), 69000);
  assert.equal(overlayHelpers.latestManagedStopLoss({ records, symbol: "BTCUSDT", orderId: 7 }), 72000);
});

test("safe-side stop lines render as break-even instead of stop-loss", () => {
  const t = (key) => ({
    "chart.stopLoss": "손절",
    "chart.breakEven": "본절"
  })[key] ?? key;

  assert.deepEqual(
    overlayHelpers.stopLossLineState({ side: "LONG", entryPrice: 60000, stopLoss: 60031, t }),
    { label: "본절", tone: "breakEven" }
  );
  assert.deepEqual(
    overlayHelpers.stopLossLineState({ side: "SHORT", entryPrice: 60000, stopLoss: 59969, t }),
    { label: "본절", tone: "breakEven" }
  );
  assert.deepEqual(
    overlayHelpers.stopLossLineState({ side: "LONG", entryPrice: 60000, stopLoss: 59600, t }),
    { label: "손절", tone: "stop" }
  );
});

test("execution chart markers render only the selected trade cycle", () => {
  assert.match(source, /const visibleExecutionMarkers = useMemo/, "chart should derive a bounded execution marker set");
  assert.match(source, /if \(!selectedExecutionMarkerId\) return \[\];/, "recent execution chips should not paint chart labels by default");
  assert.match(source, /executionMarkers\.filter\(\(marker\) => marker\.cycleId === selected\.cycleId\)/, "clicking one execution should paint only its trade-cycle markers");
  assert.doesNotMatch(source, /executionMarkers\.slice\(0,\s*5\)/, "chart should not mix recent markers with the selected marker");
});

test("chart overlays do not mix saved open orders with latest plan preview lines", () => {
  // Given: the detail chart has both a fresh/latest plan prop and persisted paper order props.
  // When/Then: once real open orders exist, plan preview lines must not render extra synthetic entries.
  assert.match(source, /visibleOpenPaperOrders = useMemo/);
  assert.match(source, /isPendingEntryOrder\(order\)/);
  assert.match(source, /if \(hasOpenPaperOrder\) return false;/);
  assert.match(source, /return isFreshRunCycleResult;/);
  assert.doesNotMatch(source, /return hasOpenPaperOrder \|\| isFreshRunCycleResult;/);
});

test("OKX realtime volume uses base currency volume and caps isolated display outliers", () => {
  assert.match(source, /volume:\s*Number\(row\[6\]\s*\?\?\s*row\[5\]\)/, "OKX websocket candles should use volCcy like the REST provider");

  const candles = Array.from({ length: 25 }, (_, index) => candle(index, 100));
  candles.push(candle(25, 10000));

  const volumePoint = volumeHelpers.volumeHistogramPoint(candles, 25);

  assert.equal(volumePoint.originalValue, 10000);
  assert.equal(volumePoint.value, 800);
  assert.equal(volumePoint.capped, true);
});

test("volume display keeps clustered high-volume regimes uncapped", () => {
  const candles = Array.from({ length: 25 }, (_, index) => candle(index, 100));
  candles.push(candle(25, 3000));
  candles.push(candle(26, 5000));

  const volumePoint = volumeHelpers.volumeHistogramPoint(candles, 26);

  assert.equal(volumePoint.value, 5000);
  assert.equal(volumePoint.capped, false);
});

function candle(index, volume) {
  return {
    openTime: 1_700_000_000_000 + index * 60_000,
    open: 100,
    high: 101,
    low: 99,
    close: index % 2 === 0 ? 101 : 99,
    volume,
    closeTime: 1_700_000_000_000 + index * 60_000 + 59_999
  };
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
