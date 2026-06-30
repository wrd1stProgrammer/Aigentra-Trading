"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { CircleNotch, ClockCounterClockwise, Gauge, ShieldWarning, TrendDown, TrendUp } from "@phosphor-icons/react";
import { formatNumber, intlLocale } from "@/lib/format";
import type { LeagueSentimentOpinionResponse } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import {
  dataAgeLabel,
  leagueSentimentFreshnessView,
  leagueSentimentSourceGroups,
  refreshCountdownLabel,
  type LeagueSentimentFreshnessStatus,
} from "@/lib/league-sentiment-ui-policy";

type Props = {
  data?: LeagueSentimentOpinionResponse;
  isFetching?: boolean;
  isLoading?: boolean;
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

export function ConsensusHourlyOpinion({ data, isFetching = false, isLoading = false, locale, t }: Props) {
  const opinion = data?.opinion;
  const shouldShowLoading = isLoading || !opinion;
  const bias = opinion?.bias ?? "NEUTRAL";
  const tone = biasTone[bias] ?? biasTone.NEUTRAL;
  const sourceCounts = opinion?.sourceCounts ?? {};
  const sourceGroups = leagueSentimentSourceGroups(sourceCounts);
  const nextRefreshAt = data?.nextRefreshAt ?? null;
  const generatedAt = data?.createdAt ?? data?.updatedAt ?? data?.intervalStart ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const freshness = leagueSentimentFreshnessView(data, nowMs);
  const freshnessDetail = formatFreshnessDetail(freshness, t);
  const dataFreshness = opinion?.dataFreshness ?? {};
  const evidenceRefs = opinion?.evidenceRefs?.slice(0, 6) ?? [];

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.025]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
                {t("consensus.aigentraOpinion")}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-600 dark:text-zinc-400 sm:mt-1.5 sm:text-sm sm:leading-6">
                {t("consensus.aigentraOpinionSubtitle")}
              </p>
            </div>
            {!shouldShowLoading && (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${tone}`}>
                  {biasIcon(bias)}
                  {t(`consensus.bias.${bias}`)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                  <Gauge size={14} />
                  {formatNumber(opinion.confidence, 0, locale)}%
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${freshnessTone(freshness.status)}`}>
                  <ClockCounterClockwise size={14} />
                  {t(freshness.labelKey)}
                </span>
              </div>
            )}
          </div>

          {shouldShowLoading ? (
            <div
              data-testid="consensus-opinion-loading"
              className="mt-4 flex min-h-[220px] items-center justify-center border-t border-zinc-200 pt-4 dark:border-white/[0.08] sm:mt-5 sm:pt-5"
              role="status"
              aria-live="polite"
            >
              <div className="flex max-w-md flex-col items-center gap-3 text-center">
                <CircleNotch className="animate-spin text-emerald-500 dark:text-emerald-300" size={30} weight="bold" />
                <div>
                  <p className="text-sm font-bold text-zinc-950 dark:text-white">{t("consensus.opinionLoadingHeadline")}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t("consensus.opinionLoadingSummary")}</p>
                </div>
              </div>
            </div>
          ) : (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-white/[0.08] sm:mt-5 sm:pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base font-bold leading-6 text-zinc-950 dark:text-white sm:text-lg sm:leading-7">
                {opinion.headline}
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {opinion.summary}
            </p>
            {opinion.confidenceReason && (
              <p className="mt-2 text-xs font-semibold leading-5 text-zinc-600 dark:text-zinc-400">
                <span className="text-zinc-950 dark:text-white">{t("consensus.confidenceReason")} </span>
                {opinion.confidenceReason}
              </p>
            )}
            {opinion.action && (
              <p className="mt-3 border-l-2 border-emerald-500 pl-3 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-200 sm:mt-4">
                {opinion.action}
              </p>
            )}
          </div>
          )}

          {!shouldShowLoading && (
            <div className="mt-3 grid gap-2 md:grid-cols-3 md:gap-3">
              <OpinionList tone="good" title={t("consensus.opinionDrivers")} items={opinion.keyDrivers} empty={t("consensus.opinionNoDrivers")} />
              <OpinionList tone="warn" title={t("consensus.opinionRisks")} items={opinion.risks} empty={t("consensus.opinionNoRisks")} />
              <OpinionList tone="neutral" title={t("consensus.opinionWatch")} items={opinion.watchConditions} empty={t("consensus.opinionNoWatch")} />
            </div>
          )}
          {!shouldShowLoading && evidenceRefs.length > 0 && (
            <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-white/[0.08]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t("consensus.evidenceRefs")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {evidenceRefs.map((ref) => (
                  <span
                    key={ref.id}
                    className="max-w-full truncate rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
                    title={ref.label}
                  >
                    {ref.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="border-t border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/[0.08] dark:bg-black/20 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            {t("consensus.aigentraOpinion")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 divide-y-0 sm:mt-4 sm:block sm:divide-y sm:divide-zinc-200 sm:dark:divide-white/[0.08]">
            <Metric label={t("consensus.opinionRisk")} value={shouldShowLoading ? "-" : localizedRiskLevel(opinion.riskLevel, t)} />
            <Metric label={t("consensus.opinionLongShort")} value={shouldShowLoading ? "-" : opinion.longShortContext} compact />
            <Metric
              label={t("consensus.nextOpinionCountdown")}
              value={shouldShowLoading ? "-" : formatMinutesUntil(nextRefreshAt, nowMs, t)}
              detail={isFetching ? t("common.loading") : freshness.status === "overdue" ? freshnessDetail : t("consensus.opinionRefreshBackground")}
              icon={<ClockCounterClockwise size={15} />}
              compact
            />
            <Metric
              label={t("consensus.opinionGeneratedAt")}
              value={shouldShowLoading ? "-" : formatDateTime(generatedAt, locale)}
              detail={data?.stale ? freshnessDetail : undefined}
              compact
            />
            <Metric
              label={t("consensus.opinionInvalidatesAt")}
              value={shouldShowLoading ? "-" : formatDateTime(opinion.invalidatesAt ?? data?.intervalEnd ?? null, locale)}
              compact
            />
          </div>
          {!shouldShowLoading && (
            <>
              <SourceGroupList groups={sourceGroups} t={t} />
              <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-white/[0.08]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t("consensus.dataFreshness")}</p>
                <div className="mt-2 space-y-1.5">
                  <FreshnessRow label={t("consensus.freshness.market")} value={dataAgeLabel(dataFreshness.marketAgeMinutes, t)} />
                  <FreshnessRow label={t("consensus.freshness.positions")} value={dataAgeLabel(dataFreshness.latestActivePositionAgeMinutes, t)} />
                  <FreshnessRow label={t("consensus.freshness.reviews")} value={dataAgeLabel(dataFreshness.latestManagementReviewAgeMinutes ?? dataFreshness.latestEntryReviewAgeMinutes, t)} />
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function localizedRiskLevel(value: string, t: (key: string) => string) {
  const key = `consensus.riskLevel.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
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
    <div className="min-w-0 py-2 first:pt-0 last:pb-0 sm:py-3">
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

function SourceGroupList({
  groups,
  t,
}: {
  groups: ReturnType<typeof leagueSentimentSourceGroups>;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-white/[0.08]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t("consensus.sourceGroups")}</p>
      <div className="mt-2 space-y-2">
        {groups.map((group) => (
          <div key={group.key} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t(group.labelKey)}</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{group.detail}</p>
            </div>
            <span className="font-mono text-sm font-bold text-zinc-950 dark:text-white">{group.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FreshnessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="min-w-0 truncate text-zinc-500">{label}</span>
      <span className="shrink-0 font-mono font-semibold text-zinc-800 dark:text-zinc-200">{value}</span>
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

function formatMinutesUntil(value: string | null, nowMs: number, t: (key: string) => string) {
  return refreshCountdownLabel(value, nowMs, t);
}

function freshnessTone(status: LeagueSentimentFreshnessStatus) {
  if (status === "overdue") return "border-rose-500/30 bg-rose-500/[0.08] text-rose-600 dark:text-rose-300";
  if (status === "stale") return "border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300";
  if (status === "cached") return "border-sky-500/25 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300";
  return "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300";
}

function formatFreshnessDetail(
  freshness: ReturnType<typeof leagueSentimentFreshnessView>,
  t: (key: string) => string,
) {
  return t(freshness.detailKey).replace("{minutes}", String(freshness.overdueMinutes));
}
