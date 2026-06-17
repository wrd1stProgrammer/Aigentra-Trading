import type { OverlayLine } from "@/components/live-candle-chart-overlays";

type Translator = (key: string) => string;

type RealizedOverlayEvent = {
  readonly id?: string | number;
  readonly orderId?: string | number | null;
  readonly order_id?: string | number | null;
  readonly positionId?: string | number | null;
  readonly position_id?: string | number | null;
  readonly eventType?: string | null;
  readonly type?: string | null;
  readonly symbol?: string | null;
  readonly price?: number | string | null;
  readonly exitPrice?: number | string | null;
  readonly takeProfitPrice?: number | string | null;
  readonly stopLossPrice?: number | string | null;
  readonly payload?: unknown;
};

export function buildRealizedEventOverlayLines({
  events,
  symbol,
  activePositionIds = [],
  activeOrderIds = [],
  t
}: {
  readonly events: readonly RealizedOverlayEvent[];
  readonly symbol: string;
  readonly activePositionIds?: readonly unknown[];
  readonly activeOrderIds?: readonly unknown[];
  readonly t: Translator;
}): OverlayLine[] {
  const activePositionKeys = toIdSet(activePositionIds);
  const activeOrderKeys = toIdSet(activeOrderIds);
  return events.flatMap((event) => realizedEventOverlayLine(event, symbol, activePositionKeys, activeOrderKeys, t));
}

function realizedEventOverlayLine(
  event: RealizedOverlayEvent,
  symbol: string,
  activePositionKeys: ReadonlySet<string>,
  activeOrderKeys: ReadonlySet<string>,
  t: Translator
) {
  if (event.symbol && event.symbol !== symbol) return [];
  if (!matchesActiveExposure(event, activePositionKeys, activeOrderKeys)) return [];
  const kind = realizedKind(event);
  if (kind === null) return [];
  const payload = recordValue(event.payload);
  const value = firstFiniteNumber(
    event.price,
    event.exitPrice,
    kind === "takeProfit" ? event.takeProfitPrice : event.stopLossPrice,
    payload?.price,
    payload?.exitPrice
  );
  if (value === null) return [];
  return [{
    value,
    label: kind === "takeProfit" ? t("detail.takeProfitCompleted") : t("detail.stopLossCompleted"),
    tone: kind === "takeProfit" ? "takeProfitDone" as const : "stopDone" as const
  }];
}

function realizedKind(event: RealizedOverlayEvent) {
  const normalized = normalizeKey(event.eventType ?? event.type);
  if (normalized.includes("TAKE_PROFIT") || normalized.includes("PARTIAL_TAKE_PROFIT")) return "takeProfit";
  if (normalized.includes("STOP_LOSS") || normalized.includes("LIQUIDATION")) return "stopLoss";
  
  if (normalized.includes("POSITION_CLOSED")) {
    const payload = recordValue(event.payload);
    const reason = normalizeKey(payload?.reason);
    if (reason.includes("TAKE_PROFIT") || reason.includes("PROFIT") || reason.includes("TP")) return "takeProfit";
    if (reason.includes("STOP_LOSS") || reason.includes("LOSS") || reason.includes("SL") || reason.includes("FAILURE")) return "stopLoss";
    
    const pnl = firstFiniteNumber(payload?.realizedPnl, payload?.pnl);
    if (pnl !== null) {
      return pnl >= 0 ? "takeProfit" : "stopLoss";
    }
  }
  return null;
}

function matchesActiveExposure(
  event: RealizedOverlayEvent,
  activePositionKeys: ReadonlySet<string>,
  activeOrderKeys: ReadonlySet<string>
) {
  if (activePositionKeys.size === 0 && activeOrderKeys.size === 0) return false;
  const payload = recordValue(event.payload);
  const eventPositionKey = normalizedId(event.positionId ?? event.position_id ?? payload?.positionId ?? payload?.position_id);
  const eventOrderKey = normalizedId(event.orderId ?? event.order_id ?? payload?.orderId ?? payload?.order_id);
  return (
    (eventPositionKey !== null && activePositionKeys.has(eventPositionKey)) ||
    (eventOrderKey !== null && activeOrderKeys.has(eventOrderKey))
  );
}

function toIdSet(values: readonly unknown[]) {
  return new Set(values.map(normalizedId).filter((value): value is string => value !== null));
}

function normalizedId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function firstFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
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
