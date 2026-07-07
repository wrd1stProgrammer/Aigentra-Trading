"use client";

import { StatusBadge } from "@/components/status-badge";
import { entryRationaleItems, type ReviewBrief } from "@/lib/review-brief";
import { cleanReviewDisplayItems, cleanReviewDisplayText } from "@/lib/review-display";

type ReviewBriefSummaryProps = {
  brief: ReviewBrief;
  title: string;
  compact?: boolean;
  embedded?: boolean;
  showHeader?: boolean;
  focus?: "full" | "entry";
  t: (key: string) => string;
};

export function ReviewBriefSummary({
  brief,
  title,
  compact = false,
  embedded = false,
  showHeader = true,
  focus = "full",
  t
}: ReviewBriefSummaryProps) {
  const headline = cleanReviewDisplayText(brief.headline ?? brief.action ?? brief.managerNote ?? "-");
  const verdict = localizedBriefToken(brief.verdict, t);
  const action = cleanReviewDisplayText(localizedBriefToken(brief.action, t) ?? brief.action);
  const reviewLines =
    focus === "entry" ? entryReviewLinesFromBrief(brief, headline) : reviewLinesFromBrief(brief, headline, action, compact);
  const managerNote = cleanReviewDisplayText(brief.managerNote ?? "");
  const shellClassName = embedded
    ? `${compact ? "space-y-2" : "space-y-3"}`
    : `rounded-xl border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/35 ${compact ? "space-y-2" : "space-y-3"}`;

  return (
    <div className={shellClassName}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="metric-label">{title}</div>
          {showHeader && verdict ? <StatusBadge tone="neutral">{verdict}</StatusBadge> : null}
        </div>
      ) : null}
      <p className={`${compact ? "text-xs leading-5" : "text-sm leading-6"} text-zinc-800 dark:text-zinc-100`}>
        {headline}
      </p>
      <div className={`${compact ? "space-y-1.5" : "space-y-2"} text-zinc-600 dark:text-zinc-300`}>
        {reviewLines.map((line) => (
          <p key={line} className={compact ? "text-xs leading-5" : "text-sm leading-6"}>
            {line}
          </p>
        ))}
      </div>
      {focus !== "entry" && managerNote ? (
        <div className="rounded-lg bg-zinc-100/65 px-3 py-2 dark:bg-zinc-900/50">
          <div className="metric-label mb-1">{t("aiReview.managerNote")}</div>
          <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">{managerNote}</p>
        </div>
      ) : null}
    </div>
  );
}

function entryReviewLinesFromBrief(brief: ReviewBrief, headline: string) {
  return cleanReviewDisplayItems(
    entryRationaleItems(brief).filter((item) => item !== headline)
  ).slice(0, 2);
}

function reviewLinesFromBrief(brief: ReviewBrief, headline: string, action: string, compact: boolean) {
  return cleanReviewDisplayItems(
    [
      action,
      ...brief.keyReasons,
      ...brief.risks,
      ...brief.watchConditions,
    ].filter((item) => item !== headline)
  ).slice(0, compact ? 3 : 4);
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
