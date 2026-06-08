type LeverageValueSource = {
  readonly averageLeverage?: unknown;
  readonly leverage?: unknown;
};

export type LeverageSampleState = {
  readonly averageLeverage?: number | null;
  readonly leverageTotal?: number;
  readonly leverageCount?: number;
};

export function appendLeverageSample<T extends LeverageSampleState>(exposure: T, leverage: number | null): T & LeverageSampleState {
  if (leverage === null || leverage <= 0) return exposure;
  const leverageTotal = (exposure.leverageTotal ?? 0) + leverage;
  const leverageCount = (exposure.leverageCount ?? 0) + 1;
  return {
    ...exposure,
    averageLeverage: leverageTotal / leverageCount,
    leverageTotal,
    leverageCount
  };
}

export function activePositionLeverage({
  exposure,
  summary,
  trader,
  position
}: {
  readonly exposure?: LeverageValueSource | null;
  readonly summary?: LeverageValueSource | null;
  readonly trader?: LeverageValueSource | null;
  readonly position?: unknown;
}) {
  return firstNumericValue(
    exposure?.averageLeverage,
    summary?.averageLeverage,
    trader?.averageLeverage,
    positionLeverage(position),
    summary?.leverage,
    trader?.leverage
  );
}

export function positionLeverage(position?: unknown) {
  return leverageFromExposure(position);
}

export function orderLeverage(order?: unknown) {
  return leverageFromExposure(order);
}

export function planLeverage(plan?: unknown) {
  return leverageFromExposure(plan);
}

function leverageFromExposure(exposure?: unknown) {
  if (!isRecord(exposure)) return null;
  const payload = isRecord(exposure.payload) ? exposure.payload : null;
  const payloadLeveragePlan = isRecord(payload?.leveragePlan) ? payload.leveragePlan : null;
  const leveragePlan = isRecord(exposure.leveragePlan) ? exposure.leveragePlan : null;
  return firstNumericValue(
    exposure.leverage,
    payload?.leverage,
    payloadLeveragePlan?.suggestedLeverage,
    leveragePlan?.suggestedLeverage
  );
}

export function formatLeverageBadge(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return null;
  const digits = Number.isInteger(value) || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)}x`;
}

function firstNumericValue(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
