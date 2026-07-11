"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import {
  leaderboardBundleQueryKey,
  traderDetailBundleQueryKey,
  getCachedTraderDetailBundle,
  getEquitySnapshots,
  getTraderExecutionEventsUrl,
  prefetchLeaderboardBundle,
  traderDetailBundleQueryOptions,
  type LeaderboardBundle,
  type TraderDetailBundle,
  type TraderProfile,
  type PaperPosition,
  type ManagementReview,
  type TraderStatusFeed,
  getTraderManagementReviews,
  getTraderTradeHistory,
  getTraderTradeEvents,
  type PaperTradeEvent,
  type MergedTradeHistoryItem
} from "@/lib/api";
import { formatCurrency, formatDateTime, formatNumber, formatRelativeDateTime, intlLocale } from "@/lib/format";
import { useAppContext } from "@/components/app-provider";
import { buildScenarios, buildStandings, type LeagueSymbol, type TraderScenario } from "@/lib/league";
import { shouldShowTraderDetailInitialOverlay } from "@/lib/trader-detail-loading-policy";
import { fallbackTraders } from "@/lib/traders";
import { buildScenarioTimelineItems } from "@/components/trader-profile-detail/data";
import { buildHoldingItems } from "@/components/trader-profile-detail/holdings";
import { tradeClassification } from "@/components/trade-classification";
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
  TimelineRow,
  TradingJournal,
  HoldingPanel
} from "@/components/trader-profile-detail/panels";
import { PnlCalendarPanel } from "@/components/trader-profile-detail/pnl-calendar-panel";
import { StatusFeedThread } from "@/components/trader-profile-detail/status-feed-thread";
import { buildExecutionMarkers, defaultExecutionMarkerSelection } from "@/components/trader-profile-detail/execution-markers";
import { ExecutionMarkerRail } from "@/components/trader-profile-detail/execution-marker-rail";
import { PageLoadingOverlay } from "@/components/page-loading-overlay";
import type { TradeHistoryItem, Translator } from "@/components/trader-profile-detail/types";
import { traderVisuals } from "@/lib/league";
import { selectMergedPositionReviewSource } from "@/lib/position-review-source";
import { CaretLeft, CaretRight, Clock } from "@phosphor-icons/react";
import { ProtectedContentGate } from "@/components/access-gate";
import {
  guestSubscriberAccess,
  isProtectedSourceUnlocked,
  protectedScenarioSourceKey,
  useSubscriberAccess
} from "@/components/use-subscriber-access";
import type { Locale } from "@/lib/i18n";

const DETAIL_INITIAL_REVIEWS_LIMIT = 20;
const DETAIL_REVIEWS_PAGE_SIZE = 20;
const DETAIL_EVENTS_PAGE_SIZE = 10;
type PositionTakeProfitTarget = NonNullable<PaperPosition["takeProfits"]>[number] & Record<string, unknown>;

function isAbortLike(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /abort|timeout/i.test(message);
}

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

