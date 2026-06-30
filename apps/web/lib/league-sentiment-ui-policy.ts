import type { LeagueSentimentOpinionResponse } from "@/lib/api";

export type LeagueSentimentFreshnessStatus = "fresh" | "cached" | "stale" | "overdue";

export type LeagueSentimentFreshnessView = {
  status: LeagueSentimentFreshnessStatus;
  labelKey: string;
  detailKey: string;
  overdueMinutes: number;
};

export function leagueSentimentFreshnessView(
  data: Pick<LeagueSentimentOpinionResponse, "cacheHit" | "stale" | "nextRefreshAt"> | undefined,
  nowMs: number,
): LeagueSentimentFreshnessView {
  const overdueMinutes = refreshOverdueMinutes(data?.nextRefreshAt ?? null, nowMs);
  if (data?.stale && overdueMinutes > 0) {
    return {
      status: "overdue",
      labelKey: "consensus.freshness.overdue",
      detailKey: "consensus.freshness.overdueDetail",
      overdueMinutes,
    };
  }
  if (data?.stale) {
    return {
      status: "stale",
      labelKey: "consensus.freshness.stale",
      detailKey: "consensus.freshness.staleDetail",
      overdueMinutes: 0,
    };
  }
  if (data?.cacheHit) {
    return {
      status: "cached",
      labelKey: "consensus.freshness.cached",
      detailKey: "consensus.freshness.cachedDetail",
      overdueMinutes: 0,
    };
  }
  return {
    status: "fresh",
    labelKey: "consensus.freshness.fresh",
    detailKey: "consensus.freshness.freshDetail",
    overdueMinutes: 0,
  };
}

export function refreshCountdownLabel(
  nextRefreshAt: string | null | undefined,
  nowMs: number,
  t: (key: string) => string,
) {
  if (!nextRefreshAt) return "-";
  const target = new Date(nextRefreshAt).getTime();
  if (!Number.isFinite(target)) return "-";
  const deltaMinutes = Math.ceil((target - nowMs) / 60_000);
  if (deltaMinutes < 0) {
    return t("consensus.minutesOverdue").replace("{minutes}", String(Math.abs(deltaMinutes)));
  }
  if (deltaMinutes === 0) return t("consensus.opinionGeneratingNow");
  return t("consensus.minutesRemaining").replace("{minutes}", String(deltaMinutes));
}

export type LeagueSentimentSourceGroup = {
  key: "activeExposure" | "pendingOrders" | "recentOutcomes" | "aiReviews";
  labelKey: string;
  value: number;
  detail: string;
};

export function leagueSentimentSourceGroups(sourceCounts: Record<string, number> | undefined): LeagueSentimentSourceGroup[] {
  const counts = sourceCounts ?? {};
  return [
    {
      key: "activeExposure",
      labelKey: "consensus.sourceGroup.activeExposure",
      value: numberCount(counts.activePositions),
      detail: `LONG ${numberCount(counts.activeLongPositions)} / SHORT ${numberCount(counts.activeShortPositions)}`,
    },
    {
      key: "pendingOrders",
      labelKey: "consensus.sourceGroup.pendingOrders",
      value: numberCount(counts.pendingOrders),
      detail: `LONG ${numberCount(counts.pendingLongOrders)} / SHORT ${numberCount(counts.pendingShortOrders)}`,
    },
    {
      key: "recentOutcomes",
      labelKey: "consensus.sourceGroup.recentOutcomes",
      value: numberCount(counts.recentClosedPositions) + numberCount(counts.recentTradeEvents),
      detail: `TP ${numberCount(counts.recentTakeProfits)} / SL ${numberCount(counts.recentStopLosses)}`,
    },
    {
      key: "aiReviews",
      labelKey: "consensus.sourceGroup.aiReviews",
      value: numberCount(counts.recentEntryReviews) + numberCount(counts.recentManagementReviews),
      detail: `Entry ${numberCount(counts.recentEntryReviews)} / Mgmt ${numberCount(counts.recentManagementReviews)}`,
    },
  ];
}

export function dataAgeLabel(minutes: number | null | undefined, t: (key: string) => string) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return "-";
  if (minutes < 60) return t("consensus.minutesAgo").replace("{minutes}", String(Math.round(minutes)));
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return t("consensus.hoursMinutesAgo").replace("{hours}", String(hours)).replace("{minutes}", String(remainder));
}

function refreshOverdueMinutes(nextRefreshAt: string | null, nowMs: number) {
  if (!nextRefreshAt) return 0;
  const target = new Date(nextRefreshAt).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.floor((nowMs - target) / 60_000));
}

function numberCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
