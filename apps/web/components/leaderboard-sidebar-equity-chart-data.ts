import type { EquitySnapshot } from "@/lib/api";
import { intlLocale } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TraderStanding } from "@/lib/league";

export type EquityChartPoint = {
  readonly y: number;
  readonly time: string | null;
};

export const GRIDLINE_COUNT = 3;
const MAX_EQUITY_CHART_POINTS = 120;

const TRADER_COLORS: readonly { readonly stroke: string; readonly gradientStart: string }[] = [
  { stroke: "#3b82f6", gradientStart: "#3b82f6" },
  { stroke: "#10b981", gradientStart: "#10b981" },
  { stroke: "#8b5cf6", gradientStart: "#8b5cf6" },
  { stroke: "#f43f5e", gradientStart: "#f43f5e" },
  { stroke: "#f59e0b", gradientStart: "#f59e0b" },
  { stroke: "#06b6d4", gradientStart: "#06b6d4" },
  { stroke: "#ec4899", gradientStart: "#ec4899" },
  { stroke: "#14b8a6", gradientStart: "#14b8a6" },
  { stroke: "#a855f7", gradientStart: "#a855f7" },
  { stroke: "#f97316", gradientStart: "#f97316" }
];

export function getTraderColor(traderId: string) {
  let hash = 0;
  for (let index = 0; index < traderId.length; index += 1) {
    hash = traderId.charCodeAt(index) + ((hash << 5) - hash);
  }
  return TRADER_COLORS[Math.abs(hash) % TRADER_COLORS.length] ?? TRADER_COLORS[0];
}

export function formatAxisPrice(value: number, visibleRange: number, locale: Locale): string {
  if (value >= 1_000_000) {
    const digits = visibleRange < 10_000 ? 3 : visibleRange < 100_000 ? 2 : visibleRange < 1_000_000 ? 1 : 0;
    return `${(value / 1_000_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: digits })}M`;
  }
  if (value >= 1_000) {
    const digits = visibleRange < 10 ? 3 : visibleRange < 100 ? 2 : visibleRange < 1_000 ? 1 : 0;
    return `${(value / 1_000).toLocaleString(intlLocale(locale), { maximumFractionDigits: digits })}k`;
  }
  const digits = visibleRange < 1 ? 2 : visibleRange < 10 ? 1 : 0;
  return value.toLocaleString(intlLocale(locale), { maximumFractionDigits: digits });
}

export function formatExactPrice(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatTooltipTime(time: string | null | undefined, locale: Locale): string {
  if (!time) return "";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "";
  const label = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
  return `${label} UTC`;
}

export function equityChartPoints(trader: TraderStanding, snapshots: readonly EquitySnapshot[]): EquityChartPoint[] {
  const points = snapshots
    .map((snapshot) => ({
      y: numberValue(snapshot.equity),
      time: snapshot.candleTime ?? snapshot.createdAt ?? snapshot.timestamp ?? null
    }))
    .filter((point): point is EquityChartPoint => point.y !== null)
    .sort((left, right) => timeValue(left.time) - timeValue(right.time));
  if (points.length >= 2) return sampleEquityChartPoints(points, MAX_EQUITY_CHART_POINTS);

  const current = trader.equity || 10_000;
  const start = trader.returnPct === -100 ? current : current / (1 + trader.returnPct / 100);
  const updatedAt = trader.summary?.updatedAt ?? null;
  return [
    { y: Number.isFinite(start) ? start : 10_000, time: updatedAt },
    { y: current, time: updatedAt }
  ];
}

export function chartPath(points: readonly { readonly x: number; readonly y: number }[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function sampleEquityChartPoints(points: readonly EquityChartPoint[], limit: number): EquityChartPoint[] {
  if (points.length <= limit) return [...points];
  const lastIndex = points.length - 1;
  const sampleLastIndex = limit - 1;
  return Array.from({ length: limit }, (_, index) => points[Math.round((index * lastIndex) / sampleLastIndex)]).filter(
    (point): point is EquityChartPoint => point !== undefined
  );
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeValue(value: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
