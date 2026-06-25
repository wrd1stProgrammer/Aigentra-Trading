"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { CircleNotch, ClockCounterClockwise, Gauge, ShieldWarning, TrendDown, TrendUp } from "@phosphor-icons/react";
import { formatNumber, intlLocale } from "@/lib/format";
import type { LeagueSentimentOpinionResponse } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

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
  const activeCount = (sourceCounts.activePositions ?? 0) + (sourceCounts.pendingOrders ?? 0);
  const nextRefreshAt = data?.nextRefreshAt ?? null;
  const generatedAt = data?.createdAt ?? data?.updatedAt ?? data?.intervalStart ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

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
              {data?.cacheHit && (
                <span className="shrink-0 self-start rounded-full bg-zinc-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  cached
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              {opinion.summary}
            </p>
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
        </div>

        <aside className="border-t border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/[0.08] dark:bg-black/20 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            {t("consensus.aigentraOpinion")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 divide-y-0 sm:mt-4 sm:block sm:divide-y sm:divide-zinc-200 sm:dark:divide-white/[0.08]">
            <Metric label={t("consensus.opinionRisk")} value={shouldShowLoading ? "-" : localizedRiskLevel(opinion.riskLevel, t)} />
            <Metric label={t("consensus.opinionActiveSources")} value={shouldShowLoading ? "-" : String(activeCount)} />
            <Metric label={t("consensus.opinionLongShort")} value={shouldShowLoading ? "-" : opinion.longShortContext} compact />
            <Metric
              label={t("consensus.nextOpinionCountdown")}
              value={shouldShowLoading ? "-" : formatMinutesUntil(nextRefreshAt, nowMs, t)}
              detail={isFetching ? t("common.loading") : t("consensus.opinionRefreshBackground")}
              icon={<ClockCounterClockwise size={15} />}
              compact
            />
            <Metric
              label={t("consensus.opinionGeneratedAt")}
              value={shouldShowLoading ? "-" : formatDateTime(generatedAt, locale)}
              detail={data?.stale ? t("consensus.opinionStale") : undefined}
              compact
            />
          </div>
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
  if (!value) return "-";
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return "-";
  const minutes = Math.max(0, Math.ceil((target - nowMs) / 60_000));
  if (minutes <= 0) return t("consensus.opinionGeneratingNow");
  return t("consensus.minutesRemaining").replace("{minutes}", String(minutes));
}
