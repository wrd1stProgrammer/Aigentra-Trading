export const HOLDING_HORIZONS = ["SCALP", "INTRADAY", "SWING", "POSITION"] as const;
export const STRATEGY_FAMILIES = [
  "BREAKOUT",
  "TREND_FOLLOW",
  "PULLBACK",
  "MEAN_REVERSION",
  "LIQUIDITY_REVERSAL",
  "FLOW_CONTRARIAN",
  "VOLATILITY"
] as const;

export type HoldingHorizon = (typeof HOLDING_HORIZONS)[number];
export type StrategyFamily = (typeof STRATEGY_FAMILIES)[number];

export type TradeClassification = {
  readonly holdingHorizon: HoldingHorizon;
  readonly strategyFamily: StrategyFamily;
};

const HOLDING_HORIZON_KEYS = {
  SCALP: "holdingHorizon.scalp",
  INTRADAY: "holdingHorizon.intraday",
  SWING: "holdingHorizon.swing",
  POSITION: "holdingHorizon.position"
} as const satisfies Record<HoldingHorizon, string>;

const STRATEGY_FAMILY_KEYS = {
  BREAKOUT: "strategyFamily.breakout",
  TREND_FOLLOW: "strategyFamily.trendFollow",
  PULLBACK: "strategyFamily.pullback",
  MEAN_REVERSION: "strategyFamily.meanReversion",
  LIQUIDITY_REVERSAL: "strategyFamily.liquidityReversal",
  FLOW_CONTRARIAN: "strategyFamily.flowContrarian",
  VOLATILITY: "strategyFamily.volatility"
} as const satisfies Record<StrategyFamily, string>;

export function tradeClassification(...sources: readonly unknown[]): TradeClassification | null {
  for (const source of sources) {
    for (const candidate of classificationCandidates(source)) {
      const holdingHorizon = parseHoldingHorizon(candidate.holdingHorizon);
      const strategyFamily = parseStrategyFamily(candidate.strategyFamily);
      if (holdingHorizon && strategyFamily) return { holdingHorizon, strategyFamily };
    }
  }
  return null;
}

export function holdingHorizonLabelKey(horizon: HoldingHorizon): string {
  return HOLDING_HORIZON_KEYS[horizon];
}

export function strategyFamilyLabelKey(strategy: StrategyFamily): string {
  return STRATEGY_FAMILY_KEYS[strategy];
}

function classificationCandidates(source: unknown): readonly Record<string, unknown>[] {
  const record = asRecord(source);
  if (!record) return [];
  const payload = asRecord(record.payload);
  const audit = asRecord(record.audit);
  return [
    asRecord(record.managementPlan),
    asRecord(payload?.managementPlan),
    record,
    payload,
    asRecord(audit?.executionProfile)
  ].filter(isRecord);
}

function parseHoldingHorizon(value: unknown): HoldingHorizon | null {
  switch (value) {
    case "SCALP":
    case "INTRADAY":
    case "SWING":
    case "POSITION":
      return value;
    default:
      return null;
  }
}

function parseStrategyFamily(value: unknown): StrategyFamily | null {
  switch (value) {
    case "BREAKOUT":
    case "TREND_FOLLOW":
    case "PULLBACK":
    case "MEAN_REVERSION":
    case "LIQUIDITY_REVERSAL":
    case "FLOW_CONTRARIAN":
    case "VOLATILITY":
      return value;
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null;
}

function isRecord(value: Record<string, unknown> | null): value is Record<string, unknown> {
  return value !== null;
}
