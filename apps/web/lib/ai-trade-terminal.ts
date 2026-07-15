import type { LeagueOverviewReview, PaperTradeEvent, TraderProfile } from "@/lib/api";

export type AITradeTerminalEventKind =
  | "entry"
  | "pending_entry"
  | "entry_confirmed"
  | "take_profit"
  | "stop_loss"
  | "breakeven"
  | "position_closed";

export type AITradeTerminalRow = {
  readonly id: string;
  readonly kind: AITradeTerminalEventKind;
  readonly occurredAt: string | null;
  readonly traderId: string;
  readonly traderName: string;
  readonly symbol: string;
  readonly side: "long" | "short" | null;
  readonly positionId: string | null;
  readonly orderId: string | null;
  readonly planId: string | null;
  readonly price: number | null;
  readonly quantity: number | null;
  readonly realizedPnl: number | null;
  readonly confidence: number | null;
  readonly message: string | null;
};

type TerminalBuildInput = {
  readonly events: readonly PaperTradeEvent[];
  readonly reviews: readonly LeagueOverviewReview[];
  readonly traders: readonly TraderProfile[];
  readonly locale?: string;
  readonly limit?: number;
};

const APPROVED_ENTRY_DECISIONS = new Set(["APPROVE", "ADJUST_AND_APPROVE"]);
const PARTIAL_PROFIT_EVENTS = new Set(["TAKE_PARTIAL_PROFIT", "PARTIAL_TAKE_PROFIT", "TAKE_PROFIT"]);
const REDUCTION_EVENTS = new Set(["POSITION_REDUCED_BY_AI", "REDUCE_SIZE", "REDUCE_RISK"]);
const FINAL_EVENTS = new Set(["POSITION_CLOSED", "CLOSE_POSITION", "STOP_LOSS", "LIQUIDATION"]);

export function buildAITradeTerminal(input: TerminalBuildInput): readonly AITradeTerminalRow[] {
  const traderNames = new Map(input.traders.map((trader) => [trader.id, trader.name]));
  const reviewRows = input.reviews.flatMap((review) => {
    const source = normalizeKey(review.source ?? review.overviewSource);
    const decision = normalizeKey(review.decision ?? review.action);
    if (source !== "ENTRY_REVIEW" || !APPROVED_ENTRY_DECISIONS.has(decision)) return [];
    const traderId = review.traderId?.trim();
    if (!traderId) return [];
    return [{
      id: `review-${String(review.id ?? eventTime(review) ?? traderId)}`,
      kind: "entry" as const,
      occurredAt: eventTime(review),
      traderId,
      traderName: traderNames.get(traderId) ?? traderId,
      symbol: review.symbol ?? "BTCUSDT",
      side: sideValue(review.side),
      positionId: idValue(review.positionId),
      orderId: idValue(review.orderId),
      planId: idValue(recordValue(review.payload)?.tradePlanId),
      price: numberValue(review.price, review.entryPrice),
      quantity: null,
      realizedPnl: null,
      confidence: numberValue(review.confidence),
      message: reviewNarrative(review)
    }];
  });

  const eventRows = input.events.flatMap((event) => {
    const kind = eventKind(event);
    const traderId = event.traderId?.trim();
    if (!kind || !traderId) return [];
    const payload = recordValue(event.payload);
    const review = kind === "entry_confirmed"
      ? closestEntryReview(input.reviews, event)
      : closestManagementReview(input.reviews, event, kind);
    return [{
      id: `event-${String(event.id ?? `${event.eventType}-${eventTime(event) ?? traderId}`)}`,
      kind,
      occurredAt: eventTime(event),
      traderId,
      traderName: traderNames.get(traderId) ?? traderId,
      symbol: event.symbol ?? "BTCUSDT",
      side: sideValue(event.side ?? payload?.side),
      positionId: idValue(event.positionId ?? payload?.positionId),
      orderId: idValue(event.orderId ?? payload?.orderId),
      planId: idValue(payload?.tradePlanId),
      price: numberValue(event.price, payload?.exitPrice, payload?.entryPrice),
      quantity: numberValue(event.quantity),
      realizedPnl: numberValue(event.realizedPnl, payload?.realizedPnl),
      confidence: numberValue(review?.confidence),
      message: reviewNarrative(review) ?? (kind === "entry_confirmed" ? embeddedEntryReviewNarrative(payload, input.locale) : null)
    }];
  });

  const rows = [...reviewRows, ...eventRows]
    .sort((left, right) => timeOf(right) - timeOf(left));
  return input.limit === undefined ? rows : rows.slice(0, input.limit);
}

