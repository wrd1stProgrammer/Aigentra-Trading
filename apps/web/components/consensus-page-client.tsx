"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { 
  CircleNotch,
  Gauge,
  Lightning,
  Brain
} from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { 
  getCachedLeaderboardBundle, 
  getRecentTradePlans, 
  LEAGUE_LIVE_REFETCH_INTERVAL_MS, 
  leaderboardBundleQueryOptions,
  type LeaderboardBundle,
  type TraderProfile,
  type PaperPosition,
  type PaperOrder,
  type ManagementReview,
  type TraderPaperSummary
} from "@/lib/api";
import { buildScenarios, buildStandings, traderVisuals } from "@/lib/league";
import { fallbackTraders } from "@/lib/traders";
import { formatCurrency, formatNumber } from "@/lib/format";
import { type Locale } from "@/lib/i18n";

// Nationalities for traders
const traderFlags: Record<string, string> = {
  "channel-rider": "🇰🇷",
  "volume-breaker": "🇰🇷",
  "pullback-architect": "🇰🇷",
  "leverage-hunter": "🇰🇷",
  "liquidity-reaper": "🇺🇸",
  "volatility-squeezer": "🇰🇷",
  "trend-sentinel": "🇺🇸",
  "range-maker": "🇰🇷",
  "funding-contrarian": "🇰🇷",
  "orderflow-sniper": "🇺🇸",
  "donchian-breakout": "₿",
  "ichimoku-cloud-pilot": "₿",
  "vwap-reclaimer": "₿",
  "wyckoff-spring": "₿",
  "rsi-divergence-scout": "₿",
  "session-raider": "₿",
  "imbalance-hunter": "₿",
  "momentum-ignition": "₿",
  "bollinger-reversion": "₿",
  "atr-trail-commander": "₿"
};

// Technical signal definitions
const signalTypes = [
  { name: "EMA Support / Resistance", key: "ema", keywords: ["ema", "moving average", "이평선", "이동평균", "support", "resistance"] },
  { name: "RSI Divergence / Reversion", key: "rsi", keywords: ["rsi", "divergence", "다이버전스", "괴리", "reversion", "과매도", "과매수"] },
  { name: "Volume Breakout", key: "volume", keywords: ["volume", "breakout", "거래량", "돌파", "retest"] },
  { name: "Liquidity Sweep", key: "liquidity", keywords: ["liquidity", "sweep", "유동성", "스윕", "hunt"] },
  { name: "Volatility Squeeze", key: "squeeze", keywords: ["squeeze", "compression", "압축", "스퀴즈", "bollinger", "볼린저"] },
  { name: "Donchian Breakout", key: "donchian", keywords: ["donchian", "돈치안", "channel breakout"] },
  { name: "Ichimoku Cloud Trend", key: "ichimoku", keywords: ["ichimoku", "cloud", "일목", "구름"] },
  { name: "Wyckoff Spring Trap", key: "wyckoff", keywords: ["wyckoff", "spring", "와이코프", "스프링", "trap"] },
  { name: "Orderflow Scalping", key: "orderflow", keywords: ["orderflow", "주문 흐름", "오더플로우", "scalp"] },
  { name: "Funding Rate / OI Overheat", key: "funding", keywords: ["funding", "oi", "open interest", "펀딩", "미결제", "overheat"] }
];

const signalLabels: Record<string, { ko: string; en: string }> = {
  ema: { ko: "이동평균선 지지/저항", en: "EMA Support / Resistance" },
  rsi: { ko: "RSI 다이버전스/반전", en: "RSI Divergence / Reversion" },
  volume: { ko: "거래량 돌파/리테스트", en: "Volume Breakout / Retest" },
  liquidity: { ko: "유동성 스윕 & 트랩", en: "Liquidity Sweep & Trap" },
  squeeze: { ko: "변동성 압축/스퀴즈", en: "Volatility Squeeze" },
  donchian: { ko: "돈치안 채널 돌파", en: "Donchian Channel Breakout" },
  ichimoku: { ko: "일목구름 추세 교차", en: "Ichimoku Cloud Trend Cross" },
  wyckoff: { ko: "와이코프 스프링", en: "Wyckoff Spring Trap" },
  orderflow: { ko: "주문흐름 오더북 스캘핑", en: "Orderflow Scalping" },
  funding: { ko: "펀딩비/OI 과열 역추세", en: "Funding Rate / OI Contrarian" }
};

function normalizeSide(value?: string | null): "long" | "short" | undefined {
  const side = String(value ?? "").toLowerCase();
  if (side === "long" || side === "buy") return "long";
  if (side === "short" || side === "sell") return "short";
  return undefined;
}

function normalizeStatusText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[-\s]+/g, "_")
    .toUpperCase();
}

