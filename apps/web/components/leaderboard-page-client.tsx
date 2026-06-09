"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIcon,
  ArrowRight,
  Brain,
  Calendar,
  CaretDown,
  CaretRight,
  ChartLineUp,
  CircleNotch,
  Gauge,
  ShieldCheck,
  Trophy
} from "@phosphor-icons/react";
import {
  getEquitySnapshots,
  getCachedLeaderboardBundle,
  getRecentTradePlans,
  LEAGUE_LIVE_REFETCH_INTERVAL_MS,
  leaderboardBundleQueryOptions,
  prefetchLeaderboardBundle,
  prefetchTraderDetailBundle,
  type EquitySnapshot,
  type LeaderboardBundle,
  type ManagementReview,
  type PaperOrder,
  type PaperPosition,
  type TraderProfile,
} from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { buildStandings, traderVisuals, type LeagueSymbol, type TraderStanding } from "@/lib/league";
import { EquityAreaChart } from "@/components/leaderboard-sidebar-equity-chart";
import { fallbackTraders, traderShortKey } from "@/lib/traders";
import { formatClockTime, formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/status";
import { activePositionLeverage, appendLeverageSample, formatLeverageBadge, orderLeverage, planLeverage, positionLeverage } from "@/components/leaderboard-leverage";

const SYMBOLS: LeagueSymbol[] = ["BTCUSDT"];
const RANKING_GRID_CLASS = "grid-cols-[46px_minmax(180px,1fr)_130px_100px_90px_60px_80px_65px_24px] gap-3";

type ExposureItem = {
  key: string;
  traderId: string;
  title: string;
  meta: string;
  status: string;
  body: string;
  createdAt?: string | null;
};

type TraderExposure = {
  position?: PaperPosition;
  order?: PaperOrder;
  plan?: Record<string, any>;
  averageLeverage?: number | null;
  leverageTotal?: number;
  leverageCount?: number;
};

type TraderProgress = {
  label: string;
  detail: string;
  tone: "good" | "bad" | "warn" | "neutral";
  side?: "long" | "short";
  sideDetail?: string;
  leverage?: number | null;
};

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

const periodLabels = {
  ko: {
    ALL: "전체 기간",
    "7D": "1주일",
    "30D": "1개월",
    "90D": "3개월"
  },
  en: {
    ALL: "All Time",
    "7D": "1 Week",
    "30D": "1 Month",
    "90D": "3 Months"
  }
} as const;

export function LeaderboardPageClient() {
  const { locale, t } = useAppContext();
  const queryClient = useQueryClient();
  
  // Custom filter state
  const [activeTab, setActiveTab] = useState<"BTC">("BTC");
  const [activeTraderId, setActiveTraderId] = useState<string | null>(null);
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"ALL" | "7D" | "30D" | "90D">("ALL");

  const fallbackBundle = useMemo<LeaderboardBundle>(() => ({
    symbol: "BTCUSDT",
    traders: fallbackTraders as unknown as TraderProfile[],
    summaries: [],
    positions: [],
    orders: [],
    managementReviews: [],
    scanner: null
  }), []);

  const btcQuery = useQuery({
    ...leaderboardBundleQueryOptions("BTCUSDT"),
    placeholderData: (previousData) => previousData?.symbol === "BTCUSDT" ? previousData : getCachedLeaderboardBundle("BTCUSDT") ?? fallbackBundle
  });

  const isFetching = btcQuery.isFetching;
  const bundle = useMemo<LeaderboardBundle>(() => {
    return btcQuery.data ?? fallbackBundle;
  }, [btcQuery.data, fallbackBundle]);

  const traders = bundle.traders?.length ? bundle.traders : (fallbackTraders as unknown as TraderProfile[]);
  const standings = useMemo(() => buildStandings(traders, bundle.summaries ?? []), [bundle.summaries, traders]);
  const activeTrader = standings.find((item) => item.id === activeTraderId) ?? standings[0] ?? null;
  const leader = standings[0] ?? null;
  const totalEquity = standings.reduce((sum, item) => sum + item.equity, 0);
  const totalPnl = standings.reduce((sum, item) => sum + item.totalPnl, 0);
  const openPositions = standings.reduce((sum, item) => sum + item.openPositions, 0);
  const openOrders = standings.reduce((sum, item) => sum + item.openOrders, 0);
  const activeTraderCount = standings.filter((item) => item.openPositions || item.openOrders).length;
  const traderNameMap = useMemo(() => new Map(standings.map((item) => [item.id, item.name])), [standings]);
  const reviews = useMemo(() => (bundle.managementReviews ?? []).slice(0, 5), [bundle.managementReviews]);
  const latestReviewByTrader = useMemo(() => buildLatestReviewMap(bundle.managementReviews ?? []), [bundle.managementReviews]);

  // Fetch pending plans dynamically
  const pendingPlansQuery = useQuery({
    queryKey: ["league", "trade-plans", "BTCUSDT", "pending"],
    queryFn: async () => unwrapTradePlans(await getRecentTradePlans(100, "BTCUSDT", undefined, "PAPER_TRADING_PENDING")),
    placeholderData: (previousData) => previousData ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false
  });

  const pendingPlans = pendingPlansQuery.data ?? [];

  const exposureByTrader = useMemo(
    () => buildExposureMap(bundle.positions ?? [], bundle.orders ?? [], pendingPlans),
    [bundle.orders, bundle.positions, pendingPlans]
  );
  const exposureItems = useMemo(() => buildExposureItems(bundle.positions ?? [], bundle.orders ?? [], traderNameMap, locale, t), [bundle.orders, bundle.positions, locale, t, traderNameMap]);

  // Dynamic snapshot symbol
  const snapshotSymbol = "BTCUSDT";

  const activeSnapshotsQuery = useQuery({
    queryKey: ["league", "equity-snapshots", activeTab, activeTrader?.id ?? ""],
    queryFn: async () => unwrapEquitySnapshots(await getEquitySnapshots(100, activeTrader?.id ?? undefined, snapshotSymbol)),
    enabled: Boolean(activeTrader?.id),
    placeholderData: (previousData) => previousData ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false
  });

  const filteredSnapshots = useMemo(() => {
    const rawSnapshots = activeSnapshotsQuery.data ?? [];
    if (selectedPeriod === "ALL" || rawSnapshots.length === 0) return rawSnapshots;

    const times = rawSnapshots.map((s) => {
      const timeStr = s.candleTime ?? s.createdAt ?? s.timestamp;
      return timeStr ? new Date(timeStr).getTime() : 0;
    }).filter(t => t > 0);
    
    const latestTime = times.length > 0 ? Math.max(...times) : Date.now();
    const days = selectedPeriod === "7D" ? 7 : selectedPeriod === "30D" ? 30 : 90;
    const cutoff = latestTime - days * 24 * 60 * 60 * 1000;

    return rawSnapshots.filter((s) => {
      const timeStr = s.candleTime ?? s.createdAt ?? s.timestamp;
      if (!timeStr) return false;
      return new Date(timeStr).getTime() >= cutoff;
    });
  }, [activeSnapshotsQuery.data, selectedPeriod]);

  const prefetchTrader = useCallback((traderId: string) => {
    void prefetchTraderDetailBundle(queryClient, traderId, "BTCUSDT");
  }, [queryClient]);

  const activateTrader = useCallback((traderId: string) => {
    setActiveTraderId(traderId);
    prefetchTrader(traderId);
  }, [prefetchTrader]);

  return (
    <div className="grid gap-4 pb-8">
      <section 
        className="relative overflow-hidden border border-white/10 bg-[#070908] text-white rounded-[22px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(circle at 50% 25%, rgba(16,185,129,0.12), transparent 40%)",
          backgroundSize: "96px 96px, 96px 96px, auto"
        }}
      >
        {/* Corner Markers / Notches */}
        <div className="absolute top-0 left-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />
        <div className="absolute top-0 right-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />
        <div className="absolute bottom-0 left-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />
        <div className="absolute bottom-0 right-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />

        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">[ LEAGUE OVERVIEW ]</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl break-keep animate-fade-in-up">{t("leaderboard.title")}</h1>
            <p className="text-zinc-400 mt-2 max-w-3xl text-sm leading-6 break-keep animate-fade-in-up animation-delay-100">{t("leaderboard.subtitle")}</p>
          </div>
        </div>

        <div className="grid gap-px bg-white/5 md:grid-cols-4 rounded-b-[22px] overflow-hidden">
          <HeroMetric icon={<Trophy size={18} />} label={t("leaderboard.topTrader")} value={leader?.name ?? "-"} detail={formatSignedPercent(leader?.returnPct)} tone={leader && leader.returnPct < 0 ? "bad" : "good"} />
          <HeroMetric icon={<ShieldCheck size={18} />} label={t("leaderboard.totalEquity")} value={formatCurrency(totalEquity, locale)} detail={formatCurrency(totalPnl, locale)} tone={totalPnl < 0 ? "bad" : "good"} />
          <HeroMetric icon={<ActivityIcon size={18} />} label={t("leaderboard.activeTraders")} value={formatNumber(activeTraderCount, 0, locale)} detail={`${openPositions} ${t("paper.openPositions")} / ${openOrders} ${t("paper.openOrders")}`} tone={activeTraderCount ? "warn" : "neutral"} />
          <HeroMetric icon={<Gauge size={18} />} label={t("leaderboard.snapshot")} value={isFetching ? t("common.loading") : activeTab} detail={bundle.scanner?.enabled ? t("scanner.autoOn") : t("scanner.autoOff")} tone={bundle.scanner?.enabled ? "good" : "neutral"} />
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)] w-full">
        <div className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] w-full min-w-0 overflow-hidden shadow-sm transition hover:border-emerald-500/20 duration-300">
            <div className="flex flex-col gap-3 border-b px-5 py-4 md:px-6 md:flex-row md:items-center md:justify-between" style={{ borderColor: "var(--border)" }}>
              {/* Left side: Horizontal Toggle Tabs */}
              <div className="inline-flex w-fit rounded-full border border-white/10 p-1 bg-white/[0.02] backdrop-blur-md">
                {(["BTC"] as const).map((tab) => {
                  const active = activeTab === tab;
                  const label = tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`focus-ring rounded-full px-5 py-2 text-xs font-bold transition duration-200 ${
                        active
                          ? "bg-white text-zinc-950 shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Right side: visual period selection dropdown */}
              <div className="flex items-center gap-3">
                {isFetching ? (
                  <span className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400">
                    <CircleNotch className="animate-spin animate-duration-1000" size={14} />
                    {t("common.loading")}
                  </span>
                ) : null}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.06] transition"
                  >
                    <Calendar size={14} className="text-emerald-400" />
                    <span>{periodLabels[locale][selectedPeriod]}</span>
                    <CaretDown size={14} className="text-zinc-500" />
                  </button>
                  {isPeriodOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsPeriodOpen(false)} />
                      <div className="absolute right-0 mt-1.5 w-36 rounded-lg border border-white/10 bg-[#0c0d0d] p-1 shadow-lg z-20">
                        {(["ALL", "7D", "30D", "90D"] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setSelectedPeriod(p);
                              setIsPeriodOpen(false);
                            }}
                            className={`w-full text-left rounded-md px-3 py-1.5 text-xs font-medium transition ${
                              selectedPeriod === p 
                                ? "bg-emerald-500/10 text-emerald-400" 
                                : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                            }`}
                          >
                            {periodLabels[locale][p]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

          <RankingTable standings={standings} exposureByTrader={exposureByTrader} activeTraderId={activeTrader?.id ?? null} t={t} locale={locale} onActivate={activateTrader} />
          <MobileRankingList standings={standings} exposureByTrader={exposureByTrader} t={t} locale={locale} onPrefetch={prefetchTrader} />
        </div>

        <TraderPreviewPanel
          trader={activeTrader}
          locale={locale}
          t={t}
          snapshots={filteredSnapshots}
          snapshotsLoading={activeSnapshotsQuery.isFetching}
          exposure={activeTrader ? exposureByTrader.get(activeTrader.id) : undefined}
          latestReview={activeTrader ? latestReviewByTrader.get(activeTrader.id) : undefined}
          onPrefetchTrader={prefetchTrader}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] w-full">
        <FeedPanel
          icon={<Brain size={18} />}
          title={t("leaderboard.agentFeed")}
          empty={t("leaderboard.noReviews")}
          items={reviews.map((review) => ({
            key: `review-${review.id ?? review.createdAt ?? review.updatedAt}`,
            title: `${traderName(review.traderId, traderNameMap)} · ${statusLabel(review.decision ?? review.actionType ?? review.action, t)}`,
            body: reviewText(review),
            meta: formatDateTime(review.createdAt ?? review.updatedAt, locale)
          }))}
        />
        <FeedPanel
          icon={<ChartLineUp size={18} />}
          title={t("leaderboard.exposureFeed")}
          empty={t("leaderboard.noExposure")}
          items={exposureItems.slice(0, 5).map((item) => ({
            key: item.key,
            title: `${item.title} · ${item.status}`,
            body: item.body,
            meta: item.meta
          }))}
        />
      </section>
    </div>
  );
}

function RankingTable({ standings, exposureByTrader, activeTraderId, t, locale, onActivate }: {
  standings: TraderStanding[];
  exposureByTrader: Map<string, TraderExposure>;
  activeTraderId: string | null;
  t: (key: string) => string;
  locale: "ko" | "en";
  onActivate: (traderId: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto md:block w-full">
      <div className="min-w-[920px]">
        <div className={`grid ${RANKING_GRID_CLASS} border-b px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-400 md:px-6`} style={{ borderColor: "var(--border)" }}>
          <div className="whitespace-nowrap">{t("leaderboard.rank")}</div>
          <div className="whitespace-nowrap">{t("leaderboard.trader")}</div>
          <div className="text-right whitespace-nowrap">{t("leaderboard.progressStatus")}</div>
          <div className="text-right whitespace-nowrap">{t("leaderboard.cumulativeReturn")}</div>
          <div className="text-right whitespace-nowrap">{t("common.return7d")}</div>
          <div className="text-right whitespace-nowrap">{t("leaderboard.mdd")}</div>
          <div className="text-right whitespace-nowrap">{t("common.winRate")}</div>
          <div className="text-right whitespace-nowrap">{t("leaderboard.sharpe")}</div>
          <div className="text-right" />
        </div>
        <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
          {standings.map((trader) => {

            const exposure = exposureByTrader.get(trader.id);
            const progress = traderProgress(trader, exposure, t, locale);
            const isActive = activeTraderId === trader.id;
            return (
              <Link
                key={trader.id}
                href={`/leaderboard/${trader.id}`}
                data-trader-row={trader.id}
                onFocus={() => onActivate(trader.id)}
                onMouseEnter={() => onActivate(trader.id)}
                className={`focus-ring group grid ${RANKING_GRID_CLASS} items-center px-5 py-5 transition-all duration-200 border-l-2 md:px-6 ${
                  isActive
                    ? "bg-white/[0.04] border-l-emerald-500"
                    : "hover:bg-white/[0.02] border-l-transparent hover:border-l-emerald-500/50"
                }`}
              >
                <RankBadge rank={trader.rank} />
                <TraderIdentity trader={trader} progress={progress} t={t} />
                <ProgressCell progress={progress} />
                <MetricValue value={formatSignedPercent(trader.returnPct)} tone={trader.returnPct >= 0 ? "good" : "bad"} />
                <MetricValue value={formatSignedPercent(trader.monthlyReturn)} tone={trader.monthlyReturn >= 0 ? "good" : "bad"} />
                <MetricValue value={formatDrawdown(trader.maxDrawdown)} />
                <MetricValue value={formatNullablePercent(trader.winRate)} />
                <MetricValue value={formatNumber(trader.sharpe, 2, locale)} tone={trader.sharpe > 2 ? "good" : trader.sharpe < 0 ? "bad" : "neutral"} />
                <div className="flex justify-end text-zinc-500 transition-colors group-hover:text-emerald-400">
                  <CaretRight size={18} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileRankingList({ standings, exposureByTrader, t, locale, onPrefetch }: {
  standings: TraderStanding[];
  exposureByTrader: Map<string, TraderExposure>;
  t: (key: string) => string;
  locale: "ko" | "en";
  onPrefetch: (traderId: string) => void;
}) {
  return (
    <div className="divide-y md:hidden" style={{ borderColor: "var(--border)" }}>
      {standings.map((trader) => (
        (() => {
          const progress = traderProgress(trader, exposureByTrader.get(trader.id), t, locale);
          return (
            <Link
              key={trader.id}
              href={`/leaderboard/${trader.id}`}
              onFocus={() => onPrefetch(trader.id)}
              onMouseEnter={() => onPrefetch(trader.id)}
              className="focus-ring block px-5 py-4 transition hover:bg-white/[0.02]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <RankBadge rank={trader.rank} compact />
                  <TraderMark trader={trader} compact />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-bold text-white flex items-center gap-1.5">
                        {trader.name}
                        <span className="text-xs shrink-0">{traderFlags[trader.id] || "🇰🇷"}</span>
                      </p>
                      <SideBadge progress={progress} />
                      <LeverageBadge progress={progress} />
                    </div>
                    <p className="text-zinc-500 mt-1 truncate text-xs font-mono">{t(traderShortKey(trader.id))}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-sm font-semibold ${trader.returnPct >= 0 ? "value-good" : "value-bad"}`}>{formatSignedPercent(trader.returnPct)}</p>
                  <p className="text-zinc-500 mt-1 font-mono text-xs">{formatCurrency(trader.equity, locale)}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <MiniCell label={t("leaderboard.progressStatus")} value={progress.detail || progress.label} />
                <MiniCell label={t("common.return7d")} value={formatSignedPercent(trader.monthlyReturn)} />
                <MiniCell label={t("leaderboard.mdd")} value={formatDrawdown(trader.maxDrawdown)} />
                <MiniCell label={t("common.winRate")} value={formatNullablePercent(trader.winRate)} />
              </div>
            </Link>
          );
        })()
      ))}
    </div>
  );
}

