export type OverlayTone = "entry" | "stop" | "takeProfit" | "position" | "order" | "takeProfitDone" | "stopDone";

export type OverlayLine = {
  readonly value: number;
  readonly label: string;
  readonly tone: OverlayTone;
  readonly count?: number;
};

export type ManagedLevelRecord = {
  readonly id?: string | number | null;
  readonly symbol?: string | null;
  readonly positionId?: string | number | null;
  readonly orderId?: string | number | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly timestamp?: string | null;
  readonly event?: unknown;
  readonly payload?: unknown;
  readonly exposure?: unknown;
  readonly review?: unknown;
  readonly metrics?: unknown;
  readonly stopLoss?: number | string | null;
  readonly stopLossPrice?: number | string | null;
  readonly stop_loss_price?: number | string | null;
  readonly newStopLoss?: number | string | null;
  readonly [key: string]: unknown;
};

export type FutureTakeProfitArgs = {
  readonly side?: unknown;
  readonly targetPrice: unknown;
  readonly latestPrice: unknown;
};

export type TakeProfitCompletionArgs = FutureTakeProfitArgs & {
  readonly exposureKind: "plan" | "order" | "position" | "event";
  readonly completed?: unknown;
};

export type ManagedLevelLookup = {
  readonly records: readonly ManagedLevelRecord[];
  readonly symbol: string;
  readonly positionId?: unknown;
  readonly orderId?: unknown;
};

const PRICE_LINE_MERGE_TICK = 0.006;
const OVERLAY_TONE_PRIORITY: Record<OverlayTone, number> = {
  takeProfitDone: 7,
  stopDone: 6,
  position: 5,
  stop: 4,
  takeProfit: 3,
  entry: 2,
  order: 1
};
const CLOSED_EXPOSURE_STATUSES = new Set([
  "CLOSED",
  "CANCELED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
  "FILLED",
  "STOP_LOSS",
  "TAKE_PROFIT",
  "LIQUIDATION",
  "POSITION_CLOSED",
  "CLOSED_STOP_LOSS",
  "CLOSED_TAKE_PROFIT",
  "CLOSED_LIQUIDATION",
  "POSITION_CLOSED_STOP_LOSS",
  "POSITION_CLOSED_TAKE_PROFIT",
  "STOPPED_OUT"
]);
const COMPLETED_TARGET_STATUSES = new Set(["COMPLETED", "DONE", "FILLED", "HIT", "TRIGGERED", "TAKE_PROFIT", "TP_FILLED"]);

export function compactOverlayLines(lines: readonly OverlayLine[]) {
  const ordered = lines.filter((line) => Number.isFinite(line.value)).sort((left, right) => left.value - right.value);
  const mergeDistance = overlayMergeDistance(ordered);
  const groups: OverlayLine[][] = [];
  for (const line of ordered) {
    const currentGroup = groups.length ? groups[groups.length - 1] : undefined;
    if (currentGroup && Math.abs(line.value - averageOverlayValue(currentGroup)) <= mergeDistance) {
      currentGroup.push(line);
    } else {
      groups.push([line]);
    }
  }
  return groups.map(summarizeOverlayGroup).sort((left, right) => left.value - right.value);
}

export function priceLineTitle(line: OverlayLine) {
  return line.count && line.count > 1 ? `${line.label} +${line.count - 1}` : line.label;
}

export function isOpenChartExposure(record: { readonly status?: unknown }) {
  const status = normalizeStatusText(record.status);
  if (!status) return true;
  return !CLOSED_EXPOSURE_STATUSES.has(status);
}

export function shouldRenderRealizedEventOverlays({
  hasOpenPaperPosition
}: {
  readonly hasOpenPaperPosition: boolean;
  readonly hasOpenPaperOrder: boolean;
}) {
  return hasOpenPaperPosition;
}

export function overlaySideLabel(value: unknown) {
  const side = String(value ?? "").toUpperCase();
  if (side === "BUY") return "LONG";
  if (side === "SELL") return "SHORT";
  if (side === "LONG" || side === "SHORT") return side;
  return "";
}

export function isFutureTakeProfit({ side, targetPrice, latestPrice }: FutureTakeProfitArgs) {
  const target = firstFiniteNumber(targetPrice);
  const latest = firstFiniteNumber(latestPrice);
  if (target === null || latest === null) return true;
  const normalizedSide = overlaySideLabel(side);
  if (normalizedSide === "SHORT") return latest > target;
  if (normalizedSide === "LONG") return latest < target;
  return true;
}

export function shouldMarkTakeProfitCompleted(args: TakeProfitCompletionArgs) {
  if (args.exposureKind === "event") return true;
  if (args.exposureKind !== "position") return false;
  return isCompletedTargetStatus(args.completed);
}

