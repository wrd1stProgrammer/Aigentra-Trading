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
const league = loadTsModule("../lib/league.ts", {
  "@/lib/traders": { fallbackTraders: [] }
});
const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const chartSource = readFileSync(new URL("../components/trader-profile-detail/chart.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-panel.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/trader-profile-detail/scenario-modal.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const scenarioCopy = loadTsModule("../components/trader-profile-detail/scenario-copy.ts");
const scenarioFeed = loadTsModule("../components/trader-profile-detail/scenario-feed.ts", {
  "@/components/live-candle-chart-overlays": exposureStub,
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

test("position panel exposes detail callbacks for positions and orders", () => {
  assert.match(chartSource, /onOpenScenario/, "detail chart should pass a scenario-opening callback to the position panel");
  assert.match(panelSource, /onOpenScenario/, "position panel should accept a scenario-opening callback");
  assert.match(panelSource, /openScenarioForPosition/, "position rows should open their matching scenario");
  assert.match(panelSource, /openScenarioForOrder/, "order rows should open their matching scenario");
  assert.match(panelSource, /detail\.rowDetail/, "detail action label should be localized");
  assert.match(pageSource, /setSelectedScenario/, "detail action should reuse the same ScenarioModal state as the latest scenario list");
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

test("trader detail builds scenarios from closed positions without sending them to active chart positions", () => {
  assert.match(pageSource, /closedPositions: bundle\?\.closedPositions \?\? \[\]/, "detail state should keep closed positions available");
  assert.match(pageSource, /scenarioPositions/, "scenario generation should have a position list distinct from chart positions");
  assert.match(pageSource, /buildScenarioPositions\(positions, closedPositions\)/, "closed positions should feed scenario generation only");
  assert.match(pageSource, /buildScenarios\(\{ trader, positions: scenarioPositions, orders, reviews, events \}\)/);
  assert.match(pageSource, /paperPositions=\{positions\}/, "chart should continue receiving active positions only");
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
