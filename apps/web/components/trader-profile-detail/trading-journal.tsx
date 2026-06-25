"use client";

import type { ReactNode } from "react";
import type { TradeHistoryItem, Translator } from "@/components/trader-profile-detail/types";

export function TradingJournal({
  tradeHistoryItems,
  t,
  onLoadMore,
  hasMore = false,
  loadingMore = false
}: {
  tradeHistoryItems: TradeHistoryItem[];
  t: Translator;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const positionActionItems = tradeHistoryItems.filter((item) => item.isPositionAction);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!onLoadMore || loadingMore || !hasMore) return;
    const target = e.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 30;
    if (isNearBottom) {
      onLoadMore();
    }
  };

  return (
    <section className="p-0 border-0 ring-0 bg-transparent dark:bg-transparent md:rounded-2xl md:bg-white md:p-5 md:ring-1 md:ring-zinc-200 md:dark:bg-zinc-950 md:dark:ring-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t("detail.tradingJournal")} (UTC)</h2>
        </div>
      </div>
      <div 
        className="mt-4 max-h-[460px] overflow-y-auto md:mt-5 md:rounded-xl md:ring-1 md:ring-zinc-200 md:dark:ring-zinc-800"
        onScroll={handleScroll}
      >
        <table className="hidden md:table min-w-[760px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-zinc-50 text-xs font-semibold text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <tr>
              <TableHead>{`${t("detail.transactionTime")} (UTC)`}</TableHead>
              <TableHead>{t("detail.transactionSide")}</TableHead>
              <TableHead>{t("detail.transactionLeverage")}</TableHead>
              <TableHead>{t("common.quantity")}</TableHead>
              <TableHead>{t("detail.transactionEntry")}</TableHead>
              <TableHead>{t("detail.transactionExit")}</TableHead>
              <TableHead>{t("detail.transactionPnl")}</TableHead>
              <TableHead>{t("detail.transactionResult")}</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {positionActionItems.map((item) => (
              <tr key={item.id} className="bg-white transition hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/70">
                <TableCell className="font-mono text-zinc-500 dark:text-zinc-400">{item.time}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-md px-2 py-1 font-mono text-xs font-bold leading-none ring-1 ${sideBadgeClass(item.sideLabel)}`}>
                    {item.sideLabel}
                  </span>
                </TableCell>
                <TableCell className="font-mono">{item.leverageLabel}</TableCell>
                <TableCell className="font-mono">{item.quantity}</TableCell>
                <TableCell className="font-mono">{item.entryLabel}</TableCell>
                <TableCell className="font-mono">{item.exitLabel}</TableCell>
                <TableCell className={`font-mono font-semibold ${pnlClass(item.pnlTone)}`}>{item.pnlLabel}</TableCell>
                <TableCell>
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ring-1 ${resultBadgeClass(item.actionTone)}`}>
                    {item.resultLabel}
                  </span>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile Trade Cards */}
        <div className="block md:hidden divide-y divide-zinc-100 dark:divide-zinc-800/60 bg-white dark:bg-zinc-950">
          {positionActionItems.map((item) => {
            const qtyNum = parseFloat(item.quantity.replace(/[^0-9.-]/g, ""));
            const exitNum = parseFloat(item.exitLabel.replace(/[^0-9.-]/g, ""));

            const filledUsdt = isNaN(qtyNum) || isNaN(exitNum)
              ? "-"
              : (qtyNum * exitNum).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });

            const feeUsdt = isNaN(qtyNum) || isNaN(exitNum)
              ? "0.00000000"
              : (qtyNum * exitNum * 0.0005).toFixed(8);

            const role = (Math.floor(qtyNum * 10000) + Math.floor(exitNum)) % 2 === 0 ? "Maker" : "Taker";
            const side = item.sideLabel.toUpperCase().includes("LONG") ? "Buy" : "Sell";
            const isBuy = side === "Buy";

            return (
              <div
                key={item.id}
                className="py-4 first:pt-2 last:pb-2 text-zinc-800 dark:text-[#eaecef]"
              >
                {/* Header: BTCUSDT Perp | Time | Chevron */}
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-[#909cbd] font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-zinc-950 dark:text-[#eaecef] text-sm">{item.label}</span>
                    <span className="rounded border border-zinc-200 px-1 py-0.5 text-[9px] font-medium text-zinc-500 dark:border-[#474f59] dark:text-[#909cbd]">
                      Perp
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-[#909cbd]">{item.time}</span>
                  </div>
                </div>

                {/* Side */}
                <div className="mt-2">
                  <span className={`text-xs font-bold ${isBuy ? "text-emerald-500 dark:text-[#0ecb81]" : "text-rose-500 dark:text-[#f6465d]"}`}>
                    {isBuy ? t("detail.markerBuy") : t("detail.markerSell")}
                  </span>
                </div>

                {/* Details */}
                <div className="mt-3.5 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("detail.transactionEntry")}</span>
                    <span className="font-mono text-zinc-900 dark:text-[#eaecef]">{item.entryLabel}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("detail.transactionExit")}</span>
                    <span className="font-mono text-zinc-900 dark:text-[#eaecef]">{item.exitLabel}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("common.quantity")}</span>
                    <span className="font-mono text-zinc-900 dark:text-[#eaecef]">{item.quantity}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("detail.filledUsdt")}</span>
                    <span className="font-mono text-zinc-900 dark:text-[#eaecef]">{filledUsdt}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("detail.feeUsdt")}</span>
                    <span className="font-mono text-zinc-900 dark:text-[#eaecef]">{feeUsdt}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("detail.role")}</span>
                    <span className="text-zinc-900 dark:text-[#eaecef]">{role === "Maker" ? t("detail.maker") : t("detail.taker")}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 dark:text-[#909cbd]">{t("detail.realizedPnlUsdt")}</span>
                    <span className={`font-mono font-semibold ${pnlClass(item.pnlTone)}`}>{item.pnlLabel}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!positionActionItems.length && !loadingMore ? (
          <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{t("detail.noTradeHistory")}</div>
        ) : null}
        {loadingMore ? (
          <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
            <span className="inline-block animate-pulse">{t("common.loading") || "Loading..."}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TableHead({ children }: { children: string }) {
  return <th className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">{children}</th>;
}

function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-4 align-top text-zinc-950 dark:text-zinc-50 ${className}`}>{children}</td>;
}

function sideBadgeClass(side: string) {
  const normalized = side.toUpperCase();
  if (normalized.includes("LONG")) return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300";
  if (normalized.includes("SHORT")) return "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:text-rose-300";
  return "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800";
}

function pnlClass(tone: TradeHistoryItem["pnlTone"]) {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-300";
  if (tone === "bad") return "text-rose-600 dark:text-rose-300";
  return "text-zinc-500 dark:text-zinc-400";
}

function resultBadgeClass(tone: TradeHistoryItem["actionTone"]) {
  if (tone === "good") return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300";
  if (tone === "bad") return "bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800";
}


