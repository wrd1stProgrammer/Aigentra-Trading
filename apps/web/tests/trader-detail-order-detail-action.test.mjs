import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const exposureStub = {
  isOpenChartExposure: (record) => !["closed", "filled", "canceled", "cancelled", "expired", "rejected", "stop_loss", "take_profit", "liquidation"].includes(String(record?.status ?? "open").toLowerCase())
};

const panelRows = loadTsModule("../components/trader-profile-detail/position-panel-rows.ts", {
  "@/components/live-candle-chart-overlays": exposureStub
});
const reviewBrief = loadTsModule("../lib/review-brief.ts");
const reviewDisplay = loadTsModule("../lib/review-display.ts");
const league = loadTsModule("../lib/league.ts", {
  "@/lib/review-brief": reviewBrief,
  "@/lib/traders": { fallbackTraders: [] }
});
const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/trader-profile-detail/chart.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-panel.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const scenarioCopy = loadTsModule("../components/trader-profile-detail/scenario-copy.ts", {
  "@/lib/review-display": reviewDisplay
});
const scenarioFeed = loadTsModule("../components/trader-profile-detail/scenario-feed.ts", {
  "@/components/live-candle-chart-overlays": exposureStub,
  "@/lib/review-brief": reviewBrief,
  "@/lib/review-display": reviewDisplay,
  "@/components/trader-profile-detail/scenario-copy": {
    scenarioDetailRationaleText: () => "active position copy"
  },
  "@/components/trader-profile-detail/scenario-dedupe": {
    dedupeScenarioTimelineScenarios: (scenarios) => Array.from(scenarios)
  }
});

test("open order panel only displays persisted non-synthetic open orders", () => {
  // Given: the API returns two real open orders, one closed order, and one legacy synthetic plan row.
  const orders = [
    {
      id: 91,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      limitPrice: 73000,
      quantity: 0.01,
      leverage: 5,
      payload: { entryIndex: 0, entryWeight: 0.4, tradePlanId: 44 }
    },
    {
      id: 92,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      limitPrice: 73500,
      quantity: 0.01,
      leverage: 5,
      payload: { entryIndex: 1, source: "position_management_ai", tradePlanId: 44 }
    },
    {
      id: 93,
      symbol: "BTCUSDT",
      status: "filled",
      side: "short",
      limitPrice: 73900,
      quantity: 0.01,
      leverage: 5,
      payload: { entryIndex: 2, tradePlanId: 44 }
    },
    {
      id: "plan-BTCUSDT-latest-entry-2",
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      limitPrice: 73900,
      quantity: null,
      leverage: 5,
      payload: { syntheticPlanOrder: true, entryIndex: 2, tradePlanId: 44 }
    }
  ];
  const latestPlan = {
    status: "PAPER_TRADING_PENDING",
    side: "SHORT",
    leverage: 5,
    stopLoss: 74400,
    createdAt: "2026-06-06T11:00:00Z",
    entries: [
      { price: 73000, weight: 0.4, reason: "First scale" },
      { price: 73500, weight: 0.35, reason: "Second scale" },
      { price: 73900, weight: 0.25, reason: "Final scale" }
    ],
    takeProfits: [{ price: 71000, weight: 1, reason: "Target" }],
    notes: ["Staged pullback"]
  };

  // When: the panel builds display rows for open orders.
  const rows = panelRows.buildDisplayOpenOrders({ orders, latestPlan, symbol: "BTCUSDT" });

  // Then: only persisted, still-open orders are visible.
  assert.deepEqual(rows.map((row) => row.id), [91, 92]);
  assert.equal(rows.some((row) => row.payload?.syntheticPlanOrder), false);
  assert.equal(rows.some((row) => String(row.id).startsWith("plan-")), false);
});

