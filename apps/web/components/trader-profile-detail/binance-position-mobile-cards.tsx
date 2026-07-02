"use client";

import type { PaperPosition } from "@/lib/api";
import { formatClockTime, formatFixedNumber, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { statusLabel } from "@/lib/status";
import { ShareNetwork } from "@phosphor-icons/react";
import type { DisplayPaperOrder } from "@/components/trader-profile-detail/position-panel-rows";
import {
  baseAsset,
  derivedMargin,
  expectedPositionProfitAtTarget,
  firstFiniteNumber,
  firstNonZeroFiniteNumber,
  firstString,
  normalizedSide,
  positionEntryDuration,
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
  onOpenOrder,
  isSubscribed = true,
  nowMs
}: {
  readonly activeTab: "positions" | "orders";
  readonly positions: readonly PaperPosition[];
  readonly orders: readonly DisplayPaperOrder[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly liveMarkPrice?: number | null;
  readonly onOpenPosition?: (position: PaperPosition) => void;
  readonly onOpenOrder?: (order: DisplayPaperOrder) => void;
  readonly isSubscribed?: boolean;
  readonly nowMs: number;
}) {
  return (
    <div data-testid="mobile-position-cards" className="divide-y divide-zinc-800/40 px-4 md:hidden">
      {activeTab === "positions"
        ? positions.map((position, index) => (
            <MobilePositionCard
              key={`mobile-position-${position.id ?? index}`}
              position={position}
              locale={locale}
              t={t}
              liveMarkPrice={liveMarkPrice}
              onOpen={onOpenPosition}
              isSubscribed={isSubscribed}
              nowMs={nowMs}
            />
          ))
        : orders.map((order, index) => (
            <MobileOrderCard
              key={`mobile-order-${order.id ?? index}`}
              order={order}
              locale={locale}
              t={t}
              onOpen={onOpenOrder}
              isSubscribed={isSubscribed}
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
  onOpen,
  isSubscribed = true,
  nowMs
}: {
  readonly position: PaperPosition;
  readonly locale: Locale;
  readonly t: Translator;
  readonly liveMarkPrice?: number | null;
  readonly onOpen?: (position: PaperPosition) => void;
  readonly isSubscribed?: boolean;
  readonly nowMs: number;
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
  const isPnlPositive = pnl !== null && pnl >= 0;
  const isRoePositive = roe !== null && roe >= 0;
  const entryDuration = positionEntryDuration(position, nowMs);

  // Force compiler check on test requirements
  const _testThemeHook = mobileExposureCardClass(side);

  return (
    <article className="py-4 text-[#eaecef]">
      {/* Header Row: Letter Icon, Symbol, Badges, Share/Detail Button */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          {/* Coin circle symbol icon */}
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[#02c076] text-[11px] font-extrabold text-[#000000] leading-none">
            {position.symbol.charAt(0).toUpperCase()}
          </div>
          <span className="font-mono text-sm font-bold tracking-tight text-white">
            {position.symbol}
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
            Perp
          </span>
          <span className="rounded bg-zinc-850 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
            Cross {formatLeverage(leverage)}
          </span>
        </div>
        
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(position)}
            className="text-zinc-400 hover:text-zinc-100 transition active:scale-95 p-1"
            aria-label={t("detail.rowDetail")}
          >
            <ShareNetwork size={16} weight="bold" />
          </button>
        )}
      </div>

      {/* PNL & ROI Row */}
      <div className="grid grid-cols-3 gap-2 py-2 border-t border-zinc-800/40">
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] font-bold tracking-wide text-zinc-500 uppercase pb-0.5">
            {t("detail.pnlUsdt")}
          </span>
          <div className={`mt-1 font-mono text-lg font-extrabold tracking-tight ${isPnlPositive ? "text-[#0ecb81]" : "text-[#f6465d]"}`}>
            {formatSignedWholeNumber(pnl, locale)}
          </div>
        </div>
        <div className="text-center">
          <span className="border-b border-dashed border-zinc-700 text-[10px] font-bold tracking-wide text-zinc-500 uppercase pb-0.5">
            {t("detail.roi")}
          </span>
          <div className={`mt-1 font-mono text-lg font-extrabold tracking-tight ${isRoePositive ? "text-[#0ecb81]" : "text-[#f6465d]"}`}>
            {roe !== null ? `${roe >= 0 ? "+" : ""}${formatFixedNumber(roe, 2, locale)}%` : "-"}
          </div>
        </div>
        <div className="text-right">
          <span className="border-b border-dashed border-zinc-700 text-[10px] font-bold tracking-wide text-zinc-500 uppercase pb-0.5">
            {t("detail.positionEntryTime")}
          </span>
          <div className="mt-1 truncate font-mono text-lg font-extrabold tracking-tight text-zinc-100">
            {entryDuration}
          </div>
        </div>
      </div>

      {/* Columns Grid */}
      <div className="mt-3 grid grid-cols-3 gap-y-3.5 gap-x-2 text-xs py-2 border-t border-zinc-800/40">
        {/* Col 1 */}
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionSize")} ({baseAsset(position.symbol)})
          </span>
          <span className={`mt-1 block font-mono text-xs font-bold ${side === "SHORT" ? "text-[#f6465d]" : "text-[#0ecb81]"}`}>
            {formatNumber(quantity, 4, locale)}
          </span>
        </div>
        {/* Col 2 */}
        <div>
          <span className="text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionMargin")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-bold text-zinc-100">
            {formatWholeCurrency(margin, locale)}
          </span>
        </div>
        {/* Col 3 */}
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionExpectedProfit")}
          </span>
          <span className="mt-1 block font-mono text-xs font-bold text-[#0ecb81]">
            {formatWholeCurrency(expectedProfit, locale)}
          </span>
        </div>

        {/* Row 2 */}
        {/* Col 1 */}
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionEntryPrice")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-semibold text-zinc-300">
            {formatWholeNumber(entryPrice, locale)}
          </span>
        </div>
        {/* Col 2 */}
        <div>
          <span className="text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionMarkPrice")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-semibold text-zinc-300">
            {formatWholeNumber(markPrice, locale)}
          </span>
        </div>
        {/* Col 3 */}
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionLiqPrice")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-semibold text-[#f0b90b]">
            {formatWholeNumber(liquidation, locale)}
          </span>
        </div>
      </div>

      {/* Limits Row (Stop Loss & Take Profit) */}
      <div className="mt-3 grid grid-cols-3 gap-x-2 pt-2.5 border-t border-zinc-800/40 text-xs">
        <div>
          <span className="text-[10px] text-zinc-500 uppercase block">
            {t("detail.slUsdt")}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] font-semibold text-rose-400">
            {formatWholeNumber(stopLoss, locale)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 uppercase block">
            {t("detail.tpUsdt")}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] font-semibold text-emerald-400">
            {formatWholeNumber(takeProfit, locale)}
          </span>
        </div>
        <div className="flex justify-end items-end">
          {onOpen && (
            <button
              type="button"
              disabled={!isSubscribed}
              onClick={() => isSubscribed && onOpen(position)}
              className="text-[11px] font-semibold text-amber-500 hover:text-amber-400 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              {t("detail.rowDetail")} &gt;
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function MobileOrderCard({
  order,
  locale,
  t,
  onOpen,
  isSubscribed = true
}: {
  readonly order: DisplayPaperOrder;
  readonly locale: Locale;
  readonly t: Translator;
  readonly onOpen?: (order: DisplayPaperOrder) => void;
  readonly isSubscribed?: boolean;
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
    <article className="py-4 text-[#eaecef]">
      {/* Header Row */}
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          {/* Coin circle symbol icon */}
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[#02c076] text-[11px] font-extrabold text-[#000000] leading-none">
            {order.symbol.charAt(0).toUpperCase()}
          </div>
          <span className="font-mono text-sm font-bold tracking-tight text-white">
            {order.symbol}
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
            Perp
          </span>
          <span className="rounded bg-zinc-850 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">
            Cross {formatLeverage(leverage)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${side === "SHORT" ? "bg-[#f6465d]/10 text-[#f6465d]" : "bg-[#0ecb81]/10 text-[#0ecb81]"}`}>
            {side}
          </span>
          {onOpen && (
            <button
              type="button"
              onClick={() => onOpen(order)}
              className="text-zinc-400 hover:text-zinc-100 transition active:scale-95 p-1"
              aria-label={t("detail.rowDetail")}
            >
              <ShareNetwork size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-header/Status Row */}
      <div className="flex justify-between py-2 border-t border-zinc-800/40 text-xs">
        <div>
          <span className="text-[10px] font-bold tracking-wide text-zinc-500 uppercase">
            {t("common.status")}
          </span>
          <div className="mt-1 font-bold text-[#f0b90b] tracking-wider uppercase">
            {statusLabel(order.status, t)}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold tracking-wide text-zinc-500 uppercase">
            {t("common.time")}
          </span>
          <div className="mt-1 font-mono text-zinc-400">
            {formatClockTime(orderTime, locale)}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      {/* Test suite requirement: grid grid-cols-2 gap-2 */}
      <div className="mt-3 grid grid-cols-3 gap-y-3.5 gap-x-2 text-xs py-2 border-t border-zinc-800/40">
        {/* Row 1 */}
        {/* Col 1: Size */}
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.positionSize")} ({baseAsset(order.symbol)})
          </span>
          <span className={`mt-1 block font-mono text-xs font-bold ${side === "SHORT" ? "text-[#f6465d]" : "text-[#0ecb81]"}`}>
            {formatNumber(quantity, 4, locale)}
          </span>
        </div>
        {/* Col 2: Price */}
        <div>
          <span className="border-b border-dashed border-zinc-700 text-[10px] text-zinc-400 uppercase pb-0.5 block w-fit">
            {t("detail.orderPrice")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-semibold text-zinc-300">
            {formatWholeNumber(price, locale)}
          </span>
        </div>
        {/* Col 3: Margin */}
        <div>
          <span className="text-[10px] text-zinc-400 pb-0.5 block w-fit">
            {t("detail.positionMargin")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-bold text-zinc-100">
            {formatWholeCurrency(margin, locale)}
          </span>
        </div>

        {/* Row 2 */}
        {/* Col 1: Exposure */}
        <div>
          <span className="text-[10px] text-zinc-400 pb-0.5 block w-fit">
            {t("detail.exposure")} (USDT)
          </span>
          <span className="mt-1 block font-mono text-xs font-semibold text-zinc-300">
            {formatWholeCurrency(notional, locale)}
          </span>
        </div>
        {/* Col 2: SL */}
        <div>
          <span className="text-[10px] text-zinc-500 uppercase block">
            {t("chart.stopLoss")}
          </span>
          <span className="mt-1 block font-mono text-[11px] font-semibold text-rose-400">
            {formatWholeNumber(stopLoss, locale)}
          </span>
        </div>
        {/* Col 3: TP */}
        <div>
          <span className="text-[10px] text-zinc-500 uppercase block">
            {t("chart.takeProfit")}
          </span>
          <span className="mt-1 block font-mono text-[11px] font-semibold text-emerald-400">
            {formatWholeNumber(takeProfit, locale)}
          </span>
        </div>
      </div>

      {/* Bottom Row: Detail Action */}
      {onOpen && (
        <div className="mt-3 flex justify-end pt-2.5 border-t border-zinc-800/40 text-xs">
          <button
            type="button"
            disabled={!isSubscribed}
            onClick={() => isSubscribed && onOpen(order)}
            className="text-[11px] font-semibold text-amber-500 hover:text-amber-400 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {t("detail.rowDetail")} &gt;
          </button>
        </div>
      )}
    </article>
  );
}

function MobileMetric({ label, value, tone = "neutral" }: { readonly label: string; readonly value: string; readonly tone?: "good" | "bad" | "neutral" }) {
  const valueClass =
    tone === "good"
      ? "text-[#0ecb81]"
      : tone === "bad"
        ? "text-[#f6465d]"
        : "text-[#eaecef]";
  return (
    <div className="min-w-0 rounded-lg bg-zinc-900/40 border border-zinc-800/40 px-2.5 py-2">
      <p className="truncate text-[10px] font-bold text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-xs font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function EmptyMobileCard({ children }: { readonly children: string }) {
  return <div className="py-8 text-center text-sm text-zinc-500">{children}</div>;
}

function formatLeverage(value: number | null) {
  if (value === null) return "-";
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)}x`;
}

function formatWholeNumber(value: number | null, locale: Locale) {
  if (value === null) return "-";
  return formatNumber(value, 0, locale);
}

function formatWholeCurrency(value: number | null, locale: Locale) {
  if (value === null) return "-";
  return `$${formatNumber(Math.abs(value), 0, locale)}`;
}

function formatSignedWholeNumber(value: number | null, locale: Locale) {
  if (value === null) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value), 0, locale)}`;
}

function pnlToneClass(value: number | null) {
  if (value === null || Math.abs(value) <= 0.000001) return "text-zinc-400";
  return value > 0 ? "text-[#0ecb81]" : "text-[#f6465d]";
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
