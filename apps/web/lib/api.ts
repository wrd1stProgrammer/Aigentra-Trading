import type { QueryClient } from "@tanstack/react-query";
import type { Locale } from "@/lib/i18n";

const LOCAL_API_BASE_URL = "http://localhost:8000";
const PRODUCTION_API_BASE_URL = "https://aigentra-trading.nostalgia-drive.com";
const EXTERNAL_API_BASE_URL = resolveExternalApiBaseUrl();
const BROWSER_API_PROXY_BASE_URL = "/backend-api";

function resolveExternalApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const fallback = process.env.VERCEL === "1" || process.env.VERCEL === "true" || process.env.NODE_ENV === "production"
    ? PRODUCTION_API_BASE_URL
    : LOCAL_API_BASE_URL;
  return fallback.replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  if (typeof window === "undefined") return EXTERNAL_API_BASE_URL;
  return /^https?:\/\//i.test(EXTERNAL_API_BASE_URL) ? BROWSER_API_PROXY_BASE_URL : EXTERNAL_API_BASE_URL;
}

function resolveEventStreamBaseUrl() {
  if (typeof window !== "undefined" && /^https?:\/\//i.test(EXTERNAL_API_BASE_URL)) {
    return EXTERNAL_API_BASE_URL;
  }
  return resolveApiBaseUrl();
}

export const API_BASE_URL = resolveApiBaseUrl();
const EVENT_STREAM_API_BASE_URL = resolveEventStreamBaseUrl();
export const LEAGUE_QUERY_STALE_TIME_MS = 15_000;
export const LEAGUE_QUERY_GC_TIME_MS = 10 * 60_000;
export const LEAGUE_LIVE_REFETCH_INTERVAL_MS = 15_000;
export const LEAGUE_WARMING_REFETCH_INTERVAL_MS = 3_000;
export const LEAGUE_WARMING_REFETCH_WINDOW_MS = 30_000;
export const TRADER_DETAIL_LIVE_REFETCH_INTERVAL_MS = 15_000;
const DEFAULT_BROWSER_REQUEST_TIMEOUT_MS = 18_000;
const FAST_BROWSER_REQUEST_TIMEOUT_MS = 8_000;
const SLOW_BROWSER_REQUEST_TIMEOUT_MS = 20_000;

export type LeaderboardBundleRequestOptions = {
  readonly includeRelated?: boolean;
  readonly leagueMonth?: string;
  readonly signal?: AbortSignal;
};

export type LeaderboardPeriod =
  | {
      readonly type: "current";
      readonly timezone?: string;
    }
  | {
      readonly type: "monthly";
      readonly month: string;
      readonly start: string;
      readonly end: string;
      readonly timezone: string;
    };

export type TraderProfile = {
  id: string;
  name: string;
  description: string;
  concept?: string;
  baseRiskPercent: number;
  riskLevel: string;
  holdingHorizon?: "SCALP" | "INTRADAY" | "SWING" | "POSITION" | null;
  strategyFamily?: "BREAKOUT" | "TREND_FOLLOW" | "PULLBACK" | "MEAN_REVERSION" | "LIQUIDITY_REVERSAL" | "FLOW_CONTRARIAN" | "VOLATILITY" | null;
  longConditions?: readonly string[];
  shortConditions?: readonly string[];
  entryRules?: readonly string[];
  takeProfitRules?: readonly string[];
  stopLossRules?: readonly string[];
  aiReviewChecklist?: readonly string[];
  mockPerformance: {
    return7d: number;
    return30d: number;
    winRate: number;
    maxDrawdown: number;
    currentEquity: number;
  };
  currentPlan: string;
  launchMonth?: string | null;
  retiredFromMonth?: string | null;
  lifecycleStatus?: "active" | "new" | "retired" | string | null;
  lifecycleLabel?: string | null;
};

export type Candidate = {
  created: boolean;
  reason?: string | null;
  side?: string | null;
  setupType?: string | null;
  setupScore: number;
  holdingHorizon?: "SCALP" | "INTRADAY" | "SWING" | "POSITION" | null;
  strategyFamily?: "BREAKOUT" | "TREND_FOLLOW" | "PULLBACK" | "MEAN_REVERSION" | "LIQUIDITY_REVERSAL" | "FLOW_CONTRARIAN" | "VOLATILITY" | null;
  entries: Array<{ price: number; weight: number; reason: string }>;
  stopLoss?: number | null;
  takeProfits: Array<{ price: number; weight: number; reason: string }>;
  riskPercent?: number | null;
  invalidation?: string | null;
  notes: string[];
};

export type ReviewFact = {
  code: string;
  labelKey?: string | null;
  severity?: "info" | "warn" | "bad" | string | null;
  detail?: string | null;
  value?: string | null;
};

export type StructuredReview = {
  title?: string | null;
  verdict?: string | null;
  headline?: string | null;
  action?: string | null;
  keyReasons?: string[] | null;
  risks?: string[] | null;
  watchConditions?: string[] | null;
  managerNote?: string | null;
};

export type AIReview = {
  decision: string;
  confidence: number;
  riskLevel: string;
  reviewCode?: string | null;
  reviewFacts?: ReviewFact[] | null;
  riskFlags?: string[] | null;
  structuredReview?: StructuredReview | null;
  adjustments: string[];
  approvalReason: string;
  counterThesis: string;
  userSummary?: string | null;
  provider: string;
  model: string;
  fallback: boolean;
};

