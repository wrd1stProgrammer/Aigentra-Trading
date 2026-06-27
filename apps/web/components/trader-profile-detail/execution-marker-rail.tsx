"use client";

import { Crosshair, TrendDown, TrendUp } from "@phosphor-icons/react";
import { buildExecutionMarkerCycles, type ExecutionMarker, type ExecutionMarkerCycle } from "@/components/trader-profile-detail/execution-markers";
import type { Locale } from "@/lib/i18n";
import type { Translator } from "@/components/trader-profile-detail/types";
import { ProtectedContentGate } from "@/components/access-gate";
import { isProtectedSourceUnlocked, protectedScenarioSourceKey, type SubscriberAccessState } from "@/components/use-subscriber-access";

export function ExecutionMarkerRail({
  markers,
  selectedId,
  onSelect,
  locale,
  t,
  accessState,
  traderId,
  symbol
}: {
  readonly markers: readonly ExecutionMarker[];
  readonly selectedId: string | null;
  readonly onSelect: (markerId: string) => void;
  readonly locale: Locale;
  readonly t: Translator;
  readonly accessState?: SubscriberAccessState;
  readonly traderId?: string;
  readonly symbol?: string;
}) {
  const cycles = buildExecutionMarkerCycles({ markers, locale, t });

  return (
    <section
      className="min-w-0 rounded-xl bg-white p-1 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
      aria-label={t("detail.executionMarkers")}
      data-testid="execution-marker-rail"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden shrink-0 items-center gap-1.5 px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 md:flex">
          <Crosshair size={14} />
          {t("detail.executionMarkers")}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 pr-1 scrollbar-none">
          {cycles.length ? (
            cycles.map((cycle, index) => {
              const sourceKey = traderId && symbol ? protectedScenarioSourceKey(traderId, symbol, cycle.id) : "";
              const isUnlocked = accessState ? isProtectedSourceUnlocked(accessState, sourceKey) : true;
              const isLocked = accessState && !accessState.isSubscribed && index > 0 && !isUnlocked;

              const chip = (
                <ExecutionMarkerChip
                  cycle={cycle}
                  selected={!isLocked && cycle.markers.some((marker) => marker.id === selectedId)}
                  onSelect={onSelect}
                  t={t}
                  isLocked={isLocked}
                />
              );

              if (isLocked && sourceKey) {
                return (
                  <ProtectedContentGate
                    key={cycle.id}
                    mode="coupon"
                    sourceKey={sourceKey}
                    sourceType="scenario"
                    traderId={traderId}
                    symbol={symbol}
                    onUnlocked={() => onSelect(cycle.representativeId)}
                    className="shrink-0"
                    iconOnly={true}
                  >
                    {chip}
                  </ProtectedContentGate>
                );
              }

              return (
                <div key={cycle.id} className="shrink-0">
                  {chip}
                </div>
              );
            })
          ) : (
            <div className="flex min-h-10 items-center px-3 text-xs font-medium text-zinc-400">
              {t("detail.noExecutionMarkers")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ExecutionMarkerChip({
  cycle,
  selected,
  onSelect,
  t,
  isLocked = false
}: {
  readonly cycle: ExecutionMarkerCycle;
  readonly selected: boolean;
  readonly onSelect: (markerId: string) => void;
  readonly t: Translator;
  readonly isLocked?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={isLocked}
      className={`focus-ring group flex h-11 min-w-[164px] shrink-0 items-center gap-2 rounded-lg border px-2.5 text-left transition ${
        isLocked
          ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
          : selected
            ? "border-emerald-400/60 bg-emerald-400/10 text-zinc-950 dark:text-zinc-50"
            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
      }`}
      onClick={() => !isLocked && onSelect(cycle.representativeId)}
      aria-pressed={selected}
      title={`${cycle.titleLabel} · ${cycle.priceSummaryLabel}`}
    >
      <span className={`grid size-7 shrink-0 place-items-center rounded-md ${isLocked ? "bg-zinc-300/30 text-zinc-400 dark:bg-zinc-800/30 dark:text-zinc-600" : iconToneClass(cycle)}`}>
        {cycle.sideLabel === "SHORT" || cycle.pnlTone === "bad" ? <TrendDown size={15} weight="bold" /> : <TrendUp size={15} weight="bold" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold leading-4">{cycle.titleLabel}</span>
        <span className="block truncate font-mono text-[10px] leading-3 text-zinc-400">
          {cycle.priceSummaryLabel}
          {cycle.pnlLabel ? ` · ${cycle.pnlLabel}` : ""}
        </span>
      </span>
      {selected ? <span className="ml-0.5 size-1.5 rounded-full bg-emerald-400" aria-label={t("detail.markerOnChart")} /> : null}
    </button>
  );
}

function iconToneClass(cycle: ExecutionMarkerCycle) {
  if (cycle.pnlTone === "bad" || cycle.sideLabel === "SHORT") return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
  if (cycle.pnlTone === "good" || cycle.sideLabel === "LONG") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}
