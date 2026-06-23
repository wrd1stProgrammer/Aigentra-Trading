import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const dataSource = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");
const aiReviewPanelSource = readFileSync(new URL("../components/ai-review-panel.tsx", import.meta.url), "utf8");
const reviewBriefSummarySource = readFileSync(new URL("../components/review-brief-summary.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../components/trader-profile-detail/timeline.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../components/trader-profile-detail/header.tsx", import.meta.url), "utf8");
const holdingsSource = readFileSync(new URL("../components/trader-profile-detail/holdings.ts", import.meta.url), "utf8");
const sidePanelsSource = readFileSync(new URL("../components/trader-profile-detail/side-panels.tsx", import.meta.url), "utf8");
const journalSource = readFileSync(new URL("../components/trader-profile-detail/trading-journal.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const detailChartSource = readFileSync(new URL("../components/trader-profile-detail/chart.tsx", import.meta.url), "utf8");
const binancePanelSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-panel.tsx", import.meta.url), "utf8");
const mobileBinancePanelSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-mobile-cards.tsx", import.meta.url), "utf8");
const positionPanelRowsSource = readFileSync(new URL("../components/trader-profile-detail/position-panel-rows.ts", import.meta.url), "utf8");
const scenarioFeedSource = readFileSync(new URL("../components/trader-profile-detail/scenario-feed.ts", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

const overlayHelpers = loadTsModule("../components/live-candle-chart-overlays.ts");
const reviewDisplay = loadTsModule("../lib/review-display.ts");
const scenarioCopy = loadTsModule("../components/trader-profile-detail/scenario-copy.ts", {
  "@/lib/review-display": reviewDisplay
});
const scenarioDedupe = loadTsModule("../components/trader-profile-detail/scenario-dedupe.ts");

test("AI management scenarios normalize short English reason labels and expose four-level importance", () => {
  assert.match(dataSource, /scenarioDisplayText/, "scenario bodies should run through a display-text normalizer");
  assert.match(dataSource, /scenarioImportance/, "scenario timeline should derive an importance level");
  assert.match(timelineSource, /importanceBadge/, "timeline rows should show a visible importance badge");
  assert.match(modalSource, /importanceBadge/, "scenario modal should show the same importance badge");
  assert.match(i18nSource, /scenario\.reason\.continuationConfirmation/, "Continuation confirmation needs localized labels");
  assert.match(i18nSource, /importance\.critical/, "importance needs a critical label");
  assert.match(i18nSource, /importance\.important/, "importance needs an important label");
  assert.match(i18nSource, /importance\.watch/, "importance needs a watch label");
  assert.match(i18nSource, /importance\.routine/, "importance needs a routine label");
});

test("AI management reason copy removes raw event tokens inside long review sentences", () => {
  const translated = scenarioCopy.scenarioDisplayText(
    "channel_stop_tightened 이벤트를 감지했고 hard risk 규칙 안에서 MOVE_STOP_TO_BREAKEVEN 조치를 검토했습니다.",
    (key) =>
      ({
        "scenario.reason.channelStopTightenedShort": "채널 리스크 손절 조정",
        "scenario.reason.hardRisk": "강제 리스크",
        "scenario.reason.moveStopToBreakeven": "손절 본절 이동"
      })[key] ?? key
  );

  assert.equal(
    translated,
    "채널 리스크 손절 조정 이벤트를 감지했고 강제 리스크 규칙 안에서 손절 본절 이동 조치를 검토했습니다."
  );
});

test("latest scenario timeline preserves distinct management review records", () => {
  const scenarios = [
    {
      id: "review-84",
      source: "review",
      phase: "PENDING_ORDER",
      eventType: "scale_entry_cancelled",
      action: "CANCEL_REMAINING_ORDERS",
      side: "SHORT",
      status: "HOLD"
    },
    {
      id: "review-83",
      source: "review",
      phase: "PENDING_ORDER",
      eventType: "scale_entry_cancelled",
      action: "CANCEL_REMAINING_ORDERS",
      side: "SHORT",
      status: "HOLD"
    },
    {
      id: "review-83",
      source: "review",
      phase: "PENDING_ORDER",
      eventType: "scale_entry_cancelled",
      action: "CANCEL_REMAINING_ORDERS",
      side: "SHORT",
      status: "HOLD"
    },
    {
      id: "review-82",
      source: "review",
      phase: "OPEN_POSITION",
      eventType: "scale_entry_cancelled",
      action: "CANCEL_REMAINING_ORDERS",
      side: "SHORT",
      status: "HOLD"
    },
    {
      id: "order-1",
      source: "order",
      phase: "PENDING_ORDER",
      side: "SHORT"
    }
  ];

  const deduped = scenarioDedupe.dedupeScenarioTimelineScenarios(scenarios);

  assert.deepEqual(
    deduped.map((scenario) => scenario.id),
    ["review-84", "review-83", "review-82", "order-1"]
  );
});

test("latest scenario timeline keeps distinct review ids even inside the same minute and price bucket", () => {
  const scenarios = [
    {
      id: "review-101",
      source: "review",
      createdAt: "2026-06-17T12:00:10Z",
      phase: "OPEN_POSITION",
      side: "LONG",
      price: 65251
    },
    {
      id: "review-102",
      source: "review",
      createdAt: "2026-06-17T12:00:35Z",
      phase: "OPEN_POSITION",
      side: "LONG",
      price: 65249
    },
    {
      id: "review-101",
      source: "review",
      createdAt: "2026-06-17T12:00:10Z",
      phase: "OPEN_POSITION",
      side: "LONG",
      price: 65251
    }
  ];

  const deduped = scenarioDedupe.dedupeScenarioTimelineScenarios(scenarios);

  assert.deepEqual(deduped.map((scenario) => scenario.id), ["review-101", "review-102"]);
});

test("latest scenario timeline hides passive pending heartbeat paired with position heartbeat", () => {
  const scenarios = [
    {
      id: "review-202",
      source: "review",
      createdAt: "2026-06-22T05:27:49Z",
      phase: "OPEN_POSITION",
      eventType: "imbalance_hunter_position_heartbeat",
      action: "HOLD",
      status: "HOLD",
      side: "SHORT",
      price: 64184.2
    },
    {
      id: "review-201",
      source: "review",
      createdAt: "2026-06-22T05:26:57Z",
      phase: "PENDING_ORDER",
      eventType: "imbalance_hunter_pending_heartbeat",
      action: "HOLD",
      status: "HOLD",
      side: "SHORT",
      price: 64184.2
    },
    {
      id: "review-200",
      source: "review",
      createdAt: "2026-06-22T05:25:57Z",
      phase: "PENDING_ORDER",
      eventType: "imbalance_hunter_pending_invalid",
      action: "CANCEL_PENDING_ORDER",
      status: "CANCEL_PENDING_ORDER",
      side: "SHORT",
      price: 64184.2
    }
  ];

  assert.deepEqual(
    scenarioDedupe.dedupeScenarioTimelineScenarios(scenarios).map((scenario) => scenario.id),
    ["review-202", "review-200"]
  );
});

test("review facts replace user summary in visible review UI", () => {
  assert.match(aiReviewPanelSource, /reviewFacts/, "AI review panel should render structured review facts");
  assert.match(apiSource, /reviewFacts/, "API types should expose structured review facts");
  assert.match(aiReviewPanelSource, /ReviewBriefSummary/, "AI review panel should prefer beginner-readable structured reviews");
  assert.match(apiSource, /structuredReview/, "API types should expose structured AI review briefs");
  assert.match(scenarioFeedSource, /managementReviewTimelineBody/, "latest scenarios should use concise structured review summaries when available");
  assert.match(modalSource, /ReviewBriefSummary/, "scenario modal should show structured review sections");
  assert.match(i18nSource, /reviewFact\.entryGeometryChecked/, "review fact labels should be localized");
  assert.match(i18nSource, /aiReview\.watchConditions/, "structured review sections need localized labels");
  assert.doesNotMatch(aiReviewPanelSource, /aiReview\.userSummary|사용자 요약|User Summary/);
  assert.doesNotMatch(modalSource, /aiReview\.userSummary|사용자 요약|User Summary/);
  assert.doesNotMatch(i18nSource, /"aiReview\.userSummary"/);
});

test("scenario modal uses a compact reference-style ratio and neutral rationale card", () => {
  assert.match(modalSource, /max-w-\[920px\]/, "scenario modal should use a narrower reference-style width");
  assert.doesNotMatch(modalSource, /max-w-7xl/, "scenario modal should not use an oversized max width");
  assert.match(modalSource, /height=\{320\}/, "modal chart should use a compact inspection height");
  assert.doesNotMatch(reviewBriefSummarySource, /border-l-2 border-emerald-500\/70/, "management rationale cards should not use a green side stripe");
});

test("pullback scale-entry cancellation copy is localized instead of raw template text", () => {
  const translated = scenarioCopy.scenarioDisplayText(
    "scale_entry_cancelled 이벤트를 감지했고 staged_pullback 보유 정책 안에서 CANCEL_REMAINING_ORDERS 조치를 검토했습니다.",
    (key) =>
      ({
        "scenario.reason.scaleEntryCancelledCancelRemaining":
          "EMA50 판단 구간이 깨져 분할 진입 조건이 약해졌고, 남은 대기 주문 취소를 검토했습니다.",
        "scenario.reason.scaleEntryCancelledShort": "분할 진입 취소 조건",
        "scenario.reason.stagedPullback": "분할 눌림목",
        "scenario.reason.cancelRemainingOrders": "잔여 주문 취소"
      })[key] ?? key
  );

  assert.equal(translated, "EMA50 판단 구간이 깨져 분할 진입 조건이 약해졌고, 남은 대기 주문 취소를 검토했습니다.");
  assert.doesNotMatch(translated, /scale_entry_cancelled|staged_pullback|CANCEL_REMAINING_ORDERS/);
});

test("chart marks completed take-profit levels from backend state and prefers latest AI management levels", () => {
  assert.equal(
    overlayHelpers.isFutureTakeProfit({ side: "SHORT", targetPrice: 62524.3, latestPrice: 62393.3 }),
    false,
    "short TP above the latest price has already been hit"
  );
  assert.equal(
    overlayHelpers.isFutureTakeProfit({ side: "SHORT", targetPrice: 60881.5, latestPrice: 62393.3 }),
    true,
    "short TP still below latest price should remain visible"
  );
  assert.match(chartSource, /managementReviews/, "chart should receive AI management reviews for latest stop\\/target overrides");
  assert.match(chartSource, /latestManagedStopLoss/, "position stop overlays should prefer the latest AI-managed stop");
  assert.equal(
    overlayHelpers.shouldMarkTakeProfitCompleted({
      exposureKind: "position",
      side: "SHORT",
      targetPrice: 62524.3,
      latestPrice: 62393.3
    }),
    false,
    "live position TP should not become completed from latest-price inference alone"
  );
  assert.equal(
    overlayHelpers.shouldMarkTakeProfitCompleted({
      exposureKind: "position",
      side: "SHORT",
      targetPrice: 62524.3,
      latestPrice: 62393.3,
      completed: "filled"
    }),
    true,
    "filled target status from backend should render a completed marker"
  );
  assert.match(chartSource, /takeProfitState/, "take-profit overlays should derive active vs completed state from backend status");
  assert.match(chartSource, /takeProfitDone/, "backend-completed take-profit overlays should remain as completed markers");
  assert.match(chartSource, /detail\.takeProfitCompleted/, "completed take-profit marker labels should be localized");
});

test("trader detail header binds trader names descriptions and desk aliases through i18n keys", () => {
  assert.match(headerSource, /traderNameKey/, "header should not render backend trader.name directly");
  assert.match(headerSource, /traderDetailKey/, "header should use richer localized trader descriptions");
  assert.match(headerSource, /traderAliasKey/, "header should localize the desk alias");
  assert.match(i18nSource, /traders\.channel-rider\.alias/, "desk aliases need localization keys");
  assert.match(i18nSource, /traders\.channel-rider\.detail/, "richer trader descriptions need localization keys");
  assert.match(i18nSource, /"traders\.channel-rider\.name": "채널 항해사"/, "Korean trader names should be localized, not English literals");
});

test("holdings use thin account-deployment gauge instead of thick per-item share bar", () => {
  assert.match(holdingsSource, /deploymentPercent/, "holding items should carry account deployment percent");
  assert.match(holdingsSource, /accountDeploymentPercent/, "top gauge should compute account-level deployed margin");
  assert.match(sidePanelsSource, /h-2/, "holding gauge should be a thin fill bar");
  assert.doesNotMatch(sidePanelsSource, /h-9/, "old thick gauge should not remain");
});

test("closed stop-loss exposures are removed from active detail surfaces", () => {
  assert.equal(overlayHelpers.isOpenChartExposure({ status: "stop_loss" }), false, "stop-loss close status must not stay active");
  assert.equal(overlayHelpers.shouldRenderRealizedEventOverlays({ hasOpenPaperPosition: false, hasOpenPaperOrder: false }), false);
  assert.match(chartSource, /shouldRenderRealizedEventOverlays\(\{ hasOpenPaperPosition, hasOpenPaperOrder \}\)/);
  assert.match(holdingsSource, /isOpenChartExposure\(position\)/, "holdings should exclude closed positions");
  assert.match(holdingsSource, /isPendingEntryOrder\(order\)/, "holdings should exclude closed and protective orders");
  assert.match(binancePanelSource, /isOpenChartExposure\(position\)/, "position table should exclude closed positions");
  assert.match(positionPanelRowsSource, /isOpenChartExposure\(order\)/, "open-order table should exclude closed orders");
  assert.match(scenarioFeedSource, /hasSavedAiApproval\(scenario\)/, "latest scenarios should keep saved entry approvals separate from active exposure filtering");
});

test("main journal is a scrollable trade-history table and sidebar history uses a distinct execution-log name", () => {
  assert.match(journalSource, /<table/, "main transaction history should use a dense table layout");
  assert.match(journalSource, /max-h-\[[^\]]+\][^"`']*overflow-y-auto/, "main transaction table should scroll vertically");
  assert.match(journalSource, /sideBadgeClass/, "direction should render as a LONG\\/SHORT badge");
  assert.match(journalSource, /pnlClass/, "PnL should be color coded");
  assert.doesNotMatch(journalSource, /CaretRight/, "old inert carousel arrows should be removed");
  assert.match(sidePanelsSource, /detail\.executionLog/, "sidebar should use a distinct execution log label");
  assert.doesNotMatch(sidePanelsSource, /items\.slice\(0, 5\)/, "sidebar history should scroll all available rows instead of truncating to five");
});

test("trader detail uses one profit and loss color language across panels", () => {
  assert.match(dataSource, /if \(tone === "good"\) return "text-emerald/, "good movement tone should use profit-green semantics");
  assert.match(dataSource, /if \(tone === "bad"\) return "text-rose/, "bad movement tone should use loss-red semantics");
  assert.match(sidePanelsSource, /item\.returnPct >= 0 \? "text-emerald/, "positive holding returns should use green text");
  assert.match(sidePanelsSource, /: "text-rose/, "negative holding returns should use red text");
  assert.match(sidePanelsSource, /if \(tone === "good"\) return "text-emerald/, "positive holding detail PnL should use green text");
  assert.match(sidePanelsSource, /if \(tone === "bad"\) return "text-rose/, "negative holding detail PnL should use red text");
  assert.match(headerSource, /standing\.returnPct >= 0 \? "text-emerald/, "positive header PnL should use green text");
  assert.doesNotMatch(sidePanelsSource, /item\.returnPct >= 0 \? "text-red/, "positive holding returns must not render as red");
  assert.doesNotMatch(headerSource, /standing\.returnPct >= 0 \? "text-red/, "positive header PnL must not render as red");
  assert.doesNotMatch(dataSource, /if \(tone === "good"\) return "text-red/, "good movement tone must not render as red");
});

test("sidebar execution log uses the same load-more guards as the main trade journal", () => {
  const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
  const sidebarSource = readFileSync(new URL("../components/trader-profile-detail/detail-sidebar.tsx", import.meta.url), "utf8");

  assert.match(sidePanelsSource, /hasMore\s*=\s*false/, "execution log panel should accept a hasMore guard");
  assert.match(sidePanelsSource, /loadingMore\s*=\s*false/, "execution log panel should accept a loading guard");
  assert.match(sidePanelsSource, /if \(!onLoadMore \|\| loadingMore \|\| !hasMore\) return/, "execution log scroll should not fire while loading or exhausted");
  assert.match(sidebarSource, /historyHasMore/, "sidebar should receive the shared history has-more state");
  assert.match(sidebarSource, /loadingMoreHistory/, "sidebar should receive the shared loading state");
  assert.match(pageSource, /if \(loadingMoreHistory \|\| !historyHasMore\) return/, "detail page should avoid extra history fetches when already loading or exhausted");
});

test("trade history uses closed positions and normalized user-facing result labels", () => {
  assert.match(dataSource, /closedPositions/, "closed positions should feed realized trade history");
  assert.match(dataSource, /buildClosedPositionHistoryItem/, "closed position rows should preserve average entry and realized PnL");
  assert.match(dataSource, /detail\.resultTakeProfit/, "take-profit results should use a localized label");
  assert.match(dataSource, /detail\.resultStopLoss/, "stop-loss results should use a localized label");
  assert.match(dataSource, /detail\.resultBreakeven/, "breakeven results should use a localized label");
  assert.doesNotMatch(dataSource, /Position Closed: take_profit/, "developer event strings should not be emitted directly");
});

test("detail chart includes a Binance-style paper position panel below the chart", () => {
  assert.match(detailChartSource, /BinancePositionPanel/, "detail chart should render the Binance-style position panel");
  assert.match(binancePanelSource, /data-testid="binance-position-panel"/, "position panel needs a stable QA target");
  assert.match(binancePanelSource, /detail\.positionTabPositions/, "position tab label should be localized");
  assert.match(binancePanelSource, /detail\.positionEntryPrice/, "position table should show entry price");
  assert.match(binancePanelSource, /detail\.positionPnlRoe/, "position table should show PnL and ROE");
});

test("Binance-style paper panel has mobile cards before desktop wide tables", () => {
  assert.match(binancePanelSource, /MobilePositionCards/, "panel should render mobile cards");
  assert.match(binancePanelSource, /hidden overflow-x-auto md:block/, "wide desktop tables should be hidden on mobile");
  assert.match(mobileBinancePanelSource, /data-testid="mobile-position-cards"/, "mobile cards should be testable");
  assert.match(mobileBinancePanelSource, /grid grid-cols-2 gap-2/, "mobile cards should summarize key metrics in two columns");
  assert.match(mobileBinancePanelSource, /mobileExposureCardClass/, "mobile cards should tint long and short exposure differently");
  assert.match(binancePanelSource, /positionRowClass/, "desktop rows should tint long and short exposure differently");
});

test("Binance-style paper panel supports light theme and stays out of scenario modal charts", () => {
  assert.match(binancePanelSource, /dark:bg-\[#11161c\]/, "dark-mode Binance panel skin should remain available");
  assert.match(binancePanelSource, /bg-white/, "light-mode Binance panel skin should be explicit");
  assert.doesNotMatch(binancePanelSource, /positionTabOrderHistory/, "panel should not render inactive placeholder tabs");
  assert.match(detailChartSource, /showPositionPanel/, "detail chart should expose a switch for modal usage");
  assert.match(modalSource, /showPositionPanel=\{false\}/, "scenario modal should hide the extra position panel");
});

test("trader detail browser cache placeholders wait until after hydration", () => {
  assert.match(profileSource, /const \[clientHydrated, setClientHydrated\] = useState\(false\)/, "detail cache readiness should be client-state driven");
  assert.match(profileSource, /useEffect\(\(\) => \{\s*setClientHydrated\(true\);\s*\}, \[\]\);/s, "detail cache should only activate after mount");
  assert.match(profileSource, /clientHydrated \? getCachedTraderDetailBundle/, "localStorage-backed detail cache should not run during hydration");
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
