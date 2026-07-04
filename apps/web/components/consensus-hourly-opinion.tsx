"use client";

import { useEffect, useState } from "react";
import { ClockCounterClockwise, Gauge, ShieldWarning, TrendDown, TrendUp } from "@phosphor-icons/react";
import { formatNumber, intlLocale } from "@/lib/format";
import type { LeagueSentimentOpinionResponse } from "@/lib/api";
import { compactOpinionBriefLines } from "@/lib/consensus-opinion-view-policy";
import type { Locale } from "@/lib/i18n";
import {
  leagueSentimentFreshnessView,
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
  LONG_BIASED: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  SHORT_BIASED: "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400",
  RISK_OFF: "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400",
  MIXED: "border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400",
  NEUTRAL: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400",
};

export function ConsensusHourlyOpinion({ data, isFetching = false, isLoading = false, locale, t }: Props) {
  const opinion = data?.opinion;
  const shouldShowLoading = isLoading || !opinion;
  const bias = opinion?.bias ?? "NEUTRAL";
  const tone = biasTone[bias] ?? biasTone.NEUTRAL;
  const nextRefreshAt = data?.nextRefreshAt ?? null;
  const generatedAt = data?.createdAt ?? data?.updatedAt ?? data?.intervalStart ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const freshness = leagueSentimentFreshnessView(data, nowMs);
  const briefLines = opinion
    ? compactOpinionBriefLines({
        brief: opinion.brief,
        headline: opinion.headline,
        summary: opinion.summary,
        action: opinion.action,
        watchConditions: opinion.watchConditions,
      })
    : [];

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-zinc-950/20"
      aria-busy={isFetching || shouldShowLoading}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold leading-tight text-zinc-950 dark:text-white">
              {t("consensus.aigentraOpinion")}
            </h2>
            <p className="mt-1 max-w-2xl break-words text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t("consensus.aigentraOpinionSubtitle")}
            </p>
          </div>
          {!shouldShowLoading && (
            <div className="flex min-w-0 shrink-0 flex-wrap gap-1.5 sm:justify-end">
              <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${tone}`}>
                {biasIcon(bias)}
                {t(`consensus.bias.${bias}`)}
              </span>
              <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${freshnessTone(freshness.status)}`}>
                <ClockCounterClockwise size={13} />
                {t(freshness.labelKey)}
              </span>
            </div>
          )}
        </div>

        {shouldShowLoading ? (
          <div
            data-testid="consensus-opinion-loading"
            className="mt-5 space-y-2.5"
            role="status"
            aria-live="polite"
          >
            <div className="h-5 w-4/5 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            <div className="h-4 w-full animate-pulse rounded bg-zinc-100 dark:bg-white/[0.07]" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-white/[0.07]" />
            <p className="sr-only">{t("consensus.opinionLoadingHeadline")}</p>
          </div>
        ) : (
          <>
            <div data-testid="consensus-opinion-brief" className="mt-5 space-y-2.5">
              {briefLines.map((line, index) => (
                <p
                  key={line}
                  className={
                    index === 0
                      ? "break-words text-base font-bold leading-relaxed text-zinc-950 dark:text-white sm:text-lg"
                      : "break-words text-sm font-medium leading-relaxed text-zinc-600 dark:text-zinc-300"
                  }
                >
                  {line}
                </p>
              ))}
            </div>

            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs dark:border-white/[0.05]">
              <span className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 font-bold ${riskBadgeTone(opinion.riskLevel)}`}>
                <ShieldWarning size={13} weight="fill" />
                {t("consensus.opinionRisk")} {localizedRiskLevel(opinion.riskLevel, t)}
              </span>
              <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-bold text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
                <Gauge size={13} className="text-zinc-400" />
                {t("consensus.opinionConfidence")} {formatNumber(opinion.confidence, 0, locale)}%
              </span>
              <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-medium text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
                <ClockCounterClockwise size={13} />
                {t("consensus.nextOpinionCountdown")} {formatMinutesUntil(nextRefreshAt, nowMs, t)}
              </span>
              <span className="inline-flex max-w-full min-w-0 break-words rounded-md px-1.5 py-1 font-mono text-zinc-400 dark:text-zinc-500">
                {t("consensus.opinionGeneratedAt")} {formatDateTime(generatedAt, locale)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function localizedRiskLevel(value: string | undefined, t: (key: string) => string) {
  if (!value) return "-";
  const key = `consensus.riskLevel.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

function riskBadgeTone(risk: string | undefined) {
  if (risk === "HIGH") return "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400";
  if (risk === "NORMAL" || risk === "MEDIUM") return "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400";
  return "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400";
}

function biasIcon(bias: string) {
  if (bias === "LONG_BIASED") return <TrendUp size={13} weight="bold" />;
  if (bias === "SHORT_BIASED") return <TrendDown size={13} weight="bold" />;
  if (bias === "RISK_OFF") return <ShieldWarning size={13} weight="bold" />;
  return <Gauge size={13} weight="bold" />;
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
  if (status === "overdue") return "border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400";
  if (status === "stale") return "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400";
  if (status === "cached") return "border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400";
  return "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400";
}
