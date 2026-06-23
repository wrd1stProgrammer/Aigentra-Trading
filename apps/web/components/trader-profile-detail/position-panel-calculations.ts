type NumericRecord = Record<string, unknown>;
export type TakeProfitTarget = {
  readonly price: number;
  readonly weight: number | null;
  readonly reason: string | null;
  readonly status: string | null;
  readonly index: number;
};

const DEFAULT_MAKER_FEE_RATE = 0.0002;
const DEFAULT_TAKER_FEE_RATE = 0.0005;
const COMPLETED_TAKE_PROFIT_STATUSES = new Set(["COMPLETED", "DONE", "FILLED", "HIT", "TRIGGERED", "TAKE_PROFIT", "TP_FILLED"]);

export function normalizedSide(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "SELL") return "SHORT";
  if (normalized === "BUY") return "LONG";
  if (normalized === "SHORT" || normalized === "LONG") return normalized;
  return "-";
}

export function baseAsset(symbol: string) {
  return symbol.replace("USDT", "");
}

export function firstFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function firstNonZeroFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const parsed = firstFiniteNumber(value);
    if (parsed !== null && Math.abs(parsed) > 0.00000001) return parsed;
  }
  return firstFiniteNumber(...values);
}

export function firstString(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

export function recordValue(value: unknown) {
  return typeof value === "object" && value !== null ? value as NumericRecord : null;
}

export function derivedMargin(quantity: number | null, price: number | null, leverage: number | null) {
  if (quantity === null || price === null || leverage === null || leverage <= 0) return null;
  return Math.abs(quantity * price) / leverage;
}

export function positionQuantity(position: NumericRecord) {
  return firstFiniteNumber(position.quantity, position.size);
}

export function positionEntryPrice(position: NumericRecord) {
  return firstFiniteNumber(position.averageEntryPrice, position.avgEntryPrice, position.entryPrice, position.openPrice);
}

export function positionLeverage(position: NumericRecord) {
  const payload = recordValue(position.payload);
  return firstFiniteNumber(position.leverage, payload?.leverage, recordValue(payload?.leveragePlan)?.suggestedLeverage);
}

export function positionMargin(position: NumericRecord) {
  return firstFiniteNumber(
    position.margin,
    position.openMargin,
    derivedMargin(positionQuantity(position), positionEntryPrice(position), positionLeverage(position))
  );
}

export function positionPnl(position: NumericRecord, markPriceOverride?: unknown) {
  const liveMark = firstFiniteNumber(markPriceOverride);
  if (liveMark !== null) {
    const livePnl = positionPnlFromMarkPrice(position, liveMark);
    if (livePnl !== null) return livePnl;
  }
  return firstFiniteNumber(position.unrealizedPnl, position.realizedPnl);
}

export function positionMarkPrice(position: NumericRecord, markPriceOverride?: unknown) {
  const liveMark = firstFiniteNumber(markPriceOverride);
  if (liveMark !== null) return liveMark;

  const payload = recordValue(position.payload);
  const directMark = firstFiniteNumber(position.markPrice, position.mark_price, payload?.markPrice, payload?.mark_price, payload?.currentPrice);
  if (directMark !== null) return directMark;

  const side = normalizedSide(position.side);
  const entryPrice = positionEntryPrice(position);
  const quantity = Math.abs(positionQuantity(position) ?? 0);
  const pnl = positionPnl(position);
  if (entryPrice === null || quantity <= 0 || pnl === null || Math.abs(pnl) <= 0.00000001) return null;
  return side === "SHORT" ? entryPrice - (pnl / quantity) : entryPrice + (pnl / quantity);
}

export function positionPnlFromMarkPrice(position: NumericRecord, markPrice: number) {
  if (!Number.isFinite(markPrice)) return null;
  const side = normalizedSide(position.side);
  const entryPrice = positionEntryPrice(position);
  const quantity = Math.abs(positionQuantity(position) ?? 0);
  if (entryPrice === null || quantity <= 0 || side === "-") return null;
  return side === "SHORT"
    ? (entryPrice - markPrice) * quantity
    : (markPrice - entryPrice) * quantity;
}

export function positionTargetPrice(position: NumericRecord) {
  const payload = recordValue(position.payload);
  const activeTarget = firstOpenTakeProfitPrice(positionTakeProfitTargets(position));
  return firstFiniteNumber(
    activeTarget,
    position.takeProfit,
    position.takeProfitPrice,
    position.take_profit_price,
    payload?.takeProfit,
    payload?.takeProfitPrice,
    payload?.take_profit_price,
    recordValue(payload?.target)?.price
  );
}

export function positionTakeProfitTargets(position: NumericRecord): TakeProfitTarget[] {
  const payload = recordValue(position.payload);
  const source = firstArray(position.takeProfits, position.take_profits, payload?.takeProfits, payload?.take_profits);
  const targets: TakeProfitTarget[] = [];
  if (source) {
    for (const [index, item] of source.entries()) {
      const record = recordValue(item);
      const price = firstFiniteNumber(record?.price, record?.targetPrice);
      if (price === null) continue;
      targets.push({
        price,
        weight: firstFiniteNumber(record?.weight, record?.quantityFraction, record?.fraction),
        reason: firstString(record?.reason, record?.label),
        status: firstString(record?.status, record?.state) ?? targetBooleanStatus(record),
        index
      });
    }
  }
  if (!targets.length) {
    const single = firstFiniteNumber(position.takeProfit, position.takeProfitPrice, position.take_profit_price, payload?.takeProfit, payload?.takeProfitPrice, payload?.take_profit_price, recordValue(payload?.target)?.price);
    if (single !== null) {
      targets.push({ price: single, weight: null, reason: null, status: null, index: 0 });
    }
  }
  return dedupeTakeProfitTargets(targets);
}

export function positionLiquidationPrice(position: NumericRecord) {
  const payload = recordValue(position.payload);
  const explicit = firstFiniteNumber(
    position.liquidationPrice,
    position.liquidation_price,
    payload?.liquidationPrice,
    payload?.liquidation_price
  );
  if (explicit !== null) return explicit;
  const side = normalizedSide(position.side);
  const entryPrice = positionEntryPrice(position);
  const leverage = positionLeverage(position);
  if (entryPrice === null || leverage === null || leverage <= 0 || side === "-") return null;
  const liquidationDistance = entryPrice / leverage;
  return side === "SHORT" ? entryPrice + liquidationDistance : Math.max(0, entryPrice - liquidationDistance);
}

export function expectedPositionProfitAtTarget(position: NumericRecord) {
  const legProfit = expectedPositionLegsProfit(position);
  if (legProfit !== null) return legProfit;
  return expectedSinglePositionProfitAtTarget(position);
}

function expectedPositionLegsProfit(position: NumericRecord) {
  const payload = recordValue(position.payload);
  const legs = payload?.positionLegs;
  if (!Array.isArray(legs) || !legs.length) return null;

  let total = 0;
  let counted = 0;
  for (const item of legs) {
    const leg = recordValue(item);
    if (!leg) continue;
    const profit = expectedSinglePositionProfitAtTarget(leg);
    if (profit === null) continue;
    total += profit;
    counted += 1;
  }
  return counted > 0 ? total : null;
}

function expectedSinglePositionProfitAtTarget(position: NumericRecord) {
  const side = normalizedSide(position.side);
  const entryPrice = positionEntryPrice(position);
  const targetPrice = positionTargetPrice(position);
  const quantity = Math.abs(positionQuantity(position) ?? 0);
  if (entryPrice === null || targetPrice === null || quantity <= 0 || side === "-") return null;

  const gross = side === "SHORT"
    ? (entryPrice - targetPrice) * quantity
    : (targetPrice - entryPrice) * quantity;
  const entryNotional = Math.abs(entryPrice * quantity);
  const targetNotional = Math.abs(targetPrice * quantity);
  const payload = recordValue(position.payload);
  const rates = feeRates(payload);
  const entryFee = firstFiniteNumber(
    position.entryFee,
    position.entry_fee,
    payload?.entryFee,
    payload?.entry_fee,
    payload?.estimatedEntryFee
  ) ?? entryNotional * rates.entry;
  const exitFee = firstFiniteNumber(position.exitFee, position.exit_fee, payload?.exitFee, payload?.exit_fee, payload?.estimatedExitFee)
    ?? targetNotional * rates.exit;
  return gross - entryFee - exitFee;
}

function firstOpenTakeProfitPrice(targets: readonly TakeProfitTarget[]) {
  const target = targets.find((item) => !isCompletedTakeProfitStatus(item.status)) ?? targets[0];
  return target?.price ?? null;
}

function firstArray(...values: readonly unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function targetBooleanStatus(record: NumericRecord | null) {
  if (!record) return null;
  return record.completed || record.filled || record.filledAt || record.filled_at ? "FILLED" : null;
}

function isCompletedTakeProfitStatus(value: unknown) {
  return COMPLETED_TAKE_PROFIT_STATUSES.has(String(value ?? "").trim().replace(/[-\s]+/g, "_").toUpperCase());
}

function dedupeTakeProfitTargets(targets: readonly TakeProfitTarget[]) {
  const seen = new Set<string>();
  const result: TakeProfitTarget[] = [];
  for (const target of targets) {
    const key = target.price.toFixed(8);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }
  return result;
}

function feeRates(payload: NumericRecord | null) {
  const feeRatesRecord = recordValue(payload?.feeRates);
  const entry = firstFiniteNumber(payload?.entryFeeRate, payload?.makerFeeRate, feeRatesRecord?.maker) ?? DEFAULT_MAKER_FEE_RATE;
  const exit = firstFiniteNumber(payload?.exitFeeRate, payload?.takerFeeRate, feeRatesRecord?.taker) ?? DEFAULT_TAKER_FEE_RATE;
  return { entry, exit };
}
