"use client";

import {
  ActivityIcon,
  ArrowsOutSimple,
  CaretLeft,
  CaretRight,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  WifiHigh,
  WifiSlash
} from "@phosphor-icons/react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCachedKlines, getKlines, updateKlineCache, type KlineCandle, type ManagementReview, type PaperOrder, type PaperPosition, type PaperTradeEvent, type RunCycleResult } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { buildRealizedEventOverlayLines } from "@/components/trader-profile-detail/chart-realized-overlays";
import { StatusBadge } from "@/components/status-badge";
import {
  CACHED_CANDLES_VISIBLE_MS,
  candleLimitForInterval,
  restBackfillCandleLimit,
  restCacheStaleMs,
  restFallbackIntervalMs,
  shouldAcceptRealtimeCandle,
  shouldBackfillFromRest,
  socketFreshWindowMs,
  type ChartInterval
} from "@/components/live-candle-chart-data";
import { compactOverlayLines, isOpenChartExposure, latestManagedStopLoss, overlaySideLabel, priceLineTitle, shouldMarkTakeProfitCompleted, type OverlayLine, type OverlayTone } from "@/components/live-candle-chart-overlays";

type TradePlanView = {
  status?: string;
  side?: string | null;
  entries?: Array<{ price: number; weight: number; reason: string }>;
  stopLoss?: number | null;
  takeProfits?: Array<{ price: number; weight: number; reason: string }>;
};
type ChartResultView = RunCycleResult | Pick<RunCycleResult, "tradePlan">;

const TIMEFRAMES: ChartInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const DEFAULT_INTERVAL: ChartInterval = "1h";
const DEFAULT_INTERVAL_LIMIT = { "1h": 120 } as const;
const OVERLAY_LINE_VISUAL = {
  entry: { lineWidth: 1, lineStyle: LineStyle.Dotted },
  stop: { lineWidth: 1, lineStyle: LineStyle.Dashed },
  takeProfit: { lineWidth: 1, lineStyle: LineStyle.Dashed },
  position: { lineWidth: 1, lineStyle: LineStyle.Solid },
  order: { lineWidth: 1, lineStyle: LineStyle.Dotted },
  takeProfitDone: { lineWidth: 1, lineStyle: LineStyle.Solid },
  stopDone: { lineWidth: 1, lineStyle: LineStyle.Solid }
} as const;

