"use client";

import { formatNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

type Translator = (key: string) => string;

export type ConsensusAverageSide = {
  readonly entry: number | null;
  readonly tp: number | null;
  readonly sl: number | null;
};

type ConsensusAveragePricesProps = {
  readonly averages: {
    readonly long: ConsensusAverageSide;
    readonly short: ConsensusAverageSide;
  };
  readonly locale: Locale;
  readonly t: Translator;
};

export function ConsensusAveragePrices({ averages, locale, t }: ConsensusAveragePricesProps) {
  return (
    <>
      <div className="mt-5 grid gap-3 sm:hidden" data-testid="consensus-average-mobile-cards">
        <AveragePriceCard
          label={t("consensus.longTraders")}
          tone="long"
          values={averages.long}
          locale={locale}
          t={t}
        />
        <AveragePriceCard
          label={t("consensus.shortTraders")}
          tone="short"
          values={averages.short}
          locale={locale}
          t={t}
        />
      </div>

      <div className="mt-5 hidden sm:block">
        <table className="w-full table-fixed text-left border-collapse">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[26%]" />
            <col className="w-[25%]" />
            <col className="w-[25%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-200 text-[10px] text-zinc-500 font-bold uppercase font-mono dark:border-white/[0.08]">
              <th className="py-2">{t("common.side")}</th>
              <th className="py-2 text-right">{t("consensus.avgEntryPrice")}</th>
              <th className="py-2 text-right">{t("consensus.avgTakeProfit")}</th>
              <th className="py-2 text-right">{t("consensus.avgStopLoss")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-xs font-mono dark:divide-white/[0.04]">
            <AveragePriceRow label={t("consensus.longTraders")} tone="long" values={averages.long} locale={locale} />
            <AveragePriceRow label={t("consensus.shortTraders")} tone="short" values={averages.short} locale={locale} />
          </tbody>
        </table>
      </div>
    </>
  );
}

function AveragePriceCard({
  label,
  tone,
  values,
  locale,
  t
}: {
  readonly label: string;
  readonly tone: "long" | "short";
  readonly values: ConsensusAverageSide;
  readonly locale: Locale;
  readonly t: Translator;
}) {
  const toneClass = tone === "long" ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.025]">
      <div className={`text-sm font-semibold ${toneClass}`}>{label}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <AverageMetric label={t("consensus.avgEntryPrice")} value={values.entry} locale={locale} />
        <AverageMetric label={t("consensus.avgTakeProfit")} value={values.tp} locale={locale} />
        <AverageMetric label={t("consensus.avgStopLoss")} value={values.sl} locale={locale} />
      </div>
    </div>
  );
}

function AverageMetric({ label, value, locale }: { readonly label: string; readonly value: number | null; readonly locale: Locale }) {
  return (
    <div className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-zinc-100 dark:bg-black/20 dark:ring-0">
      <div className="truncate text-[10px] font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 truncate font-mono font-semibold text-zinc-950 dark:text-zinc-100">{formatPrice(value, locale)}</div>
    </div>
  );
}

function AveragePriceRow({
  label,
  tone,
  values,
  locale
}: {
  readonly label: string;
  readonly tone: "long" | "short";
  readonly values: ConsensusAverageSide;
  readonly locale: Locale;
}) {
  const toneClass = tone === "long" ? "text-emerald-400" : "text-rose-400";
  return (
    <tr className={`${toneClass} font-semibold`}>
      <td className="py-3.5 font-sans">{label}</td>
      <td className="py-3.5 text-right">{formatPrice(values.entry, locale)}</td>
      <td className="py-3.5 text-right">{formatPrice(values.tp, locale)}</td>
      <td className="py-3.5 text-right">{formatPrice(values.sl, locale)}</td>
    </tr>
  );
}

function formatPrice(value: number | null, locale: Locale) {
  return value ? `$${formatNumber(value, 0, locale)}` : "-";
}
