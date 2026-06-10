import { useState } from "react";
import type { EquitySnapshot } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { TraderStanding } from "@/lib/league";

export const SIDEBAR_CHART_STROKE_WIDTH = "1.25";
export const SIDEBAR_CHART_STROKE = "var(--accent)";

type ChartPoint = {
  readonly y: number;
  readonly time: string | null;
};

const TRADER_COLORS: Array<{ stroke: string; gradientStart: string }> = [
  { stroke: "#3b82f6", gradientStart: "#3b82f6" }, // Blue
  { stroke: "#10b981", gradientStart: "#10b981" }, // Emerald
  { stroke: "#8b5cf6", gradientStart: "#8b5cf6" }, // Violet
  { stroke: "#f43f5e", gradientStart: "#f43f5e" }, // Rose
  { stroke: "#f59e0b", gradientStart: "#f59e0b" }, // Amber
  { stroke: "#06b6d4", gradientStart: "#06b6d4" }, // Cyan
  { stroke: "#ec4899", gradientStart: "#ec4899" }, // Pink
  { stroke: "#14b8a6", gradientStart: "#14b8a6" }, // Teal
  { stroke: "#a855f7", gradientStart: "#a855f7" }, // Purple
  { stroke: "#f97316", gradientStart: "#f97316" }  // Orange
];

