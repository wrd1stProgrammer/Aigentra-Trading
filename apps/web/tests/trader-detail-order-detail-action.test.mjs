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
const positionReviewSource = loadTsModule("../lib/position-review-source.ts", {
  "@/lib/api": {}
});
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

test("entry rationale fallback never uses management review copy", () => {
  assert.equal(
    league.entryRationaleFromPayload({
      aiApprovalReason: "진입 승인 원문",
      managementRationale: "포지션 유지용 중간 리뷰",
      review: { rationale: "관리 리뷰 rationale" }
    }),
    "진입 승인 원문"
  );
  assert.equal(
    league.entryRationaleFromPayload({
      managementRationale: "포지션 유지용 중간 리뷰",
      managementReason: "관리 판단",
      review: { rationale: "관리 리뷰 rationale" }
    }),
    null
  );
});

test("entry rationale fallback strips legacy decision prefixes and rejects management-only approval copy", () => {
  assert.equal(
    league.entryRationaleFromPayload({
      aiApprovalReason: "ADJUST_AND_APPROVE: Trend Sentinel은 4H 추세 회복 후 LONG 진입을 열었습니다."
    }),
    "Trend Sentinel은 4H 추세 회복 후 LONG 진입을 열었습니다."
  );
  assert.equal(
    league.entryRationaleFromPayload({
      aiApprovalReason: "ADJUST_AND_APPROVE: Maintain the position while structure remains valid.",
      aiReview: { approvalReason: "조정 후 승인: 1H 평균 구역 회복이 진입 트리거입니다." }
    }),
    "1H 평균 구역 회복이 진입 트리거입니다."
  );
  assert.equal(
    league.entryRationaleFromPayload({
      aiApprovalReason: "조정 후 승인: 현재 포지션은 유지하고 다음 리뷰까지 계속 관찰하세요."
    }),
    null
  );
});

test("entry approval detail scenarios prefer structured review over legacy approval reason", () => {
  // Given: a live position has both the legacy approvalReason and the newer structured review.
  const trader = { id: "trend-sentinel", currentPlan: "watch", baseRiskPercent: 0.35, description: "strategy", concept: "concept" };
  const positions = [
    {
      id: 423,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      entryPrice: 59749.6,
      stopLoss: 60240.8,
      openedAt: "2026-06-29T02:46:45.129Z",
      payload: {
        aiApprovalReason: "Trend Sentinel은 59719.3에서 HTF 연속 SHORT이 일관되게 유지되고 있습니다.",
        aiReview: {
          approvalReason: "Legacy compact approval reason.",
          structuredReview: {
            verdict: "조정 후 승인",
            headline: "반등이 막히는 구간에서 숏 진입 근거가 살아 있습니다.",
            action: "작은 규모로만 진입하고 손절가 회복 여부를 확인하세요.",
            keyReasons: ["진입가와 손절가가 명확해 손실 범위가 제한됩니다."],
            risks: ["손절가를 회복하면 숏 논리가 약해집니다."],
            watchConditions: ["15분 종가가 손절가 위로 닫히는지 확인"],
            managerNote: "레거시 요약보다 이 구조화 리뷰가 상세 모달에 표시되어야 합니다."
          }
        }
      }
    }
  ];

  // When: the detail timeline scenarios are built.
  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });

  // Then: the scenario uses the structured review as the readable entry rationale.
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-423");
  assert.equal(
    positionScenario.rationale,
    "반등이 막히는 구간에서 숏 진입 근거가 살아 있습니다. 작은 규모로만 진입하고 손절가 회복 여부를 확인하세요. 진입가와 손절가가 명확해 손실 범위가 제한됩니다. 15분 종가가 손절가 위로 닫히는지 확인"
  );
  assert.equal(positionScenario.reviewBrief.headline, "반등이 막히는 구간에서 숏 진입 근거가 살아 있습니다.");
  assert.equal(positionScenario.reviewBrief.action, "작은 규모로만 진입하고 손절가 회복 여부를 확인하세요.");
});

