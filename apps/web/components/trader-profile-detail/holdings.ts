import type { PaperOrder, PaperPosition } from "@/lib/api";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { LeagueSymbol, TraderStanding } from "@/lib/league";
import { isOpenChartExposure } from "@/components/live-candle-chart-overlays";
import { isPendingEntryOrder } from "@/components/trader-profile-detail/position-panel-rows";
import type { HoldingBadge, HoldingDetail, HoldingItem, PlanView, Translator } from "@/components/trader-profile-detail/types";
import {
  firstFiniteNumber,
  normalizePercentWeight,
  orderExposureValue,
  orderHoldingNumbers,
  planEntryHoldingNumbers,
  positionExposureValue,
  positionHoldingNumbers,
  type HoldingNumbers
} from "@/components/trader-profile-detail/holding-metrics";

const HOLDING_COLORS = ["bg-rose-600", "bg-blue-700", "bg-slate-400", "bg-emerald-600", "bg-amber-500"] as const;

export function buildHoldingItems({
  standing,
  positions,
  orders,
  latestPlan,
  symbol,
  locale,
  t
}: {
  readonly standing?: TraderStanding;
  readonly positions: readonly PaperPosition[];
  readonly orders: readonly PaperOrder[];
  readonly latestPlan: PlanView;
  readonly symbol: LeagueSymbol;
  readonly locale: Locale;
  readonly t: Translator;
}): HoldingItem[] {
  const accountEquity = standing?.equity ?? 10_000;
  const activePositions = positions.filter((position) => (!position.symbol || position.symbol === symbol) && isOpenChartExposure(position));
  if (activePositions.length) {
    const exposures = activePositions.map((position) => positionExposureValue(position));
    const totalExposure = exposureTotal(exposures, firstFiniteNumber(standing?.summary?.openNotional, standing?.summary?.openMargin));
    return activePositions.map((position, index) => {
      const numbers = positionHoldingNumbers(position, accountEquity);
      const weight = exposureWeight(exposures[index], totalExposure, activePositions.length);
      return holdingItem({
        id: `position-${position.id ?? index}`,
        symbol,
        side: position.side,
        numbers,
        weight,
        returnPct: standing?.returnPct ?? null,
        colorClass: HOLDING_COLORS[index % HOLDING_COLORS.length],
        priceLabel: t("detail.averageEntry"),
        locale,
        t
      });
    });
  }

  const activeOrders = orders.filter((order) => (!order.symbol || order.symbol === symbol) && isPendingEntryOrder(order));
  if (activeOrders.length) {
    const exposures = activeOrders.map((order) => orderExposureValue(order));
    const totalExposure = exposureTotal(exposures, firstFiniteNumber(standing?.summary?.openOrderNotional));
    return activeOrders.map((order, index) => {
      const numbers = orderHoldingNumbers(order, accountEquity);
      const weight = exposureWeight(exposures[index], totalExposure, activeOrders.length);
      return holdingItem({
        id: `order-${order.id ?? index}`,
        symbol,
        side: order.side,
        numbers,
        weight,
        returnPct: null,
        colorClass: HOLDING_COLORS[index % HOLDING_COLORS.length],
        priceLabel: t("detail.orderPrice"),
        locale,
        t
      });
    });
  }

  if (latestPlan.entries.length) {
    return latestPlan.entries.map((entry, index) => {
      const numbers = planEntryHoldingNumbers(entry, latestPlan, accountEquity);
      const weight = normalizePercentWeight(entry.weight) ?? 1;
      return holdingItem({
        id: `plan-entry-${index}`,
        symbol,
        side: latestPlan.side,
        numbers,
        weight,
        returnPct: standing?.returnPct ?? null,
        colorClass: HOLDING_COLORS[index % HOLDING_COLORS.length],
        priceLabel: t("detail.planPrice"),
        fallbackSubLabel: entry.reason,
        locale,
        t
      });
    });
  }

  const openOrderWeight = Math.max(0, orders.length * 12);
  return [
    {
      id: "cash",
      label: t("common.equity"),
      subLabel: standing ? formatCurrency(standing.equity, locale) : "-",
      weight: Math.max(25, 100 - openOrderWeight),
      deploymentPercent: 0,
      exposurePercent: null,
      returnPct: standing?.returnPct ?? null,
      colorClass: "bg-slate-400",
      badges: [{ label: t("leaderboard.status.watching"), tone: "neutral" }],
      details: [{ label: t("common.equity"), value: standing ? formatCurrency(standing.equity, locale) : "-" }]
    }
  ];
}

export function accountDeploymentPercent(items: readonly HoldingItem[]) {
  return Math.min(100, items.reduce((sum, item) => sum + item.deploymentPercent, 0));
}