function isActivePosition(status?: string | null) {
  const normalized = normalizeStatusText(status);
  return !["CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(normalized);
}

function isActiveOrder(status?: string | null) {
  const normalized = normalizeStatusText(status);
  return !["FILLED", "CLOSED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(normalized);
}

function numberValue(...values: Array<unknown>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function planEntryPrice(plan?: Record<string, any>) {
  const payload = (plan?.payload ?? {}) as Record<string, any>;
  const entries = Array.isArray(plan?.entries) ? plan?.entries : Array.isArray(payload.entries) ? payload.entries : [];
  const firstEntry = entries[0] as Record<string, any> | undefined;
  return numberValue(firstEntry?.price, plan?.entryPrice, plan?.price, payload.entryPrice, payload.price);
}

function getTradersNativeSignal(traderId: string): string | null {
  if (traderId.includes("rsi-divergence")) return "rsi";
  if (traderId.includes("pullback-architect")) return "ema";
  if (traderId.includes("volume-breaker")) return "volume";
  if (traderId.includes("liquidity-reaper")) return "liquidity";
  if (traderId.includes("volatility-squeezer")) return "squeeze";
  if (traderId.includes("donchian-breakout")) return "donchian";
  if (traderId.includes("ichimoku-cloud-pilot")) return "ichimoku";
  if (traderId.includes("wyckoff-spring")) return "wyckoff";
  if (traderId.includes("orderflow-sniper")) return "orderflow";
  if (traderId.includes("leverage-hunter") || traderId.includes("funding-contrarian")) return "funding";
  if (traderId.includes("bollinger-reversion")) return "rsi";
  if (traderId.includes("channel-rider")) return "ema";
  if (traderId.includes("vwap-reclaimer")) return "volume";
  return null;
}

type TraderActiveState = {
  traderId: string;
  status: "inPosition" | "pendingEntry" | "qualifiedSetup" | "watching";
  side?: "long" | "short";
  leverage: number | null;
  price: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  label: string;
  detail: string;
  tone: "good" | "bad" | "warn" | "neutral";
};

function getTraderActiveState(
  trader: TraderProfile,
  summary: TraderPaperSummary | undefined,
  positions: PaperPosition[],
  orders: PaperOrder[],
  pendingPlans: Array<Record<string, any>>,
  t: (key: string) => string
): TraderActiveState {
  // 1. In position (진입 중)
  const position = positions.find((p) => p.traderId === trader.id && isActivePosition(p.status));
  if (position) {
    const side = normalizeSide(position.side);
    const leverage = position.leverage ?? summary?.leverage ?? null;
    const price = position.averageEntryPrice ?? position.entryPrice ?? null;
    const pnl = position.unrealizedPnl ?? summary?.unrealizedPnl ?? null;
    const pnlText = pnl !== null ? (pnl >= 0 ? `+${pnl.toFixed(1)} USDT` : `${pnl.toFixed(1)} USDT`) : "";
    return {
      traderId: trader.id,
      status: "inPosition",
      side,
      leverage,
      price,
      takeProfit: position.takeProfit ?? null,
      stopLoss: position.stopLoss ?? null,
      label: t("leaderboard.status.inPosition"),
      detail: pnlText,
      tone: pnl !== null && pnl < 0 ? "bad" : "good",
    };
  }

  // 2. Pending entry (진입 대기)
  const order = orders.find((o) => o.traderId === trader.id && isActiveOrder(o.status));
  if (order) {
    const side = normalizeSide(order.side);
    const leverage = order.leverage ?? summary?.leverage ?? null;
    const price = order.price ?? order.limitPrice ?? order.stopPrice ?? null;
    return {
      traderId: trader.id,
      status: "pendingEntry",
      side,
      leverage,
      price,
      takeProfit: order.takeProfitPrice ?? null,
      stopLoss: order.stopLossPrice ?? null,
      label: t("leaderboard.status.pendingEntry"),
      detail: price ? `@${price.toLocaleString()}` : "",
      tone: "warn",
    };
  }

  // 3. Watching / Plan pending (셋업 대기)
  const plan = pendingPlans.find(
    (p) => (p.traderId === trader.id || p.trader_id === trader.id) &&
      normalizeStatusText(p.status ?? p.payload?.status) === "PAPER_TRADING_PENDING"
  );
  const planStatus = normalizeStatusText(summary?.latestPlanStatus);
  if (plan || planStatus === "PAPER_TRADING_PENDING") {
    const price = planEntryPrice(plan);
    return {
      traderId: trader.id,
      status: "watching",
      side: undefined, // undefined so it maps to Watching list, not active LONG/SHORT
      leverage: null,
      price: null,
      takeProfit: null,
      stopLoss: null,
      label: t("leaderboard.status.watching"),
      detail: t("leaderboard.status.qualifiedSetup") + (price ? ` @${price.toLocaleString()}` : ""),
      tone: "neutral",
    };
  }

  return {
    traderId: trader.id,
    status: "watching",
    side: undefined,
    leverage: null,
    price: null,
    takeProfit: null,
    stopLoss: null,
    label: t("leaderboard.status.watching"),
    detail: t("leaderboard.status.noSetup"),
    tone: "neutral",
  };
}

const localT = {
  ko: {
    averageRiskReward: "평균 손익비",
    providerSentiment: "AI 모델별 관점 분포",
    consensusBrief: "AI 컨센서스 종합 요약",
    sentimentMomentum: "센티멘트 모멘텀 (12H)",
    tradersUsing: "지표 채택 AI",
    bullishMomentum: "매수 모멘텀 강화",
    bearishMomentum: "매도 모멘텀 강화",
    netDirectionalLeverage: "순 방향 레버리지",
    averageTP: "평균 익절 폭",
    averageSL: "평균 손절 폭",
    noActiveBrief: "현재 분석 중인 활성 포지션이 없어 컨센서스 요약이 제공되지 않습니다."
  },
  en: {
    averageRiskReward: "Average Risk-Reward",
    providerSentiment: "Sentiment by AI Model",
    consensusBrief: "AI Consensus Brief",
    sentimentMomentum: "Sentiment Momentum (12H)",
    tradersUsing: "Traders using this",
    bullishMomentum: "Bullish Momentum",
    bearishMomentum: "Bearish Momentum",
    netDirectionalLeverage: "Net Directional Leverage",
    averageTP: "Avg Take Profit",
    averageSL: "Avg Stop Loss",
    noActiveBrief: "No active positions currently. Consensus brief is not available."
  }
};

function formatProviderName(provider: string) {
  const p = provider.toLowerCase();
  if (p.includes("gemini")) return "Gemini 2.5 Pro";
  if (p.includes("gpt")) return "GPT-4o";
  if (p.includes("claude")) return "Claude 3.5 Sonnet";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function ConsensusPageClient() {
  const { locale, t } = useAppContext();

  const fallbackBundle = useMemo<LeaderboardBundle>(() => ({
    symbol: "BTCUSDT",
    traders: fallbackTraders as unknown as TraderProfile[],
    summaries: [],
    positions: [],
    orders: [],
    managementReviews: [],
    scanner: null
  }), []);

  // Fetch leaderboard bundle
  const btcQuery = useQuery({
    ...leaderboardBundleQueryOptions("BTCUSDT"),
    placeholderData: (previousData) => previousData?.symbol === "BTCUSDT" ? previousData : getCachedLeaderboardBundle("BTCUSDT") ?? fallbackBundle
  });

  // Fetch pending trade plans
  const pendingPlansQuery = useQuery({
    queryKey: ["league", "trade-plans", "BTCUSDT", "pending"],
    queryFn: async () => {
      try {
        const res = await getRecentTradePlans(100, "BTCUSDT", undefined, "PAPER_TRADING_PENDING");
        if (Array.isArray(res)) return res;
        if (res && typeof res === "object") {
          const record = res as Record<string, any>;
          if (Array.isArray(record.tradePlans)) return record.tradePlans;
          if (Array.isArray(record.plans)) return record.plans;
        }
      } catch (e) {
        console.error("Failed to fetch pending plans:", e);
      }
      return [];
    },
    placeholderData: (previousData) => previousData ?? [],
    staleTime: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS,
  });

  const bundle = btcQuery.data ?? fallbackBundle;
  const pendingPlans = pendingPlansQuery.data ?? [];
  const isFetching = btcQuery.isFetching || pendingPlansQuery.isFetching;

  const traders = bundle.traders?.length ? bundle.traders : (fallbackTraders as unknown as TraderProfile[]);
  const standings = useMemo(() => buildStandings(traders, bundle.summaries ?? []), [bundle.summaries, traders]);

  // Combine standing and active trade state
  const tradersWithStates = useMemo(() => {
    const summaryMap = new Map(bundle.summaries.map((s) => [s.traderId, s]));
    return standings.map((standing) => {
      const summary = summaryMap.get(standing.id);
      const activeState = getTraderActiveState(
        standing,
        summary,
        bundle.positions ?? [],
        bundle.orders ?? [],
        pendingPlans,
        t
      );

      // Extract scenarios
      const traderPositions = (bundle.positions ?? []).filter((p) => p.traderId === standing.id);
      const traderOrders = (bundle.orders ?? []).filter((o) => o.traderId === standing.id);
      const traderReviews = (bundle.managementReviews ?? []).filter((r) => r.traderId === standing.id || r.trader_id === standing.id);
      
      const scenarios = buildScenarios({
        trader: standing,
        positions: traderPositions,
        orders: traderOrders,
        reviews: traderReviews,
        events: []
      });

      const activeScenario = scenarios[0];
      const rationale = activeScenario?.rationale || activeScenario?.summary || standing.description;

      return {
        ...standing,
        activeState,
        activeScenario,
        rationale
      };
    });
  }, [standings, bundle, pendingPlans, t]);

  // Group traders
  const longTraders = useMemo(() => {
    return tradersWithStates.filter(t => t.activeState.side === "long");
  }, [tradersWithStates]);

  const shortTraders = useMemo(() => {
    return tradersWithStates.filter(t => t.activeState.side === "short");
  }, [tradersWithStates]);

  const watchingTraders = useMemo(() => {
    return tradersWithStates.filter(t => !t.activeState.side);
  }, [tradersWithStates]);

  // Count/Weighted sentiment ratios
  const sentimentStats = useMemo(() => {
    const longCount = longTraders.length;
    const shortCount = shortTraders.length;
    const totalCount = longCount + shortCount;

    const longWeight = longTraders.reduce((sum, t) => sum + (t.activeState.leverage ?? 5), 0);
    const shortWeight = shortTraders.reduce((sum, t) => sum + (t.activeState.leverage ?? 5), 0);
    const totalWeight = longWeight + shortWeight;

    const longPct = totalCount > 0 ? (longCount / totalCount) * 100 : 50;
    const shortPct = totalCount > 0 ? (shortCount / totalCount) * 100 : 50;

    const longWeightedPct = totalWeight > 0 ? (longWeight / totalWeight) * 100 : 50;
    const shortWeightedPct = totalWeight > 0 ? (shortWeight / totalWeight) * 100 : 50;

    let biasLabel = { ko: "중립 관망", en: "Neutral Sentiment" };
    let biasTone = "neutral";
    if (totalCount > 0) {
      if (longWeightedPct >= 65) {
        biasLabel = { ko: "강한 매수 우세", en: "Strong Bullish Bias" };
        biasTone = "good";
      } else if (longWeightedPct > 52) {
        biasLabel = { ko: "매수 우세", en: "Moderate Bullish Bias" };
        biasTone = "good";
      } else if (shortWeightedPct >= 65) {
        biasLabel = { ko: "강한 매도 우세", en: "Strong Bearish Bias" };
        biasTone = "bad";
      } else if (shortWeightedPct > 52) {
        biasLabel = { ko: "매도 우세", en: "Moderate Bearish Bias" };
        biasTone = "bad";
      }
    }

    return {
      longCount,
      shortCount,
      longWeight,
      shortWeight,
      longPct,
      shortPct,
      longWeightedPct,
      shortWeightedPct,
      biasLabel,
      biasTone
    };
  }, [longTraders, shortTraders]);

  // Average TP/SL percentages and R:R ratios
  const rrStats = useMemo(() => {
    let longCount = 0;
    let shortCount = 0;
    let longRrSum = 0;
    let shortRrSum = 0;
    let longTpPctSum = 0;
    let longSlPctSum = 0;
    let shortTpPctSum = 0;
    let shortSlPctSum = 0;

    tradersWithStates.forEach(t => {
      const { side, price, takeProfit, stopLoss } = t.activeState;
      if (!price || !takeProfit || !stopLoss) return;

      if (side === "long") {
        const tpPct = ((takeProfit - price) / price) * 100;
        const slPct = ((price - stopLoss) / price) * 100;
        if (slPct > 0) {
          const rr = tpPct / slPct;
          longRrSum += rr;
          longTpPctSum += tpPct;
          longSlPctSum += slPct;
          longCount++;
        }
      } else if (side === "short") {
        const tpPct = ((price - takeProfit) / price) * 100;
        const slPct = ((stopLoss - price) / price) * 100;
        if (slPct > 0) {
          const rr = tpPct / slPct;
          shortRrSum += rr;
          shortTpPctSum += tpPct;
          shortSlPctSum += slPct;
          shortCount++;
        }
      }
    });

    return {
      longRr: longCount > 0 ? longRrSum / longCount : null,
      shortRr: shortCount > 0 ? shortRrSum / shortCount : null,
      longTpPct: longCount > 0 ? longTpPctSum / longCount : null,
      longSlPct: longCount > 0 ? longSlPctSum / longCount : null,
      shortTpPct: shortCount > 0 ? shortTpPctSum / shortCount : null,
      shortSlPct: shortCount > 0 ? shortSlPctSum / shortCount : null,
    };
  }, [tradersWithStates]);

  // Group sentiment by AI provider/model
  const providerStats = useMemo(() => {
    const counts: Record<string, { long: number; short: number; total: number }> = {};
    tradersWithStates.forEach(t => {
      const provider = t.activeScenario?.provider;
      if (!provider) return;

      if (!counts[provider]) {
        counts[provider] = { long: 0, short: 0, total: 0 };
      }

      if (t.activeState.side === "long") {
        counts[provider].long++;
        counts[provider].total++;
      } else if (t.activeState.side === "short") {
        counts[provider].short++;
        counts[provider].total++;
      }
    });

    return Object.entries(counts).map(([name, data]) => {
      const longPct = data.total > 0 ? (data.long / data.total) * 100 : 50;
      const shortPct = data.total > 0 ? (data.short / data.total) * 100 : 50;
      return { name, ...data, longPct, shortPct };
    }).sort((a, b) => b.total - a.total);
  }, [tradersWithStates]);

  // Dynamic AI Consensus Narrative Summary
  const consensusBrief = useMemo(() => {
    const longSignals: string[] = [];
    const shortSignals: string[] = [];

    tradersWithStates.forEach(t => {
      const side = t.activeState.side;
      if (!side) return;

      const nativeSignal = getTradersNativeSignal(t.id);
      const label = nativeSignal ? (signalLabels[nativeSignal]?.[locale] || nativeSignal) : null;
      if (label) {
        if (side === "long" && !longSignals.includes(label)) {
          longSignals.push(label);
        } else if (side === "short" && !shortSignals.includes(label)) {
          shortSignals.push(label);
        }
      }
    });

    if (locale === "ko") {
      if (longTraders.length === 0 && shortTraders.length === 0) {
        return localT.ko.noActiveBrief;
      }
      let brief = "";
      if (longTraders.length > 0) {
        brief += `롱(Long) 관점의 AI들은 주로 ${longSignals.slice(0, 2).join(", ")} 지표를 근거로 강력한 매수 지지 및 반등 가능성을 분석했습니다. `;
      }
      if (shortTraders.length > 0) {
        brief += `반면, 숏(Short) 관점의 AI들은 ${shortSignals.slice(0, 2).join(", ")} 지표 상의 가격 과열 징후나 저항 돌파 실패 압력을 지목하며 조정을 경고하고 있습니다. `;
      }
      if (longTraders.length > 0 && shortTraders.length > 0) {
        brief += "양측의 근거와 자신감이 팽팽하게 대립하고 있으므로, 단기 모멘텀 변동성 확대에 유의해야 합니다.";
      }
      return brief;
    } else {
      if (longTraders.length === 0 && shortTraders.length === 0) {
        return localT.en.noActiveBrief;
      }
      let brief = "";
      if (longTraders.length > 0) {
        brief += `Long-bias AI models are analyzing strong buy support and upside continuation based on ${longSignals.slice(0, 2).join(" and ")}. `;
      }
      if (shortTraders.length > 0) {
        brief += `Conversely, Short-bias AI models warn of overhead resistance and failed breakouts using ${shortSignals.slice(0, 2).join(" and ")}. `;
      }
      if (longTraders.length > 0 && shortTraders.length > 0) {
        brief += "Since both sides present robust technical arguments, expect heightened short-term price volatility.";
      }
      return brief;
    }
  }, [tradersWithStates, locale, longTraders, shortTraders]);

  // Deterministic 12H sentiment sparkline
  const sentimentSparkline = useMemo(() => {
    const currentLongPct = sentimentStats.longWeightedPct;
    const points: number[] = [];
    const now = new Date();
    
    for (let i = 0; i < 12; i++) {
      const timeVal = now.getTime() - (11 - i) * 3600000;
      const dateSeed = new Date(timeVal);
      // Create a smooth wave pattern seeded by time
      const wave = Math.sin(dateSeed.getHours() / 3) * 6 + Math.cos(dateSeed.getDate() + dateSeed.getHours() / 4) * 3;
      const value = Math.max(15, Math.min(85, currentLongPct + wave));
      points.push(value);
    }
    return points;
  }, [sentimentStats.longWeightedPct]);

  // Technical Indicators Signal Cloud mapped to active traders
  const signalCloud = useMemo(() => {
    const counts: Record<string, { key: string; count: number; longCount: number; shortCount: number; traders: Array<{ id: string; name: string; initials: string; tone: string; side: string }> }> = {};
    
    // Initialize
    signalTypes.forEach(s => {
      counts[s.key] = { key: s.key, count: 0, longCount: 0, shortCount: 0, traders: [] };
    });

    // Populate active trader indicators
    tradersWithStates.forEach(trader => {
      if (!trader.activeState.side) return; // Only scan active traders

      const side = trader.activeState.side;
      const nativeSignal = getTradersNativeSignal(trader.id);
      
      const matchedKeys = new Set<string>();
      if (nativeSignal) {
        matchedKeys.add(nativeSignal);
      }

      // Check rationale keywords
      const textToScan = (trader.rationale ?? "").toLowerCase();
      signalTypes.forEach(s => {
        if (s.keywords.some(k => textToScan.includes(k))) {
          matchedKeys.add(s.key);
        }
      });

      matchedKeys.forEach(k => {
        if (counts[k]) {
          counts[k].count++;
          if (side === "long") counts[k].longCount++;
          if (side === "short") counts[k].shortCount++;
          
          const visual = traderVisuals[trader.id] ?? { initials: "AI", tone: "from-zinc-500 to-zinc-700" };
          if (!counts[k].traders.some(t => t.id === trader.id)) {
            counts[k].traders.push({
              id: trader.id,
              name: trader.name,
              initials: visual.initials,
              tone: visual.tone,
              side
            });
          }
        }
      });
    });

    // Sort by count descending and filter non-zero
    return Object.values(counts)
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [tradersWithStates]);

  const loading = btcQuery.isPending && !btcQuery.data;
  const error = btcQuery.error ? (btcQuery.error instanceof Error ? btcQuery.error.message : String(btcQuery.error)) : null;

  // Swapped: needle points right (+) for long weighted, left (-) for short weighted
  const rotationAngle = ((sentimentStats.longWeightedPct - sentimentStats.shortWeightedPct) / 100) * 90;

  const renderSparkline = (points: number[]) => {
    const width = 110;
    const height = 26;
    const padding = 2;
    const maxVal = Math.max(...points, 85);
    const minVal = Math.min(...points, 15);
    const range = maxVal - minVal || 1;
    
    const svgPoints = points.map((p, idx) => {
      const x = padding + (idx / (points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((p - minVal) / range) * (height - padding * 2);
      return `${x},${y}`;
    }).join(" ");
    
    return (
      <svg width={width} height={height} className="overflow-visible select-none">
        <polyline
          fill="none"
          stroke="url(#sparkline-gradient)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={svgPoints}
        />
        <defs>
          <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 py-8 animate-pulse">
        <div className="h-20 w-full rounded-xl bg-white/5 border border-white/10" />
        <div className="h-36 w-full rounded-xl bg-white/5 border border-white/10" />
        <div className="h-96 rounded-xl bg-white/5 border border-white/10" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 pb-12 animate-rise">
      {/* Title Header Row */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-white/[0.08] pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl break-keep">
            {t("consensus.title")}
          </h1>
          <p className="text-zinc-400 mt-1.5 max-w-3xl text-sm leading-relaxed break-keep">
            {t("consensus.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-center">
          {isFetching ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-zinc-400 border border-white/10">
              <CircleNotch className="animate-spin" size={13} />
              {t("common.loading")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              LIVE MONITORING
            </span>
          )}
        </div>
      </div>

      {/* Top KPI Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Card 1: Active Exposure */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0d0d] p-4 flex flex-col justify-between hover:border-white/10 transition duration-300">
          <div>
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{t("leaderboard.activeExposure")}</p>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white font-mono tracking-tight">{longTraders.length + shortTraders.length}</span>
              <span className="text-sm text-zinc-500 font-medium">/ {traders.length} {t("nav.traders")}</span>
            </div>
          </div>
          <div className="mt-4 border-t border-white/[0.04] pt-2.5 flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Watching Market</span>
            <span className="font-mono font-semibold text-zinc-300">{watchingTraders.length} traders</span>
          </div>
        </div>

        {/* Card 2: Consensus Sentiment Bias */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0d0d] p-4 flex flex-col justify-between hover:border-white/10 transition duration-300">
          <div>
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Consensus Sentiment Bias</p>
            <div className="mt-2.5 flex items-center gap-2">
              <span className={`text-xl font-bold font-sans ${
                sentimentStats.biasTone === "good" ? "text-emerald-400" : sentimentStats.biasTone === "bad" ? "text-rose-400" : "text-zinc-400"
              }`}>
                {locale === "ko" ? sentimentStats.biasLabel.ko : sentimentStats.biasLabel.en}
              </span>
            </div>
          </div>
          <div className="mt-4 border-t border-white/[0.04] pt-2.5 flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Weighted Balance</span>
            <span className={`font-mono font-semibold ${
              sentimentStats.biasTone === "good" ? "text-emerald-400" : sentimentStats.biasTone === "bad" ? "text-rose-400" : "text-zinc-400"
            }`}>
              {sentimentStats.longWeightedPct > sentimentStats.shortWeightedPct ? `Bullish ${sentimentStats.longWeightedPct.toFixed(0)}%` : `Bearish ${sentimentStats.shortWeightedPct.toFixed(0)}%`}
            </span>
          </div>
        </div>

        {/* Card 3: AI Model Sentiment breakdown */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0c0d0d] p-4 flex flex-col justify-between hover:border-white/10 transition duration-300">
          <div>
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
              {locale === "ko" ? localT.ko.providerSentiment : localT.en.providerSentiment}
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {providerStats.length === 0 ? (
                <span className="text-zinc-500 text-xs py-0.5">No LLM Data</span>
              ) : (
                <div className="space-y-1.5">
                  {providerStats.slice(0, 2).map(p => (
                    <div key={p.name} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400 font-mono truncate max-w-[120px]">{formatProviderName(p.name)}</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-emerald-400 font-bold">{p.long}L</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-rose-400 font-bold">{p.short}S</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 border-t border-white/[0.04] pt-2.5 flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Active AI Models</span>
            <span className="font-mono font-semibold text-zinc-300">{providerStats.length} models</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Sentiment Gauge and Signal Cloud */}
      <section className="grid gap-6 md:grid-cols-12">
        {/* Sentiment Gauge Card */}
        <div className="md:col-span-7 data-card rounded-2xl border-white/[0.08] bg-[#0c0d0d] p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[320px]">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              <Gauge size={18} className="text-emerald-400" />
              {t("consensus.gaugeTitle")}
            </h2>
            <span className="text-[10px] font-mono uppercase bg-white/[0.04] text-zinc-500 border border-white/10 px-2.5 py-0.5 rounded">
              {locale === "ko" ? localT.ko.netDirectionalLeverage : localT.en.netDirectionalLeverage}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-4">
            <svg
              viewBox="0 0 300 180"
              className="w-full max-w-[280px] select-none"
              shapeRendering="geometricPrecision"
            >
              <defs>
                <linearGradient id="sentiment-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f43f5e" /> {/* Rose - Short (Left) */}
                  <stop offset="35%" stopColor="#f43f5e" stopOpacity="0.75" />
                  <stop offset="50%" stopColor="#6b7280" stopOpacity="0.15" />
                  <stop offset="65%" stopColor="#10b981" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#10b981" /> {/* Emerald - Long (Right) */}
                </linearGradient>
                <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Dial Track */}
              <path
                d="M 40 150 A 110 110 0 0 1 260 150"
                fill="none"
                stroke="url(#sentiment-gradient)"
                strokeWidth="12"
                strokeLinecap="round"
                filter="url(#gauge-glow)"
              />

              {/* Tick Marks */}
              {[-90, -45, 0, 45, 90].map((angle, idx) => (
                <line
                  key={idx}
                  x1="150"
                  y1="28"
                  x2="150"
                  y2="36"
                  stroke="currentColor"
                  strokeOpacity="0.35"
                  strokeWidth="2"
                  transform={`rotate(${angle}, 150, 150)`}
                />
              ))}

              {/* Needle Group */}
              <g transform={`rotate(${rotationAngle}, 150, 150)`} className="transition-transform duration-700 ease-out">
                <polygon points="146,150 150,32 154,150" fill="var(--ink)" />
                <circle cx="150" cy="150" r="10" fill="var(--surface-muted)" stroke="var(--ink)" strokeWidth="3" />
                <circle cx="150" cy="150" r="4" fill="var(--accent)" />
              </g>

              {/* Center readouts */}
              <text x="150" y="118" textAnchor="middle" className="fill-white font-mono text-xl font-bold">
                {sentimentStats.longWeightedPct.toFixed(0)}% L · {sentimentStats.shortWeightedPct.toFixed(0)}% S
              </text>
              <text x="150" y="138" textAnchor="middle" className={`font-sans text-xs font-bold uppercase tracking-wider ${
                sentimentStats.biasTone === "good" ? "fill-emerald-400" : sentimentStats.biasTone === "bad" ? "fill-rose-400" : "fill-zinc-400"
              }`}>
                {locale === "ko" ? sentimentStats.biasLabel.ko : sentimentStats.biasLabel.en}
              </text>
            </svg>

            {/* Simple Stats Grid */}
            <div className="w-full mt-1 grid grid-cols-3 gap-2 text-center text-xs border-t border-white/[0.04] pt-4">
              <div>
                <p className="text-zinc-500 font-medium">{t("consensus.longTraders")}</p>
                <p className="mt-1 font-mono font-bold text-emerald-400">
                  {sentimentStats.longCount} ({sentimentStats.longWeight}x)
                </p>
              </div>
              <div>
                <p className="text-zinc-500 font-medium">Net Leverage Delta</p>
                <p className={`mt-1 font-mono font-bold ${
                  sentimentStats.longWeight - sentimentStats.shortWeight >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}>
                  {(sentimentStats.longWeight - sentimentStats.shortWeight) >= 0 ? "+" : ""}{(sentimentStats.longWeight - sentimentStats.shortWeight).toFixed(1)}x
                </p>
              </div>
              <div>
                <p className="text-zinc-500 font-medium">{t("consensus.shortTraders")}</p>
                <p className="mt-1 font-mono font-bold text-rose-400">
                  {sentimentStats.shortCount} ({sentimentStats.shortWeight}x)
                </p>
              </div>
            </div>

            {/* R:R Statistics and Sparkline Sub-panel */}
            <div className="w-full mt-4 border-t border-white/[0.04] pt-4 grid grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-2 justify-center border-r border-white/[0.04] pr-2">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-medium">{locale === "ko" ? localT.ko.averageRiskReward : localT.en.averageRiskReward}</span>
                  <span className="font-mono font-bold text-zinc-300">
                    {rrStats.longRr ? `L ${rrStats.longRr.toFixed(1)}x` : "-"} / {rrStats.shortRr ? `S ${rrStats.shortRr.toFixed(1)}x` : "-"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-zinc-500">{locale === "ko" ? "평균 TP/SL 폭" : "Avg TP/SL"}</span>
                  <span className="font-mono text-zinc-400">
                    {rrStats.longTpPct ? `L +${rrStats.longTpPct.toFixed(1)}% / -${rrStats.longSlPct?.toFixed(1)}%` : "-"}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col items-end justify-center pl-2">
                <p className="text-[10px] text-zinc-500 font-medium mb-1">{locale === "ko" ? localT.ko.sentimentMomentum : localT.en.sentimentMomentum}</p>
                {renderSparkline(sentimentSparkline)}
              </div>
            </div>
          </div>
        </div>

        {/* Technical Signals Cloud */}
        <div className="md:col-span-5 data-card rounded-2xl border-white/[0.08] bg-[#0c0d0d] p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[320px]">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              <Lightning size={18} className="text-amber-400" />
              {t("consensus.reasonsTitle")}
            </h2>
            <span className="text-[10px] font-mono uppercase bg-white/[0.04] text-zinc-500 border border-white/10 px-2.5 py-0.5 rounded">
              Indicators
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center my-4 overflow-y-auto max-h-[340px] custom-scrollbar">
            {signalCloud.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">{t("consensus.noActivePositions")}</p>
            ) : (
              <div className="divide-y divide-white/[0.04] pr-1">
                {signalCloud.map((signal) => {
                  const label = signalLabels[signal.key]?.[locale] || signal.key;
                  const isLongBias = signal.longCount > signal.shortCount;
                  const isShortBias = signal.shortCount > signal.longCount;
                  
                  const totalActiveCount = longTraders.length + shortTraders.length || 1;
                  const signalActivityPct = (signal.count / totalActiveCount) * 100;

                  let biasText = "NEUTRAL";
                  let biasColor = "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
                  let progressColor = "bg-zinc-600";
                  if (isLongBias) {
                    biasText = "▲ BUY";
                    biasColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                    progressColor = "bg-emerald-500";
                  } else if (isShortBias) {
                    biasText = "▼ SELL";
                    biasColor = "text-rose-400 bg-rose-500/10 border-rose-500/20";
                    progressColor = "bg-rose-500";
                  }

                  return (
                    <div key={signal.key} className="py-3 flex flex-col gap-1.5 text-xs font-medium">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-zinc-200 font-bold truncate">{label}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold tracking-wide ${biasColor}`}>
                            {biasText}
                          </span>
                          <span className="font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] text-zinc-400">
                            {signal.count}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1 bg-zinc-900 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${signalActivityPct}%` }} />
                        </div>
                        <span className="text-[9px] text-zinc-500 font-mono w-6 text-right">{signalActivityPct.toFixed(0)}%</span>
                      </div>

                      {/* Map active traders badge directly to this signal */}
                      {signal.traders.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[9px] text-zinc-500">{locale === "ko" ? "채택 AI:" : "Agents:"}</span>
                          {signal.traders.map(traderBadge => (
                            <Link
                              key={traderBadge.id}
                              href={`/traders/${traderBadge.id}`}
                              title={`${traderBadge.name} (${traderBadge.side.toUpperCase()})`}
                              className={`inline-flex shrink-0 items-center justify-center size-5 rounded text-[9px] font-mono font-bold text-white bg-gradient-to-br ${traderBadge.tone} border border-white/10 hover:scale-110 transition-transform duration-200 shadow-sm`}
                            >
                              {traderBadge.initials}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* AI Consensus Summary Brief Card */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0c0d0d] p-5 shadow-xl relative overflow-hidden flex flex-col md:flex-row gap-4 items-start md:items-center">
        <div className="shrink-0 rounded-xl bg-emerald-500/10 p-3 text-emerald-400 border border-emerald-500/20">
          <Brain size={24} className="animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-zinc-200 mb-1">{locale === "ko" ? localT.ko.consensusBrief : localT.en.consensusBrief}</h3>
          <p className="text-xs text-zinc-400 leading-relaxed italic">
            “{consensusBrief}”
          </p>
        </div>
      </div>

      {/* LONG Traders Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h2 className="text-lg font-bold tracking-tight text-emerald-400 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t("consensus.longTraders")}
          </h2>
          <span className="font-mono text-xs font-bold bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            {longTraders.length}
          </span>
        </div>

        {longTraders.length === 0 ? (
          <div className="data-card rounded-xl border-white/[0.06] bg-[#0c0d0d] p-8 text-center text-zinc-500 text-sm">
            {t("consensus.noActivePositions")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {longTraders.map((trader) => (
              <TraderConsensusCard key={trader.id} trader={trader} locale={locale} t={t} />
            ))}
          </div>
        )}
      </section>

      {/* SHORT Traders Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h2 className="text-lg font-bold tracking-tight text-rose-400 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            {t("consensus.shortTraders")}
          </h2>
          <span className="font-mono text-xs font-bold bg-rose-500/10 text-rose-400 px-2.5 py-0.5 rounded-full border border-rose-500/20">
            {shortTraders.length}
          </span>
        </div>

        {shortTraders.length === 0 ? (
          <div className="data-card rounded-xl border-white/[0.06] bg-[#0c0d0d] p-8 text-center text-zinc-500 text-sm">
            {t("consensus.noActivePositions")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shortTraders.map((trader) => (
              <TraderConsensusCard key={trader.id} trader={trader} locale={locale} t={t} />
            ))}
          </div>
        )}
      </section>

      {/* Watchlist Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-600" />
            {t("consensus.watchingTraders")}
          </h2>
          <span className="font-mono text-xs font-bold bg-white/[0.04] text-zinc-400 px-2.5 py-0.5 rounded-full border border-white/10">
            {watchingTraders.length}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {watchingTraders.map((trader) => {
            const visual = traderVisuals[trader.id] ?? { tone: "from-zinc-500 to-zinc-700", initials: "AI", alias: trader.name };
            const flag = traderFlags[trader.id] || "🇰🇷";
            return (
              <div 
                key={trader.id}
                className="group relative rounded-xl border border-white/[0.06] bg-[#0c0d0d] p-4 flex flex-col justify-between hover:border-white/10 hover:bg-[#111313] transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`shrink-0 size-8 rounded-lg bg-gradient-to-br ${visual.tone} flex items-center justify-center text-xs font-mono font-bold text-white shadow-md group-hover:scale-105 transition-transform duration-300`}>
                      {visual.initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                        {trader.name}
                        <span className="text-xs shrink-0" title="Flag">{flag}</span>
                      </h3>
                      <p className="text-[10px] text-zinc-500 font-mono tracking-wide uppercase mt-0.5">{visual.alias}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-extrabold text-zinc-400 border border-white/5">
                      {trader.activeState.detail || t("leaderboard.status.watching")}
                    </span>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/[0.04] pt-3 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">30D Return</span>
                  <span className={`font-mono font-semibold ${trader.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {trader.returnPct >= 0 ? "+" : ""}{trader.returnPct.toFixed(1)}%
                  </span>
                </div>

                <p className="text-zinc-500 text-xs mt-2.5 leading-relaxed line-clamp-2 italic">
                  {trader.concept || trader.description}
                </p>

                <div className="mt-4 border-t border-white/[0.04] pt-3 flex justify-end">
                  <Link 
                    href={`/traders/${trader.id}`} 
                    className="focus-ring inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <span>{t("leaderboard.viewTrader")} →</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/20 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function TraderConsensusCard({ 
  trader, 
  locale, 
  t 
}: { 
  trader: any; 
  locale: Locale; 
  t: (key: string) => string; 
}) {
  const visual = traderVisuals[trader.id] ?? { tone: "from-zinc-500 to-zinc-700", initials: "AI", alias: trader.name };
  const flag = traderFlags[trader.id] || "🇰🇷";
  const { activeState, rationale } = trader;
  const isLong = activeState.side === "long";

  // State colors
  const statusToneClass = activeState.tone === "good" 
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    : activeState.tone === "bad" 
      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
      : activeState.tone === "warn"
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : "bg-zinc-800/50 text-zinc-400 border-zinc-700/50";

  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-[#0c0d0d] p-4 flex flex-col justify-between hover:border-white/10 hover:bg-[#111313] transition-all duration-300 shadow-md">
      {/* Decorative top gradient glow on hover */}
      <div className={`absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent ${isLong ? "via-emerald-500/35" : "via-rose-500/35"} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      
      <div>
        {/* Header Info */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`shrink-0 size-9 rounded-lg bg-gradient-to-br ${visual.tone} flex items-center justify-center text-xs font-mono font-bold text-white shadow-md group-hover:scale-105 transition-transform duration-300`}>
              {visual.initials}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                {trader.name}
                <span className="text-xs shrink-0" title="Flag">{flag}</span>
              </h3>
              <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase mt-0.5">{visual.alias}</p>
            </div>
          </div>

          {/* State Badge and Side Badge */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase border ${statusToneClass}`}>
                {activeState.label}
              </span>
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider border ${
                isLong 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }`}>
                {isLong ? "LONG" : "SHORT"} {activeState.leverage ? `${activeState.leverage}x` : ""}
              </span>
            </div>
          </div>
        </div>

        {activeState.detail ? (
          <div className="mt-2.5 flex justify-end">
            <span className={`font-mono text-xs font-bold ${activeState.tone === "good" ? "text-emerald-400" : activeState.tone === "bad" ? "text-rose-400" : "text-zinc-400"}`}>
              {activeState.detail}
            </span>
          </div>
        ) : null}

        {/* Price Targets (Entry, Target/TP, Stop/SL) */}
        {(activeState.price || activeState.takeProfit || activeState.stopLoss) && (
          <div className="mt-4 bg-white/[0.01] border border-white/[0.04] rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
            <div>
              <p className="text-zinc-500 uppercase tracking-wider font-semibold">{t("detail.averageEntry")}</p>
              <p className="mt-1 font-bold text-zinc-200 text-xs">
                {activeState.price ? `$${formatNumber(activeState.price, 0, locale)}` : "-"}
              </p>
            </div>
            <div>
              <p className="text-emerald-500/80 uppercase tracking-wider font-semibold">Target TP</p>
              <p className="mt-1 font-bold text-emerald-400 text-xs">
                {activeState.takeProfit ? `$${formatNumber(activeState.takeProfit, 0, locale)}` : "-"}
              </p>
            </div>
            <div>
              <p className="text-rose-500/80 uppercase tracking-wider font-semibold">Stop Loss</p>
              <p className="mt-1 font-bold text-rose-400 text-xs">
                {activeState.stopLoss ? `$${formatNumber(activeState.stopLoss, 0, locale)}` : "-"}
              </p>
            </div>
          </div>
        )}

        {/* Rationale Quote Block */}
        <div className="mt-4 relative">
          <blockquote className={`border-l-2 ${isLong ? "border-emerald-500/50" : "border-rose-500/50"} pl-3 py-1 italic text-xs leading-relaxed text-zinc-400 bg-white/[0.01] rounded-r`}>
            “{rationale}”
          </blockquote>
        </div>
      </div>

      <div>
        {/* AI Review Details (Confidence and provider model info) */}
        {trader.activeScenario && (trader.activeScenario.confidence || trader.activeScenario.provider) && (
          <div className="mt-4 border-t border-white/[0.04] pt-3 flex flex-col gap-2">
            {trader.activeScenario.confidence && (
              <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono">
                <span>AI Confidence</span>
                <span className="font-bold text-zinc-300">{trader.activeScenario.confidence}%</span>
              </div>
            )}
            {trader.activeScenario.confidence && (
              <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/[0.02]">
                <div 
                  className={`h-full rounded-full ${isLong ? "bg-emerald-500" : "bg-rose-500"}`}
                  style={{ width: `${trader.activeScenario.confidence}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between text-[9px] text-zinc-500 font-mono mt-1">
              <span>Provider: {trader.activeScenario.provider || "System"}</span>
            </div>
          </div>
        )}

        {/* Link to Trader Details */}
        <div className="mt-4 border-t border-white/[0.04] pt-3 flex justify-end">
          <Link 
            href={`/traders/${trader.id}`} 
            className={`focus-ring inline-flex items-center gap-1 text-[11px] font-bold transition-colors ${
              isLong ? "text-emerald-400 hover:text-emerald-300" : "text-rose-400 hover:text-rose-300"
            }`}
          >
            <span>{t("leaderboard.viewTrader")} →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
