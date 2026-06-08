import type { OverlayLine } from "@/components/live-candle-chart-overlays";

type Translator = (key: string) => string;

type RealizedOverlayEvent = {
  readonly id?: string | number;
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
  t
}: {
  readonly events: readonly RealizedOverlayEvent[];
  readonly symbol: string;
  readonly t: Translator;
}): OverlayLine[] {
  return events.flatMap((event) => realizedEventOverlayLine(event, symbol, t));
}

function realizedEventOverlayLine(event: RealizedOverlayEvent, symbol: string, t: Translator) {
  if (event.symbol && event.symbol !== symbol) return [];
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
  return null;
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
