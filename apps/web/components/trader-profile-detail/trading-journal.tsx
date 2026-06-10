"use client";

import { ListChecks } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { TradeHistoryItem, Translator } from "@/components/trader-profile-detail/types";

export function TradingJournal({ tradeHistoryItems, t }: { tradeHistoryItems: TradeHistoryItem[]; t: Translator }) {
  const positionActionItems = tradeHistoryItems.filter((item) => item.isPositionAction);
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks size={20} />
          <h2 className="text-lg font-semibold tracking-tight">{t("detail.tradingJournal")}</h2>
        </div>
      </div>
      <div className="mt-5 max-h-[460px] overflow-y-auto rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-800">
        <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-zinc-50 text-xs font-semibold text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500">
            <tr>
              <TableHead>{t("detail.transactionTime")}</TableHead>
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
        {!positionActionItems.length ? <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{t("detail.noTradeHistory")}</div> : null}
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
