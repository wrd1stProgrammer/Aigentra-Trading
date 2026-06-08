export const traderIds = [
  "channel-rider",
  "volume-breaker",
  "pullback-architect",
  "leverage-hunter",
  "liquidity-reaper",
  "volatility-squeezer",
  "trend-sentinel",
  "range-maker",
  "funding-contrarian",
  "orderflow-sniper"
] as const;

export type TraderId = (typeof traderIds)[number];

export const fallbackTraders = [
  {
    id: "channel-rider",
    name: "Channel Rider",
    description: "Trades pullbacks near regression channel edges with trend confirmation.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for a clean channel-edge pullback.",
    baseRiskPercent: 0.7,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "volume-breaker",
    name: "Volume Breaker",
    description: "Looks for volume-backed breakouts and support/resistance retests.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Monitoring retests after clean high-volume level breaks.",
    baseRiskPercent: 0.8,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "pullback-architect",
    name: "Pullback Architect",
    description: "Builds scaled entries where EMA, VWAP-like mean, Fib, and support overlap.",
    riskLevel: "MEDIUM",
    currentPlan: "Preparing staged continuation entries near 1H moving average zones.",
    baseRiskPercent: 0.7,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "leverage-hunter",
    name: "Leverage Hunter",
    description: "Uses futures-specific overheating signals, then waits for structure trigger.",
    riskLevel: "HIGH",
    currentPlan: "Waiting for crowding plus a real 15m structure trigger.",
    baseRiskPercent: 0.6,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "liquidity-reaper",
    name: "Liquidity Reaper",
    description: "Targets stop sweeps above highs or below lows after reclaim/failure confirmation.",
    riskLevel: "HIGH",
    currentPlan: "Watching prior highs and lows for failed stop runs.",
    baseRiskPercent: 0.6,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "volatility-squeezer",
    name: "Volatility Squeezer",
    description: "Waits for volatility compression, then trades the first confirmed expansion.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for compressed BTC/ETH volatility to release with volume.",
    baseRiskPercent: 0.55,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "trend-sentinel",
    name: "Trend Sentinel",
    description: "Holds only high-timeframe continuation setups with slow trailing management.",
    riskLevel: "LOW_MEDIUM",
    currentPlan: "Waiting for a clean high-timeframe continuation pullback.",
    baseRiskPercent: 0.45,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "range-maker",
    name: "Range Maker",
    description: "Trades only clear sideways ranges, fading edges and exiting before breakouts accelerate.",
    riskLevel: "LOW_MEDIUM",
    currentPlan: "Waiting for clean range edges without breakout pressure.",
    baseRiskPercent: 0.4,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "funding-contrarian",
    name: "Funding Contrarian",
    description: "Fades extreme futures funding only after price stalls and structure confirms.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Watching funding extremes, but refusing to fade without structure confirmation.",
    baseRiskPercent: 0.45,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "orderflow-sniper",
    name: "Orderflow Sniper",
    description: "A short-horizon simulated scalper using 1m/5m flow bursts and strict exit timing.",
    riskLevel: "HIGH",
    currentPlan: "Only taking fast simulated scalps when 1m/5m flow is unusually clean.",
    baseRiskPercent: 0.3,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  }
] as const;

export function traderNameKey(id: string): string {
  return `traders.${id}.name`;
}

export function traderShortKey(id: string): string {
  return `traders.${id}.short`;
}

export function traderAliasKey(id: string): string {
  return `traders.${id}.alias`;
}
