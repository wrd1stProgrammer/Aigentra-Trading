import type {
  ManagementReview,
  PaperOrder,
  PaperPosition,
  PaperTradeEvent,
  TraderPaperSummary,
  TraderProfile
} from "@/lib/api";
import type { ReviewBrief } from "@/lib/review-brief";
import { cleanEntryApprovalRationale, entryApprovalBriefFromRecord, reviewBriefFromRecord, reviewBriefText } from "@/lib/review-brief";
import { fallbackTraders } from "@/lib/traders";

export type LeagueSymbol = "BTCUSDT" | "ETHUSDT";

export const traderVisuals: Record<string, { tone: string; accent: string; initials: string; alias: string }> = {
  "channel-rider": {
    tone: "from-sky-500 to-cyan-700",
    accent: "#0ea5e9",
    initials: "CR",
    alias: "Channel Desk"
  },
  "volume-breaker": {
    tone: "from-emerald-500 to-teal-700",
    accent: "#10b981",
    initials: "VB",
    alias: "Volume Desk"
  },
  "pullback-architect": {
    tone: "from-amber-500 to-orange-700",
    accent: "#f59e0b",
    initials: "PA",
    alias: "Pullback Desk"
  },
  "leverage-hunter": {
    tone: "from-rose-500 to-red-700",
    accent: "#f43f5e",
    initials: "LH",
    alias: "Leverage Desk"
  },
  "liquidation-pressure-sniper": {
    tone: "from-emerald-500 to-cyan-800",
    accent: "#2dd4bf",
    initials: "LP",
    alias: "Liquidation Desk"
  },
  "volatility-skew-sentinel": {
    tone: "from-amber-400 to-rose-700",
    accent: "#f59e0b",
    initials: "SK",
    alias: "Skew Desk"
  },
  "liquidity-reaper": {
    tone: "from-zinc-600 to-stone-950",
    accent: "#52525b",
    initials: "LR",
    alias: "Liquidity Desk"
  },
  "volatility-squeezer": {
    tone: "from-violet-500 to-fuchsia-700",
    accent: "#8b5cf6",
    initials: "VS",
    alias: "Squeeze Desk"
  },
  "trend-sentinel": {
    tone: "from-blue-500 to-indigo-800",
    accent: "#2563eb",
    initials: "TS",
    alias: "Trend Desk"
  },
  "range-maker": {
    tone: "from-lime-500 to-emerald-700",
    accent: "#84cc16",
    initials: "RM",
    alias: "Range Desk"
  },
  "funding-contrarian": {
    tone: "from-orange-500 to-red-700",
    accent: "#f97316",
    initials: "FC",
    alias: "Funding Desk"
  },
  "orderflow-sniper": {
    tone: "from-cyan-500 to-blue-800",
    accent: "#06b6d4",
    initials: "OS",
    alias: "Orderflow Desk"
  },
  "donchian-breakout": {
    tone: "from-blue-600 to-slate-900",
    accent: "#2563eb",
    initials: "DB",
    alias: "Breakout Desk"
  },
  "ichimoku-cloud-pilot": {
    tone: "from-indigo-500 to-violet-800",
    accent: "#6366f1",
    initials: "IC",
    alias: "Cloud Desk"
  },
  "vwap-reclaimer": {
    tone: "from-teal-500 to-cyan-800",
    accent: "#14b8a6",
    initials: "VR",
    alias: "Fair Value Desk"
  },
  "wyckoff-spring": {
    tone: "from-fuchsia-500 to-rose-800",
    accent: "#d946ef",
    initials: "WS",
    alias: "Spring Desk"
  },
  "rsi-divergence-scout": {
    tone: "from-purple-500 to-indigo-800",
    accent: "#a855f7",
    initials: "RD",
    alias: "Divergence Desk"
  },
  "session-raider": {
    tone: "from-yellow-500 to-orange-700",
    accent: "#eab308",
    initials: "SR",
    alias: "Session Desk"
  },
  "imbalance-hunter": {
    tone: "from-red-500 to-stone-900",
    accent: "#ef4444",
    initials: "IH",
    alias: "Imbalance Desk"
  },
  "momentum-ignition": {
    tone: "from-green-500 to-emerald-900",
    accent: "#22c55e",
    initials: "MI",
    alias: "Momentum Desk"
  },
  "bollinger-reversion": {
    tone: "from-slate-500 to-zinc-800",
    accent: "#64748b",
    initials: "BR",
    alias: "Reversion Desk"
  },
  "atr-trail-commander": {
    tone: "from-cyan-600 to-slate-900",
    accent: "#0891b2",
    initials: "AT",
    alias: "ATR Desk"
  }
};

