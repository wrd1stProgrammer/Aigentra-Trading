import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const dataSource = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");
const sidePanelsSource = readFileSync(new URL("../components/trader-profile-detail/side-panels.tsx", import.meta.url), "utf8");
const journalSource = readFileSync(new URL("../components/trader-profile-detail/trading-journal.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const calendarPanelSource = readFileSync(new URL("../components/trader-profile-detail/pnl-calendar-panel.tsx", import.meta.url), "utf8");
const executionRailSource = readFileSync(new URL("../components/trader-profile-detail/execution-marker-rail.tsx", import.meta.url), "utf8");
const detailLoadingPolicy = loadTsModule("../lib/trader-detail-loading-policy.ts");

test("management review scenarios use event-aware titles instead of repeated generic labels", () => {
  assert.match(dataSource, /managementReviewScenarioTitle/, "review scenarios need a dedicated semantic title helper");
  assert.match(dataSource, /eventType/, "review titles should consider event type");
  assert.match(dataSource, /actionType|scenario\.action/, "review titles should consider management actions");
  assert.match(dataSource, /reviewTitleTopic/, "review titles should be compact topic labels");
  assert.match(i18nSource, /detail\.reviewTitle\.volumeCaution/, "review title topics should be localized");
  assert.doesNotMatch(dataSource, /reviewNarrativeTitle/, "review titles should not promote long AI prose into the row title");
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

test("trade history removes basis affordances from the execution log", () => {
  assert.doesNotMatch(sidePanelsSource, /expandedTradeHistoryId/, "trade history should not track hidden evidence expanders");
  assert.doesNotMatch(sidePanelsSource, /item\.basisDetail/, "execution log should not render hidden basis detail");
  assert.doesNotMatch(sidePanelsSource, /aria-expanded=\{expanded/, "basis label should not expose expandable state");
  assert.doesNotMatch(sidePanelsSource, /\{item\.basis\}/, "execution log should not render a basis chip");
});

test("trading journal only renders position action journal items", () => {
  assert.match(dataSource, /POSITION_JOURNAL_EVENT_TYPES/, "trade events should be filtered to position-action journal events");
  assert.doesNotMatch(dataSource, /const reviewItems: TradeHistoryItem\[\]/, "AI review-only rows should not become trade journal history");
  assert.doesNotMatch(dataSource, /return plans\.slice/, "passive plans should not become trade journal rows");
  assert.match(journalSource, /positionActionItems/, "journal component should receive filtered position-action items");
});

test("mobile trading journal renders persisted fee and role instead of fabricating them", () => {
  assert.doesNotMatch(journalSource, /0\.0005/, "journal must not estimate fees with a hard-coded rate");
  assert.doesNotMatch(journalSource, /Math\.floor\(qtyNum \* 10000\)/, "journal must not invent maker/taker role from number parity");
  assert.match(journalSource, /item\.feeLabel/, "journal should render the serialized event fee");
  assert.match(journalSource, /item\.feeRole/, "journal should render the serialized event role");
  assert.match(dataSource, /feeLabel:/, "history normalization should preserve event fee display data");
  assert.match(dataSource, /feeRole:/, "history normalization should preserve event fee role");
});

test("chart surface uses faster initial candle load and production copy", () => {
  assert.match(chartSource, /const DEFAULT_INTERVAL: ChartInterval = "5m"/, "detail chart should open on the 5 minute candle interval");
  assert.match(chartSource, /const limit = candleLimitForInterval\(interval\)/, "initial candle load should use the interval-specific optimized window");
  assert.doesNotMatch(chartSource, /TradingView Lightweight Charts/, "chart subtitle should not expose implementation-library copy");
  assert.match(chartSource, /chart\.liveSource/, "chart should use localized product source copy");
});

test("trader detail header keeps execution rail without monitoring tabs", () => {
  assert.match(pageSource, /ExecutionMarkerRail/, "detail page should keep the recent execution rail above the chart");
  assert.doesNotMatch(pageSource, /<TabButton/, "detail page should not render the old monitoring analysis info tab strip");
  assert.doesNotMatch(pageSource, /detail\.monitoring/, "detail page should not render the old monitoring tab label");
});

test("monthly pnl panel exposes accessible previous and next month controls", () => {
  assert.match(calendarPanelSource, /onPreviousMonth/, "calendar should expose previous-month navigation");
  assert.match(calendarPanelSource, /onNextMonth/, "calendar should expose next-month navigation");
  assert.match(calendarPanelSource, /calendar\.previousMonth/, "previous-month control should have localized accessible copy");
  assert.match(calendarPanelSource, /calendar\.nextMonth/, "next-month control should have localized accessible copy");
  assert.match(pageSource, /usePnlCalendarNavigation/, "desktop and mobile calendars should share one month selection state");
  assert.match(calendarPanelSource, /flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between/, "mobile calendar header should not squeeze and split the Korean title");
  assert.match(calendarPanelSource, /w-full shrink-0 items-center justify-between[^"]*sm:w-auto/, "mobile month controls should use their own full-width row");
  assert.match(calendarPanelSource, /compactPnlText\(day\.pnl\)/, "large daily pnl values should use a compact mobile label instead of overlapping adjacent days");
});

test("locked recent execution coupon stays centered inside its own chip", () => {
  assert.match(executionRailSource, /fitContent/, "execution gates should size themselves to the protected chip");
  assert.match(executionRailSource, /data-testid="execution-marker-locked-gate"/, "locked chip geometry should be targetable in browser QA");
});

test("detail bundle uses cached placeholder data without treating it as live fetch completion", () => {
  assert.match(apiSource, /getCachedTraderDetailBundle/, "detail bundle cache reader should exist");
  assert.match(apiSource, /TRADER_DETAIL_BROWSER_CACHE_MS = 60_000/, "detail trading-state placeholders should expire faster than static leaderboard placeholders");
  assert.match(apiSource, /getCachedTraderDetailBundle[\s\S]*TRADER_DETAIL_BROWSER_CACHE_MS/, "detail cache reader should use the short trading-state TTL");
  assert.doesNotMatch(pageSource, /initialData/, "placeholder/fallback data must not be treated as fresh live data");
  assert.match(pageSource, /placeholderData[\s\S]*getCachedTraderDetailBundle/, "detail page should use browser cache only as placeholder data");
  assert.match(pageSource, /hydratedDetailContextKey/, "detail page should track when a real network bundle has hydrated the current trader context");
});

test("trader detail does not auto-expand heavy review limits before user scroll", () => {
  assert.doesNotMatch(pageSource, /setReviewsLimit\(\(current\) => current \+ 20\)/, "detail page should not immediately grow review fetch size just to fill the selected date");
  assert.doesNotMatch(pageSource, /setReviewsLimit\(\(current\) => current \+ 30\)/, "detail page should not hydrate whole weeks on initial render");
  assert.match(pageSource, /loadMoreSelectedScenarios/, "manual scroll/load-more should remain the way to fetch older reviews");
});

test("trader detail shows centered loading affordances for review and chart data", () => {
  assert.match(pageSource, /PageLoadingOverlay/, "trader detail should use the shared centered loading overlay");
  assert.match(pageSource, /common\.loadingTraderDetailData/, "detail loading copy should be localized");
  assert.match(chartSource, /showInitialChartSpinner/, "live chart should expose an initial candle-loading spinner state");
  assert.match(chartSource, /CircleNotch/, "chart loading UI should use a visible spinner instead of only skeleton pulses");
  assert.doesNotMatch(chartSource, /<span className="text-xs font-bold">\{t\("chart\.loadingHistory"\)\}<\/span>/, "chart should not flash visible historical-loading copy over the chart");
  assert.match(i18nSource, /"common\.loadingTraderDetailData"/, "trader-detail loading copy should exist in the dictionary");
});

test("trader detail loading policy keeps fallback content visible during slow refetches", () => {
  assert.equal(
    detailLoadingPolicy.shouldShowTraderDetailInitialOverlay({
      hasRenderableDetail: true,
      isFetching: true,
      isHydratedDetail: false
    }),
    false,
    "cached or leaderboard fallback detail should remain visible while the live bundle refetches"
  );
  assert.equal(
    detailLoadingPolicy.shouldShowTraderDetailInitialOverlay({
      hasRenderableDetail: false,
      isFetching: true,
      isHydratedDetail: false
    }),
    true,
    "a genuinely empty detail view should still show the initial overlay while fetching"
  );
  assert.equal(
    detailLoadingPolicy.shouldShowTraderDetailInitialOverlay({
      hasRenderableDetail: false,
      isFetching: true,
      isHydratedDetail: true
    }),
    false,
    "a hydrated detail context should not re-open the full-page overlay"
  );
  assert.equal(
    detailLoadingPolicy.shouldShowTraderDetailInitialOverlay({
      hasRenderableDetail: false,
      isFetching: false,
      isHydratedDetail: false
    }),
    false,
    "idle detail views should not show a loading overlay"
  );
});

function loadTsModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: module.exports,
    module
  });
  return module.exports;
}
