"use client";

import {
  ActivityIcon,
  ArrowsOutSimple,
  CaretLeft,
  CaretRight,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  WifiHigh,
  WifiSlash,
  Cursor,
  Trash,
  PencilSimple,
  Ruler,
  Minus,
  Eye,
  EyeSlash,
  CircleNotch
} from "@phosphor-icons/react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  LineSeries,
  HistogramSeries,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { getCachedKlines, getKlines, updateKlineCache, type KlineCandle, type ManagementReview, type PaperOrder, type PaperPosition, type PaperTradeEvent, type RunCycleResult } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { intlLocale } from "@/lib/format";
import { buildRealizedEventOverlayLines } from "@/components/trader-profile-detail/chart-realized-overlays";
import type { ExecutionMarker } from "@/components/trader-profile-detail/execution-markers";
import { StatusBadge } from "@/components/status-badge";
import {
  CACHED_CANDLES_VISIBLE_MS,
  candleLimitForInterval,
  latestVisibleLogicalRange,
  restBackfillCandleLimit,
  restCacheStaleMs,
  restFallbackIntervalMs,
  shouldAcceptRealtimeCandle,
  shouldBackfillFromRest,
  socketFreshWindowMs,
  type ChartInterval
} from "@/components/live-candle-chart-data";
import {
  compactOverlayLines,
  isOpenChartExposure,
  latestManagedStopLoss,
  overlaySideLabel,
  pendingOrderLineLabel,
  priceLineTitle,
  shouldMarkTakeProfitCompleted,
  shouldRenderRealizedEventOverlays,
  type OverlayLine,
  type OverlayTone
} from "@/components/live-candle-chart-overlays";
import { volumeHistogramData, volumeHistogramPoint } from "@/components/live-candle-chart-volume";
import { isPendingEntryOrder } from "@/components/trader-profile-detail/position-panel-rows";

type TradePlanView = {
  status?: string;
  side?: string | null;
  entries?: Array<{ price: number; weight: number; reason: string }>;
  stopLoss?: number | null;
  takeProfits?: Array<{ price: number; weight: number; reason: string }>;
};
type ChartResultView = RunCycleResult | Pick<RunCycleResult, "tradePlan">;
type PositionedExecutionMarker = ExecutionMarker & {
  x: number;
  y: number;
  dotY: number;
};

const TIMEFRAMES: ChartInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const DEFAULT_INTERVAL: ChartInterval = "5m";
const HISTORY_PAGE_LIMIT = 500;
const MAX_CHART_CANDLES = 5000;
const OVERLAY_LINE_VISUAL = {
  entry: { lineWidth: 1, lineStyle: LineStyle.Dotted },
  stop: { lineWidth: 1, lineStyle: LineStyle.Dashed },
  takeProfit: { lineWidth: 1, lineStyle: LineStyle.Dashed },
  position: { lineWidth: 1, lineStyle: LineStyle.Solid },
  order: { lineWidth: 1, lineStyle: LineStyle.Dotted },
  takeProfitDone: { lineWidth: 1, lineStyle: LineStyle.Solid },
  stopDone: { lineWidth: 1, lineStyle: LineStyle.Solid }
} as const;

// --- Technical Indicator Calculations ---

function calculateEMA(candles: CandlestickData<Time>[], period: number) {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const emaData: { time: Time; value: number }[] = [];
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let currentEma = sum / period;
  emaData.push({ time: candles[period - 1].time, value: currentEma });

  for (let i = period; i < candles.length; i++) {
    currentEma = (candles[i].close - currentEma) * k + currentEma;
    emaData.push({ time: candles[i].time, value: currentEma });
  }
  return emaData;
}

interface BBValue {
  time: Time;
  upper: number;
  middle: number;
  lower: number;
}

function calculateBollingerBands(candles: CandlestickData<Time>[], period: number = 20, multiplier: number = 2): BBValue[] {
  if (candles.length < period) return [];
  const bbData: BBValue[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, c) => sum + c.close, 0) / period;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    bbData.push({
      time: candles[i].time,
      upper: mean + multiplier * stdDev,
      middle: mean,
      lower: mean - multiplier * stdDev
    });
  }
  return bbData;
}

function calculateRSI(candles: CandlestickData<Time>[], period: number = 14) {
  if (candles.length <= period) return [];
  const rsiData: { time: Time; value: number }[] = [];

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  rsiData.push({ time: candles[period].time, value: rsi });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    rsiData.push({ time: candles[i].time, value: rsi });
  }
  return rsiData;
}

interface MACDValue {
  time: Time;
  macd: number;
  signal: number;
  hist: number;
}

function calculateMACD(candles: CandlestickData<Time>[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): MACDValue[] {
  if (candles.length < slowPeriod) return [];
  
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);

  const macdLineData: { time: Time; value: number }[] = [];
  const slowEmaMap = new Map<number, number>();
  for (const item of slowEma) {
    slowEmaMap.set(Number(item.time), item.value);
  }

  for (const item of fastEma) {
    const slowVal = slowEmaMap.get(Number(item.time));
    if (slowVal !== undefined) {
      macdLineData.push({ time: item.time, value: item.value - slowVal });
    }
  }

  if (macdLineData.length < signalPeriod) return [];

  const signalEma = calculateEMA(macdLineData.map(d => ({ ...d, close: d.value, open: d.value, high: d.value, low: d.value })), signalPeriod);
  
  const signalMap = new Map<number, number>();
  for (const item of signalEma) {
    signalMap.set(Number(item.time), item.value);
  }

  const macdResult: MACDValue[] = [];
  for (const item of macdLineData) {
    const sigVal = signalMap.get(Number(item.time));
    if (sigVal !== undefined) {
      macdResult.push({
        time: item.time,
        macd: item.value,
        signal: sigVal,
        hist: item.value - sigVal
      });
    }
  }
  return macdResult;
}

