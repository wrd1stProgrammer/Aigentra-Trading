"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  leaderboardBundleQueryKey,
  getCachedTraderDetailBundle,
  getEquitySnapshots,
  prefetchLeaderboardBundle,
  prefetchTraderDetailBundle,
  traderDetailBundleQueryOptions,
  type LeaderboardBundle,
  type TraderDetailBundle,
  type TraderProfile
} from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { buildScenarios, buildStandings, type LeagueSymbol, type TraderScenario } from "@/lib/league";
import { fallbackTraders } from "@/lib/traders";
import { buildScenarioTimelineItems, buildTradeHistoryItems } from "@/components/trader-profile-detail/data";
import { buildHoldingItems } from "@/components/trader-profile-detail/holdings";
import { nextLiveDetailAlert, type LiveDetailAlert } from "@/components/trader-profile-detail/live-alerts";
import { accountStartingEquity, buildMonthlyPnlCalendar, normalizeEquitySnapshots } from "@/components/trader-profile-detail/pnl-calendar";
import { normalizePlan } from "@/components/trader-profile-detail/plan";
import {
  DetailChart,
  DetailSidebar,
  HeroHeader,
  ScenarioModal,
  TabButton,
  TimelineRow,
  TradingJournal
} from "@/components/trader-profile-detail/panels";
import { SYMBOLS } from "@/components/trader-profile-detail/types";
import { traderVisuals } from "@/lib/league";

