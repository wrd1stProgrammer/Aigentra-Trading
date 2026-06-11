"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import {
  leaderboardBundleQueryKey,
  getCachedTraderDetailBundle,
  getEquitySnapshots,
  prefetchLeaderboardBundle,
  prefetchTraderDetailBundle,
  traderDetailBundleQueryOptions,
  type LeaderboardBundle,
  type TraderDetailBundle,
  type TraderProfile,
  type PaperPosition,
  getTraderTradeHistory,
  type MergedTradeHistoryItem
} from "@/lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
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
import { SYMBOLS, type TradeHistoryItem } from "@/components/trader-profile-detail/types";
import { traderVisuals } from "@/lib/league";

function mergePositions(positions: PaperPosition[]): PaperPosition[] {
  const firstFiniteNumber = (...values: readonly unknown[]) => {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };

  const groups = new Map<string, PaperPosition[]>();
  for (const pos of positions) {
    const symbol = pos.symbol || "UNKNOWN";
    const side = String(pos.side ?? "").toUpperCase();
    const normalizedSide = (side === "SELL" || side === "SHORT") ? "SHORT" : "LONG";
    const status = String(pos.status ?? "open").toLowerCase();
    
    const key = `${symbol}-${normalizedSide}-${status}`;
    const list = groups.get(key) ?? [];
    list.push(pos);
    groups.set(key, list);
  }

  const result: PaperPosition[] = [];
  for (const [key, list] of groups.entries()) {
    if (list.length === 0) continue;
    if (list.length === 1 || !key.endsWith("-open")) {
      result.push(...list);
      continue;
    }

    const first = list[0];
    let totalQty = 0;
    let weightedEntrySum = 0;
    let weightedLiqSum = 0;
    let totalMargin = 0;
    let totalPnl = 0;
    let maxLeverage = 0;
    
    for (const pos of list) {
      const qty = Math.abs(firstFiniteNumber(pos.quantity, pos.size) ?? 0);
      const entryPrice = firstFiniteNumber(pos.averageEntryPrice, pos.avgEntryPrice, pos.entryPrice, pos.openPrice) ?? 0;
      const liqPrice = firstFiniteNumber(pos.liquidationPrice, pos.liquidation_price) ?? 0;
      const margin = firstFiniteNumber(pos.margin, pos.openMargin) ?? 0;
      const pnl = firstFiniteNumber(pos.unrealizedPnl, pos.realizedPnl) ?? 0;
      const leverage = firstFiniteNumber(pos.leverage) ?? 0;
      
      totalQty += qty;
      weightedEntrySum += qty * entryPrice;
      weightedLiqSum += qty * liqPrice;
      totalMargin += margin;
      totalPnl += pnl;
      if (leverage > maxLeverage) maxLeverage = leverage;
    }

    const avgEntryPrice = totalQty > 0 ? weightedEntrySum / totalQty : 0;
    const avgLiqPrice = totalQty > 0 ? weightedLiqSum / totalQty : 0;
    const mergedId = `position-merged-${first.symbol}-${first.side}`;
    
    const merged: PaperPosition = {
      ...first,
      id: mergedId,
      quantity: totalQty,
      size: totalQty,
      averageEntryPrice: avgEntryPrice,
      avgEntryPrice: avgEntryPrice,
      entryPrice: avgEntryPrice,
      openPrice: avgEntryPrice,
      liquidationPrice: avgLiqPrice > 0 ? avgLiqPrice : undefined,
      liquidation_price: avgLiqPrice > 0 ? avgLiqPrice : undefined,
      margin: totalMargin,
      openMargin: totalMargin,
      unrealizedPnl: totalPnl,
      realizedPnl: totalPnl,
      leverage: maxLeverage > 0 ? maxLeverage : first.leverage,
    };
    result.push(merged);
  }
  return result;
}