test("open order panel hides protective exit orders and keeps pending long short entries", () => {
  // Given: the backend returns active entry orders together with protective stop/take-profit orders.
  const orders = [
    { id: 201, symbol: "BTCUSDT", status: "open", side: "long", orderType: "limit", limitPrice: 66000, quantity: 0.02 },
    { id: 202, symbol: "BTCUSDT", status: "open", side: "short", orderType: "limit", limitPrice: 67000, quantity: 0.02 },
    { id: 203, symbol: "BTCUSDT", status: "open", side: "sell", orderType: "stop_loss", stopPrice: 65000, quantity: 0.02 },
    { id: 204, symbol: "BTCUSDT", status: "open", side: "sell", orderType: "take_profit", price: 69000, quantity: 0.02 },
    { id: 205, symbol: "BTCUSDT", status: "open", side: "sell", payload: { purpose: "STOP_LOSS" }, stopPrice: 65000, quantity: 0.02 },
    { id: 206, symbol: "ETHUSDT", status: "open", side: "long", orderType: "limit", limitPrice: 2500, quantity: 1 }
  ];

  // When: the panel builds display rows.
  const rows = panelRows.buildDisplayOpenOrders({ orders, latestPlan: null, symbol: "BTCUSDT" });

  // Then: only pending LONG/SHORT entry orders remain.
  assert.deepEqual(rows.map((row) => row.id), [201, 202]);
});

test("order and position scenarios prefer AI rationale over entry labels", () => {
  // Given: paper exposure payloads contain both mechanical entry labels and AI review commentary.
  const trader = { id: "channel-rider", currentPlan: "watch", baseRiskPercent: 0.7, description: "strategy", concept: "concept" };
  const orders = [
    {
      id: 101,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      limitPrice: 61416.2,
      stopLossPrice: 61985.1,
      takeProfitPrice: 60291.7,
      payload: {
        entryReason: "15분 확인 캔들",
        candidateSetupType: "CHANNEL_UPPER_BAND_REJECTION",
        aiApprovalReason: "AI는 상단 채널 실패와 하위 시간대 약세 전환이 겹쳐 이 대기 주문을 승인했습니다.",
        aiUserSummary: "상단 채널 리젝트 대기 주문입니다."
      }
    }
  ];
  const positions = [
    {
      id: 102,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      entryPrice: 61232.5,
      stopLossPrice: 61985.1,
      takeProfitPrice: 59080,
      payload: {
        entryReason: "채널 재진입",
        candidateSetupType: "CHANNEL_UPPER_BAND_REJECTION",
        aiApprovalReason: "AI는 채널 상단 거부가 유지되는 동안 포지션을 보유하되 손절은 채널 밖에 유지하라고 판단했습니다.",
        aiUserSummary: "채널 숏 포지션은 아직 논리가 유지됩니다."
      }
    }
  ];

  // When: scenarios are built for the detail timeline and row detail modal.
  const scenarios = league.buildScenarios({ trader, positions, orders, reviews: [], events: [] });

  // Then: AI rationale is the visible entry approval rationale, not the mechanical entry label.
  const orderScenario = scenarios.find((scenario) => scenario.id === "order-101");
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-102");
  assert.equal(orderScenario.rationale, "AI는 상단 채널 실패와 하위 시간대 약세 전환이 겹쳐 이 대기 주문을 승인했습니다.");
  assert.equal(orderScenario.summary, null);
  assert.equal(positionScenario.rationale, "AI는 채널 상단 거부가 유지되는 동안 포지션을 보유하되 손절은 채널 밖에 유지하라고 판단했습니다.");
  assert.notEqual(orderScenario.rationale, "15분 확인 캔들");
});