export function accountNotionalExposurePercent(items: readonly HoldingItem[]) {
  return Math.min(999, items.reduce((sum, item) => sum + (item.exposurePercent ?? 0), 0));
}

function holdingItem({
  id,
  symbol,
  side,
  numbers,
  weight,
  returnPct,
  colorClass,
  priceLabel,
  fallbackSubLabel,
  locale,
  t
}: {
  readonly id: string;
  readonly symbol: LeagueSymbol;
  readonly side?: string | null;
  readonly numbers: HoldingNumbers;
  readonly weight: number;
  readonly returnPct: number | null;
  readonly colorClass: string;
  readonly priceLabel: string;
  readonly fallbackSubLabel?: string;
  readonly locale: Locale;
  readonly t: Translator;
}): HoldingItem {
  const sideBadge = sideHoldingBadge(side);
  const deploymentPercent = firstFiniteNumber(numbers.accountMarginPercent, numbers.entryWeight, weight) ?? 0;
  return {
    id,
    label: symbol,
    subLabel: holdingSubLabel(priceLabel, numbers, fallbackSubLabel, locale, t),
    weight,
    deploymentPercent: clampPercent(deploymentPercent),
    exposurePercent: numbers.accountNotionalPercent === null ? null : clampPercent(numbers.accountNotionalPercent),
    returnPct,
    colorClass,
    badges: [
      ...(sideBadge ? [sideBadge] : []),
      ...(numbers.leverage ? [{ label: `${formatNumber(numbers.leverage, 1, locale)}x`, tone: "neutral" as const }] : [])
    ],
    details: holdingDetails(priceLabel, numbers, weight, locale, t)
  };
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function holdingSubLabel(priceLabel: string, numbers: HoldingNumbers, fallback: string | undefined, locale: Locale, t: Translator) {
  if (numbers.entryPrice !== null) return `${priceLabel} ${formatNumber(numbers.entryPrice, 0, locale)} · ${formatNumber(numbers.quantity, 4, locale)} ${t("common.quantity")}`;
  return fallback ?? `${formatNumber(numbers.quantity, 4, locale)} ${t("common.quantity")}`;
}

function holdingDetails(priceLabel: string, numbers: HoldingNumbers, weight: number, locale: Locale, t: Translator): HoldingDetail[] {
  const details: HoldingDetail[] = [
    { label: priceLabel, value: formatNumber(numbers.entryPrice, 0, locale) },
    { label: t("detail.leverage"), value: numbers.leverage === null ? "-" : `${formatNumber(numbers.leverage, 1, locale)}x` },
    { label: t("common.quantity"), value: formatNumber(numbers.quantity, 4, locale) }
  ];
  if (numbers.entryWeight !== null) {
    details.push({ label: t("detail.entryWeight"), value: formatPercent(numbers.entryWeight).replace("+", "") });
    if (Math.abs(numbers.entryWeight - weight) >= 0.1) {
      details.push({ label: t("detail.allocationWeight"), value: formatPercent(weight).replace("+", "") });
    }
  } else {
    details.push({ label: t("detail.allocationWeight"), value: formatPercent(weight).replace("+", "") });
  }
  if (numbers.notional !== null) details.push({ label: t("detail.exposure"), value: formatCurrency(numbers.notional, locale) });
  if (numbers.margin !== null) details.push({ label: t("detail.marginUsed"), value: formatCurrency(numbers.margin, locale) });
  if (numbers.accountMarginPercent !== null) details.push({ label: t("detail.accountMargin"), value: formatPercent(numbers.accountMarginPercent).replace("+", "") });
  if (numbers.accountNotionalPercent !== null) details.push({ label: t("detail.accountNotional"), value: formatPercent(numbers.accountNotionalPercent).replace("+", "") });
  if (numbers.pnl !== null) details.push({ label: t("common.pnl"), value: formatCurrency(numbers.pnl, locale), tone: numbers.pnl >= 0 ? "good" : "bad" });
  return details;
}

function sideHoldingBadge(side?: string | null): HoldingBadge | null {
  const normalized = String(side ?? "").toUpperCase();
  if (normalized === "LONG" || normalized === "BUY") return { label: "LONG", tone: "long" };
  if (normalized === "SHORT" || normalized === "SELL") return { label: "SHORT", tone: "short" };
  return null;
}

function exposureTotal(values: ReadonlyArray<number | null | undefined>, fallback: number | null) {
  const total = values.reduce<number>((sum, value) => sum + Math.abs(value ?? 0), 0);
  return total > 0 ? total : Math.abs(fallback ?? 0);
}

function exposureWeight(value: number | null | undefined, total: number, fallbackCount: number) {
  if (total > 0 && value !== null && value !== undefined) return Math.max(1, Math.min(100, (Math.abs(value) / total) * 100));
  return 100 / Math.max(1, fallbackCount);
}
