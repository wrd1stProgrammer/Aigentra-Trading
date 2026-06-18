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

      <div className="mt-5 hidden overflow-x-auto sm:block">
        <table className="min-w-[520px] w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] text-[10px] text-zinc-500 font-bold uppercase font-mono">
              <th className="py-2">{locale === "ko" ? "관점" : "Side"}</th>
              <th className="py-2 text-right">{t("consensus.avgEntryPrice")}</th>
              <th className="py-2 text-right">{t("consensus.avgTakeProfit")}</th>
              <th className="py-2 text-right">{t("consensus.avgStopLoss")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-xs font-mono">
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
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
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
    <div className="min-w-0 rounded-lg bg-black/20 p-2">
      <div className="truncate text-[10px] font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 truncate font-mono font-semibold text-zinc-100">{formatPrice(value, locale)}</div>
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
