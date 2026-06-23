"use client";

import type { TraderStatusFeed } from "@/lib/api";
import { formatRelativeDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Translator } from "@/components/trader-profile-detail/types";

function feedCreatedAt(feed: TraderStatusFeed) {
  return feed.createdAt ?? feed.created_at ?? null;
}

function feedHeadline(feed: TraderStatusFeed) {
  return feed.headline ?? feed.payload?.headline ?? "";
}

function feedMessage(feed: TraderStatusFeed) {
  return feed.message ?? feed.payload?.message ?? "";
}

function feedState(feed: TraderStatusFeed) {
  return feed.stateKey ?? feed.state_key ?? "";
}

function stateTone(state: string | null | undefined) {
  const key = String(state ?? "");
  if (key.includes("closed") || key.includes("rejected")) return "text-amber-300";
  if (key.includes("entry")) return "text-emerald-300";
  return "text-zinc-300";
}

export function LatestStatusFeedNote({
  feed,
  locale,
  t
}: {
  readonly feed?: TraderStatusFeed | null;
  readonly locale: Locale;
  readonly t: Translator;
}) {
  if (!feed) {
    return (
      <div data-testid="leaderboard-latest-status-feed" className="mt-4 border-t border-white/10 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{t("leaderboard.latestStatusFeed")}</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{t("leaderboard.noStatusFeed")}</p>
      </div>
    );
  }

  const state = feedState(feed);
  const time = feedCreatedAt(feed);
  return (
    <div data-testid="leaderboard-latest-status-feed" className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-400">{t("leaderboard.latestStatusFeed")}</p>
        {time ? <span className="font-mono text-[11px] text-zinc-500">{formatRelativeDateTime(time, locale, t)}</span> : null}
      </div>
      {feedHeadline(feed) ? <p className={`mt-2 text-sm font-semibold ${stateTone(state)}`}>{feedHeadline(feed)}</p> : null}
      <p className="mt-1 break-keep text-sm leading-6 text-zinc-300">{feedMessage(feed)}</p>
    </div>
  );
}

export function StatusFeedThread({
  feeds,
  locale,
  t
}: {
  readonly feeds: readonly TraderStatusFeed[];
  readonly locale: Locale;
  readonly t: Translator;
}) {
  const items = feeds.slice(0, 8);
  return (
    <aside
      data-testid="trader-status-feed-thread"
      className="min-h-[340px] min-w-0 self-start overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-[#090d0b] dark:ring-white/10"
    >
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">{t("detail.statusFeed")}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{t("detail.statusFeedThread")}</h2>
          </div>
          <span className="inline-flex size-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)]" />
        </div>
      </div>
      <div className="max-h-[426px] overflow-y-auto px-5 py-4">
        {items.length ? (
          <div className="relative space-y-4">
            <div className="absolute left-[7px] top-3 h-[calc(100%-1.5rem)] w-px bg-zinc-200 dark:bg-white/10" />
            {items.map((feed) => {
              const state = feedState(feed);
              const time = feedCreatedAt(feed);
              return (
                <article key={`${feed.id ?? feed.createdAt ?? feed.message}`} data-testid="desk-note-thread-item" className="relative pl-6">
                  <span className="absolute left-0 top-4 size-3.5 rounded-full border-2 border-white bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.10)] dark:border-[#090d0b]" />
                  <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 shadow-sm shadow-zinc-950/[0.03] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-emerald-500/30 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/20">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <p className={`min-w-0 text-pretty text-sm font-semibold leading-5 ${stateTone(state)}`}>{feedHeadline(feed) || t("detail.statusFeed")}</p>
                      {time ? <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-zinc-500">{formatRelativeDateTime(time, locale, t)}</span> : null}
                    </div>
                    <p className="mt-2 break-keep text-pretty text-sm leading-6 text-zinc-600 dark:text-zinc-300">{feedMessage(feed)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center text-center text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            {t("detail.noStatusFeed")}
          </div>
        )}
      </div>
    </aside>
  );
}
