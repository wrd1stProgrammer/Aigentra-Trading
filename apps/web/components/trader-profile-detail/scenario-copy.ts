import type { TraderScenario } from "@/lib/league";
import { cleanReviewDisplayText } from "@/lib/review-display";
import type { ScenarioImportance, Translator } from "@/components/trader-profile-detail/types";

const DISPLAY_TEXT_KEYS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^scale_entry_cancelled 이벤트를 감지했고 staged_pullback 보유 정책 안에서 CANCEL_REMAINING_ORDERS 조치를 검토했습니다\.$/i, "scenario.reason.scaleEntryCancelledCancelRemaining"],
  [/^Pullback Architect의 order 상태에 대해 CANCEL_REMAINING_ORDERS 관리 판단을 기록했습니다\.$/i, "scenario.reason.pullbackOrderCancelSummary"],
  [/^EMA50 decision band failed before all scales filled\.$/i, "scenario.reason.ema50DecisionBandFailed"],
  [/^continuation confirmation$/i, "scenario.reason.continuationConfirmation"],
  [/^channel edge probe$/i, "scenario.reason.channelEdgeProbe"],
  [/^15m confirmation$/i, "scenario.reason.confirmation15m"],
  [/^pending entry order$/i, "scenario.reason.pendingEntryOrder"],
  [/^active simulated position$/i, "scenario.reason.activePaperPosition"],
  [/^ai management review$/i, "scenario.reason.aiManagementReview"],
  [/^scale_entry_cancelled$/i, "scenario.reason.scaleEntryCancelledShort"],
  [/^channel_stop_tightened$/i, "scenario.reason.channelStopTightened"],
  [/^move stop$/i, "scenario.reason.moveStop"],
  [/^hold$/i, "scenario.reason.hold"]
];
const INLINE_TEXT_KEYS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bposition closed:\s*take_profit\b/gi, "detail.resultReasonTakeProfit"],
  [/\bposition closed:\s*stop_loss\b/gi, "detail.resultReasonStopLoss"],
  [/\bposition_closed\b/gi, "status.positionClosed"],
  [/\btake_profit\b/gi, "detail.resultTakeProfit"],
  [/\bstop_loss\b/gi, "detail.resultStopLoss"],
  [/\bbreakeven\b/gi, "detail.resultBreakeven"],
  [/\bcontinuation confirmation\b/gi, "scenario.reason.continuationConfirmation"],
  [/EMA50 decision band failed before all scales filled\./gi, "scenario.reason.ema50DecisionBandFailed"],
  [/\bscale_entry_cancelled\b/gi, "scenario.reason.scaleEntryCancelledShort"],
  [/\bstaged_pullback\b/gi, "scenario.reason.stagedPullback"],
  [/\bCANCEL_REMAINING_ORDERS\b/g, "scenario.reason.cancelRemainingOrders"],
  [/\bchannel_stop_tightened\b/gi, "scenario.reason.channelStopTightenedShort"],
  [/\bmove_stop_to_breakeven\b/gi, "scenario.reason.moveStopToBreakeven"],
  [/\bmove stop to breakeven\b/gi, "scenario.reason.moveStopToBreakeven"],
  [/\bhard risk\b/gi, "scenario.reason.hardRisk"]
];

const CRITICAL_KEYS = ["LIQUIDATION", "STOP_LOSS", "CLOSE_POSITION", "FORCE_EXIT", "CANCEL_REMAINING_ORDERS"];
const IMPORTANT_KEYS = ["MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "STOP_UPDATED_BY_AI", "REDUCE", "TAKE_PARTIAL_PROFIT", "PARTIAL_TAKE_PROFIT"];
const WATCH_KEYS = ["PENDING_ORDER", "OPEN_POSITION", "HOLD", "REVIEW", "CONTINUATION", "CONFIRMATION"];

export function scenarioDisplayText(value: unknown, t: Translator) {
  if (typeof value !== "string" || !value.trim()) return "-";
  const trimmed = value.trim();
  const mapped = DISPLAY_TEXT_KEYS.find(([pattern]) => pattern.test(trimmed));
  if (mapped) return t(mapped[1]);
  return INLINE_TEXT_KEYS.reduce((text, [pattern, key]) => text.replace(pattern, t(key)), trimmed);
}

export function scenarioDetailRationaleText(scenario: TraderScenario, t: Translator): string {
  const fallbackKey =
    scenario.source === "review"
      ? "scenario.fallback.managementReviewPendingTranslation"
      : "scenario.fallback.entryReviewPendingTranslation";
  const localizedFallback = t(fallbackKey);
  switch (scenario.source) {
    case "position":
    case "order":
      return localizedRationaleText(cleanReviewDisplayText(scenario.rationale, 0), localizedFallback, fallbackKey, t);
    case "review":
    case "event":
    case "strategy":
      return localizedRationaleText(cleanReviewDisplayText(scenario.rationale, 0), localizedFallback, fallbackKey, t);
  }
}

function localizedRationaleText(value: string, localizedFallback: string, fallbackKey: string, t: Translator) {
  if (!value) return t("detail.noAiRationale");
  if (isLocalizedScreen(t) && looksLikeEnglishReviewProse(value) && localizedFallback !== fallbackKey) return localizedFallback;
  return value;
}

function looksLikeEnglishReviewProse(value: string) {
  if (/[가-힣]/.test(value)) return false;
  const words = value.match(/[A-Za-z]{3,}/g) ?? [];
  return words.length >= 6 && /\b(the|and|with|but|entry|position|short|long|price|stop|target|market|approve|invalidation)\b/i.test(value);
}

function isLocalizedScreen(t: Translator) {
  const dashboard = t("nav.dashboard");
  return dashboard !== "nav.dashboard" && dashboard !== "Dashboard";
}

export function scenarioImportance(scenario: TraderScenario): ScenarioImportance {
  const haystack = normalizeText([
    scenario.eventType,
    scenario.action,
    scenario.status,
    scenario.phase,
    scenario.title,
    scenario.rationale,
    scenario.summary
  ]);
  if (CRITICAL_KEYS.some((key) => haystack.includes(key))) return "critical";
  if (IMPORTANT_KEYS.some((key) => haystack.includes(key))) return "important";
  if (Number(scenario.confidence ?? 0) >= 85) return "important";
  if (WATCH_KEYS.some((key) => haystack.includes(key))) return "watch";
  return "routine";
}

export function importanceBadge(importance: ScenarioImportance, t: Translator) {
  const label = t(`importance.${importance}`);
  if (importance === "critical") {
    return {
      label,
      className: "bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-300",
      dotClassName: "bg-rose-500"
    };
  }
  if (importance === "important") {
    return {
      label,
      className: "bg-amber-500/14 text-amber-800 ring-amber-500/30 dark:text-amber-200",
      dotClassName: "bg-amber-500"
    };
  }
  if (importance === "watch") {
    return {
      label,
      className: "bg-sky-500/12 text-sky-700 ring-sky-500/30 dark:text-sky-300",
      dotClassName: "bg-sky-500"
    };
  }
  return {
    label,
    className: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800",
    dotClassName: "bg-zinc-400"
  };
}

function normalizeText(values: readonly unknown[]) {
  return values
    .map((value) => String(value ?? ""))
    .join(" ")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}