export function latestManagedStopLoss({ records, symbol, positionId, orderId }: ManagedLevelLookup) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const positionKey = normalizedId(positionId);
  const orderKey = normalizedId(orderId);
  const candidates = records
    .filter((record) => recordMatchesExposure(record, normalizedSymbol, positionKey, orderKey))
    .map((record) => ({ record, time: recordTime(record) }))
    .sort((left, right) => right.time - left.time);

  for (const { record } of candidates) {
    const event = recordValue(record.event);
    const payload = recordValue(record.payload);
    const exposure = recordValue(record.exposure) ?? recordValue(payload?.exposure);
    const review = recordValue(record.review) ?? recordValue(payload?.review);
    const metrics = recordValue(record.metrics) ?? recordValue(event?.metrics) ?? recordValue(payload?.metrics) ?? recordValue(review?.metrics);
    const stop = firstFiniteNumber(
      metrics?.stopLoss,
      metrics?.stopLossPrice,
      metrics?.newStopLoss,
      event?.stopLoss,
      event?.stopLossPrice,
      payload?.stopLoss,
      payload?.stopLossPrice,
      exposure?.stopLoss,
      exposure?.stopLossPrice,
      review?.stopLoss,
      record.stopLoss,
      record.stopLossPrice,
      record.stop_loss_price,
      record.newStopLoss,
      priceFromManagementText(review?.rationale, review?.reason, review?.managementReason, event?.reason, payload?.reason, record.rationale, record.reason, record.managementReason)
    );
    if (stop !== null) return stop;
  }
  return null;
}

function summarizeOverlayGroup(group: readonly OverlayLine[]): OverlayLine {
  const primary = primaryOverlayLine(group);
  return {
    value: primary.value,
    label: primary.label,
    tone: primary.tone,
    count: group.length
  };
}

function primaryOverlayLine(group: readonly OverlayLine[]) {
  let selected = group[0] ?? { value: averageOverlayValue(group), label: "-", tone: "order" };
  for (const line of group) {
    if (OVERLAY_TONE_PRIORITY[line.tone] > OVERLAY_TONE_PRIORITY[selected.tone]) selected = line;
  }
  return selected;
}

function overlayMergeDistance(lines: readonly OverlayLine[]) {
  if (lines.length < 2) return 0;
  const values = lines.map((line) => line.value);
  const high = Math.max(...values);
  const low = Math.min(...values);
  return Math.max(0.5, (high - low) * PRICE_LINE_MERGE_TICK);
}

function averageOverlayValue(group: readonly OverlayLine[]) {
  return group.reduce((sum, line) => sum + line.value, 0) / Math.max(group.length, 1);
}

function normalizeStatusText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function recordMatchesExposure(record: ManagedLevelRecord, symbol: string, positionId: string | null, orderId: string | null) {
  if (record.symbol && record.symbol.toUpperCase() !== symbol) return false;
  const payload = recordValue(record.payload);
  const event = recordValue(record.event) ?? recordValue(payload?.event);
  const exposure = recordValue(record.exposure) ?? recordValue(payload?.exposure);
  const kind = exposureKind(exposure);
  const recordPositionId = normalizedId(
    record.positionId ??
      record.position_id ??
      payload?.positionId ??
      payload?.position_id ??
      event?.positionId ??
      event?.position_id ??
      (kind === "position" ? exposure?.id : undefined)
  );
  const recordOrderId = normalizedId(
    record.orderId ??
      record.order_id ??
      payload?.orderId ??
      payload?.order_id ??
      event?.orderId ??
      event?.order_id ??
      (kind === "order" ? exposure?.id : undefined)
  );
  if (positionId) return Boolean(recordPositionId && positionId === recordPositionId);
  if (orderId) return Boolean(recordOrderId && orderId === recordOrderId);
  return true;
}

function exposureKind(exposure: Record<string, unknown> | null) {
  const normalized = normalizeStatusText(exposure?.kind ?? exposure?.type ?? exposure?.source);
  if (normalized.includes("ORDER")) return "order";
  if (normalized.includes("POSITION")) return "position";
  return null;
}

function isCompletedTargetStatus(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value > 0;
  const record = recordValue(value);
  if (record) {
    return (
      isCompletedTargetStatus(record.status) ||
      isCompletedTargetStatus(record.state) ||
      isCompletedTargetStatus(record.completed) ||
      isCompletedTargetStatus(record.filled) ||
      Boolean(record.filledAt ?? record.filled_at ?? record.completedAt ?? record.completed_at)
    );
  }
  const normalized = normalizeStatusText(value);
  return COMPLETED_TARGET_STATUSES.has(normalized);
}

function firstFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function normalizedId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function priceFromManagementText(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.replace(/,/g, "");
    if (!/(stop|손절|스탑|breakeven|본절|진입가)/i.test(normalized)) continue;
    const match = normalized.match(/\b\d{5,6}(?:\.\d+)?\b/);
    if (!match) continue;
    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function recordTime(record: ManagedLevelRecord) {
  const raw = record.updatedAt ?? record.createdAt ?? record.timestamp;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