function LockedScenarioTimelinePreview({ t }: { readonly t: Translator }) {
  return (
    <div data-testid="scenario-timeline-locked-preview" className="grid grid-cols-1 gap-3 border-b border-zinc-100 pb-5 last:border-0 last:pb-0 dark:border-zinc-900 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-5 sm:border-0 sm:pb-0">
      <div className="relative z-[1] mt-1 hidden size-5 place-items-center rounded-full bg-white dark:bg-zinc-950 sm:grid sm:size-7">
        <span className="size-3 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </div>
      <div className="min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3.5 shadow-sm shadow-zinc-950/[0.03] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/20">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{t("access.reviewInlineLocked")}</p>
          <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-200">
            {t("access.lockedLabel")}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{t("access.reviewLockedDescription")}</p>
        <div aria-hidden="true" className="mt-3 space-y-2">
          <div className="h-2.5 w-3/4 rounded-full bg-zinc-200/80 dark:bg-white/10" />
          <div className="h-2.5 w-1/2 rounded-full bg-zinc-200/70 dark:bg-white/[0.075]" />
        </div>
      </div>
    </div>
  );
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
  const firstText = (...values: readonly unknown[]) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  const recordValue = (value: unknown): Record<string, unknown> | null => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value));
  };
  const normalizeTakeProfitTarget = (value: unknown): PositionTakeProfitTarget | null => {
    const target = recordValue(value);
    if (!target) return null;
    return {
      ...target,
      price: firstFiniteNumber(target.price, target.targetPrice),
      weight: firstFiniteNumber(target.weight),
      reason: firstText(target.reason)
    };
  };
  const takeProfitTargets = (pos: PaperPosition): PositionTakeProfitTarget[] => {
    const payload = recordValue(pos.payload);
    const value = Array.isArray(pos.takeProfits)
      ? pos.takeProfits
      : Array.isArray(pos.take_profits)
        ? pos.take_profits
        : Array.isArray(payload?.takeProfits)
        ? payload.takeProfits
        : Array.isArray(payload?.take_profits)
          ? payload.take_profits
          : [];
    return value.map(normalizeTakeProfitTarget).filter((target): target is PositionTakeProfitTarget => target !== null);
  };
  const completedTargetStatuses = new Set(["COMPLETED", "DONE", "FILLED", "HIT", "TRIGGERED", "TAKE_PROFIT", "TP_FILLED"]);
  const firstOpenTakeProfitPrice = (targets: readonly Record<string, unknown>[]) => {
    const ordered = targets.length ? targets : [];
    const target = ordered.find((item) => !completedTargetStatuses.has(String(item.status ?? item.state ?? "").trim().replace(/[-\s]+/g, "_").toUpperCase())) ?? ordered[0];
    return firstFiniteNumber(target?.price, target?.targetPrice);
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
    let weightedMarkSum = 0;
    let markQty = 0;
    let totalMargin = 0;
    let totalPnl = 0;
    let totalEntryFee = 0;
    let maxLeverage = 0;
    let takeProfitPrice: number | null = null;
    let stopLossPrice: number | null = null;
    let mergedTakeProfits: PositionTakeProfitTarget[] = [];
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
      takeProfits: takeProfitTargets(pos),
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
      const posTargets = takeProfitTargets(pos);
      if (!mergedTakeProfits.length && posTargets.length) mergedTakeProfits = posTargets;
      if (takeProfitPrice === null) takeProfitPrice = firstOpenTakeProfitPrice(posTargets) ?? firstFiniteNumber(pos.takeProfit, pos.takeProfitPrice, pos.take_profit_price);
      if (stopLossPrice === null) stopLossPrice = firstFiniteNumber(pos.stopLoss, pos.stopLossPrice, pos.stop_loss_price);
    }

    const avgEntryPrice = totalQty > 0 ? weightedEntrySum / totalQty : 0;
    const avgLiqPrice = totalQty > 0 ? weightedLiqSum / totalQty : 0;
    const avgMarkPrice = markQty > 0 ? weightedMarkSum / markQty : null;
    const mergedId = `position-merged-${first.symbol}-${first.side}`;
    const reviewSource = selectMergedPositionReviewSource(list);
    const firstPayload = recordValue(reviewSource.payload);
    const reviewRationale = firstText(reviewSource.rationale, reviewSource.reason);
    const mergedPayload = {
      ...(firstPayload ?? {}),
      aiApprovalReason: firstPayload?.aiApprovalReason ?? reviewRationale,
      rationale: firstPayload?.rationale ?? reviewRationale,
      initialQuantity: totalQty,
      entryFee: totalEntryFee,
      positionLegs,
      takeProfits: mergedTakeProfits.length ? mergedTakeProfits : firstPayload?.takeProfits,
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
      takeProfits: mergedTakeProfits.length ? mergedTakeProfits : first.takeProfits,
      stopLossPrice: stopLossPrice ?? first.stopLossPrice,
      stop_loss_price: stopLossPrice ?? first.stop_loss_price,
      payload: mergedPayload,
      rationale: reviewSource.rationale ?? first.rationale,
      reason: reviewSource.reason ?? first.reason,
      translation: reviewSource.translation ?? first.translation,
      review: reviewSource.review ?? first.review,
      structuredReview: reviewSource.structuredReview ?? first.structuredReview,
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

function mergeManagementReviews(...groups: readonly ManagementReview[][]): ManagementReview[] {
  const result: ManagementReview[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const review of group) {
      const key = managementReviewKey(review, result.length);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(review);
    }
  }
  return result;
}

function managementReviewKey(review: ManagementReview, index: number) {
  if (review.id !== undefined && review.id !== null && review.id !== "") return `id:${String(review.id)}`;
  return `row:${review.traderId ?? review.trader_id ?? ""}:${review.symbol ?? ""}:${review.createdAt ?? review.timestamp ?? index}`;
}

function tradeEventKey(event: PaperTradeEvent, index: number) {
  if (event.id !== undefined && event.id !== null && event.id !== "") return `id:${String(event.id)}`;
  return [
    "row",
    event.traderId ?? event.trader_id ?? "",
    event.symbol ?? "",
    event.eventType ?? event.type ?? "",
    event.createdAt ?? event.timestamp ?? "",
    event.price ?? "",
    event.quantity ?? "",
    index
  ].join(":");
}