function closestEntryReview(
  reviews: readonly LeagueOverviewReview[],
  event: PaperTradeEvent
): LeagueOverviewReview | null {
  const eventTimestamp = timeOf(event);
  const traderId = event.traderId?.trim();
  const symbol = event.symbol?.trim().toUpperCase();
  return reviews
    .filter((review) => normalizeKey(review.source ?? review.overviewSource) === "ENTRY_REVIEW")
    .filter((review) => APPROVED_ENTRY_DECISIONS.has(normalizeKey(review.decision ?? review.action)))
    .filter((review) => !traderId || review.traderId?.trim() === traderId)
    .filter((review) => !symbol || !review.symbol || review.symbol.trim().toUpperCase() === symbol)
    .filter((review) => eventTimestamp - timeOf(review) >= 0 && eventTimestamp - timeOf(review) <= 10 * 60_000)
    .sort((left, right) => Math.abs(timeOf(left) - eventTimestamp) - Math.abs(timeOf(right) - eventTimestamp))[0] ?? null;
}

function embeddedEntryReviewNarrative(payload: Record<string, unknown> | null, locale?: string): string | null {
  const review = recordValue(payload?.aiReview);
  const sourceLocale = textValue(review?.sourceLocale ?? payload?.aiReviewSourceLocale)?.toLowerCase();
  const requestedLocale = (locale ?? "en").toLowerCase();
  if (sourceLocale && sourceLocale.split("-")[0] !== requestedLocale.split("-")[0]) return null;
  const structuredReview = recordValue(review?.structuredReview ?? payload?.aiStructuredReview);
  return textValue(structuredReview?.headline) ?? textValue(review?.approvalReason ?? payload?.aiApprovalReason);
}

function eventKind(event: PaperTradeEvent): AITradeTerminalEventKind | null {
  const type = normalizeKey(event.eventType ?? event.type);
  const payload = recordValue(event.payload);
  const reason = normalizeKey(payload?.reason ?? event.reason);
  if (type === "PAPER_ORDER_CREATED") return "pending_entry";
  if (type === "ORDER_FILLED") return "entry_confirmed";
  if (PARTIAL_PROFIT_EVENTS.has(type)) return "take_profit";
  if (REDUCTION_EVENTS.has(type)) {
    const pnl = numberValue(event.realizedPnl, payload?.realizedPnl);
    if (pnl !== null && pnl > 0.01) return "take_profit";
    if (pnl !== null && pnl < -0.01) return "stop_loss";
    return null;
  }
  if (!FINAL_EVENTS.has(type)) return null;
  if (reason.includes("BREAKEVEN") || reason.includes("STOP_AT_ENTRY")) return "breakeven";
  if (reason.includes("TAKE_PROFIT") || reason.includes("PROFIT_PROTECT")) return "take_profit";
  if (reason.includes("STOP_LOSS") || reason.includes("LIQUIDATION") || reason.includes("THESIS_FAILURE")) return "stop_loss";
  if (type === "STOP_LOSS" || type === "LIQUIDATION") return "stop_loss";
  return "position_closed";
}

function closestManagementReview(
  reviews: readonly LeagueOverviewReview[],
  event: PaperTradeEvent,
  kind: AITradeTerminalEventKind
): LeagueOverviewReview | null {
  if (kind === "entry" || kind === "pending_entry" || kind === "entry_confirmed") return null;
  const eventPositionId = idValue(event.positionId);
  const eventTimestamp = timeOf(event);
  return reviews
    .filter((review) => normalizeKey(review.source ?? review.overviewSource) === "MANAGEMENT_REVIEW")
    .filter((review) => !eventPositionId || idValue(review.positionId) === eventPositionId)
    .filter((review) => Math.abs(timeOf(review) - eventTimestamp) <= 5 * 60_000)
    .sort((left, right) => Math.abs(timeOf(left) - eventTimestamp) - Math.abs(timeOf(right) - eventTimestamp))[0] ?? null;
}

function reviewNarrative(review: LeagueOverviewReview | null | undefined): string | null {
  return textValue(review?.structuredReview?.headline) ??
    textValue(review?.review?.structuredReview?.headline) ??
    textValue(review?.rationale) ??
    textValue(review?.summary);
}

function eventTime(value: { readonly occurredAt?: string | null; readonly createdAt?: string | null; readonly timestamp?: string | null }): string | null {
  return value.occurredAt ?? value.createdAt ?? value.timestamp ?? null;
}

function timeOf(value: { readonly occurredAt?: string | null; readonly createdAt?: string | null; readonly timestamp?: string | null }): number {
  const parsed = Date.parse(eventTime(value) ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sideValue(value: unknown): "long" | "short" | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "long" || normalized === "buy") return "long";
  if (normalized === "short" || normalized === "sell") return "short";
  return null;
}

function numberValue(...values: readonly unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function idValue(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().replace(/[-\s]+/g, "_").toUpperCase();
}
