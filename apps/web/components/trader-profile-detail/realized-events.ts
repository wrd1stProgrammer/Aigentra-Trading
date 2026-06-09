import type { TimelineItem } from "@/components/trader-profile-detail/types";

type Translator = (key: string) => string;
type Locale = "ko" | "en";

type RealizedEventInput = {
  readonly id?: string | number;
  readonly eventType?: string | null;
  readonly type?: string | null;
  readonly symbol?: string | null;
  readonly side?: string | null;
  readonly price?: number | string | null;
  readonly exitPrice?: number | string | null;
  readonly takeProfitPrice?: number | string | null;
  readonly stopLossPrice?: number | string | null;
  readonly quantity?: number | string | null;
  readonly realizedPnl?: number | string | null;
  readonly message?: string | null;
  readonly reason?: string | null;
  readonly createdAt?: string | null;
  readonly timestamp?: string | null;
  readonly payload?: unknown;
};

export function buildRealizedEventTimelineItems({
  events,
  locale,
  t
}: {
  readonly events: readonly RealizedEventInput[];
  readonly locale: Locale;
  readonly t: Translator;
}): TimelineItem[] {
  return events
    .map((event, index) => realizedTimelineItem(event, index, locale, t))
    .filter((item) => item !== null)
    .sort((left, right) => (right.sortMs ?? Number.NEGATIVE_INFINITY) - (left.sortMs ?? Number.NEGATIVE_INFINITY));
}

function realizedTimelineItem(event: RealizedEventInput, index: number, locale: Locale, t: Translator) {
  const kind = realizedKind(event);
  if (kind === null) return null;
  const payload = recordValue(event.payload);
  const price = firstFiniteNumber(
    event.price,
    event.exitPrice,
    kind === "takeProfit" ? event.takeProfitPrice : event.stopLossPrice,
    payload?.price,
    payload?.exitPrice
  );
  const quantity = firstFiniteNumber(event.quantity, payload?.quantity);
  const pnl = firstFiniteNumber(event.realizedPnl, payload?.realizedPnl);
  const reason = firstString(event.reason, event.message, payload?.reason, payload?.message);
  const side = sideLabel(event.side);
  const completedTitle = kind === "takeProfit" ? t("detail.takeProfitCompleted") : t("detail.stopLossCompleted");
  const movement = kind === "takeProfit" ? t("chart.takeProfit") : t("chart.stopLoss");
  const pnlText = pnl === null ? null : `${t("common.pnl")} ${formatCurrency(pnl, locale)}`;
  const quantityText = quantity === null ? null : `${formatNumber(quantity, 4, locale)} ${t("common.quantity")}`;
  return {
    id: `realized-event-${String(event.id ?? index)}`,
    time: formatDateTime(event.createdAt ?? event.timestamp, locale),
    title: `${completedTitle}${side ? ` ${side}` : ""}`,
    body: [reason, pnlText, quantityText].filter(Boolean).join(" · ") || completedTitle,
    importance: kind === "takeProfit" ? "important" as const : "critical" as const,
    movement,
    movementTone: kind === "takeProfit" ? "good" as const : "bad" as const,
    priceLabel: price === null ? "-" : `${t("common.price")} ${formatNumber(price, 0, locale)}`,
    iconLabel: kind === "takeProfit" ? "TP" : "SL",
    sortMs: timeValue(event.createdAt ?? event.timestamp)
  };
}

function realizedKind(event: RealizedEventInput) {
  const normalized = normalizeKey(event.eventType ?? event.type);
  if (normalized.includes("TAKE_PROFIT") || normalized.includes("PARTIAL_TAKE_PROFIT")) return "takeProfit";
  if (normalized.includes("STOP_LOSS") || normalized.includes("LIQUIDATION")) return "stopLoss";
  return null;
}

function sideLabel(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "BUY") return "LONG";
  if (normalized === "SELL") return "SHORT";
  if (normalized === "LONG" || normalized === "SHORT") return normalized;
  return "";
}

function firstFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function firstString(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function formatNumber(value: number, digits: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: digits }).format(value);
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
  }).format(value);
}

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function timeValue(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
}
