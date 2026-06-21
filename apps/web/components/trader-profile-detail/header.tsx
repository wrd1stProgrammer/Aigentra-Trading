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
    <header className="flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/85 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70 lg:flex-row lg:items-start lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
      <div className="flex min-w-0 items-start gap-4">
        <Link
          href="/leaderboard"
          className="focus-ring mt-1 grid size-9 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50 sm:mt-4 sm:size-10"
          onFocus={prefetchLeaderboard}
          onMouseEnter={prefetchLeaderboard}
          aria-label={t("leaderboard.viewArrow")}
        >
          <ArrowLeft size={22} />
        </Link>
        <div className={`mt-0.5 grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br ${visual.tone} font-mono text-lg font-bold text-white shadow-sm sm:mt-2 sm:size-16 sm:text-xl`}>
          {visual.initials}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">{localizedName}</h1>
            <span className="hidden text-lg font-semibold text-zinc-400 sm:inline">·</span>
            <span className="hidden text-sm font-semibold text-zinc-400 sm:inline">{localizedAlias}</span>
          </div>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500 sm:hidden">{localizedAlias}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">{formatCurrency(standing.equity, locale)}</span>
            <span className={`font-mono text-xl font-semibold sm:text-2xl ${standing.returnPct >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>
              {formatCurrency(standing.totalPnl, locale)} {formatPercent(standing.returnPct)}
            </span>
          </div>
          <p className="mt-3 line-clamp-2 max-w-3xl text-sm leading-6 text-zinc-600 sm:line-clamp-3 dark:text-zinc-300 lg:line-clamp-none">{localizedDescription}</p>
        </div>
      </div>
      <div className="grid w-full grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-1.5 ring-1 ring-zinc-200 dark:bg-zinc-900/70 dark:ring-zinc-800 lg:w-auto lg:rounded-2xl lg:bg-white lg:p-2 dark:lg:bg-zinc-950">
        <MiniHeroStat label={t("leaderboard.rankScore")} value={formatNumber(standing.rankScore, 2, locale)} />
        <MiniHeroStat label={t("common.return7d")} value={formatPercent(standing.monthlyReturn)} tone={standing.monthlyReturn >= 0 ? "good" : "bad"} />
        <MiniHeroStat label={t("common.winRate")} value={standing.winRate === null ? "-" : formatPercent(standing.winRate)} />
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