test("entry approval scenarios ignore later management review copy on the same exposure", () => {
  const trader = { id: "atr-trail-commander", currentPlan: "watch", baseRiskPercent: 0.4, description: "strategy", concept: "concept" };
  const managementHeadline = "포지션 유지 중이며 손절 접근 여부만 봅니다.";
  const entryHeadline = "ATR 추세가 이어지는 동안 되돌림 이후 롱 진입이 유효합니다.";
  const positions = [
    {
      id: 426,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      entryPrice: 61984.8,
      structuredReview: {
        verdict: "유지",
        headline: managementHeadline,
        action: "새 진입 근거가 아니라 진행 중 포지션 관리 판단입니다.",
        keyReasons: ["목표 접근 여부를 확인합니다."]
      },
      review: {
        structuredReview: {
          verdict: "유지",
          headline: "중간 리뷰: 현재 롱은 아직 유지합니다.",
          action: "손절가를 넓히지는 않습니다."
        }
      },
      payload: {
        aiApprovalReason: "ATR 흐름이 눌림 뒤 회복되며 롱 진입 조건을 충족했습니다.",
        aiReview: {
          sourceLocale: "ko",
          structuredReview: {
            verdict: "조정 후 승인",
            headline: entryHeadline,
            action: "확인된 되돌림 가격에서만 작게 진입합니다.",
            keyReasons: ["15분 봉이 눌림 후 다시 상단으로 회복했습니다."],
            risks: ["추격 매수는 피해야 합니다."],
            watchConditions: ["되돌림 저점을 다시 깨면 진입 논리는 약해집니다."]
          }
        }
      }
    }
  ];

  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-426");

  assert.equal(positionScenario.reviewBrief.headline, entryHeadline);
  assert.match(positionScenario.rationale, /ATR 추세가 이어지는 동안/);
  assert.doesNotMatch(positionScenario.rationale, new RegExp(managementHeadline));
});

test("entry approval scenarios without saved entry copy do not fall back to management rationale", () => {
  const trader = { id: "vwap-reclaim", currentPlan: "watch", baseRiskPercent: 0.35, description: "strategy", concept: "concept" };
  const positions = [
    {
      id: 427,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      entryPrice: 61120,
      payload: {
        managementRationale: "이 문장은 진행 중 포지션 관리 리뷰라 상세 진입 근거에 나오면 안 됩니다.",
        review: { rationale: "중간 리뷰 관리 메모" }
      }
    }
  ];

  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-427");

  assert.equal(positionScenario.rationale, null);
  assert.equal(positionScenario.reviewBrief, null);
});

test("merged open position detail keeps the freshest leg entry approval brief", () => {
  const positions = [
    {
      id: 701,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      quantity: 0.01,
      entryPrice: 59719.3,
      stopLossPrice: 60240.8,
      openedAt: "2026-06-29T02:10:00.000Z",
      updatedAt: "2026-06-29T02:10:00.000Z",
      payload: {
        aiApprovalReason: "Older first fill approval reason.",
        aiReview: {
          structuredReview: {
            verdict: "APPROVE",
            headline: "Older first fill headline.",
            action: "Older first fill action."
          }
        }
      }
    },
    {
      id: 702,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      quantity: 0.02,
      entryPrice: 59680.1,
      stopLossPrice: 60240.8,
      openedAt: "2026-06-29T02:30:00.000Z",
      updatedAt: "2026-06-29T02:35:00.000Z",
      payload: {
        aiApprovalReason: "Fresh confirmation fill approval reason.",
        aiReview: {
          structuredReview: {
            verdict: "APPROVE",
            headline: "Fresh confirmation fill headline.",
            action: "Fresh confirmation fill action.",
            keyReasons: ["Fresh reason"],
            risks: ["Fresh risk"],
            watchConditions: ["Fresh watch"],
            managerNote: "Fresh manager note"
          }
        }
      }
    }
  ];

  const selected = positionReviewSource.selectMergedPositionReviewSource(positions);

  assert.equal(selected.id, 702);
  assert.equal(selected.payload.aiApprovalReason, "Fresh confirmation fill approval reason.");
  assert.equal(selected.payload.aiReview.structuredReview.headline, "Fresh confirmation fill headline.");

  const topLevelOnly = positionReviewSource.selectMergedPositionReviewSource([
    {
      id: 703,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      updatedAt: "2026-06-29T02:40:00.000Z"
    },
    {
      id: 704,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      rationale: "Fresh top-level approval rationale.",
      updatedAt: "2026-06-29T02:45:00.000Z"
    }
  ]);

  assert.equal(topLevelOnly.id, 704);
  assert.equal(topLevelOnly.rationale, "Fresh top-level approval rationale.");
});

