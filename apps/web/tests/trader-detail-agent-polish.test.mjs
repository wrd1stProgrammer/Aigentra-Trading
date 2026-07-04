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
const statusFeedThreadSource = readFileSync(new URL("../components/trader-profile-detail/status-feed-thread.tsx", import.meta.url), "utf8");

const overlayHelpers = loadTsModule("../components/live-candle-chart-overlays.ts");
const positionPanelCalculations = loadTsModule("../components/trader-profile-detail/position-panel-calculations.ts");
const reviewBrief = loadTsModule("../lib/review-brief.ts");
const league = loadTsModule("../lib/league.ts", {
  "@/lib/review-brief": reviewBrief,
  "@/lib/traders": { fallbackTraders: [] }
});
const reviewDisplay = loadTsModule("../lib/review-display.ts");
const scenarioCopy = loadTsModule("../components/trader-profile-detail/scenario-copy.ts", {
  "@/lib/review-display": reviewDisplay
});
const scenarioDedupe = loadTsModule("../components/trader-profile-detail/scenario-dedupe.ts");
const scenarioFeed = loadTsModule("../components/trader-profile-detail/scenario-feed.ts", {
  "@/lib/review-brief": reviewBrief,
  "@/lib/review-display": reviewDisplay,
  "@/components/trader-profile-detail/scenario-copy": scenarioCopy,
  "@/components/trader-profile-detail/scenario-dedupe": {
    dedupeScenarioTimelineScenarios: (scenarios) => Array.from(scenarios)
  }
});
const detailData = loadTsModule("../components/trader-profile-detail/data.ts", {
  "@/components/trader-profile-detail/scenario-copy": scenarioCopy,
  "@/components/trader-profile-detail/scenario-feed": {
    latestScenarioFeedScenarios: () => [],
    scenarioTimelineBody: () => ""
  },
  "@/components/trader-profile-detail/timeline-sort": {
    sortTimelineItemsByRecency: (items) => items,
    timelineTimeValue: () => 0
  },
  "@/lib/format": {
    formatCurrency: (value) => String(value),
    formatNumber: (value) => String(value),
    formatPercent: (value) => `${value}%`,
    formatRelativeDateTime: () => ""
  },
  "@/lib/review-display": reviewDisplay,
  "@/lib/status": { statusLabel: (value) => String(value ?? "") }
});