export function TraderProfilePageClient({ traderId }: { traderId: string }) {
  const { locale, t } = useAppContext();
  const queryClient = useQueryClient();
  const fallback = useMemo(
    () => fallbackTraders.find((item) => item.id === traderId) as unknown as TraderProfile | undefined,
    [traderId]
  );
  const [symbol, setSymbol] = useState<LeagueSymbol>("BTCUSDT");
  const [selectedScenario, setSelectedScenario] = useState<TraderScenario | null>(null);
  const [liveAlert, setLiveAlert] = useState<LiveDetailAlert | null>(null);
  const liveAlertKeyRef = useRef<string | null>(null);
  const liveAlertHydratedRef = useRef(false);
  const liveAlertContextRef = useRef<string | null>(null);

  const fallbackDetailBundle = useMemo<TraderDetailBundle | undefined>(() => {
    const leaderboardBundle = queryClient.getQueryData<LeaderboardBundle>(leaderboardBundleQueryKey(symbol));
    const traderFromLeaderboard = leaderboardBundle?.traders?.find((item) => item.id === traderId);
    const trader = traderFromLeaderboard ?? fallback;
    if (!trader) return undefined;
    return {
      symbol,
      trader,
      summaries: leaderboardBundle?.summaries ?? [],
      positions: (leaderboardBundle?.positions ?? []).filter((item) => item.traderId === traderId),
      closedPositions: [],
      orders: (leaderboardBundle?.orders ?? []).filter((item) => item.traderId === traderId),
      managementReviews: (leaderboardBundle?.managementReviews ?? []).filter((item) => item.traderId === traderId),
      events: [],
      tradePlans: []
    };
  }, [fallback, queryClient, symbol, traderId]);

  const detailQuery = useQuery({
    ...traderDetailBundleQueryOptions(traderId, symbol),
    placeholderData: (previousData, previousQuery) => {
      const queryKey = previousQuery?.queryKey;
      if (
        queryKey?.[0] === "league" &&
        queryKey?.[1] === "trader" &&
        queryKey?.[2] === traderId &&
        queryKey?.[3] === symbol
      ) {
        return previousData;
      }
      return getCachedTraderDetailBundle(traderId, symbol) ?? fallbackDetailBundle;
    }
  });
  const equitySnapshotsQuery = useQuery({
    queryKey: ["paper", "equity-snapshots", traderId, symbol],
    queryFn: () => getEquitySnapshots(45, traderId, symbol),
    placeholderData: (previousData) => previousData,
    staleTime: 60_000
  });

  const { trader, summaries, positions, closedPositions, orders, reviews, events, plans } = useMemo(() => {
    const bundle = detailQuery.data;
    return {
      trader: bundle?.trader ?? fallback,
      summaries: bundle?.summaries ?? [],
      positions: bundle?.positions ?? [],
      closedPositions: bundle?.closedPositions ?? [],
      orders: bundle?.orders ?? [],
      reviews: bundle?.managementReviews ?? [],
      events: bundle?.events ?? [],
      plans: bundle?.tradePlans ?? []
    };
  }, [detailQuery.data, fallback]);

  const loading = detailQuery.isPending && !detailQuery.data;
  const error = detailQuery.error ? (detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)) : null;

  const prefetchSymbol = useCallback((nextSymbol: LeagueSymbol) => {
    void prefetchTraderDetailBundle(queryClient, traderId, nextSymbol);
  }, [queryClient, traderId]);

  const prefetchLeaderboard = useCallback(() => {
    void prefetchLeaderboardBundle(queryClient, symbol);
  }, [queryClient, symbol]);

  const standing = useMemo(() => {
    const standings = buildStandings(trader ? [trader] : (fallbackTraders as unknown as TraderProfile[]), summaries);
    return standings.find((item) => item.id === traderId) ?? standings[0];
  }, [summaries, trader, traderId]);

  const scenarios = useMemo(() => {
    if (!trader) return [];
    return buildScenarios({ trader, positions, orders, reviews, events });
  }, [events, orders, positions, reviews, trader]);

  const latestReview = reviews[0];
  const visual = traderVisuals[traderId] ?? traderVisuals["channel-rider"];
  const latestPlan = useMemo(() => normalizePlan(plans[0]), [plans]);
  const chartResult = useMemo(() => ({ tradePlan: latestPlan }), [latestPlan]);
  const scenarioTimelineItems = useMemo(
    () => buildScenarioTimelineItems({ scenarios, events, latestPlan, reviews, locale, t }),
    [events, latestPlan, locale, reviews, scenarios, t]
  );
  const holdingItems = useMemo(
    () => buildHoldingItems({ standing, positions, orders, latestPlan, symbol, locale, t }),
    [latestPlan, locale, orders, positions, standing, symbol, t]
  );
  const tradeHistoryItems = useMemo(
    () => buildTradeHistoryItems({ events, closedPositions, reviews, plans, symbol, locale, t }),
    [closedPositions, events, locale, plans, reviews, symbol, t]
  );
  const pnlCalendar = useMemo(
    () => buildMonthlyPnlCalendar({
      locale,
      startingEquity: accountStartingEquity(standing?.equity, standing?.totalPnl),
      snapshots: normalizeEquitySnapshots(equitySnapshotsQuery.data),
      events
    }),
    [equitySnapshotsQuery.data, events, locale, standing?.equity, standing?.totalPnl]
  );
  const timelineRail = scenarioTimelineItems.length > 0;
  const alertContextKey = `${traderId}:${symbol}`;

  useEffect(() => {
    const latestItem = scenarioTimelineItems[0];
    if (liveAlertContextRef.current !== alertContextKey) {
      liveAlertContextRef.current = alertContextKey;
      liveAlertKeyRef.current = latestItem?.id ?? null;
      liveAlertHydratedRef.current = Boolean(latestItem);
      setLiveAlert(null);
      return;
    }

    const next = nextLiveDetailAlert({
      previousKey: liveAlertKeyRef.current,
      item: latestItem,
      hydrated: liveAlertHydratedRef.current,
      t
    });
    liveAlertKeyRef.current = next.nextKey;
    liveAlertHydratedRef.current = Boolean(next.nextKey);
    if (next.alert) setLiveAlert(next.alert);
  }, [alertContextKey, scenarioTimelineItems, t]);

  const openLiveAlert = useCallback(() => {
    const scenario = liveAlert?.item.scenario;
    if (scenario) setSelectedScenario(scenario);
    setLiveAlert(null);
  }, [liveAlert]);

  if (!trader || !standing) {
    return <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">{t("common.loading")}</div>;
  }

  return (
    <div data-testid="trader-detail-monitoring-shell" className="min-w-0 pb-8">
      <HeroHeader
        trader={trader}
        standing={standing}
        visual={visual}
        locale={locale}
        t={t}
        prefetchLeaderboard={prefetchLeaderboard}
      />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid w-full grid-cols-3 rounded-xl bg-white p-1 ring-1 ring-zinc-200 sm:inline-flex sm:w-auto dark:bg-zinc-950 dark:ring-zinc-800">
          <TabButton active label={t("detail.monitoring")} />
          <TabButton label={t("detail.analysis")} />
          <TabButton label={t("detail.info")} />
        </div>
        <div className="grid w-full grid-cols-2 items-center gap-2 rounded-xl bg-white p-1 ring-1 ring-zinc-200 sm:inline-flex sm:w-auto dark:bg-zinc-950 dark:ring-zinc-800">
          {SYMBOLS.map((item) => (
            <button
              key={item}
              type="button"
              onFocus={() => prefetchSymbol(item)}
              onMouseEnter={() => prefetchSymbol(item)}
              onClick={() => setSymbol(item)}
              className={`focus-ring rounded-lg px-4 py-2 text-sm font-semibold transition ${
                symbol === item
                  ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {item.replace("USDT", "")}
            </button>
          ))}
        </div>
      </div>

      <section data-testid="top-chart-panel" className="mt-4 min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
        <DetailChart
          symbol={symbol}
          result={chartResult}
          paperPositions={positions}
          paperOrders={orders}
          paperEvents={events}
          managementReviews={reviews}
          height={340}
          compact
          scenarios={scenarios}
          onOpenScenario={setSelectedScenario}
        />
      </section>

      <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl bg-white px-5 py-6 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t("detail.scenarios")}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("detail.scenarioHint")}</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-sm font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {scenarioTimelineItems.length}
              </span>
            </div>
            <div data-testid="scenario-timeline" className="relative mt-8">
              {timelineRail ? <div className="timelineRail absolute left-[13px] top-3 h-[calc(100%-1.5rem)] w-px bg-zinc-200 dark:bg-zinc-800" /> : null}
              <div className="space-y-7">
                {scenarioTimelineItems.map((item, index) => (
                  <TimelineRow
                    key={item.id}
                    item={item}
                    index={index}
                    onClick={item.scenario ? () => setSelectedScenario(item.scenario ?? null) : undefined}
                  />
                ))}
                {!scenarioTimelineItems.length ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {t("detail.noScenarios")}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <TradingJournal tradeHistoryItems={tradeHistoryItems} t={t} />
        </div>

        <DetailSidebar holdingItems={holdingItems} tradeHistoryItems={tradeHistoryItems} pnlCalendar={pnlCalendar} standing={standing} latestReview={latestReview} latestPlan={latestPlan} locale={locale} t={t} />
      </section>

      {error ? <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{error}</div> : null}
      {loading ? <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">{t("common.loading")}</div> : null}

      {liveAlert ? (
        <div
          data-testid="live-detail-alert"
          role="status"
          className="fixed bottom-4 right-4 z-[80] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/15 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/40"
        >
          <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">{liveAlert.title}</p>
                <h3 className="mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{liveAlert.itemTitle}</h3>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                onClick={() => setLiveAlert(null)}
                aria-label={t("detail.liveAlertDismiss")}
              >
                ×
              </button>
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="line-clamp-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{liveAlert.body}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-zinc-400">{liveAlert.time}</span>
              <button
                type="button"
                className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                onClick={openLiveAlert}
              >
                {t("detail.liveAlertOpen")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedScenario ? (
        <ScenarioModal
          scenario={selectedScenario}
          symbol={symbol}
          positions={positions}
          orders={orders}
          events={events}
          reviews={reviews}
          chartResult={chartResult}
          onClose={() => setSelectedScenario(null)}
          t={t}
        />
      ) : null}
    </div>
  );
}