test("merged open positions choose entry approval over later management-only review", () => {
  const positions = [
    {
      id: 711,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      updatedAt: "2026-07-03T06:00:00.000Z",
      payload: {
        aiApprovalReason: "Saved Korean entry approval.",
        aiReview: {
          sourceLocale: "ko",
          structuredReview: {
            verdict: "승인",
            headline: "진입 당시 롱 승인 근거입니다.",
            action: "되돌림 확인 후에만 진입합니다."
          }
        }
      }
    },
    {
      id: 712,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      updatedAt: "2026-07-03T07:00:00.000Z",
      structuredReview: {
        verdict: "유지",
        headline: "나중에 생성된 진행 중 포지션 리뷰입니다.",
        action: "보유 상태만 점검합니다."
      },
      review: {
        rationale: "This is management review copy, not entry approval."
      }
    }
  ];

  const selected = positionReviewSource.selectMergedPositionReviewSource(positions);

  assert.equal(selected.id, 711);
  assert.equal(selected.payload.aiApprovalReason, "Saved Korean entry approval.");
});

test("entry approval scenarios use translated structured review when Korean translation is stale but usable", () => {
  // Given: a Korean detail response contains a stale but valid translated structured review.
  const trader = { id: "channel-rider", currentPlan: "watch", baseRiskPercent: 0.45, description: "strategy", concept: "concept" };
  const positions = [
    {
      id: 425,
      symbol: "BTCUSDT",
      status: "open",
      side: "short",
      entryPrice: 60025.6,
      translation: {
        status: "ok",
        embeddedAiReview: {
          status: "ok",
          locale: "ko",
          sourceHash: "current",
          cachedSourceHash: "older",
          staleSourceHash: true
        }
      },
      payload: {
        aiApprovalReason: "ADJUST_AND_APPROVE: 채널 지도자는 축소된 위험으로만 숏 진입할 수 있습니다.",
        aiReview: {
          approvalReason: "ADJUST_AND_APPROVE: 채널 지도자는 축소된 위험으로만 숏 진입할 수 있습니다.",
          structuredReview: {
            verdict: "ADJUST_AND_APPROVE",
            headline: "채널 지도자는 상단 채널 재테스트에서 축소된 숏 진입만 허용됩니다.",
            action: "위험을 줄이고 무효화 기준을 엄격히 유지하세요.",
            keyReasons: ["수수료 반영 손익비가 최소 기준을 넘습니다."],
            risks: ["최근 두 번의 숏 거래가 손절로 끝났습니다."],
            watchConditions: ["가격이 채널 경계 위에서 마감하면 종료하세요."],
            managerNote: "경계는 약하다고 보고 다루세요."
          }
        },
        aiStructuredReview: {
          verdict: "ADJUST_AND_APPROVE",
          headline: "채널 지도자는 상단 채널 재테스트에서 축소된 숏 진입만 허용됩니다.",
          action: "위험을 줄이고 무효화 기준을 엄격히 유지하세요."
        }
      }
    }
  ];

  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-425");

  assert.equal(positionScenario.reviewBrief.headline, "채널 지도자는 상단 채널 재테스트에서 축소된 숏 진입만 허용됩니다.");
  assert.equal(positionScenario.reviewBrief.action, "위험을 줄이고 무효화 기준을 엄격히 유지하세요.");
  assert.equal(positionScenario.rationale, "채널 지도자는 상단 채널 재테스트에서 축소된 숏 진입만 허용됩니다. 위험을 줄이고 무효화 기준을 엄격히 유지하세요.");
});

