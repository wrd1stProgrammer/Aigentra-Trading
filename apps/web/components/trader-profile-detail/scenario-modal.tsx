"use client";

import { ArrowRight, X } from "@phosphor-icons/react";
import type { ManagementReview, PaperOrder, PaperPosition, PaperTradeEvent } from "@/lib/api";
import { ReviewBriefSummary } from "@/components/review-brief-summary";
import { formatNumber } from "@/lib/format";
import type { LeagueSymbol, TraderScenario } from "@/lib/league";
import { scenarioTitle } from "@/components/trader-profile-detail/data";
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
  const importance = importanceBadge(scenarioImportance(scenario), t);
  const rationaleLabel = scenarioRationaleLabel(scenario, t);
  const side = scenario.side ? String(scenario.side).toUpperCase() : "-";
  const scenarioCode = scenario.source.slice(0, 2).toUpperCase();
  const scenarioTime = scenario.createdAt ? scenario.createdAt.replace("T", " ").slice(0, 16) : "-";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="max-h-[94dvh] w-full max-w-7xl overflow-y-auto rounded-[1.4rem] bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-[#0b0c10] dark:ring-zinc-800">
        <div className="sticky top-0 z-[1] border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-[#0b0c10]/95 sm:px-7">
          <div className="flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-zinc-950 font-mono text-lg font-black text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-950">
                {scenarioCode}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-3xl">{scenarioTitle(scenario, t)}</h2>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold leading-none ring-1 ${importance.className}`}>
                    <span className={`size-1.5 rounded-full ${importance.dotClassName}`} />
                    {importance.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  <span>{symbol}</span>
                  <span className="text-zinc-300 dark:text-zinc-700">|</span>
                  <span>{scenarioTime}</span>
                  <span className="text-zinc-300 dark:text-zinc-700">|</span>
                  <span className={side === "SHORT" ? "text-rose-500" : side === "LONG" ? "text-emerald-500" : ""}>{side}</span>
                  {scenario.price ? (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                      <span>{t("common.price")} {formatNumber(scenario.price, 0)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="focus-ring grid size-10 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50" aria-label={t("detail.closeScenario")}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <DetailChart
            symbol={symbol}
            result={chartResult}
            paperPositions={positions}
            paperOrders={orders}
            paperEvents={events}
            managementReviews={reviews}
            height={430}
            compact
            showPositionPanel={false}
          />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-200 dark:bg-zinc-900/45 dark:ring-zinc-800">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-400">{rationaleLabel}</p>
              <div className="mt-4">
                {scenario.reviewBrief ? (
                  <ReviewBriefSummary brief={scenario.reviewBrief} title={rationaleLabel} t={t} />
                ) : (
                  <p className="text-base leading-8 text-zinc-800 dark:text-zinc-100">{scenarioDisplayText(scenarioDetailRationaleText(scenario, t), t)}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricBox label={t("common.side")} value={side} />
                <MetricBox label={t("common.price")} value={formatNumber(scenario.price, 0)} />
                <MetricBox label={t("chart.stopLoss")} value={formatNumber(scenario.stop, 0)} />
                <MetricBox label={t("chart.takeProfit")} value={formatNumber(scenario.target, 0)} />
                <MetricBox label={t("common.quantity")} value={formatNumber(scenario.quantity)} />
                <MetricBox label={t("detail.confidence")} value={scenario.confidence ? `${scenario.confidence}%` : "-"} />
              </div>
              <button type="button" onClick={onClose} className="action-button w-full rounded-xl py-3">
                {t("detail.closeScenario")}
                <ArrowRight size={16} />
              </button>
            </div>
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