function tradeEventSortMs(event: PaperTradeEvent) {
  const value = event.createdAt ?? event.timestamp;
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function mergeTradeEvents(...groups: readonly PaperTradeEvent[][]): PaperTradeEvent[] {
  const byKey = new Map<string, PaperTradeEvent>();
  groups.flat().forEach((event, index) => {
    byKey.set(tradeEventKey(event, index), event);
  });
  return [...byKey.values()].sort((left, right) => {
    const timeDelta = tradeEventSortMs(right) - tradeEventSortMs(left);
    if (timeDelta !== 0) return timeDelta;
    const rightId = Number(right.id);
    const leftId = Number(left.id);
    if (Number.isFinite(rightId) && Number.isFinite(leftId)) return rightId - leftId;
    return 0;
  });
}

function mapMergedItemToHistoryItem(
  item: MergedTradeHistoryItem,
  locale: Locale,
  t: Translator
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
  const { data: access } = useSubscriberAccess();
  const fallback = useMemo(
    () => fallbackTraders.find((item) => item.id === traderId),
    [traderId]
  );
  const symbol: LeagueSymbol = "BTCUSDT";
  const [liveMarkPrice, setLiveMarkPrice] = useState<number | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TraderScenario | null>(null);
  const [selectedExecutionMarkerId, setSelectedExecutionMarkerId] = useState<string | null>(null);
  const [focusedExecutionMarkerId, setFocusedExecutionMarkerId] = useState<string | null>(null);
  const [liveAlert, setLiveAlert] = useState<LiveDetailAlert | null>(null);
  const [visibleScenarioCountByDate, setVisibleScenarioCountByDate] = useState<Record<string, number>>({});
  const [extraReviews, setExtraReviews] = useState<ManagementReview[]>([]);
  const [reviewsNextOffset, setReviewsNextOffset] = useState(DETAIL_INITIAL_REVIEWS_LIMIT);
  const [reviewsHasMore, setReviewsHasMore] = useState(true);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [historyItems, setHistoryItems] = useState<TradeHistoryItem[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [pagedTradeEvents, setPagedTradeEvents] = useState<PaperTradeEvent[]>([]);
  const [tradeEventsOffset, setTradeEventsOffset] = useState(0);
  const [tradeEventsHasMore, setTradeEventsHasMore] = useState(true);
  const [loadingMoreTradeEvents, setLoadingMoreTradeEvents] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateString(new Date()));
  const [weekStart, setWeekStart] = useState<Date>(() => getSunday(new Date()));
  const [clientHydrated, setClientHydrated] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<"feed" | "scenarios" | "holdings" | "journal" | "pnl">("scenarios");
  const historyLoadingRef = useRef(false);
  const historyContextKeyRef = useRef(`${traderId}:${symbol}`);
  const historyAbortRef = useRef<AbortController | null>(null);
  const tradeEventsLoadingRef = useRef(false);
  const tradeEventsContextKeyRef = useRef(`${traderId}:${symbol}:${locale}`);
  const tradeEventsAbortRef = useRef<AbortController | null>(null);
  const reviewsLoadingRef = useRef(false);
  const reviewsContextKeyRef = useRef(`${traderId}:${symbol}:${locale}`);
  const [hydratedDetailContextKey, setHydratedDetailContextKey] = useState<string | null>(null);

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
    const sameContext = historyContextKeyRef.current === requestContextKey;
    if (!reset && sameContext && !historyHasMore) return;
    if (historyLoadingRef.current && sameContext) return;
    historyAbortRef.current?.abort();
    const abortController = new AbortController();
    historyAbortRef.current = abortController;
    historyLoadingRef.current = true;
    historyContextKeyRef.current = requestContextKey;
    if (reset) {
      setHistoryItems([]);
      setHistoryOffset(0);
      setHistoryHasMore(true);
    }
    setLoadingMoreHistory(true);
    try {
      const res = await getTraderTradeHistory(traderId, symbol, 10, nextOffset, { signal: abortController.signal });
      const items = res.items || [];
      const mapped = items.map(item => mapMergedItemToHistoryItem(item, locale, t));
      if (historyContextKeyRef.current !== requestContextKey) return;
      
      setHistoryItems(prev => reset ? mapped : [...prev, ...mapped]);
      const responseNextOffset = Number.isFinite(res.nextOffset) ? res.nextOffset : nextOffset + items.length;
      setHistoryOffset(responseNextOffset);
      setHistoryHasMore(typeof res.hasMore === "boolean" ? res.hasMore : responseNextOffset < res.total);
    } catch (err) {
      if (abortController.signal.aborted || historyContextKeyRef.current !== requestContextKey || isAbortLike(err)) return;
      console.error("Failed to load trade history:", err);
    } finally {
      if (historyContextKeyRef.current === requestContextKey) {
        historyLoadingRef.current = false;
        setLoadingMoreHistory(false);
      }
      if (historyAbortRef.current === abortController) historyAbortRef.current = null;
    }
  }, [historyHasMore, traderId, symbol, locale, t]);

  const loadTradeEventsPage = useCallback(async (nextOffset: number, reset: boolean) => {
    const requestContextKey = `${traderId}:${symbol}:${locale}`;
    const sameContext = tradeEventsContextKeyRef.current === requestContextKey;
    if (!reset && sameContext && !tradeEventsHasMore) return;
    if (tradeEventsLoadingRef.current && sameContext) return;
    tradeEventsAbortRef.current?.abort();
    const abortController = new AbortController();
    tradeEventsAbortRef.current = abortController;
    tradeEventsLoadingRef.current = true;
    tradeEventsContextKeyRef.current = requestContextKey;
    if (reset) {
      setPagedTradeEvents([]);
      setTradeEventsOffset(0);
      setTradeEventsHasMore(true);
    }
    setLoadingMoreTradeEvents(true);
    try {
      const response = await getTraderTradeEvents(
        traderId,
        symbol,
        DETAIL_EVENTS_PAGE_SIZE,
        nextOffset,
        locale,
        { signal: abortController.signal }
      );
      if (tradeEventsContextKeyRef.current !== requestContextKey) return;
      const nextEvents = response.events ?? [];
      setPagedTradeEvents((current) => mergeTradeEvents(reset ? [] : current, nextEvents));
      const responseNextOffset = Number.isFinite(response.nextOffset) ? response.nextOffset : nextOffset + nextEvents.length;
      setTradeEventsOffset(responseNextOffset);
      setTradeEventsHasMore(typeof response.hasMore === "boolean" ? response.hasMore : nextEvents.length >= DETAIL_EVENTS_PAGE_SIZE);
    } catch (err) {
      if (abortController.signal.aborted || tradeEventsContextKeyRef.current !== requestContextKey || isAbortLike(err)) return;
      console.error("Failed to load trade events:", err);
    } finally {
      if (tradeEventsContextKeyRef.current === requestContextKey) {
        tradeEventsLoadingRef.current = false;
        setLoadingMoreTradeEvents(false);
      }
      if (tradeEventsAbortRef.current === abortController) tradeEventsAbortRef.current = null;
    }
  }, [locale, symbol, tradeEventsHasMore, traderId]);

  useEffect(() => {
    return () => {
      historyAbortRef.current?.abort();
      tradeEventsAbortRef.current?.abort();
    };
  }, []);

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
  const liveAlertStartedAtRef = useRef(Date.now());

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
    ...traderDetailBundleQueryOptions(traderId, symbol, locale),
    enabled: clientHydrated,
    placeholderData: (previousData, previousQuery) => {
      const queryKey = previousQuery?.queryKey;
      if (
        queryKey?.[0] === "league" &&
        queryKey?.[1] === "trader" &&
        queryKey?.[2] === traderId &&
        queryKey?.[3] === symbol &&
        queryKey?.[4] === locale
      ) {
        return previousData;
      }
      return clientHydrated ? getCachedTraderDetailBundle(traderId, symbol, locale) ?? fallbackDetailBundle : fallbackDetailBundle;
    }
  });

  const detailContextKey = `${traderId}:${symbol}:${locale}`;

  useEffect(() => {
    if (!detailQuery.data || detailQuery.isPlaceholderData) return;
    setHydratedDetailContextKey(detailContextKey);
  }, [detailContextKey, detailQuery.data, detailQuery.isPlaceholderData]);

  useEffect(() => {
    if (!clientHydrated || typeof window === "undefined" || typeof EventSource === "undefined") return;

    const executionEventsUrl = getTraderExecutionEventsUrl(traderId, symbol);
    if (!executionEventsUrl) return;

    const source = new EventSource(executionEventsUrl);
    const detailKey = traderDetailBundleQueryKey(traderId, symbol, locale);
    const leaderboardKey = leaderboardBundleQueryKey(symbol, locale);

    const refreshDetail = (event: Event) => {
      const message = event as MessageEvent<string>;
      try {
        const payload = JSON.parse(message.data || "{}") as {
          price?: number;
          eventTypes?: string[];
          filledOrderIds?: unknown[];
          closedPositionIds?: unknown[];
          rejectedOrderIds?: unknown[];
        };
        if (typeof payload.price === "number" && Number.isFinite(payload.price)) {
          setLiveMarkPrice(payload.price);
        }
        const hasExecutionChange = Boolean(
          payload.eventTypes?.length ||
          payload.filledOrderIds?.length ||
          payload.closedPositionIds?.length ||
          payload.rejectedOrderIds?.length
        );
        if (!hasExecutionChange) return;
      } catch {
        return;
      }

      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.refetchQueries({ queryKey: detailKey, type: "active" });
      void queryClient.invalidateQueries({ queryKey: leaderboardKey });
      void queryClient.invalidateQueries({ queryKey: ["paper"] });
      void queryClient.invalidateQueries({ queryKey: ["paper", "equity-snapshots", traderId, symbol] });
      lastTradeEventsRefreshKeyRef.current = null;
      void loadTradeEventsPage(0, true);
      void loadHistoryPage(0, true);
    };

    source.addEventListener("paper_execution", refreshDetail);
    return () => {
      source.removeEventListener("paper_execution", refreshDetail);
      source.close();
    };
  }, [clientHydrated, loadHistoryPage, loadTradeEventsPage, locale, queryClient, symbol, traderId]);

  const equitySnapshotsQuery = useQuery({
    queryKey: ["paper", "equity-snapshots", traderId, symbol],
    queryFn: (context) => getEquitySnapshots(45, traderId, symbol, { signal: context.signal }),
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
      reviews: mergeManagementReviews(bundle?.managementReviews ?? [], extraReviews),
      statusFeeds: bundle?.statusFeeds ?? [],
      events: bundle?.events ?? [],
      dailyPnl: bundle?.dailyPnl ?? [],
      reviewCountsByDay: bundle?.reviewCountsByDay ?? [],
      plans: bundle?.tradePlans ?? []
    };
  }, [detailQuery.data, extraReviews, fallback]);

  const hasRenderableDetail = Boolean(trader);
  const initialLoading = shouldShowTraderDetailInitialOverlay({
    hasRenderableDetail,
    isFetching: detailQuery.isFetching,
    isHydratedDetail: hydratedDetailContextKey === detailContextKey
  });
  const loading = detailQuery.isPending && !detailQuery.data && !hasRenderableDetail;
  const error = detailQuery.error ? (detailQuery.error instanceof Error ? detailQuery.error.message : String(detailQuery.error)) : null;

  const prefetchLeaderboard = useCallback(() => {
    void prefetchLeaderboardBundle(queryClient, symbol, locale);
  }, [locale, queryClient, symbol]);

  const standing = useMemo(() => {
    const standings = buildStandings(trader ? [trader] : fallbackTraders, summaries);
    return standings.find((item) => item.id === traderId) ?? standings[0];
  }, [summaries, trader, traderId]);

  const scenarioPositions = useMemo(() => buildScenarioPositions(positions, closedPositions), [closedPositions, positions]);
  const scenarios = useMemo(() => {
    if (!trader) return [];
    return buildScenarios({ trader, positions: scenarioPositions, orders, reviews, events });
  }, [events, orders, reviews, scenarioPositions, trader]);

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
  const accessState = access ?? guestSubscriberAccess;
  const holdingItems = useMemo(
    () => buildHoldingItems({ standing, positions, orders, latestPlan, symbol, locale, t, liveMarkPrice }),
    [latestPlan, liveMarkPrice, locale, orders, positions, standing, symbol, t]
  );
  const chartEvents = useMemo(() => mergeTradeEvents(pagedTradeEvents, events), [events, pagedTradeEvents]);
  const executionMarkers = useMemo(
    () => buildExecutionMarkers({
      events: chartEvents,
      positions,
      closedPositions,
      orders,
      symbol,
      locale,
      t,
      limit: 30
    }),
    [chartEvents, closedPositions, locale, orders, positions, symbol, t]
  );
  const defaultSelectedExecutionMarkerId = useMemo(
    () => defaultExecutionMarkerSelection({ markers: executionMarkers, positions }),
    [executionMarkers, positions]
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
  const tradeEventsRefreshKey = useMemo(() => {
    const latestEvent = events[0] ? `${events[0].id ?? ""}:${events[0].eventType ?? events[0].type ?? ""}:${events[0].createdAt ?? events[0].timestamp ?? ""}` : "";
    return `${traderId}:${symbol}:${locale}:${latestEvent}`;
  }, [events, locale, symbol, traderId]);

  const lastTraderIdRef = useRef<string | null>(null);
  const lastSymbolRef = useRef<string | null>(null);
  const lastHistoryRefreshKeyRef = useRef<string | null>(null);
  const lastTradeEventsRefreshKeyRef = useRef<string | null>(null);
  const lastScenarioHydrationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const keyChanged = lastTraderIdRef.current !== traderId || lastSymbolRef.current !== symbol;
    if (keyChanged) {
      lastTraderIdRef.current = traderId;
      lastSymbolRef.current = symbol;
      setVisibleScenarioCountByDate({});
      setExtraReviews([]);
      setReviewsNextOffset(DETAIL_INITIAL_REVIEWS_LIMIT);
      setReviewsHasMore(true);
      historyAbortRef.current?.abort();
      historyContextKeyRef.current = `${traderId}:${symbol}`;
      historyLoadingRef.current = false;
      lastHistoryRefreshKeyRef.current = null;
      lastTradeEventsRefreshKeyRef.current = null;
      setHistoryItems([]);
      setHistoryOffset(0);
      setHistoryHasMore(true);
      setLoadingMoreHistory(false);
      tradeEventsAbortRef.current?.abort();
      tradeEventsContextKeyRef.current = `${traderId}:${symbol}:${locale}`;
      tradeEventsLoadingRef.current = false;
      setPagedTradeEvents([]);
      setTradeEventsOffset(0);
      setTradeEventsHasMore(true);
      setLoadingMoreTradeEvents(false);
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
  }, [locale, symbol, traderId, scenarioTimelineItems]);

  useEffect(() => {
    const contextKey = `${traderId}:${symbol}:${locale}`;
    if (reviewsContextKeyRef.current === contextKey) return;
    reviewsContextKeyRef.current = contextKey;
    reviewsLoadingRef.current = false;
    setExtraReviews([]);
    setReviewsNextOffset(DETAIL_INITIAL_REVIEWS_LIMIT);
    setReviewsHasMore(true);
    tradeEventsAbortRef.current?.abort();
    tradeEventsContextKeyRef.current = contextKey;
    tradeEventsLoadingRef.current = false;
    setPagedTradeEvents([]);
    setTradeEventsOffset(0);
    setTradeEventsHasMore(true);
    setLoadingMoreTradeEvents(false);
  }, [locale, symbol, traderId]);

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
    if (!detailQuery.data || lastHistoryRefreshKeyRef.current === historyRefreshKey) return;
    lastHistoryRefreshKeyRef.current = historyRefreshKey;
    void loadHistoryPage(0, true);
  }, [detailQuery.data, historyRefreshKey, loadHistoryPage]);

  useEffect(() => {
    if (!detailQuery.data || lastTradeEventsRefreshKeyRef.current === tradeEventsRefreshKey) return;
    lastTradeEventsRefreshKeyRef.current = tradeEventsRefreshKey;
    void loadTradeEventsPage(0, true);
  }, [detailQuery.data, loadTradeEventsPage, tradeEventsRefreshKey]);

  useEffect(() => {
    setSelectedExecutionMarkerId((current) => {
      if (current && executionMarkers.some((marker) => marker.id === current)) return current;
      return defaultSelectedExecutionMarkerId;
    });
    setFocusedExecutionMarkerId((current) => {
      if (current && executionMarkers.some((marker) => marker.id === current)) return current;
      return null;
    });
  }, [defaultSelectedExecutionMarkerId, executionMarkers]);

  const selectExecutionMarker = useCallback((markerId: string) => {
    setSelectedExecutionMarkerId(markerId);
    setFocusedExecutionMarkerId(markerId);
  }, []);

  useEffect(() => {
    const latestItem = scenarioTimelineItems[0];
    if (liveAlertContextRef.current !== alertContextKey) {
      liveAlertContextRef.current = alertContextKey;
      liveAlertStartedAtRef.current = Date.now();
      liveAlertKeyRef.current = latestItem?.id ?? null;
      liveAlertHydratedRef.current = Boolean(latestItem);
      setLiveAlert(null);
      return;
    }

    const next = nextLiveDetailAlert({
      previousKey: liveAlertKeyRef.current,
      item: latestItem,
      hydrated: liveAlertHydratedRef.current,
      minSortMs: liveAlertStartedAtRef.current,
      t
    });
    liveAlertKeyRef.current = next.nextKey;
    liveAlertHydratedRef.current = Boolean(next.nextKey);
    if (next.alert) setLiveAlert(next.alert);
  }, [alertContextKey, scenarioTimelineItems, t]);

  const openLiveAlert = useCallback(() => {
    const scenario = liveAlert?.item.scenario;
    if (scenario) {
      const sourceKey = protectedScenarioSourceKey(traderId, symbol, scenario.id);
      if (isProtectedSourceUnlocked(accessState, sourceKey)) {
        setSelectedScenario(scenario);
      }
    }
    setLiveAlert(null);
  }, [accessState, liveAlert, symbol, traderId]);

  const loadMoreReviews = useCallback(async () => {
    const requestContextKey = `${traderId}:${symbol}:${locale}`;
    if (!reviewsHasMore) return;
    if (reviewsLoadingRef.current && reviewsContextKeyRef.current === requestContextKey) return;
    reviewsLoadingRef.current = true;
    reviewsContextKeyRef.current = requestContextKey;
    setLoadingMoreReviews(true);
    try {
      const response = await getTraderManagementReviews(
        traderId,
        symbol,
        DETAIL_REVIEWS_PAGE_SIZE,
        reviewsNextOffset,
        locale
      );
      if (reviewsContextKeyRef.current !== requestContextKey) return;
      setExtraReviews((current) => mergeManagementReviews(current, response.managementReviews));
      setReviewsNextOffset(response.nextOffset);
      setReviewsHasMore(response.hasMore);
    } catch (err) {
      console.error("Failed to load management reviews:", err);
    } finally {
      if (reviewsContextKeyRef.current === requestContextKey) {
        reviewsLoadingRef.current = false;
        setLoadingMoreReviews(false);
      }
    }
  }, [locale, reviewsHasMore, reviewsNextOffset, symbol, traderId]);

  const loadMoreSelectedScenarios = useCallback(() => {
    const loadedForDate = loadedScenarioCountByDate.get(selectedDate) ?? 0;
    if (selectedScenarioTotal > selectedScenarioVisibleCount) {
      setVisibleScenarioCountByDate((current) => ({
        ...current,
        [selectedDate]: nextVisibleCount(selectedScenarioVisibleCount, selectedScenarioTotal)
      }));
    }
    if (loadedForDate < selectedScenarioTotal && reviewsHasMore) {
      void loadMoreReviews();
    }
  }, [loadMoreReviews, loadedScenarioCountByDate, reviewsHasMore, selectedDate, selectedScenarioTotal, selectedScenarioVisibleCount]);

  const handleScenarioScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight < target.scrollHeight - 180) return;
    loadMoreSelectedScenarios();
  }, [loadMoreSelectedScenarios]);

  const onLoadMoreEvents = useCallback(() => {
    if (loadingMoreHistory || !historyHasMore) return;
    void loadHistory(false);
  }, [historyHasMore, loadHistory, loadingMoreHistory]);

  if (!trader || !standing) {
    return (
      <div className="relative min-h-[52vh] rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <PageLoadingOverlay
          active
          label={t("common.loadingTraderDetailData")}
          detail={t("common.loadingLiveDataDetail")}
        />
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="trader-detail-monitoring-shell" className="min-w-0 pb-8">
      <PageLoadingOverlay
        active={initialLoading}
        label={t("common.loadingTraderDetailData")}
        detail={t("common.loadingLiveDataDetail")}
      />

      <HeroHeader
        trader={trader}
        standing={standing}
        visual={visual}
        locale={locale}
        t={t}
        prefetchLeaderboard={prefetchLeaderboard}
      />

      <div className="mt-4 min-w-0 sm:mt-5">
        <ExecutionMarkerRail
          markers={executionMarkers}
          selectedId={selectedExecutionMarkerId}
          onSelect={selectExecutionMarker}
          onLoadMore={() => void loadTradeEventsPage(tradeEventsOffset, false)}
          hasMore={tradeEventsHasMore}
          loadingMore={loadingMoreTradeEvents}
          locale={locale}
          t={t}
          accessState={accessState}
          traderId={traderId}
          symbol={symbol}
        />
      </div>

      <section data-testid="top-chart-panel" className="mt-3 grid min-w-0 gap-3 sm:mt-4 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)] xl:gap-5">
        <div className="min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
          <DetailChart
            symbol={symbol}
            result={chartResult}
            paperPositions={positions}
            paperOrders={orders}
            paperEvents={chartEvents}
            managementReviews={reviews}
            executionMarkers={executionMarkers}
            selectedExecutionMarkerId={selectedExecutionMarkerId}
            focusedExecutionMarkerId={focusedExecutionMarkerId}
            onExecutionMarkerSelect={selectExecutionMarker}
            height={380}
            compact
            showPositionPanel={false}
            scenarios={scenarios}
            liveMarkPrice={liveMarkPrice}
            onLatestPriceChange={handleLatestPriceChange}
            onOpenScenario={setSelectedScenario}
          />
        </div>
        <div className="hidden xl:block relative h-full w-full min-h-0">
          <StatusFeedThread feeds={statusFeeds} locale={locale} t={t} isSubscribed={accessState.isSubscribed} className="absolute inset-0 h-full" />
        </div>
      </section>

      <div data-testid="detail-full-width-position-panel" className="mt-2 min-w-0">
        <BinancePositionPanel
          symbol={symbol}
          positions={positions}
          orders={orders}
          latestPlan={latestPlan}
          scenarios={scenarios}
          liveMarkPrice={liveMarkPrice}
          classificationFallback={tradeClassification(trader)}
          onOpenScenario={setSelectedScenario}
          isSubscribed={accessState.isSubscribed}
        />
      </div>

      {/* Desktop View (Side-by-side Grid) */}
      <section className="hidden xl:grid mt-4 grid-cols-[minmax(0,1fr)_420px] gap-5 mt-5">
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
              <div className="grid grid-cols-7 gap-3 pb-2 scrollbar-none">
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
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer select-none ${
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
                      <span className="text-sm font-bold mt-1 whitespace-nowrap">
                        {dateLabel}
                      </span>
                      <span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${
                        itemCount > 0
                          ? (isSelected ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400 font-semibold")
                          : "text-zinc-400 dark:text-zinc-650"
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
                {filteredTimelineItems.map((item, index) => {
                  if (!item.scenario) {
                    return (
                      <TimelineRow
                        key={item.id}
                        item={item}
                        index={index}
                      />
                    );
                  }
                  const sourceKey = protectedScenarioSourceKey(traderId, symbol, item.scenario.id);
                  const scenarioUnlocked = isProtectedSourceUnlocked(accessState, sourceKey);
                  return (
                    <ProtectedContentGate
                      key={item.id}
                      mode="coupon"
                      sourceKey={sourceKey}
                      sourceType="scenario"
                      traderId={traderId}
                      symbol={symbol}
                      onUnlocked={() => setSelectedScenario(item.scenario ?? null)}
                      deferLockedChildren
                      lockedPreview={<LockedScenarioTimelinePreview t={t} />}
                    >
                      <TimelineRow
                        item={item}
                        index={index}
                        onClick={scenarioUnlocked ? () => setSelectedScenario(item.scenario ?? null) : undefined}
                      />
                    </ProtectedContentGate>
                  );
                })}
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
                disabled={loadingMoreReviews}
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
          tradeHistoryItems={historyItems}
          pnlCalendar={pnlCalendar}
          standing={standing}
          latestPlan={latestPlan}
          locale={locale}
          t={t}
          onLoadMoreEvents={onLoadMoreEvents}
          historyHasMore={historyHasMore}
          loadingMoreHistory={loadingMoreHistory}
        />
      </section>

      {/* Mobile View (Tab System) */}
      <section className="xl:hidden mt-4 space-y-4">
        {/* Mobile sliding tab menu */}
        <div className="border-b border-zinc-200 dark:border-zinc-800/80 pb-0.5 overflow-x-auto scrollbar-none flex">
          <div className="flex flex-row flex-nowrap gap-5 pb-2 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setMobileActiveTab("scenarios")}
              className={`relative pb-2.5 transition shrink-0 ${mobileActiveTab === "scenarios" ? "text-zinc-950 font-bold dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
            >
              <span>{t("detail.scenarios")}</span>
              {mobileActiveTab === "scenarios" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-950 dark:bg-white" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab("feed")}
              className={`relative pb-2.5 transition shrink-0 ${mobileActiveTab === "feed" ? "text-zinc-950 font-bold dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
            >
              <span>{t("detail.statusFeed")}</span>
              {mobileActiveTab === "feed" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-950 dark:bg-white" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab("holdings")}
              className={`relative pb-2.5 transition shrink-0 ${mobileActiveTab === "holdings" ? "text-zinc-950 font-bold dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
            >
              <span>{t("detail.holdingStatus")}</span>
              {mobileActiveTab === "holdings" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-950 dark:bg-white" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab("journal")}
              className={`relative pb-2.5 transition shrink-0 ${mobileActiveTab === "journal" ? "text-zinc-950 font-bold dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
            >
              <span>{t("detail.tradingJournal")}</span>
              {mobileActiveTab === "journal" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-950 dark:bg-white" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setMobileActiveTab("pnl")}
              className={`relative pb-2.5 transition shrink-0 ${mobileActiveTab === "pnl" ? "text-zinc-950 font-bold dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"}`}
            >
              <span>{t("calendar.pnlTitle")}</span>
              {mobileActiveTab === "pnl" && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-950 dark:bg-white" />
              )}
            </button>
          </div>
        </div>

        {/* Tab contents */}
        <div className="min-w-0">
          {mobileActiveTab === "feed" && (
            <StatusFeedThread feeds={statusFeeds} locale={locale} t={t} isSubscribed={accessState.isSubscribed} />
          )}

          {mobileActiveTab === "scenarios" && (
            <section className="rounded-2xl bg-white px-4 py-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800 sm:px-5 sm:py-6">
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
                <div className="flex flex-row flex-nowrap md:grid md:grid-cols-7 gap-2 md:gap-3 overflow-x-auto pb-2 scrollbar-none">
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
                        className={`flex-1 min-w-[82px] shrink-0 md:min-w-0 flex flex-col items-center justify-center px-1.5 py-3 md:p-3 rounded-xl border text-center transition cursor-pointer select-none ${
                          isSelected
                            ? "bg-blue-50/50 border-blue-500 text-blue-900 dark:bg-blue-950/30 dark:border-blue-500 dark:text-blue-200"
                            : "bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900/50"
                        }`}
                      >
                        <span className={`text-[10px] md:text-xs font-semibold ${
                          isSelected 
                            ? "text-blue-600 dark:text-blue-400" 
                            : "text-zinc-400 dark:text-zinc-500"
                        }`}>
                          {dayName}
                        </span>
                        <span className="text-xs md:text-sm font-bold mt-1 whitespace-nowrap">
                          {dateLabel}
                        </span>
                        <span className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${
                          itemCount > 0
                            ? (isSelected ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400 font-semibold")
                            : "text-zinc-400 dark:text-zinc-650"
                        }`}>
                          {subtext}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div data-testid="scenario-timeline" className="relative mt-6 max-h-[620px] overflow-y-auto pr-1" onScroll={handleScenarioScroll}>
                <div className="space-y-7">
                  {filteredTimelineItems.map((item, index) => {
                    if (!item.scenario) {
                      return (
                        <TimelineRow
                          key={item.id}
                          item={item}
                          index={index}
                        />
                      );
                    }
                    const sourceKey = protectedScenarioSourceKey(traderId, symbol, item.scenario.id);
                    const scenarioUnlocked = isProtectedSourceUnlocked(accessState, sourceKey);
                    return (
                      <ProtectedContentGate
                        key={item.id}
                        mode="coupon"
                        sourceKey={sourceKey}
                        sourceType="scenario"
                        traderId={traderId}
                        symbol={symbol}
                        onUnlocked={() => setSelectedScenario(item.scenario ?? null)}
                        deferLockedChildren
                        lockedPreview={<LockedScenarioTimelinePreview t={t} />}
                      >
                        <TimelineRow
                          item={item}
                          index={index}
                          onClick={scenarioUnlocked ? () => setSelectedScenario(item.scenario ?? null) : undefined}
                        />
                      </ProtectedContentGate>
                    );
                  })}
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
          )}

          {mobileActiveTab === "holdings" && (
            <HoldingPanel
              items={holdingItems}
              asOf={formatDateTime(standing.summary?.updatedAt ?? latestPlan.createdAt, locale)}
              t={t}
            />
          )}

          {mobileActiveTab === "journal" && (
            <TradingJournal
              tradeHistoryItems={historyItems}
              t={t}
              onLoadMore={() => void loadHistory(false)}
              hasMore={historyHasMore}
              loadingMore={loadingMoreHistory}
            />
          )}

          {mobileActiveTab === "pnl" && (
            <PnlCalendarPanel calendar={pnlCalendar} locale={locale} t={t} />
          )}

        </div>
      </section>

      {error ? <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{error}</div> : null}
      {loading && !initialLoading ? <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">{t("common.loading")}</div> : null}

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