test("live chart status copy stays minimal and position ROE keeps two decimals", () => {
  assert.match(i18nSource, /"chart\.liveSource": "실시간 캔들"/, "Korean chart source copy should be short");
  assert.match(i18nSource, /"chart\.liveSource": "Live candles"/, "English chart source copy should be short");
  assert.doesNotMatch(i18nSource, /전일 대비 계산 중|Calculating daily change/, "temporary day-change copy should not remain in locale text");
  assert.doesNotMatch(chartSource, /chart\.dayChangeUnavailable/, "live chart should not render an unavailable day-change badge");
  assert.match(chartSource, /dayChangePct !== null \? \(/, "day-change badge should render only when a percent exists");
  assert.match(binancePanelSource, /formatFixedNumber\(roe, 2, locale\)/, "desktop ROE should keep two decimal places");
  assert.match(mobileBinancePanelSource, /formatFixedNumber\(roe, 2, locale\)/, "mobile ROE should keep two decimal places");
});

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

test("latest scenario timeline collapses repeated heartbeat reviews with identical AI copy", () => {
  const repeatedBrief = {
    headline: "Fresh displacement and sound imbalance structure support a cautious approach.",
    action: "Hold current position and monitor volume and invalidation signals.",
    keyReasons: ["Geometry and risk-reward are sound."],
    risks: ["Weak volume warrants patience."],
    watchConditions: ["Cancel or reduce if the current price stalls."],
    managerNote: "Maintain cautious stance."
  };
  const scenarios = [
    {
      id: "review-1100",
      source: "review",
      createdAt: "2026-06-23T15:53:55Z",
      phase: "OPEN_POSITION",
      eventType: "imbalance_hunter_position_heartbeat",
      action: "HOLD",
      status: "HOLD",
      side: "SHORT",
      price: 62301.4,
      reviewBrief: repeatedBrief
    },
    {
      id: "review-1099",
      source: "review",
      createdAt: "2026-06-23T15:18:01Z",
      phase: "OPEN_POSITION",
      eventType: "imbalance_hunter_position_heartbeat",
      action: "HOLD",
      status: "HOLD",
      side: "SHORT",
      price: 62304.8,
      reviewBrief: repeatedBrief
    },
    {
      id: "review-1098",
      source: "review",
      createdAt: "2026-06-23T14:44:30Z",
      phase: "OPEN_POSITION",
      eventType: "imbalance_hunter_position_heartbeat",
      action: "HOLD",
      status: "HOLD",
      side: "SHORT",
      price: 62545.1,
      reviewBrief: {
        ...repeatedBrief,
        headline: "The short is still protected, but momentum has changed since the last review."
      }
    }
  ];

  assert.deepEqual(
    scenarioDedupe.dedupeScenarioTimelineScenarios(scenarios).map((scenario) => scenario.id),
    ["review-1100", "review-1098"]
  );
});

test("review facts replace user summary in visible review UI", () => {
  assert.match(aiReviewPanelSource, /reviewFacts/, "AI review panel should render structured review facts");
  assert.match(apiSource, /reviewFacts/, "API types should expose structured review facts");
  assert.match(aiReviewPanelSource, /ReviewBriefSummary/, "AI review panel should prefer beginner-readable structured reviews");
  assert.match(apiSource, /structuredReview/, "API types should expose structured AI review briefs");
  assert.match(scenarioFeedSource, /managementReviewTimelineBody/, "latest scenarios should use concise structured review summaries when available");
  assert.match(modalSource, /ReviewBriefSummary/, "scenario modal should show the structured review briefing");
  assert.match(i18nSource, /reviewFact\.entryGeometryChecked/, "review fact labels should be localized");
  assert.match(i18nSource, /aiReview\.managerNote/, "structured review manager note needs a localized label");
  assert.doesNotMatch(aiReviewPanelSource, /aiReview\.userSummary|사용자 요약|User Summary/);
  assert.doesNotMatch(modalSource, /aiReview\.userSummary|사용자 요약|User Summary/);
  assert.doesNotMatch(i18nSource, /"aiReview\.userSummary"/);
});

test("active position entry duration uses the opened timestamp before fallback dates", () => {
  const nowMs = Date.parse("2026-06-29T12:00:00Z");

  assert.equal(
    positionPanelCalculations.positionEntryDuration(
      {
        openedAt: "2026-06-29T10:35:00Z",
        createdAt: "2026-06-20T00:00:00Z"
      },
      nowMs
    ),
    "1h 25m"
  );
  assert.equal(
    positionPanelCalculations.positionEntryDuration({ opened_at: "2026-06-28T11:00:00Z" }, nowMs),
    "1d 1h"
  );
  assert.equal(
    positionPanelCalculations.positionEntryDuration({ openedAt: "2026-06-29T12:05:00Z" }, nowMs),
    "0m"
  );
  assert.equal(positionPanelCalculations.positionEntryDuration({ openedAt: "not-a-date" }, nowMs), "-");
});

test("latest scenario timeline relies on real localized review payloads instead of pending-translation placeholders", () => {
  const copy = scenarioFeed.scenarioTimelineBody(
    {
      id: "review-translation-1",
      source: "review",
      phase: "OPEN_POSITION",
      status: "HOLD",
      side: "SHORT",
      reviewBrief: {
        verdict: "유지",
        headline: "숏 근거는 아직 살아 있습니다.",
        action: "62853.7 위로 15분 종가가 닫히는지만 확인하세요.",
        keyReasons: ["새 하락 변위가 숏 근거를 유지합니다."],
        risks: [],
        watchConditions: [],
        managerNote: null
      }
    },
    undefined,
    (key) => ({ "detail.noAiRationale": "AI 근거 없음" })[key] ?? key
  );

  assert.doesNotMatch(copy, /숏 근거는 아직 살아 있습니다/);
  assert.match(copy, /62853\.7 위로 15분 종가/);
  assert.doesNotMatch(copy, /번역.*준비|translation.*prepared|Fresh bearish displacement/i);
  assert.doesNotMatch(scenarioFeedSource, /localizedTimelineFallback/, "scenario timeline should not mask backend translation misses with placeholder copy");
  assert.doesNotMatch(scenarioFeedSource, /looksLikeEnglishProse/, "scenario timeline should not use language guessing as the localization contract");
  assert.doesNotMatch(i18nSource, /"scenario\.fallback\.entryReviewPendingTranslation"/, "entry review pending-translation fallback copy should not ship");
  assert.doesNotMatch(i18nSource, /"scenario\.fallback\.managementReviewPendingTranslation"/, "management review pending-translation fallback copy should not ship");
});

test("approved entry scenarios use structured review for detail rationale", () => {
  const scenarios = league.buildScenarios({
    trader: { id: "trend-sentinel", currentPlan: "wait", baseRiskPercent: 0.5, description: "Trend" },
    positions: [
      {
        id: 77,
        side: "SHORT",
        status: "open",
        entryPrice: 59681.6,
        stopLossPrice: 61057.6,
        takeProfitPrice: 58304.2,
        quantity: 0.42,
        payload: {
          aiReview: {
            approvalReason:
              "진입 승인 이유: 4H 하락 추세가 유지되는 중 되돌림 상단에서 숏을 잡았고, 손절은 되돌림 무효화선 위에 있으며 첫 익절까지의 거리가 수수료를 감안해도 남아 있습니다.",
            structuredReview: {
              headline:
                "숏 설정은 구조적으로 유효하지만, 8배 레버리지는 중간 수준의 수익-위험 비율과 혼합 하위 프레임 확인에 대해 너무 공격적입니다.",
              action:
                "레버리지를 낮추고 실행 규칙을 엄격히 하며, 첫 제한은 유지하고 가격이 명확히 거부되지 않으면 두 번째 채우기를 취소하십시오.",
              keyReasons: ["4시간과 일간 차트는 여전히 숏 연속을 지지합니다."],
              risks: ["8배에서는 작은 반등이 빠른 스톱아웃으로 바뀔 수 있습니다."],
              watchConditions: ["EMA50 회복 여부"],
              managerNote: "유효한 숏 아이디어이지만 최대 레버리지는 아닙니다."
            }
          },
          entryReason: "Continuation confirmation"
        },
        openedAt: "2026-06-26T07:00:00Z"
      }
    ],
    orders: [],
    reviews: [],
    events: []
  });

  assert.equal(scenarios[0].source, "position");
  assert.match(scenarios[0].rationale, /숏 설정은 구조적으로 유효/);
  assert.doesNotMatch(scenarios[0].rationale, /진입 승인 이유/);
  assert.equal(
    scenarios[0].reviewBrief.headline,
    "숏 설정은 구조적으로 유효하지만, 8배 레버리지는 중간 수준의 수익-위험 비율과 혼합 하위 프레임 확인에 대해 너무 공격적입니다."
  );
  assert.equal(scenarios[0].reviewBrief.managerNote, "유효한 숏 아이디어이지만 최대 레버리지는 아닙니다.");
});

test("scenario modal uses a compact reference-style ratio and neutral rationale card", () => {
  assert.match(modalSource, /max-w-\[920px\]/, "scenario modal should use a narrower reference-style width");
  assert.doesNotMatch(modalSource, /max-w-7xl/, "scenario modal should not use an oversized max width");
  assert.match(modalSource, /height=\{320\}/, "modal chart should use a compact inspection height");
  assert.match(modalSource, /lg:grid-cols-5/, "position prices should sit in a full-width metric row below the chart");
  assert.doesNotMatch(modalSource, /detail\.confidence/, "position/order detail modal should not show the old confidence card");
  assert.doesNotMatch(modalSource, /lg:grid-cols-\[minmax\(0,1\.15fr\)_260px\]/, "rationale and metric data should not be split into the old side rail");
  assert.doesNotMatch(reviewBriefSummarySource, /border-l-2 border-emerald-500\/70/, "management rationale cards should not use a green side stripe");
});

test("scenario modal keeps the chart out from under the header while the body scrolls", () => {
  assert.match(
    modalSource,
    /className="[^"]*max-h-\[86dvh\][^"]*flex-col[^"]*overflow-hidden/,
    "dialog shell should clip only the rounded frame, not act as the scroll container"
  );
  assert.match(
    modalSource,
    /data-testid="scenario-modal-body"[\s\S]*className="[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto/,
    "modal body should be the only vertical scrollport so the chart cannot slide beneath the header"
  );
  assert.doesNotMatch(
    modalSource,
    /sticky top-0/,
    "the modal header should not be a sticky overlay inside the same scrollport as the chart"
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

test("sidebar execution log no longer exposes rationale expanders", () => {
  assert.doesNotMatch(sidePanelsSource, /expandedTradeHistoryId/, "execution log should not keep local expander state");
  assert.doesNotMatch(sidePanelsSource, /aria-expanded=\{expanded\}/, "execution log should not expose expandable rationale controls");
  assert.doesNotMatch(sidePanelsSource, /CaretDown/, "execution log should not render rationale chevrons");
  assert.doesNotMatch(sidePanelsSource, /item\.basisDetail/, "execution log should not render hidden basis detail copy");
  assert.doesNotMatch(sidePanelsSource, /\{item\.basis\}/, "execution log should not render basis chips");
});

test("live desk notes use a thread-feed surface with stable readable notes", () => {
  assert.match(statusFeedThreadSource, /data-testid="trader-status-feed-thread"/, "desk notes need a stable QA target");
  assert.match(statusFeedThreadSource, /data-testid="desk-note-thread-item"/, "each desk note should be independently inspectable");
  assert.match(statusFeedThreadSource, /rounded-\[1\.25rem\]/, "thread notes should use a distinct message-card radius");
  assert.match(statusFeedThreadSource, /text-pretty/, "long desk notes should avoid ragged awkward wrapping");
  assert.match(statusFeedThreadSource, /tabular-nums/, "timestamps should use tabular figures");
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

test("management review titles distinguish repeated Korean profit labels", () => {
  const t = (key) =>
    ({
      "detail.sideShort": "숏",
      "detail.reviewTitle.nearEntry": "진입부근 관리",
      "detail.reviewTitle.profitProtect": "이익 보호",
      "detail.reviewTitle.stopWatch": "손절 점검",
      "detail.reviewTitle.profitWatch": "익절권 확인",
      "detail.reviewTitle.positionHold": "포지션 유지",
      "detail.reviewTitle.marketWatch": "시장 확인"
    })[key] ?? key;

  const nearEntryStopReview = {
    source: "review",
    side: "SHORT",
    status: "HOLD",
    phase: "OPEN_POSITION",
    eventType: "trend_sentinel_position_heartbeat",
    reviewBrief: {
      headline: "숏은 진입 부근의 작은 수익 구간입니다.",
      action: "손절이나 익절을 조정하지 말고 무효화선을 먼저 확인하세요.",
      keyReasons: ["현재가는 진입가와 가깝고 progressR은 +0.18로 초기 단계입니다."],
      watchConditions: ["61,057.6 위 15m 종가면 손절 기준을 우선하세요."]
    }
  };
  const profitProtectionReview = {
    source: "review",
    side: "SHORT",
    status: "TAKE_PARTIAL_PROFIT",
    phase: "OPEN_POSITION",
    eventType: "trend_sentinel_position_heartbeat",
    reviewBrief: {
      headline: "숏이 첫 목표 쪽으로 충분히 진행되어 이익 보호를 검토합니다.",
      action: "일부 익절 또는 트레일링을 검토하세요.",
      keyReasons: ["목표 진행률이 충분해 수익 보호가 우선입니다."]
    }
  };

  const nearEntryTitle = detailData.managementReviewScenarioTitle(nearEntryStopReview, t);
  const profitTitle = detailData.managementReviewScenarioTitle(profitProtectionReview, t);

  assert.equal(nearEntryTitle, "숏은 진입 부근의 작은 수익 구간입니다");
  assert.equal(profitTitle, "숏이 첫 목표 쪽으로 충분히 진행되어 이익 보호를 검...");
  assert.notEqual(nearEntryTitle, profitTitle);
  assert.notEqual(nearEntryTitle, "숏 익절권 확인");
});

test("management review titles stay compact", () => {
  const t = (key) =>
    ({
      "detail.sideShort": "Short",
      "detail.reviewTitle.nearEntry": "Near-entry management",
      "detail.reviewTitle.profitProtect": "Profit protection",
      "detail.reviewTitle.stopWatch": "Stop check",
      "detail.reviewTitle.profitWatch": "Profit zone",
      "detail.reviewTitle.positionHold": "Position hold",
      "detail.reviewTitle.marketWatch": "Market check"
    })[key] ?? key;

  const title = detailData.managementReviewScenarioTitle(
    {
      source: "review",
      side: "SHORT",
      status: "HOLD",
      phase: "OPEN_POSITION",
      reviewBrief: {
        headline:
          "The short is a small near-entry winner, but the higher timeframe is not aligned and the full explanation belongs in the body.",
        action: "Hold without moving stop or target while price stays below invalidation."
      }
    },
    t
  );

  assert.equal(title, "The short is a small near-ent...");
  assert.ok(title.length <= 32);
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