export type AgentManagementState = {
  mode?: string | null;
  phase?: string | null;
  nextReviewAt?: string | null;
  lastDecision?: string | null;
  lastAction?: string | null;
  [key: string]: any;
};

export type TraderCurrentState = {
  key?: string | null;
  labelKey?: string | null;
  source?: string | null;
  detail?: string | null;
  [key: string]: any;
};

export type RunCycleResult = {
  runId?: number | null;
  persisted?: boolean;
  recordIds?: Record<string, number | null>;
  trader: string;
  traderId: string;
  symbol: string;
  marketSnapshot: Record<string, any>;
  candidate: Candidate;
  aiReview?: AIReview | null;
  tradePlan?: Record<string, any> | null;
  paperPosition?: PaperPosition | Record<string, any> | null;
  paperOrder?: PaperOrder | Record<string, any> | null;
  tradeEvents?: PaperTradeEvent[] | Record<string, any>[] | null;
  equitySnapshot?: EquitySnapshot | Record<string, any> | null;
  managementReviews?: ManagementReview[] | Record<string, any>[] | null;
  paper?: Record<string, any> | null;
};

export type KlineCandle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type KlinesResponse = {
  symbol: string;
  interval: string;
  count: number;
  candles: KlineCandle[];
};

export type TraderPaperState = {
  traderId: string;
  traderName?: string | null;
  symbol?: string | null;
  status?: string | null;
  mode?: "paper" | string | null;
  cash?: number | null;
  equity?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  openPositions?: number | null;
  openOrders?: number | null;
  lastRunAt?: string | null;
  updatedAt?: string | null;
  agentMode?: string | null;
  agentPhase?: string | null;
  nextReviewAt?: string | null;
  lastDecision?: string | null;
  lastAction?: string | null;
  agentState?: AgentManagementState | null;
  managementState?: AgentManagementState | null;
  currentState?: TraderCurrentState | null;
  [key: string]: any;
};

export type TraderPaperSummary = {
  traderId: string;
  traderName?: string | null;
  symbol: string;
  mode?: "paper" | string | null;
  hasLivePaperData?: boolean;
  equity: number;
  cashBalance?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  totalFees?: number | null;
  totalPnl?: number | null;
  cumulativeReturn?: number | null;
  return24h?: number | null;
  return7d: number;
  return30d: number;
  winRate?: number | null;
  closedPositions?: number;
  wins?: number;
  losses?: number;
  maxDrawdown: number;
  riskPercent: number;
  leverage?: number | null;
  averageLeverage?: number | null;
  biggestWin?: number | null;
  biggestLoss?: number | null;
  sharpe?: number | null;
  longTrades?: number | null;
  shortTrades?: number | null;
  openNotional?: number | null;
  openMargin?: number | null;
  openOrderNotional?: number | null;
  pendingEntryWeight?: number | null;
  openOrders: number;
  openPositions: number;
  latestRunStatus?: string | null;
  latestPlanStatus?: string | null;
  currentPlanKo?: string | null;
  currentPlanEn?: string | null;
  agentMode?: string | null;
  agentPhase?: string | null;
  nextReviewAt?: string | null;
  lastDecision?: string | null;
  lastAction?: string | null;
  agentState?: AgentManagementState | null;
  managementState?: AgentManagementState | null;
  currentState?: TraderCurrentState | null;
  [key: string]: any;
};

export type PaperPosition = {
  id?: string | number;
  traderId?: string | null;
  symbol: string;
  side?: string | null;
  status?: string | null;
  quantity?: number | null;
  size?: number | null;
  entryPrice?: number | null;
  averageEntryPrice?: number | null;
  markPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  takeProfits?: Array<{ price?: number | null; weight?: number | null; reason?: string | null }>;
  unrealizedPnl?: number | null;
  realizedPnl?: number | null;
  openedAt?: string | null;
  updatedAt?: string | null;
  [key: string]: any;
};

export type PaperOrder = {
  id?: string | number;
  traderId?: string | null;
  symbol: string;
  side?: string | null;
  type?: string | null;
  status?: string | null;
  price?: number | null;
  stopPrice?: number | null;
  triggerPrice?: number | null;
  quantity?: number | null;
  filledQuantity?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: any;
};

export type PaperTradeEvent = {
  id?: string | number;
  traderId?: string | null;
  symbol?: string | null;
  orderId?: string | number | null;
  positionId?: string | number | null;
  eventType?: string | null;
  type?: string | null;
  side?: string | null;
  price?: number | null;
  quantity?: number | null;
  realizedPnl?: number | null;
  message?: string | null;
  createdAt?: string | null;
  timestamp?: string | null;
  payload?: Record<string, unknown> | null;
  [key: string]: any;
};

export type LeagueOverviewReview = ManagementReview & {
  readonly source?: "entry_review" | "management_review" | string | null;
  readonly overviewSource?: "entry_review" | "management_review" | string | null;
};

export type AITradeTerminalSource = {
  readonly events: readonly PaperTradeEvent[];
  readonly reviews: readonly LeagueOverviewReview[];
  readonly nextPage: AITradeTerminalPage | null;
};

export type AITradeTerminalPage = {
  readonly eventOffset: number | null;
  readonly reviewOffset: number | null;
};

export type EquitySnapshot = {
  id?: string | number;
  traderId?: string | null;
  symbol?: string | null;
  equity?: number | null;
  cash?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  drawdown?: number | null;
  createdAt?: string | null;
  timestamp?: string | null;
  [key: string]: any;
};

