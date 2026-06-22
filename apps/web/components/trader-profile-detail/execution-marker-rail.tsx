"use client";

import { Crosshair, TrendDown, TrendUp } from "@phosphor-icons/react";
import type { ExecutionMarker } from "@/components/trader-profile-detail/execution-markers";
import type { Translator } from "@/components/trader-profile-detail/types";

export function ExecutionMarkerRail({
  markers,
  selectedId,
  onSelect,
  t
}: {
  markers: readonly ExecutionMarker[];
  selectedId: string | null;
  onSelect: (markerId: string) => void;
  t: Translator;
}) {
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
          {markers.length ? (
            markers.map((marker) => (
              <ExecutionMarkerChip
                key={marker.id}
                marker={marker}
                selected={marker.id === selectedId}
                onSelect={onSelect}
                t={t}
              />
            ))
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
  marker,
  selected,
  onSelect,
  t
}: {
  marker: ExecutionMarker;
  selected: boolean;
  onSelect: (markerId: string) => void;
  t: Translator;
}) {
  return (
    <button
      type="button"
      className={`focus-ring group flex h-10 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-left transition ${
        selected
          ? "border-emerald-400/60 bg-emerald-400/10 text-zinc-950 dark:text-zinc-50"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
      }`}
      onClick={() => onSelect(marker.id)}
      aria-pressed={selected}
      title={`${marker.markerLabel} · ${marker.eventTimeLabel}`}
    >
      <span className={`grid size-6 shrink-0 place-items-center rounded-md ${iconToneClass(marker)}`}>
        {marker.tone === "lossExit" || marker.tone === "shortEntry" ? <TrendDown size={14} weight="bold" /> : <TrendUp size={14} weight="bold" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold leading-4">{marker.markerLabel}</span>
        <span className="block truncate font-mono text-[10px] leading-3 text-zinc-400">
          {marker.priceLabel}
          {marker.pnlLabel ? ` · ${marker.pnlLabel}` : ""}
        </span>
      </span>
      {selected ? <span className="ml-0.5 size-1.5 rounded-full bg-emerald-400" aria-label={t("detail.markerOnChart")} /> : null}
    </button>
  );
}

function iconToneClass(marker: ExecutionMarker) {
  if (marker.tone === "longEntry" || marker.tone === "profitExit") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  if (marker.tone === "shortEntry" || marker.tone === "lossExit") return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
  return "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}
