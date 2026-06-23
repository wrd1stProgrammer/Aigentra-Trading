"use client";

import type { PaperPosition } from "@/lib/api";
import { formatClockTime, formatCurrency, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { statusLabel } from "@/lib/status";
import type { DisplayPaperOrder } from "@/components/trader-profile-detail/position-panel-rows";
import {
  baseAsset,
  derivedMargin,
  expectedPositionProfitAtTarget,
  firstFiniteNumber,
  firstNonZeroFiniteNumber,
  firstString,
  normalizedSide,
  positionEntryPrice,
  positionLeverage,
  positionLiquidationPrice,
  positionMargin,
  positionMarkPrice,
  positionPnl,
  positionQuantity,
  positionTargetPrice,
  recordValue
} from "@/components/trader-profile-detail/position-panel-calculations";

type Translator = (key: string) => string;

export function MobilePositionCards({
  activeTab,
  positions,
  orders,
  locale,
  t,
  liveMarkPrice,
  onOpenPosition,
  onOpenOrder
}: {
  readonly activeTab: "positions" | "orders";
  readonly positions: readonly PaperPosition[];
  readonly orders: readonly DisplayPaperOrder[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly liveMarkPrice?: number | null;
  readonly onOpenPosition?: (position: PaperPosition) => void;
  readonly onOpenOrder?: (order: DisplayPaperOrder) => void;
}) {
  return (
    <div data-testid="mobile-position-cards" className="space-y-3 p-3 md:hidden">
      {activeTab === "positions"
        ? positions.map((position, index) => (
            <MobilePositionCard
              key={`mobile-position-${position.id ?? index}`}
              position={position}
              locale={locale}
              t={t}
              liveMarkPrice={liveMarkPrice}
              onOpen={onOpenPosition}
            />
          ))
        : orders.map((order, index) => (
            <MobileOrderCard
              key={`mobile-order-${order.id ?? index}`}
              order={order}
              locale={locale}
              t={t}
              onOpen={onOpenOrder}
            />
          ))}
      {activeTab === "positions" && !positions.length ? <EmptyMobileCard>{t("detail.noOpenPositionRows")}</EmptyMobileCard> : null}
      {activeTab === "orders" && !orders.length ? <EmptyMobileCard>{t("detail.noOpenOrderRows")}</EmptyMobileCard> : null}
    </div>
  );
}

function MobilePositionCard({
  position,
  locale,
  t,
  liveMarkPrice,
  onOpen
}: {
  readonly position: PaperPosition;
  readonly locale: Locale;
  readonly t: Translator;
  readonly liveMarkPrice?: number | null;
  readonly onOpen?: (position: PaperPosition) => void;
}) {
  const side = normalizedSide(position.side);
  const quantity = positionQuantity(position);
  const entryPrice = positionEntryPrice(position);
  const markPrice = positionMarkPrice(position, liveMarkPrice);
  const leverage = positionLeverage(position);
  const margin = positionMargin(position);
  const pnl = positionPnl(position, liveMarkPrice);
  const roe = margin !== null && margin > 0 && pnl !== null ? (pnl / margin) * 100 : null;
  const expectedProfit = expectedPositionProfitAtTarget(position);
  const stopLoss = firstFiniteNumber(position.stopLoss, position.stopLossPrice, position.stop_loss, position.stop_loss_price);
  const takeProfit = positionTargetPrice(position);
  const liquidation = positionLiquidationPrice(position);

  return (
    <article className={`rounded-xl border p-3.5 ${mobileExposureCardClass(side)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-8 w-1 rounded-full ${side === "SHORT" ? "bg-rose-500" : "bg-emerald-400"}`} />
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-bold text-zinc-950 dark:text-zinc-100">{position.symbol}</p>
              <p className="text-[11px] text-zinc-500">{formatLeverage(leverage)} · {side}</p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono text-sm font-bold ${side === "SHORT" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatNumber(quantity, 4, locale)} {baseAsset(position.symbol)}
          </p>
          <p className={`mt-0.5 font-mono text-xs ${pnlToneClass(pnl)}`}>{formatCurrency(pnl, locale)} · {formatPercentNumber(roe)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MobileMetric label={t("detail.positionEntryPrice")} value={formatNumber(entryPrice, 1, locale)} />
        <MobileMetric label={t("detail.positionMarkPrice")} value={formatNumber(markPrice, 1, locale)} />
        <MobileMetric label={t("detail.positionMargin")} value={formatCurrency(margin, locale)} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <MobileMetric label={t("chart.stopLoss")} value={formatNumber(stopLoss, 1, locale)} tone="bad" />
        <MobileMetric label={t("chart.takeProfit")} value={formatNumber(takeProfit, 1, locale)} tone="good" />
        <MobileMetric label={t("detail.positionLiqPrice")} value={formatNumber(liquidation, 1, locale)} />
        <MobileMetric label={t("detail.positionExpectedProfit")} value={formatCurrency(expectedProfit, locale)} />
      </div>
      {onOpen ? <MobileDetailButton label={t("detail.rowDetail")} onClick={() => onOpen(position)} /> : null}
    </article>
  );
}

function MobileOrderCard({
  order,
  locale,
  t,
  onOpen
}: {
  readonly order: DisplayPaperOrder;
  readonly locale: Locale;
  readonly t: Translator;
  readonly onOpen?: (order: DisplayPaperOrder) => void;
}) {
  const side = normalizedSide(order.side);
  const payload = recordValue(order.payload);
  const quantity = firstFiniteNumber(order.quantity, order.filledQuantity);
  const price = firstFiniteNumber(order.limitPrice, order.price, order.stopPrice, order.triggerPrice);
  const leverage = firstFiniteNumber(order.leverage, payload?.leverage, recordValue(payload?.leveragePlan)?.suggestedLeverage);
  const notional = firstFiniteNumber(payload?.plannedNotional, quantity !== null && price !== null ? Math.abs(quantity * price) : null);
  const margin = firstNonZeroFiniteNumber(payload?.actualPlannedMargin, payload?.plannedMargin, order.margin, derivedMargin(quantity, price, leverage));
  const orderTime = firstString(order.updatedAt, order.updated_at, order.createdAt, order.created_at);
  const stopLoss = firstFiniteNumber(order.stopLossPrice, order.stop_loss_price);
  const takeProfit = firstFiniteNumber(order.takeProfitPrice, order.take_profit_price);

  return (
    <article className={`rounded-xl border p-3.5 ${mobileExposureCardClass(side)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-zinc-950 dark:text-zinc-100">{order.symbol}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{formatLeverage(leverage)} · {statusLabel(order.status, t)}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-sm font-bold ${side === "SHORT" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{side}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{formatClockTime(orderTime, locale)}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MobileMetric label={t("detail.positionSize")} value={`${formatNumber(quantity, 4, locale)} ${baseAsset(order.symbol)}`} />
        <MobileMetric label={t("detail.orderPrice")} value={formatNumber(price, 1, locale)} />
        <MobileMetric label={t("chart.stopLoss")} value={formatNumber(stopLoss, 1, locale)} tone="bad" />
        <MobileMetric label={t("chart.takeProfit")} value={formatNumber(takeProfit, 1, locale)} tone="good" />
        <MobileMetric label={t("detail.positionMargin")} value={formatCurrency(margin, locale)} />
        <MobileMetric label={t("detail.exposure")} value={formatCurrency(notional, locale)} />
      </div>
      {onOpen ? <MobileDetailButton label={t("detail.rowDetail")} onClick={() => onOpen(order)} /> : null}
    </article>
  );
}

function MobileMetric({ label, value, tone = "neutral" }: { readonly label: string; readonly value: string; readonly tone?: "good" | "bad" | "neutral" }) {
  const valueClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-300"
      : tone === "bad"
        ? "text-rose-600 dark:text-rose-300"
        : "text-zinc-950 dark:text-zinc-100";
  return (
    <div className="min-w-0 rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-white/[0.04]">
      <p className="truncate text-[11px] font-medium text-zinc-400">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-xs font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function MobileDetailButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="mobile-position-scenario-detail"
      onClick={onClick}
      className="mt-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {label}
    </button>
  );
}

function EmptyMobileCard({ children }: { readonly children: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-sm text-zinc-500 dark:border-white/10">{children}</div>;
}

function formatLeverage(value: number | null) {
  if (value === null) return "-";
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)}x`;
}

function formatPercentNumber(value: number | null) {
  if (value === null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

function pnlToneClass(value: number | null) {
  if (value === null || Math.abs(value) <= 0.000001) return "text-zinc-400";
  return value > 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300";
}

function mobileExposureCardClass(side: string) {
  if (side === "SHORT") {
    return "border-rose-500/25 bg-rose-50/70 dark:border-rose-400/20 dark:bg-rose-950/[0.12]";
  }
  if (side === "LONG") {
    return "border-emerald-500/25 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-950/[0.12]";
  }
  return "border-zinc-200 bg-white dark:border-white/10 dark:bg-[#0c1117]";
}