test("entry approval scenarios fall back to English structured review when Korean translation fails", () => {
  const trader = { id: "atr-trail-commander", currentPlan: "watch", baseRiskPercent: 0.4, description: "strategy", concept: "concept" };
  const positions = [
    {
      id: 560,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      entryPrice: 61984.8,
      translation: {
        status: "fallback",
        embeddedAiReview: {
          status: "fallback",
          locale: "ko",
          sourceHash: "current",
          fallbackLocale: "en"
        }
      },
      payload: {
        aiApprovalReason: "진입 조건은 61984.8에서 ATR 추세 지속 LONG입니다.",
        aiReview: {
          approvalReason: "진입 조건은 61984.8에서 ATR 추세 지속 LONG입니다."
        },
        aiStructuredReview: {
          verdict: "Adjusted approval",
          headline: "ATR trend-continuation LONG is worth a reduced-size entry around 61984.8.",
          action: "Place the LONG with reduced 0.40% account risk and keep 5x leverage.",
          keyReasons: ["1h and 4h buyers are holding above their EMA bands."],
          risks: ["A failed push above 62050 can turn this into a late LONG."],
          watchConditions: ["Cancel the pullback if TP1 is reached first."],
          managerNote: "Use the structured review instead of synthetic fallback labels."
        }
      }
    }
  ];

  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-560");

  assert.equal(positionScenario.reviewBrief.headline, "ATR trend-continuation LONG is worth a reduced-size entry around 61984.8.");
  assert.equal(positionScenario.reviewBrief.action, "Place the LONG with reduced 0.40% account risk and keep 5x leverage.");
  assert.equal(positionScenario.rationale, "ATR trend-continuation LONG is worth a reduced-size entry around 61984.8. Place the LONG with reduced 0.40% account risk and keep 5x leverage. 1h and 4h buyers are holding above their EMA bands. Cancel the pullback if TP1 is reached first.");
});

test("entry approval scenarios strip legacy decision prefixes from detail copy", () => {
  const trader = { id: "trend-sentinel", currentPlan: "watch", baseRiskPercent: 0.35, description: "strategy", concept: "concept" };
  const positions = [
    {
      id: 621,
      symbol: "BTCUSDT",
      status: "open",
      side: "long",
      entryPrice: 63371,
      payload: {
        aiStructuredReview: {
          verdict: "ADJUST_AND_APPROVE",
          headline: "ADJUST_AND_APPROVE: Trend Sentinel은 4H 추세 회복 후 BTCUSDT LONG을 열었습니다.",
          action: "조정 후 승인: 1H 평균 구역 회복이 진입 트리거입니다.",
          keyReasons: [
            "진입 트리거는 가격이 평균 구역을 회복하며 매수세가 다시 붙은 점입니다.",
            "현재 포지션은 유지하고 다음 리뷰까지 계속 관찰하세요."
          ],
          risks: ["손절선 이탈 시 롱 근거가 사라집니다."],
          watchConditions: ["평균 구역 아래로 마감하면 진입 논리가 약해집니다."],
          managerNote: "현재 포지션은 유지하고 다음 리뷰까지 계속 관찰하세요."
        }
      }
    }
  ];

  const scenarios = league.buildScenarios({ trader, positions, orders: [], reviews: [], events: [] });
  const positionScenario = scenarios.find((scenario) => scenario.id === "position-621");

  assert.equal(positionScenario.reviewBrief.headline, "Trend Sentinel은 4H 추세 회복 후 BTCUSDT LONG을 열었습니다.");
  assert.equal(positionScenario.reviewBrief.action, "1H 평균 구역 회복이 진입 트리거입니다.");
  assert.equal(positionScenario.reviewBrief.keyReasons.includes("현재 포지션은 유지하고 다음 리뷰까지 계속 관찰하세요."), false);
  assert.equal(positionScenario.reviewBrief.managerNote, null);
  assert.equal(positionScenario.rationale.includes("ADJUST_AND_APPROVE"), false);
  assert.equal(positionScenario.rationale.includes("조정 후 승인:"), false);
  assert.equal(positionScenario.rationale.includes("다음 리뷰"), false);
});

