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

export function buildDisplayOpenOrders({
  orders,
  symbol
}: {
  readonly orders: readonly PaperOrder[];
  readonly latestPlan?: PlanView | null;
  readonly symbol: LeagueSymbol;
}): DisplayPaperOrder[] {
  return orders.filter((order) => matchesSymbol(order.symbol, symbol) && isOpenChartExposure(order) && !isSyntheticOrder(order));
}

function matchesSymbol(value: unknown, symbol: LeagueSymbol) {
  return !value || String(value).toUpperCase() === symbol;
}

function isSyntheticOrder(order: PaperOrder) {
  const id = order.id === null || order.id === undefined ? "" : String(order.id);
  return id.startsWith("plan-") || recordValue(order.payload)?.syntheticPlanOrder === true;
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}
