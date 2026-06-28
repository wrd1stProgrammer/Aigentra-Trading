"use client";

import { CaretRight, Clock } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { movementToneClass } from "@/components/trader-profile-detail/data";
import { importanceBadge } from "@/components/trader-profile-detail/scenario-copy";
import type { TimelineItem } from "@/components/trader-profile-detail/types";

export function TimelineRow({ item, index, onClick }: { item: TimelineItem; index: number; onClick?: () => void }) {
  const { t } = useAppContext();
  const importance = importanceBadge(item.importance, t);
  const content = (
    <>
      <div className="relative z-[1] mt-1 hidden size-5 place-items-center rounded-full bg-white dark:bg-zinc-950 sm:grid sm:size-7">
        <span className={`${index === 0 ? "bg-red-500" : "bg-zinc-300 dark:bg-zinc-700"} size-3 rounded-full`} />
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:mb-4 sm:text-sm">
          <Clock size={16} />
          <span>{item.time}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_24px] sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="truncate text-base font-semibold text-zinc-950 dark:text-zinc-50">{item.title}</h3>
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold leading-none ring-1 ${importance.className}`}>
                <span className={`size-1.5 rounded-full ${importance.dotClassName}`} />
                {importance.label}
              </span>
              <span className={`font-mono text-sm font-semibold ${movementToneClass(item.movementTone)}`}>{item.movement}</span>
              <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.priceLabel}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.body}</p>
          </div>
          <CaretRight className="text-zinc-400" size={20} />
        </div>
      </div>
    </>
  );

  if (!onClick) return <div className="grid grid-cols-1 gap-3 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-5 border-b border-zinc-100 dark:border-zinc-900 pb-5 last:border-0 last:pb-0 sm:border-0 sm:pb-0">{content}</div>;
  return (
    <button type="button" onClick={onClick} className="grid w-full grid-cols-1 gap-3 rounded-xl text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/70 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-5 border-b border-zinc-100 dark:border-zinc-900 pb-5 last:border-0 last:pb-0 sm:border-0 sm:pb-0">
      {content}
    </button>
  );
}
