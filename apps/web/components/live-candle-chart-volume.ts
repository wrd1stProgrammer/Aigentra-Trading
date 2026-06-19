import type { KlineCandle } from "@/lib/api";

const VOLUME_CONTEXT_WINDOW = 80;
const VOLUME_CONTEXT_MIN_SIZE = 12;
const ISOLATED_OUTLIER_MULTIPLIER = 20;
const DISPLAY_CAP_MULTIPLIER = 8;
const NEIGHBOR_CONFIRMATION_MULTIPLIER = 4;

export type VolumeHistogramPoint = {
  time: number;
  value: number;
  color: string;
  originalValue: number;
  capped: boolean;
};

export function volumeHistogramData(
  candles: readonly KlineCandle[],
  {
    upColor = "rgba(16, 185, 129, 0.18)",
    downColor = "rgba(244, 63, 94, 0.18)"
  }: { readonly upColor?: string; readonly downColor?: string } = {}
): VolumeHistogramPoint[] {
  return candles.map((_, index) => volumeHistogramPoint(candles, index, { upColor, downColor }));
}

export function volumeHistogramPoint(
  candles: readonly KlineCandle[],
  index: number,
  {
    upColor = "rgba(16, 185, 129, 0.18)",
    downColor = "rgba(244, 63, 94, 0.18)"
  }: { readonly upColor?: string; readonly downColor?: string } = {}
): VolumeHistogramPoint {
  const candle = candles[index];
  const originalValue = finiteVolume(candle?.volume);
  const value = cappedDisplayVolume(candles, index);
  return {
    time: Math.floor((candle?.openTime ?? 0) / 1000),
    value,
    originalValue,
    capped: value < originalValue,
    color: (candle?.close ?? 0) >= (candle?.open ?? 0) ? upColor : downColor
  };
}

export function cappedDisplayVolume(candles: readonly KlineCandle[], index: number): number {
  const volume = finiteVolume(candles[index]?.volume);
  if (volume <= 0) return 0;
  const baseline = rollingMedianVolume(candles, index);
  if (baseline <= 0) return volume;
  if (volume <= baseline * ISOLATED_OUTLIER_MULTIPLIER) return volume;
  if (neighborConfirmsVolumeCluster(candles, index, baseline)) return volume;
  return baseline * DISPLAY_CAP_MULTIPLIER;
}

function rollingMedianVolume(candles: readonly KlineCandle[], index: number): number {
  const start = Math.max(0, index - VOLUME_CONTEXT_WINDOW);
  const before = candles.slice(start, index);
  const after = candles.slice(index + 1, Math.min(candles.length, index + 6));
  const sample = [...before, ...after]
    .map((candle) => finiteVolume(candle.volume))
    .filter((volume) => volume > 0)
    .sort((left, right) => left - right);
  if (sample.length < VOLUME_CONTEXT_MIN_SIZE) return 0;
  const middle = Math.floor(sample.length / 2);
  return sample.length % 2 === 0 ? (sample[middle - 1] + sample[middle]) / 2 : sample[middle];
}

function neighborConfirmsVolumeCluster(candles: readonly KlineCandle[], index: number, baseline: number): boolean {
  const previous = finiteVolume(candles[index - 1]?.volume);
  const next = finiteVolume(candles[index + 1]?.volume);
  const threshold = baseline * NEIGHBOR_CONFIRMATION_MULTIPLIER;
  return previous >= threshold || next >= threshold;
}

function finiteVolume(value: unknown): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}