export type PaperEngineRunResult = {
  status?: string;
  mode?: "paper" | string;
  symbol?: string;
  processedOrders?: number;
  openedPositions?: number;
  closedPositions?: number;
  events?: PaperTradeEvent[];
  equitySnapshots?: EquitySnapshot[];
  [key: string]: any;
};

export type ManagementReview = {
  id?: string | number;
  runId?: string | number | null;
  traderId?: string | null;
  traderName?: string | null;
  symbol?: string | null;
  positionId?: string | number | null;
  orderId?: string | number | null;
  status?: string | null;
  action?: string | null;
  decision?: string | null;
  confidence?: number | string | null;
  riskLevel?: string | null;
  reviewCode?: string | null;
  reviewFacts?: ReviewFact[] | null;
  riskFlags?: string[] | null;
  structuredReview?: StructuredReview | null;
  reason?: string | null;
  rationale?: string | null;
  managementReason?: string | null;
  summary?: string | null;
  userSummary?: string | null;
  recommendation?: string | null;
  adjustments?: string[] | null;
  appliedActions?: Array<string | Record<string, any>> | null;
  event?: {
    phase?: string | null;
    reason?: string | null;
    [key: string]: any;
  } | null;
  review?: {
    rationale?: string | null;
    reviewCode?: string | null;
    reviewFacts?: ReviewFact[] | null;
    riskFlags?: string[] | null;
    structuredReview?: StructuredReview | null;
    userSummary?: string | null;
    appliedActions?: Array<string | Record<string, any>> | null;
    [key: string]: any;
  } | null;
  provider?: string | null;
  model?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  timestamp?: string | null;
  [key: string]: any;
};

export type TraderStatusFeed = {
  id?: string | number;
  traderId?: string | null;
  trader_id?: string | null;
  symbol?: string | null;
  stateKey?: string | null;
  state_key?: string | null;
  eventType?: string | null;
  event_type?: string | null;
  refreshReason?: string | null;
  refresh_reason?: string | null;
  displayState?: "current" | "stale" | "archived" | null;
  display_state?: "current" | "stale" | "archived" | null;
  headline?: string | null;
  message?: string | null;
  watch?: string | null;
  mood?: string | null;
  stance?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  payload?: {
    headline?: string | null;
    message?: string | null;
    watch?: string | null;
    mood?: string | null;
    stance?: string | null;
    [key: string]: any;
  } | null;
  [key: string]: any;
};

export type ScannerStatus = {
  enabled: boolean;
  running: boolean;
  taskActive?: boolean;
  mode?: "paper" | string;
  symbols: string[];
  intervalSeconds: number;
  provider: string;
  locale?: string;
  cycles: number;
  lastStartedAt?: string | null;
  lastFinishedAt?: string | null;
  lastError?: string | null;
  lastResult?: ScannerRunResult | null;
  [key: string]: any;
};

export type ScannerRunResult = {
  status: string;
  mode?: "paper" | string;
  paperOnly?: boolean;
  symbols: string[];
  provider: string;
  locale?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  counts: {
    symbols?: number;
    tradersChecked: number;
    candidates: number;
    aiReviews: number;
    tradePlans: number;
    openOrders: number;
    openPositions: number;
    noCandidate: number;
    activeExposure: number;
    errors: number;
    [key: string]: number | undefined;
  };
  results: Array<Record<string, any>>;
};

export type LeaderboardBundle = {
  symbol: string;
  period?: LeaderboardPeriod;
  traders: TraderProfile[];
  summaries: TraderPaperSummary[];
  positions: PaperPosition[];
  orders: PaperOrder[];
  managementReviews: ManagementReview[];
  statusFeeds?: TraderStatusFeed[];
  scanner: ScannerStatus | null;
  cacheHit?: boolean;
  stale?: boolean;
  scheduledRefresh?: boolean;
  warming?: boolean;
};

export type LeagueSentimentBias = "LONG_BIASED" | "SHORT_BIASED" | "NEUTRAL" | "MIXED" | "RISK_OFF";

export type LeagueSentimentBrief = {
  conclusion: string;
  reason: string;
  watch: string;
};

export type LeagueSentimentOpinion = {
  bias: LeagueSentimentBias | string;
  confidence: number;
  riskLevel: string;
  confidenceReason?: string | null;
  brief: LeagueSentimentBrief;
  headline: string;
  summary: string;
  keyDrivers: string[];
  risks: string[];
  watchConditions: string[];
  action: string;
  longShortContext: string;
  sourceCounts: Record<string, number>;
  sourceBreakdown?: Record<string, any>;
  dataFreshness?: {
    generatedAt?: string | null;
    marketUpdatedAt?: string | null;
    marketAgeMinutes?: number | null;
    latestActivePositionAt?: string | null;
    latestActivePositionAgeMinutes?: number | null;
    latestPendingOrderAt?: string | null;
    latestPendingOrderAgeMinutes?: number | null;
    latestOutcomeAt?: string | null;
    latestOutcomeAgeMinutes?: number | null;
    latestEntryReviewAt?: string | null;
    latestEntryReviewAgeMinutes?: number | null;
    latestManagementReviewAt?: string | null;
    latestManagementReviewAgeMinutes?: number | null;
    [key: string]: any;
  } | null;
  evidenceRefs?: Array<{
    id: string;
    sourceType: string;
    label: string;
    traderId?: string | null;
    traderName?: string | null;
    side?: string | null;
    price?: number | null;
    timestamp?: string | null;
    [key: string]: any;
  }>;
  invalidatesAt?: string | null;
  provider: string;
  model: string;
  fallback: boolean;
};

