"use client";

import dynamic from "next/dynamic";
import type { ManagementReview, PaperOrder, PaperPosition, PaperTradeEvent } from "@/lib/api";
import type { LeagueSymbol, TraderScenario } from "@/lib/league";
import { BinancePositionPanel } from "@/components/trader-profile-detail/binance-position-panel";
import type { ChartPlanResult } from "@/components/trader-profile-detail/types";

const LiveCandleChart = dynamic(
  () => import("@/components/live-candle-chart").then((module) => module.LiveCandleChart),
  {
    ssr: false,
    loading: () => <ChartLoadingPanel />
  }
);

export function DetailChart({
  symbol,
  result,
  paperPositions,
  paperOrders,
  paperEvents,
  managementReviews,
  height,
  compact,
  showPositionPanel = true,
  scenarios,
  liveMarkPrice,
  onLatestPriceChange,
  onOpenScenario
}: {
  symbol: LeagueSymbol;
  result: ChartPlanResult | null;
  paperPositions: PaperPosition[];
  paperOrders: PaperOrder[];
  paperEvents?: PaperTradeEvent[];
  managementReviews?: ManagementReview[];
  height?: number;
  compact?: boolean;
  showPositionPanel?: boolean;
  scenarios?: readonly TraderScenario[];
  liveMarkPrice?: number | null;
  onLatestPriceChange?: (price: number | null) => void;
  onOpenScenario?: (scenario: TraderScenario) => void;
}) {
  return (
    <>
      <LiveCandleChart
        symbol={symbol}
        result={result}
        paperPositions={paperPositions}
        paperOrders={paperOrders}
        paperEvents={paperEvents}
        managementReviews={managementReviews}
        height={height}
        compact={compact}
        onLatestPriceChange={onLatestPriceChange}
      />
      {showPositionPanel ? (
        <BinancePositionPanel
          symbol={symbol}
          positions={paperPositions}
          orders={paperOrders}
          latestPlan={result?.tradePlan ?? null}
          scenarios={scenarios}
          liveMarkPrice={liveMarkPrice}
          onOpenScenario={onOpenScenario}
        />
      ) : null}
    </>
  );
}

function ChartLoadingPanel() {
  return (
    <section className="overflow-hidden rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="h-5 w-36 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-3 h-4 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
        </div>
        <div className="h-8 w-28 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="h-[420px] w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
    </section>
  );
}
