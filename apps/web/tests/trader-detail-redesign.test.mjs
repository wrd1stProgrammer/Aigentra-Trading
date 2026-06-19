import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const sourceFiles = [
  "../components/trader-profile-page-client.tsx",
  "../components/trader-profile-detail/data.ts",
  "../components/trader-profile-detail/holdings.ts",
  "../components/trader-profile-detail/holding-metrics.ts",
  "../components/trader-profile-detail/plan.ts",
  "../components/trader-profile-detail/chart.tsx",
  "../components/live-candle-chart.tsx",
  "../components/trader-profile-detail/header.tsx",
  "../components/trader-profile-detail/timeline.tsx",
  "../components/trader-profile-detail/status-feed-thread.tsx",
  "../components/trader-profile-detail/side-panels.tsx",
  "../components/trader-profile-detail/trading-journal.tsx",
  "../components/trader-profile-detail/scenario-modal.tsx"
];
const source = sourceFiles.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
const statusFeedModule = loadStatusFeedModule();

function loadStatusFeedModule() {
  const tsx = readFileSync(new URL("../components/trader-profile-detail/status-feed-thread.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(tsx, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const module = { exports: {} };
  const componentRequire = (id) => {
    if (id === "@/lib/format") return { formatRelativeDateTime: () => "방금 전" };
    return require(id);
  };
  vm.runInNewContext(
    compiled,
    { exports: module.exports, module, require: componentRequire },
    { filename: "status-feed-thread.tsx" }
  );
  return module.exports;
}

function t(key) {
  const labels = {
    "detail.noStatusFeed": "피드 없음",
    "detail.statusFeed": "트레이더 피드",
    "detail.statusFeedThread": "최근 쓰레드",
    "leaderboard.latestStatusFeed": "최근 피드",
    "leaderboard.noStatusFeed": "아직 피드가 없습니다"
  };
  return labels[key] ?? key;
}

const legacyWatchFeed = {
  id: 1,
  createdAt: "2026-06-19T00:00:00.000Z",
  headline: "숏 포지션 종료",
  message: "익절하고 쉬는 중. 다음 타점은 억지로 안 잡고 기다립니다.",
  payload: {
    headline: "숏 포지션 종료",
    message: "익절하고 쉬는 중. 다음 타점은 억지로 안 잡고 기다립니다.",
    watch: "다음 확인 · 거래량 확인; 15분 동안 붕괴된 지지선 내로 다시 마감."
  },
  stateKey: "position_closed",
  watch: "다음 확인 · 거래량 확인; 15분 동안 붕괴된 지지선 내로 다시 마감."
};

test("trader detail exposes reference-style monitoring layout regions", () => {
  assert.match(source, /data-testid="trader-detail-monitoring-shell"/, "detail page should expose the redesigned monitoring shell");
  assert.match(source, /data-testid="top-chart-panel"/, "detail page should keep the chart in a top monitoring panel");
  assert.match(source, /data-testid="trader-status-feed-thread"/, "detail page should expose the trader status feed thread next to the chart");
  assert.match(source, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(300px,1fr\)\]/, "top monitoring row should split chart and feed at roughly 3/4 to 1/4 width");
  assert.match(source, /showPositionPanel=\{false\}/, "top monitoring row should not keep the position panel trapped under the chart column");
  assert.match(source, /data-testid="detail-full-width-position-panel"/, "position panel should sit below the chart/feed row at full content width");
  assert.match(source, /data-testid="scenario-timeline"/, "detail page should expose a latest scenario timeline region");
  assert.match(source, /data-testid="holding-panel"/, "detail page should expose the right holding allocation panel");
  assert.match(source, /data-testid="trade-history-panel"/, "detail page should expose the right trade history panel");
  assert.match(source, /data-testid="management-journal"/, "detail page should expose the lower management journal region");
});

test("status feed thread reads like a note without next-watch labels", () => {
  assert.doesNotMatch(source, /detail\.statusFeedWatch/, "status feed should not render a labeled next-watch line");
  assert.doesNotMatch(source, /feedWatch\(feed\)/, "legacy watch fields should not be displayed in the thread UI");
  assert.match(source, /mt-1 break-keep text-sm leading-6 text-zinc-600/, "thread body should keep Korean phrases from orphaning syllables in the narrow card");
  assert.match(source, /mt-1 break-keep text-sm leading-6 text-zinc-300/, "leaderboard note body should use the same Korean-friendly wrapping");
});

test("status feed render ignores legacy watch checklist content", () => {
  const threadHtml = renderToStaticMarkup(
    React.createElement(statusFeedModule.StatusFeedThread, {
      feeds: [legacyWatchFeed],
      locale: "ko",
      t
    })
  );
  const noteHtml = renderToStaticMarkup(
    React.createElement(statusFeedModule.LatestStatusFeedNote, {
      feed: legacyWatchFeed,
      locale: "ko",
      t
    })
  );

  for (const html of [threadHtml, noteHtml]) {
    assert.match(html, /숏 포지션 종료/, "headline should render");
    assert.match(html, /익절하고 쉬는 중/, "thread-style message should render");
    assert.doesNotMatch(html, /다음 확인/, "legacy watch label should stay hidden");
    assert.doesNotMatch(html, /거래량 확인/, "legacy watch checklist details should stay hidden");
    assert.doesNotMatch(html, /15분 동안/, "legacy watch timing copy should stay hidden");
  }
});

test("scenario timeline uses real trading review and plan data", () => {
  assert.match(source, /scenarioTimelineItems/, "scenario timeline should be driven by a derived view model");
  assert.match(source, /latestPlan/, "scenario timeline should include latest trade plan data");
  assert.match(source, /reviews/, "scenario timeline should include management review data");
  assert.match(source, /timelineRail/, "scenario timeline should render a visible rail like the reference");
});

test("holding panel weights use exposure data instead of pnl", () => {
  assert.match(source, /positionExposureValue/, "position holdings should derive weights from position exposure");
  assert.match(source, /orderExposureValue/, "open orders should derive weights from order exposure");
  assert.doesNotMatch(source, /numberValue\(position\.unrealizedPnl, standing\?\.totalPnl/, "holding weights must not use pnl as allocation");
});

test("holding panel shows entry price, side, leverage, size, and allocation detail", () => {
  assert.match(source, /positionHoldingNumbers/, "position holdings should include detailed position metrics");
  assert.match(source, /orderHoldingNumbers/, "pending order holdings should include detailed order metrics");
  assert.match(source, /item\.badges\.map/, "holding rows should render side and leverage badges");
  assert.match(source, /item\.details\.map/, "holding rows should render compact price, size, exposure, and allocation facts");
  assert.match(source, /detail\.averageEntry/, "holding and chart copy should use localized average-entry wording");
  assert.match(source, /detail\.entryWeight/, "holding rows should show the original staged entry weight when present");
  assert.match(source, /detail\.allocationWeight/, "holding rows should distinguish current holding weight from entry weight");
  assert.match(source, /chart\.averageEntry/, "chart should explicitly label average entry lines");
});

test("detail page avoids raw backend status and scammy paper wording in the redesigned surface", () => {
  assert.doesNotMatch(source, />Paper</, "detail page should not render a raw Paper badge");
  assert.doesNotMatch(source, /Paper only/, "detail page should not render Paper only copy");
  assert.doesNotMatch(source, /PAPER_TRADING_PENDING[^"]*<\/span>/, "detail page should not directly render raw pending constants");
});
