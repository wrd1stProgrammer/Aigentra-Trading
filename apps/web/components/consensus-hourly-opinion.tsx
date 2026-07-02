"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CircleNotch, ClockCounterClockwise, Gauge, Info, ShieldWarning, Sparkle, TrendDown, TrendUp, Warning } from "@phosphor-icons/react";
import { formatNumber, intlLocale } from "@/lib/format";
import type { LeagueSentimentOpinionResponse } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { compactLongShortContext, compactOpinionInsights, type CompactOpinionInsight } from "@/lib/consensus-opinion-view-policy";
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

type SignalTone = "good" | "bad" | "warn" | "neutral";

const biasTone: Record<string, string> = {
  LONG_BIASED: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-300",
  SHORT_BIASED: "border-rose-500/25 bg-rose-500/[0.08] text-rose-600 dark:text-rose-300",
  RISK_OFF: "border-amber-500/25 bg-amber-500/[0.08] text-amber-600 dark:text-amber-300",
  MIXED: "border-sky-500/25 bg-sky-500/[0.08] text-sky-600 dark:text-sky-300",
  NEUTRAL: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300",
};

const signalTone: Record<SignalTone, string> = {
  good: "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300",
  bad: "border-rose-500/20 bg-rose-500/[0.05] text-rose-700 dark:text-rose-300",
  warn: "border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-zinc-300",
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
  const freshnessDetail = t(freshness.detailKey).replace("{minutes}", String(freshness.overdueMinutes));
  const compactLongShort = opinion ? compactLongShortContext(opinion.longShortContext) : "-";
  const insights = opinion
    ? compactOpinionInsights({
        drivers: opinion.keyDrivers,
        risks: opinion.risks,
        watch: opinion.watchConditions,
        driverLabel: t("consensus.opinionDrivers"),
        riskLabel: t("consensus.opinionRisks"),
        watchLabel: t("consensus.opinionWatch"),
        emptyDriver: t("consensus.opinionNoDrivers"),
        emptyRisk: t("consensus.opinionNoRisks"),
        emptyWatch: t("consensus.opinionNoWatch"),
      })
    : [];

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.025]">
      <div className="p-3 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-zinc-200 pb-3 dark:border-white/[0.08] sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:pb-4">
          <div className="min-w-0">
            <h2 className="break-keep text-lg font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
              {t("consensus.aigentraOpinion")}
            </h2>
            <p className="mt-1 hidden max-w-2xl break-keep text-xs leading-5 text-zinc-600 dark:text-zinc-400 sm:block sm:text-sm">
              {t("consensus.aigentraOpinionSubtitle")}
            </p>
          </div>
          {!shouldShowLoading && (
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${tone}`}>
                {biasIcon(bias)}
                {t(`consensus.bias.${bias}`)}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${freshnessTone(freshness.status)}`}>
                <ClockCounterClockwise size={14} />
                {t(freshness.labelKey)}
              </span>
            </div>
          )}
        </div>

        {shouldShowLoading ? (
          <div
            data-testid="consensus-opinion-loading"
            className="flex min-h-[220px] items-center justify-center pt-5"
            role="status"
            aria-live="polite"
          >
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <CircleNotch className="animate-spin text-emerald-500 dark:text-emerald-300" size={30} weight="bold" />
              <div>
                <p className="text-sm font-bold text-zinc-950 dark:text-white">{t("consensus.opinionLoadingHeadline")}</p>
                <p className="mt-1 break-keep text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t("consensus.opinionLoadingSummary")}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-3 sm:pt-4">
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">
                <p className="overflow-hidden break-keep text-base font-bold leading-snug text-zinc-950 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-white sm:text-xl" title={opinion.headline}>
                  {opinion.headline}
                </p>
                <p className="mt-2 hidden break-keep text-sm leading-6 text-zinc-700 dark:text-zinc-300 sm:line-clamp-2" title={opinion.summary}>
                  {opinion.summary}
                </p>
                {opinion.action && (
                  <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5 dark:bg-emerald-500/[0.025] sm:mt-4 sm:p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 sm:text-[11px]">
                      <Sparkle size={13} weight="fill" />
                      {t("consensus.opinionAction")}
                    </p>
                    <p className="mt-1 overflow-hidden break-keep text-xs font-semibold leading-5 text-zinc-800 [-webkit-box-orient:vertical] [-webkit-line-clamp:1] [display:-webkit-box] dark:text-zinc-100 sm:mt-1.5 sm:text-sm sm:leading-6 sm:[-webkit-line-clamp:2]" title={opinion.action}>
                      {opinion.action}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-1">
                <Signal label={t("consensus.opinionRisk")} value={localizedRiskLevel(opinion.riskLevel, t)} icon={<ShieldWarning size={14} weight="bold" />} tone={riskSignalTone(opinion.riskLevel)} />
                <Signal label={t("consensus.opinionConfidence")} value={`${formatNumber(opinion.confidence, 0, locale)}%`} icon={<Gauge size={14} weight="bold" />} tone="neutral" />
                <Signal label={t("consensus.opinionLongShort")} value={compactLongShort} icon={biasIcon(bias)} tone={biasSignalTone(bias)} />
                <Signal
                  label={t("consensus.nextOpinionCountdown")}
                  value={formatMinutesUntil(nextRefreshAt, nowMs, t)}
                  detail={isFetching ? t("common.loading") : freshness.status === "overdue" ? freshnessDetail : undefined}
                  icon={<ClockCounterClockwise size={14} weight="bold" />}
                  tone={freshnessSignalTone(freshness.status)}
                />
              </div>
            </div>

            <InsightPanel insights={insights} />

            <div className="mt-4 hidden flex-wrap gap-x-4 gap-y-1 border-t border-zinc-200 pt-3 text-[11px] font-medium text-zinc-500 dark:border-white/[0.08] dark:text-zinc-400 sm:flex">
              <span>{t("consensus.opinionGeneratedAt")} {formatDateTime(generatedAt, locale)}</span>
              <span>{t("consensus.opinionInvalidatesAt")} {formatDateTime(opinion.invalidatesAt ?? data?.intervalEnd ?? null, locale)}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Signal({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly icon: ReactNode;
  readonly tone: SignalTone;
}) {
  return (
    <div className={`min-w-0 rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5 ${signalTone[tone]}`}>
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.08em] opacity-75 sm:gap-1.5 sm:text-[10px]">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 overflow-hidden break-keep text-xs font-bold leading-5 text-zinc-950 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] dark:text-white sm:mt-1 sm:text-sm" title={value}>
        {value}
      </p>
      {detail && <p className="mt-0.5 hidden truncate text-[10px] opacity-70 sm:block">{detail}</p>}
    </div>
  );
}

function InsightPanel({ insights }: { readonly insights: readonly CompactOpinionInsight[] }) {
  return (
    <div className="mt-3 min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.018] sm:mt-4 sm:px-3 sm:py-2.5">
      {insights.map((insight) => (
        <div key={insight.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 border-b border-zinc-200/70 py-1 last:border-b-0 dark:border-white/[0.05] sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:py-1.5">
          <p className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] ${insightTextTone(insight.tone)}`}>
            {insightIcon(insight.tone)}
            {insight.label}
          </p>
          <p className="truncate text-xs leading-5 text-zinc-700 dark:text-zinc-300" title={insight.item}>
            {insight.item}
          </p>
        </div>
      ))}
    </div>
  );
}

function localizedRiskLevel(value: string | undefined, t: (key: string) => string) {
  if (!value) return "-";
  const key = `consensus.riskLevel.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

function riskSignalTone(risk: string | undefined): SignalTone {
  if (risk === "HIGH") return "bad";
  if (risk === "NORMAL" || risk === "MEDIUM") return "warn";
  return "good";
}

function biasSignalTone(bias: string): SignalTone {
  if (bias === "LONG_BIASED") return "good";
  if (bias === "SHORT_BIASED") return "bad";
  if (bias === "RISK_OFF") return "warn";
  return "neutral";
}

function freshnessSignalTone(status: LeagueSentimentFreshnessStatus): SignalTone {
  if (status === "overdue") return "bad";
  if (status === "stale") return "warn";
  if (status === "cached") return "neutral";
  return "good";
}

function insightTextTone(tone: SignalTone) {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-300";
  if (tone === "bad") return "text-rose-600 dark:text-rose-300";
  if (tone === "warn") return "text-amber-600 dark:text-amber-300";
  return "text-sky-600 dark:text-sky-300";
}

function insightIcon(tone: SignalTone) {
  if (tone === "good") return <Info size={13} weight="bold" />;
  if (tone === "warn") return <Warning size={13} weight="bold" />;
  return <Gauge size={13} weight="bold" />;
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
  if (status === "overdue") return "border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400";
  if (status === "stale") return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  if (status === "cached") return "border-sky-500/25 bg-sky-500/10 text-sky-500 dark:text-sky-400";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400";
}
