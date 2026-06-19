"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { CircleNotch } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { ConsensusAveragePrices } from "@/components/consensus-average-prices";
import { ConsensusHourlyOpinion } from "@/components/consensus-hourly-opinion";
import { 
  getCachedLeaderboardBundle, 
  getRecentTradePlans, 
  getLeagueSentimentOpinion,
  LEAGUE_LIVE_REFETCH_INTERVAL_MS, 
  leaderboardBundleQueryOptions,
  type LeaderboardBundle,
  type TraderProfile,
  type PaperPosition,
  type PaperOrder,
  type ManagementReview,
  type TraderPaperSummary
} from "@/lib/api";
import { buildScenarios, buildStandings, traderVisuals } from "@/lib/league";
import { fallbackTraders } from "@/lib/traders";
import { formatNumber } from "@/lib/format";
import { type Locale } from "@/lib/i18n";

// Nationalities for traders
const traderFlags: Record<string, string> = {
  "channel-rider": "🇰🇷",
  "volume-breaker": "🇰🇷",
  "pullback-architect": "🇰🇷",
  "leverage-hunter": "🇰🇷",
  "liquidity-reaper": "🇺🇸",
  "volatility-squeezer": "🇰🇷",
  "trend-sentinel": "🇺🇸",
  "range-maker": "🇰🇷",
  "funding-contrarian": "🇰🇷",
  "orderflow-sniper": "🇺🇸",
  "donchian-breakout": "₿",
  "ichimoku-cloud-pilot": "₿",
  "vwap-reclaimer": "₿",
  "wyckoff-spring": "₿",
  "rsi-divergence-scout": "₿",
  "session-raider": "₿",
  "imbalance-hunter": "₿",
  "momentum-ignition": "₿",
  "bollinger-reversion": "₿",
  "atr-trail-commander": "₿"
};

function normalizeSide(value?: string | null): "long" | "short" | undefined {
  const side = String(value ?? "").toLowerCase();
  if (side === "long" || side === "buy") return "long";
  if (side === "short" || side === "sell") return "short";
  return undefined;
}

