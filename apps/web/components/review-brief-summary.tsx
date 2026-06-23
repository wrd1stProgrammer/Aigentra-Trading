"use client";

import { CheckCircle, ListChecks, Target, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import type { ReviewBrief } from "@/lib/review-brief";
import { cleanReviewDisplayItems, cleanReviewDisplayText } from "@/lib/review-display";

type ReviewBriefSummaryProps = {
  brief: ReviewBrief;
  title: string;
  compact?: boolean;
  embedded?: boolean;
  showHeader?: boolean;
  t: (key: string) => string;
};

export function ReviewBriefSummary({
  brief,
  title,
  compact = false,
  embedded = false,
  showHeader = true,
  t
}: ReviewBriefSummaryProps) {
  const headline = cleanReviewDisplayText(brief.headline ?? brief.action ?? brief.managerNote ?? "-", compact ? 96 : 140);
  const verdict = localizedBriefToken(brief.verdict, t);
  const action = cleanReviewDisplayText(localizedBriefToken(brief.action, t) ?? brief.action, compact ? 72 : 100);
  const rationaleItems = cleanReviewDisplayItems(brief.keyReasons.slice(0, 2), compact ? 86 : 120);
  const riskItems = cleanReviewDisplayItems(brief.risks.slice(0, 1), compact ? 86 : 120);
  const watchItems = cleanReviewDisplayItems(brief.watchConditions.slice(0, 2), compact ? 86 : 120);
  const managerNote = cleanReviewDisplayText(brief.managerNote ?? "", compact ? 110 : 160);
  const shellClassName = embedded
    ? `${compact ? "space-y-2" : "space-y-3"}`
    : `rounded-xl border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/35 ${compact ? "space-y-2" : "space-y-3"}`;

  return (
    <div className={shellClassName}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="metric-label">{title}</div>
          {verdict ? <StatusBadge tone="neutral">{verdict}</StatusBadge> : null}
        </div>
      ) : verdict ? (
        <div className="flex justify-end">
          <StatusBadge tone="neutral">{verdict}</StatusBadge>
        </div>
      ) : null}
      <p className={`${compact ? "text-xs leading-5" : "text-sm leading-6"} text-zinc-800 dark:text-zinc-100`}>
        {headline}
      </p>
      {action && action !== headline ? (
        <div className="flex gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/55 dark:text-zinc-300">
          <CheckCircle className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" size={15} />
          <span><span className="font-semibold">{t("aiReview.nextAction")}:</span> {action}</span>
        </div>
      ) : null}
      <div className="space-y-2">
        <BriefSummaryLine icon={<ListChecks size={15} />} label={t("aiReview.keyReasons")} items={rationaleItems} />
        <BriefSummaryLine icon={<WarningCircle size={15} />} label={t("aiReview.risks")} items={riskItems} />
        <BriefSummaryLine icon={<Target size={15} />} label={t("aiReview.watchConditions")} items={watchItems} />
      </div>
      {managerNote ? (
        <p className="rounded-lg bg-zinc-100/65 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300">
          <span className="font-semibold text-zinc-500 dark:text-zinc-400">{t("aiReview.managerNote")}:</span> {managerNote}
        </p>
      ) : null}
    </div>
  );
}

function localizedBriefToken(value: string | null, t: (key: string) => string) {
  if (!value) return null;
  const normalized = value.trim().replace(/[\s-]+/g, "_").toUpperCase();
  const key = {
    APPROVE: "status.approved",
    APPROVED: "status.approved",
    REJECT: "status.rejected",
    REJECTED: "status.rejected",
    ADJUST_AND_APPROVE: "status.adjustAndApprove",
    HOLD: "status.hold",
    LET_PROFIT_RUN: "status.hold",
    MOVE_STOP: "status.moveStop",
    MOVE_STOP_TO_BREAKEVEN: "status.moveStopToBreakeven",
    CANCEL_ORDER: "status.cancelOrder",
    CANCEL_PENDING_ORDER: "status.cancelPendingOrder",
    CANCEL_REMAINING_ORDERS: "status.cancelRemainingOrders",
    CLOSE_POSITION: "status.closePosition",
    REDUCE_SIZE: "status.reduceSize",
    REDUCE_RISK: "status.reduceRisk"
  }[normalized];
  return key ? t(key) : value;
}

function BriefSummaryLine({ icon, label, items }: { icon: ReactNode; label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-zinc-100/70 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300 sm:flex-row sm:items-start">
      <div className="flex min-w-28 shrink-0 items-center gap-1.5 font-semibold text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <p className="min-w-0 flex-1">{items.join(" · ")}</p>
    </div>
  );
}
