import type { ManagementReview, PaperPosition, PaperTradeEvent } from "@/lib/api";
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { LeagueSymbol, TraderScenario } from "@/lib/league";
import { statusLabel } from "@/lib/status";
import { normalizePlan } from "@/components/trader-profile-detail/plan";
import { buildRealizedEventTimelineItems } from "@/components/trader-profile-detail/realized-events";
import { dedupeScenarioTimelineScenarios } from "@/components/trader-profile-detail/scenario-dedupe";
import { scenarioDisplayText, scenarioImportance } from "@/components/trader-profile-detail/scenario-copy";
import { sortTimelineItemsByRecency, timelineTimeValue } from "@/components/trader-profile-detail/timeline-sort";
import type { PlanRecord, PlanView, TimelineItem, TradeHistoryItem, Translator } from "@/components/trader-profile-detail/types";

const POSITION_JOURNAL_EVENT_TYPES = [
  "POSITION_CLOSED",
  "TAKE_PROFIT",
  "PARTIAL_TAKE_PROFIT",
  "TAKE_PARTIAL_PROFIT",
  "STOP_LOSS",
  "LIQUIDATION",
  "CLOSE_POSITION",
  "POSITION_REDUCED_BY_AI",
  "REDUCE_SIZE",
  "REDUCE_RISK"
] as const;

export function buildScenarioTimelineItems({
  scenarios,
  events,
  latestPlan,
  reviews,
  locale,
  t
}: {
  scenarios: TraderScenario[];
  events: PaperTradeEvent[];
  latestPlan: PlanView;
  reviews: ManagementReview[];
  locale: Locale;
  t: Translator;
}): TimelineItem[] {
  const items: TimelineItem[] = buildRealizedEventTimelineItems({ events, locale, t });
  if (latestPlan.entries.length || latestPlan.status) {
    const entryPrice = latestPlan.entries[0]?.price ?? null;
    const title = `${statusLabel(latestPlan.status, t)} ${latestPlan.side ? latestPlan.side.toUpperCase() : ""}`.trim();
    items.push({
      id: "latest-plan",
      time: latestPlan.createdAt ? formatDateTime(latestPlan.createdAt, locale) : "-",
      title,
      body: scenarioDisplayText(latestPlan.notes[0] ?? latestPlan.entries[0]?.reason ?? t("detail.planEntryReady"), t),
      importance: "watch",
      movement: latestPlan.side ? latestPlan.side.toUpperCase() : statusLabel(latestPlan.status, t),
      movementTone: latestPlan.side?.toUpperCase() === "SHORT" ? "bad" : "good",
      priceLabel: entryPrice === null ? "-" : `${t("common.price")} ${formatNumber(entryPrice, 0, locale)}`,
      iconLabel: latestPlan.side?.slice(0, 1) ?? "P",
      sortMs: timelineTimeValue(latestPlan.createdAt)
    });
  }

  for (const scenario of dedupeScenarioTimelineScenarios(scenarios)) {
    const movement = scenario.side ? scenario.side.toUpperCase() : statusLabel(scenario.action ?? scenario.status, t);
    const price = scenario.price ?? scenario.target ?? scenario.stop ?? null;
    const matchingReview = reviews.find((review) => `review-${review.id}` === scenario.id);
    items.push({
      id: scenario.id,
      time: scenario.createdAt ? formatDateTime(scenario.createdAt, locale) : "-",
      title: scenarioTitle(scenario, t),
      body: scenarioDisplayText(scenarioTimelineBody(scenario, matchingReview, t), t),
      importance: scenarioImportance(scenario),
      movement,
      movementTone: scenarioTone(scenario),
      priceLabel: price === null ? "-" : `${t("common.price")} ${formatNumber(price, 0, locale)}`,
      iconLabel: scenario.source.slice(0, 2).toUpperCase(),
      sortMs: timelineTimeValue(scenario.createdAt),
      scenario
    });
  }

  return sortTimelineItemsByRecency(items);
}

function scenarioTimelineBody(scenario: TraderScenario, matchingReview: ManagementReview | undefined, t: Translator): string {
  if (scenario.source === "review" && matchingReview?.userSummary) return matchingReview.userSummary;
  if (scenario.source === "review" && scenario.summary) return scenario.summary;
  if (scenario.rationale) return scenario.rationale;
  if (scenario.source === "order" || scenario.source === "position") return t("detail.noAiRationale");
  return scenario.summary ?? "-";
}

