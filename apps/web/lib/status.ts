import type { TraderPaperSummary } from "@/lib/api";

type Translator = (key: string) => string;

type StatusLike = Pick<
  TraderPaperSummary,
  "agentPhase" | "latestPlanStatus" | "latestRunStatus" | "lastDecision" | "lastAction" | "openOrders" | "openPositions" | "currentState"
>;

const STATUS_KEYS: Record<string, string> = {
  ACTIVE_PAPER_EXPOSURE: "status.managing",
  ADJUST_AND_APPROVE: "status.adjustAndApprove",
  APPROVE: "status.approved",
  APPROVED: "status.approved",
  CANCEL_PENDING_ORDER: "status.cancelPendingOrder",
  CANCEL_ORDER: "status.cancelOrder",
  CANCEL_REMAINING_ORDERS: "status.cancelRemainingOrders",
  CLOSE_POSITION: "status.closePosition",
  COMPLETED: "status.completed",
  DEFENSIVE: "status.defensive",
  ERROR: "status.error",
  EXPANSION_MOMENTUM_LOST: "status.expansionMomentumLost",
  HOLD: "status.hold",
  IDLE: "status.idle",
  MANAGING: "status.managing",
  MONITORING: "status.watching",
  MOVE_STOP: "status.moveStop",
  MOVE_STOP_TO_BREAKEVEN: "status.moveStopToBreakeven",
  NEAR_STOP_RISK_REDUCTION: "status.nearStopRiskReduction",
  NO_CANDIDATE: "status.noCandidate",
  NO_PLAN: "status.noPlan",
  OK: "status.ok",
  OPEN: "status.open",
  OPEN_POSITION: "status.openPosition",
  ORDER_CANCELED_BY_AI: "status.orderCanceledByAi",
  ORDER_FILLED: "status.orderFilled",
  ORDERFLOW_SNIPER_POSITION_HEARTBEAT: "status.orderflowPositionHeartbeat",
  PAPER_TRADING_PENDING: "status.planReady",
  PAPER: "common.paperOnly",
  PARTIAL_TAKE_PROFIT: "status.partialTakeProfit",
  PENDING: "status.pending",
  PENDING_ORDER: "status.pendingOrder",
  POSITION_REDUCED_BY_AI: "status.positionReducedByAi",
  POSITION_CLOSED: "status.positionClosed",
  REDUCE_SIZE: "status.reduceSize",
  REDUCE_RISK: "status.reduceRisk",
  REJECT: "status.rejected",
  REJECTED: "status.rejected",
  REVIEW: "status.reviewed",
  REVIEWED: "status.reviewed",
  RISK_MANAGEMENT: "status.riskManagement",
  SCALE_ENTRY_CANCELLED: "status.scaleEntryCancelled",
  SCALP_FAST_DERISK: "status.scalpDerisk",
  SQUEEZE_MOMENTUM_DECAY: "status.squeezeMomentumDecay",
  STOP_UPDATED_BY_AI: "status.stopUpdatedByAi",
  STOP_LOSS: "status.stopLoss",
  STOP_MOVED_TO_BREAKEVEN: "status.moveStopToBreakeven",
  TAKE_PROFIT: "status.takeProfit",
  TAKE_PARTIAL_PROFIT: "status.partialTakeProfit",
  UNFILLED_SCALES_CANCELLED: "status.unfilledScalesCancelled",
  VOLATILITY_SQUEEZER_PENDING_HEARTBEAT: "status.squeezePendingHeartbeat",
  VOLATILITY_SQUEEZER_POSITION_HEARTBEAT: "status.squeezePositionHeartbeat",
  WAITING: "status.waiting",
  WATCHLIST: "status.watchlist",
  WATCHING: "status.watching"
};

export function statusLabel(value: unknown, t: Translator): string {
  if (value === null || value === undefined || value === "") return "-";
  const raw = String(value);
  const normalized = normalizeStatus(raw);
  const key = STATUS_KEYS[normalized];
  return key ? t(key) : humanizeStatus(raw);
}

export function traderStatusSummary(summary: StatusLike | null | undefined, t: Translator): string {
  if (!summary) return t("status.waitingForData");
  if (summary.currentState?.labelKey) return t(summary.currentState.labelKey);
  if ((summary.openPositions ?? 0) > 0) return t("status.summary.openPosition");
  if ((summary.openOrders ?? 0) > 0) return t("status.summary.pendingOrder");

  const planStatus = normalizeStatus(summary.latestPlanStatus);
  if (planStatus === "PAPER_TRADING_PENDING") return t("status.summary.planReady");

  const runStatus = normalizeStatus(summary.latestRunStatus);
  if (runStatus === "NO_CANDIDATE") return t("status.summary.watching");
  if (runStatus === "ACTIVE_PAPER_EXPOSURE") return t("status.summary.managing");
  if (runStatus === "COMPLETED") return t("status.summary.reviewed");

  const phase = normalizeStatus(summary.agentPhase);
  if (phase === "IDLE" || phase === "WATCHING") return t("status.summary.idle");
  if (phase === "OPEN_POSITION") return t("status.summary.openPosition");
  if (phase === "PENDING_ORDER") return t("status.summary.pendingOrder");
  return summary.agentPhase ? statusLabel(summary.agentPhase, t) : t("status.summary.idle");
}

export function statusTone(value: unknown): "good" | "bad" | "warn" | "neutral" {
  const normalized = normalizeStatus(value);
  if (["OPEN_POSITION", "COMPLETED", "APPROVE", "APPROVED", "MOVE_STOP_TO_BREAKEVEN", "HOLD", "OK"].includes(normalized)) return "good";
  if (["REVIEW", "REVIEWED"].includes(normalized)) return "neutral";
  if (["PAPER_TRADING_PENDING", "PENDING_ORDER", "PENDING", "MANAGING", "ACTIVE_PAPER_EXPOSURE", "DEFENSIVE", "MOVE_STOP", "NEAR_STOP_RISK_REDUCTION", "REDUCE_SIZE", "REDUCE_RISK", "RISK_MANAGEMENT", "PARTIAL_TAKE_PROFIT", "TAKE_PARTIAL_PROFIT", "WAITING", "WATCHLIST"].includes(normalized)) return "warn";
  if (["REJECTED", "CANCEL_ORDER", "CANCEL_PENDING_ORDER", "CANCEL_REMAINING_ORDERS", "CLOSE_POSITION", "ERROR"].includes(normalized)) return "bad";
  return "neutral";
}

function normalizeStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function humanizeStatus(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
