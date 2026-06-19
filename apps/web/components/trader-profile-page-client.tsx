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
  type TraderStatusFeed,
  getTraderTradeHistory,
  type MergedTradeHistoryItem
} from "@/lib/api";
import { formatCurrency, formatNumber, formatRelativeDateTime, intlLocale } from "@/lib/format";
import { useAppContext } from "@/components/app-provider";
import { buildScenarios, buildStandings, type LeagueSymbol, type TraderScenario } from "@/lib/league";
import { fallbackTraders } from "@/lib/traders";
import { buildScenarioTimelineItems } from "@/components/trader-profile-detail/data";
import { buildHoldingItems } from "@/components/trader-profile-detail/holdings";
import { nextLiveDetailAlert, type LiveDetailAlert } from "@/components/trader-profile-detail/live-alerts";
import { accountStartingEquity, buildMonthlyPnlCalendar, normalizeEquitySnapshots } from "@/components/trader-profile-detail/pnl-calendar";
import { normalizePlan } from "@/components/trader-profile-detail/plan";
import {
  countByUtcDateWithFallback,
  nextVisibleCount,
  timelineCountByUtcDate,
  timelineItemsForUtcDate
} from "@/components/trader-profile-detail/scenario-window";
import {
  BinancePositionPanel,
  DetailChart,
  DetailSidebar,
  HeroHeader,
  ScenarioModal,
  TabButton,
  TimelineRow,
  TradingJournal
} from "@/components/trader-profile-detail/panels";
import { StatusFeedThread } from "@/components/trader-profile-detail/status-feed-thread";
import { SYMBOLS, type TradeHistoryItem } from "@/components/trader-profile-detail/types";
import { traderVisuals } from "@/lib/league";
import { CaretLeft, CaretRight, Clock } from "@phosphor-icons/react";

const DETAIL_INITIAL_REVIEWS_LIMIT = 20;
const DETAIL_INITIAL_EVENTS_LIMIT = 20;

