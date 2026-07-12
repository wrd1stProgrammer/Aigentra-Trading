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

function feedDisplayState(feed: TraderStatusFeed) {
  return feed.displayState ?? feed.display_state ?? "archived";
}

function stateTone(state: string | null | undefined) {
  const key = String(state ?? "");
  if (key.includes("closed") || key.includes("rejected")) return "text-amber-600 dark:text-amber-300";
  if (key.includes("entry")) return "text-zinc-950 dark:text-zinc-200";
  return "text-zinc-900 dark:text-zinc-300";
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
  const displayState = feedDisplayState(feed);
  const time = feedCreatedAt(feed);
  return (
    <div data-testid="leaderboard-latest-status-feed" className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{t("leaderboard.latestStatusFeed")}</p>
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <StatusFeedDisplayBadge displayState={displayState} t={t} />
          {time ? <span className="font-mono text-[11px] text-zinc-500">{formatRelativeDateTime(time, locale, t)}</span> : null}
        </div>
      </div>
      {feedHeadline(feed) ? <p className={`mt-2 text-sm font-semibold ${stateTone(state)}`}>{feedHeadline(feed)}</p> : null}
      <p className="mt-1 break-keep text-sm leading-6 text-zinc-300">{feedMessage(feed)}</p>
    </div>
  );
}

export function StatusFeedThread({
  feeds,
  locale,
  t,
  isSubscribed = true,
  className = ""
}: {
  readonly feeds: readonly TraderStatusFeed[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly isSubscribed?: boolean;
  readonly className?: string;
}) {
  const items = feeds.slice(0, 8);
  return (
    <aside
      data-testid="trader-status-feed-thread"
      className={`min-w-0 flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-[#090d0b] dark:ring-white/10 ${className}`}
    >
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{t("detail.statusFeed")}</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{t("detail.statusFeedThread")}</h2>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {items.length ? (
          <div className="space-y-4">
            {items.map((feed, index) => {
              const isLocked = !isSubscribed && index > 0;
              if (isLocked) {
                return <LockedStatusFeedPreview key={`${feed.id ?? feedCreatedAt(feed) ?? index}-locked`} t={t} />;
              }

              const state = feedState(feed);
              const displayState = feedDisplayState(feed);
              const time = feedCreatedAt(feed);
              return (
                <article key={`${feed.id ?? time ?? index}`} data-testid="desk-note-thread-item" className="relative pl-0">
                  <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 shadow-sm shadow-zinc-950/[0.03] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-300 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/20 dark:hover:border-zinc-700">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                      <p className={`min-w-0 flex-1 basis-40 text-pretty text-sm font-semibold leading-5 ${stateTone(state)}`}>{feedHeadline(feed) || t("detail.statusFeed")}</p>
                      <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
                        <StatusFeedDisplayBadge displayState={displayState} t={t} />
                        {time ? <span className="font-mono text-[11px] tabular-nums text-zinc-500">{formatRelativeDateTime(time, locale, t)}</span> : null}
                      </div>
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

function StatusFeedDisplayBadge({
  displayState,
  t
}: {
  readonly displayState: "current" | "stale" | "archived";
  readonly t: Translator;
}) {
  const tone = {
    current: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    stale: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    archived: "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-400"
  }[displayState];
  return (
    <span
      data-testid="status-feed-display-state"
      className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-4 ${tone}`}
    >
      {t(`detail.statusFeedState.${displayState}`)}
    </span>
  );
}

function LockedStatusFeedPreview({ t }: { readonly t: Translator }) {
  return (
    <article data-testid="desk-note-thread-locked-preview" className="relative pl-0">
      <div className="rounded-[1.25rem] border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/20">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <p className="min-w-0 text-pretty text-sm font-semibold leading-5 text-zinc-900 dark:text-zinc-200">{t("access.reviewInlineLocked")}</p>
          <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-200">
            {t("access.lockedLabel")}
          </span>
        </div>
        <p className="mt-2 text-pretty text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("access.reviewLockedDescription")}</p>
        <div aria-hidden="true" className="mt-3 space-y-2">
          <div className="h-2.5 w-4/5 rounded-full bg-zinc-200/80 dark:bg-white/10" />
          <div className="h-2.5 w-2/3 rounded-full bg-zinc-200/70 dark:bg-white/[0.075]" />
        </div>
      </div>
    </article>
  );
}
