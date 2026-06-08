"use client";

import { formatCurrency } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { MonthlyPnlCalendar, PnlCalendarDay } from "@/components/trader-profile-detail/pnl-calendar";
import type { Translator } from "@/components/trader-profile-detail/types";

export function PnlCalendarPanel({ calendar, locale, t }: { calendar: MonthlyPnlCalendar; locale: Locale; t: Translator }) {
  const assetTone = calendar.assetChange.delta > 0 ? "good" : calendar.assetChange.delta < 0 ? "bad" : "neutral";
  return (
    <section data-testid="pnl-calendar-panel" className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("calendar.pnlTitle")}</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("calendar.pnlSubtitle")}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-sm font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          {calendar.monthLabel}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {weekdayLabels(locale).map((label) => (
          <div key={label} className="pb-1 text-center text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
            {label}
          </div>
        ))}
        {calendar.weeks.flatMap((week, weekIndex) =>
          week.map((day, dayIndex) => (
            <div key={`${weekIndex}-${dayIndex}`} className={day ? dayCellClass(day) : "min-h-14 rounded-xl bg-transparent"} title={day ? `${day.dateKey} ${day.pnlText}` : undefined}>
              {day ? (
                <>
                  <span className="font-mono text-base font-semibold leading-none">{day.day}</span>
                  <span className="mt-1 font-mono text-[11px] font-semibold leading-none">{day.pnlText}</span>
                </>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="mt-5 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-100 dark:bg-zinc-900/55 dark:ring-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">{t("calendar.assetChange")}</p>
            <p className={`mt-1 font-mono text-xl font-bold ${assetToneClass(assetTone)}`}>{calendar.assetChange.deltaText}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">{t("calendar.monthlyReturn")}</p>
            <p className={`mt-1 font-mono text-xl font-bold ${assetToneClass(assetTone)}`}>{calendar.assetChange.returnText}</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className={`h-full rounded-full ${assetTone === "bad" ? "bg-rose-500" : assetTone === "good" ? "bg-emerald-500" : "bg-zinc-400"}`} style={{ width: `${assetBarWidth(calendar.assetChange.returnPct)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Metric label={t("calendar.startEquity")} value={formatCurrency(calendar.assetChange.start, locale)} />
          <Metric label={t("calendar.currentEquity")} value={formatCurrency(calendar.assetChange.current, locale)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-100 dark:bg-zinc-950 dark:ring-zinc-800">
      <p className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function dayCellClass(day: PnlCalendarDay) {
  const base = "flex min-h-14 flex-col items-center justify-center rounded-xl ring-1 transition";
  if (day.tone === "good") return `${base} bg-emerald-500/12 text-emerald-700 ring-emerald-500/10 dark:bg-emerald-400/16 dark:text-emerald-300 dark:ring-emerald-400/10`;
  if (day.tone === "bad") return `${base} bg-rose-500/12 text-rose-700 ring-rose-500/10 dark:bg-rose-400/16 dark:text-rose-300 dark:ring-rose-400/10`;
  return `${base} bg-zinc-100/80 text-zinc-500 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800`;
}

function assetToneClass(tone: "good" | "bad" | "neutral") {
  if (tone === "good") return "text-emerald-700 dark:text-emerald-300";
  if (tone === "bad") return "text-rose-700 dark:text-rose-300";
  return "text-zinc-700 dark:text-zinc-300";
}

function assetBarWidth(returnPct: number) {
  return Math.min(100, Math.max(8, Math.abs(returnPct) * 3 + 10));
}

function weekdayLabels(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { weekday: "narrow", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(Date.UTC(2026, 5, 7 + index))));
}