function TraderPreviewPanel({ trader, t, locale, snapshots, snapshotsLoading, exposure, latestReview, onPrefetchTrader }: {
  trader: TraderStanding | null;
  t: (key: string) => string;
  locale: "ko" | "en";
  snapshots: EquitySnapshot[];
  snapshotsLoading: boolean;
  exposure?: TraderExposure;
  latestReview?: ManagementReview;
  onPrefetchTrader: (traderId: string) => void;
}) {
  if (!trader) {
    return (
      <aside className="data-card hidden xl:block p-6 sticky top-[74px] w-full min-w-0">
        <div className="text-muted-app text-sm">{t("leaderboard.noTraderSelected")}</div>
      </aside>
    );
  }

  const summary = trader.summary;
  const progress = traderProgress(trader, exposure, t, locale);
  const state = progress.label;
  const recentDecision = summary?.lastDecision ?? latestReview?.decision ?? latestReview?.actionType ?? latestReview?.action;
  const recentDecisionLabel = recentDecision ? statusLabel(recentDecision, t) : t("leaderboard.noTraderReview");

  return (
    <aside className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] hidden xl:block shadow-sm transition hover:border-emerald-500/20 duration-300 w-full min-w-0 sticky top-[74px] p-5 overflow-hidden">
      <div className="flex flex-col gap-4 w-full min-w-0">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-zinc-500 text-xs uppercase tracking-wider font-bold">{t("leaderboard.previewTitle")}</p>
              <h3 className="mt-1 truncate text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                {trader.name}
                <span className="text-lg shrink-0">{traderFlags[trader.id] || "🇰🇷"}</span>
              </h3>
              <p className="text-zinc-400 mt-2 text-xs leading-relaxed font-sans break-keep">{t(traderShortKey(trader.id))}</p>
            </div>
            <RankBadge rank={trader.rank} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill label={state} tone={progress.tone} />
            <SideBadge progress={progress} />
            <LeverageBadge progress={progress} />
          </div>
        </div>

        <div>
          <p className="font-mono text-3xl font-semibold tracking-tight">{formatCurrency(trader.equity, locale)}</p>
          <p className={`mt-1 font-mono text-lg font-semibold ${trader.totalPnl >= 0 ? "value-good" : "value-bad"}`}>
            {formatCurrency(trader.totalPnl, locale)} · {formatSignedPercent(trader.returnPct)}
          </p>
        </div>

        <EquityAreaChart trader={trader} snapshots={snapshots} loading={snapshotsLoading} locale={locale} t={t} />

        <section>
          <h4 className="text-sm font-semibold">{t("leaderboard.previewPerformance")}</h4>
          <div className="mt-3 grid grid-cols-2 gap-2 w-full min-w-0">
            <MiniCell label={t("common.return30d")} value={formatSignedPercent(trader.returnPct)} />
            <MiniCell label={t("common.return7d")} value={formatSignedPercent(trader.monthlyReturn)} />
            <MiniCell label={t("leaderboard.mdd")} value={formatDrawdown(trader.maxDrawdown)} />
            <MiniCell label={t("common.winRate")} value={formatNullablePercent(trader.winRate)} />
            <MiniCell label={t("leaderboard.sharpe")} value={formatNumber(trader.sharpe, 2, locale)} />
            <MiniCell label={t("leaderboard.trades")} value={formatNumber(trader.trades, 0, locale)} />
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold">{t("leaderboard.previewStatus")}</h4>
          <div className="mt-3 divide-y rounded-lg border bg-[var(--surface)] w-full min-w-0 overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <StatusLine label={t("leaderboard.progressStatus")} value={progress.detail || state} tone={progress.tone} />
            <StatusLine label={t("leaderboard.latestPlanStatus")} value={statusLabel(summary?.latestPlanStatus, t)} tone={statusTone(summary?.latestPlanStatus)} />
            <StatusLine label={t("leaderboard.latestRunStatus")} value={statusLabel(summary?.latestRunStatus, t)} tone={statusTone(summary?.latestRunStatus)} />
            <StatusLine label={t("agent.phase")} value={statusLabel(summary?.agentPhase, t)} tone={statusTone(summary?.agentPhase)} />
            <StatusLine label={t("agent.lastDecision")} value={recentDecisionLabel} tone={recentDecision ? statusTone(recentDecision) : "neutral"} />
          </div>
        </section>

        <Link
          href={`/leaderboard/${trader.id}`}
          onFocus={() => onPrefetchTrader(trader.id)}
          onMouseEnter={() => onPrefetchTrader(trader.id)}
          className="action-button focus-ring w-full justify-center rounded-full bg-emerald-500 shadow-neon-emerald hover:bg-emerald-400 text-white font-bold tracking-wide transition duration-300 py-3"
        >
          {t("leaderboard.viewTrader")}
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </aside>
  );
}

function HeroMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "good" | "bad" | "warn" | "neutral" }) {
  const toneClass = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-zinc-400";
  return (
    <div className="bg-[#0a0c0b] p-5 hover:bg-[#101311] transition duration-300">
      <div className={`mb-3 flex items-center gap-2 ${toneClass}`}>
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider font-bold">{label}</span>
      </div>
      <p className="truncate font-mono text-xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-zinc-400 mt-1 truncate text-xs">{detail}</p>
    </div>
  );
}

function RankBadge({ rank, compact = false }: { rank: number; compact?: boolean }) {
  const colors =
    rank === 1
      ? "bg-amber-300/35 text-amber-900 dark:bg-amber-300/25 dark:text-amber-100"
      : rank === 2
        ? "bg-slate-300/45 text-slate-800 dark:bg-slate-300/20 dark:text-slate-100"
        : rank === 3
          ? "bg-orange-300/30 text-orange-800 dark:bg-orange-300/20 dark:text-orange-100"
          : "bg-[var(--surface-muted)] text-muted-app";
  return (
    <span className={`${compact ? "size-8 text-xs" : "size-10 text-sm"} grid place-items-center rounded-full font-mono font-semibold ${colors}`}>
      {rank}
    </span>
  );
}

function TraderMark({ trader, compact = false }: { trader: TraderStanding; compact?: boolean }) {
  const visual = traderVisuals[trader.id] ?? traderVisuals["channel-rider"];
  return (
    <span className={`${compact ? "size-9 rounded-full text-xs" : "size-10 rounded-full text-xs"} grid shrink-0 place-items-center bg-gradient-to-br ${visual.tone} font-bold text-white`}>
      {visual.initials}
    </span>
  );
}

