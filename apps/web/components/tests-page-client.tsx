"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Brain, CheckCircle, Database, Play, Pulse, Rows } from "@phosphor-icons/react";
import {
  getActivePaperPositions,
  getAiProviders,
  getBinanceTest,
  getDbStatus,
  getEquitySnapshots,
  getHealth,
  getKlines,
  getMarketSnapshot,
  getPaperOrders,
  getRecentAiReviews,
  getRecentCandidateTrades,
  getRecentMarketSnapshots,
  getRecentProviderCalls,
  getRecentRuns,
  getRecentTradePlans,
  getTradeEvents,
  getTraderPaperStates,
  getTraders,
  runAiReviewDemo,
  runAllTraders,
  runPaperEngineOnce,
  runTraderCycle,
  TraderProfile
} from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { ResultBlock } from "@/components/result-block";
import { StatusBadge } from "@/components/status-badge";
import { fallbackTraders, traderNameKey } from "@/lib/traders";

type TestItem = {
  key: string;
  titleKey: string;
  descriptionKey: string;
  icon: ComponentType<{ size?: number }>;
  run: () => Promise<unknown>;
  ctaKey?: string;
  badgeKey?: string;
};

export function TestsPageClient() {
  const { locale, t } = useAppContext();
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [selectedTraderId, setSelectedTraderId] = useState("channel-rider");
  const [traders, setTraders] = useState<TraderProfile[]>(fallbackTraders as unknown as TraderProfile[]);
  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getTraders().then((data) => setTraders(data.traders)).catch(() => undefined);
  }, []);

  const tests: TestItem[] = [
    { key: "health", titleKey: "tests.health", descriptionKey: "tests.liveHint", icon: Pulse, run: getHealth },
    { key: "binance", titleKey: "tests.binance", descriptionKey: "tests.liveHint", icon: Database, run: getBinanceTest },
    { key: "btc", titleKey: "tests.btcKline", descriptionKey: "tests.liveHint", icon: Rows, run: () => getKlines("BTCUSDT") },
    { key: "market-snapshot", titleKey: "tests.marketSnapshot", descriptionKey: "tests.liveHint", icon: Rows, run: () => getMarketSnapshot(symbol) },
    { key: "db-status", titleKey: "tests.dbStatus", descriptionKey: "tests.dbHint", icon: Database, run: getDbStatus },
    { key: "recent-runs", titleKey: "tests.recentRuns", descriptionKey: "tests.dbHint", icon: Rows, run: () => getRecentRuns() },
    {
      key: "recent-market-snapshots",
      titleKey: "tests.recentMarketSnapshots",
      descriptionKey: "tests.dbHint",
      icon: Rows,
      run: () => getRecentMarketSnapshots()
    },
    {
      key: "recent-candidate-trades",
      titleKey: "tests.recentCandidateTrades",
      descriptionKey: "tests.dbHint",
      icon: CheckCircle,
      run: () => getRecentCandidateTrades()
    },
    { key: "recent-ai-reviews", titleKey: "tests.recentAiReviews", descriptionKey: "tests.dbHint", icon: Brain, run: () => getRecentAiReviews() },
    { key: "recent-trade-plans", titleKey: "tests.recentTradePlans", descriptionKey: "tests.dbHint", icon: Play, run: () => getRecentTradePlans() },
    { key: "trader-paper-states", titleKey: "tests.traderStates", descriptionKey: "tests.paperHint", icon: Database, run: getTraderPaperStates, badgeKey: "common.paperOnly" },
    {
      key: "active-paper-positions",
      titleKey: "tests.activePaperPositions",
      descriptionKey: "tests.paperHint",
      icon: Rows,
      run: () => getActivePaperPositions(symbol),
      badgeKey: "common.paperOnly"
    },
    {
      key: "paper-orders",
      titleKey: "tests.paperOrders",
      descriptionKey: "tests.paperHint",
      icon: Rows,
      run: () => getPaperOrders(20, symbol),
      badgeKey: "common.paperOnly"
    },
    {
      key: "trade-events",
      titleKey: "tests.tradeEvents",
      descriptionKey: "tests.paperHint",
      icon: CheckCircle,
      run: () => getTradeEvents(20, symbol),
      badgeKey: "common.paperOnly"
    },
    {
      key: "equity-snapshots",
      titleKey: "tests.equitySnapshots",
      descriptionKey: "tests.paperHint",
      icon: Pulse,
      run: () => getEquitySnapshots(20, selectedTraderId),
      badgeKey: "common.paperOnly"
    },
    {
      key: "paper-engine-run-once",
      titleKey: "tests.paperEngineRunOnce",
      descriptionKey: "tests.paperHint",
      icon: Play,
      run: () => runPaperEngineOnce(symbol, locale),
      ctaKey: "paper.runEngine",
      badgeKey: "common.paperOnly"
    },
    { key: "recent-provider-calls", titleKey: "tests.geminiProviders", descriptionKey: "tests.dbHint", icon: Brain, run: () => getRecentProviderCalls() },
    { key: "gemini-providers", titleKey: "tests.geminiProviders", descriptionKey: "tests.geminiProviderHint", icon: Brain, run: getAiProviders },
    {
      key: "gemini-review",
      titleKey: "tests.reviewDemo",
      descriptionKey: "tests.geminiReviewHint",
      icon: CheckCircle,
      run: () => runAiReviewDemo(symbol, "gemini", locale),
      ctaKey: "tests.geminiRealCall",
      badgeKey: "tests.geminiRealCall"
    },
    {
    key: "run-all-mock",
      titleKey: "tests.runAll",
      descriptionKey: "tests.runAllMockHint",
      icon: Play,
      run: () => runAllTraders(symbol, locale),
      badgeKey: "tests.runAll"
    }
  ];

  const selectedTrader = traders.find((trader) => trader.id === selectedTraderId) ?? traders[0];
  const selectedTraderName = selectedTrader ? t(traderNameKey(selectedTrader.id)) : selectedTraderId;
  const selectedTraderTest: TestItem = {
    key: "selected-trader-cycle",
    titleKey: "tests.selectedTraderCycle",
    descriptionKey: "tests.liveHint",
    icon: Play,
    run: () => runTraderCycle(selectedTrader?.id ?? selectedTraderId, symbol, "mock", locale),
    ctaKey: "tests.runSelectedTrader"
  };
  const selectedTraderGeminiTest: TestItem = {
    key: "selected-trader-gemini-cycle",
    titleKey: "tests.runSelectedTraderGemini",
    descriptionKey: "tests.geminiCycleHint",
    icon: Brain,
    run: () => runTraderCycle(selectedTrader?.id ?? selectedTraderId, symbol, "gemini", locale),
    ctaKey: "tests.geminiRealCall",
    badgeKey: "tests.geminiRealCall"
  };

  async function execute(test: TestItem) {
    setActive(test.key);
    setErrors((current) => ({ ...current, [test.key]: "" }));
    try {
      const result = await test.run();
      setResults((current) => ({ ...current, [test.key]: result }));
    } catch (err) {
      setErrors((current) => ({ ...current, [test.key]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setActive(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("tests.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("tests.subtitle")}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap">
          {["BTCUSDT"].map((item) => (
            <button key={item} className={`ghost-button w-full sm:w-auto ${symbol === item ? "bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950" : ""}`} onClick={() => setSymbol(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2">
              <StatusBadge tone="neutral">{symbol}</StatusBadge>
            </div>
            <h2 className="text-lg font-semibold">{t("tests.selectedTraderCycle")}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              {selectedTraderName} / {symbol}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              value={selectedTrader?.id ?? selectedTraderId}
              onChange={(event) => setSelectedTraderId(event.target.value)}
            >
              {traders.map((trader) => (
                <option key={trader.id} value={trader.id}>
                  {t(traderNameKey(trader.id))}
                </option>
              ))}
            </select>
            <button className="action-button" onClick={() => execute(selectedTraderTest)} disabled={active === selectedTraderTest.key}>
              <Play size={16} />
              {active === selectedTraderTest.key ? t("common.loading") : t("tests.runSelectedTrader")}
            </button>
            <button className="ghost-button border-amber-500/40 text-amber-700 dark:text-amber-300" onClick={() => execute(selectedTraderGeminiTest)} disabled={active === selectedTraderGeminiTest.key}>
              <Brain size={16} />
              {active === selectedTraderGeminiTest.key ? t("common.loading") : t("tests.geminiRealCall")}
            </button>
          </div>
        </div>
        {errors[selectedTraderTest.key] ? <p className="mt-4 text-sm leading-6 text-rose-600 dark:text-rose-300">{errors[selectedTraderTest.key]}</p> : null}
        {errors[selectedTraderGeminiTest.key] ? <p className="mt-4 text-sm leading-6 text-rose-600 dark:text-rose-300">{errors[selectedTraderGeminiTest.key]}</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tests.map((test) => {
          const Icon = test.icon;
          const hasResult = Boolean(results[test.key]);
          const hasError = Boolean(errors[test.key]);
          return (
            <article key={test.key} className="panel p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h2 className="font-semibold">{t(test.titleKey)}</h2>
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{t(test.descriptionKey)}</p>
                    <div className="mt-1">
                      <StatusBadge tone={hasError ? "bad" : hasResult ? "good" : "neutral"}>
                        {hasError ? t("common.failed") : hasResult ? t("common.success") : t("common.pending")}
                      </StatusBadge>
                      {test.badgeKey ? <span className="ml-2"><StatusBadge tone="warn">{t(test.badgeKey)}</StatusBadge></span> : null}
                    </div>
                  </div>
                </div>
                <button className="ghost-button" onClick={() => execute(test)} disabled={active === test.key}>
                  {active === test.key ? t("common.loading") : t(test.ctaKey ?? "common.runTest")}
                </button>
              </div>
              {hasError ? <p className="mt-4 text-sm leading-6 text-rose-600 dark:text-rose-300">{errors[test.key]}</p> : null}
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {Object.entries(results).map(([key, value]) => (
          <ResultBlock key={key} title={key} data={value} />
        ))}
      </section>
    </div>
  );
}
