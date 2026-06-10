"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { getTrader, runTraderCycle, RunCycleResult, TraderProfile } from "@/lib/api";
import { fallbackTraders, traderNameKey, traderShortKey } from "@/lib/traders";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useAppContext } from "@/components/app-provider";
import { AIReviewPanel } from "@/components/ai-review-panel";
import { FlowSteps } from "@/components/flow-steps";
import { LiveCandleChart } from "@/components/live-candle-chart";
import { ResultBlock } from "@/components/result-block";
import { StatusBadge } from "@/components/status-badge";

export function TraderDetailClient({ traderId }: { traderId: string }) {
  const { locale, t } = useAppContext();
  const queryClient = useQueryClient();
  const fallback = useMemo(
    () => fallbackTraders.find((trader) => trader.id === traderId) as unknown as TraderProfile | undefined,
    [traderId]
  );
  const [trader, setTrader] = useState<TraderProfile | undefined>(fallback);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [result, setResult] = useState<RunCycleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTrader(traderId).then(setTrader).catch(() => undefined);
  }, [traderId]);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setResult(await runTraderCycle(traderId, symbol, undefined, locale));
      void queryClient.invalidateQueries({ queryKey: ["league"] });
      void queryClient.invalidateQueries({ queryKey: ["paper"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!trader) {
    return <div className="panel p-6">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <Link href="/traders" className="ghost-button w-fit">
        <ArrowLeft size={16} />
        {t("nav.traders")}
      </Link>

      <section className="panel p-6 md:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex gap-2">
              <StatusBadge tone={trader.riskLevel.includes("HIGH") ? "warn" : "good"}>{trader.riskLevel}</StatusBadge>
              <StatusBadge tone="neutral">{t("common.paperOnly")}</StatusBadge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{t(traderNameKey(trader.id))}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t(traderShortKey(trader.id))}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {["BTCUSDT"].map((item) => (
              <button key={item} className={`ghost-button ${symbol === item ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950" : ""}`} onClick={() => setSymbol(item)}>
                {item}
              </button>
            ))}
            <button className="action-button" onClick={run} disabled={loading}>
              <Play size={16} />
              {loading ? t("common.loading") : t("common.runCycle")}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <DetailMetric label={t("common.return30d")} value={formatPercent(trader.mockPerformance.return30d)} />
        <DetailMetric label={t("common.winRate")} value={formatPercent(trader.mockPerformance.winRate)} />
        <DetailMetric label={t("common.maxDrawdown")} value={formatPercent(trader.mockPerformance.maxDrawdown)} />
        <DetailMetric label={t("common.equity")} value={formatCurrency(trader.mockPerformance.currentEquity)} />
      </section>

      <FlowSteps />

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <LiveCandleChart symbol={symbol} result={result} />
        <AIReviewPanel result={result} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <InfoPanel title={t("traders.strategyConcept")} items={[trader.concept ?? trader.description]} />
        <InfoPanel title={t("common.currentPlan")} items={[trader.currentPlan]} />
        <InfoPanel title={t("traders.longConditions")} items={trader.longConditions ?? []} />
        <InfoPanel title={t("traders.shortConditions")} items={trader.shortConditions ?? []} />
        <InfoPanel title={t("traders.entryRules")} items={trader.entryRules ?? []} />
        <InfoPanel title={t("traders.takeProfitRules")} items={trader.takeProfitRules ?? []} />
        <InfoPanel title={t("traders.stopLossRules")} items={trader.stopLossRules ?? []} />
        <InfoPanel title={t("traders.reviewChecklist")} items={trader.aiReviewChecklist ?? []} />
      </section>

      {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {result ? <ResultBlock title={`${result.trader} / ${result.symbol}`} data={result} /> : null}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="metric-label">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="panel p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <ul className="space-y-2">
        {items.length ? (
          items.map((item) => (
            <li key={item} className="rounded-md bg-zinc-100 px-3 py-2 text-sm leading-6 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-300">
              {item}
            </li>
          ))
        ) : (
          <li className="text-sm text-zinc-500 dark:text-zinc-400">-</li>
        )}
      </ul>
    </div>
  );
}