export function buildTradeHistoryItems({
  events,
  closedPositions = [],
  reviews: _reviews,
  plans: _plans,
  symbol,
  locale,
  t,
  limit = 12
}: {
  events: PaperTradeEvent[];
  closedPositions?: PaperPosition[];
  reviews: ManagementReview[];
  plans: PlanRecord[];
  symbol: LeagueSymbol;
  locale: Locale;
  t: Translator;
  limit?: number;
}): TradeHistoryItem[] {
  const closeEvents = events.filter(isPositionJournalEvent);
  const positionItems = closedPositions
    .filter((position) => !position.symbol || position.symbol === symbol)
    .map((position, index) => {
      const event = matchingCloseEventForPosition(position, closeEvents);
      const pnl = firstFiniteNumber(position.realizedPnl, position.realized_pnl, event?.realizedPnl, event?.realized_pnl);
      const quantity = firstFiniteNumber(position.quantity, position.size, event?.quantity);
      return {
        item: buildClosedPositionHistoryItem({ position, event, index, symbol, locale, t }),
        sortMs: timelineTimeValue(position.closedAt ?? position.updatedAt ?? position.createdAt ?? event?.createdAt ?? event?.timestamp),
        raw: { pnl, quantity }
      };
    });
  const knownClosedPositionIds = new Set(closedPositions.map((position) => normalizedId(position.id)).filter(isPresentString));
  const fallbackEventItems = closeEvents
    .filter((event) => {
      const positionId = eventPositionId(event);
      const isClosed = Boolean(positionId && knownClosedPositionIds.has(positionId));
      if (isClosed) {
        return !isFinalCloseEvent(event);
      }
      return true;
    })
    .map((event, index) => {
      const pnl = firstFiniteNumber(event.realizedPnl, event.realized_pnl, recordValue(event.payload)?.realizedPnl);
      const quantity = firstFiniteNumber(event.quantity);
      return {
        item: buildClosedEventHistoryItem({ event, events, index, symbol, locale, t }),
        sortMs: timelineTimeValue(event.createdAt ?? event.timestamp),
        raw: { pnl, quantity }
      };
    });

  const mergedMap = new Map<string, {
    item: TradeHistoryItem;
    sortMs: number;
    raw: { pnl: number | null; quantity: number | null };
  }>();

  for (const entry of [...positionItems, ...fallbackEventItems]) {
    const { item, sortMs, raw } = entry;
    const key = `${item.time}-${item.sideLabel}-${item.entryLabel}-${item.exitLabel}-${item.action}-${item.label}`;
    
    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key)!;
      const newPnl = (existing.raw.pnl ?? 0) + (raw.pnl ?? 0);
      const newQuantity = (existing.raw.quantity ?? 0) + (raw.quantity ?? 0);
      
      existing.raw.pnl = newPnl;
      existing.raw.quantity = newQuantity;
      existing.item.pnlLabel = newPnl === null ? "-" : formatCurrency(newPnl, locale);
      existing.item.pnlTone = pnlTone(newPnl);
      existing.item.quantity = formatTradeQuantity(newQuantity, null, locale);
      
      if (existing.item.basisDetail !== item.basisDetail && item.basisDetail) {
        if (!existing.item.basisDetail.includes(item.basisDetail)) {
          existing.item.basisDetail = `${existing.item.basisDetail}\n${item.basisDetail}`;
        }
      }
      if (sortMs > existing.sortMs) {
        existing.sortMs = sortMs;
      }
    } else {
      mergedMap.set(key, {
        item: { ...item },
        sortMs,
        raw: { ...raw }
      });
    }
  }

  return Array.from(mergedMap.values())
    .sort((left, right) => right.sortMs - left.sortMs)
    .map(({ item }) => item)
    .slice(0, limit);
}

