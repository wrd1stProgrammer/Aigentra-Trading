"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import type { TraderProfile } from "@/lib/api";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TraderStanding } from "@/lib/league";
import { traderAliasKey, traderDetailKey, traderNameKey } from "@/lib/traders";
import { movementToneClass } from "@/components/trader-profile-detail/data";
import type { Translator, VisualProfile } from "@/components/trader-profile-detail/types";

export function HeroHeader({
  trader,
  standing,
  visual,
  locale,
  t,
  prefetchLeaderboard
}: {
  trader: TraderProfile;
  standing: TraderStanding;
  visual: VisualProfile;
  locale: Locale;
  t: Translator;
  prefetchLeaderboard: () => void;
}) {
  const localizedName = translatedOrFallback(t, traderNameKey(trader.id), trader.name);
  const localizedAlias = translatedOrFallback(t, traderAliasKey(trader.id), visual.alias);
  const localizedDescription = translatedOrFallback(t, traderDetailKey(trader.id), trader.concept ?? trader.description);

  return (
    <header className="w-full">
      {/* Mobile Layout */}
      <div className="lg:hidden flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/85 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="flex items-center gap-3">
          <div className={`grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br ${visual.tone} font-mono text-base font-bold text-white border border-white/10 shadow-md`}>
            {visual.initials}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">{localizedName}</h1>
            <p className="text-[11px] font-semibold text-zinc-500 mt-0.5 leading-none">{localizedAlias}</p>
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-1.5">
          <span className="font-mono text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            {formatCurrency(standing.equity, locale)}
          </span>
          <div>
            <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 font-mono text-sm font-bold ring-1 ${
              standing.returnPct >= 0
                ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20 dark:bg-emerald-500/12 dark:text-emerald-400 dark:ring-emerald-500/30"
                : "bg-rose-500/10 text-rose-500 ring-rose-500/20 dark:bg-rose-500/12 dark:text-rose-400 dark:ring-rose-500/30"
            }`}>
              {formatCurrency(standing.totalPnl, locale)} {formatPercent(standing.returnPct)}
            </span>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 mt-1">
          {localizedDescription}
        </p>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-1.5 ring-1 ring-zinc-200 dark:bg-zinc-900/70 dark:ring-zinc-800 mt-2">
          <MiniHeroStat label={t("leaderboard.rankScore")} value={formatNumber(standing.rankScore, 2, locale)} />
          <MiniHeroStat label={t("common.return7d")} value={formatPercent(standing.monthlyReturn)} tone={standing.monthlyReturn >= 0 ? "good" : "bad"} />
          <MiniHeroStat label={t("common.winRate")} value={standing.winRate === null ? "-" : formatPercent(standing.winRate)} />
        </div>
      </div>

      {/* Desktop / Tablet view: keeps original code structure for rigid test cases */}
      <div className="hidden lg:flex w-full items-start justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`mt-2 grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br ${visual.tone} font-mono text-xl font-bold text-white border border-white/10 shadow-md`}>
            {visual.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{localizedName}</h1>
              <span className="hidden text-lg font-semibold text-zinc-400 sm:inline">·</span>
              <span className="hidden text-sm font-semibold text-zinc-400 sm:inline">{localizedAlias}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">{formatCurrency(standing.equity, locale)}</span>
              <span className={`font-mono text-xl font-semibold sm:text-2xl ${standing.returnPct >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
                {formatCurrency(standing.totalPnl, locale)} {formatPercent(standing.returnPct)}
              </span>
            </div>
            <p className="mt-3.5 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{localizedDescription}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 dark:bg-zinc-950 ring-1 ring-zinc-200 dark:ring-zinc-800">
          <MiniHeroStat label={t("leaderboard.rankScore")} value={formatNumber(standing.rankScore, 2, locale)} />
          <MiniHeroStat label={t("common.return7d")} value={formatPercent(standing.monthlyReturn)} tone={standing.monthlyReturn >= 0 ? "good" : "bad"} />
          <MiniHeroStat label={t("common.winRate")} value={standing.winRate === null ? "-" : formatPercent(standing.winRate)} />
        </div>
      </div>
    </header>
  );
}

function translatedOrFallback(t: Translator, key: string, fallback: string) {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function TabButton({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`focus-ring rounded-lg px-5 py-3 text-sm font-semibold transition ${
        active
          ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      }`}
    >
      {label}
    </button>
  );
}

function MiniHeroStat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2 sm:rounded-xl sm:px-4 sm:py-3 dark:bg-zinc-950/80 lg:bg-zinc-50 dark:lg:bg-zinc-900">
      <p className="truncate text-[11px] font-semibold text-zinc-400 sm:text-xs">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold ${tone ? movementToneClass(tone) : "text-zinc-950 dark:text-zinc-50"}`}>{value}</p>
    </div>
  );
}
