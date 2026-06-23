export type HoldingNumbers = {
  readonly entryPrice: number | null;
  readonly markPrice: number | null;
  readonly quantity: number | null;
  readonly leverage: number | null;
  readonly notional: number | null;
  readonly margin: number | null;
  readonly accountMarginPercent: number | null;
  readonly accountNotionalPercent: number | null;
  readonly pnl: number | null;
  readonly entryWeight: number | null;
};

export function positionHoldingNumbers(position: unknown, accountEquity?: number | null, markPriceOverride?: number | null): HoldingNumbers {
  const record = isRecord(position) ? position : null;
  const payload = nestedRecord(record, "payload");
  const entryPrice = firstFiniteNumber(record?.averageEntryPrice, record?.avgEntryPrice, record?.entryPrice, record?.openPrice, record?.price);
  const markPrice = firstFiniteNumber(markPriceOverride, record?.markPrice, record?.mark_price, payload?.markPrice, payload?.mark_price, payload?.currentPrice, record?.price, entryPrice);
  const quantity = firstFiniteNumber(record?.quantity, record?.size);
  const leverage = leverageFromRecord(record);
  const derivedNotional = quantity !== null && (markPrice !== null || entryPrice !== null) ? Math.abs(quantity * (markPrice ?? entryPrice ?? 0)) : null;
  const explicitNotional = firstFiniteNumber(record?.notional, record?.openNotional);
  const hasLiveMarkOverride = firstFiniteNumber(markPriceOverride) !== null;
  const notional = hasLiveMarkOverride ? firstFiniteNumber(derivedNotional, explicitNotional) : firstFiniteNumber(explicitNotional, derivedNotional);
  const margin = derivedMargin(firstFiniteNumber(record?.margin, record?.openMargin), notional, leverage);
  const livePnl = positionPnlFromMarkPrice(record, entryPrice, markPrice, quantity);
  return {
    entryPrice,
    markPrice,
    quantity,
    leverage,
    notional,
    margin,
    accountMarginPercent: percentOfAccount(margin, accountEquity),
    accountNotionalPercent: percentOfAccount(notional, accountEquity),
    pnl: firstFiniteNumber(livePnl, record?.unrealizedPnl, record?.realizedPnl),
    entryWeight: normalizePercentWeight(firstFiniteNumber(record?.entryWeight, payload?.entryWeight, payload?.weight, payload?.riskPercent))
  };
}

export function orderHoldingNumbers(order: unknown, accountEquity?: number | null): HoldingNumbers {
  const record = isRecord(order) ? order : null;
  const payload = nestedRecord(record, "payload");
  const entryPrice = firstFiniteNumber(record?.limitPrice, record?.price, record?.stopPrice, record?.triggerPrice);
  const quantity = firstFiniteNumber(record?.quantity, record?.filledQuantity);
  const leverage = leverageFromRecord(record);
  const derivedNotional = quantity !== null && entryPrice !== null ? Math.abs(quantity * entryPrice) : null;
  const notional = firstFiniteNumber(payload?.plannedNotional, payload?.actualPlannedNotional, record?.notional, record?.openOrderNotional, derivedNotional);
  const margin = derivedMargin(firstNonZeroFiniteNumber(payload?.actualPlannedMargin, payload?.plannedMargin, record?.margin, record?.openMargin), notional, leverage);
  return {
    entryPrice,
    markPrice: null,
    quantity,
    leverage,
    notional,
    margin,
    accountMarginPercent: firstFiniteNumber(payload?.accountMarginPercent, percentOfAccount(margin, accountEquity)),
    accountNotionalPercent: firstFiniteNumber(payload?.notionalExposurePercent, percentOfAccount(notional, accountEquity)),
    pnl: null,
    entryWeight: normalizePercentWeight(firstFiniteNumber(record?.entryWeight, payload?.entryWeight, payload?.weight))
  };
}

export function planEntryHoldingNumbers(entry: unknown, plan: unknown, accountEquity?: number | null): HoldingNumbers {
  const entryRecord = isRecord(entry) ? entry : null;
  const planRecord = isRecord(plan) ? plan : null;
  const entryPrice = firstFiniteNumber(entryRecord?.price, planRecord?.entryPrice, planRecord?.price);
  const quantity = firstFiniteNumber(entryRecord?.quantity, entryRecord?.size);
  const leverage = leverageFromRecord(planRecord);
  const notional = quantity !== null && entryPrice !== null ? Math.abs(quantity * entryPrice) : null;
  const margin = derivedMargin(null, notional, leverage);
  return {
    entryPrice,
    markPrice: null,
    quantity,
    leverage,
    notional,
    margin,
    accountMarginPercent: percentOfAccount(margin, accountEquity),
    accountNotionalPercent: percentOfAccount(notional, accountEquity),
    pnl: null,
    entryWeight: normalizePercentWeight(firstFiniteNumber(entryRecord?.weight, entryRecord?.entryWeight))
  };
}

export function positionExposureValue(position: unknown) {
  const numbers = positionHoldingNumbers(position);
  return firstFiniteNumber(numbers.notional, numbers.margin);
}

function positionPnlFromMarkPrice(record: Record<string, unknown> | null, entryPrice: number | null, markPrice: number | null, quantity: number | null) {
  if (!record || entryPrice === null || markPrice === null || quantity === null || quantity <= 0) return null;
  const side = String(record.side ?? "").trim().toUpperCase();
  if (side === "SHORT" || side === "SELL") return roundMetric((entryPrice - markPrice) * Math.abs(quantity));
  if (side === "LONG" || side === "BUY") return roundMetric((markPrice - entryPrice) * Math.abs(quantity));
  return null;
}

export function orderExposureValue(order: unknown) {
  const numbers = orderHoldingNumbers(order);
  return firstFiniteNumber(numbers.notional, numbers.margin);
}

export function normalizePercentWeight(value: number | null) {
  if (value === null) return null;
  return value <= 1 ? value * 100 : value;
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

function firstNonZeroFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const parsed = firstFiniteNumber(value);
    if (parsed !== null && Math.abs(parsed) > 0.00000001) return parsed;
  }
  return firstFiniteNumber(...values);
}

function leverageFromRecord(record: Record<string, unknown> | null) {
  const payload = nestedRecord(record, "payload");
  const payloadPlan = nestedRecord(payload, "leveragePlan");
  const leveragePlan = nestedRecord(record, "leveragePlan");
  return firstFiniteNumber(record?.leverage, payload?.leverage, payloadPlan?.suggestedLeverage, leveragePlan?.suggestedLeverage);
}

function derivedMargin(explicitMargin: number | null, notional: number | null, leverage: number | null) {
  if (explicitMargin !== null) return explicitMargin;
  if (notional !== null && leverage !== null && leverage > 0) return roundMetric(notional / leverage);
  return null;
}

function percentOfAccount(value: number | null, accountEquity?: number | null) {
  if (value === null || typeof accountEquity !== "number" || !Number.isFinite(accountEquity) || accountEquity <= 0) return null;
  return roundMetric((value / accountEquity) * 100);
}

function roundMetric(value: number) {
  return Math.round(value * 100_000_000) / 100_000_000;
}

function nestedRecord(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
