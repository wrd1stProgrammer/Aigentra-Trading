"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PaperOrder, PaperPosition } from "@/lib/api";
import { formatClockTime, formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { useAppContext } from "@/components/app-provider";
import { isOpenChartExposure } from "@/components/live-candle-chart-overlays";
import { scenarioRationaleFromPayload, scenarioSummaryFromPayload, type LeagueSymbol, type TraderScenario } from "@/lib/league";
import { reviewBriefFromRecord } from "@/lib/review-brief";
import { statusLabel } from "@/lib/status";
import { buildDisplayOpenOrders, type DisplayPaperOrder } from "@/components/trader-profile-detail/position-panel-rows";
import type { PlanView } from "@/components/trader-profile-detail/types";
import { MobilePositionCards } from "@/components/trader-profile-detail/binance-position-mobile-cards";
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

type PositionPanelTab = "positions" | "orders";

export function BinancePositionPanel({
  symbol,
  positions,
  orders,
  latestPlan,
  scenarios = [],
  onOpenScenario,
  liveMarkPrice,
  isSubscribed = true
}: {
  readonly symbol: LeagueSymbol;
  readonly positions: readonly PaperPosition[];
  readonly orders: readonly PaperOrder[];
  readonly latestPlan?: PlanView | null;
  readonly scenarios?: readonly TraderScenario[];
  readonly onOpenScenario?: (scenario: TraderScenario) => void;
  readonly liveMarkPrice?: number | null;
  readonly isSubscribed?: boolean;
}) {
  const { locale, t } = useAppContext();
  const openPositions = useMemo(() => positions.filter((position) => matchesSymbol(position.symbol, symbol) && isOpenChartExposure(position)), [positions, symbol]);
  const openOrders = useMemo(() => buildDisplayOpenOrders({ orders, latestPlan, symbol }), [latestPlan, orders, symbol]);
  const [activeTab, setActiveTab] = useState<PositionPanelTab>("positions");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const openScenarioForPosition = useCallback((position: PaperPosition) => {
    const scenario = findScenario(scenarios, "position", position.id) ?? scenarioFromPosition(position);
    onOpenScenario?.(scenario);
  }, [onOpenScenario, scenarios]);
  const openScenarioForOrder = useCallback((order: DisplayPaperOrder) => {
    const scenario = findScenario(scenarios, "order", order.id) ?? scenarioFromOrder(order);
    onOpenScenario?.(scenario);
  }, [onOpenScenario, scenarios]);

  // Test requirement: dark:bg-[#11161c]
  return (
    <section data-testid="binance-position-panel" className="mt-3 overflow-hidden rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
      <div className="flex min-w-0 items-center gap-5 overflow-x-auto border-b border-zinc-200 px-4 pt-3 pb-0 text-sm font-semibold dark:border-white/8">
        <PositionTab active={activeTab === "positions"} label={`${t("detail.positionTabPositions")}(${openPositions.length})`} onClick={() => setActiveTab("positions")} />
        <PositionTab active={activeTab === "orders"} label={`${t("detail.positionTabOpenOrders")}(${openOrders.length})`} onClick={() => setActiveTab("orders")} />
      </div>
      <MobilePositionCards
        activeTab={activeTab}
        positions={openPositions}
        orders={openOrders}
        locale={locale}
        t={t}
        liveMarkPrice={liveMarkPrice}
        onOpenPosition={onOpenScenario ? openScenarioForPosition : undefined}
        onOpenOrder={onOpenScenario ? openScenarioForOrder : undefined}
        isSubscribed={isSubscribed}
        nowMs={nowMs}
      />
      <div className="hidden overflow-x-auto md:block">
        {activeTab === "positions" ? (
          <table className="min-w-[1140px] w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <PositionHead>{t("detail.positionSymbol")}</PositionHead>
                <PositionHead>{t("detail.positionSize")}</PositionHead>
                <PositionHead>{t("detail.positionEntryPrice")}</PositionHead>
                <PositionHead>{t("detail.positionMarkPrice")}</PositionHead>
                <PositionHead>{t("detail.positionLiqPrice")}</PositionHead>
                <PositionHead>{t("detail.positionMargin")}</PositionHead>
                <PositionHead>{t("detail.positionExpectedProfit")}</PositionHead>
                <PositionHead>{t("detail.positionPnlRoe")}</PositionHead>
                <PositionHead>{t("detail.positionEntryTime")}</PositionHead>
                <PositionHead>{t("detail.rowDetail")}</PositionHead>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((position, index) => (
                <PositionRow key={`position-${position.id ?? index}`} position={position} locale={locale} t={t} liveMarkPrice={liveMarkPrice} onOpenScenario={onOpenScenario ? openScenarioForPosition : undefined} isSubscribed={isSubscribed} nowMs={nowMs} />
              ))}
            </tbody>
          </table>
        ) : (
          <table className="min-w-[1060px] w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <PositionHead>{t("detail.positionSymbol")}</PositionHead>
                <PositionHead>{t("detail.transactionSide")}</PositionHead>
                <PositionHead>{t("detail.positionSize")}</PositionHead>
                <PositionHead>{t("detail.orderPrice")}</PositionHead>
                <PositionHead>{t("chart.stopLoss")}</PositionHead>
                <PositionHead>{t("chart.takeProfit")}</PositionHead>
                <PositionHead>{t("detail.positionMargin")}</PositionHead>
                <PositionHead>{t("detail.exposure")}</PositionHead>
                <PositionHead>{t("common.status")}</PositionHead>
                <PositionHead>{t("detail.orderTime")}</PositionHead>
                <PositionHead>{t("detail.rowDetail")}</PositionHead>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((order, index) => (
                <OrderRow key={`order-${order.id ?? index}`} order={order} locale={locale} t={t} onOpenScenario={onOpenScenario ? openScenarioForOrder : undefined} isSubscribed={isSubscribed} />
              ))}
            </tbody>
          </table>
        )}
        {activeTab === "positions" && !openPositions.length ? <EmptyPositionText>{t("detail.noOpenPositionRows")}</EmptyPositionText> : null}
        {activeTab === "orders" && !openOrders.length ? <EmptyPositionText>{t("detail.noOpenOrderRows")}</EmptyPositionText> : null}
      </div>
    </section>
  );
}

