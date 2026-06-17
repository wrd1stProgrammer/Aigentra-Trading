"use client";

import { CheckCircle, ListChecks, Target, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import type { ReviewBrief } from "@/lib/review-brief";

type ReviewBriefSummaryProps = {
  brief: ReviewBrief;
  title: string;
  compact?: boolean;
  t: (key: string) => string;
};

export function ReviewBriefSummary({ brief, title, compact = false, t }: ReviewBriefSummaryProps) {
  const headline = brief.headline ?? brief.action ?? brief.managerNote ?? "-";
  return (
    <div className={`border-l-2 border-emerald-500/70 pl-3 ${compact ? "py-1" : "py-2"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="metric-label">{title}</div>
        {brief.verdict ? <StatusBadge tone="neutral">{brief.verdict}</StatusBadge> : null}
      </div>
      <p className={`${compact ? "mt-1 text-xs leading-5" : "mt-2 text-sm leading-6"} text-zinc-800 dark:text-zinc-100`}>
        {headline}
      </p>
      {brief.action && brief.action !== headline ? (
        <div className="mt-2 flex gap-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
          <CheckCircle className="mt-0.5 shrink-0 text-emerald-500" size={15} />
          <span><span className="font-semibold">{t("aiReview.nextAction")}:</span> {brief.action}</span>
        </div>
      ) : null}
      <div className="mt-3 space-y-2">
        <BriefSummaryLine icon={<ListChecks size={15} />} label={t("aiReview.keyReasons")} items={brief.keyReasons} />
        <BriefSummaryLine icon={<WarningCircle size={15} />} label={t("aiReview.risks")} items={brief.risks} />
        <BriefSummaryLine icon={<Target size={15} />} label={t("aiReview.watchConditions")} items={brief.watchConditions} />
      </div>
      {brief.managerNote ? (
        <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          <span className="font-semibold">{t("aiReview.managerNote")}:</span> {brief.managerNote}
        </p>
      ) : null}
    </div>
  );
}

function BriefSummaryLine({ icon, label, items }: { icon: ReactNode; label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-zinc-100/70 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300 sm:flex-row sm:items-start">
      <div className="flex min-w-28 shrink-0 items-center gap-1.5 font-semibold text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <p className="min-w-0 flex-1">{items.join(" · ")}</p>
    </div>
  );
}