test("provider failure management reviews do not become latest scenario cards", () => {
  // Given: production can persist an internal provider-failure management review next to a valid review.
  const trader = { id: "liquidity-reaper", currentPlan: "watch", baseRiskPercent: 0.7, description: "strategy", concept: "concept" };
  const reviews = [
    {
      id: 447,
      traderId: "liquidity-reaper",
      symbol: "BTCUSDT",
      status: "error",
      errorMessage: "AI_PROVIDER=openai selected but required API key is missing.",
      decision: "NEEDS_MORE_DATA",
      actionType: "NEEDS_MORE_DATA",
      phase: "OPEN_POSITION",
      eventType: "sweep_failure_exit",
      fallback: false,
      createdAt: "2026-06-18T06:30:08.466959+00:00",
      rationale: "Position management provider failed.",
      riskFlags: ["provider_failed"],
      review: {
        decision: "NEEDS_MORE_DATA",
        rationale: "Position management provider failed.",
        riskFlags: ["provider_failed"]
      }
    },
    {
      id: 448,
      traderId: "liquidity-reaper",
      symbol: "BTCUSDT",
      status: "ok",
      decision: "MOVE_STOP_TO_BREAKEVEN",
      actionType: "MOVE_STOP_TO_BREAKEVEN",
      phase: "OPEN_POSITION",
      eventType: "sweep_failure_exit",
      createdAt: "2026-06-18T06:35:08.466959+00:00",
      rationale: "손절선을 본절로 올려 리스크를 제거합니다.",
      review: {
        decision: "MOVE_STOP_TO_BREAKEVEN",
        rationale: "손절선을 본절로 올려 리스크를 제거합니다."
      }
    }
  ];

  // When: scenarios are built for the latest scenario timeline.
  const scenarios = league.buildScenarios({ trader, positions: [], orders: [], reviews, events: [] });

  // Then: the internal provider failure is hidden while the valid management review remains.
  assert.equal(scenarios.some((scenario) => scenario.id === "review-447"), false);
  assert.equal(scenarios.some((scenario) => scenario.rationale === "Position management provider failed."), false);
  assert.deepEqual(scenarios.filter((scenario) => scenario.source === "review").map((scenario) => scenario.id), ["review-448"]);
});

test("position panel exposes detail callbacks for positions and orders", () => {
  assert.match(chartSource, /onOpenScenario/, "detail chart should pass a scenario-opening callback to the position panel");
  assert.match(panelSource, /onOpenScenario/, "position panel should accept a scenario-opening callback");
  assert.match(panelSource, /openScenarioForPosition/, "position rows should open their matching scenario");
  assert.match(panelSource, /openScenarioForOrder/, "order rows should open their matching scenario");
  assert.match(panelSource, /detail\.rowDetail/, "detail action label should be localized");
  assert.match(pageSource, /setSelectedScenario/, "detail action should reuse the same ScenarioModal state as the latest scenario list");
});

test("position panel fallback detail scenarios keep structured AI review copy", () => {
  assert.match(panelSource, /import \{ reviewBriefFromRecord \} from "@\/lib\/review-brief"/);
  assert.match(panelSource, /reviewBrief:\s*entryApprovalRationale\(payload\)\s*\?\s*null\s*:\s*reviewBriefFromRecord\(\{ payload \}\)/);
});

test("scenario modal does not show entry summary as management rationale", () => {
  assert.match(modalSource, /scenarioDetailRationaleText\(scenario, t\)/);
  assert.doesNotMatch(modalSource, /scenario\.rationale \?\? scenario\.summary/);
  assert.doesNotMatch(modalSource, /aiReview\.userSummary/);
  assert.doesNotMatch(modalSource, /scenario\.summary/);
});

test("scenario modal labels entry approvals separately from management reviews", () => {
  assert.match(modalSource, /function scenarioRationaleLabel/);
  assert.match(modalSource, /case "position":\s*case "order":\s*return t\("aiReview\.entryRationale"\);/s);
  assert.match(modalSource, /case "review":\s*return t\("aiReview\.rationale"\);/s);
  assert.match(i18nSource, /"aiReview\.entryRationale": "진입 승인 근거"/);
  assert.match(i18nSource, /"aiReview\.entryRationale": "Entry Approval Rationale"/);
});