export function LiveCandleChart({
  symbol,
  result,
  paperPositions = [],
  paperOrders = [],
  paperEvents = [],
  managementReviews = [],
  height = 420,
  compact = false
}: {
  symbol: string;
  result: ChartResultView | null;
  paperPositions?: Array<PaperPosition | Record<string, any>>;
  paperOrders?: Array<PaperOrder | Record<string, any>>;
  paperEvents?: Array<PaperTradeEvent | Record<string, any>>;
  managementReviews?: Array<ManagementReview | Record<string, any>>;
  height?: number;
  compact?: boolean;
}) {
  const { t, theme } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const hasVisibleCandlesRef = useRef(false);
  const lastSocketUpdateAtRef = useRef(0);
  const lastCandleTimeRef = useRef<number | null>(null);
  const visibleSymbolRef = useRef<string | null>(null);
  const [interval, setInterval] = useState<ChartInterval>(DEFAULT_INTERVAL);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        maximumFractionDigits: symbol.startsWith("ETH") ? 2 : 1,
        minimumFractionDigits: symbol.startsWith("ETH") ? 2 : 1
      }),
    [symbol]
  );

  const visibleOpenPaperPositions = useMemo(
    () => paperPositions.filter((position) => matchesChartSymbol(position.symbol, symbol) && isOpenChartExposure(position)),
    [paperPositions, symbol]
  );
  const visibleOpenPaperOrders = useMemo(
    () => paperOrders.filter((order) => matchesChartSymbol(order.symbol, symbol) && isOpenChartExposure(order) && !isSyntheticPaperOrder(order)),
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
        const target = takeProfitState({ side: position.side, targetPrice: takeProfit, latestPrice, t });
        lines.push({ value: takeProfit, label: target.label, tone: target.tone });
      }
      for (const [targetIndex, target] of asArray<Record<string, any>>(position.takeProfits ?? position.take_profits).entries()) {
        const price = firstFiniteNumber(target?.price, target?.targetPrice);
        if (price !== null) {
          const targetState = takeProfitState({ side: position.side, targetPrice: price, latestPrice, t });
          lines.push({ value: price, label: `${t("chart.position")} ${targetState.label} ${targetIndex + 1}`, tone: targetState.tone });
        }
      }
    }

    for (const [index, order] of visibleOpenPaperOrders.entries()) {
      const payload = recordValue(order.payload);
      const orderPrice = firstFiniteNumber(order.limitPrice, order.price, order.stopPrice, order.triggerPrice);
      if (orderPrice !== null) {
        const side = overlaySideLabel(order.side);
        lines.push({ value: orderPrice, label: side ? `${t("chart.order")} ${side}` : `${t("chart.order")} ${index + 1}`, tone: "order" });
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
    lines.push(...buildRealizedEventOverlayLines({ events: paperEvents, symbol, t }));
    return compactOverlayLines(lines);
  }, [hasOpenPaperOrder, hasOpenPaperPosition, isFreshRunCycleResult, latestPrice, managementReviews, paperEvents, result, symbol, t, visibleOpenPaperOrders, visibleOpenPaperPositions]);
  const hasCompletedMarkers = overlayLines.some((line) => line.tone === "takeProfitDone" || line.tone === "stopDone");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const colors = chartColors(theme);
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
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
        scaleMargins: { top: 0.12, bottom: 0.16 }
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

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      priceLinesRef.current = [];
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [formatter, height, theme]);

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

  useEffect(() => {
    let disposed = false;
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const limit = interval === DEFAULT_INTERVAL ? DEFAULT_INTERVAL_LIMIT["1h"] : candleLimitForInterval(interval);
    const cached = getCachedKlines(symbol, interval, limit, CACHED_CANDLES_VISIBLE_MS);
    const cachedCandles = cached?.candles ?? [];
    const hasCachedCandles = cachedCandles.length > 0;
    const shouldPreserveVisible = !hasCachedCandles && visibleSymbolRef.current === symbol && hasVisibleCandlesRef.current;

    setError(null);
    setConnected(false);
    setLoading(true);
    hasVisibleCandlesRef.current = hasCachedCandles || shouldPreserveVisible;
    lastSocketUpdateAtRef.current = 0;

    if (hasCachedCandles) {
      series.setData(cachedCandles.map(toChartCandle));
      lastCandleTimeRef.current = chartTimeValue(cachedCandles.at(-1)?.openTime);
      visibleSymbolRef.current = symbol;
      setLatestPrice(cachedCandles.at(-1)?.close ?? null);
      chart.timeScale().fitContent();
    } else if (!shouldPreserveVisible) {
      series.setData([]);
      lastCandleTimeRef.current = null;
      visibleSymbolRef.current = null;
      setLatestPrice(null);
    }

    const refreshFromRest = async ({ fit = false, staleMs = restCacheStaleMs(interval) } = {}) => {
      if (!hasVisibleCandlesRef.current) setLoading(true);
      try {
        const data = await getKlines(symbol, interval, limit, { staleMs });
        if (disposed) return;
        const chartData = data.candles.map(toChartCandle);
        if (chartData.length || !hasVisibleCandlesRef.current) {
          series.setData(chartData);
          hasVisibleCandlesRef.current = chartData.length > 0;
          lastCandleTimeRef.current = chartData.length ? Number(chartData.at(-1)?.time) : null;
          visibleSymbolRef.current = chartData.length ? symbol : visibleSymbolRef.current;
          setLatestPrice(data.candles.at(-1)?.close ?? null);
          if (chartData.length && fit) chart.timeScale().fitContent();
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
        const chartData = candles.map(toChartCandle);
        if (chartData.length) {
          series.setData(chartData);
          hasVisibleCandlesRef.current = true;
          lastCandleTimeRef.current = Number(chartData.at(-1)?.time);
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

    void refreshFromRest({ fit: !hasCachedCandles });
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

    const socket = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`);
    socket.onopen = () => {
      if (!disposed) setConnected(true);
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const kline = data.k;
        if (!kline || disposed) return;
        const next = klineToChartCandle(kline);
        if (!shouldAcceptRealtimeCandle({ candidateTime: Number(next.time), lastCandleTime: lastCandleTimeRef.current })) return;
        updateKlineCache(symbol, interval, limit, klineToApiCandle(kline));
        lastSocketUpdateAtRef.current = Date.now();
        lastCandleTimeRef.current = Number(next.time);
        visibleSymbolRef.current = symbol;
        hasVisibleCandlesRef.current = true;
        series.update(next);
        setLoading(false);
        const close = Number(kline.c);
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
      socket.close();
    };
  }, [interval, symbol, t]);

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

  return (
    <section className={`panel overflow-hidden ${compact ? "p-4" : "p-5"}`}>
      <div className={`${compact ? "mb-3" : "mb-4"} flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between`}>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ActivityIcon size={18} />
            <h2 className="text-lg font-semibold">{t("chart.title")}</h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {symbol} · {interval} · {t("chart.liveSource")}
          </p>
        </div>
        <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
          <StatusBadge tone={connected ? "good" : "neutral"}>
            {connected ? <WifiHigh size={14} /> : <WifiSlash size={14} />}
            {connected ? t("chart.connected") : t("chart.disconnected")}
          </StatusBadge>
          {loading ? <StatusBadge tone="neutral">{t("common.loading")}</StatusBadge> : null}
          {latestPrice ? <StatusBadge tone="neutral">{`${t("chart.lastPrice")} ${formatter.format(latestPrice)}`}</StatusBadge> : null}
          {overlayLines.length ? <StatusBadge tone="warn">{t("chart.planMarkers")}</StatusBadge> : null}
          {hasCompletedMarkers ? <StatusBadge tone="good">{t("chart.completedMarkers")}</StatusBadge> : null}
          {paperPositions.length || paperOrders.length ? <StatusBadge tone="warn">{t("chart.paperMarkers")}</StatusBadge> : null}
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-950/60">
          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                interval === item
                  ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
              onClick={() => setInterval(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <ChartButton label={t("chart.panLeft")} onClick={() => pan(24)}>
            <CaretLeft size={15} />
          </ChartButton>
          <ChartButton label={t("chart.panRight")} onClick={() => pan(-24)}>
            <CaretRight size={15} />
          </ChartButton>
          <ChartButton label={t("chart.zoomIn")} onClick={() => zoom(0.72)}>
            <MagnifyingGlassPlus size={15} />
          </ChartButton>
          <ChartButton label={t("chart.zoomOut")} onClick={() => zoom(1.38)}>
            <MagnifyingGlassMinus size={15} />
          </ChartButton>
          <ChartButton label={t("chart.resetView")} onClick={resetView}>
            <ArrowsOutSimple size={15} />
          </ChartButton>
        </div>
      </div>

      <div ref={containerRef} className="w-full rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70" style={{ height }} />

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <Legend color="bg-amber-400" label={t("chart.entry")} />
        <Legend color="bg-sky-400" label={t("chart.averageEntry")} />
        <Legend color="bg-violet-400" label={t("chart.order")} />
        <Legend color="bg-rose-400" label={t("chart.stopLoss")} />
        <Legend color="bg-emerald-400" label={t("chart.takeProfit")} />
        <Legend color="bg-teal-500" label={t("chart.completedMarkers")} />
        <span>{t("chart.interactionHint")}</span>
        {!overlayLines.length ? <span>{t("chart.waitingForPlan")}</span> : null}
      </div>
      {error ? <p className="mt-3 text-xs leading-5 text-rose-600 dark:text-rose-300">{error}</p> : null}
    </section>
  );
}

function ChartButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="ghost-button px-2.5 py-2" onClick={onClick} title={label} type="button" aria-label={label}>
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

function toChartCandle(candle: KlineCandle): CandlestickData<Time> {
  return {
    time: Math.floor(candle.openTime / 1000) as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  };
}

function klineToChartCandle(kline: Record<string, string | number | boolean>): CandlestickData<Time> {
  return {
    time: Math.floor(Number(kline.t) / 1000) as Time,
    open: Number(kline.o),
    high: Number(kline.h),
    low: Number(kline.l),
    close: Number(kline.c)
  };
}

function klineToApiCandle(kline: Record<string, string | number | boolean>): KlineCandle {
  const openTime = Number(kline.t);
  const closeTime = Number(kline.T);
  return {
    openTime,
    open: Number(kline.o),
    high: Number(kline.h),
    low: Number(kline.l),
    close: Number(kline.c),
    volume: Number(kline.v),
    closeTime: Number.isFinite(closeTime) ? closeTime : openTime
  };
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function isSyntheticPaperOrder(order: Record<string, any>) {
  const id = order.id === null || order.id === undefined ? "" : String(order.id);
  return id.startsWith("plan-") || recordValue(order.payload)?.syntheticPlanOrder === true;
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
  t
}: {
  exposureKind?: "plan" | "order" | "position" | "event";
  side?: unknown;
  targetPrice: unknown;
  latestPrice: unknown;
  t: (key: string) => string;
}): { label: string; tone: OverlayTone } {
  if (shouldMarkTakeProfitCompleted({ exposureKind, side, targetPrice, latestPrice })) {
    return { label: t("detail.takeProfitCompleted"), tone: "takeProfitDone" };
  }
  return { label: t("chart.takeProfit"), tone: "takeProfit" };
}

function chartColors(theme: "dark" | "light") {
  const dark = theme === "dark";
  return {
    background: dark ? "#09090b" : "#fafafa",
    text: dark ? "#d4d4d8" : "#52525b",
    grid: dark ? "rgba(63,63,70,0.46)" : "rgba(212,212,216,0.78)",
    crosshair: dark ? "rgba(212,212,216,0.55)" : "rgba(82,82,91,0.45)",
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
