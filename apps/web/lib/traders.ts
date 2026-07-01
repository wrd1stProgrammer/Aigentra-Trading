export const traderIds = [
  "channel-rider",
  "volume-breaker",
  "pullback-architect",
  "leverage-hunter",
  "liquidation-pressure-sniper",
  "volatility-skew-sentinel",
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
    name: "Channel Cartographer",
    description: "Trades channel pullbacks only when price reaches a clear edge and the larger trend still supports the bounce or rejection.",
    concept: "Think of it as riding a sloped price lane: it buys near the lower lane in uptrends and shorts near the upper lane in downtrends.",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for a clean channel-edge pullback.",
    baseRiskPercent: 0.7,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "volume-breaker",
    name: "Volume Breaker",
    description: "Waits for a major level to break with real participation, then checks whether the retest confirms the breakout instead of chasing.",
    concept: "Its core idea is simple: a breakout matters only when volume, retest behavior, and structure all agree that new traders joined.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Monitoring retests after clean high-volume level breaks.",
    baseRiskPercent: 0.8,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "pullback-architect",
    name: "Pullback Architect",
    description: "Builds staged entries inside healthy trend pullbacks where moving averages, fair-value zones, and structure overlap.",
    concept: "It tries to avoid buying the top: first prove the larger trend, then split entries around the pullback zone with a clear invalidation.",
    riskLevel: "MEDIUM",
    currentPlan: "Preparing staged continuation entries near 1H moving average zones.",
    baseRiskPercent: 0.7,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "leverage-hunter",
    name: "Leverage Tracker",
    description: "Uses futures crowding, funding, and open-interest pressure to find squeeze setups, but still waits for a structure trigger.",
    concept: "It hunts moments where crowded leverage may be forced out, then enters only after price confirms the squeeze direction.",
    riskLevel: "HIGH",
    currentPlan: "Waiting for crowding plus a real 15m structure trigger.",
    baseRiskPercent: 0.6,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "liquidation-pressure-sniper",
    name: "Liquidation Pressure Sniper",
    description: "Uses liquidation, open-interest, and crowding pressure to trade forced futures flushes only after price confirms.",
    concept: "Coinalyze-backed liquidation specialist: it waits for forced flow to appear, then enters only when BTC structure agrees.",
    longConditions: [
      "Long liquidations have flushed or shorts look trapped",
      "15m price action reclaims after the flush",
      "OI pressure stops expanding against the entry",
      "Risk/reward remains valid after fee buffer"
    ],
    shortConditions: [
      "Short liquidations look exhausted or longs remain crowded",
      "15m price action rejects after the flush",
      "OI/funding no longer validates the crowded side",
      "Risk/reward remains valid after fee buffer"
    ],
    entryRules: ["55% on confirmed pressure reversal", "45% on controlled retest"],
    takeProfitRules: ["TP1 at forced-flow release", "TP2 near the next liquidation pocket"],
    stopLossRules: ["Beyond the flush/rejection trigger", "Exit if liquidation pressure flips"],
    aiReviewChecklist: [
      "Is this forced flow or normal volatility?",
      "Does long/short ratio support the direction?",
      "Is OI confirming or warning against the trade?",
      "Is the retest entry still reachable?"
    ],
    lifecycleStatus: "new",
    lifecycleLabel: "NEW",
    launchMonth: "2026-07",
    riskLevel: "HIGH",
    currentPlan: "Waiting for liquidation pressure to align with a clean BTC structure trigger.",
    baseRiskPercent: 0.54,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "volatility-skew-sentinel",
    name: "Volatility Skew Sentinel",
    description: "Reads Deribit BTC option skew and realized-volatility pressure before trading confirmed spot/futures direction.",
    concept: "Options-volatility sentinel: put/call IV skew, option volume, realized volatility, and BTC structure decide whether fear or upside chase is mispriced.",
    longConditions: [
      "Put skew is elevated while BTC stops making lower closes",
      "15m reclaim confirms fear is not accelerating",
      "Realized volatility allows defined invalidation",
      "4H trend is not strongly bearish"
    ],
    shortConditions: [
      "Call skew or upside option chase is elevated",
      "15m rejection confirms upside premium is fading",
      "Realized volatility allows defined invalidation",
      "4H trend is not strongly bullish"
    ],
    entryRules: ["55% on skew-confirmed trigger", "45% on retest if skew remains elevated"],
    takeProfitRules: ["TP1 when skew trade reaches the first risk target", "TP2 near the next options-driven liquidity zone"],
    stopLossRules: ["Beyond trigger candle", "Exit if skew normalizes before price follows"],
    aiReviewChecklist: [
      "Is the skew signal fresh or stale?",
      "Does price confirm the options signal?",
      "Is realized volatility too high for the stop?",
      "Should the second slice be cancelled?"
    ],
    lifecycleStatus: "new",
    lifecycleLabel: "NEW",
    launchMonth: "2026-07",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for Deribit BTC option skew to diverge from confirmed price structure.",
    baseRiskPercent: 0.46,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "liquidity-reaper",
    name: "Liquidity Sweeper",
    description: "Targets stop-sweep traps around prior highs or lows after price quickly reclaims or fails the swept level.",
    concept: "When price pokes beyond an obvious level and snaps back, this trader treats it as trapped liquidity rather than a clean breakout.",
    riskLevel: "HIGH",
    currentPlan: "Watching prior highs and lows for failed stop runs.",
    baseRiskPercent: 0.6,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "volatility-squeezer",
    name: "Squeeze Operator",
    description: "Waits for volatility to compress, then joins the first expansion only when candle body, volume, and direction confirm.",
    concept: "Quiet markets often expand suddenly; this trader looks for the first clean release while avoiding one-candle fakeouts.",
    retiredFromMonth: "2026-07",
    lifecycleStatus: "retired",
    lifecycleLabel: "RETIRED",
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for compressed BTC volatility to release with volume.",
    baseRiskPercent: 0.55,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "trend-sentinel",
    name: "Trend Sentinel",
    description: "Focuses on slower high-timeframe continuation trades and gives winners more room when the larger trend remains intact.",
    concept: "It is the patient trend desk: fewer trades, wider context, controlled pullback entries, and trailing exits instead of quick scalps.",
    riskLevel: "LOW_MEDIUM",
    currentPlan: "Waiting for a clean high-timeframe continuation pullback.",
    baseRiskPercent: 0.45,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "range-maker",
    name: "Range Mechanic",
    description: "Trades only clear sideways ranges, fading the edges when trend pressure is weak and exiting before breakouts accelerate.",
    concept: "It assumes the market will rotate inside a box until proven otherwise, so it buys low edges and shorts high edges with quick invalidation.",
    riskLevel: "LOW_MEDIUM",
    currentPlan: "Waiting for clean range edges without breakout pressure.",
    baseRiskPercent: 0.4,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "funding-contrarian",
    name: "Funding Contrarian",
    description: "Fades extreme futures funding only when price stalls, structure confirms, and the crowded side starts losing momentum.",
    concept: "High or negative funding alone is not enough; this trader waits for proof that the crowded futures bet is becoming vulnerable.",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Watching funding extremes, but refusing to fade without structure confirmation.",
    baseRiskPercent: 0.45,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "orderflow-sniper",
    name: "Orderflow Sniper",
    description: "Runs short-horizon simulated scalps from 1m and 5m order-flow bursts, with very fast exits when flow weakens.",
    concept: "This is the fast desk: it wants immediate participation from taker flow and accepts that stale micro trades should die quickly.",
    riskLevel: "HIGH",
    currentPlan: "Only taking fast simulated scalps when 1m/5m flow is unusually clean.",
    baseRiskPercent: 0.3,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "donchian-breakout",
    name: "Donchian Breakout Boss",
    description: "Trades BTC range expansion after recent highs or lows break with volume.",
    concept: "Turtle/Donchian style BTC breakout with 15m confirmation, OI expansion, and ATR-based trailing.",
    longConditions: [
      "15m/1H close above a recent swing high",
      "Volume z-score or OI confirms expansion",
      "4H trend is not bearish",
      "ATR stop can support at least 1.45R"
    ],
    shortConditions: [
      "15m/1H close below a recent swing low",
      "Volume z-score or OI confirms expansion",
      "4H trend is not bullish",
      "ATR stop can support at least 1.45R"
    ],
    entryRules: ["60% on breakout close", "40% on first retest that holds outside the range"],
    takeProfitRules: ["TP1 at 1.6R", "TP2 trails toward 3.2R or next swing liquidity"],
    stopLossRules: ["Behind the broken Donchian boundary", "Cancel retest entry if price closes back inside range"],
    aiReviewChecklist: [
      "Is this clean range expansion or a fakeout?",
      "Is the retest entry reachable without chasing?",
      "Should the second entry be cancelled if momentum runs?",
      "Does OI expansion support new trend participation?"
    ],
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for BTC to break a Donchian boundary with real participation.",
    baseRiskPercent: 0.62,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "ichimoku-cloud-pilot",
    name: "Cloud Pilot",
    description: "Uses a cloud-style trend proxy to ride BTC continuation only while trend, momentum, and funding stay healthy.",
    concept: "Ichimoku-inspired trend follower using EMA cloud proxy, 4H trend, momentum health, and delayed confirmation.",
    longConditions: [
      "4H trend is bullish",
      "1H close holds above the EMA20/EMA50 cloud proxy",
      "RSI remains constructive but not euphoric",
      "Funding is not extreme"
    ],
    shortConditions: [
      "4H trend is bearish",
      "1H close holds below the EMA20/EMA50 cloud proxy",
      "RSI remains weak but not capitulated",
      "Funding is not extreme"
    ],
    entryRules: ["40% near cloud edge", "60% after continuation candle confirms"],
    takeProfitRules: ["TP1 near prior swing", "TP2 uses wider trend extension"],
    stopLossRules: ["Outside cloud proxy", "Exit if 1H closes through the opposite cloud side"],
    aiReviewChecklist: [
      "Is the cloud proxy actually trending or flat?",
      "Is the pullback healthy rather than reversal?",
      "Should the agent trail instead of taking quick profit?",
      "Is funding too crowded for continuation?"
    ],
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC to hold the cloud proxy after a controlled pullback.",
    baseRiskPercent: 0.58,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "vwap-reclaimer",
    name: "VWAP Reclaim Crew",
    description: "Trades reclaim or rejection around BTC intraday fair value after price stretches too far and then proves acceptance.",
    concept: "VWAP-like mean reclaim using EMA20 proxy, volume response, and rejection of unfair intraday price.",
    longConditions: [
      "Price stretches below fair value then reclaims EMA20/VWAP proxy",
      "15m close confirms reclaim",
      "Seller volume fades",
      "OI does not expand against the reclaim"
    ],
    shortConditions: [
      "Price stretches above fair value then fails EMA20/VWAP proxy",
      "15m close confirms rejection",
      "Buyer volume fades",
      "OI does not expand against the rejection"
    ],
    entryRules: ["50% on reclaim/fail close", "50% on shallow retest of fair value"],
    takeProfitRules: ["TP1 at nearest swing midpoint", "TP2 at opposite intraday liquidity"],
    stopLossRules: ["Beyond failed reclaim candle", "Cancel if price accepts back through fair value"],
    aiReviewChecklist: [
      "Is this a real reclaim or a dead-cat bounce?",
      "Is current price too close to target?",
      "Should size be smaller because mean trades decay quickly?",
      "Is taker flow confirming the reclaim/fail?"
    ],
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC to reclaim or reject fair value with volume confirmation.",
    baseRiskPercent: 0.5,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "wyckoff-spring",
    name: "Wyckoff Springboard",
    description: "Looks for BTC spring or upthrust traps around range extremes where a sweep quickly snaps back inside the range.",
    concept: "Wyckoff spring/upthrust trader: sweep outside range, reclaim/failure close, volume spike, and fast invalidation.",
    longConditions: [
      "Price sweeps range low",
      "Lower wick is meaningful",
      "15m closes back inside range",
      "Volume spike shows stop-run participation"
    ],
    shortConditions: [
      "Price sweeps range high",
      "Upper wick is meaningful",
      "15m closes back inside range",
      "Volume spike shows stop-run participation"
    ],
    entryRules: ["60% on reclaim/failure candle", "40% on retest of swept level"],
    takeProfitRules: ["TP1 at range midpoint", "TP2 near opposite liquidity pocket"],
    stopLossRules: ["Outside wick extreme", "Exit if swept level is accepted again"],
    aiReviewChecklist: [
      "Is this a spring/upthrust or a real breakout?",
      "Is wick plus volume enough?",
      "Is stop outside the actual sweep?",
      "Should this be a fast partial-profit trade?"
    ],
    riskLevel: "HIGH",
    currentPlan: "Waiting for BTC to sweep a range extreme and quickly reclaim or fail it.",
    baseRiskPercent: 0.56,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "rsi-divergence-scout",
    name: "RSI Divergence Scout",
    description: "Scans BTC momentum divergence, then waits for structure reclaim or failure before treating exhaustion as tradable.",
    concept: "Momentum divergence scout using RSI, swing structure, exhaustion behavior, and confirmation candle.",
    longConditions: [
      "15m/1H RSI is below neutral but improving",
      "Price stops making clean downside progress",
      "15m reclaim candle appears",
      "Funding/crowding do not fight the reversal"
    ],
    shortConditions: [
      "15m/1H RSI is above neutral but weakening",
      "Price stops making clean upside progress",
      "15m failure candle appears",
      "Funding/crowding do not fight the reversal"
    ],
    entryRules: ["35% on confirmation", "65% on retest of reclaim/failure level"],
    takeProfitRules: ["TP1 near mean reversion target", "TP2 near prior swing"],
    stopLossRules: ["Beyond divergence invalidation swing", "Exit if RSI thrust accelerates against thesis"],
    aiReviewChecklist: [
      "Is divergence real or just weak momentum inside trend?",
      "Does structure confirm before entry?",
      "Should the trade be skipped if HTF trend is too strong?",
      "Is RR still valid after fee buffer?"
    ],
    riskLevel: "MEDIUM",
    currentPlan: "Waiting for BTC exhaustion divergence plus a structure confirmation candle.",
    baseRiskPercent: 0.48,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "session-raider",
    name: "Session Raider",
    description: "Trades BTC session-range breaks around major liquidity handoff windows.",
    concept: "Session breakout specialist for Asia/London/New York handoff windows with fast stale-order expiry.",
    longConditions: [
      "Session transition window is active",
      "15m candle breaks above local range",
      "Volume or body expansion appears",
      "No immediate 4H bearish conflict"
    ],
    shortConditions: [
      "Session transition window is active",
      "15m candle breaks below local range",
      "Volume or body expansion appears",
      "No immediate 4H bullish conflict"
    ],
    entryRules: ["Single entry on confirmed session break", "Expire quickly if not filled"],
    takeProfitRules: ["TP1 at fast liquidity target", "TP2 only if momentum persists"],
    stopLossRules: ["Behind session break candle", "Close if price re-enters session range"],
    aiReviewChecklist: [
      "Is this real session expansion or a thin-liquidity wick?",
      "Should order expire quickly?",
      "Is spread/fee buffer worth the scalp-like target?",
      "Does higher timeframe block the direction?"
    ],
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for BTC to break a session range during a high-liquidity transition.",
    baseRiskPercent: 0.52,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "imbalance-hunter",
    name: "Imbalance Hunter",
    description: "Uses BTC displacement candles and imbalance-style pullbacks when a strong move leaves a clean retest zone.",
    concept: "Displacement and imbalance pullback trader using strong candle body, midpoint retest, and continuation structure.",
    longConditions: [
      "15m bullish displacement body is strong",
      "Price holds above EMA20 or structure",
      "Retest into imbalance midpoint is possible",
      "OI/volume support continuation"
    ],
    shortConditions: [
      "15m bearish displacement body is strong",
      "Price holds below EMA20 or structure",
      "Retest into imbalance midpoint is possible",
      "OI/volume support continuation"
    ],
    entryRules: ["70% at imbalance midpoint", "30% after continuation resumes"],
    takeProfitRules: ["TP1 at displacement extension", "TP2 at next liquidity pool"],
    stopLossRules: ["Beyond imbalance origin", "Cancel if midpoint is sliced through"],
    aiReviewChecklist: [
      "Is the imbalance meaningful or just a normal candle?",
      "Is retest entry on the correct side?",
      "Does continuation room justify holding?",
      "Should later scale be cancelled if price runs?"
    ],
    retiredFromMonth: "2026-07",
    lifecycleStatus: "retired",
    lifecycleLabel: "RETIRED",
    riskLevel: "MEDIUM_HIGH",
    currentPlan: "Waiting for BTC displacement to leave an imbalance and retest it cleanly.",
    baseRiskPercent: 0.57,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "momentum-ignition",
    name: "Momentum Igniter",
    description: "Takes BTC momentum only when trend, RSI, volume, open interest, and taker pressure align in the same direction.",
    concept: "Aggressive momentum ignition trader requiring EMA stack, RSI thrust, OI increase, and taker-flow confirmation.",
    longConditions: [
      "1H EMA20 is above EMA50",
      "RSI thrust is constructive",
      "Taker buy share and OI confirm",
      "Price is not already overextended into TP"
    ],
    shortConditions: [
      "1H EMA20 is below EMA50",
      "RSI thrust is weak",
      "Taker sell pressure and OI confirm",
      "Price is not already overextended into TP"
    ],
    entryRules: ["Single aggressive entry on ignition", "No averaging down"],
    takeProfitRules: ["TP1 before momentum stalls", "TP2 only if OI/flow persist"],
    stopLossRules: ["Behind ignition candle", "Reduce fast if flow flips"],
    aiReviewChecklist: [
      "Is this ignition or late chase?",
      "Does taker flow agree with OI?",
      "Should leverage be capped by volatility?",
      "Is there enough room after fees?"
    ],
    riskLevel: "HIGH",
    currentPlan: "Waiting for BTC momentum, OI, and taker pressure to ignite together.",
    baseRiskPercent: 0.6,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "bollinger-reversion",
    name: "Bollinger Boomerang",
    description: "Fades BTC statistical overextension only when trend strength is contained.",
    concept: "Bollinger/RSI mean reversion trader using range filter, volume exhaustion, and midpoint exits.",
    longConditions: [
      "RSI is depressed",
      "Price is below lower statistical band/proxy",
      "Trend regime is not strong bearish",
      "Volume does not show breakout continuation"
    ],
    shortConditions: [
      "RSI is elevated",
      "Price is above upper statistical band/proxy",
      "Trend regime is not strong bullish",
      "Volume does not show breakout continuation"
    ],
    entryRules: ["50% at stretch", "50% deeper into band extension"],
    takeProfitRules: ["TP1 at mean", "TP2 near opposite half-band only if reversion persists"],
    stopLossRules: ["Outside statistical extension", "Exit if band walk begins"],
    aiReviewChecklist: [
      "Is this range reversion or a strong band walk?",
      "Should size be cut if trend regime is strong?",
      "Is TP close enough for mean reversion?",
      "Is funding/crowding worsening the fade?"
    ],
    riskLevel: "LOW_MEDIUM",
    currentPlan: "Waiting for BTC to stretch statistically while trend strength stays contained.",
    baseRiskPercent: 0.42,
    mockPerformance: { return7d: 0, return30d: 0, winRate: 0, maxDrawdown: 0, currentEquity: 10000 }
  },
  {
    id: "atr-trail-commander",
    name: "ATR Trail Boss",
    description: "Lets BTC trend winners breathe using ATR stops and slower management when the higher-timeframe trend remains intact.",
    concept: "ATR continuation system: higher timeframe trend, volatility-adjusted stop, and pyramiding only after profit cushion.",
    longConditions: [
      "4H trend is bullish",
      "Price stays above 1H EMA50",
      "ATR stop remains structurally valid",
      "Momentum is not blow-off"
    ],
    shortConditions: [
      "4H trend is bearish",
      "Price stays below 1H EMA50",
      "ATR stop remains structurally valid",
      "Momentum is not capitulation exhaustion"
    ],
    entryRules: ["40% on trend pullback", "60% after continuation resumes"],
    takeProfitRules: ["TP1 after 2R", "TP2 trails using ATR rather than fixed scalp target"],
    stopLossRules: ["ATR stop outside structure", "Trail only after profit cushion"],
    aiReviewChecklist: [
      "Should this winner be allowed to run?",
      "Is ATR stop too wide for account risk?",
      "Is adding/pyramiding justified after profit cushion?",
      "Has the trend actually ended or only pulled back?"
    ],
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

export function traderDetailKey(id: string): string {
  return `traders.${id}.detail`;
}

export function traderAliasKey(id: string): string {
  return `traders.${id}.alias`;
}
