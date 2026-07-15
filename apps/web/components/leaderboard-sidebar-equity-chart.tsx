import { useState } from "react";
import type { EquitySnapshot } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { TraderStanding } from "@/lib/league";
import {
  chartPath,
  equityChartPoints,
  formatAxisPrice,
  formatExactPrice,
  formatTooltipTime,
  getTraderColor,
  GRIDLINE_COUNT
} from "@/components/leaderboard-sidebar-equity-chart-data";

export const SIDEBAR_CHART_STROKE_WIDTH = "1.25";
export const SIDEBAR_CHART_STROKE = "var(--accent)";

type ChartDayLabel = {
  readonly x: number;
  readonly label: string;
  readonly anchor: "start" | "middle" | "end";
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
  readonly locale: Locale;
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

  // Y-axis gridlines
  const gridlines: Array<{ y: number; price: number }> = [];
  for (let i = 0; i < GRIDLINE_COUNT; i++) {
    const price = paddedMax - (i / (GRIDLINE_COUNT - 1)) * paddedRange;
    const y = 15 + (i / (GRIDLINE_COUNT - 1)) * plotHeight;
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

    const dayStr = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
    if (dayStr !== lastDayStr) {
      const x = plotMarginLeft + (i / Math.max(points.length - 1, 1)) * plotWidth;
      const label = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
      dayLabels.push({ x, label });
      lastDayStr = dayStr;
    }
  }


  // Filter X-axis labels to ensure they are at least 70px apart
  const filteredDayLabels: ChartDayLabel[] = [];
  let lastPlacedX = -999;
  for (const label of dayLabels) {
    if (filteredDayLabels.length === 0 || label.x - lastPlacedX >= 70) {
      const anchor = label.x <= plotMarginLeft + 24 ? "start" : label.x >= plotMarginLeft + plotWidth - 24 ? "end" : "middle";
      filteredDayLabels.push({ ...label, anchor });
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
        <div className="min-w-0">
          <p className="text-base font-bold text-white">{t("leaderboard.chart.equityCurve")}</p>
          <p className="text-soft-app mt-1 truncate text-xs">{snapshots.length === 0 ? t("leaderboard.chart.noSnapshots") : formatDateTime(points.at(-1)?.time, locale)}</p>
        </div>
        <div className="max-w-[55%] shrink-0 truncate text-right">
          <p className="truncate font-mono text-lg font-bold text-white">{formatCurrency(points.at(-1)?.y, locale)}</p>
          <p className={`font-mono text-sm font-semibold ${trader.returnPct >= 0 ? "value-good" : "value-bad"}`}>{formatSignedPercent(trader.returnPct)}</p>
        </div>
      </div>

      {hoveredPoint && hoveredRawPoint && (
        <div
          className="pointer-events-none absolute top-[76px] z-10 rounded-md border border-white/[0.08] bg-zinc-950/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm transition-all duration-75"
          style={{
            left: `${(hoveredPoint.x / 600) * 100}%`,
            transform: `translateX(${-((hoveredPoint.x - plotMarginLeft) / plotWidth) * 100}%)`,
          }}
        >
          <div className="flex items-center gap-2 whitespace-nowrap font-mono text-xs font-medium">
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

        {gridlines.map((gridline, idx) => (
          <g key={`grid-${idx}`}>
            <line
              x1={plotMarginLeft}
              y1={gridline.y}
              x2={plotMarginLeft + plotWidth}
              y2={gridline.y}
              stroke="currentColor"
              strokeOpacity="0.05"
              strokeWidth="0.75"
            />
            <text
              x={plotMarginLeft - 10}
              y={gridline.y + 6}
              textAnchor="end"
              className="fill-zinc-400 font-mono text-[18px] font-semibold"
            >
              {formatAxisPrice(gridline.price, paddedRange, locale)}
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
              textAnchor={label.anchor}
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

function formatSignedPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
