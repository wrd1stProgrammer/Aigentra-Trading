"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useCallback, useMemo, useState, useEffect, useRef, type MouseEvent } from "react";
import {
  ArrowRight,
  Calendar,
  CaretDown,
  CircleNotch,
  Medal,
  Star,
  Trophy,
} from "@phosphor-icons/react";
import {
  getEquitySnapshots,
  getActivePaperPositions,
  getCachedLeaderboardBundle,
  getLeagueOverviewReviews,
  getPaperOrders,
  getRecentTradePlans,
  LEAGUE_LIVE_REFETCH_INTERVAL_MS,
  leaderboardBundleQueryKey,
  leaderboardBundleQueryOptions,
  type EquitySnapshot,
  type LeaderboardBundle,
  type LeaderboardBundleRequestOptions,
  type PaperOrder,
  type PaperPosition,
  type TraderStatusFeed,
  type TraderProfile,
} from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import type { Locale } from "@/lib/i18n";
import { buildStandings, traderVisuals, type LeagueSymbol, type TraderStanding } from "@/lib/league";
import { EquityAreaChart } from "@/components/leaderboard-sidebar-equity-chart";
import { PageLoadingOverlay } from "@/components/page-loading-overlay";
import { ProtectedContentGate } from "@/components/access-gate";
import { FREE_LEADERBOARD_LIMIT, useSubscriberAccess } from "@/components/use-subscriber-access";
import { fallbackTraders, traderDetailKey, traderNameKey, traderShortKey } from "@/lib/traders";
import { formatCurrency, formatNumber, formatRelativeDateTime } from "@/lib/format";
import { statusLabel } from "@/lib/status";
import { activePositionLeverage, appendLeverageSample, formatLeverageBadge, orderLeverage, planLeverage, positionLeverage } from "@/components/leaderboard-leverage";
import {
  isDisplayableOverviewReview,
  overviewReviewDecision,
  type OverviewReviewRecord
} from "@/components/leaderboard-overview-filter";
import { LatestStatusFeedNote } from "@/components/trader-profile-detail/status-feed-thread";
import type { SubscriberPreferences } from "@/lib/subscriber-preferences";

const SYMBOLS: LeagueSymbol[] = ["BTCUSDT"];
const RANKING_GRID_CLASS = "grid-cols-[46px_minmax(220px,1fr)_130px_108px_108px_60px_80px_36px] gap-3";
const OVERVIEW_INITIAL_LIMIT = 12;
const OVERVIEW_PAGE_LIMIT = 10;
const OVERVIEW_CACHE_TTL_MS = 60_000;
const OVERVIEW_WARMING_RETRY_LIMIT = 2;
const LIVE_EXPOSURE_LIMIT = 100;
const DEFAULT_LEAGUE_MONTH = "2026-06";

type OverviewActivityCache = {
  locale: Locale;
  reviews: OverviewReviewRecord[];
  offset: number;
  hasMore: boolean;
  fetchedAt: number;
};

const overviewActivityCache: OverviewActivityCache = {
  locale: "en",
  reviews: [],
  offset: 0,
  hasMore: true,
  fetchedAt: 0
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

type ReturnMetricKey = "monthly" | "cumulative" | "return7d" | "return24h" | "return30d";

type ReturnColumn = {
  readonly key: ReturnMetricKey;
  readonly label: string;
  readonly peakValue: number;
};

const RETURN_METRIC_KEYS: readonly ReturnMetricKey[] = ["cumulative", "return7d", "return24h", "return30d"];

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

function periodLabel(locale: Locale, period: keyof typeof periodLabels.en) {
  return (locale === "ko" ? periodLabels.ko : periodLabels.en)[period];
}

type LeagueMonthOption = {
  readonly value: string;
  readonly year: number;
  readonly month: number;
  readonly label: string;
};

function formatUtcLeagueMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseLeagueMonth(value?: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2])
  };
}

function initialLeagueMonthFromSearchParams(searchParams: URLSearchParams | ReadonlyURLSearchParamsLike) {
  if (searchParams.get("league") === "current") return undefined;
  const month = searchParams.get("leagueMonth");
  return parseLeagueMonth(month ?? undefined) ? String(month) : DEFAULT_LEAGUE_MONTH;
}

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
  toString(): string;
};

