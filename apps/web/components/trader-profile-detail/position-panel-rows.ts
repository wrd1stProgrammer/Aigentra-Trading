import type { PaperOrder } from "@/lib/api";
import type { LeagueSymbol } from "@/lib/league";
import { isOpenChartExposure } from "@/components/live-candle-chart-overlays";
import type { PlanView } from "@/components/trader-profile-detail/types";

export type DisplayPaperOrder = PaperOrder & {
  readonly payload?: Record<string, unknown> | null;
  readonly limitPrice?: number | null;
  readonly stopLossPrice?: number | null;
  readonly takeProfitPrice?: number | null;
  readonly leverage?: number | null;
};

type PendingEntryOrderLike = {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly side?: unknown;
  readonly payload?: unknown;
  readonly type?: unknown;
  readonly orderType?: unknown;
  readonly order_type?: unknown;
  readonly action?: unknown;
  readonly actionType?: unknown;
};

export function buildDisplayOpenOrders({
  orders,
  symbol
}: {
  readonly orders: readonly PaperOrder[];
  readonly latestPlan?: PlanView | null;
  readonly symbol: LeagueSymbol;
}): DisplayPaperOrder[] {
  return orders.filter((order) => matchesSymbol(order.symbol, symbol) && isPendingEntryOrder(order));
}

export function isPendingEntryOrder(order: PendingEntryOrderLike) {
  return isOpenChartExposure(order) && !isSyntheticOrder(order) && isDirectionalEntrySide(order.side) && !isProtectiveExitOrder(order);
}

function matchesSymbol(value: unknown, symbol: LeagueSymbol) {
  return !value || String(value).toUpperCase() === symbol;
}

function isSyntheticOrder(order: PendingEntryOrderLike) {
  const id = order.id === null || order.id === undefined ? "" : String(order.id);
  return id.startsWith("plan-") || recordValue(order.payload)?.syntheticPlanOrder === true;
}

function isDirectionalEntrySide(value: unknown) {
  const normalized = normalizeToken(value);
  return normalized === "LONG" || normalized === "SHORT" || normalized === "BUY" || normalized === "SELL";
}

function isProtectiveExitOrder(order: PendingEntryOrderLike) {
  const payload = recordValue(order.payload);
  const text = [
    order.type,
    order.orderType,
    order.order_type,
    order.status,
    order.action,
    order.actionType,
    payload?.type,
    payload?.orderType,
    payload?.order_type,
    payload?.purpose,
    payload?.role,
    payload?.reason,
    payload?.action,
    payload?.actionType
  ]
    .map((value) => normalizeToken(value))
    .filter(Boolean)
    .join(" ");
  if (!text) return false;
  return (
    /\b(TAKE_PROFIT|TP|STOP_LOSS|SL|LIQUIDATION|CLOSE|EXIT|REDUCE|CANCEL_REMAINING)\b/.test(text) ||
    text.includes("PROFIT_PROTECT")
  );
}

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}
