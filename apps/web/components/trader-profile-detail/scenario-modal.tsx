"use client";

import { ArrowRight, X } from "@phosphor-icons/react";
import type { ManagementReview, PaperOrder, PaperPosition, PaperTradeEvent } from "@/lib/api";
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
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm">
      <div className="max-h-[92dvh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
        <div className="sticky top-0 z-[1] flex items-start justify-between gap-5 border-b border-zinc-100 bg-white/95 p-5 backdrop-blur dark:border-zinc-900 dark:bg-zinc-950/95">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{scenarioTitle(scenario, t)}</h2>
              <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold leading-none ring-1 ${importance.className}`}>
                <span className={`size-1.5 rounded-full ${importance.dotClassName}`} />
                {importance.label}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{scenario.createdAt ? scenario.createdAt.replace("T", " ").slice(0, 16) : "-"}</p>
          </div>
          <button type="button" onClick={onClose} className="focus-ring grid size-10 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-5 p-5 xl:grid-cols-[1.25fr_0.75fr]">
          <DetailChart
            symbol={symbol}
            result={chartResult}
            paperPositions={positions}
            paperOrders={orders}
            paperEvents={events}
            managementReviews={reviews}
            showPositionPanel={false}
          />
          <div className="space-y-4">
            <div className="rounded-xl bg-zinc-50 p-5 dark:bg-zinc-900">
              <p className="text-xs font-semibold text-zinc-400">{rationaleLabel}</p>
              <p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">{scenarioDisplayText(scenarioDetailRationaleText(scenario, t), t)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MetricBox label={t("common.side")} value={scenario.side ?? "-"} />
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
