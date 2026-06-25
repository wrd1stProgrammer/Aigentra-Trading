"use client";

import { X } from "@phosphor-icons/react";
import { useId } from "react";
import type { ManagementReview, PaperOrder, PaperPosition, PaperTradeEvent } from "@/lib/api";
import { ReviewBriefSummary } from "@/components/review-brief-summary";
import { formatNumber } from "@/lib/format";
import type { LeagueSymbol, TraderScenario } from "@/lib/league";
import { localizedScenarioSide, scenarioTitle } from "@/components/trader-profile-detail/data";
import { importanceBadge, scenarioDetailRationaleText, scenarioDisplayText, scenarioImportance } from "@/components/trader-profile-detail/scenario-copy";
import { DetailChart } from "@/components/trader-profile-detail/chart";
import { MetricBox } from "@/components/trader-profile-detail/side-panels";
import type { ChartPlanResult, Translator } from "@/components/trader-profile-detail/types";

export function ScenarioModal({
  scenario,
  symbol,
  positions,
  orders,
  events,
  reviews,
  chartResult,
  onClose,
  t
}: {
  scenario: TraderScenario;
  symbol: LeagueSymbol;
  positions: PaperPosition[];
  orders: PaperOrder[];
  events: PaperTradeEvent[];
  reviews: ManagementReview[];
  chartResult: ChartPlanResult;
  onClose: () => void;
  t: Translator;
}) {
  const titleId = useId();
  const importance = importanceBadge(scenarioImportance(scenario), t);
  const rationaleLabel = scenarioRationaleLabel(scenario, t);
  const sideValue = scenario.side ? String(scenario.side).toUpperCase() : "-";
  const side = localizedScenarioSide(scenario.side, t) || "-";
  const scenarioCode = scenario.source.slice(0, 2).toUpperCase();
  const scenarioTime = scenario.createdAt ? scenario.createdAt.replace("T", " ").slice(0, 16) : "-";
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-zinc-950/60 p-3 pt-[6dvh] backdrop-blur-sm sm:p-5 sm:pt-[7dvh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="scenario-modal"
        className="max-h-[86dvh] w-full max-w-[920px] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-[#0b0c10] dark:ring-zinc-800"
      >
        <div className="sticky top-0 z-[1] border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-[#0b0c10]/95 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="hidden size-11 shrink-0 place-items-center rounded-xl bg-zinc-950 font-mono text-sm font-black text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-950 sm:grid">
                {scenarioCode}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={titleId} className="text-xl font-black tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-2xl">{scenarioTitle(scenario, t)}</h2>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold leading-none ring-1 ${importance.className}`}>
                    <span className={`size-1.5 rounded-full ${importance.dotClassName}`} />
                    {importance.label}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  <span>{symbol}</span>
                  <span className="text-zinc-300 dark:text-zinc-700">|</span>
                  <span>{scenarioTime}</span>
                  <span className="text-zinc-300 dark:text-zinc-700">|</span>
                  <span className={sideValue === "SHORT" ? "text-rose-500" : sideValue === "LONG" ? "text-emerald-500" : ""}>{side}</span>
                  {scenario.price ? (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                      <span>{t("common.price")} {formatNumber(scenario.price, 0)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50" aria-label={t("detail.closeScenario")}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="hidden md:block">
            <DetailChart
              symbol={symbol}
              result={chartResult}
              paperPositions={positions}
              paperOrders={orders}
              paperEvents={events}
              managementReviews={reviews}
              height={320}
              compact
              showPositionPanel={false}
            />
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{rationaleLabel}</p>
              <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                {scenario.source.toUpperCase()}
              </span>
            </div>
            <div className="mt-3">
              {scenario.reviewBrief ? (
                <ReviewBriefSummary brief={scenario.reviewBrief} title={rationaleLabel} embedded showHeader={false} t={t} />
              ) : (
                <p className="text-sm leading-7 text-zinc-800 dark:text-zinc-100">{scenarioDisplayText(scenarioDetailRationaleText(scenario, t), t)}</p>
              )}
            </div>
          </div>

          {/* Mobile compact metrics */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/20 dark:bg-zinc-900/10">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("common.side")}</span>
              <p className="mt-1 font-semibold text-zinc-950 dark:text-white text-sm">{side}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/20 dark:bg-zinc-900/10">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("common.price")}</span>
              <p className="mt-1 font-semibold font-mono text-zinc-950 dark:text-white text-sm">{formatNumber(scenario.price, 0)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/20 dark:bg-zinc-900/10">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("chart.stopLoss")}</span>
              <p className="mt-1 font-semibold font-mono text-zinc-950 dark:text-white text-sm">{formatNumber(scenario.stop, 0)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/20 dark:bg-zinc-900/10">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("chart.takeProfit")}</span>
              <p className="mt-1 font-semibold font-mono text-zinc-950 dark:text-white text-sm">{formatNumber(scenario.target, 0)}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/20 dark:bg-zinc-900/10 flex justify-between items-center">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{t("common.quantity")}</span>
              <p className="font-semibold font-mono text-zinc-950 dark:text-white text-sm">{formatNumber(scenario.quantity)}</p>
            </div>
          </div>

          {/* Desktop Metric Boxes */}
          <div className="hidden md:grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricBox label={t("common.side")} value={side} />
            <MetricBox label={t("common.price")} value={formatNumber(scenario.price, 0)} />
            <MetricBox label={t("chart.stopLoss")} value={formatNumber(scenario.stop, 0)} />
            <MetricBox label={t("chart.takeProfit")} value={formatNumber(scenario.target, 0)} />
            <MetricBox label={t("common.quantity")} value={formatNumber(scenario.quantity)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function scenarioRationaleLabel(scenario: TraderScenario, t: Translator): string {
  switch (scenario.source) {
    case "position":
    case "order":
      return t("aiReview.entryRationale");
    case "review":
      return t("aiReview.rationale");
    case "event":
      return t("detail.eventRationale");
    case "strategy":
      return t("detail.strategyRationale");
  }
}