test("entry detail brief keeps only core entry evidence", () => {
  // Given: the provider returns a structured review with useful entry evidence mixed with risk/control paragraphs.
  const brief = {
    verdict: "조정 후 승인",
    headline: "Trend Sentinel은 4H 상승 추세가 유지되는 동안 62838.9-62844.4 조정 구역에서 BTCUSDT LONG을 취할 수 있습니다.",
    action: "계획된 LIMIT LONG은 5배 레버리지와 0.35% 위험으로 두 가격에만 배치하고 추격하지 마세요.",
    keyReasons: [
      "진입 트리거는 1H 평균 구역으로의 통제된 조정 후 현재 가격 근처에서 확인된 체결입니다.",
      "62405.3 손절선과 63410.0 목표는 수수료 차감 후 1.80의 보상률을 제공합니다."
    ],
    risks: ["펀딩이 혼잡하며 4H RSI가 높아 빠른 하락이 발생하면 구매자가 늦은 것으로 볼 수 있습니다."],
    watchConditions: ["가격이 62405.3 아래로 닫히면 LONG 승인 근거는 사라집니다."],
    managerNote: "손절 시퀀스와 혼잡한 펀딩 후에는 규모를 줄여야 합니다."
  };

  // When: the position detail modal prepares an entry-focused brief.
  const items = reviewBrief.entryRationaleItems(brief);

  // Then: only the entry trigger remains as supporting copy; risk geometry and manager notes stay out of the entry rationale block.
  assert.deepEqual(items, [
    "진입 트리거는 1H 평균 구역으로의 통제된 조정 후 현재 가격 근처에서 확인된 체결입니다."
  ]);
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
  assert.match(modalSource, /focus="entry"/);
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

test("legacy entry approval rationale is not rewritten into synthetic section labels", () => {
  const rawRationale =
    "BTC가 다시 상단 채널에서 페이드되고 있으며, 가격이 60398.1의 확인 한계에 위치하고 있고 60579.3의 탐색이 여전히 저항 구역에 있으며, 15분 RSI가 58.9 근처에 있어 통제된 채널 가장자리 시도를 지지합니다. 61342.8의 손절은 페이드 구역 위에 있으며, 59217.2와 58287.1의 목표는 1.92의 수수료 고려 손익비를 제공하지만, 최근 세 번의 SHORT 손절이 반복되어 위험을 0.35%로 줄여야 합니다.";
  const text = scenarioCopy.scenarioDetailRationaleText(
    {
      id: "position-legacy-approval",
      source: "position",
      phase: "OPEN_POSITION",
      status: "open",
      rationale: rawRationale
    },
    (key) =>
      ({
        "detail.noAiRationale": "저장된 AI 판단 근거 없음"
      })[key] ?? key
  );

  assert.equal(text, rawRationale);
  assert.doesNotMatch(text, /^진입 판단:/);
  assert.doesNotMatch(text, /전략 해석:/);
  assert.doesNotMatch(text, /리스크 조건:/);
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
  assert.doesNotMatch(reviewCopy, /현재 포지션은 아직 유지가 맞습니다/);
  assert.match(reviewCopy, /손절 접근 여부만 확인하세요/);
  assert.match(reviewCopy, /진입 근거가 깨지지 않았습니다/);
  assert.doesNotMatch(reviewCopy, /포지션 유지 중\. 핵심 조건만 확인합니다/);

  const positionCopy = scenarioFeed.scenarioTimelineBody(
    { id: "position-1", source: "position", phase: "OPEN_POSITION", status: "open", reviewBrief: structured, rationale: "old long paragraph" },
    undefined,
    reviewT
  );
  assert.doesNotMatch(positionCopy, /현재 포지션은 아직 유지가 맞습니다/);
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
  assert.doesNotMatch(copy, /가격 구조로 신중한 접근 필요/);
  assert.doesNotMatch(copy, /약한 거래량 주의/);
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
