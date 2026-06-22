"use client";

import { Brain, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { ManagementReview, PaperOrder, PaperPosition, RunCycleResult, TraderPaperState } from "@/lib/api";
import { useAppContext } from "@/components/app-provider";
import { ReviewBriefSummary } from "@/components/review-brief-summary";
import { StatusBadge } from "@/components/status-badge";
import { reviewBriefFromRecord, structuredReviewValue } from "@/lib/review-brief";
import { statusLabel } from "@/lib/status";

type TradePlanView = {
  status?: string;
  side?: string | null;
  entries?: Array<{ price: number; weight: number; reason: string }>;
  stopLoss?: number | null;
  takeProfits?: Array<{ price: number; weight: number; reason: string }>;
  riskPercent?: number | null;
  notes?: string[];
};

export function AIReviewPanel({
  result,
  paperState,
  paperPositions = [],
  paperOrders = [],
  managementReviews = []
}: {
  result: RunCycleResult | null;
  paperState?: TraderPaperState | null;
  paperPositions?: Array<PaperPosition | Record<string, any>>;
  paperOrders?: Array<PaperOrder | Record<string, any>>;
  managementReviews?: Array<ManagementReview | Record<string, any>>;
}) {
  const { t } = useAppContext();
  const review = result?.aiReview ?? null;
  const entryBrief = structuredReviewValue(review?.structuredReview);
  const candidate = result?.candidate ?? null;
  const plan = (result?.tradePlan ?? null) as TradePlanView | null;
  const runPaperPosition = result?.paperPosition ? [result.paperPosition] : [];
  const runPaperOrder = result?.paperOrder ? [result.paperOrder] : [];
  const runManagementReviews = Array.isArray(result?.managementReviews) ? result.managementReviews : [];
  const visiblePositions = [...paperPositions, ...runPaperPosition].filter(Boolean);
  const visibleOrders = [...paperOrders, ...runPaperOrder].filter(Boolean);
  const visibleManagementReviews = [...runManagementReviews, ...managementReviews].filter(Boolean);

  if (!result && !paperState && !visiblePositions.length && !visibleOrders.length && !visibleManagementReviews.length) {
    return (
      <section className="panel flex min-h-[360px] flex-col justify-between p-5">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Brain size={18} />
            <h2 className="text-lg font-semibold">{t("aiReview.title")}</h2>
          </div>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{t("aiReview.waiting")}</p>
        </div>
        <PaperNotice text={t("paper.notice")} />
      </section>
    );
  }

  const planReady = plan?.status === "PAPER_TRADING_PENDING";
  const heading = result ? `${result.trader} / ${result.symbol}` : paperState?.traderName ?? paperState?.traderId ?? t("paper.title");

  return (
    <section className="panel min-h-[360px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
            <Brain size={18} />
            <h2 className="text-lg font-semibold">{t("aiReview.title")}</h2>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {heading}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={candidate?.created ? "good" : "neutral"}>
            {candidate?.created ? t("aiReview.candidateReady") : t("aiReview.noCandidate")}
          </StatusBadge>
          <StatusBadge tone={planReady ? "good" : "neutral"}>{statusLabel(plan?.status ?? "NO_PLAN", t)}</StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniMetric label={t("aiReview.setup")} value={candidate?.setupType ?? "-"} />
        <MiniMetric label={t("aiReview.score")} value={String(candidate?.setupScore ?? "-")} />
        <MiniMetric label={t("aiReview.side")} value={candidate?.side ?? "-"} />
        <MiniMetric label={t("aiReview.riskPercent")} value={plan?.riskPercent ? `${plan.riskPercent}%` : "-"} />
      </div>

      <div className="mt-4">
        <PaperNotice text={t("paper.notice")} />
      </div>

      {paperState || visiblePositions.length || visibleOrders.length ? (
        <div className="mt-5 space-y-3">
          {paperState ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label={t("common.status")} value={statusLabel(paperState.status ?? paperState.mode ?? "paper", t)} />
              <MiniMetric label={t("common.equity")} value={formatNumber(paperState.equity)} />
              <MiniMetric label={t("paper.unrealizedPnl")} value={formatNumber(paperState.unrealizedPnl)} />
              <MiniMetric label={t("paper.lastRun")} value={paperState.lastRunAt ?? paperState.updatedAt ?? "-"} />
            </div>
          ) : null}
          {visiblePositions.length ? <CompactList title={t("paper.activePositions")} items={visiblePositions as Array<Record<string, any>>} kind="position" /> : null}
          {visibleOrders.length ? <CompactList title={t("paper.orders")} items={visibleOrders as Array<Record<string, any>>} kind="order" /> : null}
        </div>
      ) : null}

      {visibleManagementReviews.length ? (
        <div className="mt-5">
          <CompactManagementReviews reviews={visibleManagementReviews as Array<Record<string, any>>} />
        </div>
      ) : null}

      {review ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <ReviewBadge label={t("aiReview.decision")} value={statusLabel(review.decision, t)} tone={decisionTone(review.decision)} />
            <ReviewBadge label={t("aiReview.confidence")} value={`${review.confidence}%`} tone="neutral" />
            <ReviewBadge label={t("aiReview.riskLevel")} value={review.riskLevel} tone={review.riskLevel === "HIGH" || review.riskLevel === "EXTREME" ? "warn" : "good"} />
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <StatusBadge tone={review.provider === "mock" ? "neutral" : "warn"}>{review.provider}</StatusBadge>
            <StatusBadge tone="neutral">{review.model}</StatusBadge>
            {review.fallback ? <StatusBadge tone="warn">{t("aiReview.fallback")}</StatusBadge> : null}
          </div>

          {entryBrief ? (
            <ReviewBriefSummary brief={entryBrief} title={t("aiReview.approvalReason")} t={t} />
          ) : (
            <ReasonBlock icon={<CheckCircle size={17} />} title={t("aiReview.approvalReason")} text={review.approvalReason} />
          )}
          {!entryBrief || !entryBrief.risks.length ? (
            <ReasonBlock icon={<WarningCircle size={17} />} title={t("aiReview.counterThesis")} text={review.counterThesis} />
          ) : null}
          <ReviewFacts facts={review.reviewFacts} />

          {review.adjustments.length ? (
            <div>
              <div className="metric-label mb-2">{t("aiReview.adjustments")}</div>
              <ul className="space-y-2">
                {review.adjustments.map((item, index) => (
                  <li key={`${index}-${item}`} className="rounded-md bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-800 dark:text-amber-200">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-lg bg-zinc-100 p-4 text-sm leading-6 text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300">
          <div className="metric-label mb-2">{candidate?.created === false ? t("aiReview.firstStageFailed") : t("aiReview.noReview")}</div>
          {candidate?.reason ?? t("aiReview.noReviewReason")}
        </div>
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="metric-label">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50" title={value}>
        {value}
      </div>
    </div>
  );
}

function ReviewBadge({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="metric-label mb-2">{label}</div>
      <StatusBadge tone={tone}>
        <span className="break-all leading-tight">{value}</span>
      </StatusBadge>
    </div>
  );
}

function ReasonBlock({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800/70">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        {icon}
        {title}
      </div>
      <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">{text}</p>
    </div>
  );
}

function PaperNotice({ text }: { text: string }) {
  const { t } = useAppContext();

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
      <span className="font-semibold">{t("common.paperOnly")}.</span> {text}
    </div>
  );
}

function CompactList({ title, items, kind }: { title: string; items: Array<Record<string, any>>; kind: "position" | "order" }) {
  const { t } = useAppContext();
  return (
    <div>
      <div className="metric-label mb-2">{title}</div>
      <div className="space-y-2">
        {items.slice(0, 3).map((item, index) => {
          const price = kind === "position"
            ? firstValue(item.entryPrice, item.averageEntryPrice, item.avgEntryPrice, item.openPrice)
            : firstValue(item.price, item.stopPrice, item.triggerPrice, item.limitPrice);
          return (
            <div key={`${kind}-${item.id ?? index}`} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{item.symbol ?? "-"}</span>
                <StatusBadge tone="warn">{statusLabel(item.status ?? "paper", t)}</StatusBadge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{item.side ?? "-"}</span>
                <span>{formatNumber(firstValue(item.quantity, item.size))}</span>
                <span>{formatNumber(price)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactManagementReviews({ reviews }: { reviews: Array<Record<string, any>> }) {
  const { t } = useAppContext();
  return (
    <div>
      <div className="metric-label mb-2">{t("paper.managementReviews")}</div>
      <div className="space-y-2">
        {reviews.slice(0, 3).map((review, index) => {
          const decision = firstValue(review.action, review.decision, review.status, review.recommendation);
          const details = managementDetails(review, t);
          return (
            <div key={`management-review-${review.id ?? review.runId ?? index}`} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{String(firstValue(review.traderName, review.traderId, review.symbol, "-"))}</span>
                <StatusBadge tone={managementTone(String(decision ?? ""))}>{statusLabel(decision ?? "review", t)}</StatusBadge>
              </div>
              <div className="mt-3 grid gap-2">
                <ManagementDetail label={t("aiReview.eventPhase")} value={details.eventPhase} />
                <ManagementDetail label={t("aiReview.eventReason")} value={details.eventReason} />
                {details.brief ? (
                  <ReviewBriefSummary brief={details.brief} title={t("aiReview.rationale")} compact t={t} />
                ) : (
                  <ManagementDetail label={t("aiReview.rationale")} value={details.rationale} />
                )}
                <ManagementDetail label={t("aiReview.reviewFacts")} value={details.reviewFacts} />
                <ManagementDetail label={t("aiReview.appliedActions")} value={details.appliedActions} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                {review.confidence !== undefined && review.confidence !== null ? <span>{t("aiReview.confidence")} {formatNumber(review.confidence)}</span> : null}
                {review.provider ? <span>{review.provider}</span> : null}
                <span>{review.updatedAt ?? review.createdAt ?? review.timestamp ?? "-"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManagementDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-800/70">
      <div className="metric-label mb-1">{label}</div>
      <div className="line-clamp-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{value}</div>
    </div>
  );
}

function managementDetails(review: Record<string, any>, t: (key: string) => string) {
  const payload = review.payload ?? {};
  const event = review.event ?? payload.event ?? {};
  const nestedReview = review.review ?? payload.review ?? review.raw ?? {};
  return {
    eventPhase: statusLabel(firstValue(event.phase, review.phase, review.eventPhase), t),
    eventReason: formatText(firstValue(event.reason, review.reason, review.managementReason)),
    brief: reviewBriefFromRecord(review),
    rationale: formatText(firstValue(nestedReview.rationale, review.rationale)),
    reviewFacts: formatReviewFacts(firstValue(nestedReview.reviewFacts, review.reviewFacts), t),
    appliedActions: formatActionList(firstValue(payload.appliedActions, review.appliedActions, nestedReview.appliedActions, review.actionsApplied, nestedReview.actions, review.actions), t)
  };
}

function ReviewFacts({ facts }: { facts?: Array<Record<string, any>> | null }) {
  const { t } = useAppContext();
  const labels = reviewFactLabels(facts, t);
  if (!labels.length) return null;
  return (
    <div>
      <div className="metric-label mb-2">{t("aiReview.reviewFacts")}</div>
      <div className="flex flex-wrap gap-2">
        {labels.map((label, index) => (
          <span key={`${label}-${index}`} className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatText(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function formatReviewFacts(value: unknown, t: (key: string) => string) {
  const labels = reviewFactLabels(value, t);
  return labels.length ? labels.join(", ") : "-";
}

function reviewFactLabels(value: unknown, t: (key: string) => string) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return statusLabel(item, t);
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const labelKey = typeof record.labelKey === "string" ? record.labelKey : null;
      const code = typeof record.code === "string" ? record.code : null;
      const key = labelKey ?? (code ? `reviewFact.${code}` : null);
      if (!key) return null;
      const translated = t(key);
      return translated === key && code ? humanizeReviewCode(code) : translated;
    })
    .filter((label): label is string => Boolean(label));
}

function humanizeReviewCode(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function formatNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) return value ? String(value) : "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(numberValue);
}

function decisionTone(decision: string): "good" | "warn" | "bad" | "neutral" {
  if (decision === "APPROVE") return "good";
  if (decision === "ADJUST_AND_APPROVE" || decision === "DEFER" || decision === "NEEDS_MORE_DATA") return "warn";
  if (decision === "REJECT") return "bad";
  return "neutral";
}

function managementTone(value: string): "good" | "warn" | "bad" | "neutral" {
  const normalized = value.toUpperCase();
  if (normalized.includes("HOLD") || normalized.includes("KEEP") || normalized.includes("MAINTAIN")) return "good";
  if (normalized.includes("REDUCE") || normalized.includes("ADJUST") || normalized.includes("WATCH")) return "warn";
  if (normalized.includes("CLOSE") || normalized.includes("EXIT") || normalized.includes("REJECT")) return "bad";
  return "neutral";
}
