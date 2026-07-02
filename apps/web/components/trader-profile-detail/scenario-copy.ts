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
const ENTRY_SIGNAL_PATTERN =
  /진입|페이드|채널|돌파|리클레임|반등|되돌림|거부|저항|지지|다이버전스|압력|청산|RSI|VWAP|EMA|상단|하단|entry|fade|channel|breakout|reclaim|support|resistance|divergence/i;
const RISK_CONTROL_PATTERN = /손절|익절|목표|손익비|수수료|리스크|위험|손실|레버리지|stop|target|risk|RR|fee|loss|leverage/i;

export function scenarioDisplayText(value: unknown, t: Translator) {
  if (typeof value !== "string" || !value.trim()) return "-";
  const trimmed = value.trim();
  const mapped = DISPLAY_TEXT_KEYS.find(([pattern]) => pattern.test(trimmed));
  if (mapped) return t(mapped[1]);
  return INLINE_TEXT_KEYS.reduce((text, [pattern, key]) => text.replace(pattern, t(key)), trimmed);
}

export function scenarioDetailRationaleText(scenario: TraderScenario, t: Translator): string {
  switch (scenario.source) {
    case "position":
    case "order":
      return entryApprovalRationaleText(scenario.rationale, t) || t("detail.noAiRationale");
    case "review":
    case "event":
    case "strategy":
      return cleanReviewDisplayText(scenario.rationale, 0) || t("detail.noAiRationale");
  }
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

function entryApprovalRationaleText(value: unknown, t: Translator): string {
  const text = cleanReviewDisplayText(value, 0);
  if (!text || !shouldStructureEntryApprovalText(text)) return text;

  const [firstSentence, ...restSentences] = splitSentences(text);
  const firstClauses = splitClauses(firstSentence ?? "");
  const entryDecision = normalizeEntryClause(firstClauses[0] ?? firstSentence ?? text);
  const strategyRead = normalizeEntryClause(firstClauses.slice(1).join(", ") || restSentences.find((item) => !RISK_CONTROL_PATTERN.test(item)) || firstSentence || text);
  const riskCondition = restSentences.find((item) => RISK_CONTROL_PATTERN.test(item)) ?? restSentences[0] ?? firstClauses.slice(1).join(", ");

  return [
    labeledLine(t("aiReview.entryDecision"), entryDecision),
    labeledLine(t("aiReview.strategyInterpretation"), strategyRead),
    labeledLine(t("aiReview.riskCondition"), riskCondition)
  ]
    .filter(Boolean)
    .join(" ");
}

function shouldStructureEntryApprovalText(text: string): boolean {
  if (text.length < 180) return false;
  return ENTRY_SIGNAL_PATTERN.test(text) && RISK_CONTROL_PATTERN.test(text);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitClauses(text: string): string[] {
  return text
    .split(/,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEntryClause(text: string): string {
  return text
    .replace(/\s*있으며$/u, " 있습니다")
    .replace(/\s*이며$/u, "입니다")
    .replace(/\s*하고$/u, "합니다")
    .replace(/\s*and$/iu, "")
    .trim();
}

function labeledLine(label: string, text: string | undefined): string {
  const value = cleanReviewDisplayText(text, 0);
  return value ? `${label}: ${value}` : "";
}

function normalizeText(values: readonly unknown[]) {
  return values
    .map((value) => String(value ?? ""))
    .join(" ")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}
