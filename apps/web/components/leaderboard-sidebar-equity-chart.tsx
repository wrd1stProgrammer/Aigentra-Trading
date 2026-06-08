import type { EquitySnapshot } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { TraderStanding } from "@/lib/league";

export const SIDEBAR_CHART_STROKE_WIDTH = "1.25";
export const SIDEBAR_CHART_STROKE = "var(--accent)";

type ChartPoint = {
  readonly y: number;
  readonly time: string | null;
};

export function EquityAreaChart({
  trader,
  snapshots,
  loading,
  locale,
  t
}: {
  readonly trader: TraderStanding;
  readonly snapshots: readonly EquitySnapshot[];
  readonly loading: boolean;
  readonly locale: "ko" | "en";
  readonly t: (key: string) => string;
}) {
  const points = equityChartPoints(trader, snapshots);
  const values = points.map((point) => point.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartPoints = points.map((point, index) => ({
    x: (index / Math.max(points.length - 1, 1)) * 100,
    y: 54 - ((point.y - min) / range) * 42
  }));
  const path = chartPath(chartPoints);
  const area = `${path} L 100 60 L 0 60 Z`;
  const gradientId = `equity-area-${trader.id}`;
  const isFallback = snapshots.length === 0;

  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface)] p-4 ring-1 ring-[var(--border)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t("leaderboard.chart.equityCurve")}</p>
          <p className="text-soft-app mt-1 text-xs">{isFallback ? t("leaderboard.chart.noSnapshots") : formatDateTime(points.at(-1)?.time, locale)}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold">{formatCurrency(points.at(-1)?.y, locale)}</p>
          <p className={`font-mono text-xs font-semibold ${trader.returnPct >= 0 ? "value-good" : "value-bad"}`}>{formatSignedPercent(trader.returnPct)}</p>
        </div>
      </div>
      <svg viewBox="0 0 100 60" role="img" aria-label={t("leaderboard.chart.equityCurve")} className="h-36 w-full" shapeRendering="geometricPrecision">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={SIDEBAR_CHART_STROKE} stopOpacity="0.18" />
            <stop offset="62%" stopColor={SIDEBAR_CHART_STROKE} stopOpacity="0.08" />
            <stop offset="100%" stopColor={SIDEBAR_CHART_STROKE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 0 14 H 100 M 0 36 H 100" stroke="currentColor" strokeOpacity="0.07" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={SIDEBAR_CHART_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={SIDEBAR_CHART_STROKE_WIDTH}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {loading ? <p className="text-soft-app mt-2 text-xs">{t("common.loading")}</p> : null}
    </div>
  );
}

function equityChartPoints(trader: TraderStanding, snapshots: readonly EquitySnapshot[]): ChartPoint[] {
  const points = snapshots
    .map((snapshot) => ({
      y: numberValue(snapshot.equity),
      time: snapshot.candleTime ?? snapshot.createdAt ?? snapshot.timestamp ?? null
    }))
    .filter((point): point is ChartPoint => point.y !== null)
    .sort((a, b) => timeValue(a.time) - timeValue(b.time))
    .slice(-60);
  if (points.length >= 2) return points;

  const current = trader.equity || 10000;
  const start = trader.returnPct === -100 ? current : current / (1 + trader.returnPct / 100);
  const updatedAt = trader.summary?.updatedAt ?? null;
  return [
    { y: Number.isFinite(start) ? start : 10000, time: updatedAt },
    { y: current, time: updatedAt }
  ];
}

function chartPath(points: ReadonlyArray<{ readonly x: number; readonly y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function formatSignedPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function numberValue(...values: readonly unknown[]) {
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