function TraderIdentity({ trader, progress, t }: { trader: TraderStanding; progress: TraderProgress; t: (key: string) => string }) {
  const flag = traderFlags[trader.id] || "🇰🇷";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TraderMark trader={trader} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            {trader.name}
            <span className="text-sm shrink-0" title={flag === "🇰🇷" ? "South Korea" : "USA"}>{flag}</span>
          </p>
          <SideBadge progress={progress} />
          <LeverageBadge progress={progress} />
        </div>
        <p className="text-zinc-500 mt-1 truncate text-xs font-mono">{t(traderShortKey(trader.id))}</p>
      </div>
    </div>
  );
}

function ProgressCell({ progress }: { progress: TraderProgress }) {
  return (
    <div className="min-w-0 text-right">
      <StatusPill label={progress.label} tone={progress.tone} />
      {progress.detail ? <p className="text-soft-app mt-1 truncate font-mono text-xs">{progress.detail}</p> : null}
    </div>
  );
}

function SideBadge({ progress }: { progress: TraderProgress }) {
  if (!progress.side) return null;
  const isLong = progress.side === "long";
  const toneClass = isLong
    ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/35 dark:text-emerald-300"
    : "bg-rose-500/12 text-rose-700 ring-rose-500/35 dark:text-rose-300";
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none ring-1 ${toneClass}`}>
      {isLong ? "LONG" : "SHORT"}
    </span>
  );
}

function LeverageBadge({ progress }: { progress: TraderProgress }) {
  const label = formatLeverageBadge(progress.leverage);
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-soft-app ring-1 ring-[var(--border)]">
      {label}
    </span>
  );
}

function MetricValue({ value, tone = "neutral" }: { value: string; tone?: "good" | "bad" | "warn" | "neutral" }) {
  const toneClass = tone === "good" ? "value-good" : tone === "bad" ? "value-bad" : tone === "warn" ? "value-warn" : "text-muted-app";
  return <div className={`text-right font-mono text-sm font-semibold ${toneClass}`}>{value}</div>;
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "bad" | "warn" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : tone === "bad"
        ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
        : tone === "warn"
          ? "bg-amber-500/14 text-amber-800 dark:text-amber-200"
          : "bg-[var(--surface-muted)] text-muted-app";
  return <span className={`inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-semibold ${toneClass}`}>{label}</span>;
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "warn" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-soft-app min-w-0 text-xs font-medium">{label}</span>
      <StatusPill label={value} tone={tone} />
    </div>
  );
}

function MiniCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--surface)] px-3 py-2 ring-1 ring-[var(--border)]">
      <p className="text-soft-app truncate text-[11px] font-medium">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function FeedPanel({ icon, title, items, empty }: { icon: ReactNode; title: string; items: Array<{ key: string; title: string; body: string; meta: string }>; empty: string }) {
  return (
    <div className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] p-5 shadow-sm hover:border-emerald-500/20 transition duration-300 w-full min-w-0">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-bold tracking-tight break-keep">{title}</h2>
      </div>
      <div className="mt-4 divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
        {items.length ? items.map((item) => (
          <div key={item.key} className="py-4 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-bold tracking-tight break-keep">{item.title}</p>
              <p className="text-zinc-400 shrink-0 font-mono text-xs">{item.meta}</p>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-2 text-sm leading-6 break-keep">{item.body}</p>
          </div>
        )) : <div className="text-zinc-400 py-8 text-sm break-keep">{empty}</div>}
      </div>
    </div>
  );
}

function buildExposureMap(positions: PaperPosition[], orders: PaperOrder[], plans: Array<Record<string, any>> = []) {
  const map = new Map<string, TraderExposure>();
  for (const position of positions) {
    if (!isActivePosition(position.status)) continue;
    const traderId = String(position.traderId ?? "");
    if (!traderId) continue;
    const current = map.get(traderId) ?? {};
    const next = appendLeverageSample(current, positionLeverage(position));
    map.set(traderId, { ...next, position: next.position ?? position });
  }
  for (const order of orders) {
    if (!isActiveOrder(order.status)) continue;
    const traderId = String(order.traderId ?? "");
    if (!traderId) continue;
    const current = map.get(traderId) ?? {};
    if (!current.order) current.order = order;
    map.set(traderId, current);
  }
  for (const plan of [...plans].sort((a, b) => timeValue(planTime(b)) - timeValue(planTime(a)))) {
    const status = normalizeStatusText(plan.status ?? plan.payload?.status);
    if (status !== "PAPER_TRADING_PENDING") continue;
    const traderId = String(plan.traderId ?? plan.trader_id ?? "");
    if (!traderId) continue;
    const current = map.get(traderId) ?? {};
    if (!current.plan) current.plan = plan;
    map.set(traderId, current);
  }
  return map;
}

function buildLatestReviewMap(reviews: ManagementReview[]) {
  const map = new Map<string, ManagementReview>();
  for (const review of reviews) {
    const traderId = String(review.traderId ?? review.trader_id ?? "");
    if (!traderId) continue;
    const current = map.get(traderId);
    if (!current || timeValue(reviewTime(review)) > timeValue(reviewTime(current))) {
      map.set(traderId, review);
    }
  }
  return map;
}

function getElapsedTimeString(updatedAt: string | null | undefined): string {
  if (!updatedAt) return "-";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "-";
  
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "0m";
  
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) {
    return `${diffMins}m`;
  }
  
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours < 24) {
    return remainingMins > 0 ? `${diffHours}h${remainingMins}m` : `${diffHours}h`;
  }
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}D`;
}

