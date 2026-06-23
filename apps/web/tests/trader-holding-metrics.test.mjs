import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const holdingMetrics = loadTsModule("../components/trader-profile-detail/holding-metrics.ts");
const positionCalculations = loadTsModule("../components/trader-profile-detail/position-panel-calculations.ts");
const holdings = loadTsModule("../components/trader-profile-detail/holdings.ts", {
  "@/lib/format": {
    formatCurrency: (value) => `$${value}`,
    formatNumber: (value) => String(value ?? "-"),
    formatPercent: (value) => `${value}%`
  },
  "@/components/live-candle-chart-overlays": {
    isOpenChartExposure: (record) => !["closed", "filled", "canceled", "cancelled", "expired", "rejected", "stop_loss", "take_profit", "liquidation"].includes(String(record?.status ?? "open").toLowerCase())
  },
  "@/components/trader-profile-detail/position-panel-rows": {
    isPendingEntryOrder: (order) => {
      const text = [order?.orderType, order?.order_type, order?.type, order?.payload?.purpose]
        .filter(Boolean)
        .map((value) => String(value).toUpperCase())
        .join(" ");
      return !/(STOP_LOSS|TAKE_PROFIT|TP|SL|EXIT|CLOSE|REDUCE)/.test(text);
    }
  },
  "@/components/trader-profile-detail/holding-metrics": {
    firstFiniteNumber: (...values) => {
      for (const value of values) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return null;
    },
    normalizePercentWeight: (value) => value,
    orderExposureValue: () => 100,
    orderHoldingNumbers: (order) => ({
      entryPrice: order.limitPrice ?? order.price ?? null,
      markPrice: null,
      quantity: order.quantity ?? 1,
      leverage: order.leverage ?? 1,
      notional: 100,
      margin: 100,
      accountMarginPercent: 10,
      accountNotionalPercent: 10,
      entryWeight: null,
      pnl: null
    }),
    planEntryHoldingNumbers: () => ({
      entryPrice: 1,
      markPrice: null,
      quantity: 1,
      leverage: 1,
      notional: 100,
      margin: 100,
      accountMarginPercent: 10,
      accountNotionalPercent: 10,
      entryWeight: null,
      pnl: null
    }),
    positionExposureValue: () => 100,
    positionHoldingNumbers: () => ({
      entryPrice: 1,
      markPrice: null,
      quantity: 1,
      leverage: 1,
      notional: 100,
      margin: 100,
      accountMarginPercent: 10,
      accountNotionalPercent: 10,
      entryWeight: null,
      pnl: null
    })
  }
});

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

test("position panel recalculates open PnL from the live chart mark price", () => {
  const shortPosition = {
    side: "short",
    averageEntryPrice: "62389.9",
    quantity: "1.166",
    unrealizedPnl: "75.32"
  };
  const liveMarkAboveEntry = 62573.3;
  const expectedShortPnl = (62389.9 - liveMarkAboveEntry) * 1.166;

  assert.equal(positionCalculations.positionMarkPrice(shortPosition, liveMarkAboveEntry), liveMarkAboveEntry);
  assert.equal(positionCalculations.positionPnl(shortPosition, liveMarkAboveEntry), expectedShortPnl);
  assert.equal(Math.sign(positionCalculations.positionPnl(shortPosition, liveMarkAboveEntry)), -1);

  const longPosition = {
    side: "long",
    entryPrice: "100",
    quantity: "2",
    unrealizedPnl: "-99"
  };
  assert.equal(positionCalculations.positionPnl(longPosition, 105), 10);
});

test("position calculations read partial take-profit ladders from payload", () => {
  const position = {
    side: "short",
    averageEntryPrice: "62853.7",
    quantity: "0.459",
    leverage: 5,
    payload: {
      takeProfits: [
        { price: 63082.4, weight: 0.5, status: "filled", reason: "TP1" },
        { price: 62126.3, weight: 0.5, status: "pending", reason: "TP2" }
      ]
    }
  };

  assert.deepEqual(
    positionCalculations.positionTakeProfitTargets(position).map((item) => ({ price: item.price, status: item.status, index: item.index })),
    [
      { price: 63082.4, status: "filled", index: 0 },
      { price: 62126.3, status: "pending", index: 1 }
    ]
  );
  assert.equal(positionCalculations.positionTargetPrice(position), 62126.3);
  assert.equal(Math.round(positionCalculations.positionLiquidationPrice(position) * 10) / 10, 75424.4);
});