function buildClosedPositionHistoryItem({
  position,
  event,
  index,
  symbol,
  locale,
  t
}: {
  position: PaperPosition;
  event?: PaperTradeEvent;
  index: number;
  symbol: LeagueSymbol;
  locale: Locale;
  t: Translator;
}): TradeHistoryItem {
  const payload = recordValue(position.payload);
  const eventPayload = recordValue(event?.payload);
  const reason = firstString(
    position.closeReason,
    position.close_reason,
    payload?.closeReason,
    payload?.reason,
    eventPayload?.reason,
    event?.reason,
    event?.message
  );
  const pnl = firstFiniteNumber(position.realizedPnl, position.realized_pnl, event?.realizedPnl, event?.realized_pnl, eventPayload?.realizedPnl);
  const result = tradeResultFromValues({ eventType: event?.eventType ?? event?.type ?? position.closeReason, reason, pnl, t });
  const entryPrice = firstFiniteNumber(
    position.averageEntryPrice,
    position.avgEntryPrice,
    position.entryPrice,
    position.entry_price,
    payload?.averageEntryPrice,
    payload?.entryPrice,
    eventPayload?.averageEntryPrice,
    eventPayload?.entryPrice
  );
  const exitPrice = firstFiniteNumber(position.exitPrice, position.exit_price, position.closePrice, event?.price, event?.exitPrice, eventPayload?.exitPrice);
  const quantity = firstFiniteNumber(position.quantity, position.size, event?.quantity);
  const leverage = firstFiniteNumber(position.leverage, payload?.leverage, eventPayload?.leverage, recordValue(payload?.leveragePlan)?.suggestedLeverage);
  return {
    id: `position-${position.id ?? event?.id ?? index}`,
    time: formatDateTime(position.closedAt ?? position.closed_at ?? position.updatedAt ?? event?.createdAt ?? event?.timestamp, locale),
    action: t("detail.closeTrade"),
    actionTone: result.tone,
    label: position.symbol ?? event?.symbol ?? symbol,
    quantity: formatTradeQuantity(quantity, null, locale),
    basis: t("detail.basis"),
    basisDetail: result.detail,
    priceLabel: exitPrice === null ? undefined : `${t("common.price")} ${formatNumber(exitPrice, 0, locale)}`,
    sideLabel: sideLabel(position.side ?? payload?.side ?? eventPayload?.side ?? event?.side, t),
    leverageLabel: leverageLabel(leverage, locale),
    entryLabel: entryPrice === null ? "-" : formatNumber(entryPrice, 0, locale),
    exitLabel: exitPrice === null ? "-" : formatNumber(exitPrice, 0, locale),
    pnlLabel: pnl === null ? "-" : formatCurrency(pnl, locale),
    pnlTone: pnlTone(pnl),
    resultLabel: result.label,
    isPositionAction: true
  };
}

function buildClosedEventHistoryItem({
  event,
  events,
  index,
  symbol,
  locale,
  t
}: {
  event: PaperTradeEvent;
  events: PaperTradeEvent[];
  index: number;
  symbol: LeagueSymbol;
  locale: Locale;
  t: Translator;
}): TradeHistoryItem {
  const payload = recordValue(event.payload);
  const relatedRecords = eventRelatedRecords(event, events);
  const reason = firstString(event.closeReason, payload?.closeReason, payload?.reason, event.reason, event.message);
  const pnl = firstFiniteNumber(event.realizedPnl, event.realized_pnl, payload?.realizedPnl, payload?.pnl);
  const result = tradeResultFromValues({ eventType: event.eventType ?? event.type, reason, pnl, t });
  const entryPrice = firstFiniteNumber(
    event.entryPrice,
    event.openPrice,
    payload?.entryPrice,
    payload?.averageEntryPrice,
    firstFilledEventPrice(event, events)
  );
  const exitPrice = firstFiniteNumber(event.exitPrice, event.closePrice, event.price, payload?.exitPrice, payload?.closePrice);
  const leverage = firstFiniteNumber(event.leverage, payload?.leverage, firstFiniteFromRecords(relatedRecords, ["leverage", "suggestedLeverage"]));
  const side = firstString(event.side, payload?.side, firstStringFromRecords(relatedRecords, ["side"]));
  return {
    id: `event-${event.id ?? index}`,
    time: event.createdAt ? formatDateTime(event.createdAt, locale) : "-",
    action: getEventActionLabel(event.eventType, event.type, t),
    actionTone: result.tone,
    label: event.symbol ?? symbol,
    quantity: formatTradeQuantity(event.quantity, null, locale),
    basis: t("detail.basis"),
    basisDetail: result.detail,
    priceLabel: exitPrice === null ? undefined : `${t("common.price")} ${formatNumber(exitPrice, 0, locale)}`,
    sideLabel: sideLabel(side, t),
    leverageLabel: leverageLabel(leverage, locale),
    entryLabel: entryPrice === null ? "-" : formatNumber(entryPrice, 0, locale),
    exitLabel: exitPrice === null ? "-" : formatNumber(exitPrice, 0, locale),
    pnlLabel: pnl === null ? "-" : formatCurrency(pnl, locale),
    pnlTone: pnlTone(pnl),
    resultLabel: result.label,
    isPositionAction: true
  };
}