function toDateString(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getSunday(date: Date): Date {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return getSunday(new Date());
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

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
  const recordValue = (value: unknown) => typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

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
    let weightedMarkSum = 0;
    let markQty = 0;
    let totalMargin = 0;
    let totalPnl = 0;
    let totalEntryFee = 0;
    let maxLeverage = 0;
    let takeProfitPrice: number | null = null;
    let stopLossPrice: number | null = null;
    const positionLegs = list.map((pos) => ({
      symbol: pos.symbol,
      side: pos.side,
      quantity: firstFiniteNumber(pos.quantity, pos.size),
      size: firstFiniteNumber(pos.quantity, pos.size),
      entryPrice: firstFiniteNumber(pos.averageEntryPrice, pos.avgEntryPrice, pos.entryPrice, pos.openPrice),
      averageEntryPrice: firstFiniteNumber(pos.averageEntryPrice, pos.avgEntryPrice, pos.entryPrice, pos.openPrice),
      leverage: firstFiniteNumber(pos.leverage),
      margin: firstFiniteNumber(pos.margin, pos.openMargin),
      entryFee: firstFiniteNumber(pos.entryFee, pos.entry_fee),
      entry_fee: firstFiniteNumber(pos.entryFee, pos.entry_fee),
      takeProfitPrice: firstFiniteNumber(pos.takeProfit, pos.takeProfitPrice, pos.take_profit_price),
      take_profit_price: firstFiniteNumber(pos.takeProfit, pos.takeProfitPrice, pos.take_profit_price),
      stopLossPrice: firstFiniteNumber(pos.stopLoss, pos.stopLossPrice, pos.stop_loss_price),
      stop_loss_price: firstFiniteNumber(pos.stopLoss, pos.stopLossPrice, pos.stop_loss_price),
      takeProfits: pos.takeProfits,
      payload: pos.payload,
    }));
    
    for (const pos of list) {
      const qty = Math.abs(firstFiniteNumber(pos.quantity, pos.size) ?? 0);
      const entryPrice = firstFiniteNumber(pos.averageEntryPrice, pos.avgEntryPrice, pos.entryPrice, pos.openPrice) ?? 0;
      const liqPrice = firstFiniteNumber(pos.liquidationPrice, pos.liquidation_price) ?? 0;
      const markPrice = firstFiniteNumber(pos.markPrice, pos.mark_price);
      const margin = firstFiniteNumber(pos.margin, pos.openMargin) ?? 0;
      const pnl = firstFiniteNumber(pos.unrealizedPnl, pos.realizedPnl) ?? 0;
      const leverage = firstFiniteNumber(pos.leverage) ?? 0;
      const entryFee = firstFiniteNumber(pos.entryFee, pos.entry_fee) ?? 0;
      
      totalQty += qty;
      weightedEntrySum += qty * entryPrice;
      weightedLiqSum += qty * liqPrice;
      if (markPrice !== null) {
        weightedMarkSum += qty * markPrice;
        markQty += qty;
      }
      totalMargin += margin;
      totalPnl += pnl;
      totalEntryFee += entryFee;
      if (leverage > maxLeverage) maxLeverage = leverage;
      if (takeProfitPrice === null) takeProfitPrice = firstFiniteNumber(pos.takeProfit, pos.takeProfitPrice, pos.take_profit_price);
      if (stopLossPrice === null) stopLossPrice = firstFiniteNumber(pos.stopLoss, pos.stopLossPrice, pos.stop_loss_price);
    }

    const avgEntryPrice = totalQty > 0 ? weightedEntrySum / totalQty : 0;
    const avgLiqPrice = totalQty > 0 ? weightedLiqSum / totalQty : 0;
    const avgMarkPrice = markQty > 0 ? weightedMarkSum / markQty : null;
    const mergedId = `position-merged-${first.symbol}-${first.side}`;
    const firstPayload = recordValue(first.payload);
    const mergedPayload = {
      ...(firstPayload ?? {}),
      initialQuantity: totalQty,
      entryFee: totalEntryFee,
      positionLegs,
      takeProfitPrice: takeProfitPrice ?? firstPayload?.takeProfitPrice,
      stopLossPrice: stopLossPrice ?? firstPayload?.stopLossPrice
    };
    
    const merged: PaperPosition = {
      ...first,
      id: mergedId,
      quantity: totalQty,
      size: totalQty,
      averageEntryPrice: avgEntryPrice,
      avgEntryPrice: avgEntryPrice,
      entryPrice: avgEntryPrice,
      openPrice: avgEntryPrice,
      markPrice: avgMarkPrice ?? undefined,
      liquidationPrice: avgLiqPrice > 0 ? avgLiqPrice : undefined,
      liquidation_price: avgLiqPrice > 0 ? avgLiqPrice : undefined,
      margin: totalMargin,
      openMargin: totalMargin,
      entryFee: totalEntryFee,
      entry_fee: totalEntryFee,
      unrealizedPnl: totalPnl,
      realizedPnl: totalPnl,
      leverage: maxLeverage > 0 ? maxLeverage : first.leverage,
      takeProfitPrice: takeProfitPrice ?? first.takeProfitPrice,
      take_profit_price: takeProfitPrice ?? first.take_profit_price,
      stopLossPrice: stopLossPrice ?? first.stopLossPrice,
      stop_loss_price: stopLossPrice ?? first.stop_loss_price,
      payload: mergedPayload,
    };
    result.push(merged);
  }
  return result;
}

function buildScenarioPositions(positions: readonly PaperPosition[], closedPositions: readonly PaperPosition[]): PaperPosition[] {
  const result: PaperPosition[] = [];
  const seen = new Set<string>();
  for (const [index, position] of [...positions, ...closedPositions].entries()) {
    const key = scenarioPositionKey(position, index);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(position);
  }
  return result;
}

