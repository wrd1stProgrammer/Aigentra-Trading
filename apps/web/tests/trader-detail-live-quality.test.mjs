import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const dataSource = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");
const sidePanelsSource = readFileSync(new URL("../components/trader-profile-detail/side-panels.tsx", import.meta.url), "utf8");
const journalSource = readFileSync(new URL("../components/trader-profile-detail/trading-journal.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("management review scenarios use event-aware titles instead of repeated generic labels", () => {
  assert.match(dataSource, /managementReviewScenarioTitle/, "review scenarios need a dedicated semantic title helper");
  assert.match(dataSource, /eventType/, "review titles should consider event type");
  assert.match(dataSource, /actionType|scenario\.action/, "review titles should consider management actions");
  assert.doesNotMatch(
    dataSource,
    /return `\$\{t\("detail\.aiDecision"\)\} · \$\{statusLabel\(scenario\.action \?\? scenario\.status, t\)\}`/,
    "review title must not collapse every management review into AI decision + status"
  );
});

test("holding panel is a scrollable exposure surface without inert more button", () => {
  assert.match(sidePanelsSource, /max-h-\[[^\]]+\][^"`']*overflow-y-auto/, "holdings list should scroll inside the panel");
  assert.doesNotMatch(sidePanelsSource, /t\("detail\.more"\)[\s\S]*<CaretRight size=\{18\}/, "holding panel should not render a non-functional more button");
  assert.match(sidePanelsSource, /data-testid="holding-item"/, "holding rows should be targetable in QA");
});

test("trade history basis button expands real evidence text", () => {
  assert.match(sidePanelsSource, /expandedTradeHistoryId/, "trade history must track the expanded evidence row");
  assert.match(sidePanelsSource, /item\.basisDetail/, "expanded row should show basis detail");
  assert.match(sidePanelsSource, /aria-expanded=\{expanded/, "basis button should expose expanded state");
});

test("trading journal only renders position action journal items", () => {
  assert.match(dataSource, /POSITION_JOURNAL_EVENT_TYPES/, "trade events should be filtered to position-action journal events");
  assert.doesNotMatch(dataSource, /const reviewItems: TradeHistoryItem\[\]/, "AI review-only rows should not become trade journal history");
  assert.doesNotMatch(dataSource, /return plans\.slice/, "passive plans should not become trade journal rows");
  assert.match(journalSource, /positionActionItems/, "journal component should receive filtered position-action items");
});

test("chart surface uses faster initial candle load and production copy", () => {
  assert.match(chartSource, /"1h": 120/, "default hourly chart should load a compact first window");
  assert.doesNotMatch(chartSource, /TradingView Lightweight Charts/, "chart subtitle should not expose implementation-library copy");
  assert.match(chartSource, /chart\.liveSource/, "chart should use localized product source copy");
});

test("detail bundle uses cached placeholder data without blocking live fetch", () => {
  assert.match(apiSource, /getCachedTraderDetailBundle/, "detail bundle cache reader should exist");
  assert.match(apiSource, /TRADER_DETAIL_BROWSER_CACHE_MS = 60_000/, "detail trading-state placeholders should expire faster than static leaderboard placeholders");
  assert.match(apiSource, /getCachedTraderDetailBundle[\s\S]*TRADER_DETAIL_BROWSER_CACHE_MS/, "detail cache reader should use the short trading-state TTL");
  assert.doesNotMatch(pageSource, /initialData/, "placeholder/fallback data must not be treated as fresh live data");
  assert.match(pageSource, /placeholderData[\s\S]*getCachedTraderDetailBundle/, "detail page should use browser cache only as placeholder data");
});
