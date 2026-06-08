"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Play, Pulse, ShieldCheck, Timer } from "@phosphor-icons/react";
import {
  EquitySnapshot,
  getActivePaperPositions,
  getEquitySnapshots,
  getManagementReviews,
  getPaperOrders,
  getScannerStatus,
  getTradeEvents,
  getTraderPaperSummary,
  getTraderPaperStates,
  getTraders,
  ManagementReview,
  PaperEngineRunResult,
  PaperOrder,
  PaperPosition,
  PaperTradeEvent,
  runPaperEngineOnce,
  runScannerOnce,
  runTraderCycle,
  RunCycleResult,
  ScannerRunResult,
  ScannerStatus,
  TraderPaperSummary,
  TraderPaperState,
  TraderProfile
} from "@/lib/api";
import { fallbackTraders, traderNameKey, traderShortKey } from "@/lib/traders";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useAppContext } from "@/components/app-provider";
import { AIReviewPanel } from "@/components/ai-review-panel";
import { LiveCandleChart } from "@/components/live-candle-chart";
import { ResultBlock } from "@/components/result-block";
import { StatusBadge } from "@/components/status-badge";
import { statusLabel, traderStatusSummary } from "@/lib/status";

export function TradersPageClient() {
  const { locale, t } = useAppContext();
  const [traders, setTraders] = useState<TraderProfile[]>(fallbackTraders as unknown as TraderProfile[]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [result, setResult] = useState<RunCycleResult | null>(null);
  const [paperStates, setPaperStates] = useState<TraderPaperState[]>([]);
  const [paperSummaries, setPaperSummaries] = useState<TraderPaperSummary[]>([]);
  const [paperPositions, setPaperPositions] = useState<PaperPosition[]>([]);
  const [paperOrders, setPaperOrders] = useState<PaperOrder[]>([]);
  const [tradeEvents, setTradeEvents] = useState<PaperTradeEvent[]>([]);
  const [equitySnapshots, setEquitySnapshots] = useState<EquitySnapshot[]>([]);
  const [managementReviews, setManagementReviews] = useState<ManagementReview[]>([]);
  const [engineResult, setEngineResult] = useState<PaperEngineRunResult | null>(null);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus | null>(null);
  const [scannerResult, setScannerResult] = useState<ScannerRunResult | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTraders().then((data) => setTraders(data.traders)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadPaperState();
  }, [symbol]);

  async function loadPaperState() {
    setPaperLoading(true);
    try {
      const [statesResult, positionsResult, ordersResult, eventsResult, snapshotsResult, managementReviewsResult, scannerState] = await Promise.all([
        getTraderPaperStates(symbol),
        getActivePaperPositions(symbol),
        getPaperOrders(20, symbol, "open"),
        getTradeEvents(20, symbol),
        getEquitySnapshots(20),
        getManagementReviews(20, symbol).catch(() => []),
        getScannerStatus().catch(() => null)
      ]);
      const summaryResult = await getTraderPaperSummary(symbol);
      setPaperStates(unwrapList<TraderPaperState>(statesResult, "states"));
      setPaperSummaries(summaryResult.summaries);
      setPaperPositions(unwrapList<PaperPosition>(positionsResult, "positions"));
      setPaperOrders(unwrapList<PaperOrder>(ordersResult, "orders"));
      setTradeEvents(unwrapList<PaperTradeEvent>(eventsResult, "events"));
      setEquitySnapshots(unwrapList<EquitySnapshot>(snapshotsResult, "snapshots"));
      setManagementReviews(unwrapManagementReviews(managementReviewsResult));
      setScannerStatus(scannerState);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPaperLoading(false);
    }
  }

  async function run(id: string) {
    setActiveRun(id);
    setError(null);
    try {
      setResult(await runTraderCycle(id, symbol, undefined, locale));
      void loadPaperState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActiveRun(null);
    }
  }

  async function runEngineOnce() {
    setEngineLoading(true);
    setError(null);
    try {
      setEngineResult(await runPaperEngineOnce(symbol, locale));
      await loadPaperState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEngineLoading(false);
    }
  }

  async function runBtcScannerOnce() {
    setScannerLoading(true);
    setError(null);
    try {
      const nextResult = await runScannerOnce("BTCUSDT", "mock", locale);
      setScannerResult(nextResult);
      await loadPaperState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScannerLoading(false);
    }
  }

  const selectedPaperState = result
    ? paperStates.find((state) => state.traderId === result.traderId || state.traderName === result.trader)
    : paperStates[0] ?? null;
  const summaryStats = summarizePaper(paperSummaries);
  const latestScannerResult = scannerResult ?? scannerStatus?.lastResult ?? null;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("traders.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("traders.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {["BTCUSDT"].map((item) => (
            <button
              key={item}
              className={`ghost-button ${symbol === item ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950" : ""}`}
              onClick={() => setSymbol(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="panel overflow-hidden p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={scannerStatus?.taskActive ? "good" : "neutral"}>
                  {scannerStatus?.taskActive ? t("scanner.autoOn") : t("scanner.autoOff")}
                </StatusBadge>
                <StatusBadge tone="neutral">BTCUSDT</StatusBadge>
                <StatusBadge tone="warn">{scannerStatus?.provider ?? "mock"}</StatusBadge>
              </div>
              <h2 className="text-xl font-semibold tracking-tight">{t("scanner.title")}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("scanner.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="ghost-button" onClick={loadPaperState} disabled={paperLoading}>
                {paperLoading ? t("common.loading") : t("common.refresh")}
              </button>
              <button className="action-button" onClick={runBtcScannerOnce} disabled={scannerLoading}>
                <Pulse size={16} />
                {scannerLoading ? t("common.loading") : t("scanner.runBtcOnce")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ScannerMetric icon={<Timer size={16} />} label={t("scanner.interval")} value={`${scannerStatus?.intervalSeconds ?? 60}s`} />
            <ScannerMetric icon={<ShieldCheck size={16} />} label={t("scanner.watchlist")} value={`${summaryStats.watchers}/${paperSummaries.length || 5}`} sub={t("scanner.noExposure")} />
            <ScannerMetric label={t("paper.openOrders")} value={String(summaryStats.openOrders)} sub={t("scanner.entryPending")} />
            <ScannerMetric label={t("paper.openPositions")} value={String(summaryStats.openPositions)} sub={t("scanner.inPosition")} />
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{t("scanner.lastScan")}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                {latestScannerResult?.finishedAt ?? scannerStatus?.lastFinishedAt ?? t("scanner.notRun")}
              </p>
            </div>
            <StatusBadge tone={latestScannerResult?.status === "ok" ? "good" : latestScannerResult ? "warn" : "neutral"}>
              {latestScannerResult?.status ?? "IDLE"}
            </StatusBadge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniCount label={t("scanner.checked")} value={latestScannerResult?.counts.tradersChecked ?? 0} />
            <MiniCount label={t("scanner.candidates")} value={latestScannerResult?.counts.candidates ?? 0} />
            <MiniCount label={t("scanner.aiReviews")} value={latestScannerResult?.counts.aiReviews ?? 0} />
          </div>
          <div className="mt-4 max-h-36 space-y-2 overflow-auto pr-1">
            {(latestScannerResult?.results ?? []).slice(0, 5).map((item) => (
              <div key={`${item.traderId}-${item.runId ?? item.status}`} className="flex items-center justify-between gap-3 rounded-md bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800/70">
                <span className="font-semibold">{item.trader}</span>
                <span className="truncate text-zinc-500 dark:text-zinc-400">{item.status}</span>
              </div>
            ))}
            {latestScannerResult ? null : <div className="text-sm text-zinc-500 dark:text-zinc-400">{t("scanner.empty")}</div>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <LiveCandleChart symbol={symbol} result={result} paperPositions={paperPositions} paperOrders={paperOrders} />
        <AIReviewPanel
          result={result}
          paperState={selectedPaperState}
          paperPositions={paperPositions}
          paperOrders={paperOrders}
          managementReviews={managementReviews}
        />
      </section>

      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <StatusBadge tone="warn">{t("common.paperOnly")}</StatusBadge>
              {paperLoading ? <StatusBadge tone="neutral">{t("common.loading")}</StatusBadge> : null}
            </div>
            <h2 className="text-lg font-semibold">{t("paper.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("paper.notice")}</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500 dark:text-zinc-500">{t("paper.engineExplanation")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="ghost-button" onClick={loadPaperState} disabled={paperLoading}>
              {paperLoading ? t("common.loading") : t("common.refresh")}
            </button>
            <button className="action-button" onClick={runEngineOnce} disabled={engineLoading}>
              <Play size={16} />
              {engineLoading ? t("common.loading") : t("paper.runEngine")}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <PaperList title={t("paper.traderStates")} emptyText="-" items={paperStates.slice(0, 5)} render={(state) => (
            <PaperRow
              key={state.traderId}
              title={t(traderNameKey(state.traderId))}
              badge={state.status ?? state.mode ?? "paper"}
              meta={[
                `${t("common.equity")} ${formatLooseCurrency(state.equity)}`,
                `${t("paper.unrealizedPnl")} ${formatLooseNumber(state.unrealizedPnl)}`,
                `${t("paper.openPositions")} ${state.openPositions ?? 0}`,
                ...formatAgentMeta(state, t)
              ]}
            />
          )} />
          <PaperList title={t("paper.activePositions")} emptyText={t("paper.noPositions")} items={paperPositions.slice(0, 5)} render={(position) => (
            <PaperRow
              key={String(position.id ?? `${position.traderId}-${position.symbol}-${position.side}`)}
              title={`${position.symbol} ${position.side ?? ""}`}
              badge={position.status ?? "open"}
              meta={[
                `${t("common.price")} ${formatLooseNumber(position.entryPrice ?? position.averageEntryPrice)}`,
                `${t("common.quantity")} ${formatLooseNumber(position.quantity ?? position.size)}`,
                `${t("common.pnl")} ${formatLooseNumber(position.unrealizedPnl)}`
              ]}
            />
          )} />
          <PaperList title={t("paper.orders")} emptyText={t("paper.noOrders")} items={paperOrders.slice(0, 5)} render={(order) => (
            <PaperRow
              key={String(order.id ?? `${order.traderId}-${order.symbol}-${order.side}-${order.price}`)}
              title={`${order.symbol} ${order.side ?? ""}`}
              badge={order.status ?? order.type ?? "paper"}
              meta={[
                `${t("common.price")} ${formatLooseNumber(order.price ?? order.limitPrice ?? order.filledPrice ?? order.stopPrice ?? order.triggerPrice)}`,
                `${t("common.quantity")} ${formatLooseNumber(order.quantity)}`,
                `${t("common.updatedAt")} ${order.updatedAt ?? order.createdAt ?? "-"}`
              ]}
            />
          )} />
          <PaperList title={t("paper.events")} emptyText={t("paper.noEvents")} items={tradeEvents.slice(0, 5)} render={(event) => (
            <PaperRow
              key={String(event.id ?? `${event.traderId}-${event.symbol}-${event.timestamp ?? event.createdAt}`)}
              title={`${event.symbol ?? "-"} ${event.eventType ?? event.type ?? ""}`}
              badge={event.side ?? "event"}
              meta={[
                `${t("common.price")} ${formatLooseNumber(event.price)}`,
                event.message ?? event.timestamp ?? event.createdAt ?? "-"
              ]}
            />
          )} />
          <PaperList title={t("paper.equitySnapshots")} emptyText={t("paper.noSnapshots")} items={equitySnapshots.slice(0, 5)} render={(snapshot) => (
            <PaperRow
              key={String(snapshot.id ?? `${snapshot.traderId}-${snapshot.timestamp ?? snapshot.createdAt}`)}
              title={snapshot.traderId ? t(traderNameKey(snapshot.traderId)) : snapshot.symbol ?? "-"}
              badge={snapshot.timestamp ?? snapshot.createdAt ?? "snapshot"}
              meta={[
                `${t("common.equity")} ${formatLooseCurrency(snapshot.equity)}`,
                `${t("paper.realizedPnl")} ${formatLooseNumber(snapshot.realizedPnl)}`,
                `${t("paper.unrealizedPnl")} ${formatLooseNumber(snapshot.unrealizedPnl)}`
              ]}
            />
          )} />
          <PaperList title={t("paper.managementReviews")} emptyText={t("paper.noManagementReviews")} items={managementReviews.slice(0, 5)} render={(review) => (
            <ManagementReviewRow review={review} t={t} />
          )} />
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">{t("paper.engineResult")}</h3>
              <StatusBadge tone="warn">{t("common.paperOnly")}</StatusBadge>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-zinc-100 p-3 text-xs leading-5 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {JSON.stringify(engineResult ?? { status: "not run", mode: "paper" }, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1fr_0.9fr]">
        {traders.map((trader) => (
          <TraderCard
            key={trader.id}
            trader={trader}
            summary={paperSummaries.find((item) => item.traderId === trader.id)}
            paperState={paperStates.find((item) => item.traderId === trader.id)}
            locale={locale}
            t={t}
            activeRun={activeRun}
            onRun={run}
          />
        ))}
      </section>

      {result ? <ResultBlock title={`${result.trader} / ${result.symbol}`} data={result} /> : null}
    </div>
  );
}

function TraderCard({
  trader,
  summary,
  paperState,
  locale,
  t,
  activeRun,
  onRun
}: {
  trader: TraderProfile;
  summary?: TraderPaperSummary;
  paperState?: TraderPaperState;
  locale: "ko" | "en";
  t: (key: string) => string;
  activeRun: string | null;
  onRun: (id: string) => void;
}) {
  const currentPlan = summary ? traderStatusSummary(summary, t) : t("paper.loadingSummary");
  const riskValue = summary
    ? summary.leverage
      ? `${formatLoosePercent(summary.riskPercent)} / ${summary.leverage}x`
      : formatLoosePercent(summary.riskPercent)
    : "-";
  const stage = summary ? paperStage(summary) : { label: "LOADING", tone: "neutral" as const };
  const agentState = getAgentState(summary, paperState);

  return (
    <article className="panel flex min-h-[290px] flex-col p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t(traderNameKey(trader.id))}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t(traderShortKey(trader.id))}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge tone={stage.tone}>{t(stage.label)}</StatusBadge>
                <StatusBadge tone={trader.riskLevel.includes("HIGH") ? "warn" : "good"}>{trader.riskLevel}</StatusBadge>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Stat label={t("common.return7d")} value={summary ? formatPercent(summary.return7d) : "-"} />
              <Stat label={t("common.return30d")} value={summary ? formatPercent(summary.return30d) : "-"} />
              <Stat
                label={t("common.winRate")}
                value={summary?.winRate === null || summary?.winRate === undefined ? "-" : formatPercent(summary.winRate)}
                sub={summary ? `${summary.closedPositions ?? 0} ${t("paper.closedTrades")}` : undefined}
              />
              <Stat label={t("common.maxDrawdown")} value={summary ? formatPercent(summary.maxDrawdown) : "-"} />
              <Stat label={t("common.equity")} value={summary ? formatCurrency(summary.equity) : "-"} wide />
              <Stat label={t("common.risk")} value={riskValue} sub={summary?.leverage ? t("paper.riskLeverage") : undefined} />
            </div>

            <div className="mt-5 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300">
              <div className="metric-label mb-1">{t("common.currentPlan")}</div>
              {currentPlan}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <AgentStat label={t("agent.mode")} value={statusLabel(agentState.mode, t)} />
              <AgentStat label={t("agent.phase")} value={statusLabel(agentState.phase, t)} />
              <AgentStat label={t("agent.nextReviewAt")} value={agentState.nextReviewAt} wide />
              <AgentStat label={t("agent.lastDecision")} value={statusLabel(agentState.lastDecision, t)} />
              <AgentStat label={t("agent.lastAction")} value={statusLabel(agentState.lastAction, t)} />
            </div>

            <div className="mt-auto flex gap-2 pt-5">
              <button className="action-button flex-1" onClick={() => onRun(trader.id)} disabled={activeRun === trader.id}>
                <Play size={16} />
                {activeRun === trader.id ? t("common.loading") : t("common.runCycle")}
              </button>
              <Link className="ghost-button" href={`/traders/${trader.id}`}>
                <ArrowRight size={16} />
              </Link>
            </div>
    </article>
  );
}

function AgentStat({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800 ${wide ? "col-span-2" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="mt-1 truncate font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-50" title={value ?? "-"}>
        {value ?? "-"}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, wide = false }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 ${wide ? "col-span-1" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function ScannerMetric({ icon, label, value, sub }: { icon?: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-100 p-3 dark:bg-zinc-800/70">
      <div className="metric-label">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}

function PaperList<T>({ title, emptyText, items, render }: { title: string; emptyText: string; items: T[]; render: (item: T) => ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="space-y-2">
        {items.length ? items.map(render) : <div className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</div>}
      </div>
    </div>
  );
}

function PaperRow({ title, badge, meta }: { title: string; badge: string; meta: string[] }) {
  return (
    <div className="rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-800/70">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <StatusBadge tone="neutral">{badge}</StatusBadge>
      </div>
      <div className="mt-2 space-y-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {meta.map((item) => (
          <div key={item}>{item}</div>
        ))}
      </div>
    </div>
  );
}

function ManagementReviewRow({ review, t }: { review: ManagementReview; t: (key: string) => string }) {
  const details = managementReviewDetails(review, t);
  return (
    <PaperRow
      key={String(review.id ?? `${review.traderId}-${review.symbol}-${review.createdAt ?? review.updatedAt ?? review.timestamp}`)}
      title={`${review.traderName ?? (review.traderId ? t(traderNameKey(review.traderId)) : review.symbol ?? "-")}`}
      badge={statusLabel(review.action ?? review.decision ?? review.status ?? review.recommendation ?? "review", t)}
      meta={[
        `${t("common.symbol")} ${review.symbol ?? "-"}`,
        `${t("aiReview.confidence")} ${formatLooseNumber(review.confidence)}`,
        `${t("aiReview.eventPhase")} ${details.eventPhase}`,
        `${t("aiReview.eventReason")} ${details.eventReason}`,
        `${t("aiReview.rationale")} ${details.rationale}`,
        `${t("aiReview.userSummary")} ${details.userSummary}`,
        `${t("aiReview.appliedActions")} ${details.appliedActions}`
      ]}
    />
  );
}

function managementReviewDetails(review: Record<string, any>, t: (key: string) => string) {
  const payload = review.payload ?? {};
  const event = review.event ?? payload.event ?? {};
  const nestedReview = review.review ?? payload.review ?? review.raw ?? {};
  return {
    eventPhase: statusLabel(firstValue(event.phase, review.phase, review.eventPhase), t),
    eventReason: formatLooseText(firstValue(event.reason, review.reason, review.managementReason)),
    rationale: formatLooseText(firstValue(nestedReview.rationale, review.rationale)),
    userSummary: formatLooseText(firstValue(nestedReview.userSummary, review.userSummary, review.summary)),
    appliedActions: formatActionList(firstValue(payload.appliedActions, review.appliedActions, nestedReview.appliedActions, review.actionsApplied, nestedReview.actions, review.actions), t)
  };
}

function unwrapList<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
    const data = (value as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

function unwrapManagementReviews(value: unknown): ManagementReview[] {
  if (Array.isArray(value)) return value as ManagementReview[];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["reviews", "managementReviews", "data"]) {
      if (Array.isArray(record[key])) return record[key] as ManagementReview[];
    }
  }
  return [];
}

function formatLooseNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) return value ? String(value) : "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(numberValue);
}

function formatLooseCurrency(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) return value ? String(value) : "-";
  return formatCurrency(numberValue);
}

function formatLoosePercent(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) return value ? String(value) : "-";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numberValue)}%`;
}

function formatLooseText(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function formatActionList(value: unknown, t: (key: string) => string) {
  if (!Array.isArray(value)) return statusLabel(value, t);
  if (!value.length) return "-";
  return value.map((item) => {
    if (typeof item === "string") return statusLabel(item, t);
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return statusLabel(firstValue(record.action, record.type, record.status, record.id, JSON.stringify(record)), t);
    }
    return String(item);
  }).join(", ");
}

function formatAgentMeta(state: TraderPaperState, t: (key: string) => string) {
  const agentState = getAgentState(state);
  return [
    `${t("agent.mode")} ${statusLabel(agentState.mode, t)}`,
    `${t("agent.phase")} ${statusLabel(agentState.phase, t)}`,
    `${t("agent.nextReviewAt")} ${agentState.nextReviewAt ?? "-"}`,
    `${t("agent.lastDecision")} ${statusLabel(agentState.lastDecision, t)}`,
    `${t("agent.lastAction")} ${statusLabel(agentState.lastAction, t)}`
  ];
}

function getAgentState(...records: Array<Record<string, any> | null | undefined>) {
  return {
    mode: formatAgentValue(records, "agentMode", "mode"),
    phase: formatAgentValue(records, "agentPhase", "phase"),
    nextReviewAt: formatAgentValue(records, "nextReviewAt", "nextReviewAt"),
    lastDecision: formatAgentValue(records, "lastDecision", "lastDecision"),
    lastAction: formatAgentValue(records, "lastAction", "lastAction")
  };
}

function formatAgentValue(records: Array<Record<string, any> | null | undefined>, flatKey: string, nestedKey: string) {
  for (const record of records) {
    if (!record) continue;
    const value = firstValue(
      record[flatKey],
      record.agentState?.[nestedKey],
      record.managementState?.[nestedKey],
      record.agent?.[nestedKey],
      record.management?.[nestedKey]
    );
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return undefined;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function summarizePaper(summaries: TraderPaperSummary[]) {
  return summaries.reduce(
    (acc, item) => {
      acc.openOrders += item.openOrders ?? 0;
      acc.openPositions += item.openPositions ?? 0;
      if (!(item.openOrders || item.openPositions)) acc.watchers += 1;
      return acc;
    },
    { openOrders: 0, openPositions: 0, watchers: 0 }
  );
}

function paperStage(summary: TraderPaperSummary): { label: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (summary.openPositions > 0) return { label: "scanner.inPosition", tone: "good" };
  if (summary.openOrders > 0) return { label: "scanner.entryPending", tone: "warn" };
  if (summary.latestPlanStatus === "PAPER_TRADING_PENDING") return { label: "scanner.planReady", tone: "good" };
  if (summary.latestRunStatus === "completed") return { label: "scanner.reviewed", tone: "good" };
  if (summary.latestRunStatus === "no_candidate") return { label: "scanner.watching", tone: "neutral" };
  if (summary.latestRunStatus === "active_paper_exposure") return { label: "scanner.managing", tone: "good" };
  return { label: "scanner.idle", tone: "neutral" };
}
