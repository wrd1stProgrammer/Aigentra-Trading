import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/trader-profile-detail/chart.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/trader-profile-detail/detail-sidebar.tsx", import.meta.url), "utf8");

test("trader detail wires realized events, completed chart markers, and pnl calendar panel", () => {
  assert.match(pageSource, /buildScenarioTimelineItems\(\{\s*scenarios,\s*reviews,/s);
  assert.doesNotMatch(pageSource, /buildScenarioTimelineItems\(\{\s*scenarios,\s*events,/s);
  assert.match(pageSource, /paperEvents=\{chartEvents\}/);
  assert.match(pageSource, /reviewCountsByDay/);
  assert.match(pageSource, /scenarioCountByDate/);
  assert.match(pageSource, /tradeHistoryItems=\{historyItems\}/);
  assert.doesNotMatch(pageSource, /historyItems\.slice\(0, eventsLimit\)/);
  assert.match(pageSource, /DetailSidebar/);
  assert.match(pageSource, /buildMonthlyPnlCalendar/);
  assert.match(chartSource, /paperEvents/);
  assert.match(sidebarSource, /PnlCalendarPanel/);
});