function traderProgress(trader: TraderStanding, exposure: TraderExposure | undefined, t: (key: string) => string, locale: "ko" | "en"): TraderProgress {
  const summary = trader.summary;
  const position = exposure?.position;
  const order = exposure?.order;
  const plan = exposure?.plan;
  if (position || (summary?.openPositions ?? 0) > 0) {
    const roi = position ? positionRoi(position) : summaryRoi(summary);
    const detail = roi === null ? formatCurrency(summary?.unrealizedPnl, locale) : `${t("leaderboard.status.roi")} ${formatSignedPercent(roi, 1)}`;
    const side = normalizeSide(position?.side);
    const leverage = activePositionLeverage({ exposure, summary, trader, position });
    return {
      label: t("leaderboard.status.inPosition"),
      detail,
      tone: roi !== null && roi < 0 ? "bad" : "good",
      side,
      sideDetail: roi === null ? undefined : formatSignedPercent(roi, 1),
      leverage
    };
  }
  if (order || (summary?.openOrders ?? 0) > 0) {
    const price = numberValue(order?.limitPrice, order?.price, order?.stopPrice, order?.triggerPrice);
    const side = normalizeSide(order?.side);
    const leverage = numberValue(orderLeverage(order), summary?.averageLeverage, trader.averageLeverage, summary?.leverage, trader.leverage);
    return {
      label: t("leaderboard.status.pendingEntry"),
      detail: price === null ? statusLabel(order?.status ?? "PENDING_ORDER", t) : `${t("common.price")} ${formatNumber(price, 0, locale)}`,
      tone: "warn",
      side,
      sideDetail: price === null ? undefined : `@${formatNumber(price, 0, locale)}`,
      leverage
    };
  }

  const planStatus = normalizeStatusText(summary?.latestPlanStatus);
  const runStatus = normalizeStatusText(summary?.latestRunStatus);
  const phase = normalizeStatusText(summary?.agentPhase);
  if (planStatus === "PAPER_TRADING_PENDING") {
    const side = normalizeSide(plan?.side ?? plan?.payload?.side);
    const price = planEntryPrice(plan);
    const leverage = numberValue(planLeverage(plan), summary?.averageLeverage, trader.averageLeverage, summary?.leverage, trader.leverage);
    return {
      label: t("leaderboard.status.qualifiedSetup"),
      detail: price === null ? statusLabel(summary?.latestPlanStatus, t) : `${t("common.price")} ${formatNumber(price, 0, locale)}`,
      tone: "warn",
      side,
      sideDetail: price === null ? undefined : `@${formatNumber(price, 0, locale)}`,
      leverage
    };
  }
  if (runStatus === "NO_CANDIDATE") {
    return {
      label: t("leaderboard.status.watching"),
      detail: t("leaderboard.status.noSetup"),
      tone: "neutral"
    };
  }
  if (runStatus === "COMPLETED") {
    return {
      label: t("leaderboard.status.reviewed"),
      detail: getElapsedTimeString(summary?.updatedAt),
      tone: "good"
    };
  }
  if (phase === "PENDING_ORDER") {
    return {
      label: t("leaderboard.status.pendingEntry"),
      detail: statusLabel(summary?.agentPhase, t),
      tone: "warn"
    };
  }
  return {
    label: t("leaderboard.status.watching"),
    detail: statusLabel(summary?.agentPhase ?? summary?.latestRunStatus, t),
    tone: "neutral"
  };
}

