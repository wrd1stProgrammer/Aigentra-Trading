"use client";

import type React from "react";
import { ClockCounterClockwise, Gauge, ShieldWarning, Sparkle, TrendDown, TrendUp } from "@phosphor-icons/react";
import { formatNumber, intlLocale } from "@/lib/format";
import type { LeagueSentimentOpinionResponse } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

type Props = {
  data?: LeagueSentimentOpinionResponse;
  isFetching?: boolean;
  locale: Locale;
  t: (key: string) => string;
};

const biasTone: Record<string, string> = {
  LONG_BIASED: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-300",
  SHORT_BIASED: "border-rose-500/25 bg-rose-500/[0.08] text-rose-600 dark:text-rose-300",
  RISK_OFF: "border-amber-500/25 bg-amber-500/[0.08] text-amber-600 dark:text-amber-300",
  MIXED: "border-sky-500/25 bg-sky-500/[0.08] text-sky-600 dark:text-sky-300",
  NEUTRAL: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300",
};

export function ConsensusHourlyOpinion({ data, isFetching = false, locale, t }: Props) {
  const opinion = data?.opinion;
  const bias = opinion?.bias ?? "NEUTRAL";
  const tone = biasTone[bias] ?? biasTone.NEUTRAL;
  const sourceCounts = opinion?.sourceCounts ?? {};
  const activeCount = (sourceCounts.activePositions ?? 0) + (sourceCounts.pendingOrders ?? 0);
  const nextRefreshAt = data?.nextRefreshAt ?? null;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.025]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                <Sparkle size={13} weight="fill" />
                Aigentra
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
                {t("consensus.aigentraOpinion")}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {t("consensus.aigentraOpinionSubtitle")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${tone}`}>
                {biasIcon(bias)}
                {t(`consensus.bias.${bias}`)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                <Gauge size={14} />
                {formatNumber(opinion?.confidence ?? 0, 0, locale)}%
              </span>
            </div>
          </div>

          <div className="mt-5 border-t border-zinc-200 pt-5 dark:border-white/[0.08]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-lg font-bold leading-7 text-zinc-950 dark:text-white">
                {opinion?.headline ?? t("consensus.opinionLoadingHeadline")}
              </p>
              {data?.cacheHit && (
                <span className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  cached
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {opinion?.summary ?? t("consensus.opinionLoadingSummary")}
            </p>
            {opinion?.action && (
              <p className="mt-4 border-l-2 border-emerald-500 pl-3 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200">
                {opinion.action}
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <OpinionList tone="good" title={t("consensus.opinionDrivers")} items={opinion?.keyDrivers} empty={t("consensus.opinionNoDrivers")} />
            <OpinionList tone="warn" title={t("consensus.opinionRisks")} items={opinion?.risks} empty={t("consensus.opinionNoRisks")} />
            <OpinionList tone="neutral" title={t("consensus.opinionWatch")} items={opinion?.watchConditions} empty={t("consensus.opinionNoWatch")} />
          </div>
        </div>

        <aside className="border-t border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/[0.08] dark:bg-black/20 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            {t("consensus.aigentraOpinion")}
          </p>
          <div className="mt-4 divide-y divide-zinc-200 dark:divide-white/[0.08]">
            <Metric label={t("consensus.opinionRisk")} value={opinion?.riskLevel ?? "-"} />
            <Metric label={t("consensus.opinionActiveSources")} value={String(activeCount)} />
            <Metric label={t("consensus.opinionLongShort")} value={opinion?.longShortContext ?? "-"} compact />
            <Metric
              label={t("consensus.nextOpinionRefresh")}
              value={formatDateTime(nextRefreshAt, locale)}
              detail={isFetching ? t("common.loading") : t("consensus.generatedAt")}
              icon={<ClockCounterClockwise size={15} />}
              compact
            />
          </div>
        </aside>
      </div>
    </section>
  );
}

function OpinionList({
  tone,
  title,
  items,
  empty,
}: {
  tone: "good" | "warn" | "neutral";
  title: string;
  items?: string[];
  empty: string;
}) {
  const values = items?.length ? items : [empty];
  const dotClass = tone === "good" ? "bg-emerald-400" : tone === "warn" ? "bg-amber-400" : "bg-sky-400";
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.015]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</p>
      <ul className="mt-2 space-y-2">
        {values.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  compact = false,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </p>
      <p className={`mt-1 font-mono font-bold text-zinc-950 dark:text-white ${compact ? "text-sm leading-6" : "text-xl"}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-[11px] text-zinc-500">{detail}</p>}
    </div>
  );
}

function biasIcon(bias: string) {
  if (bias === "LONG_BIASED") return <TrendUp size={14} weight="bold" />;
  if (bias === "SHORT_BIASED") return <TrendDown size={14} weight="bold" />;
  if (bias === "RISK_OFF") return <ShieldWarning size={14} weight="bold" />;
  return <Gauge size={14} weight="bold" />;
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
