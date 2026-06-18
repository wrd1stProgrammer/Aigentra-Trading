import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

test("monthly pnl calendar groups snapshots and trade events by day", () => {
  // Given: equity snapshots provide daily account value and realized events fill gaps.
  const pnlCalendar = loadTsModule("../components/trader-profile-detail/pnl-calendar.ts");

  // When: the current month calendar is built.
  const calendar = pnlCalendar.buildMonthlyPnlCalendar({
    now: new Date("2026-06-05T12:00:00Z"),
    locale: "ko",
    startingEquity: 10000,
    snapshots: [
      { equity: 10000, createdAt: "2026-06-01T23:00:00Z" },
      { equity: 9999.99, createdAt: "2026-06-02T23:00:00Z" },
      { equity: 10012.79, createdAt: "2026-06-03T23:00:00Z" },
      { equity: 10028, createdAt: "2026-06-04T23:00:00Z" }
    ],
    events: [
      { realizedPnl: 6.5, createdAt: "2026-06-05T10:00:00Z", eventType: "TAKE_PROFIT" }
    ]
  });

  // Then: cells resemble Binance-style daily +/- PnL and expose asset change.
  const day2 = calendar.days.find((day) => day.dateKey === "2026-06-02");
  const day3 = calendar.days.find((day) => day.dateKey === "2026-06-03");
  const day5 = calendar.days.find((day) => day.dateKey === "2026-06-05");
  assert.equal(calendar.monthLabel, "2026년 6월");
  assert.equal(calendar.weeks.length, 5);
  assert.equal(day2.pnlText, "-0.01");
  assert.equal(day2.tone, "bad");
  assert.equal(day3.pnlText, "+12.80");
  assert.equal(day3.tone, "good");
  assert.equal(day5.pnlText, "+6.50");
  assert.equal(calendar.assetChange.start, 10000);
  assert.equal(calendar.assetChange.current, 10034.5);
  assert.equal(calendar.assetChange.deltaText, "+34.50");
});

test("monthly pnl calendar uses realized event pnl when snapshot and trade history share a UTC day", () => {
  const pnlCalendar = loadTsModule("../components/trader-profile-detail/pnl-calendar.ts");

  const calendar = pnlCalendar.buildMonthlyPnlCalendar({
    now: new Date("2026-06-05T12:00:00Z"),
    locale: "en",
    startingEquity: 10000,
    snapshots: [
      { equity: 10000, createdAt: "2026-06-01T23:00:00Z" },
      { equity: 10002, createdAt: "2026-06-02T23:00:00Z" }
    ],
    dailyPnl: [{ date: "2026-06-02", pnl: 10 }]
  });

  const day2 = calendar.days.find((day) => day.dateKey === "2026-06-02");

  assert.equal(day2.pnlText, "+10.00");
  assert.equal(day2.equity, 10010);
  assert.equal(calendar.assetChange.current, 10010);
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
