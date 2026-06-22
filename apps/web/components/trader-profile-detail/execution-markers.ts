import type { PaperOrder, PaperPosition, PaperTradeEvent } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import type { LeagueSymbol } from "@/lib/league";
import type { Translator } from "@/components/trader-profile-detail/types";

export type ExecutionMarkerTone = "longEntry" | "shortEntry" | "profitExit" | "lossExit" | "neutralExit";
export type ExecutionMarkerAction = "entry" | "partialExit" | "exit" | "takeProfit" | "stopLoss";

export type ExecutionMarker = {
  id: string;
  eventId: string;
  eventType: string;
  action: ExecutionMarkerAction;
  tone: ExecutionMarkerTone;
  symbol: string;
  sideLabel: string;
  actionLabel: string;
  markerLabel: string;
  shortLabel: string;
  cycleId: string;
  timeMs: number;
  eventTimeLabel: string;
  entryTimeLabel: string | null;
  price: number;
  priceLabel: string;
  quantityLabel: string | null;
  pnl: number | null;
  pnlLabel: string | null;
  pnlTone: "good" | "bad" | "neutral";
  orderId: string | null;
  positionId: string | null;
};

export type ExecutionMarkerCycle = {
  id: string;
  cycleId: string;
  representativeId: string;
  sideLabel: string;
  titleLabel: string;
  entrySummaryLabel: string;
  exitSummaryLabel: string;
  priceSummaryLabel: string;
  pnl: number | null;
  pnlLabel: string | null;
  pnlTone: ExecutionMarker["pnlTone"];
  entryCount: number;
  takeProfitCount: number;
  stopLossCount: number;
  partialExitCount: number;
  latestTimeMs: number;
  startedTimeMs: number;
  markers: ExecutionMarker[];
};

const EXECUTION_EVENT_KEYS = [
  "ORDER_FILLED",
  "POSITION_CLOSED",
  "CLOSE_POSITION",
  "TAKE_PROFIT",
  "PARTIAL_TAKE_PROFIT",
  "TAKE_PARTIAL_PROFIT",
  "STOP_LOSS",
  "LIQUIDATION",
  "POSITION_REDUCED_BY_AI",
  "REDUCE_SIZE",
  "REDUCE_RISK"
] as const;

export function buildExecutionMarkers({
  events,
  positions = [],
  closedPositions = [],
  orders = [],
  symbol,
  locale,
  t,
  limit = 30
}: {
  events: readonly PaperTradeEvent[];
  positions?: readonly PaperPosition[];
  closedPositions?: readonly PaperPosition[];
  orders?: readonly PaperOrder[];
  symbol: LeagueSymbol;
  locale: Locale;
  t: Translator;
  limit?: number;
}): ExecutionMarker[] {
  const exposureIndex = buildExposureIndex({ positions: [...positions, ...closedPositions], orders });
  const entryTimeByPosition = buildEntryTimeIndex(events, exposureIndex);

  const markers = events
    .map((event, index) => markerFromEvent({ event, index, exposureIndex, entryTimeByPosition, symbol, locale, t }))
    .filter((marker): marker is ExecutionMarker => marker !== null);

  return numberTradeActions(markers, t)
    .sort((left, right) => right.timeMs - left.timeMs)
    .slice(0, limit);
}

export function defaultExecutionMarkerSelection({
  markers,
  positions
}: {
  markers: readonly Pick<ExecutionMarker, "id" | "action" | "positionId">[];
  positions: readonly Pick<PaperPosition, "id" | "status">[];
}) {
  const activePositionIds = new Set(
    positions
      .filter(isActivePosition)
      .map((position) => normalizedId(position.id))
      .filter((id): id is string => id !== null)
  );
  if (!activePositionIds.size) return null;
  return markers.find((marker) => marker.action === "entry" && marker.positionId !== null && activePositionIds.has(marker.positionId))?.id ?? null;
}

export function buildExecutionMarkerCycles({
  markers,
  locale,
  t,
  limit = 12
}: {
  markers: readonly ExecutionMarker[];
  locale: Locale;
  t: Translator;
  limit?: number;
}): ExecutionMarkerCycle[] {
  const grouped = new Map<string, ExecutionMarker[]>();
  for (const marker of markers) {
    const next = grouped.get(marker.cycleId) ?? [];
    next.push(marker);
    grouped.set(marker.cycleId, next);
  }

  return [...grouped.entries()]
    .map(([cycleId, cycleMarkers]) => buildExecutionMarkerCycle({ cycleId, markers: cycleMarkers, locale, t }))
    .sort((left, right) => right.latestTimeMs - left.latestTimeMs)
    .slice(0, limit);
}