function normalizeStatusText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function isActivePosition(status?: string | null) {
  const normalized = normalizeStatusText(status);
  return !["CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(normalized);
}

function isActiveOrder(status?: string | null) {
  const normalized = normalizeStatusText(status);
  return !["FILLED", "CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(normalized);
}

function numberValue(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function planEntryPrice(plan?: Record<string, any>) {
  const payload = (plan?.payload ?? {}) as Record<string, any>;
  const entries = Array.isArray(plan?.entries) ? plan?.entries : Array.isArray(payload.entries) ? payload.entries : [];
  const firstEntry = entries[0] as Record<string, any> | undefined;
  return numberValue(firstEntry?.price, plan?.entryPrice, plan?.price, payload.entryPrice, payload.price);
}

function getTradersNativeSignal(traderId: string): string | null {
  if (traderId.includes("rsi-divergence")) return "rsi";
  if (traderId.includes("pullback-architect")) return "ema";
  if (traderId.includes("volume-breaker")) return "volume";
  if (traderId.includes("liquidity-reaper")) return "liquidity";
  if (traderId.includes("volatility-squeezer")) return "squeeze";
  if (traderId.includes("donchian-breakout")) return "donchian";
  if (traderId.includes("ichimoku-cloud-pilot")) return "ichimoku";
  if (traderId.includes("wyckoff-spring")) return "wyckoff";
  if (traderId.includes("orderflow-sniper")) return "orderflow";
  if (traderId.includes("leverage-hunter") || traderId.includes("funding-contrarian")) return "funding";
  if (traderId.includes("bollinger-reversion")) return "rsi";
  if (traderId.includes("channel-rider")) return "ema";
  if (traderId.includes("vwap-reclaimer")) return "volume";
  return null;
}

type TraderActiveState = {
  traderId: string;
  status: "inPosition" | "pendingEntry" | "watching";
  side?: "long" | "short";
  leverage: number | null;
  price: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  unrealizedPnl: number | null;
  label: string;
  detail: string;
  tone: "good" | "bad" | "warn" | "neutral";
};

function getTraderActiveState(
  trader: TraderProfile,
  summary: TraderPaperSummary | undefined,
  positions: PaperPosition[],
  orders: PaperOrder[],
  pendingPlans: Array<Record<string, any>>,
  t: (key: string) => string
): TraderActiveState {
  // 1. In position (진입 중)
  const position = positions.find((p) => p.traderId === trader.id && isActivePosition(p.status));
  if (position) {
    const side = normalizeSide(position.side);
    const leverage = position.leverage ?? summary?.leverage ?? null;
    const price = numberValue(position.averageEntryPrice, position.entryPrice, position.price) ?? null;
    const pnl = numberValue(position.unrealizedPnl, summary?.unrealizedPnl);
    const pnlText = pnl !== null ? (pnl >= 0 ? `+${pnl.toFixed(1)} USDT` : `${pnl.toFixed(1)} USDT`) : "";
    const takeProfit = numberValue(
      position.takeProfit,
      position.takeProfitPrice,
      position.take_profit_price,
      position.payload?.takeProfit,
      position.payload?.takeProfitPrice,
      position.payload?.target?.price
    );
    const stopLoss = numberValue(
      position.stopLoss,
      position.stopLossPrice,
      position.stop_loss_price,
      position.payload?.stopLoss,
      position.payload?.stopLossPrice
    );

    return {
      traderId: trader.id,
      status: "inPosition",
      side,
      leverage,
      price,
      takeProfit,
      stopLoss,
      unrealizedPnl: pnl,
      label: t("leaderboard.status.inPosition"),
      detail: pnlText,
      tone: pnl !== null && pnl < 0 ? "bad" : "good",
    };
  }

  // 2. Pending entry (진입 대기)
  const order = orders.find((o) => o.traderId === trader.id && isActiveOrder(o.status));
  if (order) {
    const side = normalizeSide(order.side);
    const leverage = order.leverage ?? summary?.leverage ?? null;
    const price = numberValue(order.price, order.limitPrice, order.stopPrice) ?? null;
    const takeProfit = numberValue(
      order.takeProfit,
      order.takeProfitPrice,
      order.take_profit_price,
      order.payload?.takeProfit,
      order.payload?.takeProfitPrice,
      order.payload?.target?.price
    );
    const stopLoss = numberValue(
      order.stopLoss,
      order.stopLossPrice,
      order.stop_loss_price,
      order.payload?.stopLoss,
      order.payload?.stopLossPrice
    );

    return {
      traderId: trader.id,
      status: "pendingEntry",
      side,
      leverage,
      price,
      takeProfit,
      stopLoss,
      unrealizedPnl: null,
      label: t("leaderboard.status.pendingEntry"),
      detail: price ? `@${price.toLocaleString()}` : "",
      tone: "warn",
    };
  }

  return {
    traderId: trader.id,
    status: "watching",
    side: undefined,
    leverage: null,
    price: null,
    takeProfit: null,
    stopLoss: null,
    unrealizedPnl: null,
    label: t("leaderboard.status.watching"),
    detail: t("leaderboard.status.noSetup"),
    tone: "neutral",
  };
}

function formatProviderName(provider: string) {
  const p = provider.toLowerCase();
  if (p.includes("gemini")) return "Gemini 2.5 Pro";
  if (p.includes("gpt")) return "GPT-4o";
  if (p.includes("claude")) return "Claude 3.5 Sonnet";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function ConsensusPageClient() {
  const { locale, t } = useAppContext();
  const [cacheReady, setCacheReady] = useState(false);

  const fallbackBundle = useMemo<LeaderboardBundle>(() => ({
    symbol: "BTCUSDT",
    traders: fallbackTraders as unknown as TraderProfile[],
    summaries: [],
    positions: [],
    orders: [],
    managementReviews: [],
    statusFeeds: [],
    scanner: null
  }), []);

  useEffect(() => {
    setCacheReady(true);
  }, []);

  // Fetch leaderboard bundle
  const btcQuery = useQuery({
    ...leaderboardBundleQueryOptions("BTCUSDT", locale),
    placeholderData: (previousData) => {
      if (previousData?.symbol === "BTCUSDT") return previousData;
      return cacheReady ? getCachedLeaderboardBundle("BTCUSDT", locale) ?? fallbackBundle : fallbackBundle;
    }
  });

  const hourlyOpinionQuery = useQuery({
    queryKey: ["league", "sentiment-opinion", "BTCUSDT", locale],
    queryFn: () => getLeagueSentimentOpinion("BTCUSDT", locale),
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  // Fetch pending trade plans
  const pendingPlansQuery = useQuery({
    queryKey: ["league", "trade-plans", "BTCUSDT", "pending"],
    queryFn: async () => {
      try {
        const res = await getRecentTradePlans(100, "BTCUSDT", undefined, "PAPER_TRADING_PENDING");
        if (Array.isArray(res)) return res;
        if (res && typeof res === "object") {
          const record = res as Record<string, any>;
          if (Array.isArray(record.tradePlans)) return record.tradePlans;
          if (Array.isArray(record.plans)) return record.plans;
        }
      } catch (e) {
        console.error("Failed to fetch pending plans:", e);
      }
      return [];
    },
    placeholderData: (previousData) => previousData ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
  });

  const bundle = btcQuery.data ?? fallbackBundle;
  const pendingPlans = pendingPlansQuery.data ?? [];
  const liveDataRefreshing = btcQuery.isFetching || pendingPlansQuery.isFetching || hourlyOpinionQuery.isFetching;

  const traders = bundle.traders?.length ? bundle.traders : (fallbackTraders as unknown as TraderProfile[]);
  const standings = useMemo(() => buildStandings(traders, bundle.summaries ?? []), [bundle.summaries, traders]);

  // Combine standing and active trade state
  const tradersWithStates = useMemo(() => {
    const summaryMap = new Map(bundle.summaries.map((s) => [s.traderId, s]));
    return standings.map((standing) => {
      const summary = summaryMap.get(standing.id);
      const activeState = getTraderActiveState(
        standing,
        summary,
        bundle.positions ?? [],
        bundle.orders ?? [],
        pendingPlans,
        t
      );

      // Extract scenarios
      const traderPositions = (bundle.positions ?? []).filter((p) => p.traderId === standing.id);
      const traderOrders = (bundle.orders ?? []).filter((o) => o.traderId === standing.id);
      const traderReviews = (bundle.managementReviews ?? []).filter((r) => r.traderId === standing.id || r.trader_id === standing.id);
      
      const scenarios = buildScenarios({
        trader: standing,
        positions: traderPositions,
        orders: traderOrders,
        reviews: traderReviews,
        events: []
      });

      const activeScenario = scenarios[0];
      const activePosition = traderPositions.find(p => isActivePosition(p.status));
      const activeOrder = traderOrders.find(o => isActiveOrder(o.status));
      const activePayload = activePosition?.payload || activeOrder?.payload || {};

      let rationale = activeScenario?.rationale || activeScenario?.summary || activePayload?.aiApprovalReason || activePayload?.entryReason || activePayload?.managementRationale;
      
      if (!rationale && (activeState.status === "inPosition" || activeState.status === "pendingEntry")) {
        rationale = t("consensus.entryAnalysisLoading");
      } else if (!rationale) {
        rationale = standing.description;
      }

      return {
        ...standing,
        activeState,
        activeScenario,
        rationale
      };
    });
  }, [standings, bundle, pendingPlans, locale, t]);

  // Strict Filter: Only inPosition or pendingEntry
  const activeTraders = useMemo(() => {
    return tradersWithStates.filter(
      t => t.activeState.status === "inPosition" || t.activeState.status === "pendingEntry"
    );
  }, [tradersWithStates]);

  // Count/Weighted sentiment ratios strictly for active traders
  const ratioStats = useMemo(() => {
    const longTraders = activeTraders.filter(t => t.activeState.side === "long");
    const shortTraders = activeTraders.filter(t => t.activeState.side === "short");
    const totalCount = activeTraders.length;

    const longWeight = longTraders.reduce((sum, t) => sum + (t.activeState.leverage ?? 5), 0);
    const shortWeight = shortTraders.reduce((sum, t) => sum + (t.activeState.leverage ?? 5), 0);
    const totalWeight = longWeight + shortWeight;

    const longPct = totalCount > 0 ? (longTraders.length / totalCount) * 100 : 50;
    const shortPct = totalCount > 0 ? (shortTraders.length / totalCount) * 100 : 50;

    const longWeightedPct = totalWeight > 0 ? (longWeight / totalWeight) * 100 : 50;
    const shortWeightedPct = totalWeight > 0 ? (shortWeight / totalWeight) * 100 : 50;

    return {
      longCount: longTraders.length,
      shortCount: shortTraders.length,
      totalCount,
      longWeight,
      shortWeight,
      totalWeight,
      longPct,
      shortPct,
      longWeightedPct,
      shortWeightedPct
    };
  }, [activeTraders]);

  // Group active averages: Entry, StopLoss, TakeProfit
  const averages = useMemo(() => {
    const longTraders = activeTraders.filter(t => t.activeState.side === "long");
    const shortTraders = activeTraders.filter(t => t.activeState.side === "short");

    const calcAvg = (list: typeof activeTraders, key: "price" | "takeProfit" | "stopLoss") => {
      const valid = list.map(t => t.activeState[key]).filter((v): v is number => v !== null && v > 0);
      return valid.length > 0 ? valid.reduce((sum, val) => sum + val, 0) / valid.length : null;
    };

    return {
      long: {
        entry: calcAvg(longTraders, "price"),
        tp: calcAvg(longTraders, "takeProfit"),
        sl: calcAvg(longTraders, "stopLoss")
      },
      short: {
        entry: calcAvg(shortTraders, "price"),
        tp: calcAvg(shortTraders, "takeProfit"),
        sl: calcAvg(shortTraders, "stopLoss")
      }
    };
  }, [activeTraders]);

  const activeLongTraders = useMemo(() => {
    const sortActiveTraders = (a: any, b: any) => {
      if (a.activeState.status === "inPosition" && b.activeState.status !== "inPosition") return -1;
      if (a.activeState.status !== "inPosition" && b.activeState.status === "inPosition") return 1;
      if (a.activeState.status === "inPosition" && b.activeState.status === "inPosition") {
        const pnlA = a.activeState.unrealizedPnl ?? 0;
        const pnlB = b.activeState.unrealizedPnl ?? 0;
        return pnlB - pnlA;
      }
      return 0;
    };
    return activeTraders
      .filter(t => t.activeState.side === "long")
      .sort(sortActiveTraders);
  }, [activeTraders]);

  const activeShortTraders = useMemo(() => {
    const sortActiveTraders = (a: any, b: any) => {
      if (a.activeState.status === "inPosition" && b.activeState.status !== "inPosition") return -1;
      if (a.activeState.status !== "inPosition" && b.activeState.status === "inPosition") return 1;
      if (a.activeState.status === "inPosition" && b.activeState.status === "inPosition") {
        const pnlA = a.activeState.unrealizedPnl ?? 0;
        const pnlB = b.activeState.unrealizedPnl ?? 0;
        return pnlB - pnlA;
      }
      return 0;
    };
    return activeTraders
      .filter(t => t.activeState.side === "short")
      .sort(sortActiveTraders);
  }, [activeTraders]);
  // Non-active traders are watching
  const watchingTraders = useMemo(() => {
    return tradersWithStates.filter(
      t => t.activeState.status !== "inPosition" && t.activeState.status !== "pendingEntry"
    );
  }, [tradersWithStates]);

  const loading = btcQuery.isPending && !btcQuery.data;
  const error = btcQuery.error ? t("common.liveDataUnavailable") : null;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6 animate-pulse">
        <div className="h-20 w-full rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5" />
        <div className="h-36 w-full rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5" />
        <div className="h-96 rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 py-8 animate-rise grid gap-6 md:gap-8">
      {/* Title Header Row */}
      <div data-testid="consensus-command-header" className="flex flex-col gap-4 border-b border-zinc-200/80 pb-6 dark:border-white/[0.08] md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white md:text-3xl break-keep">
            {t("consensus.title")}
          </h1>
          <p className="text-zinc-600 mt-1.5 max-w-xl text-sm leading-relaxed break-keep dark:text-zinc-400">
            {t("consensus.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
          {liveDataRefreshing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400">
              <CircleNotch className="animate-spin" size={13} />
              {t("common.loading")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              LIVE MONITORING
            </span>
          )}
        </div>
      </div>

      <div data-testid="consensus-hourly-opinion">
        <ConsensusHourlyOpinion
          data={hourlyOpinionQuery.data}
          isFetching={hourlyOpinionQuery.isFetching}
          locale={locale}
          t={t}
        />
      </div>

      {/* Top Ratio and Averages Panel */}
      <div className="grid min-w-0 gap-6 md:grid-cols-2">
        {/* Left Side: Long/Short Ratio Panel */}
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col justify-between shadow-sm dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-6">
          <div>
            <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider mb-1 dark:text-zinc-300">
              {t("consensus.ratioOverview")}
            </h2>
            <p className="text-[11px] text-zinc-500">
              {t("consensus.activeTradersOnly")}
            </p>

            {ratioStats.totalCount === 0 ? (
              <p className="text-zinc-500 text-xs py-10 text-center">{t("consensus.noActivePositions")}</p>
            ) : (
              <div className="mt-6 space-y-6">
                {/* Trader Count Split */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    <span>{t("consensus.countRatio")}</span>
                    <span className="font-mono">
                      L {ratioStats.longCount} ({ratioStats.longPct.toFixed(0)}%) / S {ratioStats.shortCount} ({ratioStats.shortPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden flex ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-white/5">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${ratioStats.longPct}%` }} />
                    <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${ratioStats.shortPct}%` }} />
                  </div>
                </div>

                {/* Leverage Weighted Split */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    <span>{t("consensus.leverageWeighted")}</span>
                    <span className="font-mono">
                      L {ratioStats.longWeight}x ({ratioStats.longWeightedPct.toFixed(0)}%) / S {ratioStats.shortWeight}x ({ratioStats.shortWeightedPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden flex ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-white/5">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${ratioStats.longWeightedPct}%` }} />
                    <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${ratioStats.shortWeightedPct}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Averages Table Panel */}
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm flex flex-col justify-between dark:border-white/[0.08] dark:bg-white/[0.025] sm:p-6">
          <div>
            <h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider mb-1 dark:text-zinc-300">
              {t("consensus.avgPrices")}
            </h2>
            <p className="text-[11px] text-zinc-500">
              {t("consensus.activeTradersOnly")}
            </p>

            <ConsensusAveragePrices averages={averages} locale={locale} t={t} />
          </div>
        </div>
      </div>

      {/* Split Column Board for Active Perspectives */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Long Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
            <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              {t("consensus.activeLongSide")}
            </h3>
            <span className="font-mono text-xs font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              {activeLongTraders.length}
            </span>
          </div>

          {activeLongTraders.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 text-xs dark:border-white/[0.06] dark:bg-[#0c0d0d]">
              {t("consensus.noActivePositions")}
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {activeLongTraders.map((trader) => (
                <ActiveTraderRow key={trader.id} trader={trader} locale={locale} t={t} />
              ))}
            </div>
          )}
        </div>

        {/* Active Short Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
            <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
              {t("consensus.activeShortSide")}
            </h3>
            <span className="font-mono text-xs font-bold bg-rose-500/10 text-rose-400 px-2.5 py-0.5 rounded-full border border-rose-500/20">
              {activeShortTraders.length}
            </span>
          </div>

          {activeShortTraders.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 text-xs dark:border-white/[0.06] dark:bg-[#0c0d0d]">
              {t("consensus.noActivePositions")}
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {activeShortTraders.map((trader) => (
                <ActiveTraderRow key={trader.id} trader={trader} locale={locale} t={t} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Watchlist Section */}
      <section className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-white/10">
          <h2 className="text-sm font-bold text-zinc-600 flex items-center gap-2 dark:text-zinc-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
            {t("consensus.watchingSide")}
          </h2>
          <span className="font-mono text-xs font-bold bg-zinc-100 text-zinc-500 px-2.5 py-0.5 rounded-full border border-zinc-200 dark:bg-white/[0.04] dark:text-zinc-400 dark:border-white/10">
            {watchingTraders.length}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {watchingTraders.map((trader) => {
            const visual = traderVisuals[trader.id] ?? { tone: "from-zinc-500 to-zinc-700", initials: "AI", alias: trader.name };
            const flag = traderFlags[trader.id] || "🇰🇷";
            return (
              <div 
                key={trader.id}
                className="group relative rounded-xl border border-zinc-200 bg-white p-3 flex flex-col justify-between hover:border-zinc-300 hover:bg-zinc-50 transition-all duration-300 shadow-sm dark:border-white/[0.06] dark:bg-[#0c0d0d] dark:hover:border-white/10 dark:hover:bg-[#111313]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`shrink-0 size-7 rounded bg-gradient-to-br ${visual.tone} flex items-center justify-center text-[9px] font-mono font-bold text-white shadow-sm`}>
                      {visual.initials}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-950 truncate flex items-center gap-1.5 dark:text-white">
                        {trader.name}
                        <span className="text-[10px] shrink-0" title="Flag">{flag}</span>
                      </h4>
                      <p className="text-[9px] text-zinc-500 font-mono truncate uppercase mt-0.5">{visual.alias}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[8px] font-extrabold text-zinc-500 border border-zinc-200 dark:bg-white/[0.04] dark:text-zinc-400 dark:border-white/5">
                      {trader.activeState.detail || t("leaderboard.status.watching")}
                    </span>
                  </div>
                </div>

                <p className="text-zinc-500 text-[10px] mt-2 leading-relaxed line-clamp-1 italic">
                  {trader.concept || trader.description}
                </p>

                <div className="mt-3 border-t border-zinc-100 pt-2 flex items-center justify-between dark:border-white/[0.04]">
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-zinc-500 font-medium">30D Return</span>
                    <span className={`font-mono font-bold ${trader.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {trader.returnPct >= 0 ? "+" : ""}{trader.returnPct.toFixed(1)}%
                    </span>
                  </div>
                  <Link 
                    href={`/traders/${trader.id}`} 
                    className="focus-ring inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <span>{t("leaderboard.viewTrader")} →</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function ActiveTraderRow({ trader, locale, t }: { trader: any; locale: Locale; t: (key: string) => string }) {
  const visual = traderVisuals[trader.id] ?? { tone: "from-zinc-500 to-zinc-700", initials: "AI", alias: trader.name };
  const flag = traderFlags[trader.id] || "🇰🇷";
  const { activeState, rationale } = trader;
  const isLong = activeState.side === "long";

  // State colors
  const statusToneClass = activeState.tone === "good" 
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : activeState.tone === "bad" 
      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
      : activeState.tone === "warn"
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-400 dark:border-zinc-700/50";

  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white p-4 flex flex-col justify-between hover:border-zinc-300 hover:bg-zinc-50 transition-all duration-300 shadow-md dark:border-white/[0.06] dark:bg-[#0c0d0d] dark:hover:border-white/10 dark:hover:bg-[#111313]">
      <div>
        {/* Header Info */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`shrink-0 size-8 rounded bg-gradient-to-br ${visual.tone} flex items-center justify-center text-[10px] font-mono font-bold text-white shadow-md`}>
              {visual.initials}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-zinc-950 truncate flex items-center gap-1.5 dark:text-white">
                {trader.name}
                <span className="text-[10px] shrink-0" title="Flag">{flag}</span>
              </h4>
              <p className="text-[9px] text-zinc-500 font-mono tracking-wider uppercase mt-0.5">{visual.alias}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-extrabold uppercase border ${statusToneClass}`}>
              {activeState.label}
            </span>
            {activeState.status === "inPosition" && activeState.unrealizedPnl !== null && (
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-mono font-bold border ${
                activeState.unrealizedPnl >= 0 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}>
                {activeState.detail}
              </span>
            )}
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-extrabold tracking-wider border ${
              isLong 
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
            }`}>
              {isLong ? "LONG" : "SHORT"} {activeState.leverage ? `${activeState.leverage}x` : ""}
            </span>
          </div>
        </div>

        {/* Price Targets */}
        {(activeState.price || activeState.takeProfit || activeState.stopLoss) && (
          <div className="mt-3 bg-zinc-50 border border-zinc-100 rounded-lg p-2 grid grid-cols-3 gap-2 text-center text-[9px] font-mono dark:bg-white/[0.01] dark:border-white/[0.04]">
            <div>
              <p className="text-zinc-500 uppercase font-semibold">{t("detail.averageEntry")}</p>
              <p className="mt-0.5 font-bold text-zinc-950 dark:text-zinc-200">
                {activeState.price ? `$${formatNumber(activeState.price, 0, locale)}` : "-"}
              </p>
            </div>
            <div>
              <p className="text-emerald-500/80 uppercase font-semibold">Target TP</p>
              <p className="mt-0.5 font-bold text-emerald-400">
                {activeState.takeProfit ? `$${formatNumber(activeState.takeProfit, 0, locale)}` : "-"}
              </p>
            </div>
            <div>
              <p className="text-rose-500/80 uppercase font-semibold">Stop Loss</p>
              <p className="mt-0.5 font-bold text-rose-400">
                {activeState.stopLoss ? `$${formatNumber(activeState.stopLoss, 0, locale)}` : "-"}
              </p>
            </div>
          </div>
        )}

        {/* Justification Box (진입이유) */}
        <div className="mt-3">
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{t("consensus.entryReason")}</p>
          <div className={`border-l-2 ${isLong ? "border-emerald-500/40" : "border-rose-500/40"} pl-3 py-1 bg-zinc-50 rounded-r dark:bg-white/[0.01]`}>
            <p className="text-xs text-zinc-700 leading-relaxed italic dark:text-zinc-300">
              “{rationale}”
            </p>
            {trader.activeScenario && (
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
                <span>{formatProviderName(trader.activeScenario.provider || "System")}</span>
                {trader.activeScenario.confidence && (
                  <span className="font-bold text-zinc-400">Confidence: {trader.activeScenario.confidence}%</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-zinc-100 pt-2 flex justify-end dark:border-white/[0.04]">
        <Link 
          href={`/traders/${trader.id}`} 
          className={`focus-ring inline-flex items-center gap-1 text-[10px] font-bold transition-colors ${
            isLong ? "text-emerald-400 hover:text-emerald-300" : "text-rose-400 hover:text-rose-300"
          }`}
        >
          <span>{t("leaderboard.viewTrader")} →</span>
        </Link>
      </div>
    </div>
  );
}