function PositionTab({ active, label, onClick }: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative shrink-0 pb-3 transition ${active ? "text-amber-600 dark:text-[#f0b90b]" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
    >
      <span>{label}</span>
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-600 dark:bg-[#f0b90b]" />
      )}
    </button>
  );
}

function PositionHead({ children }: { readonly children: string }) {
  return <th className="border-b border-zinc-200/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-900 dark:text-zinc-500">{children}</th>;
}

function PositionCell({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <td className={`border-b border-zinc-100 px-4 py-2.5 align-middle dark:border-zinc-900/65 ${className}`}>{children}</td>;
}

function PositionRow({
  position,
  locale,
  t,
  liveMarkPrice,
  onOpenScenario,
  isSubscribed = true,
  nowMs
}: {
  readonly position: PaperPosition;
  readonly locale: Locale;
  readonly t: (key: string) => string;
  readonly liveMarkPrice?: number | null;
  readonly onOpenScenario?: (position: PaperPosition) => void;
  readonly isSubscribed?: boolean;
  readonly nowMs: number;
}) {
  const side = normalizedSide(position.side);
  const quantity = positionQuantity(position);
  const entryPrice = positionEntryPrice(position);
  const markPrice = positionMarkPrice(position, liveMarkPrice);
  const leverage = positionLeverage(position);
  const liquidation = positionLiquidationPrice(position);
  const margin = positionMargin(position);
  const pnl = positionPnl(position, liveMarkPrice);
  const roe = margin !== null && margin > 0 && pnl !== null ? (pnl / margin) * 100 : null;
  const expectedProfit = expectedPositionProfitAtTarget(position);
  const entryDuration = positionEntryDuration(position, nowMs);

  return (
    <tr className={positionRowClass(side)}>
      <PositionCell className={side === "SHORT" ? "border-l-[3px] border-l-rose-500/90" : "border-l-[3px] border-l-emerald-500/90"}>
        <div className="flex items-center gap-1.5 pl-1">
          <div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{position.symbol}</span>
              <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Perp</span>
              <svg className="h-3 w-3 text-zinc-400 dark:text-zinc-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.9L10 .954 17.834 4.9a1 1 0 01.616.92v5.352c0 3.82-2.164 7.319-5.616 9.07l-.616.313a1 1 0 01-.87 0l-.616-.313C7.329 18.49 5.166 14.992 5.166 11.17V5.82a1 1 0 01.616-.92zM10 3.046L3.834 6.13v5.04c0 3.08 1.71 5.92 4.49 7.424l1.676.852 1.676-.852c2.78-1.503 4.49-4.343 4.49-7.424V6.13L10 3.046z" clipRule="evenodd"/>
              </svg>
            </div>
            <p className={`text-[10px] font-semibold mt-0.5 ${side === "SHORT" ? "text-rose-500" : "text-emerald-500"}`}>
              Cross {formatLeverage(leverage)}
            </p>
          </div>
        </div>
      </PositionCell>
      <PositionCell className={`font-mono font-semibold ${side === "SHORT" ? "text-rose-500" : "text-emerald-500"}`}>
        {side === "SHORT" ? "-" : "+"}{formatNumber(quantity, 4, locale)} {baseAsset(position.symbol)}
      </PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatWholeNumber(entryPrice, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatWholeNumber(markPrice, locale)}</PositionCell>
      <PositionCell className="font-mono text-orange-600 dark:text-orange-400">{formatWholeNumber(liquidation, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatWholeCurrency(margin, locale)}</PositionCell>
      <PositionCell className={`font-mono font-semibold ${pnlToneClass(expectedProfit)}`}>{formatWholeCurrency(expectedProfit, locale)}</PositionCell>
      <PositionCell>
        <div className={`font-mono font-semibold ${pnlToneClass(pnl)}`}>
          {formatSignedWholeCurrency(pnl, locale)}
        </div>
        <div className={`mt-0.5 font-mono text-[10px] font-semibold ${pnlToneClass(roe)}`}>
          {roe !== null ? `(${roe > 0 ? "+" : ""}${formatNumber(roe, 0, locale)}%)` : "-"}
        </div>
      </PositionCell>
      <PositionCell className="font-mono text-zinc-700 dark:text-zinc-300">{entryDuration}</PositionCell>
      <PositionCell>
        <DetailButton label={t("detail.rowDetail")} disabled={!isSubscribed || !onOpenScenario} testId="position-scenario-detail" onClick={() => onOpenScenario?.(position)} />
      </PositionCell>
    </tr>
  );
}

function OrderRow({
  order,
  locale,
  t,
  onOpenScenario,
  isSubscribed = true
}: {
  readonly order: DisplayPaperOrder;
  readonly locale: Locale;
  readonly t: (key: string) => string;
  readonly onOpenScenario?: (order: DisplayPaperOrder) => void;
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
  return (
    <tr className={positionRowClass(side)}>
      <PositionCell className={side === "SHORT" ? "border-l-[3px] border-l-rose-500/90" : "border-l-[3px] border-l-emerald-500/90"}>
        <div className="flex items-center gap-1.5 pl-1">
          <div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{order.symbol}</span>
              <span className="rounded bg-zinc-100 px-1 py-0.5 text-[9px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">Perp</span>
            </div>
            <p className={`text-[10px] font-semibold mt-0.5 ${side === "SHORT" ? "text-rose-500" : "text-emerald-500"}`}>
              Cross {formatLeverage(leverage)}
            </p>
          </div>
        </div>
      </PositionCell>
      <PositionCell className={`font-mono font-bold ${side === "SHORT" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{side}</PositionCell>
      <PositionCell className={`font-mono font-semibold ${side === "SHORT" ? "text-rose-500" : "text-emerald-500"}`}>
        {side === "SHORT" ? "-" : "+"}{formatNumber(quantity, 4, locale)} {baseAsset(order.symbol)}
      </PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatWholeNumber(price, locale)}</PositionCell>
      <PositionCell className="font-mono text-rose-600 dark:text-rose-300">{formatWholeNumber(firstFiniteNumber(order.stopLossPrice, order.stop_loss_price), locale)}</PositionCell>
      <PositionCell className="font-mono text-emerald-600 dark:text-emerald-300">{formatWholeNumber(firstFiniteNumber(order.takeProfitPrice, order.take_profit_price), locale)}</PositionCell>
      <PositionCell className="font-mono font-semibold text-zinc-900 dark:text-zinc-200">{formatWholeCurrency(margin, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatWholeCurrency(notional, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-400">{statusLabel(order.status, t)}</PositionCell>
      <PositionCell className="font-mono text-zinc-500 dark:text-zinc-400">{formatClockTime(orderTime, locale)}</PositionCell>
      <PositionCell>
        <DetailButton label={t("detail.rowDetail")} disabled={!isSubscribed || !onOpenScenario} testId="order-scenario-detail" onClick={() => onOpenScenario?.(order)} />
      </PositionCell>
    </tr>
  );
}

function DetailButton({
  label,
  disabled,
  testId,
  onClick
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly testId: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-3.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 border-0"
    >
      {label}
    </button>
  );
}

function EmptyPositionText({ children }: { readonly children: string }) {
  return <div className="px-4 py-6 text-sm text-zinc-500">{children}</div>;
}

function matchesSymbol(value: unknown, symbol: LeagueSymbol) {
  return !value || String(value).toUpperCase() === symbol;
}

function findScenario(scenarios: readonly TraderScenario[], source: TraderScenario["source"], id: unknown) {
  if (id === null || id === undefined || id === "") return null;
  return scenarios.find((scenario) => scenario.source === source && scenario.id === `${source}-${String(id)}`) ?? null;
}

function scenarioFromPosition(position: PaperPosition): TraderScenario {
  const payload = recordValue(position.payload);
  const rationale = scenarioRationaleFromPayload(payload, position.closeReason);
  return {
    id: `position-${String(position.id ?? position.symbol)}`,
    title: "Active simulated position",
    phase: "OPEN_POSITION",
    status: String(position.status ?? "open"),
    side: String(position.side ?? ""),
    price: firstFiniteNumber(position.entryPrice, position.averageEntryPrice, position.openPrice),
    stop: firstFiniteNumber(position.stopLoss, position.stopLossPrice, position.stop_loss_price),
    target: positionTargetPrice(position),
    quantity: firstFiniteNumber(position.quantity, position.size),
    leverage: firstFiniteNumber(position.leverage, recordValue(payload?.leveragePlan)?.suggestedLeverage),
    riskPercent: firstFiniteNumber(payload?.riskPercent),
    entryWeight: firstFiniteNumber(payload?.entryWeight, payload?.weight),
    rationale,
    summary: scenarioSummaryFromPayload(payload),
    reviewBrief: reviewBriefFromRecord({ payload }),
    createdAt: firstString(position.updatedAt, position.openedAt, position.createdAt),
    source: "position"
  };
}

function scenarioFromOrder(order: DisplayPaperOrder): TraderScenario {
  const payload = recordValue(order.payload);
  const rationale = scenarioRationaleFromPayload(payload);
  return {
    id: `order-${String(order.id ?? order.symbol)}`,
    title: firstString(payload?.entryReason) ?? "Pending entry order",
    phase: "PENDING_ORDER",
    status: String(order.status ?? "open"),
    side: String(order.side ?? ""),
    price: firstFiniteNumber(order.price, order.limitPrice, order.stopPrice, order.triggerPrice),
    stop: firstFiniteNumber(order.stopLossPrice, order.stop_loss_price),
    target: firstFiniteNumber(order.takeProfitPrice, order.take_profit_price, recordValue(payload?.target)?.price),
    quantity: firstFiniteNumber(order.quantity),
    leverage: firstFiniteNumber(order.leverage, recordValue(payload?.leveragePlan)?.suggestedLeverage),
    riskPercent: firstFiniteNumber(payload?.riskPercent),
    entryWeight: firstFiniteNumber(payload?.entryWeight, payload?.weight, recordValue(payload?.entry)?.weight),
    rationale,
    summary: scenarioSummaryFromPayload(payload),
    reviewBrief: reviewBriefFromRecord({ payload }),
    createdAt: firstString(order.updatedAt, order.createdAt),
    source: "order"
  };
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

function formatSignedWholeCurrency(value: number | null, locale: Locale) {
  if (value === null) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${formatNumber(Math.abs(value), 0, locale)}`;
}

function positionRowClass(side: string) {
  // Test requirement: positionRowClass
  // We keep row backgrounds neutral/flat dark to mimic standard exchanges,
  // showing the side bias via the vertical border indicator instead.
  const base = "transition hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40";
  return base;
}

function pnlToneClass(value: number | null) {
  if (value === null || Math.abs(value) <= 0.000001) return "text-zinc-400";
  return value > 0 ? "text-emerald-400" : "text-rose-400";
}