function unwrapEquitySnapshots(value: { snapshots?: EquitySnapshot[] } | EquitySnapshot[]) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.snapshots) ? value.snapshots : [];
}

function unwrapTradePlans(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) return value as Array<Record<string, any>>;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, any>;
  if (Array.isArray(record.tradePlans)) return record.tradePlans;
  if (Array.isArray(record.plans)) return record.plans;
  return [];
}

function buildExposureItems(positions: PaperPosition[], orders: PaperOrder[], traderNameMap: Map<string, string>, locale: "ko" | "en", t: (key: string) => string): ExposureItem[] {
  const positionItems = positions.map((position, index) => {
    const traderId = String(position.traderId ?? "");
    const quantity = numberValue(position.quantity, position.size);
    const price = numberValue(position.markPrice, position.entryPrice, position.averageEntryPrice);
    const notional = quantity && price ? quantity * price : null;
    return {
      key: `position-${position.id ?? traderId}-${index}`,
      traderId,
      title: `${traderName(traderId, traderNameMap)} · ${position.symbol}`,
      meta: formatDateTime(position.updatedAt ?? position.openedAt, locale),
      status: statusLabel(position.status ?? "OPEN_POSITION", t),
      body: `${sideText(position.side)} · ${t("leaderboard.openNotional")} ${formatCurrency(notional, locale)} · ${t("common.pnl")} ${formatCurrency(position.unrealizedPnl ?? position.realizedPnl, locale)}`,
      createdAt: position.updatedAt ?? position.openedAt
    };
  });
  const orderItems = orders.map((order, index) => {
    const traderId = String(order.traderId ?? "");
    const quantity = numberValue(order.quantity, order.filledQuantity);
    const price = numberValue(order.price, order.stopPrice, order.triggerPrice);
    const notional = quantity && price ? quantity * price : null;
    return {
      key: `order-${order.id ?? traderId}-${index}`,
      traderId,
      title: `${traderName(traderId, traderNameMap)} · ${order.symbol}`,
      meta: formatDateTime(order.updatedAt ?? order.createdAt, locale),
      status: statusLabel(order.status ?? "PENDING_ORDER", t),
      body: `${sideText(order.side)} · ${t("leaderboard.openNotional")} ${formatCurrency(notional, locale)} · ${t("common.price")} ${formatNumber(price, 2, locale)}`,
      createdAt: order.updatedAt ?? order.createdAt
    };
  });
  return [...positionItems, ...orderItems].sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
}

