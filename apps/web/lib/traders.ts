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
  "orderflow-sniper",
  "donchian-breakout",
  "ichimoku-cloud-pilot",
  "vwap-reclaimer",
  "wyckoff-spring",
  "rsi-divergence-scout",
  "session-raider",
  "imbalance-hunter",
  "momentum-ignition",
  "bollinger-reversion",
  "atr-trail-commander"
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
    currentPlan: "Waiting for compressed BTC volatility to release with volume.",
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
  },
  {
    id: "donchian-breakout",
    name: "Donchian Breakout",
    description: "Trades BTC range expansion after recent highs or lows break with volume.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for BTC to break a Donchian boundary with real participation.",
    baseRiskPercent: 0.62,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "ichimoku-cloud-pilot",
    name: "Ichimoku Cloud Pilot",
    description: "Uses a cloud-style trend proxy to ride BTC continuation setups.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC to hold the cloud proxy after a controlled pullback.",
    baseRiskPercent: 0.58,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "vwap-reclaimer",
    name: "VWAP Reclaimer",
    description: "Trades reclaim or rejection around BTC intraday fair value.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC to reclaim or reject fair value with volume confirmation.",
    baseRiskPercent: 0.5,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "wyckoff-spring",
    name: "Wyckoff Spring",
    description: "Looks for BTC spring/upthrust behavior around range extremes.",
    riskLevel: "HIGH",
    currentPlan: "Waiting for BTC to sweep a range extreme and quickly reclaim or fail it.",
    baseRiskPercent: 0.56,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "rsi-divergence-scout",
    name: "RSI Divergence Scout",
    description: "Scans BTC momentum divergence before structure reclaim or failure.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC exhaustion divergence plus a structure confirmation candle.",
    baseRiskPercent: 0.48,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "session-raider",
    name: "Session Raider",
    description: "Trades BTC session-range breaks around major liquidity handoff windows.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for BTC to break a session range during a high-liquidity transition.",
    baseRiskPercent: 0.52,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "imbalance-hunter",
    name: "Imbalance Hunter",
    description: "Uses BTC displacement candles and imbalance-style pullbacks.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for BTC displacement to leave an imbalance and retest it cleanly.",
    baseRiskPercent: 0.57,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "momentum-ignition",
    name: "Momentum Ignition",
    description: "Takes BTC momentum only when trend, RSI, volume, and OI align.",
    riskLevel: "HIGH",
    currentPlan: "Waiting for BTC momentum, OI, and taker pressure to ignite together.",
    baseRiskPercent: 0.6,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "bollinger-reversion",
    name: "Bollinger Reversion",
    description: "Fades BTC statistical overextension only when trend strength is contained.",
    riskLevel: "LOW_MEDIUM",
    currentPlan: "Waiting for BTC to stretch statistically while trend strength stays contained.",
    baseRiskPercent: 0.42,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "atr-trail-commander",
    name: "ATR Trail Commander",
    description: "Lets BTC trend winners breathe using ATR stops and slower management.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC trend continuation where ATR stop leaves room to hold.",
    baseRiskPercent: 0.55,
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
