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

test("monthly pnl calendar uses backend daily pnl before lifetime equity snapshots", () => {
  const pnlCalendar = loadTsModule("../components/trader-profile-detail/pnl-calendar.ts");

  const calendar = pnlCalendar.buildMonthlyPnlCalendar({
    now: new Date("2026-07-04T12:00:00Z"),
    locale: "en",
    startingEquity: 10000,
    snapshots: [
      { equity: 9389.568877218, unrealizedPnl: 0, createdAt: "2026-07-03T20:30:21.384868Z" }
    ],
    dailyPnl: [
      { date: "2026-07-01", pnl: -249.02687781 },
      { date: "2026-07-02", pnl: 304.88220342 },
      { date: "2026-07-03", pnl: 126.844823448 }
    ]
  });

  const day1 = calendar.days.find((day) => day.dateKey === "2026-07-01");
  const day2 = calendar.days.find((day) => day.dateKey === "2026-07-02");
  const day3 = calendar.days.find((day) => day.dateKey === "2026-07-03");

  assert.equal(day1.pnlText, "-249.03");
  assert.equal(day2.pnlText, "+304.88");
  assert.equal(day3.pnlText, "+126.84");
  assert.equal(day3.tone, "good");
  assert.equal(calendar.assetChange.current.toFixed(2), "9389.57");
  assert.equal(calendar.assetChange.deltaText, "+182.70");
});

test("monthly pnl calendar derives an older month's opening equity from later realized pnl", () => {
  // Given: the latest equity is in July and daily realized PnL spans June and July.
  const pnlCalendar = loadTsModule("../components/trader-profile-detail/pnl-calendar.ts");

  // When: June is selected from the monthly calendar controls.
  const calendar = pnlCalendar.buildMonthlyPnlCalendar({
    now: new Date("2026-06-01T00:00:00Z"),
    locale: "en",
    startingEquity: 10000,
    snapshots: [
      { equity: 10225, unrealizedPnl: 0, createdAt: "2026-07-03T20:30:21.384Z" }
    ],
    dailyPnl: [
      { date: "2026-05-20", pnl: 50 },
      { date: "2026-06-10", pnl: 100 },
      { date: "2026-06-18", pnl: -25 },
      { date: "2026-07-01", pnl: 60 },
      { date: "2026-07-03", pnl: 40 }
    ]
  });

  // Then: June starts before both June and later July gains, and ends after June only.
  assert.equal(calendar.monthLabel, "June 2026");
  assert.equal(calendar.assetChange.start, 10050);
  assert.equal(calendar.assetChange.current, 10125);
  assert.equal(calendar.assetChange.deltaText, "+75.00");
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