function buildExecutionMarkerCycle({
  cycleId,
  markers,
  locale,
  t
}: {
  cycleId: string;
  markers: ExecutionMarker[];
  locale: Locale;
  t: Translator;
}): ExecutionMarkerCycle {
  const sorted = [...markers].sort((left, right) => left.timeMs - right.timeMs);
  const entries = sorted.filter((marker) => marker.action === "entry");
  const exits = sorted.filter((marker) => marker.action !== "entry");
  const takeProfitCount = exits.filter((marker) => marker.action === "takeProfit").length;
  const stopLossCount = exits.filter((marker) => marker.action === "stopLoss").length;
  const partialExitCount = exits.filter((marker) => marker.action === "partialExit").length;
  const representative = entries[0] ?? sorted[0];
  const sideLabelText = representative?.sideLabel && representative.sideLabel !== "-" ? representative.sideLabel : "-";
  const entrySummaryLabel = `${t("detail.markerEntry")}${entries.length || 0}`;
  const exitSummaryLabel = [
    takeProfitCount ? `${t("detail.markerTakeProfit")}${takeProfitCount}` : null,
    stopLossCount ? `${t("detail.markerStopLoss")}${stopLossCount}` : null,
    partialExitCount ? `${t("detail.markerPartialExit")}${partialExitCount}` : null
  ].filter(Boolean).join(" · ");
  const pnl = exits.reduce<number | null>((sum, marker) => {
    if (marker.pnl === null) return sum;
    return (sum ?? 0) + marker.pnl;
  }, null);
  const pnlLabel = pnl === null ? null : formatCurrency(pnl, locale);
  const entryPrices = entries.map((marker) => marker.priceLabel);
  const latestTimeMs = Math.max(...sorted.map((marker) => marker.timeMs));
  const startedTimeMs = Math.min(...sorted.map((marker) => marker.timeMs));

  return {
    id: `execution-cycle-${cycleId}`,
    cycleId,
    representativeId: representative.id,
    sideLabel: sideLabelText,
    titleLabel: `${sideLabelText} ${entrySummaryLabel}${exitSummaryLabel ? ` / ${exitSummaryLabel}` : ""}`,
    entrySummaryLabel,
    exitSummaryLabel,
    priceSummaryLabel: entryPrices.length > 1 ? `${entryPrices[0]} +${entryPrices.length - 1}` : entryPrices[0] ?? representative.priceLabel,
    pnl,
    pnlLabel,
    pnlTone: pnlTone(pnl),
    entryCount: entries.length,
    takeProfitCount,
    stopLossCount,
    partialExitCount,
    latestTimeMs,
    startedTimeMs,
    markers: sorted
  };
}

function markerFromEvent({
  event,
  index,
  exposureIndex,
  entryTimeByPosition,
  symbol,
  locale,
  t
}: {
  event: PaperTradeEvent;
  index: number;
  exposureIndex: ExposureIndex;
  entryTimeByPosition: ReadonlyMap<string, number>;
  symbol: LeagueSymbol;
  locale: Locale;
  t: Translator;
}): ExecutionMarker | null {
  if (event.symbol && event.symbol !== symbol) return null;
  const eventType = normalizeKey(event.eventType ?? event.type);
  if (!EXECUTION_EVENT_KEYS.some((key) => eventType.includes(key))) return null;

  const payload = recordValue(event.payload);
  const orderId = normalizedId(event.orderId ?? event.order_id ?? payload?.orderId ?? payload?.order_id);
  const positionId = normalizedId(event.positionId ?? event.position_id ?? payload?.positionId ?? payload?.position_id);
  const side = sideLabel(
    event.side ??
      payload?.side ??
      (positionId ? exposureIndex.positionSide.get(positionId) : null) ??
      (orderId ? exposureIndex.orderSide.get(orderId) : null)
  );
  const price = firstFiniteNumber(
    event.price,
    payload?.price,
    payload?.exitPrice,
    payload?.entryPrice,
    eventType.includes("STOP_LOSS") ? payload?.stopLossPrice : null,
    eventType.includes("TAKE_PROFIT") ? payload?.takeProfitPrice : null
  );
  const timeMs = dateMs(event.createdAt ?? event.timestamp);
  if (price === null || timeMs === null) return null;

  const pnl = firstFiniteNumber(event.realizedPnl, event.realized_pnl, payload?.realizedPnl, payload?.pnl);
  const action = eventAction(eventType, event, payload, pnl);
  if (action === "exit") return null;
  const actionLabel = actionText(action, t);
  const tone = markerTone(action, side, pnl);
  const eventId = String(event.id ?? `${eventType}-${index}-${timeMs}`);
  const entryTimeMs = action === "entry"
    ? timeMs
    : (positionId ? entryTimeByPosition.get(positionId) ?? exposureIndex.positionOpenedAt.get(positionId) ?? null : null);
  const sideText = side || "-";
  const markerLabel = side ? `${side} ${actionLabel}` : actionLabel;
  const cycleId = executionCycleId({ symbol, side, positionId, orderId, eventId });

  return {
    id: `execution-marker-${eventId}`,
    eventId,
    eventType,
    action,
    tone,
    symbol,
    sideLabel: sideText,
    actionLabel,
    markerLabel,
    shortLabel: shortMarkerLabel(action, side, t),
    cycleId,
    timeMs,
    eventTimeLabel: formatDateTime(timeMs, locale),
    entryTimeLabel: entryTimeMs ? formatDateTime(entryTimeMs, locale) : null,
    price,
    priceLabel: formatNumber(price, 1, locale),
    quantityLabel: quantityLabel(firstFiniteNumber(event.quantity, payload?.quantity), symbol, locale),
    pnl,
    pnlLabel: pnl === null ? null : formatCurrency(pnl, locale),
    pnlTone: pnlTone(pnl),
    orderId,
    positionId
  };
}

