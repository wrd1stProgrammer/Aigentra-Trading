export type ChartInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";

export const CANDLE_LIMITS: Record<ChartInterval, number> = {
  "1m": 500,
  "5m": 500,
  "15m": 500,
  "30m": 500,
  "1h": 120,
  "4h": 500,
  "1d": 500,
  "1w": 320
};

export const CACHED_CANDLES_VISIBLE_MS = 10 * 60_000;
export const REST_BACKFILL_CANDLE_LIMIT = 2;
const INITIAL_VISIBLE_BARS: Record<ChartInterval, number> = {
  "1m": 360,
  "5m": 500,
  "15m": 360,
  "30m": 300,
  "1h": 120,
  "4h": 180,
  "1d": 180,
  "1w": 160
};
const INITIAL_RIGHT_OFFSET = 8;

export function candleLimitForInterval(interval: ChartInterval) {
  return CANDLE_LIMITS[interval];
}

export function initialVisibleBarsForInterval(interval: ChartInterval) {
  return INITIAL_VISIBLE_BARS[interval];
}

export function latestVisibleLogicalRange(candleCount: number, interval: ChartInterval) {
  const total = Math.max(0, Math.floor(candleCount));
  if (total === 0) return null;
  const visibleBars = Math.min(total, initialVisibleBarsForInterval(interval));
  const lastIndex = total - 1;
  return {
    from: Math.max(0, lastIndex - visibleBars + 1),
    to: lastIndex + INITIAL_RIGHT_OFFSET
  };
}

export function restFallbackIntervalMs(interval: ChartInterval) {
  if (interval === "1m" || interval === "5m") return 15_000;
  if (interval === "15m" || interval === "30m") return 45_000;
  if (interval === "1h") return 60_000;
  return 180_000;
}

export function restBackfillCandleLimit() {
  return REST_BACKFILL_CANDLE_LIMIT;
}

export function restCacheStaleMs(interval: ChartInterval) {
  if (interval === "1m") return 8_000;
  if (interval === "5m") return 15_000;
  if (interval === "15m" || interval === "30m") return 30_000;
  if (interval === "1h") return 60_000;
  return 120_000;
}

export function socketFreshWindowMs(interval: ChartInterval) {
  if (interval === "1m" || interval === "5m") return 12_000;
  return restFallbackIntervalMs(interval) + 10_000;
}

export function shouldBackfillFromRest({
  now,
  lastSocketUpdateAt,
  staleWindowMs
}: {
  now: number;
  lastSocketUpdateAt: number;
  staleWindowMs: number;
}) {
  return !lastSocketUpdateAt || now - lastSocketUpdateAt >= staleWindowMs;
}

export function shouldAcceptRealtimeCandle({
  candidateTime,
  lastCandleTime
}: {
  candidateTime: number;
  lastCandleTime: number | null;
}) {
  return lastCandleTime === null || candidateTime >= lastCandleTime;
}