function scenarioPositionKey(position: PaperPosition, index: number) {
  if (position.id !== undefined && position.id !== null && position.id !== "") return `id:${String(position.id)}`;
  return `row:${position.traderId ?? ""}:${position.symbol}:${position.side ?? ""}:${position.openedAt ?? position.updatedAt ?? index}`;
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
    time: formatRelativeDateTime(item.time, locale, t),
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
  const [liveMarkPrice, setLiveMarkPrice] = useState<number | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TraderScenario | null>(null);
  const [liveAlert, setLiveAlert] = useState<LiveDetailAlert | null>(null);
  const [visibleScenarioCountByDate, setVisibleScenarioCountByDate] = useState<Record<string, number>>({});
  const [reviewsLimit, setReviewsLimit] = useState(DETAIL_INITIAL_REVIEWS_LIMIT);
  const [eventsLimit, setEventsLimit] = useState(DETAIL_INITIAL_EVENTS_LIMIT);
  const [historyItems, setHistoryItems] = useState<TradeHistoryItem[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateString(new Date()));
  const [weekStart, setWeekStart] = useState<Date>(() => getSunday(new Date()));
  const [clientHydrated, setClientHydrated] = useState(false);
  const historyLoadingRef = useRef(false);
  const historyContextKeyRef = useRef(`${traderId}:${symbol}`);

  const handlePrevWeek = useCallback(() => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() - 7);
      return next;
    });
    setSelectedDate((prev) => {
      const date = new Date(prev);
      date.setUTCDate(date.getUTCDate() - 7);
      return toDateString(date);
    });
  }, []);

  const handleNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    });
    setSelectedDate((prev) => {
      const date = new Date(prev);
      date.setUTCDate(date.getUTCDate() + 7);
      return toDateString(date);
    });
  }, []);

  const loadHistoryPage = useCallback(async (nextOffset: number, reset: boolean) => {
    const requestContextKey = `${traderId}:${symbol}`;
    if (!reset && !historyHasMore) return;
    if (historyLoadingRef.current && historyContextKeyRef.current === requestContextKey) return;
    historyLoadingRef.current = true;
    historyContextKeyRef.current = requestContextKey;
    if (reset) {
      setHistoryHasMore(true);
    }
    setLoadingMoreHistory(true);
    try {
      const res = await getTraderTradeHistory(traderId, symbol, 10, nextOffset);
      const items = res.items || [];
      const mapped = items.map(item => mapMergedItemToHistoryItem(item, locale, t));
      if (historyContextKeyRef.current !== requestContextKey) return;
      
      setHistoryItems(prev => reset ? mapped : [...prev, ...mapped]);
      setHistoryOffset(nextOffset + items.length);
      if (items.length < 10) {
        setHistoryHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load trade history:", err);
    } finally {
      if (historyContextKeyRef.current === requestContextKey) {
        historyLoadingRef.current = false;
        setLoadingMoreHistory(false);
      }
    }
  }, [historyHasMore, traderId, symbol, locale, t]);

  const loadHistory = useCallback(async (reset = false) => {
    await loadHistoryPage(reset ? 0 : historyOffset, reset);
  }, [historyOffset, loadHistoryPage]);

  useEffect(() => {
    setClientHydrated(true);
  }, []);

  useEffect(() => {
    setLiveMarkPrice(null);
  }, [symbol]);

  const handleLatestPriceChange = useCallback((price: number | null) => {
    setLiveMarkPrice((previous) => previous === price ? previous : price);
  }, []);

  const liveAlertKeyRef = useRef<string | null>(null);
  const liveAlertHydratedRef = useRef(false);
  const liveAlertContextRef = useRef<string | null>(null);

  const fallbackDetailBundle = useMemo<TraderDetailBundle | undefined>(() => {
    const leaderboardBundle = clientHydrated ? queryClient.getQueryData<LeaderboardBundle>(leaderboardBundleQueryKey(symbol, locale)) : undefined;
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
      statusFeeds: (leaderboardBundle?.statusFeeds ?? []).filter((item) => (item.traderId ?? item.trader_id) === traderId),
      events: [],
      dailyPnl: [],
      reviewCountsByDay: [],
      tradePlans: []
    };
  }, [clientHydrated, fallback, locale, queryClient, symbol, traderId]);

  const detailQuery = useQuery({
    ...traderDetailBundleQueryOptions(traderId, symbol, reviewsLimit, eventsLimit, locale),
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
      return clientHydrated ? getCachedTraderDetailBundle(traderId, symbol, reviewsLimit, eventsLimit, locale) ?? fallbackDetailBundle : fallbackDetailBundle;
    }
  });
  const equitySnapshotsQuery = useQuery({
    queryKey: ["paper", "equity-snapshots", traderId, symbol],
    queryFn: () => getEquitySnapshots(45, traderId, symbol),
    placeholderData: (previousData) => previousData,
    staleTime: 60_000
  });

  const { trader, summaries, positions, closedPositions, orders, reviews, statusFeeds, events, dailyPnl, reviewCountsByDay, plans } = useMemo(() => {
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
      statusFeeds: bundle?.statusFeeds ?? [],
      events: bundle?.events ?? [],
      dailyPnl: bundle?.dailyPnl ?? [],
      reviewCountsByDay: bundle?.reviewCountsByDay ?? [],
      plans: bundle?.tradePlans ?? []
    };
  }, [detailQuery.data, fallback]);

  const loading = detailQuery.isPending && !detailQuery.data;
  const error = detailQuery.error ? (detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)) : null;

  const prefetchSymbol = useCallback((nextSymbol: LeagueSymbol) => {
    void prefetchTraderDetailBundle(queryClient, traderId, nextSymbol, locale);
  }, [locale, queryClient, traderId]);

  const prefetchLeaderboard = useCallback(() => {
    void prefetchLeaderboardBundle(queryClient, symbol, locale);
  }, [locale, queryClient, symbol]);

  const standing = useMemo(() => {
    const standings = buildStandings(trader ? [trader] : (fallbackTraders as unknown as TraderProfile[]), summaries);
    return standings.find((item) => item.id === traderId) ?? standings[0];
  }, [summaries, trader, traderId]);

  const scenarioPositions = useMemo(() => buildScenarioPositions(positions, closedPositions), [closedPositions, positions]);
  const scenarios = useMemo(() => {
    if (!trader) return [];
    return buildScenarios({ trader, positions: scenarioPositions, orders, reviews, events });
  }, [events, orders, reviews, scenarioPositions, trader]);

  const latestReview = reviews[0];
  const visual = traderVisuals[traderId] ?? traderVisuals["channel-rider"];
  const normalizedPlans = useMemo(() => plans.map(normalizePlan), [plans]);
  const latestPlan = useMemo(() => normalizedPlans[0] ?? normalizePlan(), [normalizedPlans]);
  const chartResult = useMemo(() => ({ tradePlan: latestPlan }), [latestPlan]);
  const scenarioTimelineItems = useMemo(
    () => buildScenarioTimelineItems({ scenarios, reviews, locale, t }),
    [locale, reviews, scenarios, t]
  );
  const scenarioCountByDate = useMemo(
    () => countByUtcDateWithFallback(reviewCountsByDay, scenarioTimelineItems),
    [reviewCountsByDay, scenarioTimelineItems]
  );
  const loadedScenarioCountByDate = useMemo(() => timelineCountByUtcDate(scenarioTimelineItems), [scenarioTimelineItems]);
  const selectedScenarioTotal = scenarioCountByDate.get(selectedDate) ?? 0;
  const selectedScenarioVisibleCount = visibleScenarioCountByDate[selectedDate] ?? 10;
  const filteredTimelineItems = useMemo(() => {
    return timelineItemsForUtcDate(scenarioTimelineItems, selectedDate, selectedScenarioVisibleCount);
  }, [scenarioTimelineItems, selectedDate, selectedScenarioVisibleCount]);
  const holdingItems = useMemo(
    () => buildHoldingItems({ standing, positions, orders, latestPlan, symbol, locale, t }),
    [latestPlan, locale, orders, positions, standing, symbol, t]
  );
  const pnlCalendar = useMemo(
    () => buildMonthlyPnlCalendar({
      locale,
      startingEquity: accountStartingEquity(standing?.equity, standing?.totalPnl),
      snapshots: normalizeEquitySnapshots(equitySnapshotsQuery.data),
      dailyPnl
    }),
    [equitySnapshotsQuery.data, dailyPnl, locale, standing?.equity, standing?.totalPnl]
  );
  const alertContextKey = `${traderId}:${symbol}`;
  const historyRefreshKey = useMemo(() => {
    const latestEvent = events[0] ? `${events[0].id ?? ""}:${events[0].eventType ?? events[0].type ?? ""}:${events[0].createdAt ?? events[0].timestamp ?? ""}` : "";
    const pnlKey = dailyPnl.map((item) => `${item.date}:${item.pnl}`).join("|");
    return `${traderId}:${symbol}:${latestEvent}:${pnlKey}`;
  }, [dailyPnl, events, symbol, traderId]);

  const lastTraderIdRef = useRef<string | null>(null);
  const lastSymbolRef = useRef<string | null>(null);
  const lastHistoryRefreshKeyRef = useRef<string | null>(null);
  const lastScenarioHydrationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const keyChanged = lastTraderIdRef.current !== traderId || lastSymbolRef.current !== symbol;
    if (keyChanged) {
      lastTraderIdRef.current = traderId;
      lastSymbolRef.current = symbol;
      setVisibleScenarioCountByDate({});
      setReviewsLimit(DETAIL_INITIAL_REVIEWS_LIMIT);
      setEventsLimit(DETAIL_INITIAL_EVENTS_LIMIT);
      lastScenarioHydrationKeyRef.current = null;
      
      if (scenarioTimelineItems.length > 0) {
        const latestItem = scenarioTimelineItems[0];
        const latestDate = new Date(latestItem.sortMs ?? 0);
        if (!Number.isNaN(latestDate.getTime()) && latestItem.sortMs !== Number.NEGATIVE_INFINITY) {
          setSelectedDate(toDateString(latestDate));
          setWeekStart(getSunday(latestDate));
        } else {
          const today = new Date();
          setSelectedDate(toDateString(today));
          setWeekStart(getSunday(today));
        }
      } else {
        const today = new Date();
        setSelectedDate(toDateString(today));
        setWeekStart(getSunday(today));
      }
    }
  }, [symbol, traderId, scenarioTimelineItems]);

  useEffect(() => {
    const latestItem = scenarioTimelineItems[0];
    if (!latestItem) return;
    const latestDate = new Date(latestItem.sortMs ?? 0);
    if (Number.isNaN(latestDate.getTime()) || latestItem.sortMs === Number.NEGATIVE_INFINITY) return;
    const latestDateKey = toDateString(latestDate);
    const hydrationKey = `${traderId}:${symbol}:${latestItem.id}:${latestDateKey}`;
    if (lastScenarioHydrationKeyRef.current === hydrationKey) return;
    lastScenarioHydrationKeyRef.current = hydrationKey;
    if ((scenarioCountByDate.get(selectedDate) ?? 0) > 0) return;
    setSelectedDate(latestDateKey);
    setWeekStart(getSunday(latestDate));
  }, [scenarioCountByDate, scenarioTimelineItems, selectedDate, symbol, traderId]);

  useEffect(() => {
    if (
      detailQuery.data?.managementReviews &&
      detailQuery.data.managementReviews.length === reviewsLimit &&
      filteredTimelineItems.length < Math.min(10, selectedScenarioTotal) &&
      reviewsLimit < 200
    ) {
      setReviewsLimit((current) => current + 20);
    }
  }, [detailQuery.data?.managementReviews, filteredTimelineItems.length, reviewsLimit, selectedScenarioTotal]);

  useEffect(() => {
    if (!detailQuery.data?.managementReviews) return;
    const loadedReviews = detailQuery.data.managementReviews;
    if (loadedReviews.length === 0) return;

    const oldestReview = loadedReviews[loadedReviews.length - 1];
    if (oldestReview && oldestReview.createdAt) {
      const oldestDate = new Date(oldestReview.createdAt);
      if (
        oldestDate > weekStart &&
        loadedReviews.length === reviewsLimit &&
        reviewsLimit < 300
      ) {
        setReviewsLimit((current) => current + 30);
      }
    }
  }, [detailQuery.data?.managementReviews, weekStart, reviewsLimit]);

  useEffect(() => {
    if (!detailQuery.data || lastHistoryRefreshKeyRef.current === historyRefreshKey) return;
    lastHistoryRefreshKeyRef.current = historyRefreshKey;
    void loadHistoryPage(0, true);
  }, [detailQuery.data, historyRefreshKey, loadHistoryPage]);

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

  const loadMoreSelectedScenarios = useCallback(() => {
    const loadedForDate = loadedScenarioCountByDate.get(selectedDate) ?? 0;
    if (selectedScenarioTotal > selectedScenarioVisibleCount) {
      setVisibleScenarioCountByDate((current) => ({
        ...current,
        [selectedDate]: nextVisibleCount(selectedScenarioVisibleCount, selectedScenarioTotal)
      }));
    }
    if (loadedForDate < selectedScenarioTotal) {
      setReviewsLimit((current) => Math.min(300, current + 20));
    }
  }, [loadedScenarioCountByDate, selectedDate, selectedScenarioTotal, selectedScenarioVisibleCount]);

  const handleScenarioScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight < target.scrollHeight - 180) return;
    loadMoreSelectedScenarios();
  }, [loadMoreSelectedScenarios]);

  const onLoadMoreEvents = useCallback(() => {
    if (loadingMoreHistory || !historyHasMore) return;
    void loadHistory(false);
    setEventsLimit((current) => current + 10);
  }, [historyHasMore, loadHistory, loadingMoreHistory]);

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

      <section data-testid="top-chart-panel" className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
        <div className="min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
          <DetailChart
            symbol={symbol}
            result={chartResult}
            paperPositions={positions}
            paperOrders={orders}
            paperEvents={events}
            managementReviews={reviews}
            height={340}
            compact
            showPositionPanel={false}
            scenarios={scenarios}
            liveMarkPrice={liveMarkPrice}
            onLatestPriceChange={handleLatestPriceChange}
            onOpenScenario={setSelectedScenario}
          />
        </div>
        <StatusFeedThread feeds={statusFeeds} locale={locale} t={t} />
      </section>

      <div data-testid="detail-full-width-position-panel" className="mt-2 min-w-0">
        <BinancePositionPanel
          symbol={symbol}
          positions={positions}
          orders={orders}
          latestPlan={latestPlan}
          scenarios={scenarios}
          liveMarkPrice={liveMarkPrice}
          onOpenScenario={setSelectedScenario}
        />
      </div>

      <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl bg-white px-5 py-6 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t("detail.scenarios")}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("detail.scenarioHint")}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 transition"
                  title={t("detail.previousWeek")}
                >
                  <CaretLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 transition"
                  title={t("detail.nextWeek")}
                >
                  <CaretRight size={20} />
                </button>
              </div>
            </div>

            {/* Horizontal week calendar selector */}
            <div className="mt-6">
              <div className="grid grid-cols-7 gap-2 md:gap-3 overflow-x-auto pb-1 scrollbar-none flex-nowrap flex md:grid">
                {Array.from({ length: 7 }).map((_, offset) => {
                  const cardDate = new Date(weekStart);
                  cardDate.setUTCDate(weekStart.getUTCDate() + offset);
                  const dateKey = toDateString(cardDate);
                  
                  const itemCount = scenarioCountByDate.get(dateKey) ?? 0;
                  
                  const isSelected = selectedDate === dateKey;
                  
                  const dayName = new Intl.DateTimeFormat(intlLocale(locale), {
                    weekday: "short",
                    timeZone: "UTC"
                  }).format(cardDate);
                  
                  const dateLabel = new Intl.DateTimeFormat(intlLocale(locale), {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC"
                  }).format(cardDate);
                  
                  const subtext = itemCount > 0
                    ? `${formatNumber(itemCount, 0, locale)} ${t("detail.itemCountSuffix")}`
                    : t("detail.noTrades");
                  
                  return (
                    <div
                      key={dateKey}
                      onClick={() => setSelectedDate(dateKey)}
                      className={`flex-1 min-w-[80px] md:min-w-0 flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer select-none ${
                        isSelected
                          ? "bg-blue-50/50 border-blue-500 text-blue-900 dark:bg-blue-950/30 dark:border-blue-500 dark:text-blue-200"
                          : "bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900/50"
                      }`}
                    >
                      <span className={`text-xs font-semibold ${
                        isSelected 
                          ? "text-blue-600 dark:text-blue-400" 
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}>
                        {dayName}
                      </span>
                      <span className="text-sm font-bold mt-1">
                        {dateLabel}
                      </span>
                      <span className={`text-[10px] mt-1.5 font-medium ${
                        itemCount > 0
                          ? (isSelected ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400 font-semibold")
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}>
                        {subtext}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div data-testid="scenario-timeline" className="relative mt-8 max-h-[700px] overflow-y-auto pr-2" onScroll={handleScenarioScroll}>
              {filteredTimelineItems.length > 0 ? (
                <div className="timelineRail absolute left-[13px] top-3 h-[calc(100%-1.5rem)] w-px bg-zinc-200 dark:bg-zinc-800" />
              ) : null}
              <div className="space-y-7">
                {filteredTimelineItems.map((item, index) => (
                  <TimelineRow
                    key={item.id}
                    item={item}
                    index={index}
                    onClick={item.scenario ? () => setSelectedScenario(item.scenario ?? null) : undefined}
                  />
                ))}
                {!filteredTimelineItems.length ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {t("detail.noScenariosOnDate")}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 border-t border-zinc-100 pt-4 flex justify-center dark:border-zinc-900">
              <button
                type="button"
                className="focus-ring flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition dark:text-zinc-400 dark:hover:text-zinc-200"
                onClick={loadMoreSelectedScenarios}
              >
                <Clock size={14} />
                {t("detail.loadMoreSelectedScenarios")}
              </button>
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

        <DetailSidebar
          holdingItems={holdingItems}
          tradeHistoryItems={historyItems.slice(0, eventsLimit)}
          pnlCalendar={pnlCalendar}
          standing={standing}
          latestReview={latestReview}
          latestPlan={latestPlan}
          locale={locale}
          t={t}
          onLoadMoreEvents={onLoadMoreEvents}
          historyHasMore={historyHasMore}
          loadingMoreHistory={loadingMoreHistory}
        />
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