test("position detail side labels use dedicated localization keys", () => {
  assert.match(dataSource, /localizedScenarioSide/, "scenario titles should use localized side labels");
  assert.match(modalSource, /localizedScenarioSide\(scenario\.side, t\)/, "scenario modal should not display raw LONG or SHORT labels");
  assert.match(i18nSource, /"detail\.sideLong": "롱"/, "Korean detail side labels should be localized");
  assert.match(i18nSource, /"detail\.sideShort": "숏"/, "Korean detail side labels should be localized");
});

test("review display cleanup preserves decimal prices and ratios", () => {
  assert.equal(
    reviewDisplay.cleanReviewDisplayText("z-score 1.49, 손익비 2.6은 기준 1.15 이상입니다.", 0),
    "z-score 1.49, 손익비 2.6은 기준 1.15 이상입니다."
  );
});

test("open position detail shows the saved entry approval rationale instead of generic active status copy", () => {
  const approvalRationale =
    "Donchian 경계 돌파가 명확하고 15m 거래량 z-스코어 1.49로 참여 신호 있음. 위험-수익 비율 2.6은 최소 요구치 1.15를 초과.";
  const text = scenarioCopy.scenarioDetailRationaleText(
    {
      id: "position-102",
      source: "position",
      phase: "OPEN_POSITION",
      status: "open",
      rationale: approvalRationale
    },
    (key) =>
      ({
        "detail.noAiRationale": "저장된 AI 판단 근거 없음"
      })[key] ?? key
  );

  assert.equal(text, approvalRationale);
  assert.notEqual(text, "저장된 AI 판단 근거 없음");
});

test("latest scenario feed includes AI-approved entry rationale and management reviews after a trade closes", () => {
  const scenarios = [
    { id: "review-1", source: "review", phase: "OPEN_POSITION", status: "HOLD" },
    { id: "position-1", source: "position", phase: "OPEN_POSITION", status: "open", rationale: "approved" },
    { id: "position-2", source: "position", phase: "OPEN_POSITION", status: "stop_loss", rationale: "approved" },
    { id: "position-3", source: "position", phase: "OPEN_POSITION", status: "open", rationale: null },
    { id: "order-1", source: "order", phase: "PENDING_ORDER", status: "open", rationale: "approved" }
  ];

  assert.deepEqual(
    scenarioFeed.latestScenarioFeedScenarios(scenarios).map((scenario) => scenario.id),
    ["review-1", "position-1", "position-2"]
  );
});