export type LeagueSentimentOpinionResponse = {
  id: number | string;
  symbol: string;
  locale: Locale;
  status: "ok" | "fallback" | string;
  intervalStart: string;
  intervalEnd: string;
  nextRefreshAt: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  cacheHit: boolean;
  stale?: boolean;
  staleReason?: string | null;
  refreshOverdue?: boolean;
  refreshOverdueMinutes?: number;
  opinionAgeMinutes?: number;
  opinion: LeagueSentimentOpinion;
};

export type TraderDetailBundle = {
  symbol: string;
  trader: TraderProfile;
  summaries: TraderPaperSummary[];
  positions: PaperPosition[];
  closedPositions?: PaperPosition[];
  orders: PaperOrder[];
  managementReviews: ManagementReview[];
  statusFeeds?: TraderStatusFeed[];
  events: PaperTradeEvent[];
  dailyPnl: { date: string; pnl: number }[];
  reviewCountsByDay?: { date: string; count: number }[];
  tradePlans: Record<string, any>[];
};

export type TraderManagementReviewsResponse = {
  symbol: string;
  traderId: string;
  managementReviews: ManagementReview[];
  offset: number;
  nextOffset: number;
  hasMore: boolean;
};

export type TraderTradeEventsResponse = {
  symbol?: string;
  traderId?: string;
  events: PaperTradeEvent[];
  offset: number;
  nextOffset: number;
  hasMore: boolean;
};

type KlineRequestOptions = {
  force?: boolean;
  staleMs?: number;
  before?: number;
  signal?: AbortSignal;
};

type KlineCacheEntry = {
  data?: KlinesResponse;
  promise?: Promise<KlinesResponse>;
  updatedAt: number;
};

const KLINE_CACHE_STALE_MS = 30_000;
const KLINE_CACHE_MAX_ENTRIES = 96;
const klineCache = new Map<string, KlineCacheEntry>();
const BROWSER_CACHE_PREFIX = "atl-api-cache:v2:";
const LEADERBOARD_BROWSER_CACHE_MS = 5 * 60_000;
const TRADER_DETAIL_BROWSER_CACHE_MS = 60_000;
const TRADER_DETAIL_INITIAL_REVIEWS_LIMIT = 20;
const TRADER_DETAIL_INITIAL_EVENTS_LIMIT = 50;

async function requestFirst<T>(paths: string[], options?: RequestInit): Promise<T> {
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await request<T>(path, options);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  const composedSignal = composeAbortSignal(options?.signal, requestTimeoutMs(path));
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      signal: composedSignal.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  } finally {
    composedSignal.cleanup();
  }
}

function requestTimeoutMs(path: string) {
  if (
    path.startsWith("/api/market/klines") ||
    path.startsWith("/api/paper/equity-snapshots") ||
    path.startsWith("/api/subscribers/access")
  ) {
    return FAST_BROWSER_REQUEST_TIMEOUT_MS;
  }
  if (path.startsWith("/api/league/leaderboard-fast") || path.startsWith("/api/league/traders/")) {
    return SLOW_BROWSER_REQUEST_TIMEOUT_MS;
  }
  return DEFAULT_BROWSER_REQUEST_TIMEOUT_MS;
}

function composeAbortSignal(sourceSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromSource = () => controller.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) {
    abortFromSource();
  } else if (sourceSignal) {
    sourceSignal.addEventListener("abort", abortFromSource, { once: true });
  }
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort("request_timeout"), timeoutMs);
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      sourceSignal?.removeEventListener("abort", abortFromSource);
    }
  };
}

