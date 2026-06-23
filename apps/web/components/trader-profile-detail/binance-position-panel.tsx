"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PaperOrder, PaperPosition } from "@/lib/api";
import { formatClockTime, formatCurrency, formatNumber } from "@/lib/format";
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
  positionEntryPrice,
  positionLeverage,
  positionMargin,
  positionMarkPrice,
  positionPnl,
  positionQuantity,
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
  liveMarkPrice
}: {
  readonly symbol: LeagueSymbol;
  readonly positions: readonly PaperPosition[];
  readonly orders: readonly PaperOrder[];
  readonly latestPlan?: PlanView | null;
  readonly scenarios?: readonly TraderScenario[];
  readonly onOpenScenario?: (scenario: TraderScenario) => void;
  readonly liveMarkPrice?: number | null;
}) {
  const { locale, t } = useAppContext();
  const openPositions = useMemo(() => positions.filter((position) => matchesSymbol(position.symbol, symbol) && isOpenChartExposure(position)), [positions, symbol]);
  const openOrders = useMemo(() => buildDisplayOpenOrders({ orders, latestPlan, symbol }), [latestPlan, orders, symbol]);
  const [activeTab, setActiveTab] = useState<PositionPanelTab>("positions");
  const openScenarioForPosition = useCallback((position: PaperPosition) => {
    const scenario = findScenario(scenarios, "position", position.id) ?? scenarioFromPosition(position);
    onOpenScenario?.(scenario);
  }, [onOpenScenario, scenarios]);
  const openScenarioForOrder = useCallback((order: DisplayPaperOrder) => {
    const scenario = findScenario(scenarios, "order", order.id) ?? scenarioFromOrder(order);
    onOpenScenario?.(scenario);
  }, [onOpenScenario, scenarios]);

  return (
    <section data-testid="binance-position-panel" className="mt-3 overflow-hidden rounded-xl bg-white text-zinc-700 ring-1 ring-zinc-200 dark:bg-[#11161c] dark:text-zinc-300 dark:ring-zinc-800">
      <div className="flex min-w-0 items-center gap-5 overflow-x-auto border-b border-zinc-200 px-4 py-3 text-sm font-semibold dark:border-white/8">
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
                <PositionHead>{t("detail.positionMarginRatio")}</PositionHead>
                <PositionHead>{t("detail.positionMargin")}</PositionHead>
                <PositionHead>{t("detail.positionExpectedProfit")}</PositionHead>
                <PositionHead>{t("detail.positionPnlRoe")}</PositionHead>
                <PositionHead>{t("detail.rowDetail")}</PositionHead>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((position, index) => (
                <PositionRow key={`position-${position.id ?? index}`} position={position} locale={locale} t={t} liveMarkPrice={liveMarkPrice} onOpenScenario={onOpenScenario ? openScenarioForPosition : undefined} />
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
                <OrderRow key={`order-${order.id ?? index}`} order={order} locale={locale} t={t} onOpenScenario={onOpenScenario ? openScenarioForOrder : undefined} />
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
      className={`shrink-0 transition ${active ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
    >
      {label}
    </button>
  );
}

function PositionHead({ children }: { readonly children: string }) {
  return <th className="border-b border-zinc-200 px-4 py-3 font-semibold dark:border-white/8">{children}</th>;
}

function PositionCell({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <td className={`border-b border-zinc-100 px-4 py-3 align-middle dark:border-white/6 ${className}`}>{children}</td>;
}

function PositionRow({
  position,
  locale,
  t,
  liveMarkPrice,
  onOpenScenario
}: {
  readonly position: PaperPosition;
  readonly locale: Locale;
  readonly t: (key: string) => string;
  readonly liveMarkPrice?: number | null;
  readonly onOpenScenario?: (position: PaperPosition) => void;
}) {
  const side = normalizedSide(position.side);
  const quantity = positionQuantity(position);
  const entryPrice = positionEntryPrice(position);
  const markPrice = positionMarkPrice(position, liveMarkPrice);
  const leverage = positionLeverage(position);
  const liquidation = firstFiniteNumber(position.liquidationPrice, position.liquidation_price);
  const margin = positionMargin(position);
  const pnl = positionPnl(position, liveMarkPrice);
  const roe = margin !== null && margin > 0 && pnl !== null ? (pnl / margin) * 100 : null;
  const expectedProfit = expectedPositionProfitAtTarget(position);

  return (
    <tr className={positionRowClass(side)}>
      <PositionCell>
        <div className="flex items-center gap-2">
          <span className={`h-9 w-1 rounded-full ${side === "SHORT" ? "bg-rose-500" : "bg-emerald-400"}`} />
          <div>
            <p className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-100">{position.symbol}</p>
            <p className="text-[11px] text-zinc-500">{formatLeverage(leverage)} · {side}</p>
          </div>
        </div>
      </PositionCell>
      <PositionCell className={`font-mono font-bold ${side === "SHORT" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {formatNumber(quantity, 4, locale)} {baseAsset(position.symbol)}
      </PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatNumber(entryPrice, 1, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatNumber(markPrice, 1, locale)}</PositionCell>
      <PositionCell className="font-mono text-orange-600 dark:text-orange-400">{formatNumber(liquidation, 1, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatPercentNumber(firstFiniteNumber(position.marginRatio, position.margin_ratio))}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatCurrency(margin, locale)}</PositionCell>
      <PositionCell className={`font-mono font-semibold ${pnlToneClass(expectedProfit)}`}>{formatCurrency(expectedProfit, locale)}</PositionCell>
      <PositionCell>
        <div className={`font-mono font-bold ${pnlToneClass(pnl)}`}>{formatCurrency(pnl, locale)}</div>
        <div className={`mt-0.5 font-mono text-[11px] ${pnlToneClass(roe)}`}>{formatPercentNumber(roe)}</div>
      </PositionCell>
      <PositionCell>
        <DetailButton label={t("detail.rowDetail")} disabled={!onOpenScenario} testId="position-scenario-detail" onClick={() => onOpenScenario?.(position)} />
      </PositionCell>
    </tr>
  );
}

function OrderRow({
  order,
  locale,
  t,
  onOpenScenario
}: {
  readonly order: DisplayPaperOrder;
  readonly locale: Locale;
  readonly t: (key: string) => string;
  readonly onOpenScenario?: (order: DisplayPaperOrder) => void;
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
      <PositionCell>
        <p className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-100">{order.symbol}</p>
        <p className="text-[11px] text-zinc-500">{formatLeverage(leverage)}</p>
      </PositionCell>
      <PositionCell className={`font-mono font-bold ${side === "SHORT" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{side}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatNumber(quantity, 4, locale)} {baseAsset(order.symbol)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatNumber(price, 1, locale)}</PositionCell>
      <PositionCell className="font-mono text-rose-600 dark:text-rose-300">{formatNumber(firstFiniteNumber(order.stopLossPrice, order.stop_loss_price), 1, locale)}</PositionCell>
      <PositionCell className="font-mono text-emerald-600 dark:text-emerald-300">{formatNumber(firstFiniteNumber(order.takeProfitPrice, order.take_profit_price), 1, locale)}</PositionCell>
      <PositionCell className="font-mono font-semibold text-zinc-900 dark:text-zinc-200">{formatCurrency(margin, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-900 dark:text-zinc-200">{formatCurrency(notional, locale)}</PositionCell>
      <PositionCell className="font-mono text-zinc-400">{statusLabel(order.status, t)}</PositionCell>
      <PositionCell className="font-mono text-zinc-500 dark:text-zinc-400">{formatClockTime(orderTime, locale)}</PositionCell>
      <PositionCell>
        <DetailButton label={t("detail.rowDetail")} disabled={!onOpenScenario} testId="order-scenario-detail" onClick={() => onOpenScenario?.(order)} />
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
      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-800 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
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
  return {
    id: `position-${String(position.id ?? position.symbol)}`,
    title: "Active simulated position",
    phase: "OPEN_POSITION",
    status: String(position.status ?? "open"),
    side: String(position.side ?? ""),
    price: firstFiniteNumber(position.entryPrice, position.averageEntryPrice, position.openPrice),
    stop: firstFiniteNumber(position.stopLoss, position.stopLossPrice, position.stop_loss_price),
    target: firstFiniteNumber(position.takeProfit, position.takeProfitPrice, position.take_profit_price, recordValue(payload?.target)?.price),
    quantity: firstFiniteNumber(position.quantity, position.size),
    leverage: firstFiniteNumber(position.leverage, recordValue(payload?.leveragePlan)?.suggestedLeverage),
    riskPercent: firstFiniteNumber(payload?.riskPercent),
    entryWeight: firstFiniteNumber(payload?.entryWeight, payload?.weight),
    rationale: scenarioRationaleFromPayload(payload, position.closeReason),
    summary: scenarioSummaryFromPayload(payload),
    reviewBrief: reviewBriefFromRecord({ payload }),
    createdAt: firstString(position.updatedAt, position.openedAt, position.createdAt),
    source: "position"
  };
}

function scenarioFromOrder(order: DisplayPaperOrder): TraderScenario {
  const payload = recordValue(order.payload);
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
    rationale: scenarioRationaleFromPayload(payload),
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

function formatPercentNumber(value: number | null) {
  if (value === null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 2)}%`;
}

function positionRowClass(side: string) {
  const base = "transition hover:bg-zinc-50 dark:hover:bg-white/[0.04]";
  if (side === "SHORT") return `${base} bg-rose-50/35 dark:bg-rose-950/[0.08]`;
  if (side === "LONG") return `${base} bg-emerald-50/35 dark:bg-emerald-950/[0.08]`;
  return base;
}

function pnlToneClass(value: number | null) {
  if (value === null || Math.abs(value) <= 0.000001) return "text-zinc-400";
  return value > 0 ? "text-emerald-400" : "text-rose-400";
}