function tradeResultFromValues({
  eventType,
  reason,
  pnl,
  t
}: {
  eventType: unknown;
  reason: unknown;
  pnl: number | null;
  t: Translator;
}): { label: string; tone: "good" | "bad" | "neutral"; detail: string } {
  const normalized = normalizeKey([eventType, reason].filter(Boolean).join(" "));
  if (normalized.includes("TAKE_PROFIT") || normalized.includes("PROFIT_PROTECT")) {
    return { label: t("detail.resultTakeProfit"), tone: "good", detail: t("detail.resultReasonTakeProfit") };
  }
  if (normalized.includes("STOP_LOSS") || normalized.includes("LIQUIDATION") || normalized.includes("THESIS_FAILURE")) {
    return { label: t("detail.resultStopLoss"), tone: "bad", detail: t("detail.resultReasonStopLoss") };
  }
  if (normalized.includes("BREAKEVEN") || normalized.includes("BREAK_EVEN")) {
    return { label: t("detail.resultBreakeven"), tone: "neutral", detail: t("detail.resultReasonBreakeven") };
  }
  if (typeof pnl === "number" && Number.isFinite(pnl)) {
    if (pnl > 0.01) return { label: t("detail.resultTakeProfit"), tone: "good", detail: t("detail.resultReasonTakeProfit") };
    if (pnl < -0.01) return { label: t("detail.resultStopLoss"), tone: "bad", detail: t("detail.resultReasonStopLoss") };
    return { label: t("detail.resultBreakeven"), tone: "neutral", detail: t("detail.resultReasonBreakeven") };
  }
  return { label: t("detail.resultBreakeven"), tone: "neutral", detail: t("detail.resultReasonBreakeven") };
}

function leverageLabel(value: number | null, locale: Locale) {
  if (value === null) return "-";
  return `x${formatNumber(value, value % 1 === 0 ? 0 : 1, locale)}`;
}

function pnlTone(value: number | null): TradeHistoryItem["pnlTone"] {
  if (value === null || Math.abs(value) <= 0.01) return "neutral";
  return value > 0 ? "good" : "bad";
}

function isFinalCloseEvent(event: PaperTradeEvent) {
  const normalized = normalizeKey(event.eventType ?? event.type);
  return (
    normalized.includes("POSITION_CLOSED") ||
    normalized.includes("CLOSE_POSITION") ||
    normalized.includes("STOP_LOSS") ||
    normalized.includes("LIQUIDATION") ||
    (normalized.includes("TAKE_PROFIT") && !normalized.includes("PARTIAL"))
  );
}

function getEventActionLabel(eventType: unknown, type: unknown, t: Translator): string {
  const normalized = normalizeKey(eventType ?? type);
  if (normalized.includes("PARTIAL_TAKE_PROFIT") || normalized.includes("TAKE_PARTIAL_PROFIT")) {
    return t("status.partialTakeProfit");
  }
  if (
    normalized.includes("REDUCE_SIZE") ||
    normalized.includes("POSITION_REDUCED_BY_AI") ||
    normalized.includes("REDUCE_RISK")
  ) {
    return t("status.positionReducedByAi");
  }
  return t("detail.closeTrade");
}

function matchingCloseEventForPosition(position: PaperPosition, events: PaperTradeEvent[]) {
  const positionId = normalizedId(position.id);
  const orderId = normalizedId(position.orderId ?? position.order_id);
  
  // Try to find the final close event first
  const finalEvent = events.find((event) => {
    const eventPosition = eventPositionId(event);
    const eventOrder = eventOrderId(event);
    const matchesPosition = Boolean((positionId && eventPosition === positionId) || (orderId && eventOrder === orderId));
    return matchesPosition && isFinalCloseEvent(event);
  });
  if (finalEvent) return finalEvent;

  // Fallback to any matching close event
  return events.find((event) => {
    const eventPosition = eventPositionId(event);
    const eventOrder = eventOrderId(event);
    return Boolean((positionId && eventPosition === positionId) || (orderId && eventOrder === orderId));
  });
}

function firstFilledEventPrice(event: PaperTradeEvent, events: PaperTradeEvent[]) {
  const positionId = eventPositionId(event);
  const orderId = eventOrderId(event);
  const filled = events.find((candidate) => {
    const normalized = normalizeKey(candidate.eventType ?? candidate.type);
    return (
      normalized.includes("ORDER_FILLED") &&
      ((positionId && eventPositionId(candidate) === positionId) || (orderId && eventOrderId(candidate) === orderId))
    );
  });
  return firstFiniteNumber(filled?.price, recordValue(filled?.payload)?.entryPrice);
}

function eventRelatedRecords(event: PaperTradeEvent, events: PaperTradeEvent[]) {
  const positionId = eventPositionId(event);
  const orderId = eventOrderId(event);
  const records: Record<string, unknown>[] = [];
  for (const candidate of events) {
    const matches =
      candidate === event ||
      (positionId && eventPositionId(candidate) === positionId) ||
      (orderId && eventOrderId(candidate) === orderId);
    if (!matches) continue;
    appendRecord(records, candidate);
    appendRecord(records, candidate.payload);
    appendRecord(records, recordValue(candidate.payload)?.leveragePlan);
  }
  return records;
}