export type TraderStanding = TraderProfile & {
  summary?: TraderPaperSummary;
  rank: number;
  equity: number;
  returnPct: number;
  return7d: number;
  return24h: number;
  return30d: number;
  monthlyReturn: number;
  totalPnl: number;
  totalFees: number;
  winRate: number | null;
  maxDrawdown: number;
  biggestWin: number;
  biggestLoss: number;
  sharpe: number;
  trades: number;
  openOrders: number;
  openPositions: number;
  riskPercent: number;
  leverage: number | null;
  averageLeverage: number | null;
  rankScore: number;
  rankingReturn: number;
};

export function buildStandings(traders: readonly TraderProfile[], summaries: readonly TraderPaperSummary[]): TraderStanding[] {
  const summaryMap = new Map(summaries.map((item) => [item.traderId, item]));
  const base: readonly TraderProfile[] = traders.length ? traders : fallbackTraders;
  return base
    .map((trader) => {
      const summary = summaryMap.get(trader.id);
      const equity = numberValue(summary?.equity, 10000);
      const totalPnl = numberValue(summary?.totalPnl, 0, 0);
      const inferredInitial = equity - totalPnl;
      const cumulativeReturn = numberValue(
        summary?.cumulativeReturn,
        inferredInitial > 0 ? (totalPnl / inferredInitial) * 100 : summary?.return30d,
        0
      );
      const return7d = numberValue(summary?.return7d, 0);
      const return24h = numberValue(summary?.return24h, 0);
      const return30d = numberValue(summary?.return30d, 0);
      const monthlyReturn = numberValue(summary?.monthlyReturn, return7d);
      const isMonthlySnapshot =
        summary?.currentState?.key === "monthly_snapshot" || summary?.currentState?.source === "monthly";
      const rankingReturn = isMonthlySnapshot ? monthlyReturn : cumulativeReturn;
      const closed = numberValue(summary?.closedPositions, 0, 0);
      const backendRank = numberValue(summary?.rank, 0, 0);
      return {
        ...trader,
        summary,
        rank: backendRank,
        equity,
        returnPct: cumulativeReturn,
        return7d,
        return24h,
        return30d,
        monthlyReturn,
        totalPnl,
        totalFees: numberValue(summary?.totalFees, 0, 0),
        winRate: numberValue(summary?.winRate, 0),
        maxDrawdown: numberValue(summary?.maxDrawdown, 0),
        biggestWin: numberValue(summary?.biggestWin, 0),
        biggestLoss: numberValue(summary?.biggestLoss, 0),
        sharpe: numberValue(summary?.sharpe, 0),
        trades: closed,
        openOrders: numberValue(summary?.openOrders, 0, 0),
        openPositions: numberValue(summary?.openPositions, 0, 0),
        riskPercent: numberValue(summary?.riskPercent, trader.baseRiskPercent, 0),
        leverage: summary?.leverage ?? null,
        averageLeverage: summary?.averageLeverage ?? summary?.leverage ?? null,
        rankScore: numberValue(summary?.rankScore, rankingReturn),
        rankingReturn
      };
    })
    .sort((a, b) => {
      return b.rankingReturn - a.rankingReturn || b.rankScore - a.rankScore || b.equity - a.equity || a.id.localeCompare(b.id);
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function buildEquityCurve(standing: TraderStanding, points = 28) {
  const visual = traderVisuals[standing.id] ?? traderVisuals["channel-rider"];
  const base = 10000;
  const final = standing.equity || base;
  const volatility = 0.012 + Math.abs(standing.returnPct) / 2400;
  let previous = base;
  const values = Array.from({ length: points }, (_, index) => {
    const progress = index / Math.max(points - 1, 1);
    const target = base + (final - base) * progress;
    const wave = Math.sin((index + standing.rank) * 0.9) * base * volatility;
    const pullback = index % 7 === 0 ? -base * volatility * 0.75 : 0;
    previous = Math.max(1000, target + wave + pullback + (previous - target) * 0.12);
    if (index === points - 1) previous = final;
    return {
      x: index,
      y: Math.round(previous * 100) / 100,
      color: visual.accent
    };
  });
  return values;
}

export type TraderScenario = {
  id: string;
  title: string;
  phase: string;
  status: string;
  eventType?: string | null;
  side?: string | null;
  price?: number | null;
  stop?: number | null;
  target?: number | null;
  quantity?: number | null;
  leverage?: number | null;
  riskPercent?: number | null;
  entryWeight?: number | null;
  confidence?: number | string | null;
  provider?: string | null;
  reviewBrief?: ReviewBrief | null;
  rationale?: string | null;
  summary?: string | null;
  action?: string | null;
  createdAt?: string | null;
  source: "position" | "order" | "review" | "event" | "strategy";
};

const HIDDEN_MANAGEMENT_SCENARIO_DECISIONS = new Set(["REJECT", "REJECTED", "DEFER", "NEEDS_MORE_DATA"]);
const PROVIDER_FAILURE_FLAGS = new Set(["PROVIDER_FAILED", "PROVIDER_FAILURE", "PROVIDER_ERROR"]);
const COMPLETED_TAKE_PROFIT_STATUSES = new Set(["COMPLETED", "DONE", "FILLED", "HIT", "TRIGGERED", "TAKE_PROFIT", "TP_FILLED"]);

export function buildScenarios(args: {
  trader: TraderProfile;
  positions: PaperPosition[];
  orders: PaperOrder[];
  reviews: ManagementReview[];
  events: PaperTradeEvent[];
}): TraderScenario[] {
  const scenarios: TraderScenario[] = [];
  const positionMap = new Map(args.positions.map((position) => [String(position.id), position]));
  const orderMap = new Map(args.orders.map((order) => [String(order.id), order]));

  for (const position of args.positions) {
    const payload = (position.payload ?? {}) as Record<string, any>;
    const reviewBrief = entryApprovalBriefFromRecord(position);
    const rationale = reviewBriefText(reviewBrief) ?? entryRationaleFromPayload(payload);
    scenarios.push({
      id: `position-${position.id}`,
      title: "Active simulated position",
      phase: "OPEN_POSITION",
      status: position.status ?? "open",
      side: position.side,
      price: firstNumber(position.entryPrice, position.averageEntryPrice, position.openPrice),
      stop: firstNumber(position.stopLoss, position.stopLossPrice, position.stop_loss_price),
      target: activeTakeProfitPrice(position, payload),
      quantity: firstNumber(position.quantity, position.size),
      leverage: firstNumber(position.leverage, payload.leveragePlan?.suggestedLeverage),
      riskPercent: firstNumber(payload.riskPercent),
      entryWeight: firstNumber(payload.entryWeight, payload.weight),
      reviewBrief,
      rationale,
      summary: scenarioSummaryFromPayload(payload),
      createdAt: position.openedAt ?? position.createdAt ?? position.updatedAt ?? null,
      source: "position"
    });
  }

  for (const order of args.orders) {
    const payload = (order.payload ?? {}) as Record<string, any>;
    const reviewBrief = entryApprovalBriefFromRecord(order);
    const rationale = reviewBriefText(reviewBrief) ?? entryRationaleFromPayload(payload);
    scenarios.push({
      id: `order-${order.id}`,
      title: payload.entryReason ?? "Pending entry order",
      phase: "PENDING_ORDER",
      status: order.status ?? "open",
      side: order.side,
      price: firstNumber(order.price, order.limitPrice, order.stopPrice, order.triggerPrice),
      stop: firstNumber(order.stopLossPrice, order.stop_loss_price),
      target: firstNumber(order.takeProfitPrice, order.take_profit_price, payload.target?.price),
      quantity: firstNumber(order.quantity),
      leverage: firstNumber(order.leverage, payload.leveragePlan?.suggestedLeverage),
      riskPercent: firstNumber(payload.riskPercent),
      entryWeight: firstNumber(payload.entryWeight, payload.weight, payload.entry?.weight),
      reviewBrief,
      rationale,
      summary: scenarioSummaryFromPayload(payload),
      createdAt: order.updatedAt ?? order.createdAt,
      source: "order"
    });
  }

  for (const review of args.reviews) {
    if (!isDisplayableManagementScenarioReview(review)) continue;
    const payload = (review.payload ?? {}) as Record<string, any>;
    const event = review.event ?? payload.event ?? {};
    const exposurePayload = (review.exposure ?? payload.exposure ?? {}) as Record<string, any>;
    const nested = review.review ?? payload.review ?? {};
    const linkedPosition = exposurePayload.kind === "position" || review.positionId ? positionMap.get(String(exposurePayload.id ?? review.positionId)) : undefined;
    const linkedOrder = exposurePayload.kind === "order" || review.orderId ? orderMap.get(String(exposurePayload.id ?? review.orderId)) : undefined;
    const linkedPayload = ((linkedPosition?.payload ?? linkedOrder?.payload ?? {}) as Record<string, any>);
    const exposureInnerPayload = ((exposurePayload.payload ?? linkedPayload) as Record<string, any>);
    const metrics = (event.metrics ?? {}) as Record<string, any>;
    const action = Array.isArray(nested.actions) ? nested.actions[0] : null;
    const reviewBrief = reviewBriefFromRecord(review);
    scenarios.push({
      id: `review-${review.id}`,
      title: String(event.eventType ?? review.eventType ?? "AI management review"),
      phase: String(event.phase ?? review.phase ?? "-"),
      status: String(review.decision ?? nested.decision ?? review.action ?? "-"),
      eventType: String(event.eventType ?? review.eventType ?? ""),
      side: exposurePayload.side ?? linkedPosition?.side ?? linkedOrder?.side ?? null,
      price: firstNumber(
        metrics.price,
        exposurePayload.entryPrice,
        exposurePayload.limitPrice,
        linkedPosition?.entryPrice,
        linkedPosition?.averageEntryPrice,
        linkedOrder?.limitPrice,
        linkedOrder?.price
      ),
      stop: firstNumber(metrics.stopLoss, exposurePayload.stopLoss, linkedPosition?.stopLossPrice, linkedOrder?.stopLossPrice, linkedPosition?.stop_loss_price, linkedOrder?.stop_loss_price),
      target: firstNumber(metrics.takeProfit, exposurePayload.takeProfit, linkedPosition ? activeTakeProfitPrice(linkedPosition, linkedPayload) : null, linkedOrder?.takeProfitPrice, linkedOrder?.take_profit_price, exposureInnerPayload.target?.price),
      quantity: firstNumber(exposurePayload.quantity, linkedPosition?.quantity, linkedOrder?.quantity),
      leverage: firstNumber(exposurePayload.leverage, linkedPosition?.leverage, linkedOrder?.leverage, exposureInnerPayload.leveragePlan?.suggestedLeverage),
      riskPercent: firstNumber(exposureInnerPayload.riskPercent),
      entryWeight: firstNumber(exposureInnerPayload.entryWeight, exposurePayload.entryWeight, linkedPayload.entryWeight, linkedPayload.entry?.weight),
      confidence: review.confidence ?? nested.confidence ?? null,
      provider: review.provider ?? nested.provider ?? null,
      reviewBrief,
      rationale: reviewBriefText(reviewBrief) ?? review.rationale ?? nested.rationale ?? action?.reason ?? event.reason ?? null,
      summary: null,
      action: review.actionType ?? action?.type ?? review.action ?? null,
      createdAt: review.createdAt,
      source: "review"
    });
  }
  if (!scenarios.length) {
    scenarios.push({
      id: `${args.trader.id}-strategy`,
      title: args.trader.currentPlan,
      phase: "WATCHLIST",
      status: "WAITING",
      riskPercent: args.trader.baseRiskPercent,
      rationale: args.trader.description,
      summary: args.trader.concept ?? args.trader.currentPlan,
      source: "strategy"
    });
  }
  return scenarios.sort((a, b) => scenarioTime(b.createdAt) - scenarioTime(a.createdAt));
}

function activeTakeProfitPrice(record: Record<string, any>, payload: Record<string, any> = {}): number | null {
  const targets = takeProfitTargets(record, payload);
  const target = targets.find((item) => !COMPLETED_TAKE_PROFIT_STATUSES.has(String(item.status ?? item.state ?? "").trim().replace(/[-\s]+/g, "_").toUpperCase())) ?? targets[0];
  return firstNumber(
    target?.price,
    target?.targetPrice,
    record.takeProfit,
    record.takeProfitPrice,
    record.take_profit_price,
    payload.takeProfit,
    payload.takeProfitPrice,
    payload.take_profit_price,
    payload.target?.price
  );
}

function takeProfitTargets(record: Record<string, any>, payload: Record<string, any>) {
  if (Array.isArray(record.takeProfits)) return record.takeProfits;
  if (Array.isArray(record.take_profits)) return record.take_profits;
  if (Array.isArray(payload.takeProfits)) return payload.takeProfits;
  if (Array.isArray(payload.take_profits)) return payload.take_profits;
  return [];
}

function isDisplayableManagementScenarioReview(review: ManagementReview): boolean {
  const status = normalizeReviewToken(review.status);
  if (status && status !== "OK") return false;
  if (firstString(review.errorMessage, review.error_message)) return false;

  const nested = recordValue(review.review);
  const payload = recordValue(review.payload);
  const payloadReview = recordValue(payload?.review);
  if (Boolean(review.fallback ?? nested?.fallback ?? payload?.fallback ?? payloadReview?.fallback)) return false;

  const decision = firstReviewToken(review.decision, nested?.decision, payloadReview?.decision, review.action, review.actionType);
  if (HIDDEN_MANAGEMENT_SCENARIO_DECISIONS.has(decision)) return false;

  const riskFlags = [
    ...stringList(review.riskFlags),
    ...stringList(nested?.riskFlags),
    ...stringList(payloadReview?.riskFlags)
  ];
  if (riskFlags.some((flag) => PROVIDER_FAILURE_FLAGS.has(normalizeReviewToken(flag)))) return false;

  const rationale = firstString(review.rationale, nested?.rationale, payloadReview?.rationale, review.reason);
  if (rationale?.trim().toLowerCase() === "position management provider failed.") return false;

  return true;
}

function firstReviewToken(...values: Array<unknown>): string {
  for (const value of values) {
    const token = normalizeReviewToken(value);
    if (token) return token;
  }
  return "";
}

function normalizeReviewToken(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function numberValue(...values: Array<unknown>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

export function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function scenarioRationaleFromPayload(payload: Record<string, any> | null | undefined, ...fallbacks: Array<unknown>): string | null {
  const aiReview = recordValue(payload?.aiReview);
  const review = recordValue(payload?.review);
  const action = recordValue(payload?.action);
  return firstString(
    payload?.aiApprovalReason,
    aiReview?.approvalReason,
    payload?.managementRationale,
    payload?.managementReason,
    review?.rationale,
    action?.reason,
    payload?.rationale,
    payload?.aiCounterThesis,
    ...fallbacks
  );
}

export function entryRationaleFromPayload(payload: Record<string, any> | null | undefined, ...fallbacks: Array<unknown>): string | null {
  const aiReview = recordValue(payload?.aiReview);
  const action = recordValue(payload?.action);
  return firstCleanEntryRationale(
    payload?.aiApprovalReason,
    aiReview?.approvalReason,
    payload?.approvalReason,
    payload?.entryReason,
    action?.entryReason,
    action?.approvalReason,
    ...fallbacks
  );
}

export function scenarioSummaryFromPayload(payload: Record<string, any> | null | undefined, ...fallbacks: Array<unknown>): string | null {
  return firstString(
    payload?.summary,
    ...fallbacks
  );
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function firstCleanEntryRationale(...values: Array<unknown>): string | null {
  for (const value of values) {
    const clean = cleanEntryApprovalRationale(value);
    if (clean) return clean;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function recordValue(value: unknown): Record<string, any> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, any>) : null;
}

function scenarioTime(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