export function LiveCandleChart({
  symbol,
  result,
  paperPositions = [],
  paperOrders = [],
  paperEvents = [],
  managementReviews = [],
  executionMarkers = [],
  selectedExecutionMarkerId = null,
  focusedExecutionMarkerId = null,
  height = 340,
  compact = false,
  onLatestPriceChange,
  onExecutionMarkerSelect
}: {
  symbol: string;
  result: ChartResultView | null;
  paperPositions?: Array<PaperPosition | Record<string, any>>;
  paperOrders?: Array<PaperOrder | Record<string, any>>;
  paperEvents?: Array<PaperTradeEvent | Record<string, any>>;
  managementReviews?: Array<ManagementReview | Record<string, any>>;
  executionMarkers?: readonly ExecutionMarker[];
  selectedExecutionMarkerId?: string | null;
  focusedExecutionMarkerId?: string | null;
  height?: number;
  compact?: boolean;
  onLatestPriceChange?: (price: number | null) => void;
  onExecutionMarkerSelect?: (markerId: string) => void;
}) {
  const { locale, t, theme } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const hasVisibleCandlesRef = useRef(false);
  const lastSocketUpdateAtRef = useRef(0);
  const lastCandleTimeRef = useRef<number | null>(null);
  const chartCandlesRef = useRef<KlineCandle[]>([]);
  const oldestOpenTimeRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  const visibleSymbolRef = useRef<string | null>(null);
  const [interval, setInterval] = useState<ChartInterval>(DEFAULT_INTERVAL);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [dailyReferencePrice, setDailyReferencePrice] = useState<number | null>(null);
  const [showDrawingTools, setShowDrawingTools] = useState(false);
  const [executionMarkerPositions, setExecutionMarkerPositions] = useState<PositionedExecutionMarker[]>([]);
  const [activeExecutionMarkerId, setActiveExecutionMarkerId] = useState<string | null>(null);
  const chartHeight = height || 380;

  // --- Upgrade: Indicators Toggles ---
  const [showEma20, setShowEma20] = useState(() => typeof window !== "undefined" && localStorage.getItem("chart-show-ema20") === "true");
  const [showEma50, setShowEma50] = useState(() => typeof window !== "undefined" && localStorage.getItem("chart-show-ema50") === "true");
  const [showEma200, setShowEma200] = useState(() => typeof window !== "undefined" && localStorage.getItem("chart-show-ema200") === "true");
  const [showBb, setShowBb] = useState(() => typeof window !== "undefined" && localStorage.getItem("chart-show-bb") === "true");
  const [showRsi, setShowRsi] = useState(() => typeof window !== "undefined" && localStorage.getItem("chart-show-rsi") === "true");
  const [showMacd, setShowMacd] = useState(() => typeof window !== "undefined" && localStorage.getItem("chart-show-macd") === "true");

  useEffect(() => { localStorage.setItem("chart-show-ema20", String(showEma20)); }, [showEma20]);
  useEffect(() => { localStorage.setItem("chart-show-ema50", String(showEma50)); }, [showEma50]);
  useEffect(() => { localStorage.setItem("chart-show-ema200", String(showEma200)); }, [showEma200]);
  useEffect(() => { localStorage.setItem("chart-show-bb", String(showBb)); }, [showBb]);
  useEffect(() => { localStorage.setItem("chart-show-rsi", String(showRsi)); }, [showRsi]);
  useEffect(() => { localStorage.setItem("chart-show-macd", String(showMacd)); }, [showMacd]);

  // --- Upgrade: Drawing tools state ---
  const [activeTool, setActiveTool] = useState<"cursor" | "trend" | "horizontal" | "brush" | "ruler">("cursor");
  const [drawings, setDrawings] = useState<{
    trendLines: Array<{ start: { time: number; price: number }; end: { time: number; price: number } }>;
    horizontalLines: Array<number>;
    brushStrokes: Array<Array<{ time: number; price: number }>>;
  }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`trader-drawings-${symbol}`);
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return { trendLines: [], horizontalLines: [], brushStrokes: [] };
  });

  const [activeDrawing, setActiveDrawing] = useState<{
    type: "trend" | "brush" | "ruler";
    start: { time: number; price: number };
    end: { time: number; price: number };
    stroke?: Array<{ time: number; price: number }>;
  } | null>(null);

  const [activeRuler, setActiveRuler] = useState<{ start: { time: number; price: number }; end: { time: number; price: number } } | null>(null);

  useEffect(() => {
    localStorage.setItem(`trader-drawings-${symbol}`, JSON.stringify(drawings));
  }, [drawings, symbol]);

  // --- Upgrade: React State for indicator updates ---
  const [indicatorCandles, setIndicatorCandles] = useState<KlineCandle[]>([]);
  const [ema20, setEma20] = useState<any[]>([]);
  const [ema50, setEma50] = useState<any[]>([]);
  const [ema200, setEma200] = useState<any[]>([]);
  const [bbData, setBbData] = useState<BBValue[]>([]);
  const [rsiData, setRsiData] = useState<any[]>([]);
  const [macdData, setMacdData] = useState<MACDValue[]>([]);

  useEffect(() => {
    if (indicatorCandles.length === 0) return;
    const chartData = indicatorCandles.map(toChartCandle);
    setEma20(calculateEMA(chartData, 20));
    setEma50(calculateEMA(chartData, 50));
    setEma200(calculateEMA(chartData, 200));
    setBbData(calculateBollingerBands(chartData, 20, 2));
    setRsiData(calculateRSI(chartData, 14));
    setMacdData(calculateMACD(chartData, 12, 26, 9));
  }, [indicatorCandles]);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(intlLocale(locale), {
        maximumFractionDigits: symbol.startsWith("ETH") ? 2 : 1,
        minimumFractionDigits: symbol.startsWith("ETH") ? 2 : 1
      }),
    [locale, symbol]
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(intlLocale(locale), {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      }),
    [locale]
  );
  const marketPrice = latestPrice ?? indicatorCandles.at(-1)?.close ?? null;
  const showInitialChartSpinner = loading && indicatorCandles.length === 0;
  const dayChangePct =
    marketPrice !== null && dailyReferencePrice !== null && dailyReferencePrice > 0
      ? ((marketPrice - dailyReferencePrice) / dailyReferencePrice) * 100
      : null;

  useEffect(() => {
    onLatestPriceChange?.(marketPrice);
  }, [marketPrice, onLatestPriceChange]);

  useEffect(() => {
    let cancelled = false;
    setDailyReferencePrice(null);
    getKlines(symbol, "1d", 2, { staleMs: 60_000 })
      .then((response) => {
        if (cancelled) return;
        const candles = [...response.candles].sort((left, right) => left.openTime - right.openTime);
        const latestDaily = candles.at(-1);
        const previousDaily = candles.at(-2);
        setDailyReferencePrice(previousDaily?.close ?? latestDaily?.open ?? null);
      })
      .catch(() => {
        if (!cancelled) setDailyReferencePrice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const visibleOpenPaperPositions = useMemo(
    () => paperPositions.filter((position) => matchesChartSymbol(position.symbol, symbol) && isOpenChartExposure(position)),
    [paperPositions, symbol]
  );
  const visibleOpenPaperOrders = useMemo(
    () => paperOrders.filter((order) => matchesChartSymbol(order.symbol, symbol) && isPendingEntryOrder(order)),
    [paperOrders, symbol]
  );
  const hasOpenPaperPosition = visibleOpenPaperPositions.length > 0;
  const hasOpenPaperOrder = visibleOpenPaperOrders.length > 0;
  const isFreshRunCycleResult = Boolean(result && "candidate" in result && "traderId" in result);
  const overlayLines = useMemo<OverlayLine[]>(() => {
    const plan = (result?.tradePlan ?? null) as TradePlanView | null;
    const lines: OverlayLine[] = [];
    if (shouldRenderPlanLines(plan, hasOpenPaperPosition, hasOpenPaperOrder, isFreshRunCycleResult)) {
      for (const [index, entry] of (plan.entries ?? []).entries()) {
        if (Number.isFinite(entry.price)) {
          lines.push({ value: entry.price, label: `${t("chart.entry")} ${index + 1}`, tone: "entry" });
        }
      }
      if (typeof plan.stopLoss === "number" && Number.isFinite(plan.stopLoss)) {
        lines.push({ value: plan.stopLoss, label: t("chart.stopLoss"), tone: "stop" });
      }
      for (const [index, takeProfit] of (plan.takeProfits ?? []).entries()) {
        if (Number.isFinite(takeProfit.price)) {
          lines.push({ value: takeProfit.price, label: `${t("chart.takeProfit")} ${index + 1}`, tone: "takeProfit" });
        }
      }
    }

    for (const [index, position] of visibleOpenPaperPositions.entries()) {
      const payload = recordValue(position.payload);
      const entryPrice = firstFiniteNumber(position.entryPrice, position.averageEntryPrice, position.avgEntryPrice, position.openPrice);
      if (entryPrice !== null) {
        const side = overlaySideLabel(position.side);
        lines.push({ value: entryPrice, label: side ? `${t("chart.averageEntry")} ${side}` : `${t("chart.averageEntry")} ${index + 1}`, tone: "position" });
      }
      const stopLoss = firstFiniteNumber(
        latestManagedStopLoss({ records: [...managementReviews, ...paperEvents], symbol, positionId: position.id }),
        position.stopLoss,
        position.stopLossPrice,
        position.stop_loss,
        position.stop_loss_price
      );
      if (stopLoss !== null) {
        lines.push({ value: stopLoss, label: t("chart.stopLoss"), tone: "stop" });
      }
      const takeProfit = firstFiniteNumber(position.takeProfit, position.takeProfitPrice, position.take_profit_price);
      if (takeProfit !== null) {
        const target = takeProfitState({
          side: position.side,
          targetPrice: takeProfit,
          latestPrice,
          completed: position.takeProfitStatus ?? position.take_profit_status ?? payload?.takeProfitStatus ?? payload?.take_profit_status,
          t
        });
        lines.push({ value: takeProfit, label: target.label, tone: target.tone });
      }
      for (const [targetIndex, target] of asArray<Record<string, any>>(position.takeProfits ?? position.take_profits).entries()) {
        const price = firstFiniteNumber(target?.price, target?.targetPrice);
        if (price !== null) {
          const targetState = takeProfitState({
            side: position.side,
            targetPrice: price,
            latestPrice,
            completed: target?.status ?? target?.state ?? target?.completed ?? target?.filled ?? target?.filledAt ?? target?.filled_at,
            t
          });
          lines.push({ value: price, label: `${t("chart.position")} ${targetState.label} ${targetIndex + 1}`, tone: targetState.tone });
        }
      }
    }

    for (const [index, order] of visibleOpenPaperOrders.entries()) {
      const payload = recordValue(order.payload);
      const orderPrice = firstFiniteNumber(order.limitPrice, order.price, order.stopPrice, order.triggerPrice);
      if (orderPrice !== null) {
        const side = overlaySideLabel(order.side);
        lines.push({ value: orderPrice, label: pendingOrderLineLabel(side, index, t), tone: "order" });
      }
      const stopLoss = firstFiniteNumber(order.stopLossPrice, order.stop_loss_price, payload?.stopLossPrice, payload?.stopLoss);
      if (stopLoss !== null) {
        lines.push({ value: stopLoss, label: t("chart.stopLoss"), tone: "stop" });
      }
      const takeProfit = firstFiniteNumber(order.takeProfitPrice, order.take_profit_price, recordValue(payload?.target)?.price, payload?.takeProfitPrice, payload?.takeProfit);
      if (takeProfit !== null) {
        const target = takeProfitState({ exposureKind: "order", side: order.side, targetPrice: takeProfit, latestPrice, t });
        lines.push({ value: takeProfit, label: target.label, tone: target.tone });
      }
    }
    if (shouldRenderRealizedEventOverlays({ hasOpenPaperPosition, hasOpenPaperOrder })) {
      lines.push(...buildRealizedEventOverlayLines({
        activeOrderIds: visibleOpenPaperOrders.map((order) => order.id),
        activePositionIds: visibleOpenPaperPositions.map((position) => position.id),
        events: paperEvents,
        symbol,
        t
      }));
    }
    return compactOverlayLines(lines);
  }, [hasOpenPaperOrder, hasOpenPaperPosition, isFreshRunCycleResult, latestPrice, managementReviews, paperEvents, result, symbol, t, visibleOpenPaperOrders, visibleOpenPaperPositions]);
  const visibleExecutionMarkers = useMemo(() => {
    if (!selectedExecutionMarkerId) return [];
    if (!executionMarkers.length) return [];
    const selected = executionMarkers.find((marker) => marker.id === selectedExecutionMarkerId);
    return selected ? executionMarkers.filter((marker) => marker.cycleId === selected.cycleId) : [];
  }, [executionMarkers, selectedExecutionMarkerId]);
  const visibleExecutionMarkerKey = useMemo(
    () => visibleExecutionMarkers.map((marker) => [
      marker.id,
      marker.cycleId,
      marker.shortLabel,
      marker.timeMs,
      marker.price,
      marker.pnlLabel ?? ""
    ].join(":")).join("|"),
    [visibleExecutionMarkers]
  );
  const selectedExecutionCycleId = useMemo(() => {
    if (!selectedExecutionMarkerId) return null;
    return executionMarkers.find((marker) => marker.id === selectedExecutionMarkerId)?.cycleId ?? null;
  }, [executionMarkers, selectedExecutionMarkerId]);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Canvas ref for drawing overlay
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync secondary chart refs
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const macdContainerRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const macdLineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // --- Initializing Main Chart ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const colors = chartColors(theme);
    const chart = createChart(container, {
      width: container.clientWidth,
      height: chartHeight,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair },
        horzLine: { color: colors.crosshair }
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.16 }
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8
      },
      localization: {
        priceFormatter: (price: number) => formatter.format(price)
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      },
      handleScroll: {
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
        vertTouchDrag: false
      }
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      borderVisible: false,
      priceLineVisible: true,
      lastValueVisible: true
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: ""
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      priceLinesRef.current = [];
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [formatter, chartHeight, theme]);

  // Adjust theme dynamically
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const colors = chartColors(theme);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },
      crosshair: {
        vertLine: { color: colors.crosshair },
        horzLine: { color: colors.crosshair }
      }
    });
    series.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down
    });
  }, [theme]);

  // --- Fetch and cache kline data ---
  useEffect(() => {
    let disposed = false;
    const series = seriesRef.current;
    const chart = chartRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!series || !chart || !volumeSeries) return;

    const limit = candleLimitForInterval(interval);
    const cached = getCachedKlines(symbol, interval, limit, CACHED_CANDLES_VISIBLE_MS);
    const cachedCandles = cached?.candles ?? [];
    const hasCachedCandles = cachedCandles.length > 0;
    const shouldPreserveVisible = !hasCachedCandles && visibleSymbolRef.current === symbol && hasVisibleCandlesRef.current;

    setError(null);
    setConnected(false);
    setLoading(true);
    hasVisibleCandlesRef.current = hasCachedCandles || shouldPreserveVisible;
    lastSocketUpdateAtRef.current = 0;

    const updateChartData = (candlesList: KlineCandle[]) => {
      const chartData = candlesList.map(toChartCandle);
      series.setData(chartData);
      
      const volData = volumeHistogramData(candlesList).map((point) => ({
        time: point.time as Time,
        value: point.value,
        color: point.color
      }));
      volumeSeries.setData(volData);
      
      setIndicatorCandles([...candlesList]);
    };

    if (hasCachedCandles) {
      updateChartData(cachedCandles);
      chartCandlesRef.current = cachedCandles;
      oldestOpenTimeRef.current = cachedCandles[0]?.openTime ?? null;
      lastCandleTimeRef.current = chartTimeValue(cachedCandles.at(-1)?.openTime);
      visibleSymbolRef.current = symbol;
      setLatestPrice(cachedCandles.at(-1)?.close ?? null);
      setLatestVisibleRange(chart, cachedCandles.length, interval);
    } else if (!shouldPreserveVisible) {
      series.setData([]);
      volumeSeries.setData([]);
      setIndicatorCandles([]);
      chartCandlesRef.current = [];
      oldestOpenTimeRef.current = null;
      lastCandleTimeRef.current = null;
      visibleSymbolRef.current = null;
      setLatestPrice(null);
    }
    hasMoreHistoryRef.current = true;
    loadingOlderRef.current = false;
    setLoadingOlder(false);

    const refreshFromRest = async ({ fit = false, staleMs = restCacheStaleMs(interval) } = {}) => {
      if (!hasVisibleCandlesRef.current) setLoading(true);
      try {
        const data = await getKlines(symbol, interval, limit, { staleMs });
        if (disposed) return;
        if (data.candles.length || !hasVisibleCandlesRef.current) {
          updateChartData(data.candles);
          chartCandlesRef.current = data.candles;
          oldestOpenTimeRef.current = data.candles[0]?.openTime ?? null;
          hasVisibleCandlesRef.current = data.candles.length > 0;
          lastCandleTimeRef.current = data.candles.length ? Math.floor(data.candles.at(-1)!.openTime / 1000) : null;
          visibleSymbolRef.current = data.candles.length ? symbol : visibleSymbolRef.current;
          setLatestPrice(data.candles.at(-1)?.close ?? null);
          if (data.candles.length && fit) setLatestVisibleRange(chart, data.candles.length, interval);
        }
        setError(null);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    const refreshLatestFromRest = async () => {
      try {
        const data = await getKlines(symbol, interval, restBackfillCandleLimit(), { force: true, staleMs: 0 });
        if (disposed) return;
        for (const candle of data.candles) {
          updateKlineCache(symbol, interval, limit, candle);
        }
        const merged = getCachedKlines(symbol, interval, limit);
        const candles = merged?.candles?.length ? merged.candles : data.candles;
        if (candles.length) {
          updateChartData(candles);
          chartCandlesRef.current = candles;
          oldestOpenTimeRef.current = candles[0]?.openTime ?? null;
          hasVisibleCandlesRef.current = true;
          lastCandleTimeRef.current = Math.floor(candles.at(-1)!.openTime / 1000);
          visibleSymbolRef.current = symbol;
          setLatestPrice(candles.at(-1)?.close ?? null);
        }
        setError(null);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    const loadOlderCandles = async () => {
      const oldestOpenTime = oldestOpenTimeRef.current;
      if (!oldestOpenTime || loadingOlderRef.current || !hasMoreHistoryRef.current) return;
      loadingOlderRef.current = true;
      setLoadingOlder(true);
      try {
        const data = await getKlines(symbol, interval, HISTORY_PAGE_LIMIT, {
          before: oldestOpenTime,
          staleMs: 10 * 60_000
        });
        if (disposed) return;
        const olderCandles = data.candles.filter((candle) => candle.openTime < oldestOpenTime);
        if (!olderCandles.length) {
          hasMoreHistoryRef.current = false;
          return;
        }
        const merged = mergeCandleHistory(olderCandles, chartCandlesRef.current, MAX_CHART_CANDLES);
        chartCandlesRef.current = merged;
        oldestOpenTimeRef.current = merged[0]?.openTime ?? oldestOpenTime;
        updateChartData(merged);
        setError(null);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      } finally {
        loadingOlderRef.current = false;
        if (!disposed) setLoadingOlder(false);
      }
    };

    const visibleRangeHandler = (range: { from: number; to: number } | null) => {
      if (!range || !hasVisibleCandlesRef.current) return;
      if (range.from < 40) void loadOlderCandles();
    };

    void refreshFromRest({ fit: !hasCachedCandles });
    chart.timeScale().subscribeVisibleLogicalRangeChange(visibleRangeHandler);
    const restFallback = window.setInterval(() => {
      if (
        !shouldBackfillFromRest({
          now: Date.now(),
          lastSocketUpdateAt: lastSocketUpdateAtRef.current,
          staleWindowMs: socketFreshWindowMs(interval)
        })
      ) {
        return;
      }
      void refreshLatestFromRest();
    }, restFallbackIntervalMs(interval));

    const socket = new WebSocket("wss://ws.okx.com:8443/ws/v5/business");
    socket.onopen = () => {
      socket.send(JSON.stringify({ op: "subscribe", args: [{ channel: okxCandleChannel(interval), instId: okxInstrumentId(symbol) }] }));
      if (!disposed) setConnected(true);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const row = Array.isArray(data?.data) ? data.data[0] : null;
        if (!Array.isArray(row) || disposed) return;
        const next = okxKlineToChartCandle(row, interval);
        if (!shouldAcceptRealtimeCandle({ candidateTime: Number(next.time), lastCandleTime: lastCandleTimeRef.current })) return;
        const candle = okxKlineToApiCandle(row, interval);
        updateKlineCache(symbol, interval, limit, candle);
        chartCandlesRef.current = mergeCandleHistory(chartCandlesRef.current, [candle], MAX_CHART_CANDLES);
        oldestOpenTimeRef.current = chartCandlesRef.current[0]?.openTime ?? oldestOpenTimeRef.current;
        lastSocketUpdateAtRef.current = Date.now();
        lastCandleTimeRef.current = Number(next.time);
        visibleSymbolRef.current = symbol;
        hasVisibleCandlesRef.current = true;
        
        series.update(next);
        const volumePoint = volumeHistogramPoint(chartCandlesRef.current, chartCandlesRef.current.length - 1);
        volumeSeries.update({
          time: volumePoint.time as Time,
          value: volumePoint.value,
          color: volumePoint.color
        });

        setIndicatorCandles([...chartCandlesRef.current]);
        setLoading(false);
        const close = Number(row[4]);
        if (Number.isFinite(close)) setLatestPrice(close);
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      }
    };
    socket.onerror = () => {
      if (!disposed) setError(t("chart.websocketError"));
    };
    socket.onclose = () => {
      if (!disposed) setConnected(false);
    };

    return () => {
      disposed = true;
      window.clearInterval(restFallback);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(visibleRangeHandler);
      socket.close();
    };
  }, [interval, symbol, t]);

  // --- Manage EMAs Line Series ---
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (showEma20 && ema20.length > 0) {
      if (!ema20SeriesRef.current) {
        ema20SeriesRef.current = chart.addSeries(LineSeries, {
          color: "#f59e0b",
          title: "EMA 20",
          lastValueVisible: false,
          priceLineVisible: false,
          lineWidth: 2
        });
      }
      ema20SeriesRef.current.setData(ema20);
    } else if (ema20SeriesRef.current) {
      chart.removeSeries(ema20SeriesRef.current);
      ema20SeriesRef.current = null;
    }

    if (showEma50 && ema50.length > 0) {
      if (!ema50SeriesRef.current) {
        ema50SeriesRef.current = chart.addSeries(LineSeries, {
          color: "#3b82f6",
          title: "EMA 50",
          lastValueVisible: false,
          priceLineVisible: false,
          lineWidth: 2
        });
      }
      ema50SeriesRef.current.setData(ema50);
    } else if (ema50SeriesRef.current) {
      chart.removeSeries(ema50SeriesRef.current);
      ema50SeriesRef.current = null;
    }

    if (showEma200 && ema200.length > 0) {
      if (!ema200SeriesRef.current) {
        ema200SeriesRef.current = chart.addSeries(LineSeries, {
          color: "#ec4899",
          title: "EMA 200",
          lastValueVisible: false,
          priceLineVisible: false,
          lineWidth: 2
        });
      }
      ema200SeriesRef.current.setData(ema200);
    } else if (ema200SeriesRef.current) {
      chart.removeSeries(ema200SeriesRef.current);
      ema200SeriesRef.current = null;
    }
  }, [showEma20, showEma50, showEma200, ema20, ema50, ema200]);

  // --- Manage Bollinger Bands Line Series ---
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (showBb && bbData.length > 0) {
      if (!bbUpperSeriesRef.current) {
        bbUpperSeriesRef.current = chart.addSeries(LineSeries, {
          color: "rgba(6, 182, 212, 0.65)",
          lineWidth: 1,
          title: "BB Upper",
          lastValueVisible: false,
          priceLineVisible: false
        });
        bbMiddleSeriesRef.current = chart.addSeries(LineSeries, {
          color: "rgba(113, 113, 122, 0.4)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          title: "BB Basis",
          lastValueVisible: false,
          priceLineVisible: false
        });
        bbLowerSeriesRef.current = chart.addSeries(LineSeries, {
          color: "rgba(6, 182, 212, 0.65)",
          lineWidth: 1,
          title: "BB Lower",
          lastValueVisible: false,
          priceLineVisible: false
        });
      }
      if (bbUpperSeriesRef.current && bbMiddleSeriesRef.current && bbLowerSeriesRef.current) {
        bbUpperSeriesRef.current.setData(bbData.map(d => ({ time: d.time, value: d.upper })));
        bbMiddleSeriesRef.current.setData(bbData.map(d => ({ time: d.time, value: d.middle })));
        bbLowerSeriesRef.current.setData(bbData.map(d => ({ time: d.time, value: d.lower })));
      }
    } else {
      if (bbUpperSeriesRef.current) {
        chart.removeSeries(bbUpperSeriesRef.current);
        bbUpperSeriesRef.current = null;
      }
      if (bbMiddleSeriesRef.current) {
        chart.removeSeries(bbMiddleSeriesRef.current);
        bbMiddleSeriesRef.current = null;
      }
      if (bbLowerSeriesRef.current) {
        chart.removeSeries(bbLowerSeriesRef.current);
        bbLowerSeriesRef.current = null;
      }
    }
  }, [showBb, bbData]);

  // --- Manage Order/Position Overlay Lines ---
  useEffect(() => {
    clearPriceLines();
    const series = seriesRef.current;
    if (!series) return;
    const colors = chartColors(theme);
    priceLinesRef.current = overlayLines.map((line) => {
      const visual = OVERLAY_LINE_VISUAL[line.tone];
      return series.createPriceLine({
        price: line.value,
        color: colors[line.tone],
        lineWidth: visual.lineWidth,
        lineStyle: visual.lineStyle,
        axisLabelVisible: true,
        title: priceLineTitle(line)
      });
    });
  }, [overlayLines, theme]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return;

    const updateMarkerPositions = () => {
      const rect = container.getBoundingClientRect();
      const positioned = visibleExecutionMarkers
        .map((marker) => {
          const chartTime = alignTimeToInterval(marker.timeMs, interval);
          const x = chart.timeScale().timeToCoordinate(chartTime as Time);
          const y = series.priceToCoordinate(marker.price);
          if (x === null || y === null) return null;
          if (x < -40 || x > rect.width + 40 || y < -40 || y > rect.height + 40) return null;
          const verticalOffset = marker.shortLabel.startsWith("B") ? 20 : -22;
          return {
            ...marker,
            x: clamp(x, 12, Math.max(12, rect.width - 12)),
            y: clamp(y + verticalOffset, 18, Math.max(18, rect.height - 18)),
            dotY: clamp(y, 8, Math.max(8, rect.height - 8))
          };
        })
        .filter((marker): marker is PositionedExecutionMarker => marker !== null);
      setExecutionMarkerPositions((current) => (
        samePositionedExecutionMarkers(current, positioned) ? current : positioned
      ));
    };

    updateMarkerPositions();
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateMarkerPositions);
    const observer = new ResizeObserver(updateMarkerPositions);
    observer.observe(container);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateMarkerPositions);
      observer.disconnect();
    };
  }, [indicatorCandles.length, interval, visibleExecutionMarkerKey]);

  useEffect(() => {
    if (!focusedExecutionMarkerId || !indicatorCandles.length) return;
    const chart = chartRef.current;
    if (!chart) return;
    const selected = executionMarkers.find((marker) => marker.id === focusedExecutionMarkerId);
    if (!selected) return;
    const intervalSeconds = intervalToMs(interval) / 1000;
    const cycleMarkers = executionMarkers.filter((marker) => marker.cycleId === selected.cycleId);
    const cycleStart = Math.min(...cycleMarkers.map((marker) => alignTimeToInterval(marker.timeMs, interval)));
    const cycleEnd = Math.max(...cycleMarkers.map((marker) => alignTimeToInterval(marker.timeMs, interval)));
    const cycleSpan = Math.max(cycleEnd - cycleStart, intervalSeconds * 28);
    const padding = Math.max(intervalSeconds * 12, cycleSpan * 0.22);
    chart.timeScale().setVisibleRange({
      from: (cycleStart - padding) as Time,
      to: (cycleEnd + padding) as Time
    });
  }, [executionMarkers, focusedExecutionMarkerId, indicatorCandles.length, interval]);

  // --- Synced RSI Sub-Chart ---
  useEffect(() => {
    if (!showRsi) {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
      return;
    }

    const container = rsiContainerRef.current;
    if (!container) return;

    const colors = chartColors(theme);
    const rsiChart = createChart(container, {
      width: container.clientWidth,
      height: 110,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair },
        horzLine: { color: colors.crosshair }
      },
      rightPriceScale: {
        borderVisible: false,
        visible: true
      },
      timeScale: {
        borderVisible: false,
        visible: false
      }
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: "#a78bfa",
      title: "RSI",
      lastValueVisible: true,
      priceLineVisible: false,
      lineWidth: 2
    });

    rsiSeries.createPriceLine({
      price: 70,
      color: "rgba(244, 63, 94, 0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Overbought (70)"
    });
    rsiSeries.createPriceLine({
      price: 30,
      color: "rgba(16, 185, 129, 0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Oversold (30)"
    });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    if (rsiData.length > 0) {
      rsiSeries.setData(rsiData);
    }

    return () => {
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
    };
  }, [showRsi, theme]);

  useEffect(() => {
    if (rsiSeriesRef.current && rsiData.length > 0) {
      rsiSeriesRef.current.setData(rsiData);
    }
  }, [rsiData]);

  // --- Synced MACD Sub-Chart ---
  useEffect(() => {
    if (!showMacd) {
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
        macdLineSeriesRef.current = null;
        macdSignalSeriesRef.current = null;
        macdHistSeriesRef.current = null;
      }
      return;
    }

    const container = macdContainerRef.current;
    if (!container) return;

    const colors = chartColors(theme);
    const macdChart = createChart(container, {
      width: container.clientWidth,
      height: 110,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshair },
        horzLine: { color: colors.crosshair }
      },
      rightPriceScale: {
        borderVisible: false,
        visible: true
      },
      timeScale: {
        borderVisible: false,
        visible: false
      }
    });

    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: "price", precision: 2 },
      lastValueVisible: false,
      priceLineVisible: false
    });

    const macdLineSeries = macdChart.addSeries(LineSeries, {
      color: "#2563eb",
      title: "MACD",
      lastValueVisible: true,
      priceLineVisible: false,
      lineWidth: 2
    });

    const macdSignalSeries = macdChart.addSeries(LineSeries, {
      color: "#ea580c",
      title: "Signal",
      lastValueVisible: true,
      priceLineVisible: false,
      lineWidth: 2
    });

    macdChartRef.current = macdChart;
    macdLineSeriesRef.current = macdLineSeries;
    macdSignalSeriesRef.current = macdSignalSeries;
    macdHistSeriesRef.current = macdHistSeries;

    if (macdData.length > 0) {
      macdLineSeries.setData(macdData.map(d => ({ time: d.time, value: d.macd })));
      macdSignalSeries.setData(macdData.map(d => ({ time: d.time, value: d.signal })));
      macdHistSeries.setData(macdData.map(d => ({
        time: d.time,
        value: d.hist,
        color: d.hist >= 0 ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"
      })));
    }

    return () => {
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
        macdLineSeriesRef.current = null;
        macdSignalSeriesRef.current = null;
        macdHistSeriesRef.current = null;
      }
    };
  }, [showMacd, theme]);

  useEffect(() => {
    if (macdLineSeriesRef.current && macdSignalSeriesRef.current && macdHistSeriesRef.current) {
      macdLineSeriesRef.current.setData(macdData.map(d => ({ time: d.time, value: d.macd })));
      macdSignalSeriesRef.current.setData(macdData.map(d => ({ time: d.time, value: d.signal })));
      macdHistSeriesRef.current.setData(macdData.map(d => ({
        time: d.time,
        value: d.hist,
        color: d.hist >= 0 ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"
      })));
    }
  }, [macdData]);

  // --- Synchronize Scroll / Zoom of main + secondary charts ---
  useEffect(() => {
    const main = chartRef.current;
    const rsi = rsiChartRef.current;
    const macd = macdChartRef.current;
    if (!main) return;

    let isSyncing = false;
    
    const sync = (source: IChartApi, targets: (IChartApi | null)[]) => {
      if (isSyncing) return;
      isSyncing = true;
      const range = source.timeScale().getVisibleLogicalRange();
      if (range) {
        for (const target of targets) {
          if (target) {
            target.timeScale().setVisibleLogicalRange(range);
          }
        }
      }
      isSyncing = false;
    };

    const onMainChange = () => sync(main, [rsi, macd]);
    const onRsiChange = rsi ? () => sync(rsi, [main, macd]) : null;
    const onMacdChange = macd ? () => sync(macd, [main, rsi]) : null;

    main.timeScale().subscribeVisibleLogicalRangeChange(onMainChange);
    if (rsi && onRsiChange) rsi.timeScale().subscribeVisibleLogicalRangeChange(onRsiChange);
    if (macd && onMacdChange) macd.timeScale().subscribeVisibleLogicalRangeChange(onMacdChange);

    // Initial sync
    sync(main, [rsi, macd]);

    return () => {
      if (main) main.timeScale().unsubscribeVisibleLogicalRangeChange(onMainChange);
      if (rsi && onRsiChange) rsi.timeScale().unsubscribeVisibleLogicalRangeChange(onRsiChange);
      if (macd && onMacdChange) macd.timeScale().unsubscribeVisibleLogicalRangeChange(onMacdChange);
    };
  }, [showRsi, showMacd]);

  // --- Synchronize Crosshairs pointers ---
  useEffect(() => {
    const main = chartRef.current;
    const rsi = rsiChartRef.current;
    const macd = macdChartRef.current;
    if (!main) return;

    const onMainMove = (param: any) => {
      const time = param.time;
      const point = param.point;
      if (!point || !time) {
        if (rsi) rsi.clearCrosshairPosition();
        if (macd) macd.clearCrosshairPosition();
        return;
      }
      if (rsi && rsiSeriesRef.current) {
        const x = rsi.timeScale().timeToCoordinate(time);
        if (x !== null) rsi.setCrosshairPosition(50, time, rsiSeriesRef.current);
      }
      if (macd && macdLineSeriesRef.current) {
        const x = macd.timeScale().timeToCoordinate(time);
        if (x !== null) macd.setCrosshairPosition(0, time, macdLineSeriesRef.current);
      }
    };
    
    main.subscribeCrosshairMove(onMainMove);

    return () => {
      if (main) main.unsubscribeCrosshairMove(onMainMove);
    };
  }, [showRsi, showMacd]);

  // --- Drawing Tools Canvas Operations ---

  const getPointFromCoords = (x: number, y: number) => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;

    const price = series.coordinateToPrice(y);
    if (price === null) return null;

    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return null;

    const index = Math.round(logical);
    const data = chartCandlesRef.current;
    if (data.length === 0) return null;

    let time: number;
    if (index < 0) {
      const diff = 0 - index;
      const intervalMs = intervalToMs(interval);
      time = Math.floor((data[0].openTime - diff * intervalMs) / 1000);
    } else if (index >= data.length) {
      const diff = index - (data.length - 1);
      const intervalMs = intervalToMs(interval);
      time = Math.floor((data[data.length - 1].openTime + diff * intervalMs) / 1000);
    } else {
      time = Math.floor(data[index].openTime / 1000);
    }

    return { time, price };
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === "cursor") return;
    const pos = getMousePos(e);
    if (!pos) return;

    // Reset active ruler on new click
    setActiveRuler(null);

    const pt = getPointFromCoords(pos.x, pos.y);
    if (!pt) return;

    if (activeTool === "trend") {
      setActiveDrawing({ type: "trend", start: pt, end: pt });
    } else if (activeTool === "horizontal") {
      setDrawings(prev => ({
        ...prev,
        horizontalLines: [...prev.horizontalLines, pt.price]
      }));
    } else if (activeTool === "brush") {
      setActiveDrawing({ type: "brush", start: pt, end: pt, stroke: [pt] });
    } else if (activeTool === "ruler") {
      setActiveDrawing({ type: "ruler", start: pt, end: pt });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDrawing) return;
    const pos = getMousePos(e);
    if (!pos) return;

    const pt = getPointFromCoords(pos.x, pos.y);
    if (!pt) return;

    if (activeDrawing.type === "trend") {
      setActiveDrawing(prev => prev ? { ...prev, end: pt } : null);
    } else if (activeDrawing.type === "brush") {
      setActiveDrawing(prev => prev ? { ...prev, stroke: [...(prev.stroke || []), pt], end: pt } : null);
    } else if (activeDrawing.type === "ruler") {
      setActiveDrawing(prev => prev ? { ...prev, end: pt } : null);
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeDrawing) return;
    const pos = getMousePos(e);
    if (!pos) {
      setActiveDrawing(null);
      return;
    }

    const pt = getPointFromCoords(pos.x, pos.y) || activeDrawing.end;

    if (activeDrawing.type === "trend") {
      setDrawings(prev => ({
        ...prev,
        trendLines: [...prev.trendLines, { start: activeDrawing.start, end: pt }]
      }));
    } else if (activeDrawing.type === "brush") {
      setDrawings(prev => ({
        ...prev,
        brushStrokes: [...prev.brushStrokes, [...(activeDrawing.stroke || []), pt]]
      }));
    } else if (activeDrawing.type === "ruler") {
      setActiveRuler({ start: activeDrawing.start, end: pt });
    }

    setActiveDrawing(null);
  };

  const drawDrawings = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!ctx || !chart || !series) return;

    // Handle high-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, rect.width, rect.height);

    const timeScale = chart.timeScale();
    const toPixels = (point: { time: number; price: number }) => {
      const x = timeScale.timeToCoordinate(point.time as Time);
      const y = series.priceToCoordinate(point.price);
      return { x, y };
    };

    const dark = theme === "dark";
    const colorTrend = dark ? "#10b981" : "#059669";
    const colorBrush = dark ? "#38bdf8" : "#0284c7";
    const colorRuler = dark ? "rgba(167, 139, 250, 0.2)" : "rgba(124, 58, 237, 0.12)";
    const colorText = dark ? "#f4f4f5" : "#18181b";

    // --- Draw Bollinger Bands area fill on Canvas ---
    if (showBb && bbData.length > 0) {
      ctx.fillStyle = dark ? "rgba(6, 182, 212, 0.04)" : "rgba(6, 182, 212, 0.025)";
      ctx.beginPath();
      let first = true;
      for (const pt of bbData) {
        const p = toPixels({ time: Number(pt.time), price: pt.upper });
        if (p.x !== null && p.y !== null) {
          if (first) {
            ctx.moveTo(p.x, p.y);
            first = false;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      for (let i = bbData.length - 1; i >= 0; i--) {
        const p = toPixels({ time: Number(bbData[i].time), price: bbData[i].lower });
        if (p.x !== null && p.y !== null) {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      ctx.fill();
    }

    // --- Trend Lines ---
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colorTrend;
    for (const line of drawings.trendLines) {
      const p1 = toPixels(line.start);
      const p2 = toPixels(line.end);
      if (p1.x !== null && p1.y !== null && p2.x !== null && p2.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    if (activeDrawing && activeDrawing.type === "trend") {
      const p1 = toPixels(activeDrawing.start);
      const p2 = toPixels(activeDrawing.end);
      if (p1.x !== null && p1.y !== null && p2.x !== null && p2.y !== null) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // --- Horizontal Lines ---
    ctx.setLineDash([4, 4]);
    for (const price of drawings.horizontalLines) {
      const y = series.priceToCoordinate(price);
      if (y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // --- Brush Strokes ---
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colorBrush;
    for (const stroke of drawings.brushStrokes) {
      ctx.beginPath();
      let first = true;
      for (const pt of stroke) {
        const p = toPixels(pt);
        if (p.x !== null && p.y !== null) {
          if (first) {
            ctx.moveTo(p.x, p.y);
            first = false;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      ctx.stroke();
    }

    if (activeDrawing && activeDrawing.type === "brush" && activeDrawing.stroke) {
      ctx.beginPath();
      let first = true;
      for (const pt of activeDrawing.stroke) {
        const p = toPixels(pt);
        if (p.x !== null && p.y !== null) {
          if (first) {
            ctx.moveTo(p.x, p.y);
            first = false;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      ctx.stroke();
    }

    // --- Ruler Boxes ---
    const drawRulerBox = (start: { time: number; price: number }, end: { time: number; price: number }) => {
      const p1 = toPixels(start);
      const p2 = toPixels(end);
      if (p1.x !== null && p1.y !== null && p2.x !== null && p2.y !== null) {
        ctx.fillStyle = colorRuler;
        ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

        ctx.strokeStyle = dark ? "#a78bfa" : "#7c3aed";
        ctx.lineWidth = 1;
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

        const priceDiff = end.price - start.price;
        const pct = (priceDiff / start.price) * 100;
        
        const startLogical = timeScale.coordinateToLogical(p1.x);
        const endLogical = timeScale.coordinateToLogical(p2.x);
        const bars = startLogical !== null && endLogical !== null ? Math.abs(Math.round(endLogical - startLogical)) : 0;

        const text = `${priceDiff > 0 ? "+" : ""}${priceDiff.toFixed(1)} (${priceDiff > 0 ? "+" : ""}${pct.toFixed(2)}%) · ${bars} bars`;
        ctx.font = "bold 11px var(--font-geist-mono), monospace";
        ctx.fillStyle = dark ? "#000000" : "#ffffff";
        
        const textWidth = ctx.measureText(text).width;
        const boxX = p2.x - textWidth / 2;
        const boxY = p2.y > p1.y ? p2.y + 10 : p2.y - 25;

        ctx.fillStyle = dark ? "rgba(24, 24, 27, 0.85)" : "rgba(255, 255, 255, 0.9)";
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";
        ctx.beginPath();
        
        // Custom round rect for retro look
        const rX = boxX - 6;
        const rY = boxY - 14;
        const rW = textWidth + 12;
        const rH = 20;
        ctx.roundRect(rX, rY, rW, rH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = dark ? "#f4f4f5" : "#18181b";
        ctx.fillText(text, boxX, boxY);
      }
    };

    if (activeDrawing && activeDrawing.type === "ruler") {
      drawRulerBox(activeDrawing.start, activeDrawing.end);
    }
    if (activeRuler) {
      drawRulerBox(activeRuler.start, activeRuler.end);
    }
  };

  // Redraw when viewport or drawing state changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const handleRange = () => {
      drawDrawings();
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    return () => {
      if (chart) chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);
    };
  }, [drawings, activeDrawing, activeRuler, showBb, bbData]);

  // Resize canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      drawDrawings();
    };

    resizeCanvas();
    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [drawings, activeDrawing, activeRuler, showBb, bbData, chartHeight]);

  const clearAllDrawings = () => {
    setDrawings({ trendLines: [], horizontalLines: [], brushStrokes: [] });
    setActiveRuler(null);
    setActiveDrawing(null);
  };

  function clearPriceLines() {
    const series = seriesRef.current;
    if (!series) {
      priceLinesRef.current = [];
      return;
    }
    for (const line of priceLinesRef.current) {
      series.removePriceLine(line);
    }
    priceLinesRef.current = [];
  }

  function zoom(multiplier: number) {
    const chart = chartRef.current;
    const range = chart?.timeScale().getVisibleLogicalRange();
    if (!chart || !range) return;
    const center = (range.from + range.to) / 2;
    const half = ((range.to - range.from) * multiplier) / 2;
    chart.timeScale().setVisibleLogicalRange({ from: center - half, to: center + half });
  }

  function pan(deltaBars: number) {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().scrollToPosition(chart.timeScale().scrollPosition() + deltaBars, true);
  }

  function resetView() {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().resetTimeScale();
    chart.timeScale().scrollToRealTime();
  }

  function setDrawingToolsVisible(nextVisible: boolean) {
    if (!nextVisible) {
      setActiveTool("cursor");
      setActiveRuler(null);
      setActiveDrawing(null);
    }
    setShowDrawingTools(nextVisible);
  }

  return (
    <section className={`panel overflow-hidden ${compact ? "p-4" : "p-5"}`}>
      {/* Top Header Section */}
      <div className={`${compact ? "mb-2 sm:mb-3" : "mb-3 sm:mb-4"} flex flex-col gap-2 sm:gap-3 xl:flex-row xl:items-start xl:justify-between`}>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ActivityIcon size={18} />
            <h2 className="text-lg font-semibold">{t("chart.title")}</h2>
          </div>
          <p className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:block">
            {symbol} · {interval} · {t("chart.liveSource")}
          </p>
        </div>
        <div data-testid="chart-market-status" className="flex flex-wrap justify-start gap-2 xl:justify-end">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/70 sm:px-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{t("chart.marketPrice")}</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {marketPrice !== null ? formatter.format(marketPrice) : "-"}
              </span>
              <span
                className={`font-mono text-xs font-semibold ${
                  dayChangePct === null
                    ? "text-zinc-400"
                    : dayChangePct >= 0
                      ? "text-emerald-500"
                      : "text-rose-500"
                }`}
              >
                {dayChangePct === null
                  ? t("chart.dayChangeUnavailable")
                  : `${dayChangePct >= 0 ? "+" : ""}${percentFormatter.format(dayChangePct)}%`}
              </span>
            </div>
          </div>
          <StatusBadge tone={connected ? "good" : "neutral"}>
            {connected ? <WifiHigh size={14} /> : <WifiSlash size={14} />}
            {connected ? t("chart.connected") : t("chart.disconnected")}
          </StatusBadge>
          {loading || loadingOlder ? <StatusBadge tone="neutral">{loadingOlder ? t("chart.loadingHistory") : t("common.loading")}</StatusBadge> : null}
        </div>
      </div>

      {/* Top Chart Toolbar (Indicators, Tools, Navigation) */}
      <div className="mb-3 flex min-w-0 items-center gap-2 overflow-x-auto border-b border-zinc-200/50 pb-3 scrollbar-none dark:border-zinc-800/50 lg:flex-row lg:justify-between lg:overflow-visible">
        
        {/* Timeframe & Indicators */}
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-none lg:flex-wrap lg:overflow-visible lg:pb-0">
          {/* Timeframes */}
          <div className="flex shrink-0 gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-950/60">
            {TIMEFRAMES.map((item) => (
              <button
                key={item}
                className={`shrink-0 rounded px-2.5 py-1 text-[11px] font-bold uppercase transition ${
                  interval === item
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-500 hover:bg-white dark:text-zinc-400 dark:hover:bg-zinc-800/80"
                }`}
                onClick={() => setInterval(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

          {/* Indicators dropdown buttons */}
          <div className="hidden shrink-0 gap-1 sm:flex lg:flex-wrap">
            <IndicatorToggle active={showEma20} onClick={() => setShowEma20(p => !p)} label="EMA 20" />
            <IndicatorToggle active={showEma50} onClick={() => setShowEma50(p => !p)} label="EMA 50" />
            <IndicatorToggle active={showEma200} onClick={() => setShowEma200(p => !p)} label="EMA 200" />
            <IndicatorToggle active={showBb} onClick={() => setShowBb(p => !p)} label="BB" />
            <IndicatorToggle active={showRsi} onClick={() => setShowRsi(p => !p)} label="RSI" />
            <IndicatorToggle active={showMacd} onClick={() => setShowMacd(p => !p)} label="MACD" />
          </div>
        </div>

        {/* Tools and navigation */}
        <div className="flex shrink-0 items-center gap-2 pb-1 lg:flex-wrap lg:justify-end lg:pb-0">
          <button
            type="button"
            data-testid="chart-tool-toggle"
            aria-controls="chart-drawing-toolbar"
            aria-expanded={showDrawingTools}
            onClick={() => setDrawingToolsVisible(!showDrawingTools)}
            className={`focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
              showDrawingTools
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-white hover:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400 dark:hover:bg-zinc-900/70 dark:hover:text-zinc-200"
            }`}
          >
            {showDrawingTools ? <EyeSlash size={14} /> : <Eye size={14} />}
            {showDrawingTools ? t("chart.hideTools") : t("chart.showTools")}
          </button>

          <div className="h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800 mx-1" />

          {/* Standard Navigation Toggles */}
          <div className="flex shrink-0 gap-0.5">
            <ChartButton label={t("chart.panLeft")} onClick={() => pan(24)}>
              <CaretLeft size={14} />
            </ChartButton>
            <ChartButton label={t("chart.panRight")} onClick={() => pan(-24)}>
              <CaretRight size={14} />
            </ChartButton>
            <ChartButton label={t("chart.zoomIn")} onClick={() => zoom(0.72)}>
              <MagnifyingGlassPlus size={14} />
            </ChartButton>
            <ChartButton label={t("chart.zoomOut")} onClick={() => zoom(1.38)}>
              <MagnifyingGlassMinus size={14} />
            </ChartButton>
            <ChartButton label={t("chart.resetView")} onClick={resetView}>
              <ArrowsOutSimple size={14} />
            </ChartButton>
          </div>
        </div>
      </div>

      {/* Main Workspace: Optional tools + Canvas / Chart sync boxes */}
      <div className="flex min-w-0 gap-2 sm:gap-3">
        
        {showDrawingTools ? (
        <div
          id="chart-drawing-toolbar"
          data-testid="chart-drawing-toolbar"
          aria-label={t("chart.drawingTools")}
          className="flex shrink-0 flex-col gap-1 self-start rounded-xl border border-zinc-200 bg-zinc-50/50 p-1.5 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/60"
        >
          <SidebarButton
            active={activeTool === "cursor"}
            onClick={() => {
              setActiveTool("cursor");
              setActiveRuler(null);
            }}
            title={t("chart.cursorTool")}
          >
            <Cursor size={16} weight={activeTool === "cursor" ? "fill" : "regular"} />
          </SidebarButton>
          <SidebarButton
            active={activeTool === "trend"}
            onClick={() => setActiveTool("trend")}
            title={t("chart.trendTool")}
          >
            <span className="font-bold text-sm select-none leading-none inline-block -rotate-12 h-4 w-4 text-center">╱</span>
          </SidebarButton>
          <SidebarButton
            active={activeTool === "horizontal"}
            onClick={() => setActiveTool("horizontal")}
            title={t("chart.horizontalTool")}
          >
            <Minus size={16} weight="bold" />
          </SidebarButton>
          <SidebarButton
            active={activeTool === "brush"}
            onClick={() => setActiveTool("brush")}
            title={t("chart.brushTool")}
          >
            <PencilSimple size={16} weight={activeTool === "brush" ? "fill" : "regular"} />
          </SidebarButton>
          <SidebarButton
            active={activeTool === "ruler"}
            onClick={() => setActiveTool("ruler")}
            title={t("chart.rulerTool")}
          >
            <Ruler size={16} weight={activeTool === "ruler" ? "fill" : "regular"} />
          </SidebarButton>
          
          <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1 w-full" />
          
          <SidebarButton
            active={false}
            onClick={clearAllDrawings}
            title={t("chart.clearDrawings")}
            className="text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300"
          >
            <Trash size={16} />
          </SidebarButton>
        </div>
        ) : null}

        {/* Sync Chart stack */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Candlestick Main Frame */}
          <div className="relative w-full overflow-visible">
            <div ref={containerRef} className="w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70" style={{ height: chartHeight }} />
            {showInitialChartSpinner ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/70 backdrop-blur-[2px] dark:bg-zinc-950/55" role="status" aria-live="polite">
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white/90 px-5 py-4 text-center text-zinc-700 shadow-lg shadow-zinc-950/10 dark:border-zinc-800 dark:bg-[#080b0a]/90 dark:text-zinc-200">
                  <CircleNotch className="animate-spin text-emerald-500 dark:text-emerald-300" size={28} weight="bold" />
                  <span className="text-xs font-bold">{t("chart.loadingHistory")}</span>
                </div>
              </div>
            ) : null}
            
            {/* Transparent overlay drawing canvas */}
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 z-20 h-full w-full"
              aria-hidden={!showDrawingTools || activeTool === "cursor"}
              style={{
                pointerEvents: showDrawingTools && activeTool !== "cursor" ? "auto" : "none",
                cursor: showDrawingTools && activeTool !== "cursor" ? "crosshair" : "default",
                touchAction: showDrawingTools && activeTool !== "cursor" ? "none" : "auto"
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
            <div
              className="pointer-events-none absolute inset-0 z-30"
            >
              {executionMarkerPositions.map((marker) => (
                <ExecutionChartMarker
                  key={marker.id}
                  marker={marker}
                  active={marker.id === activeExecutionMarkerId}
                  selected={marker.cycleId === selectedExecutionCycleId}
                  interactive={!showDrawingTools || activeTool === "cursor"}
                  t={t}
                  onActivate={setActiveExecutionMarkerId}
                  onSelect={onExecutionMarkerSelect}
                />
              ))}
            </div>
          </div>

          {/* RSI Pane */}
          {showRsi && (
            <div className="relative w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 p-1 animate-fade-in">
              <div className="absolute top-2 left-4 text-[10px] font-bold font-mono z-10 text-zinc-500 uppercase tracking-wider">RSI (14)</div>
              <div ref={rsiContainerRef} className="w-full" style={{ height: 110 }} />
            </div>
          )}

          {/* MACD Pane */}
          {showMacd && (
            <div className="relative w-full rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70 p-1 animate-fade-in">
              <div className="absolute top-2 left-4 text-[10px] font-bold font-mono z-10 text-zinc-500 uppercase tracking-wider">MACD (12, 26, 9)</div>
              <div ref={macdContainerRef} className="w-full" style={{ height: 110 }} />
            </div>
          )}
        </div>
      </div>

      {/* Legend & hints */}
      <div className="mt-3 flex max-h-16 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto pr-1 text-xs text-zinc-500 dark:text-zinc-400 sm:max-h-none sm:overflow-visible">
        <Legend color="bg-amber-400" label={t("chart.entry")} />
        <Legend color="bg-sky-400" label={t("chart.averageEntry")} />
        <Legend color="bg-violet-400" label={t("chart.order")} />
        <Legend color="bg-rose-400" label={t("chart.stopLoss")} />
        <Legend color="bg-emerald-400" label={t("chart.takeProfit")} />
        <Legend color="bg-teal-500" label={t("chart.completedMarkers")} />
        {activeTool !== "cursor" ? (
          <span className="text-emerald-500 font-semibold animate-pulse">
            {t("chart.activeTool")}: {activeToolLabel(activeTool, t)}
          </span>
        ) : (
          <span>{t("chart.interactionHint")}</span>
        )}
        {!overlayLines.length ? <span>{t("chart.waitingForPlan")}</span> : null}
      </div>
      {error ? <p className="mt-3 text-xs leading-5 text-rose-600 dark:text-rose-300">{error}</p> : null}
    </section>
  );
}

// --- Helper UI Components ---

function ExecutionChartMarker({
  marker,
  active,
  selected,
  interactive,
  t,
  onActivate,
  onSelect
}: {
  marker: PositionedExecutionMarker;
  active: boolean;
  selected: boolean;
  interactive: boolean;
  t: (key: string) => string;
  onActivate: (markerId: string | null) => void;
  onSelect?: (markerId: string) => void;
}) {
  const tooltipAbove = marker.y > 160;
  const pointerStartRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const suppressClickUntilRef = useRef(0);

  const suppressClickBriefly = () => {
    suppressClickUntilRef.current = Date.now() + 300;
  };
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  };
  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) suppressClickBriefly();
  };
  const handlePointerUp = () => {
    pointerStartRef.current = null;
  };
  const handleWheel = (_event: WheelEvent<HTMLButtonElement>) => {
    suppressClickBriefly();
  };
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (Date.now() < suppressClickUntilRef.current) {
      event.preventDefault();
      return;
    }
    onSelect?.(marker.id);
  };

  return (
    <div
      className={`absolute ${active ? "z-50" : selected ? "z-40" : "z-30"} ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ left: marker.x, top: marker.y, transform: "translate(-50%, -50%)" }}
    >
      <span
        className={`pointer-events-none absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_3px_rgba(0,0,0,0.35)] ${markerDotClass(marker)}`}
        style={{ top: marker.dotY - marker.y }}
        aria-hidden
      />
      <button
        type="button"
        className={`focus-ring relative z-10 rounded-md border px-2 py-1 font-mono text-[10px] font-black leading-none shadow-lg shadow-zinc-950/20 transition ${
          markerButtonClass(marker, selected)
        }`}
        onMouseEnter={() => onActivate(marker.id)}
        onMouseLeave={() => onActivate(null)}
        onFocus={() => onActivate(marker.id)}
        onBlur={() => onActivate(null)}
        onTouchStart={() => onActivate(marker.id)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheelCapture={handleWheel}
        onClick={handleClick}
        aria-label={`${marker.markerLabel} ${marker.priceLabel}`}
      >
        {marker.shortLabel}
      </button>
      {active ? (
        <div
          className={`absolute left-1/2 z-[60] w-60 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 p-3 text-left shadow-2xl shadow-zinc-950/20 backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95 ${
            tooltipAbove ? "bottom-full mb-2" : "top-full mt-2"
          }`}
          role="tooltip"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`truncate text-xs font-bold ${markerTextTone(marker)}`}>{marker.markerLabel}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">{marker.eventTimeLabel}</p>
            </div>
            <span className={`shrink-0 rounded-md px-1.5 py-1 font-mono text-[10px] font-black ${markerBadgeClass(marker)}`}>
              {marker.sideLabel}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <TooltipMetric label={t("detail.markerExecutedAt")} value={marker.eventTimeLabel} />
            <TooltipMetric label={t("detail.markerEnteredAt")} value={marker.entryTimeLabel ?? "-"} />
            <TooltipMetric label={t("common.price")} value={marker.priceLabel} mono />
            <TooltipMetric label={t("common.quantity")} value={marker.quantityLabel ?? "-"} mono />
            <TooltipMetric label={t("common.pnl")} value={marker.pnlLabel ?? "-"} valueClass={pnlValueClass(marker.pnlTone)} mono />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TooltipMetric({
  label,
  value,
  valueClass = "text-zinc-950 dark:text-zinc-50",
  mono = false
}: {
  label: string;
  value: string;
  valueClass?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold text-zinc-400">{label}</p>
      <p className={`mt-0.5 truncate text-[11px] font-semibold ${mono ? "font-mono" : ""} ${valueClass}`}>{value}</p>
    </div>
  );
}

function activeToolLabel(tool: "cursor" | "trend" | "horizontal" | "brush" | "ruler", t: (key: string) => string) {
  switch (tool) {
    case "trend":
      return t("chart.trendTool");
    case "horizontal":
      return t("chart.horizontalTool");
    case "brush":
      return t("chart.brushTool");
    case "ruler":
      return t("chart.rulerTool");
    case "cursor":
    default:
      return t("chart.cursorTool");
  }
}

function IndicatorToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase transition ${
        active
          ? "bg-emerald-500/25 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-500/35"
          : "border border-zinc-200/80 bg-zinc-50 text-zinc-500 hover:bg-white hover:text-zinc-800 dark:border-zinc-800/80 dark:bg-zinc-950/30 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-200"
      }`}
      type="button"
    >
      {label}
    </button>
  );
}

function SidebarButton({
  active,
  onClick,
  children,
  title,
  className = ""
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex size-8 items-center justify-center rounded-lg transition duration-200 ${
        active
          ? "bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.35)]"
          : `text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800/80 ${className}`
      }`}
      type="button"
      aria-label={title}
    >
      {children}
    </button>
  );
}

function ChartButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="ghost-button px-2 py-1.5 shrink-0" onClick={onClick} title={label} type="button" aria-label={label}>
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      <span className={`h-2 w-5 shrink-0 rounded-full ${color}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

// --- Helper Data / Formatters ---

function toChartCandle(candle: KlineCandle): CandlestickData<Time> {
  return {
    time: Math.floor(candle.openTime / 1000) as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  };
}

function okxKlineToChartCandle(row: unknown[], interval: ChartInterval): CandlestickData<Time> {
  const candle = okxKlineToApiCandle(row, interval);
  return {
    time: Math.floor(candle.openTime / 1000) as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  };
}

function okxKlineToApiCandle(row: unknown[], interval: ChartInterval): KlineCandle {
  const openTime = Number(row[0]);
  const intervalMs = intervalToMs(interval);
  return {
    openTime,
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[6] ?? row[5]),
    closeTime: Number.isFinite(openTime) ? openTime + intervalMs - 1 : openTime
  };
}

function mergeCandleHistory(primary: KlineCandle[], secondary: KlineCandle[], maxCandles: number) {
  const byOpenTime = new Map<number, KlineCandle>();
  for (const candle of [...primary, ...secondary]) {
    if (!Number.isFinite(candle.openTime)) continue;
    byOpenTime.set(candle.openTime, { ...candle });
  }
  return Array.from(byOpenTime.values())
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-maxCandles);
}

function okxCandleChannel(interval: ChartInterval) {
  const suffix: Record<ChartInterval, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1w": "1W"
  };
  return `candle${suffix[interval]}`;
}

function okxInstrumentId(symbol: string) {
  const normalized = symbol.toUpperCase();
  if (normalized === "ETHUSDT") return "ETH-USDT-SWAP";
  return "BTC-USDT-SWAP";
}

function intervalToMs(interval: ChartInterval) {
  const minutes: Record<ChartInterval, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
    "1w": 10080
  };
  return minutes[interval] * 60_000;
}

function setLatestVisibleRange(chart: IChartApi, candleCount: number, interval: ChartInterval) {
  const range = latestVisibleLogicalRange(candleCount, interval);
  if (range) {
    chart.timeScale().setVisibleLogicalRange(range);
  } else {
    chart.timeScale().fitContent();
  }
}

function alignTimeToInterval(timeMs: number, interval: ChartInterval) {
  const intervalMs = intervalToMs(interval);
  return Math.floor(timeMs / intervalMs) * (intervalMs / 1000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function samePositionedExecutionMarkers(left: readonly PositionedExecutionMarker[], right: readonly PositionedExecutionMarker[]) {
  if (left.length !== right.length) return false;
  return left.every((marker, index) => {
    const next = right[index];
    return Boolean(next) &&
      marker.id === next.id &&
      marker.cycleId === next.cycleId &&
      marker.shortLabel === next.shortLabel &&
      Math.abs(marker.x - next.x) < 0.5 &&
      Math.abs(marker.y - next.y) < 0.5 &&
      Math.abs(marker.dotY - next.dotY) < 0.5;
  });
}

function markerButtonClass(marker: ExecutionMarker, selected: boolean) {
  const selectedRing = selected ? "ring-2 ring-white/80 dark:ring-zinc-950" : "";
  if (marker.tone === "longEntry" || marker.tone === "profitExit") {
    return `border-emerald-300/80 bg-emerald-400 text-zinc-950 hover:bg-emerald-300 ${selectedRing}`;
  }
  if (marker.tone === "shortEntry" || marker.tone === "lossExit") {
    return `border-rose-300/80 bg-rose-400 text-white hover:bg-rose-300 ${selectedRing}`;
  }
  return `border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${selectedRing}`;
}

function markerDotClass(marker: ExecutionMarker) {
  if (marker.shortLabel.startsWith("B")) return "border-emerald-950 bg-emerald-300";
  return "border-rose-950 bg-rose-300";
}

function markerBadgeClass(marker: ExecutionMarker) {
  if (marker.sideLabel === "LONG") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (marker.sideLabel === "SHORT") return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  return "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400";
}

function markerTextTone(marker: ExecutionMarker) {
  if (marker.tone === "longEntry" || marker.tone === "profitExit") return "text-emerald-700 dark:text-emerald-300";
  if (marker.tone === "shortEntry" || marker.tone === "lossExit") return "text-rose-700 dark:text-rose-300";
  return "text-zinc-700 dark:text-zinc-200";
}

function pnlValueClass(tone: ExecutionMarker["pnlTone"]) {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-300";
  if (tone === "bad") return "text-rose-600 dark:text-rose-300";
  return "text-zinc-500 dark:text-zinc-400";
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function matchesChartSymbol(value: unknown, symbol: string) {
  return !value || String(value).toUpperCase() === symbol.toUpperCase();
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, any> : null;
}

function chartTimeValue(openTime: unknown) {
  const value = typeof openTime === "number" ? openTime : typeof openTime === "string" ? Number(openTime) : NaN;
  return Number.isFinite(value) ? Math.floor(value / 1000) : null;
}

function shouldRenderPlanLines(
  plan: TradePlanView | null,
  hasOpenPaperPosition: boolean,
  hasOpenPaperOrder: boolean,
  isFreshRunCycleResult: boolean
): plan is TradePlanView {
  if (!plan) return false;
  const status = plan.status ?? "PAPER_TRADING_PENDING";
  if (status !== "PAPER_TRADING_PENDING") return false;
  if (hasOpenPaperPosition) return false;
  if (hasOpenPaperOrder) return false;
  return isFreshRunCycleResult;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function takeProfitState({
  exposureKind = "position",
  side,
  targetPrice,
  latestPrice,
  completed,
  t
}: {
  exposureKind?: "plan" | "order" | "position" | "event";
  side?: unknown;
  targetPrice: unknown;
  latestPrice: unknown;
  completed?: unknown;
  t: (key: string) => string;
}): { label: string; tone: OverlayTone } {
  if (shouldMarkTakeProfitCompleted({ exposureKind, side, targetPrice, latestPrice, completed })) {
    return { label: t("detail.takeProfitCompleted"), tone: "takeProfitDone" };
  }
  return { label: t("chart.takeProfit"), tone: "takeProfit" };
}

function chartColors(theme: "dark" | "light") {
  const dark = theme === "dark";
  return {
    background: dark ? "#09090b" : "#surface",
    text: dark ? "#d4d4d8" : "#52525b",
    grid: dark ? "rgba(63,63,70,0.18)" : "rgba(212,212,216,0.38)",
    crosshair: dark ? "rgba(212,212,216,0.4)" : "rgba(82,82,91,0.3)",
    up: "#10b981",
    down: "#f43f5e",
    entry: "#f59e0b",
    position: "#38bdf8",
    order: "#a78bfa",
    stop: "#fb7185",
    takeProfit: "#34d399",
    takeProfitDone: "#0f766e",
    stopDone: "#be123c"
  };
}