function isActivePosition(position: Pick<PaperPosition, "status">) {
  const normalized = normalizeKey(position.status);
  if (!normalized) return true;
  return !["CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED", "STOP_LOSS", "TAKE_PROFIT", "LIQUIDATION", "POSITION_CLOSED"].includes(normalized);
}

type ExposureIndex = {
  positionSide: Map<string, string>;
  positionOpenedAt: Map<string, number>;
  orderSide: Map<string, string>;
};

function buildExposureIndex({
  positions,
  orders
}: {
  positions: readonly PaperPosition[];
  orders: readonly PaperOrder[];
}): ExposureIndex {
  const positionSide = new Map<string, string>();
  const positionOpenedAt = new Map<string, number>();
  const orderSide = new Map<string, string>();

  for (const position of positions) {
    const id = normalizedId(position.id);
    if (!id) continue;
    const side = sideLabel(position.side);
    if (side) positionSide.set(id, side);
    const openedAt = dateMs(position.openedAt ?? position.opened_at ?? position.createdAt);
    if (openedAt !== null) positionOpenedAt.set(id, openedAt);
  }

  for (const order of orders) {
    const id = normalizedId(order.id);
    if (!id) continue;
    const side = sideLabel(order.side);
    if (side) orderSide.set(id, side);
  }

  return { positionSide, positionOpenedAt, orderSide };
}

function buildEntryTimeIndex(events: readonly PaperTradeEvent[], exposureIndex: ExposureIndex) {
  const result = new Map<string, number>();
  for (const event of events) {
    const payload = recordValue(event.payload);
    const type = normalizeKey(event.eventType ?? event.type);
    if (!type.includes("ORDER_FILLED")) continue;
    const positionId = normalizedId(event.positionId ?? event.position_id ?? payload?.positionId ?? payload?.position_id);
    if (!positionId) continue;
    const timeMs = dateMs(event.createdAt ?? event.timestamp);
    if (timeMs === null) continue;
    const previous = result.get(positionId);
    if (previous === undefined || timeMs < previous) result.set(positionId, timeMs);
  }
  for (const [positionId, openedAt] of exposureIndex.positionOpenedAt.entries()) {
    if (!result.has(positionId)) result.set(positionId, openedAt);
  }
  return result;
}

function eventAction(eventType: string, event: PaperTradeEvent, payload: Record<string, unknown> | null, pnl: number | null): ExecutionMarkerAction {
  if (eventType.includes("ORDER_FILLED")) return "entry";
  if (eventType.includes("PARTIAL_TAKE_PROFIT") || eventType.includes("TAKE_PARTIAL_PROFIT")) return "takeProfit";
  if (eventType.includes("TAKE_PROFIT")) return "takeProfit";
  if (eventType.includes("STOP_LOSS") || eventType.includes("LIQUIDATION")) return "stopLoss";
  if (eventType.includes("POSITION_REDUCED_BY_AI") || eventType.includes("REDUCE_SIZE") || eventType.includes("REDUCE_RISK")) {
    return pnl !== null && pnl > 0 ? "takeProfit" : "partialExit";
  }
  const reason = normalizeKey(payload?.reason ?? event.reason ?? event.message);
  if (reason.includes("TAKE_PROFIT") || reason.includes("PROFIT") || reason.includes("TP")) return "takeProfit";
  if (reason.includes("STOP_LOSS") || reason.includes("LOSS") || reason.includes("SL") || reason.includes("LIQUIDATION")) return "stopLoss";
  if (pnl !== null && pnl > 0.01) return "takeProfit";
  if (pnl !== null && pnl < -0.01) return "stopLoss";
  return "exit";
}