function reviewText(review: ManagementReview) {
  const payload = (review.payload ?? {}) as Record<string, any>;
  const nested = review.review ?? payload.review ?? {};
  const event = review.event ?? payload.event ?? {};
  return String(review.rationale ?? nested.rationale ?? review.userSummary ?? nested.userSummary ?? event.reason ?? "-");
}

function traderName(id: string | null | undefined, traderNameMap: Map<string, string>) {
  if (!id) return "-";
  return traderNameMap.get(id) ?? id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function sideText(value?: string | null) {
  return value ? String(value).toUpperCase() : "-";
}

function planEntryPrice(plan?: Record<string, any>) {
  const payload = (plan?.payload ?? {}) as Record<string, any>;
  const entries = Array.isArray(plan?.entries) ? plan?.entries : Array.isArray(payload.entries) ? payload.entries : [];
  const firstEntry = entries[0] as Record<string, any> | undefined;
  return numberValue(firstEntry?.price, plan?.entryPrice, plan?.price, payload.entryPrice, payload.price);
}

function planTime(plan: Record<string, any>) {
  return plan.createdAt ?? plan.created_at ?? plan.updatedAt ?? plan.updated_at ?? null;
}

function reviewTime(review: ManagementReview) {
  return review.createdAt ?? review.created_at ?? review.updatedAt ?? review.updated_at ?? null;
}

function normalizeSide(value?: string | null): "long" | "short" | undefined {
  const side = String(value ?? "").toLowerCase();
  if (side === "long" || side === "buy") return "long";
  if (side === "short" || side === "sell") return "short";
  return undefined;
}

function isActivePosition(status?: string | null) {
  const normalized = normalizeStatusText(status);
  return !["CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(normalized);
}

function isActiveOrder(status?: string | null) {
  const normalized = normalizeStatusText(status);
  return !["FILLED", "CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(normalized);
}

function positionRoi(position: PaperPosition) {
  const pnl = numberValue(position.unrealizedPnl);
  const margin = numberValue(position.margin, position.openMargin);
  if (pnl === null || margin === null || margin <= 0) return null;
  return (pnl / margin) * 100;
}

function summaryRoi(summary: TraderStanding["summary"]) {
  const pnl = numberValue(summary?.unrealizedPnl);
  const margin = numberValue(summary?.openMargin);
  if (pnl === null || margin === null || margin <= 0) return null;
  return (pnl / margin) * 100;
}

function normalizeStatusText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function formatSignedPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatNullablePercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function formatDrawdown(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const drawdown = value > 0 ? -value : value;
  return `${drawdown.toFixed(1)}%`;
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

function timeValue(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
