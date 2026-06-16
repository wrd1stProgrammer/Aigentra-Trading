import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const dataSource = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../components/trader-profile-detail/timeline.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../components/trader-profile-detail/header.tsx", import.meta.url), "utf8");
const holdingsSource = readFileSync(new URL("../components/trader-profile-detail/holdings.ts", import.meta.url), "utf8");
const sidePanelsSource = readFileSync(new URL("../components/trader-profile-detail/side-panels.tsx", import.meta.url), "utf8");
const journalSource = readFileSync(new URL("../components/trader-profile-detail/trading-journal.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const detailChartSource = readFileSync(new URL("../components/trader-profile-detail/chart.tsx", import.meta.url), "utf8");
const binancePanelSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-panel.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

const overlayHelpers = loadTsModule("../components/live-candle-chart-overlays.ts");
const scenarioCopy = loadTsModule("../components/trader-profile-detail/scenario-copy.ts");
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
  assert.match(headerSource, /traderShortKey/, "header should localize the trader concept/description");
  assert.match(headerSource, /traderAliasKey/, "header should localize the desk alias");
  assert.match(i18nSource, /traders\.channel-rider\.alias/, "desk aliases need localization keys");
  assert.match(i18nSource, /"traders\.channel-rider\.name": "채널 라이더"/, "Korean trader names should be localized, not English literals");
});

test("holdings use thin account-deployment gauge instead of thick per-item share bar", () => {
  assert.match(holdingsSource, /deploymentPercent/, "holding items should carry account deployment percent");
  assert.match(holdingsSource, /accountDeploymentPercent/, "top gauge should compute account-level deployed margin");
  assert.match(sidePanelsSource, /h-2/, "holding gauge should be a thin fill bar");
  assert.doesNotMatch(sidePanelsSource, /h-9/, "old thick gauge should not remain");
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

test("Binance-style paper panel supports light theme and stays out of scenario modal charts", () => {
  assert.match(binancePanelSource, /dark:bg-\[#11161c\]/, "dark-mode Binance panel skin should remain available");
  assert.match(binancePanelSource, /bg-white/, "light-mode Binance panel skin should be explicit");
  assert.doesNotMatch(binancePanelSource, /positionTabOrderHistory/, "panel should not render inactive placeholder tabs");
  assert.match(detailChartSource, /showPositionPanel/, "detail chart should expose a switch for modal usage");
  assert.match(modalSource, /showPositionPanel=\{false\}/, "scenario modal should hide the extra position panel");
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