test("holding metrics recalculate position pnl from a live mark override", () => {
  const metrics = holdingMetrics.positionHoldingNumbers({
    side: "short",
    averageEntryPrice: "62853.7",
    markPrice: "62853.7",
    quantity: "0.459",
    margin: "5770",
    unrealizedPnl: "0"
  }, 10_000, 62185.8);

  assert.equal(metrics.markPrice, 62185.8);
  assert.equal(metrics.pnl, Math.round((62853.7 - 62185.8) * 0.459 * 100_000_000) / 100_000_000);
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

test("holdings exclude protective exit orders from active capital deployment", () => {
  // Given: the backend returns one pending entry and two protective exit orders after a managed trade.
  const items = holdings.buildHoldingItems({
    standing: { equity: 10_000, returnPct: 0, summary: {} },
    positions: [],
    orders: [
      { id: 1, symbol: "BTCUSDT", status: "open", side: "long", orderType: "limit", limitPrice: 66000, quantity: 0.02 },
      { id: 2, symbol: "BTCUSDT", status: "open", side: "sell", orderType: "stop_loss", stopPrice: 65000, quantity: 0.02 },
      { id: 3, symbol: "BTCUSDT", status: "open", side: "sell", payload: { purpose: "TAKE_PROFIT" }, price: 69000, quantity: 0.02 }
    ],
    latestPlan: { entries: [], takeProfits: [], notes: [] },
    symbol: "BTCUSDT",
    locale: "ko",
    t: (key) => key
  });

  // Then: only the pending LONG entry contributes to visible holdings and deployment percent.
  assert.deepEqual(items.map((item) => item.id), ["order-1"]);
  assert.equal(holdings.accountDeploymentPercent(items), 10);
});

test("holdings do not show stale plan entries after a trade has ended", () => {
  const items = holdings.buildHoldingItems({
    standing: {
      equity: 10_000,
      returnPct: 0,
      openOrders: 0,
      openPositions: 0,
      summary: {
        latestPlanStatus: null,
        latestRunStatus: "STOP_LOSS",
        openOrders: 0,
        openPositions: 0
      }
    },
    positions: [],
    orders: [],
    latestPlan: {
      status: "PAPER_TRADING_PENDING",
      side: "LONG",
      leverage: 5,
      entries: [
        { price: 65656, weight: 50, reason: "old scale entry" },
        { price: 65853, weight: 50, reason: "old scale entry" }
      ],
      takeProfits: [],
      notes: []
    },
    symbol: "BTCUSDT",
    locale: "ko",
    t: (key) => key
  });

  assert.deepEqual(items.map((item) => item.id), ["cash"]);
  assert.equal(holdings.accountDeploymentPercent(items), 0);
});

test("holdings keep current pending plan entries when the summary marks the plan active", () => {
  const items = holdings.buildHoldingItems({
    standing: {
      equity: 10_000,
      returnPct: 0,
      openOrders: 0,
      openPositions: 0,
      summary: {
        latestPlanStatus: "PAPER_TRADING_PENDING",
        openOrders: 0,
        openPositions: 0
      }
    },
    positions: [],
    orders: [],
    latestPlan: {
      status: "PAPER_TRADING_PENDING",
      side: "LONG",
      leverage: 5,
      entries: [
        { price: 65656, weight: 50, reason: "current scale entry" },
        { price: 65853, weight: 50, reason: "current scale entry" }
      ],
      takeProfits: [],
      notes: []
    },
    symbol: "BTCUSDT",
    locale: "ko",
    t: (key) => key
  });

  assert.deepEqual(items.map((item) => item.id), ["plan-entry-0", "plan-entry-1"]);
  assert.equal(holdings.accountDeploymentPercent(items), 20);
});

function loadTsModule(relativePath, requireStubs = {}) {
  const tsSource = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  const requireShim = (specifier) => {
    if (Object.hasOwn(requireStubs, specifier)) return requireStubs[specifier];
    throw new Error(`Unexpected test import: ${specifier}`);
  };
  Function("exports", "module", "require", outputText)(module.exports, module, requireShim);
  return module.exports;
}