function appendRecord(records: Record<string, unknown>[], value: unknown) {
  const record = recordValue(value);
  if (record) records.push(record);
}

function firstFiniteFromRecords(records: Record<string, unknown>[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = firstFiniteNumber(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function firstStringFromRecords(records: Record<string, unknown>[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = firstString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function eventPositionId(event: PaperTradeEvent) {
  const payload = recordValue(event.payload);
  return normalizedId(event.positionId ?? event.position_id ?? payload?.positionId ?? payload?.position_id);
}

function eventOrderId(event: PaperTradeEvent) {
  const payload = recordValue(event.payload);
  return normalizedId(event.orderId ?? event.order_id ?? payload?.orderId ?? payload?.order_id);
}

function normalizedId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function isPresentString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

export function scenarioTitle(scenario: TraderScenario, t: Translator) {
  if (scenario.source === "position") {
    return `${t("detail.openPosition")} ${scenario.side ? String(scenario.side).toUpperCase() : ""}`.trim();
  }
  if (scenario.source === "order") {
    const weight = scenario.entryWeight ? ` · ${formatPercent(scenario.entryWeight * 100).replace("+", "")}` : "";
    return `${t("detail.pendingEntry")} ${scenario.side ? String(scenario.side).toUpperCase() : ""}${weight}`.trim();
  }
  if (scenario.source === "review") {
    return managementReviewScenarioTitle(scenario, t);
  }
  return t("detail.watchScenario");
}

export function managementReviewScenarioTitle(scenario: TraderScenario, t: Translator) {
  const actionLabel = statusLabel(scenario.action ?? scenario.status, t);
  const eventLabel = statusLabel(scenario.eventType, t);
  const phaseLabel = scenarioPhaseLabel(scenario.phase, t);
  const sideLabel = scenario.side ? String(scenario.side).toUpperCase() : "";
  const primary = actionLabel !== "-" ? actionLabel : eventLabel !== "-" ? eventLabel : t("detail.phaseAiReview");
  const parts = [primary, phaseLabel, sideLabel].filter((part, index, arr) => part && part !== "-" && arr.indexOf(part) === index);
  return parts.join(" · ");
}

export function movementToneClass(tone: "good" | "bad" | "warn" | "neutral") {
  if (tone === "good") return "text-red-600 dark:text-red-400";
  if (tone === "bad") return "text-blue-600 dark:text-blue-400";
  if (tone === "warn") return "text-amber-700 dark:text-amber-300";
  return "text-zinc-500 dark:text-zinc-400";
}

function isPositionJournalEvent(event: PaperTradeEvent) {
  const normalized = normalizeKey(event.eventType ?? event.type);
  return POSITION_JOURNAL_EVENT_TYPES.some((item) => normalized.includes(item));
}

function scenarioPhaseLabel(phase: unknown, t: Translator) {
  const normalized = normalizeKey(phase);
  if (normalized.includes("PENDING_ORDER")) return t("detail.phaseOrder");
  if (normalized.includes("OPEN_POSITION")) return t("detail.phasePosition");
  if (normalized.includes("WATCH")) return t("detail.phaseWatch");
  if (normalized && normalized !== "-") return statusLabel(phase, t);
  return t("detail.phaseAiReview");
}

function formatTradeQuantity(quantity: unknown, pnl: unknown, locale: Locale) {
  const qty = firstFiniteNumber(quantity);
  const realizedPnl = firstFiniteNumber(pnl);
  if (qty !== null && realizedPnl !== null) return `${formatNumber(qty, 4, locale)} · ${formatCurrency(realizedPnl, locale)}`;
  if (qty !== null) return formatNumber(qty, 4, locale);
  if (realizedPnl !== null) return formatCurrency(realizedPnl, locale);
  return "-";
}

function scenarioTone(scenario: TraderScenario): "good" | "bad" | "warn" | "neutral" {
  if (scenario.side?.toUpperCase() === "SHORT") return "bad";
  if (scenario.side?.toUpperCase() === "LONG") return "good";
  if (scenario.source === "order") return "warn";
  if (scenario.source === "review") return "good";
  return "neutral";
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function sideLabel(value: unknown, t: Translator) {
  const normalized = normalizeKey(value);
  if (normalized === "SHORT" || normalized === "SELL") return t("leaderboard.side.short");
  if (normalized === "LONG" || normalized === "BUY") return t("leaderboard.side.long");
  return "-";
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}
