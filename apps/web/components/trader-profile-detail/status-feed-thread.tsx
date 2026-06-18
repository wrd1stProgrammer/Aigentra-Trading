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

function feedWatch(feed: TraderStatusFeed) {
  return feed.watch ?? feed.payload?.watch ?? "";
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
      <p className="mt-1 text-sm leading-6 text-zinc-300">{feedMessage(feed)}</p>
      {feedWatch(feed) ? <p className="mt-2 text-xs leading-5 text-zinc-500">{t("detail.statusFeedWatch")} · {feedWatch(feed)}</p> : null}
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
      className="min-h-[340px] min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
    >
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">{t("detail.statusFeed")}</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{t("detail.statusFeedThread")}</h2>
      </div>
      <div className="max-h-[426px] overflow-y-auto px-5 py-4">
        {items.length ? (
          <div className="relative space-y-5">
            <div className="absolute left-[5px] top-2 h-[calc(100%-1rem)] w-px bg-zinc-200 dark:bg-zinc-800" />
            {items.map((feed) => {
              const state = feedState(feed);
              const time = feedCreatedAt(feed);
              return (
                <article key={`${feed.id ?? feed.createdAt ?? feed.message}`} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 size-2.5 rounded-full bg-emerald-400 ring-4 ring-white dark:ring-zinc-950" />
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className={`min-w-0 truncate text-sm font-semibold ${stateTone(state)}`}>{feedHeadline(feed) || t("detail.statusFeed")}</p>
                    {time ? <span className="shrink-0 font-mono text-[11px] text-zinc-500">{formatRelativeDateTime(time, locale, t)}</span> : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{feedMessage(feed)}</p>
                  {feedWatch(feed) ? <p className="mt-2 text-xs leading-5 text-zinc-500">{t("detail.statusFeedWatch")} · {feedWatch(feed)}</p> : null}
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