function markerTone(action: ExecutionMarkerAction, side: string, pnl: number | null): ExecutionMarkerTone {
  if (action === "entry") return side === "SHORT" ? "shortEntry" : "longEntry";
  if (pnl !== null) {
    if (pnl > 0.01) return "profitExit";
    if (pnl < -0.01) return "lossExit";
  }
  if (action === "takeProfit") return "profitExit";
  if (action === "stopLoss") return "lossExit";
  return "neutralExit";
}

function actionText(action: ExecutionMarkerAction, t: Translator) {
  if (action === "entry") return t("detail.markerEntry");
  if (action === "takeProfit") return t("detail.markerTakeProfit");
  if (action === "stopLoss") return t("detail.markerStopLoss");
  if (action === "partialExit") return t("detail.markerPartialExit");
  return t("detail.markerExit");
}

function shortMarkerLabel(action: ExecutionMarkerAction, side: string, t: Translator) {
  if (action === "entry") return side === "SHORT" ? t("detail.markerShortEntryShort") : t("detail.markerLongEntryShort");
  if (action === "takeProfit") return t("detail.markerTakeProfitShort");
  if (action === "stopLoss") return t("detail.markerStopLossShort");
  if (action === "partialExit") return t("detail.markerPartialExitShort");
  return t("detail.markerExitShort");
}

function numberTradeActions(markers: readonly ExecutionMarker[], t: Translator) {
  const counts = new Map<string, number>();
  return [...markers]
    .sort((left, right) => left.timeMs - right.timeMs)
    .map((marker) => {
      const tradeLetter = tradeActionLetter(marker);
      const groupKey = `${marker.cycleId}:${tradeLetter}`;
      const nextCount = (counts.get(groupKey) ?? 0) + 1;
      counts.set(groupKey, nextCount);
      const actionLabel = `${tradeActionText(tradeLetter, t)}${nextCount}`;
      return {
        ...marker,
        actionLabel,
        markerLabel: marker.sideLabel && marker.sideLabel !== "-" ? `${marker.sideLabel} ${actionLabel}` : actionLabel,
        shortLabel: `${tradeLetter}${nextCount}`,
      };
    });
}

function executionCycleId({
  symbol,
  side,
  positionId,
  orderId,
  eventId
}: {
  symbol: string;
  side: string;
  positionId: string | null;
  orderId: string | null;
  eventId: string;
}) {
  if (positionId) return `${symbol}:position:${positionId}`;
  if (orderId) return `${symbol}:order:${orderId}`;
  return `${symbol}:event:${side || "unknown"}:${eventId}`;
}

function tradeActionLetter(marker: ExecutionMarker) {
  const isShort = marker.sideLabel === "SHORT";
  if (marker.action === "entry") return isShort ? "S" : "B";
  return isShort ? "B" : "S";
}

function tradeActionText(letter: "B" | "S", t: Translator) {
  return letter === "B" ? t("detail.markerBuy") : t("detail.markerSell");
}

function sideLabel(value: unknown) {
  const normalized = normalizeKey(value);
  if (normalized === "BUY" || normalized === "LONG") return "LONG";
  if (normalized === "SELL" || normalized === "SHORT") return "SHORT";
  return "";
}

function quantityLabel(quantity: number | null, symbol: string, locale: Locale) {
  if (quantity === null) return null;
  const base = symbol.toUpperCase().replace("USDT", "") || "BTC";
  return `${formatNumber(quantity, 4, locale)} ${base}`;
}

function pnlTone(value: number | null): ExecutionMarker["pnlTone"] {
  if (value === null || Math.abs(value) <= 0.01) return "neutral";
  return value > 0 ? "good" : "bad";
}

function firstFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function normalizedId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
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

function dateMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function intlLocale(locale: Locale) {
  if (locale === "ko") return "ko-KR";
  if (locale === "ru") return "ru-RU";
  if (locale === "pt-BR") return "pt-BR";
  if (locale === "tr") return "tr-TR";
  return "en-US";
}

function formatNumber(value: number, digits: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: digits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, digits)
  }).format(value);
}

function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2
  }).format(value);
}

function formatDateTime(timeMs: number, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(timeMs));
}
