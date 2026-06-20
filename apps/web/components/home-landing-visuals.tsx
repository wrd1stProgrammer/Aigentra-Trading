"use client";

import Link from "next/link";
import { ChartLineUp, Check, Clock, Pulse, ShieldCheck, Star, TelegramLogo, TrendUp, InstagramLogo } from "@phosphor-icons/react";
import type { LandingCopy } from "@/lib/marketing-copy";

const traderRows = [
  { name: "Channel Cartographer", state: "SHORT · 5x", pnl: "+1.33%" },
  { name: "Pullback Architect", state: "Entry pending", pnl: "+0.40%" },
  { name: "Funding Contrarian", state: "Watching", pnl: "0.00%" }
] as const;

const signalRows = [
  { label: "AI review", value: "risk reduced", tone: "text-amber-300" },
  { label: "Entry", value: "64,232.3", tone: "text-sky-300" },
  { label: "Target", value: "62,524.3", tone: "text-emerald-300" }
] as const;

export function VideoFrame({ title, subtitle, compact = false }: { readonly title: string; readonly subtitle: string; readonly compact?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/15 bg-[#111413] p-3 shadow-[0_22px_90px_rgba(0,0,0,0.48)] ${
        compact ? "min-h-[320px] sm:min-h-[360px]" : "min-h-[360px] sm:min-h-[430px]"
      }`}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(96,165,250,0.14),transparent_32%),linear-gradient(315deg,rgba(249,115,22,0.14),transparent_30%),linear-gradient(90deg,rgba(16,185,129,0.08),transparent)]" />
      <div className="relative h-full rounded-xl border border-white/12 bg-[#090b0a] p-5 text-white md:p-7">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <TrendUp size={18} weight="bold" />
            </span>
            <div>
              <p className="font-mono text-xs text-zinc-500">Dashboard preview</p>
              <h3 className="text-base font-semibold">{title}</h3>
            </div>
          </div>
          <span className="hidden rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-xs text-emerald-300 sm:inline-flex">
            LIVE SIM
          </span>
        </div>
        <div className="grid gap-4 pt-5 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-5 w-full rounded-lg bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_0_28px_rgba(16,185,129,0.45)]">
              + New analysis
            </div>
            <p className="mb-3 font-mono text-xs text-zinc-500">History</p>
            {traderRows.map((row, index) => (
              <div key={row.name} className="flex items-center gap-3 border-b border-white/10 py-3 last:border-b-0">
                <span className="grid size-7 place-items-center rounded-full bg-white/10 font-mono text-xs">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.name}</p>
                  <p className="truncate font-mono text-xs text-zinc-500">{row.state}</p>
                </div>
                <span className="font-mono text-xs text-emerald-300">{row.pnl}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Pullback Architect</p>
                  <p className="font-mono text-xs text-zinc-500">BTCUSDT · simulated short</p>
                </div>
                <Star size={18} className="text-amber-300" weight="fill" />
              </div>
              <MiniChart />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {signalRows.map((row) => (
                <div key={row.label} className="rounded-lg border border-white/10 bg-black/35 p-4">
                  <p className="font-mono text-[11px] text-zinc-500">{row.label}</p>
                  <p className={`mt-2 font-mono text-sm font-semibold ${row.tone}`}>{row.value}</p>
                </div>
              ))}
            </div>
            <p className="max-w-[62ch] text-sm leading-6 text-zinc-500">{subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PipelinePreview() {
  return (
    <div className="w-full text-left font-sans">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold font-mono">Decision Pipeline</span>
        <span className="text-[9px] text-zinc-500 font-mono">BTCUSDT · Active</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] items-center">
        {/* Scanner Setup */}
        <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-2 rounded-full bg-emerald-500" />
            <p className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider font-mono">1. Scanner Setup</p>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-zinc-500">Strategy</span>
              <span className="text-zinc-200 font-semibold">Pullback EMA 200</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.03] pb-1.5">
              <span className="text-zinc-500">Trigger Limit</span>
              <span className="text-emerald-400 font-bold font-mono">67,200 USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Timeframe</span>
              <span className="text-zinc-200 font-semibold font-mono">15m / 1h / 4h</span>
            </div>
          </div>
        </div>

        {/* Vector Line */}
        <div className="flex flex-row sm:flex-col items-center justify-center py-2 sm:py-0">
          <div className="h-[1px] w-6 sm:h-10 sm:w-[1px] bg-gradient-to-r sm:bg-gradient-to-b from-emerald-500/30 to-amber-500/30" />
          <span className="text-xs py-1.5 bg-white/[0.03] border border-white/10 rounded-full px-2 font-mono">AI</span>
          <div className="h-[1px] w-6 sm:h-10 sm:w-[1px] bg-gradient-to-r sm:bg-gradient-to-b from-amber-500/30 to-amber-500/60" />
        </div>

        {/* AI Auditor */}
        <div className="rounded-xl border border-amber-500/15 bg-gradient-to-b from-[#1c1811] to-[#0f0d09] p-4 shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400" />
              <p className="text-[10px] text-amber-300 uppercase font-bold tracking-wider font-mono">2. AI Risk Audit</p>
            </div>
            <span className="text-[8px] bg-amber-400/10 border border-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-semibold">Gemini-3.5</span>
          </div>
          <div className="space-y-1.5">
            <div className="text-[9px] text-amber-400/80 font-semibold font-mono">Decision: ADJUSTED RISK</div>
            <p className="text-[11px] leading-relaxed text-zinc-300 break-keep font-sans">
              최근 하락 채널 가속화 감지. 레버리지를 10x에서 5x로 하향하고 모의 진입을 승인합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PositionManagementPreview() {
  return (
    <div className="w-full text-left font-sans">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold font-mono">Position Risk Monitor</span>
        <span className="text-[9px] text-zinc-500 font-mono">BTCUSDT · Simulated</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr] items-center">
        {/* Position Ticket */}
        <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4 shadow-lg space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider font-mono">ROI PnL</span>
            <span className="text-xl font-bold text-emerald-400 font-mono tracking-tight">+32.40%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-500 text-[10px] block font-mono">Entry Price</span>
              <span className="text-zinc-200 font-semibold font-mono">67,520 USDT</span>
            </div>
            <div className="text-right">
              <span className="text-zinc-500 text-[10px] block font-mono">Mark Price</span>
              <span className="text-emerald-400 font-bold font-mono">71,840 USDT</span>
            </div>
          </div>
          {/* Slider bar */}
          <div className="pt-1">
            <div className="relative h-1.5 w-full rounded-full bg-zinc-800">
              <div className="absolute left-[15%] right-[25%] top-0 h-full bg-gradient-to-r from-emerald-500/30 to-emerald-400" />
              <div className="absolute left-[75%] top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-emerald-400 border border-black shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
            <div className="flex justify-between text-[8px] text-zinc-500 mt-1 font-mono">
              <span>SL: 66,000</span>
              <span>TP: 73,000</span>
            </div>
          </div>
        </div>

        {/* AI Action Alert */}
        <div className="rounded-xl border border-rose-500/15 bg-gradient-to-b from-[#1a1111] to-[#0f0808] p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2 bg-rose-500 rounded-full" />
              <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider font-mono">AI Risk Warning</span>
            </div>
            <span className="text-[8px] text-zinc-500 font-mono font-semibold">[18:24]</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-300 break-keep font-sans">
            단기 매도 거래량 급증 포착. 스톱로스를 본절가(67,520)로 상향 조정하고 자산의 30%를 부분 익절 관리합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ConsensusPreview() {
  return (
    <div className="w-full text-left font-sans">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold font-mono">Consensus Sentiment</span>
        <span className="text-[9px] text-zinc-500 font-mono">10 AI Strategists</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr] items-center">
        {/* Consensus Gauge */}
        <div className="rounded-xl border border-white/[0.05] bg-black/40 p-4 shadow-lg space-y-3.5">
          <div>
            <div className="flex justify-between text-[10px] text-zinc-400 mb-1.5 font-mono">
              <span className="text-emerald-400 font-bold">LONG 70%</span>
              <span className="text-rose-400 font-bold">SHORT 30%</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded bg-zinc-850 p-0.5">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: "70%" }} />
              <div className="h-full bg-gradient-to-r from-rose-500 to-rose-400" style={{ width: "30%" }} />
            </div>
          </div>
          <div className="space-y-1 text-xs text-zinc-400">
            <div className="flex justify-between border-b border-white/[0.03] pb-1">
              <span className="text-zinc-500">Avg Entry</span>
              <span className="text-zinc-200 font-semibold font-mono">67,820 USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Target Range</span>
              <span className="text-emerald-400 font-bold font-mono">72,500 - 73,100</span>
            </div>
          </div>
        </div>

        {/* Strategy list */}
        <div className="space-y-2">
          <div className="flex justify-between items-center rounded-xl border border-white/[0.04] bg-white/[0.01] px-3.5 py-2.5 text-xs text-zinc-300 shadow-md">
            <span className="text-zinc-400 font-semibold">Pullback Architect</span>
            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[9px] font-mono">LONG (+24.8%)</span>
          </div>
          <div className="flex justify-between items-center rounded-xl border border-white/[0.04] bg-white/[0.01] px-3.5 py-2.5 text-xs text-zinc-300 shadow-md">
            <span className="text-zinc-400 font-semibold">Channel Cartographer</span>
            <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded text-[9px] font-mono">SHORT (+1.3%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TradePlanPreview() {
  return (
    <div className="w-full text-left font-sans">
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold font-mono">Scenario Plan</span>
        <span className="text-[9px] text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded font-mono font-semibold">Pending Trigger</span>
      </div>

      <div className="grid gap-4 mt-2 sm:grid-cols-[1.3fr_0.7fr]">
        {/* Chart */}
        <div className="relative h-32 rounded-xl bg-black/40 border border-white/[0.05] overflow-hidden p-1.5 shadow-lg">
          <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-[0.02] pointer-events-none">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="border-r border-b border-white" />
            ))}
          </div>

          <svg className="w-full h-full" viewBox="0 0 320 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Take Profit target line */}
            <line x1="10" y1="20" x2="310" y2="20" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <text x="15" y="15" fill="#34d399" fontSize="8" fontFamily="monospace">TP: 72,000 (+7.1%)</text>

            {/* Current Price Line */}
            <line x1="10" y1="48" x2="310" y2="48" stroke="#71717a" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.4" />
            <text x="15" y="43" fill="#a1a1aa" fontSize="8" fontFamily="monospace">Current: 67,950</text>

            {/* Entry Limit line */}
            <line x1="10" y1="72" x2="310" y2="72" stroke="#fbbf24" strokeWidth="1.2" strokeDasharray="4 2" opacity="0.9" />
            <text x="15" y="67" fill="#fbbf24" fontSize="8" fontFamily="monospace" fontWeight="bold">LIMIT ENTRY: 67,200</text>

            {/* Stop Loss target line */}
            <line x1="10" y1="100" x2="310" y2="100" stroke="#f43f5e" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <text x="15" y="95" fill="#f87171" fontSize="8" fontFamily="monospace">SL: 65,800 (-2.1%)</text>

            {/* EMA 200 curve */}
            <path d="M 10 42 Q 120 62 230 72 T 310 78" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
            <text x="235" y="65" fill="#60a5fa" fontSize="8" fontFamily="monospace">EMA 200</text>

            {/* Price trend line path */}
            <path d="M 10 38 L 45 32 L 80 44 L 115 34 L 150 52 L 185 42 L 220 58 L 255 52 L 285 70 L 295 65" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
            
            {/* Projected rebound line */}
            <path d="M 295 65 L 305 72 L 312 48 L 320 28" stroke="#fbbf24" strokeWidth="1.2" strokeDasharray="3 2" strokeLinecap="round" opacity="0.8" />

            {/* Trigger dot */}
            <circle cx="305" cy="72" r="3.5" fill="#fbbf24" />
          </svg>
        </div>

        {/* Setup Check details */}
        <div className="flex flex-col justify-between space-y-2">
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 text-left space-y-2 text-xs text-zinc-300 shadow-md">
            <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider font-mono">[ Technical Check ]</span>
            <div className="space-y-1 font-semibold">
              <div className="flex items-center gap-1.5"><span className="text-emerald-400">✔</span> EMA 200 Rebound</div>
              <div className="flex items-center gap-1.5"><span className="text-emerald-400">✔</span> RSI Oversold (15m)</div>
              <div className="flex items-center gap-1.5"><span className="text-emerald-400">✔</span> Consensus 70%</div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg text-amber-300 font-bold">
              <span>ENTRY LIMIT</span>
              <span>67,200</span>
            </div>
            <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-emerald-300 font-bold">
              <span>TARGET PNL</span>
              <span>+35.7% (5x)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PricingCard({ 
  plan, 
  featured,
  billingCycle
}: { 
  readonly plan: LandingCopy["pricingPlans"][number]; 
  readonly featured: boolean;
  readonly billingCycle: "monthly" | "annual";
}) {
  const isFree = plan.price.toLowerCase() === "free";
  const isKorean = plan.cadence.includes("월");
  let displayPrice = plan.price;
  let displayCadence = plan.cadence;
  let subPriceDetail = "";

  if (!isFree) {
    if (billingCycle === "annual") {
      if (plan.name === "Tactician") {
        displayPrice = "$24.65";
        subPriceDetail = isKorean
          ? "연간 총 $295.80 (15% 할인)"
          : "Billed annually at $295.80/yr (15% OFF)";
      } else if (plan.name === "Elite Operator") {
        displayPrice = "$41.65";
        subPriceDetail = isKorean
          ? "연간 총 $499.80 (15% 할인)"
          : "Billed annually at $499.80/yr (15% OFF)";
      }
      displayCadence = isKorean ? "/ 월" : "/ mo";
    } else {
      displayPrice = plan.name === "Tactician" ? "$29" : "$49";
      displayCadence = isKorean ? "/ 월" : "/ mo";
    }
  }

  const badgeText = plan.name === "Observer"
    ? "FREE"
    : plan.name === "Tactician"
      ? "RECOMMENDED"
      : "POPULAR";

  return (
    <article className={`relative rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 sm:p-6 md:p-8 flex flex-col justify-between h-full ${
      featured
        ? "border-emerald-500/45 bg-gradient-to-b from-[#0a2016] via-[#05160f] to-[#020605] shadow-[0_12px_40px_rgba(16,185,129,0.15),inset_0_1px_1px_rgba(255,255,255,0.06)] hover:border-emerald-500/60 lg:scale-105 z-10"
        : "border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:border-emerald-500/20"
    }`}>
      {featured && (
        <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 rounded-t-2xl shadow-[0_1px_10px_rgba(16,185,129,0.5)] pointer-events-none" />
      )}
      <div>
        <div className="min-h-[130px] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-2xl font-bold text-white tracking-tight">{plan.name}</h3>
            <span className={`whitespace-nowrap font-mono text-[9px] px-2.5 py-0.5 rounded-full ${
              featured
                ? "text-emerald-300 bg-emerald-500/15 border border-emerald-500/30"
                : "text-zinc-400 bg-white/5 border border-white/10"
            }`}>
              {badgeText}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400 break-keep flex-1">{plan.description}</p>
        </div>

        <div className="mt-8 min-h-[72px] flex flex-col justify-end">
          <div className="flex flex-wrap items-end gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-white font-mono sm:text-4xl">{displayPrice}</span>
            <span className="pb-1 text-zinc-500 text-xs font-semibold">{displayCadence}</span>
            {billingCycle === "annual" && !isFree && (
              <span className="ml-2 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                {isKorean ? "15% 할인" : "15% OFF"}
              </span>
            )}
          </div>
          {subPriceDetail && (
            <p className="mt-1 text-[11px] text-zinc-500 font-semibold">{subPriceDetail}</p>
          )}
        </div>

        <Link 
          href={isFree ? "/leaderboard" : "/account"}
          className={`mt-8 inline-flex w-full justify-center rounded-full px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.99] duration-300 ${
            featured 
              ? "bg-emerald-500 shadow-neon-emerald hover:bg-emerald-400" 
              : "bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-white/20"
          }`}
        >
          {plan.cta}
        </Link>
      </div>

      <div className="mt-8 space-y-4 text-sm text-zinc-300">
        {plan.features.map((feature) => (
          <p key={feature} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 mt-0.5">
              <Check size={12} weight="bold" />
            </span>
            <span className="break-keep">{feature}</span>
          </p>
        ))}
      </div>
    </article>
  );
}

export function ProductProofCard({ copy }: { readonly copy: LandingCopy }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-start gap-4">
        <span className="grid size-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
          <ShieldCheck size={26} weight="bold" />
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">{copy.proofBadge}</p>
          <h2 className="mt-2 text-xl font-bold text-white tracking-tight break-keep">{copy.proofTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400 break-keep">{copy.proofSubtitle}</p>
        </div>
      </div>
    </div>
  );
}

export function AlertPreview() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#111413] to-[#080a09] p-5 shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.3)]">
          <TelegramLogo size={20} weight="fill" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Telegram action alert</p>
          <p className="font-mono text-xs text-zinc-500">Pullback Architect · BTCUSDT</p>
        </div>
      </div>
      <div className="rounded-xl bg-[#080a09] border border-white/[0.04] p-4 text-sm leading-6 text-zinc-300">
        <p className="font-semibold text-emerald-300">SHORT entry filled</p>
        <p className="mt-2 text-zinc-400">AI review reduced risk after channel rejection. Stop moved to 64,940.</p>
      </div>
      <p className="mt-4 flex items-center gap-2 font-mono text-xs text-zinc-500">
        <Clock size={14} /> delivered 8 seconds ago
      </p>
    </div>
  );
}


export function LandingFooter({ copy }: { readonly copy: LandingCopy }) {
  return (
    <>
      <div className="mx-auto grid max-w-[1500px] gap-10 border-b border-zinc-200 pb-12 sm:grid-cols-2 md:grid-cols-6 text-left">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-emerald-400/35 bg-emerald-400/10 font-mono text-xs text-emerald-300">AT</span>
            <span className="text-xl font-bold tracking-tight text-zinc-900">Aigentra Trading</span>
          </div>
          <p className="mt-5 max-w-[32ch] text-sm leading-6 text-zinc-500">{copy.footerTagline}</p>
        </div>
        
        <div>
          <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">Product</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 transition">How it works</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">Pricing</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">Testimonials</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">FAQ</Link>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">Company</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <a href="mailto:support@aigentra.trading" className="hover:text-zinc-900 transition">Contact</a>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">Legal</h3>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-900 transition md:hidden">
              <InstagramLogo size={20} />
            </a>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <Link href="/terms" className="hover:text-zinc-900 transition">Terms of Service</Link>
            <Link href="/disclaimer" className="hover:text-zinc-900 transition">Disclaimer</Link>
            <Link href="/legal-notices" className="hover:text-zinc-900 transition">Legal Notices</Link>
            <Link href="/privacy-policy" className="hover:text-zinc-900 transition">Privacy Policy</Link>
            <Link href="/risk-disclosure" className="hover:text-zinc-900 transition">Risk Disclosure</Link>
          </div>
        </div>

        <div className="hidden md:flex justify-end items-start">
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-900 transition">
            <InstagramLogo size={20} />
          </a>
        </div>
      </div>
      
      <div className="mx-auto flex flex-col gap-4 pt-8 text-[11px] text-zinc-400 max-w-[1500px]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between font-medium">
          <p>© 2026 Aigentra Trading. All rights reserved.</p>
          <div className="flex flex-wrap items-center text-zinc-500 gap-y-2">
            <Link href="/terms" className="hover:text-zinc-900 transition mr-4 md:mr-6">Terms of Service</Link>
            <Link href="/disclaimer" className="hover:text-zinc-900 transition mr-4 md:mr-6">Disclaimer</Link>
            <Link href="/legal-notices" className="hover:text-zinc-900 transition mr-4 md:mr-6">Legal Notices</Link>
            <Link href="/privacy-policy" className="hover:text-zinc-900 transition mr-4 md:mr-6">Privacy Policy</Link>
            <Link href="/risk-disclosure" className="hover:text-zinc-900 transition">Risk Disclosure</Link>
          </div>
          <p className="text-zinc-400">Made by <span className="font-semibold text-zinc-800">SERN</span></p>
        </div>
        <div className="mt-6 text-[10px] leading-5 text-zinc-400/80 border-t border-zinc-100/60 pt-6 space-y-2 text-left">
          <p>{copy.disclaimer}</p>
          <p className="text-[9px] text-zinc-400/60">
            Aigentra Trading is an AI-powered chart analysis tool for educational purposes only. Nothing on this site constitutes financial advice, investment advice, or a solicitation to buy or sell any financial instrument. Not Financial Advice (NFA). Do Your Own Research (DYOR). Trading involves significant risk of loss. Past performance is not indicative of future results. Results are not typical and may vary.
          </p>
          <div className="flex gap-3 text-[9px] text-zinc-400/50">
            <Link href="/privacy-policy" className="hover:underline">Privacy Policy</Link>
            <span>|</span>
            <Link href="/disclaimer" className="hover:underline">Disclaimer</Link>
            <span>|</span>
            <Link href="/risk-disclosure" className="hover:underline">Risk Disclosure</Link>
          </div>
        </div>
      </div>
    </>
  );
}

function MiniChart({ tall = false }: { readonly tall?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-b from-[#0a0f0d] to-[#040605] border border-white/[0.03] ${tall ? "h-52" : "h-44"}`}>
      <ChartLineUp className="absolute left-4 top-4 text-emerald-400" size={24} weight="bold" />
      <div className="absolute inset-x-5 top-1/2 border-t border-dashed border-emerald-500/25" />
      <div className="absolute bottom-5 left-5 right-5 flex items-end gap-1.5">
        {Array.from({ length: 20 }).map((_, index) => {
          const height = 24 + ((index * 17) % 78);
          return (
            <span 
              key={index} 
              className="flex-1 rounded-t-[3px] bg-gradient-to-t from-emerald-500/20 via-emerald-400/60 to-emerald-400 transition-all duration-300 hover:opacity-100 opacity-80" 
              style={{ height: `${height}px` }} 
            />
          );
        })}
      </div>
    </div>
  );
}
