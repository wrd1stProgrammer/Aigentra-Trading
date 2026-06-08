"use client";

import { CaretDown, ChartPieSlice } from "@phosphor-icons/react";
import { useState } from "react";
import type { ManagementReview } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TraderStanding } from "@/lib/league";
import { statusLabel, traderStatusSummary } from "@/lib/status";
import { movementToneClass } from "@/components/trader-profile-detail/data";
import { accountDeploymentPercent, accountNotionalExposurePercent } from "@/components/trader-profile-detail/holdings";
import type { HoldingItem, PlanView, TradeHistoryItem, Translator } from "@/components/trader-profile-detail/types";

export function HoldingPanel({ items, asOf, t }: { items: HoldingItem[]; asOf: string; t: Translator }) {
  const deployedPercent = accountDeploymentPercent(items);
  const totalExposurePercent = accountNotionalExposurePercent(items);
  return (
    <section data-testid="holding-panel" className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("detail.holdingStatus")}</h2>
        <span className="text-sm font-medium text-zinc-400">{t("detail.asOf")} {asOf}</span>
      </div>
      <div className="mt-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400">{t("detail.deployment")}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t("detail.deploymentHint")}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-semibold text-zinc-950 dark:text-zinc-50">{formatPercent(deployedPercent).replace("+", "")}</p>
            <p className="text-xs text-zinc-400">{t("detail.notionalExposure")} {formatPercent(totalExposurePercent).replace("+", "")}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400" style={{ width: `${deployedPercent}%` }} />
        </div>
      </div>
      <div className="mt-5 max-h-[420px] space-y-4 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} data-testid="holding-item" className="border-t border-zinc-100 pt-4 first:border-t-0 first:pt-0 dark:border-zinc-900">
            <div className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-start gap-3">
              <span className={`mt-1.5 size-3 rounded-full ${item.colorClass}`} />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{item.label}</p>
                  {item.badges.map((badge) => (
                    <HoldingBadge key={`${item.id}-${badge.label}`} badge={badge} />
                  ))}
                </div>
                <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">{item.subLabel}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50">{formatPercent(item.deploymentPercent).replace("+", "")}</p>
                <p className={`mt-0.5 font-mono text-sm ${item.returnPct === null ? "text-zinc-400" : item.returnPct >= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                  {item.returnPct === null ? "-" : formatPercent(item.returnPct)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 pl-6">
              {item.details.map((detail) => (
                <div key={`${item.id}-${detail.label}`} className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{detail.label}</p>
                  <p className={`mt-0.5 truncate font-mono text-sm font-semibold ${detailToneClass(detail.tone)}`}>{detail.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!items.length ? <div className="mt-5 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">{t("detail.noHoldings")}</div> : null}
    </section>
  );
}

function HoldingBadge({ badge }: { badge: HoldingItem["badges"][number] }) {
  const toneClass =
    badge.tone === "long"
      ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
      : badge.tone === "short"
        ? "bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-300"
        : badge.tone === "warn"
          ? "bg-amber-500/14 text-amber-800 ring-amber-500/25 dark:text-amber-200"
          : "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800";
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none ring-1 ${toneClass}`}>{badge.label}</span>;
}

function detailToneClass(tone: HoldingItem["details"][number]["tone"]) {
  if (tone === "good") return "text-red-600 dark:text-red-400";
  if (tone === "bad") return "text-blue-600 dark:text-blue-400";
  return "text-zinc-950 dark:text-zinc-50";
}

export function TradeHistoryPanel({ items, t }: { items: TradeHistoryItem[]; t: Translator }) {
  const [expandedTradeHistoryId, setExpandedTradeHistoryId] = useState<string | null>(null);
  return (
    <section data-testid="trade-history-panel" className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <h2 className="text-lg font-semibold tracking-tight">{t("detail.executionLog")}</h2>
      <div className="mt-5 max-h-[360px] divide-y divide-zinc-100 overflow-y-auto pr-1 dark:divide-zinc-900">
        {items.map((item) => (
          <div key={item.id} className="py-3">
            <div className="grid grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-3">
              <span className="font-mono text-sm font-semibold text-zinc-400">{item.time}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  <span className={movementToneClass(item.actionTone)}>{item.action}</span> {item.label}
                </p>
                <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {[item.quantity, item.priceLabel].filter(Boolean).join(" · ")}
                </p>
              </div>
              {(() => {
                const expanded = expandedTradeHistoryId === item.id;
                return (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpandedTradeHistoryId(expanded ? null : item.id)}
                    className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  >
                    {item.basis}
                    <CaretDown className={expanded ? "rotate-180 transition" : "transition"} size={14} />
                  </button>
                );
              })()}
            </div>
            {expandedTradeHistoryId === item.id ? (
              <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm leading-6 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {item.basisDetail}
              </div>
            ) : null}
          </div>
        ))}
        {!items.length ? <div className="py-6 text-sm text-zinc-500 dark:text-zinc-400">{t("detail.noTradeHistory")}</div> : null}
      </div>
    </section>
  );
}

export function AgentStatusPanel({
  standing,
  latestReview,
  latestPlan,
  locale,
  t
}: {
  standing: TraderStanding;
  latestReview?: ManagementReview;
  latestPlan: PlanView;
  locale: Locale;
  t: Translator;
}) {
  const reviewDecision = standing.summary?.lastDecision ?? latestReview?.decision;
  return (
    <section data-testid="management-journal" className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="flex items-center gap-2">
        <ChartPieSlice size={20} />
        <h2 className="text-lg font-semibold tracking-tight">{t("leaderboard.previewStatus")}</h2>
      </div>
      <div className="mt-5 divide-y divide-zinc-100 overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:divide-zinc-900 dark:ring-zinc-800">
        <StatusLine label={t("leaderboard.currentState")} value={traderStatusSummary(standing.summary, t)} />
        <StatusLine label={t("leaderboard.latestPlanStatus")} value={statusLabel(latestPlan.status ?? standing.summary?.latestPlanStatus, t)} />
        <StatusLine label={t("leaderboard.latestRunStatus")} value={statusLabel(standing.summary?.latestRunStatus, t)} />
        <StatusLine label={t("agent.phase")} value={statusLabel(standing.summary?.agentPhase, t)} />
        <StatusLine label={t("agent.lastDecision")} value={statusLabel(reviewDecision, t)} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <MetricBox label={t("common.maxDrawdown")} value={formatPercent(standing.maxDrawdown).replace("+", "")} />
        <MetricBox label={t("paper.riskLeverage")} value={`${formatPercent(latestPlan.riskPercent ?? standing.riskPercent).replace("+", "")} / ${formatNumber(latestPlan.leverage ?? standing.averageLeverage ?? standing.leverage ?? 1, 1, locale)}x`} />
        <MetricBox label={t("leaderboard.openNotional")} value={formatNumber(standing.summary?.openNotional ?? standing.summary?.openOrderNotional ?? 0, 0, locale)} />
        <MetricBox label={t("leaderboard.openExposure")} value={`${standing.openPositions} / ${standing.openOrders}`} />
        <MetricBox label={t("chart.stopLoss")} value={formatNumber(latestPlan.stopLoss, 0, locale)} />
        <MetricBox label={t("aiReview.confidence")} value={latestReview?.confidence ? `${latestReview.confidence}%` : "-"} />
      </div>
    </section>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-4 py-3 dark:bg-zinc-950">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-right text-sm font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">{value}</span>
    </div>
  );
}

export function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p className="text-xs font-semibold text-zinc-400">{label}</p>
      <p className="mt-2 truncate font-mono text-base font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}