function getTraderColor(traderId: string) {
  let hash = 0;
  for (let i = 0; i < traderId.length; i++) {
    hash = traderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TRADER_COLORS.length;
  return TRADER_COLORS[index] || TRADER_COLORS[0];
}

function formatBriefPrice(value: number, locale: "ko" | "en"): string {
  if (value >= 1_000_000) {
    const val = value / 1_000_000;
    return `${val.toFixed(val % 1 === 0 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    const val = value / 1_000;
    return `${val.toFixed(val % 1 === 0 ? 0 : 1)}k`;
  }
  return value.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 1 });
}

function formatExactPrice(value: number, locale: "ko" | "en"): string {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatTooltipTime(timeStr: string | null | undefined, locale: "ko" | "en"): string {
  if (!timeStr) return "";
  const date = new Date(timeStr);
  if (Number.isNaN(date.getTime())) return "";

  const months = date.getMonth() + 1;
  const days = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${months}/${days} ${hours}:${minutes}`;
}

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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = equityChartPoints(trader, snapshots);
  const values = points.map((point) => point.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Let's use 10% vertical padding
  const padding = range * 0.1;
  const paddedMin = min - padding;
  const paddedMax = max + padding;
  const paddedRange = paddedMax - paddedMin || 1;

  // Plot margins
  const plotMarginLeft = 80;
  const plotWidth = 510;
  const plotHeight = 180;
  const plotBottom = 195;

  const chartPoints = points.map((point, index) => {
    const x = plotMarginLeft + (index / Math.max(points.length - 1, 1)) * plotWidth;
    const y = 15 + plotHeight - ((point.y - paddedMin) / paddedRange) * plotHeight;
    return { x, y };
  });

  const path = chartPath(chartPoints);
  const firstX = chartPoints[0]?.x ?? plotMarginLeft;
  const lastX = chartPoints[chartPoints.length - 1]?.x ?? (plotMarginLeft + plotWidth);
  const area = `${path} L ${lastX} ${plotBottom} L ${firstX} ${plotBottom} Z`;

  const color = getTraderColor(trader.id);
  const gradientId = `equity-area-${trader.id}`;
  const isFallback = snapshots.length === 0;

  // Y-axis gridlines
  const gridlineCount = 4;
  const gridlines: Array<{ y: number; price: number }> = [];
  for (let i = 0; i < gridlineCount; i++) {
    const price = paddedMax - (i / (gridlineCount - 1)) * paddedRange;
    const y = 15 + (i / (gridlineCount - 1)) * plotHeight;
    gridlines.push({ y, price });
  }

  // X-axis day labels
  const dayLabels: Array<{ x: number; label: string }> = [];
  let lastDayStr = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p.time) continue;
    const date = new Date(p.time);
    if (Number.isNaN(date.getTime())) continue;

    const dayStr = `${date.getMonth() + 1}/${date.getDate()}`;
    if (dayStr !== lastDayStr) {
      const x = plotMarginLeft + (i / Math.max(points.length - 1, 1)) * plotWidth;
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      dayLabels.push({ x, label });
      lastDayStr = dayStr;
    }
  }

  // Filter X-axis labels to ensure they are at least 70px apart
  const filteredDayLabels: Array<{ x: number; label: string }> = [];
  let lastPlacedX = -999;
  for (const label of dayLabels) {
    if (filteredDayLabels.length === 0 || label.x - lastPlacedX >= 70) {
      filteredDayLabels.push(label);
      lastPlacedX = label.x;
    }
  }

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = event.clientX - rect.left;
    const viewBoxWidth = 600;
    const svgX = (clientX / rect.width) * viewBoxWidth;
    const plotX = svgX - plotMarginLeft;
    const percentage = Math.max(0, Math.min(1, plotX / plotWidth));
    const index = Math.round(percentage * (points.length - 1));
    if (index >= 0 && index < points.length) {
      setHoveredIndex(index);
    }
  };

  const handleTouchMove = (event: React.TouchEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const touch = event.touches[0];
    if (!touch) return;
    const clientX = touch.clientX - rect.left;
    const viewBoxWidth = 600;
    const svgX = (clientX / rect.width) * viewBoxWidth;
    const plotX = svgX - plotMarginLeft;
    const percentage = Math.max(0, Math.min(1, plotX / plotWidth));
    const index = Math.round(percentage * (points.length - 1));
    if (index >= 0 && index < points.length) {
      setHoveredIndex(index);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const hoveredPoint = hoveredIndex !== null ? chartPoints[hoveredIndex] : null;
  const hoveredRawPoint = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div className="relative overflow-hidden rounded-lg bg-[var(--surface)] px-0 py-4 ring-1 ring-[var(--border)]">
      <div className="mb-3 flex items-start justify-between gap-3 px-4">
        <div>
          <p className="text-base font-bold text-white">{t("leaderboard.chart.equityCurve")}</p>
          <p className="text-soft-app mt-1 text-xs">{isFallback ? t("leaderboard.chart.noSnapshots") : formatDateTime(points.at(-1)?.time, locale)}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-white">{formatCurrency(points.at(-1)?.y, locale)}</p>
          <p className={`font-mono text-sm font-semibold ${trader.returnPct >= 0 ? "value-good" : "value-bad"}`}>{formatSignedPercent(trader.returnPct)}</p>
        </div>
      </div>

      {hoveredPoint && hoveredRawPoint && (
        <div
          className="absolute z-10 rounded-md border border-white/[0.08] bg-zinc-950/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm transition-all duration-75 pointer-events-none"
          style={{
            left: `${(hoveredPoint.x / 600) * 100}%`,
            top: "12px",
            transform: `translateX(${-((hoveredPoint.x - plotMarginLeft) / plotWidth) * 100}%)`,
          }}
        >
          <div className="flex items-center gap-2 font-mono text-xs font-medium">
            <span className="text-white font-bold">{formatExactPrice(hoveredRawPoint.y, locale)}</span>
            <span className="text-zinc-400">{formatTooltipTime(hoveredRawPoint.time, locale)}</span>
          </div>
        </div>
      )}

      <svg
        viewBox="0 0 600 240"
        role="img"
        aria-label={t("leaderboard.chart.equityCurve")}
        className="h-36 w-full cursor-crosshair select-none"
        shapeRendering="geometricPrecision"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color.gradientStart} stopOpacity="0.22" />
            <stop offset="62%" stopColor={color.gradientStart} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color.gradientStart} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridlines.map((g, idx) => (
          <g key={`grid-${idx}`}>
            <line
              x1={plotMarginLeft}
              y1={g.y}
              x2={plotMarginLeft + plotWidth}
              y2={g.y}
              stroke="currentColor"
              strokeOpacity="0.05"
              strokeWidth="0.75"
            />
            <text
              x={plotMarginLeft - 10}
              y={g.y + 6}
              textAnchor="end"
              className="fill-zinc-400 font-mono text-[18px] font-semibold"
            >
              {formatBriefPrice(g.price, locale)}
            </text>
          </g>
        ))}

        {filteredDayLabels.map((label, idx) => (
          <g key={`x-label-${idx}`}>
            <line
              x1={label.x}
              y1={15}
              x2={label.x}
              y2={plotBottom}
              stroke="currentColor"
              strokeOpacity="0.03"
              strokeWidth="0.75"
            />
            <text
              x={label.x}
              y={plotBottom + 22}
              textAnchor="middle"
              className="fill-zinc-400 font-mono text-[20px] font-semibold"
            >
              {label.label}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={color.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={SIDEBAR_CHART_STROKE_WIDTH}
          vectorEffect="non-scaling-stroke"
        />

        {hoveredPoint && (
          <g>
            <line
              x1={hoveredPoint.x}
              y1={15}
              x2={hoveredPoint.x}
              y2={plotBottom}
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="4.5"
              fill={color.stroke}
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
          </g>
        )}
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