function mapMergedItemToHistoryItem(
  item: MergedTradeHistoryItem,
  locale: any,
  t: any
): TradeHistoryItem {
  const pnlTone = item.pnl > 0.01 ? "good" : item.pnl < -0.01 ? "bad" : "neutral";
  const resultTone = pnlTone;
  
  let resultLabel = t("detail.resultBreakeven");
  if (item.pnl > 0.01) resultLabel = t("detail.resultTakeProfit");
  if (item.pnl < -0.01) resultLabel = t("detail.resultStopLoss");
  
  let basisDetail = t("detail.resultReasonBreakeven");
  const reasonUpper = item.closeReason.toUpperCase();
  if (reasonUpper.includes("TAKE_PROFIT")) basisDetail = t("detail.resultReasonTakeProfit");
  if (reasonUpper.includes("STOP_LOSS") || reasonUpper.includes("LIQUIDATION")) basisDetail = t("detail.resultReasonStopLoss");
  
  return {
    id: `merged-${item.time}-${item.side}-${item.exitPrice}`,
    time: formatDateTime(item.time, locale),
    action: t("detail.closeTrade"),
    actionTone: resultTone,
    label: item.symbol,
    quantity: `${formatNumber(item.quantity, 4, locale)}`,
    basis: t("detail.basis"),
    basisDetail: basisDetail,
    priceLabel: `${t("common.price")} ${formatNumber(item.exitPrice, 0, locale)}`,
    sideLabel: item.side === "SHORT" ? t("leaderboard.side.short") : t("leaderboard.side.long"),
    leverageLabel: `x${formatNumber(item.leverage, 0, locale)}`,
    entryLabel: formatNumber(item.entryPrice, 0, locale),
    exitLabel: formatNumber(item.exitPrice, 0, locale),
    pnlLabel: formatCurrency(item.pnl, locale),
    pnlTone: pnlTone,
    resultLabel: resultLabel,
    isPositionAction: true
  };
}

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
  const [visibleScenarioCount, setVisibleScenarioCount] = useState(20);
  const [reviewsLimit, setReviewsLimit] = useState(20);
  const [eventsLimit, setEventsLimit] = useState(100);
  const [historyItems, setHistoryItems] = useState<TradeHistoryItem[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);

  const loadHistory = useCallback(async (reset = false) => {
    const nextOffset = reset ? 0 : historyOffset;
    if (reset) {
      setHistoryHasMore(true);
    }
    setLoadingMoreHistory(true);
    try {
      const res = await getTraderTradeHistory(traderId, symbol, 10, nextOffset);
      const items = res.items || [];
      const mapped = items.map(item => mapMergedItemToHistoryItem(item, locale, t));
      
      setHistoryItems(prev => reset ? mapped : [...prev, ...mapped]);
      setHistoryOffset(nextOffset + items.length);
      if (items.length < 10) {
        setHistoryHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load trade history:", err);
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [traderId, symbol, historyOffset, locale, t]);

  useEffect(() => {
    void loadHistory(true);
  }, [traderId, symbol]);

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
    ...traderDetailBundleQueryOptions(traderId, symbol, reviewsLimit, eventsLimit),
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
      return getCachedTraderDetailBundle(traderId, symbol, reviewsLimit, eventsLimit) ?? fallbackDetailBundle;
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
    const rawPositions = bundle?.positions ?? [];
    const mergedPositions = mergePositions(rawPositions);
    return {
      trader: bundle?.trader ?? fallback,
      summaries: bundle?.summaries ?? [],
      positions: mergedPositions,
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
  const visibleScenarioTimelineItems = useMemo(
    () => scenarioTimelineItems.slice(0, visibleScenarioCount),
    [scenarioTimelineItems, visibleScenarioCount]
  );
  const holdingItems = useMemo(
    () => buildHoldingItems({ standing, positions, orders, latestPlan, symbol, locale, t }),
    [latestPlan, locale, orders, positions, standing, symbol, t]
  );
  const tradeHistoryItems = useMemo(
    () => buildTradeHistoryItems({ events, closedPositions, reviews, plans, symbol, locale, t, limit: 12 }),
    [closedPositions, events, locale, plans, reviews, symbol, t]
  );
  const sidebarTradeHistoryItems = useMemo(
    () => buildTradeHistoryItems({ events, closedPositions, reviews, plans, symbol, locale, t, limit: eventsLimit }),
    [closedPositions, events, locale, plans, reviews, symbol, t, eventsLimit]
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
  const timelineRail = visibleScenarioTimelineItems.length > 0;
  const alertContextKey = `${traderId}:${symbol}`;

  useEffect(() => {
    setVisibleScenarioCount(20);
    setReviewsLimit(20);
    setEventsLimit(10);
  }, [symbol, traderId]);

  useEffect(() => {
    if (
      detailQuery.data?.managementReviews &&
      detailQuery.data.managementReviews.length === reviewsLimit &&
      visibleScenarioTimelineItems.length < 8 &&
      reviewsLimit < 200
    ) {
      setReviewsLimit((current) => {
        const next = current + 20;
        setVisibleScenarioCount(next);
        return next;
      });
    }
  }, [detailQuery.data?.managementReviews, reviewsLimit, visibleScenarioTimelineItems.length]);

  useEffect(() => {
    if (
      detailQuery.data?.events &&
      detailQuery.data.events.length === eventsLimit &&
      sidebarTradeHistoryItems.length < 5 &&
      eventsLimit < 150
    ) {
      setEventsLimit((current) => current + 15);
    }
  }, [detailQuery.data?.events, eventsLimit, sidebarTradeHistoryItems.length]);

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

  const handleScenarioScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight < target.scrollHeight - 180) return;
    setReviewsLimit((current) => {
      const next = current + 10;
      setVisibleScenarioCount(next);
      return next;
    });
  }, []);

  const onLoadMoreEvents = useCallback(() => {
    setEventsLimit((current) => current + 10);
  }, []);

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
            <div data-testid="scenario-timeline" className="relative mt-8 max-h-[980px] overflow-y-auto pr-2" onScroll={handleScenarioScroll}>
              {timelineRail ? <div className="timelineRail absolute left-[13px] top-3 h-[calc(100%-1.5rem)] w-px bg-zinc-200 dark:bg-zinc-800" /> : null}
              <div className="space-y-7">
                {visibleScenarioTimelineItems.map((item, index) => (
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
                {visibleScenarioTimelineItems.length < scenarioTimelineItems.length ? (
                  <button
                    type="button"
                    className="focus-ring w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    onClick={() => setVisibleScenarioCount((current) => Math.min(current + 20, scenarioTimelineItems.length))}
                  >
                    {t("detail.loadMoreScenarios")}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <TradingJournal
            tradeHistoryItems={historyItems}
            t={t}
            onLoadMore={() => void loadHistory(false)}
            hasMore={historyHasMore}
            loadingMore={loadingMoreHistory}
          />
        </div>

        <DetailSidebar holdingItems={holdingItems} tradeHistoryItems={sidebarTradeHistoryItems} pnlCalendar={pnlCalendar} standing={standing} latestReview={latestReview} latestPlan={latestPlan} locale={locale} t={t} onLoadMoreEvents={onLoadMoreEvents} />
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