function readBrowserCache<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${BROWSER_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt: number; data: T };
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeBrowserCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${BROWSER_CACHE_PREFIX}${key}`, JSON.stringify({ updatedAt: Date.now(), data }));
  } catch {
    // Storage can be unavailable in private contexts; API calls still work without it.
  }
}

export function getHealth() {
  return request<{ status: string; service: string; mode: string }>("/health");
}

export function getBinanceTest() {
  return request<Record<string, any>>("/api/binance/test");
}

export function getCachedKlines(symbol: string, interval = "1m", limit = 5, maxAgeMs = Number.POSITIVE_INFINITY) {
  const cached = klineCache.get(klineCacheKey(symbol, interval, limit));
  if (!cached?.data) return null;
  if (Date.now() - cached.updatedAt > maxAgeMs) return null;
  return cloneKlinesResponse(cached.data);
}

export function updateKlineCache(symbol: string, interval = "1m", limit = 5, candle: KlineCandle) {
  const normalizedSymbol = normalizeKlineSymbol(symbol);
  const normalizedInterval = normalizeKlineInterval(interval);
  const normalizedLimit = normalizeKlineLimit(limit);
  const prefix = `${normalizedSymbol}|${normalizedInterval}|`;

  for (const [cacheKey, cached] of Array.from(klineCache.entries())) {
    if (!cacheKey.startsWith(prefix) || !cached.data) continue;
    const cacheLimit = Number(cacheKey.split("|")[2]) || normalizedLimit;
    const candles = mergeKlineCandle(cached.data.candles, candle, cacheLimit);
    rememberKlines(cacheKey, {
      ...cached.data,
      count: candles.length,
      candles
    });
  }
}

export function getKlines(symbol: string, interval = "1m", limit = 5, options: KlineRequestOptions = {}) {
  const normalizedSymbol = normalizeKlineSymbol(symbol);
  const normalizedInterval = normalizeKlineInterval(interval);
  const normalizedLimit = normalizeKlineLimit(limit);
  const normalizedBefore = normalizeKlineBefore(options.before);
  const cacheKey = klineCacheKey(normalizedSymbol, normalizedInterval, normalizedLimit, normalizedBefore);
  const cached = klineCache.get(cacheKey);
  const staleMs = options.staleMs ?? KLINE_CACHE_STALE_MS;

  if (!options.force && cached?.data && Date.now() - cached.updatedAt <= staleMs) {
    return Promise.resolve(cloneKlinesResponse(cached.data));
  }

  if (cached?.promise) {
    return cached.promise.then(cloneKlinesResponse);
  }

  const params = new URLSearchParams({
    symbol: normalizedSymbol,
    interval: normalizedInterval,
    limit: String(normalizedLimit)
  });
  if (normalizedBefore !== null) params.set("before", String(normalizedBefore));
  const promise = request<KlinesResponse>(`/api/market/klines?${params.toString()}`, { signal: options.signal })
    .then((data) => {
      const next = normalizeKlinesResponse(data, normalizedSymbol, normalizedInterval, normalizedLimit);
      rememberKlines(cacheKey, next);
      return cloneKlinesResponse(next);
    })
    .catch((err) => {
      const latest = klineCache.get(cacheKey);
      if (latest?.promise === promise) {
        if (latest.data) {
          klineCache.set(cacheKey, { data: latest.data, updatedAt: latest.updatedAt });
        } else {
          klineCache.delete(cacheKey);
        }
      }
      throw err;
    });

  klineCache.set(cacheKey, {
    data: cached?.data,
    promise,
    updatedAt: cached?.updatedAt ?? 0
  });
  pruneKlineCache();
  return promise.then(cloneKlinesResponse);
}

function normalizeKlineSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

function normalizeKlineInterval(interval: string) {
  return interval.trim();
}

function normalizeKlineLimit(limit: number) {
  return Math.max(1, Math.floor(limit));
}

function normalizeKlineBefore(before: unknown) {
  const value = typeof before === "number" ? before : typeof before === "string" ? Number(before) : NaN;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function klineCacheKey(symbol: string, interval: string, limit: number, before: number | null = null) {
  const base = `${normalizeKlineSymbol(symbol)}|${normalizeKlineInterval(interval)}|${normalizeKlineLimit(limit)}`;
  return before === null ? base : `${base}|before:${before}`;
}

function normalizeKlinesResponse(data: KlinesResponse, symbol: string, interval: string, limit: number): KlinesResponse {
  const candles = (data.candles ?? []).slice(-limit).map(cloneKlineCandle);
  return {
    symbol: data.symbol || symbol,
    interval: data.interval || interval,
    count: candles.length,
    candles
  };
}

function cloneKlinesResponse(data: KlinesResponse): KlinesResponse {
  return {
    ...data,
    candles: data.candles.map(cloneKlineCandle)
  };
}

function cloneKlineCandle(candle: KlineCandle): KlineCandle {
  return { ...candle };
}

function rememberKlines(cacheKey: string, data: KlinesResponse) {
  klineCache.delete(cacheKey);
  klineCache.set(cacheKey, {
    data: cloneKlinesResponse(data),
    updatedAt: Date.now()
  });
  pruneKlineCache();
}

function mergeKlineCandle(candles: KlineCandle[], candle: KlineCandle, limit: number) {
  return candles
    .filter((item) => item.openTime !== candle.openTime)
    .concat(cloneKlineCandle(candle))
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-limit);
}

function pruneKlineCache() {
  while (klineCache.size > KLINE_CACHE_MAX_ENTRIES) {
    const firstKey = klineCache.keys().next().value;
    if (typeof firstKey !== "string") break;
    klineCache.delete(firstKey);
  }
}

export function getMarketSnapshot(symbol: string) {
  return request<Record<string, any>>(`/api/binance/market-snapshot?symbol=${symbol}`);
}

export function getAiProviders() {
  return request<Record<string, any>>("/api/ai/providers");
}

export function getDbStatus() {
  return requestFirst<Record<string, any>>(["/api/db/status", "/api/database/status"]);
}

export function getRecentRuns(limit = 5) {
  return request<Record<string, any>>(`/api/runs?limit=${limit}`);
}

export function getRecentMarketSnapshots(limit = 5) {
  return request<Record<string, any>>(`/api/market-snapshots?limit=${limit}`);
}

export function getRecentCandidateTrades(limit = 5) {
  return request<Record<string, any>>(`/api/candidate-trades?limit=${limit}`);
}

export function getAiReviews(limit = 20, offset = 0, symbol?: string, traderId?: string, locale: Locale = "en") {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (symbol) params.set("symbol", symbol);
  if (traderId) params.set("trader_id", traderId);
  params.set("locale", locale);
  return request<Record<string, any>>(`/api/ai/reviews?${params.toString()}`);
}

export function getRecentAiReviews(limit = 5) {
  return getAiReviews(limit);
}

export function getRecentTradePlans(limit = 5, symbol?: string, traderId?: string, status?: string, options?: { readonly signal?: AbortSignal }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (symbol) params.set("symbol", symbol);
  if (traderId) params.set("trader_id", traderId);
  if (status) params.set("status", status);
  return request<Record<string, any>>(`/api/trade-plans?${params.toString()}`, { signal: options?.signal });
}

export function getRecentProviderCalls(limit = 5) {
  return request<Record<string, any>>(`/api/provider-calls?limit=${limit}`);
}

export function getTraderPaperStates(symbol?: string) {
  const query = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
  return requestFirst<{ states: TraderPaperState[] } | TraderPaperState[]>([
    `/api/paper/trader-states${query}`,
    `/api/trader-states${query}`
  ]);
}

export function getTraderPaperSummary(symbol: string) {
  return request<{ symbol: string; summaries: TraderPaperSummary[] }>(
    `/api/paper/trader-summary?symbol=${encodeURIComponent(symbol)}`
  );
}

function leaderboardCacheKey(symbol: string, locale: Locale, options?: LeaderboardBundleRequestOptions) {
  const includeRelated = options?.includeRelated ?? false;
  const period = options?.leagueMonth ?? "current";
  return `leaderboard:${symbol}:${locale}:${period}:${includeRelated ? "related" : "summary"}`;
}

export function getLeaderboardBundle(symbol: string, locale: Locale = "en", options?: LeaderboardBundleRequestOptions) {
  const params = new URLSearchParams({
    symbol,
    locale,
    includeRelated: String(options?.includeRelated ?? false)
  });
  if (options?.leagueMonth) params.set("leagueMonth", options.leagueMonth);
  return request<LeaderboardBundle>(`/api/league/leaderboard-fast?${params.toString()}`, { signal: options?.signal }).then((bundle) => {
    if (bundle.warming !== true) {
      writeBrowserCache(leaderboardCacheKey(symbol, locale, options), bundle);
    }
    return bundle;
  });
}

export function getLeagueSentimentOpinion(
  symbol: string,
  locale: Locale,
  options?: { readonly preferCached?: boolean; readonly refresh?: boolean; readonly signal?: AbortSignal }
) {
  const params = new URLSearchParams({ symbol, locale });
  if (options?.preferCached) params.set("preferCached", "true");
  if (options?.refresh) params.set("refresh", "true");
  return request<LeagueSentimentOpinionResponse>(`/api/league/sentiment/opinion?${params.toString()}`, { signal: options?.signal });
}

export function getTraderDetailBundle(traderId: string, symbol: string, locale: Locale = "en", options?: RequestInit) {
  const params = new URLSearchParams({
    symbol,
    locale,
    reviewsLimit: String(TRADER_DETAIL_INITIAL_REVIEWS_LIMIT),
    eventsLimit: String(TRADER_DETAIL_INITIAL_EVENTS_LIMIT)
  });
  return request<TraderDetailBundle>(
    `/api/league/traders/${encodeURIComponent(traderId)}?${params.toString()}`,
    options
  ).then((bundle) => {
    writeBrowserCache(`trader:${traderId}:${symbol}:${locale}`, bundle);
    return bundle;
  });
}

export function getTraderManagementReviews(
  traderId: string,
  symbol: string,
  limit = 20,
  offset = 0,
  locale: Locale = "en",
  options?: RequestInit
) {
  const params = new URLSearchParams({
    symbol,
    locale,
    limit: String(limit),
    offset: String(offset)
  });
  return request<TraderManagementReviewsResponse>(
    `/api/league/traders/${encodeURIComponent(traderId)}/management-reviews?${params.toString()}`,
    options
  );
}

export function getTraderExecutionEventsUrl(traderId: string, symbol: string) {
  if (shouldSkipLocalCrossOriginEventStream(EVENT_STREAM_API_BASE_URL)) return null;
  const params = new URLSearchParams({ symbol });
  return `${EVENT_STREAM_API_BASE_URL}/api/league/traders/${encodeURIComponent(traderId)}/execution-events?${params.toString()}`;
}

export function getLeagueLiveEventsUrl(symbol: string) {
  if (shouldSkipLocalCrossOriginEventStream(EVENT_STREAM_API_BASE_URL)) return null;
  const params = new URLSearchParams({ symbol });
  return `${EVENT_STREAM_API_BASE_URL}/api/league/live-events?${params.toString()}`;
}

function shouldSkipLocalCrossOriginEventStream(baseUrl: string) {
  if (typeof window === "undefined") return false;
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  if (!localHosts.has(window.location.hostname)) return false;
  try {
    return new URL(baseUrl, window.location.origin).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function getCachedLeaderboardBundle(symbol: string, locale: Locale = "en", options?: LeaderboardBundleRequestOptions) {
  const cached = readBrowserCache<LeaderboardBundle>(leaderboardCacheKey(symbol, locale, options), LEADERBOARD_BROWSER_CACHE_MS);
  return cached?.warming === true ? null : cached;
}

export function getCachedTraderDetailBundle(traderId: string, symbol: string, locale: Locale = "en") {
  return readBrowserCache<TraderDetailBundle>(`trader:${traderId}:${symbol}:${locale}`, TRADER_DETAIL_BROWSER_CACHE_MS);
}

export const leaderboardBundleQueryKey = (symbol: string, locale: Locale = "en", options?: LeaderboardBundleRequestOptions) =>
  ["league", "leaderboard", symbol, locale, options?.includeRelated ?? false, options?.leagueMonth ?? "current"] as const;

export function leaderboardBundleQueryOptions(symbol: string, locale: Locale = "en", options?: LeaderboardBundleRequestOptions) {
  return {
    queryKey: leaderboardBundleQueryKey(symbol, locale, options),
    queryFn: (context: { signal?: AbortSignal }) => getLeaderboardBundle(symbol, locale, { ...options, signal: context.signal }),
    staleTime: LEAGUE_QUERY_STALE_TIME_MS,
    gcTime: LEAGUE_QUERY_GC_TIME_MS,
    refetchInterval: leaderboardBundleRefetchInterval,
    refetchIntervalInBackground: false
  };
}

function leaderboardBundleRefetchInterval(query: { state: { data?: LeaderboardBundle; dataUpdatedAt?: number } }) {
  if (query.state.data?.warming === true) {
    const warmingAgeMs = Date.now() - (query.state.dataUpdatedAt ?? Date.now());
    return warmingAgeMs <= LEAGUE_WARMING_REFETCH_WINDOW_MS
      ? LEAGUE_WARMING_REFETCH_INTERVAL_MS
      : LEAGUE_LIVE_REFETCH_INTERVAL_MS;
  }
  return LEAGUE_LIVE_REFETCH_INTERVAL_MS;
}

export function prefetchLeaderboardBundle(queryClient: QueryClient, symbol: string, locale: Locale = "en", options?: LeaderboardBundleRequestOptions) {
  return queryClient.prefetchQuery(leaderboardBundleQueryOptions(symbol, locale, options));
}

export const traderDetailBundleQueryKey = (traderId: string, symbol: string, locale: Locale) =>
  ["league", "trader", traderId, symbol, locale] as const;

export function traderDetailBundleQueryOptions(traderId: string, symbol: string, locale: Locale = "en") {
  return {
    queryKey: traderDetailBundleQueryKey(traderId, symbol, locale),
    queryFn: (context: { signal?: AbortSignal }) => getTraderDetailBundle(traderId, symbol, locale, { signal: context.signal }),
    staleTime: TRADER_DETAIL_LIVE_REFETCH_INTERVAL_MS,
    gcTime: LEAGUE_QUERY_GC_TIME_MS,
    refetchInterval: TRADER_DETAIL_LIVE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false
  };
}

export function prefetchTraderDetailBundle(queryClient: QueryClient, traderId: string, symbol: string, locale: Locale = "en") {
  return queryClient.prefetchQuery(traderDetailBundleQueryOptions(traderId, symbol, locale));
}

export function getScannerStatus() {
  return request<ScannerStatus>("/api/scanner/status");
}

export function runScannerOnce(symbol = "BTCUSDT", provider = "mock", locale: Locale = "en") {
  return request<ScannerRunResult>("/api/scanner/run-once", {
    method: "POST",
    body: JSON.stringify({ symbol, provider, locale })
  });
}

export function getActivePaperPositions(symbol?: string, traderId?: string, limit = 20, options?: { readonly signal?: AbortSignal }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (symbol) params.set("symbol", symbol);
  if (traderId) params.set("trader_id", traderId);
  return request<{ positions: PaperPosition[] } | PaperPosition[]>(`/api/paper/positions/active?${params.toString()}`, { signal: options?.signal });
}

export function getPaperOrders(limit = 20, symbol?: string, status?: string, traderId?: string, options?: { readonly signal?: AbortSignal }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (symbol) params.set("symbol", symbol);
  if (status) params.set("status", status);
  if (traderId) params.set("trader_id", traderId);
  return request<{ orders: PaperOrder[] } | PaperOrder[]>(`/api/paper/orders?${params.toString()}`, { signal: options?.signal });
}

export function getTradeEvents(limit = 20, symbol?: string, traderId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (symbol) params.set("symbol", symbol);
  if (traderId) params.set("trader_id", traderId);
  return requestFirst<{ events: PaperTradeEvent[] } | PaperTradeEvent[]>([
    `/api/paper/events?${params.toString()}`,
    `/api/trade-events?${params.toString()}`,
    `/api/paper-trading/events?${params.toString()}`
  ]);
}

export async function getAITradeTerminalSource(
  symbol: string,
  locale: Locale,
  page: AITradeTerminalPage = { eventOffset: 0, reviewOffset: 0 },
  options?: { readonly signal?: AbortSignal; readonly refresh?: boolean }
): Promise<AITradeTerminalSource> {
  const pageSize = 20;
  const eventParams = new URLSearchParams({
    symbol,
    limit: String(pageSize),
    includePayload: "true",
    locale
  });
  const reviewParams = new URLSearchParams({
    symbol,
    limit: String(pageSize),
    locale
  });
  if (options?.refresh) reviewParams.set("refresh", "true");
  if (page.eventOffset !== null) eventParams.set("offset", String(page.eventOffset));
  if (page.reviewOffset !== null) reviewParams.set("offset", String(page.reviewOffset));

  const emptyEvents = { events: [], nextOffset: 0, hasMore: false } satisfies TradeEventPage;
  const emptyReviews = { reviews: [], nextOffset: 0, hasMore: false } satisfies OverviewReviewPage;
  const [eventResponse, reviewResponse] = await Promise.all([
    page.eventOffset === null
      ? Promise.resolve(emptyEvents)
      : request<TradeEventPage>(`/api/paper/events?${eventParams.toString()}`, { signal: options?.signal }),
    page.reviewOffset === null
      ? Promise.resolve(emptyReviews)
      : request<OverviewReviewPage>(`/api/league/overview-reviews?${reviewParams.toString()}`, { signal: options?.signal })
  ]);
  const hasNextPage = eventResponse.hasMore || reviewResponse.hasMore;
  return {
    events: eventResponse.events,
    reviews: reviewResponse.reviews,
    nextPage: hasNextPage
      ? {
          eventOffset: eventResponse.hasMore ? eventResponse.nextOffset : null,
          reviewOffset: reviewResponse.hasMore ? reviewResponse.nextOffset : null
        }
      : null
  };
}

type TradeEventPage = {
  readonly events: readonly PaperTradeEvent[];
  readonly nextOffset: number;
  readonly hasMore: boolean;
};

type OverviewReviewPage = {
  readonly reviews: readonly LeagueOverviewReview[];
  readonly nextOffset: number;
  readonly hasMore: boolean;
};

export function getTraderTradeEvents(
  traderId: string,
  symbol: string = "BTCUSDT",
  limit: number = 10,
  offset: number = 0,
  locale: Locale = "en",
  options?: { readonly signal?: AbortSignal }
) {
  const params = new URLSearchParams({
    symbol,
    trader_id: traderId,
    limit: String(limit),
    offset: String(offset),
    includePayload: "true",
    locale
  });
  return request<TraderTradeEventsResponse>(`/api/paper/events?${params.toString()}`, { signal: options?.signal });
}

export function getEquitySnapshots(limit = 20, traderId?: string, symbol?: string, options?: { readonly signal?: AbortSignal }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (traderId) params.set("trader_id", traderId);
  if (symbol) params.set("symbol", symbol);
  return request<{ snapshots: EquitySnapshot[] } | EquitySnapshot[]>(`/api/paper/equity-snapshots?${params.toString()}`, { signal: options?.signal });
}

export function getManagementReviews(limit = 20, offset = 0, symbol?: string, traderId?: string, locale: Locale = "en") {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (symbol) params.set("symbol", symbol);
  if (traderId) params.set("trader_id", traderId);
  params.set("locale", locale);
  return requestFirst<
    { reviews: ManagementReview[] } |
    { managementReviews: ManagementReview[] } |
    { data: ManagementReview[] } |
    ManagementReview[]
  >([
    `/api/paper/management-reviews?${params.toString()}`,
    `/api/position-management/reviews?${params.toString()}`
  ]);
}

export function getTraders() {
  return request<{ traders: TraderProfile[] }>("/api/traders");
}

export function getTrader(id: string) {
  return request<TraderProfile>(`/api/traders/${id}`);
}

export function clearBrowserCacheForTrader(traderId?: string, symbol?: string) {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key) {
        const matchesTrader = traderId ? key.includes(`trader:${traderId}`) : key.includes("trader:");
        const matchesLeaderboard = symbol ? key.includes(`leaderboard:${symbol}`) : key.includes("leaderboard:");
        if (matchesTrader || matchesLeaderboard) {
          keysToRemove.push(key);
        }
      }
    }
    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

export function runTraderCycle(traderId: string, symbol: string, provider?: "mock" | "gemini", locale: Locale = "en") {
  const query = provider ? `?provider=${provider}` : "";
  clearBrowserCacheForTrader(traderId, symbol);
  return request<RunCycleResult>(`/api/traders/${traderId}/run-cycle${query}`, {
    method: "POST",
    body: JSON.stringify({ symbol, locale })
  });
}

export function runAllTraders(symbol: string, locale: Locale = "en") {
  clearBrowserCacheForTrader(undefined, symbol);
  return request<{ symbol: string; provider: string; results: RunCycleResult[] }>("/api/demo/run-all-traders", {
    method: "POST",
    body: JSON.stringify({ symbol, locale })
  });
}

export function runPaperEngineOnce(symbol: string, locale: Locale = "en") {
  clearBrowserCacheForTrader(undefined, symbol);
  return requestFirst<PaperEngineRunResult>([
    "/api/paper/engine/run-once",
    "/api/paper-trading/engine/run-once",
    "/api/engine/run-once"
  ], {
    method: "POST",
    body: JSON.stringify({ symbol, locale, mode: "paper" })
  });
}

export function runAiReviewDemo(symbol: string, provider?: "mock" | "gemini", locale: Locale = "en") {
  const query = provider ? `?provider=${provider}` : "";
  clearBrowserCacheForTrader(undefined, symbol);
  return request<Record<string, any>>(`/api/ai/review-demo${query}`, {
    method: "POST",
    body: JSON.stringify({ symbol, locale })
  });
}

export type MergedTradeHistoryItem = {
  time: string;
  side: "LONG" | "SHORT";
  exitPrice: number;
  symbol: string;
  quantity: number;
  pnl: number;
  leverage: number;
  action: string;
  closeReason: string;
  entryPrice: number;
};

export type MergedTradeHistoryResponse = {
  symbol: string;
  traderId: string;
  total: number;
  offset: number;
  limit: number;
  nextOffset: number;
  hasMore: boolean;
  items: MergedTradeHistoryItem[];
};

export function getTraderTradeHistory(
  traderId: string,
  symbol: string = "BTCUSDT",
  limit: number = 10,
  offset: number = 0,
  options?: { readonly signal?: AbortSignal }
) {
  const params = new URLSearchParams({
    symbol,
    limit: String(limit),
    offset: String(offset)
  });
  return request<MergedTradeHistoryResponse>(
    `/api/league/traders/${encodeURIComponent(traderId)}/trade-history?${params.toString()}`,
    { signal: options?.signal }
  );
}

export function getTraderAiReviews(traderId: string, symbol: string, limit = 40, locale: Locale = "en") {
  const params = new URLSearchParams({
    trader_id: traderId,
    symbol,
    limit: String(limit),
    offset: "0",
    locale
  });
  return request<{ aiReviews: any[] }>(
    `/api/ai/reviews?${params.toString()}`
  );
}