test("latest scenario feed prefers structured readable review text when available", () => {
  const structured = {
    verdict: "유지",
    headline: "현재 포지션은 아직 유지가 맞습니다.",
    action: "손절 접근 여부만 확인하세요.",
    keyReasons: ["진입 근거가 깨지지 않았습니다."],
    risks: ["손절선 이탈 시 종료입니다."],
    watchConditions: ["15분 종가 확인"],
    managerNote: "과한 추가 진입은 피합니다."
  };
  const reviewT = (key) =>
    ({
      "detail.reviewBody.holdPosition": "{side} 포지션 유지 중. 핵심 조건만 확인합니다.",
      "detail.reviewBody.pendingEntry": "{side} 진입은 아직 대기 중입니다.",
      "detail.reviewBody.cancelOrder": "{side} 대기 주문 취소를 검토했습니다.",
      "detail.reviewBody.adjustStop": "{side} 손절 위치를 다시 점검했습니다.",
      "detail.reviewBody.closePosition": "{side} 포지션 종료 조건을 확인했습니다.",
      "detail.reviewBody.watchMarket": "새 진입보다 시장 확인이 우선입니다.",
      "detail.reviewReason.volumeWeak": "거래량이 약해 추가 진입은 보류합니다.",
      "detail.reviewReason.stopWatch": "손절 기준을 넘는지 확인 중입니다.",
      "detail.reviewReason.profitWatch": "목표가 접근 여부를 확인 중입니다.",
      "detail.sideLong": "롱",
      "detail.sideShort": "숏"
    })[key] ?? key;

  const reviewCopy = scenarioFeed.scenarioTimelineBody(
    { id: "review-1", source: "review", phase: "OPEN_POSITION", status: "HOLD", reviewBrief: structured },
    undefined,
    reviewT
  );
  assert.match(reviewCopy, /현재 포지션은 아직 유지가 맞습니다/);
  assert.match(reviewCopy, /손절 접근 여부만 확인하세요/);
  assert.match(reviewCopy, /진입 근거가 깨지지 않았습니다/);
  assert.doesNotMatch(reviewCopy, /포지션 유지 중\. 핵심 조건만 확인합니다/);

  const positionCopy = scenarioFeed.scenarioTimelineBody(
    { id: "position-1", source: "position", phase: "OPEN_POSITION", status: "open", reviewBrief: structured, rationale: "old long paragraph" },
    undefined,
    reviewT
  );
  assert.match(positionCopy, /현재 포지션은 아직 유지가 맞습니다/);
  assert.match(positionCopy, /손절 접근 여부만 확인하세요/);
  assert.doesNotMatch(positionCopy, /old long paragraph/);

  const semicolonHeavy = {
    verdict: "HOLD",
    headline: "새로운 이격과 견고한 불균형 지오메트리로 신중한 접근 필요; 약한 거래량 주의.",
    action: "현재 포지션 유지하며 거래량과 무효화 신호 모니터링; 거래량 개선 시 진입 고려.",
    keyReasons: [],
    risks: [],
    watchConditions: [],
    managerNote: null
  };
  const copy = scenarioFeed.scenarioTimelineBody(
    { id: "review-2", source: "review", phase: "OPEN_POSITION", status: "HOLD", side: "SHORT", reviewBrief: semicolonHeavy },
    undefined,
    reviewT
  );
  assert.match(copy, /가격 구조로 신중한 접근 필요/);
  assert.match(copy, /약한 거래량 주의/);
  assert.match(copy, /무효화 신호 확인/);
  assert.doesNotMatch(copy, /;|지오메트리|실패 수준|모니터링/);
  assert.doesNotMatch(copy, /포지션 유지 중\. 핵심 조건만 확인합니다/);
});

test("trader detail builds scenarios from closed positions without sending them to active chart positions", () => {
  assert.match(pageSource, /closedPositions: bundle\?\.closedPositions \?\? \[\]/, "detail state should keep closed positions available");
  assert.match(pageSource, /scenarioPositions/, "scenario generation should have a position list distinct from chart positions");
  assert.match(pageSource, /buildScenarioPositions\(positions, closedPositions\)/, "closed positions should feed scenario generation only");
  assert.match(pageSource, /buildScenarios\(\{ trader, positions: scenarioPositions, orders, reviews, events \}\)/);
  assert.match(pageSource, /paperPositions=\{positions\}/, "chart should continue receiving active positions only");
});

test("active position scenario time uses the stable open time instead of live mark updates", () => {
  // Given: an open position receives frequent mark/PnL updates after it was opened.
  const trader = { id: "range-maker", currentPlan: "watch", baseRiskPercent: 0.7, description: "strategy", concept: "concept" };
  const positions = [
    {
      id: 901,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      entryPrice: 64092,
      openedAt: "2026-06-18T06:00:00.000Z",
      createdAt: "2026-06-18T05:59:00.000Z",
      updatedAt: "2026-06-18T06:11:00.000Z",
      payload: {
        aiApprovalReason: "AI는 범위 하단 반등 논리가 유지된다고 승인했습니다."
      }
    }
  ];

  // When: the timeline scenario is built for the detail page.
  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });

  // Then: the PO card does not pretend the latest mark update is a fresh AI review.
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-901");
  assert.equal(positionScenario.createdAt, "2026-06-18T06:00:00.000Z");
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
