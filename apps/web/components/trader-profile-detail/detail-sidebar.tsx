"use client";

import type { ManagementReview } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TraderStanding } from "@/lib/league";
import type { MonthlyPnlCalendar } from "@/components/trader-profile-detail/pnl-calendar";
import { PnlCalendarPanel } from "@/components/trader-profile-detail/pnl-calendar-panel";
import { AgentStatusPanel, HoldingPanel, TradeHistoryPanel } from "@/components/trader-profile-detail/side-panels";
import type { HoldingItem, PlanView, TradeHistoryItem, Translator } from "@/components/trader-profile-detail/types";

export function DetailSidebar({
  holdingItems,
  tradeHistoryItems,
  pnlCalendar,
  standing,
  latestReview,
  latestPlan,
  locale,
  t,
  onLoadMoreEvents,
  historyHasMore = false,
  loadingMoreHistory = false
}: {
  readonly holdingItems: HoldingItem[];
  readonly tradeHistoryItems: TradeHistoryItem[];
  readonly pnlCalendar: MonthlyPnlCalendar;
  readonly standing: TraderStanding;
  readonly latestReview?: ManagementReview;
  readonly latestPlan: PlanView;
  readonly locale: Locale;
  readonly t: Translator;
  readonly onLoadMoreEvents?: () => void;
  readonly historyHasMore?: boolean;
  readonly loadingMoreHistory?: boolean;
}) {
  return (
    <aside className="min-w-0 space-y-5">
      <HoldingPanel
        items={holdingItems}
        asOf={formatDateTime(standing.summary?.updatedAt ?? latestPlan.createdAt, locale)}
        t={t}
      />
      <TradeHistoryPanel
        items={tradeHistoryItems}
        t={t}
        onLoadMore={onLoadMoreEvents}
        hasMore={historyHasMore}
        loadingMore={loadingMoreHistory}
      />
      <PnlCalendarPanel calendar={pnlCalendar} locale={locale} t={t} />
      <AgentStatusPanel
        standing={standing}
        latestReview={latestReview}
        latestPlan={latestPlan}
        locale={locale}
        t={t}
      />
    </aside>
  );
}