function nextLeagueSearch(searchParams: ReadonlyURLSearchParamsLike, leagueMonth: string | undefined) {
  const next = new URLSearchParams(searchParams.toString());
  if (leagueMonth) {
    next.set("league", "monthly");
    next.set("leagueMonth", leagueMonth);
  } else {
    next.set("league", "current");
    next.delete("leagueMonth");
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

function buildLeagueMonthOptions(now = new Date()): LeagueMonthOption[] {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const options: LeagueMonthOption[] = [];
  for (let year = currentYear; year >= currentYear - 2; year -= 1) {
    for (let month = 12; month >= 1; month -= 1) {
      if (year === currentYear && month > currentMonth) continue;
      const monthDate = new Date(Date.UTC(year, month - 1, 1));
      options.push({
        value: formatUtcLeagueMonth(year, month),
        year,
        month,
        label: `${monthDate.getUTCFullYear()}.${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`
      });
    }
  }
  return options;
}

function leaderboardBundlePeriodKey(bundle?: LeaderboardBundle) {
  return bundle?.period?.type === "monthly" ? bundle.period.month : "current";
}

export function LeaderboardPageClient() {
  const { locale, t } = useAppContext();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useSession();
  const accessQuery = useSubscriberAccess();
  const access = accessQuery.data;
  
  // Custom filter state
  const [activeTab, setActiveTab] = useState<"BTC">("BTC");
  const [activeTraderId, setActiveTraderId] = useState<string | null>(null);
  const [isPeriodOpen, setIsPeriodOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"ALL" | "7D" | "30D" | "90D">("ALL");
  const [selectedLeagueMonth, setSelectedLeagueMonth] = useState<string | undefined>(() => initialLeagueMonthFromSearchParams(searchParams));
  const [cacheReady, setCacheReady] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteTraderIds, setFavoriteTraderIds] = useState<Set<string>>(() => new Set());
  const [overviewReadyKey, setOverviewReadyKey] = useState<string | null>(null);

  const leagueMonthOptions = useMemo(() => {
    return buildLeagueMonthOptions().filter((option) => option.year === 2026 && option.month === 6);
  }, []);
  const leagueYears = useMemo(() => [...new Set(leagueMonthOptions.map((option) => option.year))], [leagueMonthOptions]);
  const fallbackLeagueMonth = leagueMonthOptions[0] ?? {
    value: formatUtcLeagueMonth(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1),
    year: new Date().getUTCFullYear(),
    month: new Date().getUTCMonth() + 1,
    label: ""
  };
  const selectedLeagueMonthParts = parseLeagueMonth(selectedLeagueMonth) ?? fallbackLeagueMonth;
  const selectedLeagueMonthValue = formatUtcLeagueMonth(selectedLeagueMonthParts.year, selectedLeagueMonthParts.month);
  const selectedLeagueHref = `${pathname}${nextLeagueSearch(searchParams, selectedLeagueMonthValue)}`;
  const currentLeagueHref = `${pathname}${nextLeagueSearch(searchParams, undefined)}`;
  const leagueMonthsForSelectedYear = useMemo(
    () => leagueMonthOptions.filter((option) => option.year === selectedLeagueMonthParts.year),
    [leagueMonthOptions, selectedLeagueMonthParts.year]
  );
  const leaderboardBundleOptions = useMemo<LeaderboardBundleRequestOptions>(() => ({
    includeRelated: false,
    leagueMonth: selectedLeagueMonth
  }), [selectedLeagueMonth]);
  const leaguePeriodLabel = selectedLeagueMonth ? `${selectedLeagueMonth} UTC` : t("leaderboard.currentLeague");

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

  useEffect(() => {
    setSelectedLeagueMonth(initialLeagueMonthFromSearchParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    setOverviewReadyKey(null);
  }, [locale]);

  const markOverviewInitialReady = useCallback(() => {
    setOverviewReadyKey(locale);
  }, [locale]);

  const subscriberPreferencesQueryKey = useMemo(
    () => ["subscriber", "preferences", "leaderboard", access?.userId ?? "", access?.email ?? ""] as const,
    [access?.email, access?.userId]
  );

  const subscriberPreferencesQuery = useQuery<SubscriberPreferences | null>({
    queryKey: subscriberPreferencesQueryKey,
    queryFn: async () => {
      if (!access?.email) return null;
      const response = await fetch("/api/subscriber/preferences", { cache: "no-store" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("subscriber_preferences_unavailable");
      return await response.json() as SubscriberPreferences;
    },
    enabled: session.status !== "loading" && Boolean(access?.email),
    staleTime: 30_000,
    retry: false
  });

  const subscriberPreferences = subscriberPreferencesQuery.data;
  const favoritePreferenceKey = subscriberPreferences?.favoriteTraderIds.join("\u0000") ?? "";

  useEffect(() => {
    if (session.status === "unauthenticated" || !access?.email) {
      setFavoriteTraderIds(new Set());
      setFavoritesOnly(false);
      return;
    }
    if (subscriberPreferences) {
      setFavoriteTraderIds(new Set(subscriberPreferences.favoriteTraderIds));
    }
  }, [access?.email, favoritePreferenceKey, session.status, subscriberPreferences]);

  const toggleFavoriteTrader = useCallback((traderId: string) => {
    if (!access?.email || !subscriberPreferences) return;
    setFavoriteTraderIds((current) => {
      const next = new Set(current);
      if (next.has(traderId)) {
        next.delete(traderId);
      } else {
        next.add(traderId);
      }
      void saveLeaderboardFavoritePreferences(subscriberPreferences, [...next], locale)
        .then((savedPreferences) => {
          if (!savedPreferences) {
            void subscriberPreferencesQuery.refetch();
            return;
          }
          queryClient.setQueryData(subscriberPreferencesQueryKey, savedPreferences);
          setFavoriteTraderIds(new Set(savedPreferences.favoriteTraderIds));
        })
        .catch(() => {
          void subscriberPreferencesQuery.refetch();
        });
      return next;
    });
  }, [access?.email, locale, queryClient, subscriberPreferences, subscriberPreferencesQuery, subscriberPreferencesQueryKey]);

  const setLeaguePeriod = useCallback((leagueMonth: string | undefined) => {
    const nextUrl = `${pathname}${nextLeagueSearch(searchParams, leagueMonth)}`;
    setSelectedLeagueMonth(leagueMonth);
    if (typeof window !== "undefined") {
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== nextUrl) {
        window.history.replaceState(null, "", nextUrl);
      }
    }
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const activateCurrentLeague = useCallback(() => {
    setLeaguePeriod(undefined);
    void queryClient.invalidateQueries({
      queryKey: leaderboardBundleQueryKey("BTCUSDT", locale, { includeRelated: false, leagueMonth: undefined })
    });
  }, [locale, queryClient, setLeaguePeriod]);

  const activateSelectedLeagueMonth = useCallback(() => {
    setLeaguePeriod(selectedLeagueMonthValue);
  }, [selectedLeagueMonthValue, setLeaguePeriod]);

  const btcQuery = useQuery({
    ...leaderboardBundleQueryOptions("BTCUSDT", locale, leaderboardBundleOptions),
    placeholderData: (previousData) => {
      const requestedPeriod = selectedLeagueMonth ?? "current";
      if (previousData?.symbol === "BTCUSDT" && leaderboardBundlePeriodKey(previousData) === requestedPeriod) {
        return previousData;
      }
      if (selectedLeagueMonth) {
        return cacheReady ? getCachedLeaderboardBundle("BTCUSDT", locale, leaderboardBundleOptions) ?? fallbackBundle : fallbackBundle;
      }
      return cacheReady ? getCachedLeaderboardBundle("BTCUSDT", locale, leaderboardBundleOptions) ?? fallbackBundle : fallbackBundle;
    }
  });
  const currentLeagueBundleQuery = useQuery({
    ...leaderboardBundleQueryOptions("BTCUSDT", locale, { includeRelated: false, leagueMonth: undefined }),
    enabled: Boolean(selectedLeagueMonth),
    placeholderData: (previousData) =>
      previousData ??
      (cacheReady ? getCachedLeaderboardBundle("BTCUSDT", locale, { includeRelated: false, leagueMonth: undefined }) ?? undefined : undefined)
  });

  const bundle = useMemo<LeaderboardBundle>(() => {
    return btcQuery.data ?? fallbackBundle;
  }, [btcQuery.data, fallbackBundle]);

  const traders = bundle.traders?.length ? bundle.traders : (fallbackTraders as unknown as TraderProfile[]);
  const standings = useMemo(() => buildStandings(traders, bundle.summaries ?? []), [bundle.summaries, traders]);
  const liveReturnMetricByTrader = useMemo(
    () => buildLiveReturnMetricMap(currentLeagueBundleQuery.data?.summaries ?? []),
    [currentLeagueBundleQuery.data?.summaries]
  );
  const displayStandings = useMemo(
    () => (selectedLeagueMonth ? applyLiveReturnMetrics(standings, liveReturnMetricByTrader) : standings),
    [liveReturnMetricByTrader, selectedLeagueMonth, standings]
  );
  const accessReady = session.status === "unauthenticated" || Boolean(access) || (session.status === "authenticated" && accessQuery.isError);
  const isSubscribed = access?.isSubscribed === true;
  const shouldLimitForFreeAccess = accessReady && Boolean(access) && !isSubscribed;
  const visibleStandingsBase = useMemo(
    () => (shouldLimitForFreeAccess ? displayStandings.slice(0, FREE_LEADERBOARD_LIMIT) : displayStandings),
    [displayStandings, shouldLimitForFreeAccess]
  );
  const visibleStandings = useMemo(
    () => favoritesOnly ? visibleStandingsBase.filter((trader) => favoriteTraderIds.has(trader.id)) : visibleStandingsBase,
    [favoriteTraderIds, favoritesOnly, visibleStandingsBase]
  );
  const returnColumns = useMemo(() => topReturnColumns(visibleStandings, t), [t, visibleStandings]);
  const hiddenTraderCount = Math.max(0, displayStandings.length - visibleStandingsBase.length);
  const activeTrader = visibleStandings.find((item) => item.id === activeTraderId) ?? visibleStandings[0] ?? null;
  const leader = visibleStandings[0] ?? null;
  const totalEquity = visibleStandings.reduce((sum, item) => sum + item.equity, 0);
  const totalPnl = visibleStandings.reduce((sum, item) => sum + item.totalPnl, 0);
  const openPositions = visibleStandings.reduce((sum, item) => sum + item.openPositions, 0);
  const openOrders = visibleStandings.reduce((sum, item) => sum + item.openOrders, 0);
  const activeTraderCount = visibleStandings.filter((item) => item.openPositions || item.openOrders).length;
  const traderNameMap = useMemo(() => new Map(visibleStandings.map((item) => [item.id, item.name])), [visibleStandings]);
  const latestStatusFeedByTrader = useMemo(() => buildLatestStatusFeedMap(bundle.statusFeeds ?? []), [bundle.statusFeeds]);
  const currentSummaryByTrader = useMemo(
    () => buildCurrentSummaryMap(currentLeagueBundleQuery.data?.summaries ?? []),
    [currentLeagueBundleQuery.data?.summaries]
  );

  const liveExposurePositionsQuery = useQuery({
    queryKey: ["paper", "positions", "active", "BTCUSDT", "leaderboard"],
    queryFn: async (context) => unwrapPaperPositions(await getActivePaperPositions("BTCUSDT", undefined, LIVE_EXPOSURE_LIMIT, { signal: context.signal })),
    placeholderData: (previousData) => previousData ?? bundle.positions ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false
  });
  const liveExposureOrdersQuery = useQuery({
    queryKey: ["paper", "orders", "open", "BTCUSDT", "leaderboard"],
    queryFn: async (context) => unwrapPaperOrders(await getPaperOrders(LIVE_EXPOSURE_LIMIT, "BTCUSDT", "open", undefined, { signal: context.signal })),
    placeholderData: (previousData) => previousData ?? bundle.orders ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false
  });
  const liveExposurePositions = liveExposurePositionsQuery.data ?? bundle.positions ?? [];
  const liveExposureOrders = liveExposureOrdersQuery.data ?? bundle.orders ?? [];

  // Fetch pending plans dynamically
  const pendingPlansQuery = useQuery({
    queryKey: ["league", "trade-plans", "BTCUSDT", "pending"],
    queryFn: async (context) => unwrapTradePlans(await getRecentTradePlans(100, "BTCUSDT", undefined, "PAPER_TRADING_PENDING", { signal: context.signal })),
    placeholderData: (previousData) => previousData ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false
  });

  const pendingPlans = pendingPlansQuery.data ?? [];

  const exposureByTrader = useMemo(
    () => buildExposureMap(liveExposurePositions, liveExposureOrders, pendingPlans),
    [liveExposureOrders, liveExposurePositions, pendingPlans]
  );


  // Dynamic snapshot symbol
  const snapshotSymbol = "BTCUSDT";

  const activeSnapshotsQuery = useQuery({
    queryKey: ["league", "equity-snapshots", activeTab, activeTrader?.id ?? ""],
    queryFn: async (context) => unwrapEquitySnapshots(await getEquitySnapshots(45, activeTrader?.id ?? undefined, snapshotSymbol, { signal: context.signal })),
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

  const activateTrader = useCallback((traderId: string) => {
    setActiveTraderId(traderId);
  }, []);

  const selectedBundleReady = (btcQuery.isSuccess && !btcQuery.isPlaceholderData) || btcQuery.isError;
  const currentBundleReady = !selectedLeagueMonth || (currentLeagueBundleQuery.isSuccess && !currentLeagueBundleQuery.isPlaceholderData) || currentLeagueBundleQuery.isError;
  const liveExposureReady = [
    liveExposurePositionsQuery,
    liveExposureOrdersQuery,
    pendingPlansQuery
  ].every((query) => (query.isSuccess && !query.isPlaceholderData) || query.isError);
  const overviewRequired = isSubscribed || !accessReady;
  const overviewInitialReady = overviewReadyKey === locale;
  const criticalDataReady = selectedBundleReady && currentBundleReady && accessReady && liveExposureReady && (!overviewRequired || overviewInitialReady);
  const initialLoading = !criticalDataReady;
  const isFetching = btcQuery.isFetching || currentLeagueBundleQuery.isFetching || liveExposurePositionsQuery.isFetching || liveExposureOrdersQuery.isFetching || pendingPlansQuery.isFetching;
  const showBackgroundFetching = !initialLoading && isFetching;

  return (
    <div className="grid gap-3 pb-[calc(5rem+env(safe-area-inset-bottom))] md:gap-4 md:pb-8">
      <PageLoadingOverlay
        active={initialLoading}
        label={t("common.loadingLeagueData")}
        detail={t("common.loadingLiveDataDetail")}
      />

      <section
        data-testid="league-overview-section"
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070908] text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] md:rounded-[22px]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(circle at 50% 25%, rgba(16,185,129,0.12), transparent 40%)",
          backgroundSize: "96px 96px, 96px 96px, auto"
        }}
      >
        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-7 md:py-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-400 md:text-sm">[ LEAGUE OVERVIEW ]</p>
            <p className="mt-1 text-xs text-zinc-500 md:hidden">{t("leaderboard.latestActivity")}</p>
          </div>
        </div>



        <ProtectedContentGate
          mode="subscription"
          title={t("access.subscriptionLockedTitle")}
          description={t("access.subscriptionLockedDescription")}
        >
          <OptionActivityStream
            locale={locale}
            traderNameMap={traderNameMap}
            onInitialReady={markOverviewInitialReady}
          />
        </ProtectedContentGate>
      </section>

      <section className="grid w-full items-start gap-3 md:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] w-full min-w-0 overflow-hidden shadow-sm transition hover:border-emerald-500/20 duration-300">
            {/* Desktop Layout */}
            <div className="hidden md:flex md:flex-row md:items-center md:justify-between w-full px-4 py-3 md:px-6 md:py-4 border-b border-white/[0.06] bg-[#080909]">
              <div
                data-testid="leaderboard-filter-rail"
                className="flex flex-wrap items-center gap-3"
                role="group"
                aria-label={t("leaderboard.allTraders")}
              >
                {/* Segmented control for League Type */}
                <div
                  data-testid="leaderboard-month-selector"
                  className="inline-flex items-center gap-1 rounded-xl bg-white/[0.02] border border-white/[0.08] p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01)]"
                >
                  <Link
                    href={selectedLeagueHref}
                    replace
                    scroll={false}
                    data-league-period="monthly"
                    role="button"
                    onClick={activateSelectedLeagueMonth}
                    className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-bold transition duration-200 ${
                      selectedLeagueMonth
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    aria-pressed={Boolean(selectedLeagueMonth)}
                  >
                    {t("leaderboard.monthlyLeague")}
                  </Link>
                  <Link
                    href={currentLeagueHref}
                    replace
                    scroll={false}
                    data-league-period="current"
                    role="button"
                    onClick={activateCurrentLeague}
                    className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-bold transition duration-200 ${
                      selectedLeagueMonth
                        ? "text-zinc-400 hover:text-white"
                        : "bg-white text-zinc-950 shadow-sm"
                    }`}
                    aria-pressed={!selectedLeagueMonth}
                  >
                    {t("leaderboard.currentLeague")}
                  </Link>
                </div>

                {/* Display Year/Month Dropdowns as independent filters */}
                {selectedLeagueMonth && (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <div className="relative inline-flex items-center rounded-xl border border-white/[0.08] bg-[#0c0d0d] px-2.5 py-1">
                      <select
                        aria-label={t("leaderboard.year")}
                        className="focus-ring bg-transparent pr-5 text-xs font-bold text-zinc-100 outline-none appearance-none cursor-pointer"
                        value={String(selectedLeagueMonthParts.year)}
                        onChange={(event) => {
                          const nextYear = Number(event.target.value);
                          const nextOption =
                            leagueMonthOptions.find((option) => option.year === nextYear && option.month === selectedLeagueMonthParts.month) ??
                            leagueMonthOptions.find((option) => option.year === nextYear);
                          if (nextOption) setLeaguePeriod(nextOption.value);
                        }}
                      >
                        {leagueYears.map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                      <CaretDown size={13} className="absolute right-2 text-zinc-500 pointer-events-none" />
                    </div>

                    <div className="relative inline-flex items-center rounded-xl border border-white/[0.08] bg-[#0c0d0d] px-2.5 py-1">
                      <select
                        aria-label={t("leaderboard.month")}
                        className="focus-ring bg-transparent pr-5 text-xs font-bold text-zinc-100 outline-none appearance-none cursor-pointer"
                        value={String(selectedLeagueMonthParts.month)}
                        onChange={(event) => {
                          const nextMonth = Number(event.target.value);
                          setLeaguePeriod(formatUtcLeagueMonth(selectedLeagueMonthParts.year, nextMonth));
                        }}
                      >
                        {leagueMonthsForSelectedYear.map((option) => (
                          <option key={option.value} value={option.month}>
                            {locale === "ko" ? `${option.month}월` : "June"}
                          </option>
                        ))}
                      </select>
                      <CaretDown size={13} className="absolute right-2 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Market Tag (styled as static/tab segmented item) */}
                <div className="inline-flex items-center rounded-xl bg-white/[0.02] border border-white/[0.08] p-1">
                  <span className="px-3.5 py-1 text-xs font-extrabold text-white">
                    BTC
                  </span>
                </div>

                {/* Favorites button (styled as a sleek active toggle button) */}
                <button
                  type="button"
                  onClick={() => {
                    if (favoritesOnly) {
                      setFavoritesOnly(false);
                    } else {
                      setFavoritesOnly(true);
                    }
                  }}
                  className={`focus-ring group inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-bold transition-[background-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.96] ${
                    favoritesOnly
                      ? "bg-amber-300 text-zinc-950 shadow-[0_0_0_1px_rgba(251,191,36,0.55),0_10px_24px_rgba(0,0,0,0.20)]"
                      : "bg-white/[0.02] text-zinc-400 border border-white/[0.08] hover:bg-white/[0.06] hover:text-zinc-100 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)]"
                  }`}
                  aria-pressed={favoritesOnly}
                >
                  <Star className="transition-transform duration-200 ease-out group-hover:-rotate-6 group-hover:scale-110" size={14} weight={favoritesOnly ? "fill" : "bold"} />
                  {t("leaderboard.favorites")}
                  {favoriteTraderIds.size ? (
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums ${
                        favoritesOnly ? "bg-zinc-950/15 text-zinc-950" : "bg-white/[0.07] text-zinc-300"
                      }`}
                    >
                      {favoriteTraderIds.size}
                    </span>
                  ) : null}
                </button>
              </div>

              {/* Right side: visual period selection dropdown */}
              <div className="flex min-w-0 items-center gap-2 md:gap-3">
                {showBackgroundFetching ? (
                  <span className="hidden items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400 sm:inline-flex">
                    <CircleNotch className="animate-spin animate-duration-1000" size={14} />
                    {t("common.loading")}
                  </span>
                ) : null}

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                    className="focus-ring inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs font-semibold hover:bg-white/[0.06] transition md:px-3"
                  >
                    <Calendar size={14} className="text-emerald-400" />
                    <span>{periodLabel(locale, selectedPeriod)}</span>
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
                            {periodLabel(locale, p)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile Layout */}
            <div className="flex flex-col gap-2.5 w-full md:hidden px-4 py-3 border-b border-white/[0.06] bg-[#080909]">
              {/* Row 1: Segmented league control (flex-grow) & BTC market tag */}
              <div
                data-testid="leaderboard-filter-rail"
                className="flex items-center gap-2 w-full"
              >
                <div
                  data-testid="leaderboard-month-selector"
                  className="inline-flex flex-1 items-center gap-1 rounded-xl bg-white/[0.02] border border-white/[0.08] p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01)]"
                >
                  <Link
                    href={selectedLeagueHref}
                    replace
                    scroll={false}
                    data-league-period="monthly"
                    role="button"
                    onClick={activateSelectedLeagueMonth}
                    className={`focus-ring flex-1 text-center rounded-lg py-1.5 text-xs font-bold transition duration-200 ${
                      selectedLeagueMonth
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                    aria-pressed={Boolean(selectedLeagueMonth)}
                  >
                    {t("leaderboard.monthlyLeague")}
                  </Link>
                  <Link
                    href={currentLeagueHref}
                    replace
                    scroll={false}
                    data-league-period="current"
                    role="button"
                    onClick={activateCurrentLeague}
                    className={`focus-ring flex-1 text-center rounded-lg py-1.5 text-xs font-bold transition duration-200 ${
                      selectedLeagueMonth
                        ? "text-zinc-400 hover:text-white"
                        : "bg-white text-zinc-950 shadow-sm"
                    }`}
                    aria-pressed={!selectedLeagueMonth}
                  >
                    {t("leaderboard.currentLeague")}
                  </Link>
                </div>

                <div className="inline-flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/[0.08] p-1 h-[34px] px-3.5">
                  <span className="text-xs font-extrabold text-white">
                    BTC
                  </span>
                </div>
              </div>

              {/* Row 2: Year & Month dropdown selects side-by-side (only visible when Monthly League is selected) */}
              {selectedLeagueMonth && (
                <div className="grid grid-cols-2 gap-2 animate-fade-in w-full">
                  <div className="relative flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d0d] px-3 py-2">
                    <select
                      aria-label={t("leaderboard.year")}
                      className="focus-ring w-full bg-transparent text-xs font-bold text-zinc-100 outline-none appearance-none cursor-pointer pr-6"
                      value={String(selectedLeagueMonthParts.year)}
                      onChange={(event) => {
                        const nextYear = Number(event.target.value);
                        const nextOption =
                          leagueMonthOptions.find((option) => option.year === nextYear && option.month === selectedLeagueMonthParts.month) ??
                          leagueMonthOptions.find((option) => option.year === nextYear);
                        if (nextOption) setLeaguePeriod(nextOption.value);
                      }}
                    >
                      {leagueYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <CaretDown size={13} className="absolute right-3 text-zinc-500 pointer-events-none" />
                  </div>

                  <div className="relative flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0c0d0d] px-3 py-2">
                    <select
                      aria-label={t("leaderboard.month")}
                      className="focus-ring w-full bg-transparent text-xs font-bold text-zinc-100 outline-none appearance-none cursor-pointer pr-6"
                      value={String(selectedLeagueMonthParts.month)}
                      onChange={(event) => {
                        const nextMonth = Number(event.target.value);
                        setLeaguePeriod(formatUtcLeagueMonth(selectedLeagueMonthParts.year, nextMonth));
                      }}
                    >
                      {leagueMonthsForSelectedYear.map((option) => (
                        <option key={option.value} value={option.month}>
                          {locale === "ko" ? `${option.month}월` : "June"}
                        </option>
                      ))}
                    </select>
                    <CaretDown size={13} className="absolute right-3 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Row 3: Favorites toggle button & Calendar period selector */}
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (favoritesOnly) {
                      setFavoritesOnly(false);
                    } else {
                      setFavoritesOnly(true);
                    }
                  }}
                  className={`focus-ring group inline-flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-bold transition-[background-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.96] ${
                    favoritesOnly
                      ? "bg-amber-300 text-zinc-950 shadow-[0_0_0_1px_rgba(251,191,36,0.55)]"
                      : "bg-white/[0.02] text-zinc-400 border border-white/[0.08] hover:bg-white/[0.06] hover:text-zinc-100"
                  }`}
                  aria-pressed={favoritesOnly}
                >
                  <Star className="transition-transform duration-200 ease-out group-hover:-rotate-6 group-hover:scale-110" size={14} weight={favoritesOnly ? "fill" : "bold"} />
                  {t("leaderboard.favorites")}
                  {favoriteTraderIds.size ? (
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums ${
                        favoritesOnly ? "bg-zinc-950/15 text-zinc-950" : "bg-white/[0.07] text-zinc-300"
                      }`}
                    >
                      {favoriteTraderIds.size}
                    </span>
                  ) : null}
                </button>

                <div className="relative w-full">
                  <button
                    type="button"
                    onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                    className="focus-ring inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] text-xs font-semibold hover:bg-white/[0.06] transition"
                  >
                    <Calendar size={14} className="text-emerald-400" />
                    <span>{periodLabel(locale, selectedPeriod)}</span>
                    <CaretDown size={12} className="text-zinc-400" />
                  </button>

                  {isPeriodOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsPeriodOpen(false)} />
                      <div className="absolute right-0 mt-1.5 w-full rounded-lg border border-white/10 bg-[#0c0d0d] p-1 shadow-lg z-20">
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
                            {periodLabel(locale, p)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

          <RankingTable
            standings={visibleStandings}
            exposureByTrader={exposureByTrader}
            currentSummaryByTrader={currentSummaryByTrader}
            activeTraderId={activeTrader?.id ?? null}
            t={t}
            locale={locale}
            favoriteTraderIds={favoriteTraderIds}
            returnColumns={returnColumns}
            onToggleFavorite={toggleFavoriteTrader}
            onActivate={activateTrader}
          />
          <MobileRankingList
            standings={visibleStandings}
            exposureByTrader={exposureByTrader}
            currentSummaryByTrader={currentSummaryByTrader}
            t={t}
            locale={locale}
            favoriteTraderIds={favoriteTraderIds}
            returnColumns={returnColumns}
            onToggleFavorite={toggleFavoriteTrader}
          />
          {shouldLimitForFreeAccess && hiddenTraderCount > 0 ? (
            <LeaderboardLockedRows count={hiddenTraderCount} t={t} />
          ) : null}
        </div>

        <TraderPreviewPanel
          trader={activeTrader}
          locale={locale}
          t={t}
          snapshots={filteredSnapshots}
          snapshotsLoading={activeSnapshotsQuery.isFetching}
          exposure={activeTrader ? exposureByTrader.get(activeTrader.id) : undefined}
          currentSummary={activeTrader ? currentSummaryByTrader.get(activeTrader.id) : undefined}
          latestStatusFeed={activeTrader ? latestStatusFeedByTrader.get(activeTrader.id) : undefined}
        />
      </section>
    </div>
  );
}

function RankingTable({ standings, exposureByTrader, currentSummaryByTrader, activeTraderId, t, locale, favoriteTraderIds, returnColumns, onToggleFavorite, onActivate }: {
  standings: TraderStanding[];
  exposureByTrader: Map<string, TraderExposure>;
  currentSummaryByTrader: ReadonlyMap<string, TraderStanding["summary"]>;
  activeTraderId: string | null;
  t: (key: string) => string;
  locale: Locale;
  favoriteTraderIds: ReadonlySet<string>;
  returnColumns: readonly ReturnColumn[];
  onToggleFavorite: (traderId: string) => void;
  onActivate: (traderId: string) => void;
}) {
  const primaryReturnColumn = returnColumns[0] ?? fallbackReturnColumn("cumulative", t);
  const secondaryReturnColumn = returnColumns[1] ?? fallbackReturnColumn("return7d", t);

  return (
    <div className="hidden overflow-x-auto lg:block w-full">
      <div className="min-w-[920px]">
        <div className={`grid ${RANKING_GRID_CLASS} border-b px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-zinc-400 md:px-6`} style={{ borderColor: "var(--border)" }}>
          <div className="whitespace-nowrap">{t("leaderboard.rank")}</div>
          <div className="whitespace-nowrap">{t("leaderboard.trader")}</div>
          <div className="text-right whitespace-nowrap">{t("leaderboard.progressStatus")}</div>
          <div className="text-right whitespace-nowrap">{primaryReturnColumn.label}</div>
          <div className="text-right whitespace-nowrap">{secondaryReturnColumn.label}</div>
          <div className="text-right whitespace-nowrap">{t("leaderboard.mdd")}</div>
          <div className="text-right whitespace-nowrap">{t("common.winRate")}</div>
          <div aria-hidden />
        </div>
        <div className="divide-y divide-[var(--border)]">
          {standings.map((trader) => {

            const exposure = exposureByTrader.get(trader.id);
            const progress = traderProgress(trader, exposure, t, locale, currentSummaryByTrader.get(trader.id));
            const isActive = activeTraderId === trader.id;
            const primaryReturnValue = returnMetricValue(trader, primaryReturnColumn.key);
            const secondaryReturnValue = returnMetricValue(trader, secondaryReturnColumn.key);
            const isFavorite = favoriteTraderIds.has(trader.id);
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
                <MetricValue value={formatSignedPercent(primaryReturnValue)} tone={primaryReturnValue >= 0 ? "good" : "bad"} />
                <MetricValue value={formatSignedPercent(secondaryReturnValue)} tone={secondaryReturnValue >= 0 ? "good" : "bad"} />
                <MetricValue value={formatDrawdown(trader.maxDrawdown)} />
                <MetricValue value={formatNullablePercent(trader.winRate)} />
                <FavoriteButton
                  active={isFavorite}
                  t={t}
                  onToggle={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleFavorite(trader.id);
                  }}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LeaderboardLockedRows({ count, t }: { readonly count: number; readonly t: (key: string) => string }) {
  return (
    <div className="border-t border-white/10 bg-zinc-950/30 px-4 pb-6 pt-5 md:px-6">
      <ProtectedContentGate
        mode="subscription"
        title={t("access.leaderboardPreviewTitle")}
        description={t("access.leaderboardPreviewBody")}
        className="min-h-[156px]"
      >
        <div className="flex min-h-[156px] items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">{t("access.hiddenTraders")}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-400 text-pretty">{t("access.leaderboardPreviewBody")}</p>
          </div>
          <span className="font-mono text-xl font-bold text-zinc-200">+{count}</span>
        </div>
      </ProtectedContentGate>
    </div>
  );
}

function MobileRankingList({ standings, exposureByTrader, currentSummaryByTrader, t, locale, favoriteTraderIds, returnColumns, onToggleFavorite }: {
  standings: TraderStanding[];
  exposureByTrader: Map<string, TraderExposure>;
  currentSummaryByTrader: ReadonlyMap<string, TraderStanding["summary"]>;
  t: (key: string) => string;
  locale: Locale;
  favoriteTraderIds: ReadonlySet<string>;
  returnColumns: readonly ReturnColumn[];
  onToggleFavorite: (traderId: string) => void;
}) {
  const primaryReturnColumn = returnColumns[0] ?? fallbackReturnColumn("cumulative", t);

  return (
    <div className="lg:hidden">
      <div className="grid grid-cols-[38px_minmax(0,1fr)_88px_28px] items-center gap-2 border-b border-zinc-200/40 dark:border-white/[0.06] px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">
        <span>{t("leaderboard.rank")}</span>
        <span>{t("leaderboard.trader")}</span>
        <span className="text-right">{primaryReturnColumn.label}</span>
        <span aria-hidden />
      </div>
      <div className="divide-y divide-zinc-200/40 dark:divide-white/[0.06]">
        {standings.map((trader) => {
            const progress = traderProgress(trader, exposureByTrader.get(trader.id), t, locale, currentSummaryByTrader.get(trader.id));
            const displayName = localizedTraderName(trader, t);
            const isFavorite = favoriteTraderIds.has(trader.id);
            const returnValue = returnMetricValue(trader, primaryReturnColumn.key);
            return (
              <Link
                key={trader.id}
                href={`/leaderboard/${trader.id}`}
                className="focus-ring grid grid-cols-[38px_minmax(0,1fr)_88px_28px] items-center gap-2 px-3 py-3.5 transition hover:bg-white/[0.02]"
              >
                <RankBadge rank={trader.rank} compact />
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[15px] font-bold text-white">
                        {displayName}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{t(traderShortKey(trader.id))}</p>
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      <StatusPill label={progress.label} tone={progress.tone} />
                      <SideBadge progress={progress} />
                      <LeverageBadge progress={progress} />
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-right">
                  <p className={`font-mono text-[15px] font-bold ${returnValue >= 0 ? "value-good" : "value-bad"}`}>{formatSignedPercent(returnValue)}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-500">{primaryReturnColumn.label}</p>
                  {progress.detail ? <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-400">{progress.detail}</p> : null}
                </div>
                <FavoriteButton
                  active={isFavorite}
                  t={t}
                  compact
                  onToggle={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleFavorite(trader.id);
                  }}
                />
              </Link>
            );
          })}
      </div>
    </div>
  );
}

function TraderPreviewPanel({ trader, t, locale, snapshots, snapshotsLoading, exposure, currentSummary, latestStatusFeed }: {
  trader: TraderStanding | null;
  t: (key: string) => string;
  locale: Locale;
  snapshots: EquitySnapshot[];
  snapshotsLoading: boolean;
  exposure?: TraderExposure;
  currentSummary?: TraderStanding["summary"];
  latestStatusFeed?: TraderStatusFeed;
}) {
  if (!trader) {
    return (
      <aside className="data-card hidden xl:block p-6 sticky top-[74px] w-full min-w-0">
        <div className="text-muted-app text-sm">{t("leaderboard.noTraderSelected")}</div>
      </aside>
    );
  }

  const progress = traderProgress(trader, exposure, t, locale, currentSummary);
  const state = progress.label;
  const displayName = localizedTraderName(trader, t);

  return (
    <aside className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] hidden xl:block shadow-sm transition hover:border-emerald-500/20 duration-300 w-full min-w-0 sticky top-[74px] p-5 overflow-hidden">
      <div className="flex flex-col gap-4 w-full min-w-0">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-zinc-500 text-xs uppercase tracking-wider font-bold">{t("leaderboard.previewTitle")}</p>
              <h3 className="mt-1 truncate text-2xl font-bold tracking-tight text-white">
                {displayName}
              </h3>
              <p className="text-zinc-400 mt-2 text-xs leading-relaxed font-sans break-keep">{t(traderDetailKey(trader.id))}</p>
              <LatestStatusFeedNote feed={latestStatusFeed} locale={locale} t={t} />
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
            <MiniCell label={t("common.return7d")} value={formatSignedPercent(trader.return7d)} />
            <MiniCell label={t("leaderboard.mdd")} value={formatDrawdown(trader.maxDrawdown)} />
            <MiniCell label={t("common.winRate")} value={formatNullablePercent(trader.winRate)} />
            <MiniCell label={t("leaderboard.trades")} value={formatNumber(trader.trades, 0, locale)} />
          </div>
        </section>

        <Link
          href={`/leaderboard/${trader.id}`}
          className="action-button focus-ring w-full justify-center rounded-full bg-emerald-500 shadow-neon-emerald hover:bg-emerald-400 text-white font-bold tracking-wide transition duration-300 py-3"
        >
          {t("leaderboard.viewTrader")}
          <ArrowRight size={16} weight="bold" />
        </Link>
      </div>
    </aside>
  );
}

function RankBadge({ rank, compact = false }: { rank: number; compact?: boolean }) {
  if (rank <= 3) {
    const medalClass =
      rank === 1
        ? "bg-amber-300/25 text-amber-200 ring-amber-300/35"
        : rank === 2
          ? "bg-zinc-300/20 text-zinc-100 ring-zinc-300/30"
          : "bg-orange-300/20 text-orange-200 ring-orange-300/30";
    const Icon = rank === 1 ? Trophy : Medal;
    return (
      <span className={`${compact ? "size-8" : "size-10"} grid place-items-center rounded-full ring-1 ${medalClass}`} title={`#${rank}`}>
        <Icon size={compact ? 17 : 20} weight="fill" />
      </span>
    );
  }
  const colors =
    "bg-[var(--surface-muted)] text-muted-app";
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
  const displayName = localizedTraderName(trader, t);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TraderMark trader={trader} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-bold tracking-tight text-white">
            {displayName}
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

function topReturnColumns(standings: readonly TraderStanding[], t: (key: string) => string): readonly ReturnColumn[] {
  const columns = RETURN_METRIC_KEYS.map((key) => {
    const peakValue = standings.reduce((peak, trader) => Math.max(peak, returnMetricValue(trader, key)), Number.NEGATIVE_INFINITY);
    return {
      key,
      label: returnMetricLabel(key, t),
      peakValue: Number.isFinite(peakValue) ? peakValue : 0
    };
  });
  const positives = columns.filter((metric) => metric.peakValue > 0).sort((a, b) => b.peakValue - a.peakValue);
  const fallback = columns.filter((metric) => metric.peakValue <= 0).sort((a, b) => b.peakValue - a.peakValue);
  return [...positives, ...fallback].slice(0, 2);
}

function fallbackReturnColumn(key: ReturnMetricKey, t: (key: string) => string): ReturnColumn {
  return {
    key,
    label: returnMetricLabel(key, t),
    peakValue: 0
  };
}

function returnMetricLabel(key: ReturnMetricKey, t: (key: string) => string): string {
  switch (key) {
    case "monthly":
      return t("leaderboard.monthlyReturn");
    case "cumulative":
      return t("leaderboard.cumulativeReturn");
    case "return7d":
      return t("common.return7d");
    case "return24h":
      return t("common.return24h");
    case "return30d":
      return t("common.return30d");
  }
}

function returnMetricValue(trader: TraderStanding, key: ReturnMetricKey): number {
  switch (key) {
    case "monthly":
      return trader.monthlyReturn;
    case "cumulative":
      return trader.returnPct;
    case "return7d":
      return trader.return7d;
    case "return24h":
      return trader.return24h;
    case "return30d":
      return trader.return30d;
  }
}

function FavoriteButton({
  active,
  compact = false,
  t,
  onToggle
}: {
  active: boolean;
  compact?: boolean;
  t: (key: string) => string;
  onToggle: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`focus-ring grid ${compact ? "size-7" : "size-8"} place-items-center rounded-full transition ${
        active
          ? "bg-amber-300/15 text-amber-300 hover:bg-amber-300/25"
          : "text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
      }`}
      onClick={onToggle}
      aria-label={active ? t("leaderboard.unfavoriteTrader") : t("leaderboard.favoriteTrader")}
      aria-pressed={active}
    >
      <Star size={compact ? 15 : 16} weight={active ? "fill" : "bold"} />
    </button>
  );
}

function MetricValue({ value, label, tone = "neutral" }: { value: string; label?: string; tone?: "good" | "bad" | "warn" | "neutral" }) {
  const toneClass = tone === "good" ? "value-good" : tone === "bad" ? "value-bad" : tone === "warn" ? "value-warn" : "text-muted-app";
  return (
    <div className="min-w-0 text-right">
      {label ? <p className="truncate text-[10px] font-semibold text-zinc-500">{label}</p> : null}
      <p className={`font-mono text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
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
  return <span className={`inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap ${toneClass}`}>{label}</span>;
}

function MiniCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--surface)] px-3 py-2 ring-1 ring-[var(--border)]">
      <p className="text-soft-app truncate text-[11px] font-medium">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}



function buildExposureMap(positions: PaperPosition[], orders: PaperOrder[], plans: Array<Record<string, any>> = []) {
  const map = new Map<string, TraderExposure>();
  for (const position of positions) {
    if (!isActivePosition(position.status)) continue;
    const traderId = String(position.traderId ?? position.trader_id ?? "");
    if (!traderId) continue;
    const current = map.get(traderId) ?? {};
    const next = appendLeverageSample(current, positionLeverage(position));
    map.set(traderId, { ...next, position: next.position ?? position });
  }
  for (const order of orders) {
    if (!isActiveOrder(order.status)) continue;
    const traderId = String(order.traderId ?? order.trader_id ?? "");
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

function buildLatestStatusFeedMap(feeds: TraderStatusFeed[]) {
  const map = new Map<string, TraderStatusFeed>();
  for (const feed of feeds) {
    const traderId = String(feed.traderId ?? feed.trader_id ?? "");
    if (!traderId) continue;
    const current = map.get(traderId);
    const feedTime = feed.createdAt ?? feed.created_at;
    const currentTime = current?.createdAt ?? current?.created_at;
    if (!current || timeValue(feedTime) > timeValue(currentTime)) {
      map.set(traderId, feed);
    }
  }
  return map;
}

function buildCurrentSummaryMap(summaries: LeaderboardBundle["summaries"]) {
  const map = new Map<string, TraderStanding["summary"]>();
  for (const summary of summaries) {
    if (!summary?.traderId) continue;
    map.set(summary.traderId, summary);
  }
  return map;
}

function buildLiveReturnMetricMap(summaries: LeaderboardBundle["summaries"]) {
  const map = new Map<string, Pick<TraderStanding, "returnPct" | "return7d" | "return24h" | "return30d">>();
  for (const summary of summaries) {
    if (!summary?.traderId) continue;
    map.set(summary.traderId, {
      returnPct: numberValue(summary.cumulativeReturn) ?? 0,
      return7d: numberValue(summary.return7d) ?? 0,
      return24h: numberValue(summary.return24h) ?? 0,
      return30d: numberValue(summary.return30d) ?? 0
    });
  }
  return map;
}

function applyLiveReturnMetrics(
  standings: readonly TraderStanding[],
  liveReturnMetricByTrader: ReadonlyMap<string, Pick<TraderStanding, "returnPct" | "return7d" | "return24h" | "return30d">>
) {
  if (!liveReturnMetricByTrader.size) return [...standings];
  return standings.map((trader) => {
    const live = liveReturnMetricByTrader.get(trader.id);
    if (!live) return trader;
    return {
      ...trader,
      returnPct: live.returnPct,
      return7d: live.return7d,
      return24h: live.return24h,
      return30d: live.return30d
    };
  });
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

function traderProgress(
  trader: TraderStanding,
  exposure: TraderExposure | undefined,
  t: (key: string) => string,
  locale: Locale,
  currentSummary?: TraderStanding["summary"]
): TraderProgress {
  const summary = trader.summary;
  const liveSummary = currentSummary ?? summary;
  const liveSummaryRecord = liveSummary as Record<string, unknown> | undefined;
  const position = exposure?.position;
  const order = exposure?.order;
  const plan = exposure?.plan;
  if (position || (liveSummary?.openPositions ?? 0) > 0 || (summary?.openPositions ?? 0) > 0) {
    const roi = position ? positionRoi(position) : summaryRoi(liveSummary) ?? summaryRoi(summary);
    const fallbackDetail = getElapsedTimeString(liveSummary?.updatedAt ?? summary?.updatedAt);
    const detail = roi === null ? fallbackDetail : `${t("leaderboard.status.roi")} ${formatSignedPercent(roi, 1)}`;
    const side = normalizeSide(position?.side ?? (liveSummaryRecord?.side as string | undefined));
    const leverage = activePositionLeverage({ exposure, summary: liveSummary ?? summary, trader, position });
    return {
      label: t("leaderboard.status.inPosition"),
      detail,
      tone: roi !== null && roi < 0 ? "bad" : "good",
      side,
      sideDetail: roi === null ? undefined : formatSignedPercent(roi, 1),
      leverage
    };
  }
  if (order || (liveSummary?.openOrders ?? 0) > 0 || (summary?.openOrders ?? 0) > 0) {
    const price = numberValue(order?.limitPrice, order?.price, order?.stopPrice, order?.triggerPrice);
    const side = normalizeSide(order?.side ?? (liveSummaryRecord?.side as string | undefined));
    const leverage = numberValue(orderLeverage(order), liveSummary?.averageLeverage, summary?.averageLeverage, trader.averageLeverage, liveSummary?.leverage, summary?.leverage, trader.leverage);
    return {
      label: t("leaderboard.status.pendingEntry"),
      detail: price === null ? getElapsedTimeString(liveSummary?.updatedAt ?? summary?.updatedAt) : `${t("common.price")} ${formatNumber(price, 0, locale)}`,
      tone: "warn",
      side,
      sideDetail: price === null ? undefined : `@${formatNumber(price, 0, locale)}`,
      leverage
    };
  }

  const planStatus = normalizeStatusText(liveSummary?.latestPlanStatus);
  const runStatus = normalizeStatusText(liveSummary?.latestRunStatus);
  const phase = normalizeStatusText(liveSummary?.agentPhase);
  if (planStatus === "PAPER_TRADING_PENDING") {
    const side = normalizeSide(plan?.side ?? plan?.payload?.side ?? (liveSummaryRecord?.side as string | undefined));
    const price = planEntryPrice(plan);
    const leverage = numberValue(planLeverage(plan), liveSummary?.averageLeverage, summary?.averageLeverage, trader.averageLeverage, liveSummary?.leverage, summary?.leverage, trader.leverage);
    return {
      label: t("leaderboard.status.qualifiedSetup"),
      detail: price === null ? statusLabel(liveSummary?.latestPlanStatus, t) : `${t("common.price")} ${formatNumber(price, 0, locale)}`,
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
      detail: getElapsedTimeString(liveSummary?.updatedAt ?? summary?.updatedAt),
      tone: "neutral"
    };
  }
  if (phase === "PENDING_ORDER") {
    return {
      label: t("leaderboard.status.pendingEntry"),
      detail: statusLabel(liveSummary?.agentPhase ?? summary?.agentPhase, t),
      tone: "warn"
    };
  }
  return {
    label: t("leaderboard.status.watching"),
    detail: statusLabel(liveSummary?.agentPhase ?? liveSummary?.latestRunStatus ?? summary?.agentPhase ?? summary?.latestRunStatus, t),
    tone: "neutral"
  };
}

function unwrapEquitySnapshots(value: { snapshots?: EquitySnapshot[] } | EquitySnapshot[]) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.snapshots) ? value.snapshots : [];
}

function unwrapPaperPositions(value: { positions?: PaperPosition[] } | PaperPosition[]) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.positions) ? value.positions : [];
}

function unwrapPaperOrders(value: { orders?: PaperOrder[] } | PaperOrder[]) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value.orders) ? value.orders : [];
}

function unwrapTradePlans(value: unknown): Array<Record<string, any>> {
  if (Array.isArray(value)) return value as Array<Record<string, any>>;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, any>;
  if (Array.isArray(record.tradePlans)) return record.tradePlans;
  if (Array.isArray(record.plans)) return record.plans;
  return [];
}

async function saveLeaderboardFavoritePreferences(
  preferences: SubscriberPreferences,
  next: string[],
  locale: Locale
) {
  const response = await fetch("/api/subscriber/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...preferences,
      favoriteTraderIds: [...next],
      locale
    })
  });
  if (!response.ok) return null;
  return await response.json() as SubscriberPreferences;
}

function traderName(id: string | null | undefined, t: (key: string) => string, traderNameMap: Map<string, string>) {
  if (!id) return "-";
  const localizationKey = traderNameKey(id);
  const translated = t(localizationKey);
  if (translated !== localizationKey) {
    return translated;
  }
  return traderNameMap.get(id) ?? id.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function localizedTraderName(trader: TraderStanding, t: (key: string) => string) {
  const localizationKey = traderNameKey(trader.id);
  const translated = t(localizationKey);
  return translated === localizationKey ? trader.name : translated;
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

// -------------------------------------------------------------
// LEAGUE OVERVIEW COMPONENTS
// -------------------------------------------------------------

function getReviewImportance(decision: string, text: string): 'critical' | 'important' | 'watch' | 'routine' {
  const upperDecision = decision.toUpperCase();
  const upperText = text.toUpperCase();

  const criticalWords = [
    "LIQUIDATION", "STOP_LOSS", "CLOSE_POSITION", "FORCE_EXIT", 
    "CANCEL_REMAINING_ORDERS", "CANCEL_REMAINING", "EXIT", 
    "청산", "손절", "강제 종료", "종료"
  ];
  
  const importantWords = [
    "MOVE_STOP", "STOP_UPDATED", "REDUCE", "TAKE_PARTIAL", 
    "PARTIAL_TAKE", "ADJUST", "TIGHTEN", "LEVERAGE",
    "익절", "조절", "수정", "이동", "레버리지"
  ];
  
  const watchWords = [
    "PENDING", "OPEN", "HOLD", "REVIEW", "CONTINUATION", 
    "CONFIRMATION", "SCAN", "MONITOR",
    "유지", "대기", "관찰", "검토", "감시", "상태 유지"
  ];

  if (criticalWords.some(word => upperDecision.includes(word) || upperText.includes(word))) {
    return 'critical';
  }
  if (importantWords.some(word => upperDecision.includes(word) || upperText.includes(word))) {
    return 'important';
  }
  if (watchWords.some(word => upperDecision.includes(word) || upperText.includes(word))) {
    return 'watch';
  }
  return 'routine';
}

function extractOverviewReviews(value: unknown): OverviewReviewRecord[] {
  if (Array.isArray(value)) return value.filter(isOverviewReviewRecord);
  const record = recordValue(value);
  if (!record) return [];
  const managementReviews = record.managementReviews;
  if (Array.isArray(managementReviews)) return managementReviews.filter(isOverviewReviewRecord);
  const aiReviews = record.aiReviews;
  if (Array.isArray(aiReviews)) return aiReviews.filter(isOverviewReviewRecord);
  const reviews = record.reviews;
  if (Array.isArray(reviews)) return reviews.filter(isOverviewReviewRecord);
  return [];
}

async function loadOverviewReviewPage(limit: number, offset: number, locale: Locale, options?: { readonly preferCached?: boolean; readonly signal?: AbortSignal }) {
  const response = await getLeagueOverviewReviews(limit, offset, locale, undefined, undefined, options);
  const reviews = mergeOverviewReviews([], extractOverviewReviews(response));
  return {
    reviews,
    nextOffset: Number.isFinite(response.nextOffset) ? response.nextOffset : offset + reviews.length,
    hasMore: response.hasMore,
    warming: response.warming === true
  };
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /aborted|abort|socket hang up|ECONNRESET/i.test(message);
}

function mergeOverviewReviews(existing: readonly OverviewReviewRecord[], incoming: readonly OverviewReviewRecord[]) {
  const seen = new Set<string>();
  const merged: OverviewReviewRecord[] = [];
  for (const review of [...incoming, ...existing]) {
    const key = overviewReviewKey(review);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(review);
  }
  return merged.sort((left, right) => overviewReviewTime(right) - overviewReviewTime(left));
}

function overviewReviewKey(review: OverviewReviewRecord) {
  const id = review.id;
  const source = review.overviewSource ?? "review";
  if (id !== null && id !== undefined && id !== "") return `${source}:id:${String(id)}`;
  return [
    source,
    review.traderId ?? review.trader_id,
    review.createdAt ?? review.created_at,
    review.decision ?? review.action,
    review.rationale ?? recordValue(review.review)?.rationale ?? recordValue(review.event)?.reason
  ].map((value) => String(value ?? "")).join("|");
}

function overviewReviewTime(review: OverviewReviewRecord) {
  const createdAt = String(review.createdAt ?? review.created_at ?? "");
  const time = createdAt ? Date.parse(createdAt) : 0;
  return Number.isFinite(time) ? time : 0;
}

function isOverviewReviewRecord(value: unknown): value is OverviewReviewRecord {
  return typeof value === "object" && value !== null;
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function OptionActivityStream({
  locale,
  traderNameMap,
  onInitialReady
}: {
  locale: Locale;
  traderNameMap: Map<string, string>;
  onInitialReady?: () => void;
}) {
  const { t } = useAppContext();
  const [reviewsList, setReviewsList] = useState<OverviewReviewRecord[]>(() => overviewActivityCache.reviews);
  const [offset, setOffset] = useState(() => overviewActivityCache.offset);
  const [hasMore, setHasMore] = useState(() => overviewActivityCache.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [hasOverviewUserScrolled, setHasOverviewUserScrolled] = useState(false);

  const isFetchingRef = useRef(false);
  const warmingAttemptsRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();
    const refreshOverviewActivityCache = async () => {
      if (isFetchingRef.current) return;
      if (overviewActivityCache.locale !== locale) {
        overviewActivityCache.locale = locale;
        overviewActivityCache.reviews = [];
        overviewActivityCache.offset = 0;
        overviewActivityCache.hasMore = true;
        overviewActivityCache.fetchedAt = 0;
        warmingAttemptsRef.current = 0;
        setHasOverviewUserScrolled(false);
      }
      const hasCachedReviews = overviewActivityCache.reviews.length > 0;
      const cacheIsFresh = (hasCachedReviews || !overviewActivityCache.hasMore) && Date.now() - overviewActivityCache.fetchedAt < OVERVIEW_CACHE_TTL_MS;
      if (cacheIsFresh) {
        setReviewsList(overviewActivityCache.reviews);
        setOffset(overviewActivityCache.offset);
        setHasMore(overviewActivityCache.hasMore);
        onInitialReady?.();
        return;
      }
      isFetchingRef.current = true;
      setIsLoading(!hasCachedReviews);
      let keepLoadingForWarmup = false;
      setHasLoadError(false);
      try {
        const page = await loadOverviewReviewPage(OVERVIEW_INITIAL_LIMIT, 0, locale, {
          preferCached: true,
          signal: abortController.signal
        });
        let fetchedReviews = page.reviews;
        let nextOffset = page.nextOffset;
        let hasMorePage = page.hasMore;
        if (page.warming && fetchedReviews.length === 0) {
          overviewActivityCache.fetchedAt = 0;
          warmingAttemptsRef.current += 1;
          if (active && warmingAttemptsRef.current <= OVERVIEW_WARMING_RETRY_LIMIT) {
            keepLoadingForWarmup = true;
            retryTimer = setTimeout(refreshOverviewActivityCache, 1500);
            return;
          }
          const directPage = await loadOverviewReviewPage(OVERVIEW_INITIAL_LIMIT, 0, locale, {
            preferCached: false,
            signal: abortController.signal
          });
          fetchedReviews = directPage.reviews;
          nextOffset = directPage.nextOffset;
          hasMorePage = directPage.hasMore;
        }
        warmingAttemptsRef.current = 0;
        const mergedReviews = mergeOverviewReviews(overviewActivityCache.reviews, fetchedReviews);
        overviewActivityCache.reviews = mergedReviews;
        overviewActivityCache.offset = Math.max(hasCachedReviews ? overviewActivityCache.offset : 0, nextOffset);
        overviewActivityCache.hasMore = hasMorePage;
        overviewActivityCache.fetchedAt = Date.now();
        if (active) {
          setReviewsList(overviewActivityCache.reviews);
          setOffset(overviewActivityCache.offset);
          setHasMore(overviewActivityCache.hasMore);
          onInitialReady?.();
        }
      } catch (err) {
        if (isAbortError(err) || abortController.signal.aborted) return;
        console.error("Failed to load initial reviews:", err);
        overviewActivityCache.hasMore = false;
        overviewActivityCache.fetchedAt = Date.now();
        if (active) {
          setHasMore(false);
          setHasLoadError(true);
          onInitialReady?.();
        }
      } finally {
        isFetchingRef.current = false;
        if (active && !keepLoadingForWarmup) setIsLoading(false);
      }
    };
    refreshOverviewActivityCache();
    return () => {
      active = false;
      abortController.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [locale, onInitialReady]);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const nextOffset = offset;
      const page = await loadOverviewReviewPage(OVERVIEW_PAGE_LIMIT, nextOffset, locale);
      const fetchedReviews = page.reviews;
      const existingKeys = new Set(overviewActivityCache.reviews.map(overviewReviewKey));
      const uniqueReviews = fetchedReviews.filter((review) => !existingKeys.has(overviewReviewKey(review)));

      if (fetchedReviews.length === 0 || uniqueReviews.length === 0) {
        overviewActivityCache.hasMore = false;
        setHasMore(false);
        return;
      }

      overviewActivityCache.reviews = mergeOverviewReviews(overviewActivityCache.reviews, uniqueReviews);
      overviewActivityCache.offset = page.nextOffset;
      overviewActivityCache.hasMore = page.hasMore;
      overviewActivityCache.fetchedAt = Date.now();
      setReviewsList(overviewActivityCache.reviews);
      setOffset(overviewActivityCache.offset);
      setHasMore(overviewActivityCache.hasMore);
    } catch (err) {
      console.error("Failed to load more reviews:", err);
      overviewActivityCache.hasMore = false;
      setHasMore(false);
      setHasLoadError(true);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [locale, offset, hasMore]);

  const handleOverviewScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || container.scrollTop <= 12) return;
    setHasOverviewUserScrolled(true);
  }, []);

  // Set up IntersectionObserver
  useEffect(() => {
    if (!hasOverviewUserScrolled || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      {
        root: containerRef.current,
        threshold: 0.1
      }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [loadMore, hasOverviewUserScrolled, hasMore, isLoading]);

  const logItems = useMemo(() => {
    const items: Array<{
      id: string;
      time: string;
      type: "AUDIT";
      traderId: string;
      trader: string;
      text: string;
      rawTime: number;
      importance?: "critical" | "important" | "watch" | "routine";
    }> = [];

    const aiReviewLogsOnly = reviewsList.filter(isDisplayableOverviewReview);
    aiReviewLogsOnly.forEach((review) => {
      const traderId = String(review.traderId ?? review.trader_id ?? "");
      const createdAt = String(review.createdAt ?? review.created_at ?? "");
      const decision = overviewReviewDecision(review) || "HOLD";
      const timeStr = formatRelativeDateTime(createdAt, locale, t);
      const rawTimeVal = createdAt ? Date.parse(createdAt) : Date.now() - 1000 * 120;
      
      let rText = "";
      const payload = (review.payload ?? {}) as Record<string, any>;
      const nested = review.review ?? payload.review ?? {};
      const event = review.event ?? payload.event ?? {};
      const aiReview = recordValue(payload.aiReview) ?? ({} as Record<string, unknown>);
      const structuredReview = recordValue(review.structuredReview)
        ?? recordValue(payload.structuredReview)
        ?? recordValue(payload.aiStructuredReview)
        ?? recordValue(aiReview.structuredReview);
      const rawTxt = String(
        review.rationale
        ?? nested.rationale
        ?? structuredReview?.headline
        ?? structuredReview?.action
        ?? payload.approvalReason
        ?? payload.aiApprovalReason
        ?? aiReview.approvalReason
        ?? event.reason
        ?? "-"
      );
      if (rawTxt && rawTxt !== "-") {
        rText = rawTxt.substring(0, 150) + (rawTxt.length > 150 ? "..." : "");
      }

      const importance = getReviewImportance(decision, rText);
      const entryReview = review.overviewSource === "entry_review";

      items.push({
        id: `${review.overviewSource ?? "review"}-${review.id ?? createdAt}-${traderId}`,
        time: timeStr,
        type: "AUDIT",
        traderId,
        trader: traderName(traderId, t, traderNameMap),
        text: `${entryReview ? t("leaderboard.entryReviewCompleted") : t("leaderboard.riskAuditCompleted")}: [${decision}] ${rText || t("leaderboard.maintainStatus")}`,
        rawTime: rawTimeVal,
        importance
      });
    });

    items.sort((a, b) => b.rawTime - a.rawTime);

    return items;
  }, [reviewsList, traderNameMap, locale, t]);

  const showInitialState = logItems.length === 0;

  return (
    <div className="overflow-hidden rounded-b-2xl p-3 text-left md:rounded-b-[22px] md:p-5">
      <div className="flex min-h-[238px] flex-col justify-between rounded-2xl border border-white/[0.07] bg-black/75 p-4 font-mono text-xs leading-5 text-zinc-300 shadow-inner md:min-h-[326px] md:p-5 md:text-[13px] md:leading-6">
        <div
          data-testid="league-overview-stream"
          ref={containerRef}
          onScroll={handleOverviewScroll}
          className="max-h-[178px] space-y-1.5 overflow-y-auto pr-2 scroll-smooth scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 md:max-h-[264px]"
        >
          {showInitialState && isLoading ? (
            <div className="flex min-h-[120px] items-center justify-center gap-2 text-zinc-500">
              <CircleNotch className="animate-spin animate-duration-1000 text-emerald-400" size={13} />
              <span>{t("leaderboard.loadingOlderLogs")}</span>
            </div>
          ) : null}
          {showInitialState && !isLoading && hasLoadError ? (
            <div className="flex min-h-[120px] items-center justify-center px-4 text-center font-sans text-xs text-zinc-500">
              {t("common.liveDataUnavailable")}
            </div>
          ) : null}
          {showInitialState && !isLoading && !hasLoadError ? (
            <div className="flex min-h-[120px] items-center justify-center px-4 text-center font-sans text-xs text-zinc-500">
              {t("leaderboard.endOfActivity")}
            </div>
          ) : null}
          {logItems.map((log) => {
            let dotColor = "bg-emerald-400";
            if (log.importance === "critical") {
              dotColor = "bg-rose-500";
            } else if (log.importance === "important") {
              dotColor = "bg-amber-500";
            } else if (log.importance === "watch") {
              dotColor = "bg-sky-500";
            } else {
              dotColor = "bg-emerald-400";
            }

            return (
              <Link
                key={log.id}
                href={`/leaderboard/${log.traderId}`}
                className="group -mx-2 flex flex-col gap-1 rounded-lg border-b border-white/[0.025] px-2 py-1.5 transition-colors last:border-0 hover:bg-white/[0.035] sm:flex-row sm:items-start sm:gap-2.5"
              >
                <span className="flex items-center gap-2 sm:block">
                  <span className="shrink-0 select-none font-mono text-zinc-500 transition-colors group-hover:text-zinc-400">[{log.time}]</span>
                  <span className="flex min-w-0 items-center gap-1.5 font-sans font-bold sm:hidden">
                    <span className={`inline-block size-1.5 rounded-full ${dotColor} animate-pulse`} />
                    <span className="truncate text-zinc-400 transition-colors group-hover:text-emerald-400">{log.trader}</span>
                  </span>
                </span>
                <span className="hidden items-center gap-1.5 font-sans font-bold sm:flex sm:shrink-0">
                  <span className={`inline-block size-1.5 rounded-full ${dotColor} animate-pulse`} />
                  <span className="text-zinc-400 transition-colors group-hover:text-emerald-400">{log.trader}</span>
                </span>
                <span className="line-clamp-2 flex-1 break-keep font-sans text-zinc-300 transition-colors group-hover:text-white md:truncate">{log.text}</span>
                <span className="hidden shrink-0 self-center font-mono text-[10px] text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 sm:inline">
                  {t("leaderboard.viewArrow")} →
                </span>
              </Link>
            );
          })}
          
          {/* Intersection Observer Sentinel */}
          <div ref={observerTarget} className="h-1" />
          
          {!showInitialState && isLoading && (
            <div className="flex items-center justify-center py-2 text-zinc-500 font-mono text-[10px] gap-1.5 animate-pulse">
              <CircleNotch className="animate-spin animate-duration-1000 text-emerald-400" size={12} />
              <span>{t("leaderboard.loadingOlderLogs")}</span>
            </div>
          )}
          
          {!hasMore && (
            <div className="text-center py-2 text-zinc-600 font-mono text-[9px] uppercase tracking-wider select-none">
              — {t("leaderboard.endOfActivity")} —
            </div>
          )}
        </div>
        
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.04] pt-2 font-mono text-[10px] text-emerald-400 select-none md:mt-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>
            {t("leaderboard.systemStatusConnected")}
          </span>
        </div>
      </div>
    </div>
  );
}
