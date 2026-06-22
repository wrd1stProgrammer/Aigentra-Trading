"use client";

import Link from "next/link";
import { ChartLineUp, Check, Clock, ShieldCheck, Star, TelegramLogo, TrendUp, InstagramLogo } from "@phosphor-icons/react";
import { LandingCheckoutButton } from "@/components/landing-checkout-button";
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
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">Decision Pipeline</span>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-200">BTCUSDT · live scan</span>
      </div>
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_54px_1fr]">
        <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">1. Scanner Setup</p>
          </div>
          <div className="space-y-2.5 text-[13px]">
            <div className="flex justify-between gap-3 border-b border-white/[0.04] pb-2">
              <span className="text-zinc-500">Strategy</span>
              <span className="text-zinc-200 font-semibold">Pullback EMA 200</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/[0.04] pb-2">
              <span className="text-zinc-500">Trigger Limit</span>
              <span className="text-emerald-400 font-bold font-mono">67,200 USDT</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-500">Timeframe</span>
              <span className="text-zinc-200 font-semibold font-mono">5m / 15m / 1h</span>
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center justify-center sm:flex-col">
          <div className="h-[1px] w-8 bg-gradient-to-r from-emerald-500/30 to-amber-500/30 sm:h-12 sm:w-[1px] sm:bg-gradient-to-b" />
          <span className="grid size-11 place-items-center rounded-full border border-amber-400/30 bg-amber-400/10 font-mono text-[11px] font-black text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.12)]">AI</span>
          <div className="h-[1px] w-8 bg-gradient-to-r from-amber-500/30 to-amber-500/70 sm:h-12 sm:w-[1px] sm:bg-gradient-to-b" />
        </div>

        <div className="rounded-xl border border-amber-500/25 bg-gradient-to-b from-[#211a0d] to-[#0f0d09] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.28)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400" />
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">2. AI Risk Audit</p>
            </div>
            <span className="rounded-md border border-amber-400/25 bg-amber-400/12 px-2 py-1 font-mono text-[9px] font-bold text-amber-200">AI Agent</span>
          </div>
          <div className="space-y-2.5">
            <div className="inline-flex rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300">Decision · adjusted approval</div>
            <p className="text-[13px] leading-6 text-zinc-300 break-keep font-sans">
              변동성 확장 구간은 통과. 다만 거래량이 얇아 레버리지를 낮추고 손절폭을 먼저 고정한 뒤 모의 진입을 승인합니다.
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
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">Position Risk Monitor</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-zinc-400">BTCUSDT · Simulated</span>
      </div>

      <div className="grid items-stretch gap-3 sm:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4 shadow-lg space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-400">ROI</span>
            <span className="font-mono text-2xl font-bold tracking-tight text-emerald-400">+32.40%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px] text-zinc-400">
            <div>
              <span className="block font-mono text-[10px] text-zinc-500">Entry Price</span>
              <span className="text-zinc-200 font-semibold font-mono">67,520 USDT</span>
            </div>
            <div className="text-right">
              <span className="block font-mono text-[10px] text-zinc-500">Mark Price</span>
              <span className="text-emerald-400 font-bold font-mono">71,840 USDT</span>
            </div>
          </div>
          <div className="pt-1">
            <div className="relative h-2 w-full rounded-full bg-zinc-800">
              <div className="absolute left-[15%] right-[25%] top-0 h-full bg-gradient-to-r from-emerald-500/30 to-emerald-400" />
              <div className="absolute left-[75%] top-1/2 size-3 -translate-y-1/2 rounded-full border border-black bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-zinc-500">
              <span>SL: 66,000</span>
              <span>TP: 73,000</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/15 bg-gradient-to-b from-[#1a1111] to-[#0f0808] p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2 bg-rose-500 rounded-full" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">AI Risk Warning</span>
            </div>
            <span className="text-[8px] text-zinc-500 font-mono font-semibold">[18:24]</span>
          </div>
          <p className="text-[13px] leading-6 text-zinc-300 break-keep font-sans">
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
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">Consensus Sentiment</span>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-200">20 AI Strategists</span>
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4 shadow-lg space-y-4">
          <div>
            <div className="mb-2 flex justify-between font-mono text-[11px] text-zinc-400">
              <span className="font-bold text-emerald-400">LONG 55%</span>
              <span className="font-bold text-rose-400">SHORT 45%</span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-md bg-zinc-900 p-0.5">
              <div className="h-full rounded-l bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: "55%" }} />
              <div className="h-full rounded-r bg-gradient-to-r from-rose-500 to-rose-400" style={{ width: "45%" }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniConsensusMetric label="Active" value="8" tone="text-emerald-300" />
            <MiniConsensusMetric label="Waiting" value="7" tone="text-amber-300" />
            <MiniConsensusMetric label="Flat" value="5" tone="text-zinc-300" />
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between gap-3 border-b border-white/[0.04] pb-1.5">
              <span className="text-zinc-500">Avg Entry</span>
              <span className="text-zinc-200 font-semibold font-mono">64,280 USDT</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-500">Hourly Opinion</span>
              <span className="font-mono font-bold text-emerald-400">mixed · risk aware</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 shadow-md">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">Aigentra aggregate</p>
          <p className="mt-2 text-[13px] leading-6 text-zinc-300 break-keep">
            활성 포지션, 진입 대기, 최근 익절/손절, AI 리뷰를 묶어 지금 리그가 어느 쪽으로 기울었는지 정리합니다.
          </p>
          <div className="mt-4 space-y-2">
            <ConsensusLine label="Trend desks" value="12 / 20" />
            <ConsensusLine label="Risk flags" value="4 active" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniConsensusMetric({ label, value, tone }: { readonly label: string; readonly value: string; readonly tone: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-2 text-center">
      <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function ConsensusLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-mono font-bold text-zinc-200">{value}</span>
    </div>
  );
}

export function TradePlanPreview() {
  const candles = [
    { x: 34, open: 114, close: 92, high: 124, low: 86 },
    { x: 56, open: 94, close: 76, high: 101, low: 68 },
    { x: 78, open: 78, close: 88, high: 96, low: 72 },
    { x: 100, open: 89, close: 72, high: 96, low: 65 },
    { x: 122, open: 74, close: 58, high: 82, low: 52 },
    { x: 144, open: 60, close: 70, high: 78, low: 48 },
    { x: 166, open: 72, close: 96, high: 104, low: 67 },
    { x: 188, open: 96, close: 84, high: 112, low: 76 },
    { x: 210, open: 86, close: 64, high: 92, low: 58 },
    { x: 232, open: 66, close: 52, high: 78, low: 44 },
    { x: 254, open: 53, close: 70, high: 76, low: 48 },
    { x: 276, open: 72, close: 58, high: 80, low: 50 },
    { x: 298, open: 60, close: 44, high: 66, low: 38 },
    { x: 320, open: 46, close: 34, high: 54, low: 28 },
    { x: 342, open: 35, close: 48, high: 55, low: 30 },
    { x: 364, open: 50, close: 38, high: 58, low: 32 },
    { x: 386, open: 40, close: 28, high: 48, low: 22 },
    { x: 408, open: 30, close: 22, high: 38, low: 18 }
  ] as const;

  return (
    <div className="w-full text-left font-sans">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">Scenario Plan</span>
        <span className="rounded-md bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300">Pending Trigger</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.45fr_0.85fr]">
        <div className="relative h-44 overflow-hidden rounded-xl border border-white/[0.08] bg-black/50 p-2 shadow-lg">
          <svg className="h-full w-full" viewBox="0 0 520 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => (
              <line key={`v-${index}`} x1={30 + index * 70} y1="14" x2={30 + index * 70} y2="166" stroke="#24302c" strokeWidth="1" opacity="0.55" />
            ))}
            {Array.from({ length: 5 }).map((_, index) => (
              <line key={`h-${index}`} x1="24" y1={26 + index * 32} x2="494" y2={26 + index * 32} stroke="#24302c" strokeWidth="1" opacity="0.55" />
            ))}
            <line x1="30" y1="36" x2="448" y2="36" stroke="#34d399" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.8" />
            <text x="34" y="28" fill="#34d399" fontSize="11" fontFamily="monospace" fontWeight="700">TP · 72,000</text>
            <line x1="30" y1="104" x2="448" y2="104" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="6 3" opacity="0.92" />
            <text x="34" y="96" fill="#fbbf24" fontSize="11" fontFamily="monospace" fontWeight="700">LIMIT ENTRY · 67,200</text>
            <line x1="30" y1="138" x2="448" y2="138" stroke="#fb7185" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.78" />
            <text x="34" y="132" fill="#fb7185" fontSize="11" fontFamily="monospace" fontWeight="700">SL · 65,800</text>
            <path d="M32 62 C78 74 118 62 162 72 C206 82 252 101 296 104 C346 108 392 110 438 116" stroke="#60a5fa" strokeWidth="1.5" opacity="0.78" />
            <text x="348" y="101" fill="#60a5fa" fontSize="11" fontFamily="monospace">EMA 200</text>
            {candles.map((candle) => {
              const bullish = candle.close < candle.open;
              const bodyY = Math.min(candle.open, candle.close);
              const bodyHeight = Math.max(Math.abs(candle.open - candle.close), 5);
              const color = bullish ? "#34d399" : "#fb7185";
              return (
                <g key={candle.x}>
                  <line x1={candle.x} y1={candle.high} x2={candle.x} y2={candle.low} stroke={color} strokeWidth="1.4" opacity="0.95" />
                  <rect x={candle.x - 5} y={bodyY} width="10" height={bodyHeight} rx="1.5" fill={color} />
                </g>
              );
            })}
            <path d="M410 22 C434 48 440 74 438 104" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.82" />
            <circle cx="438" cy="104" r="5.5" fill="#fbbf24" />
            <rect x="448" y="92" width="56" height="24" rx="4" fill="#fbbf24" fillOpacity="0.14" stroke="#fbbf24" strokeOpacity="0.4" />
            <text x="458" y="108" fill="#fbbf24" fontSize="12" fontFamily="monospace" fontWeight="800">B1 wait</text>
          </svg>
        </div>

        <div className="flex flex-col justify-between space-y-2">
          <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left text-[13px] text-zinc-300 shadow-md">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">[ Technical Check ]</span>
            <div className="space-y-2 font-semibold">
              <div className="flex items-center gap-2"><span className="text-emerald-400">✔</span> EMA 200 Rebound</div>
              <div className="flex items-center gap-2"><span className="text-emerald-400">✔</span> RSI Oversold (15m)</div>
              <div className="flex items-center gap-2"><span className="text-emerald-400">✔</span> Consensus 55%</div>
            </div>
          </div>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 font-bold text-amber-300">
              <span>ENTRY LIMIT</span>
              <span>67,200</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-bold text-emerald-300">
              <span>TARGET ROI</span>
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
  featured
}: { 
  readonly plan: LandingCopy["pricingPlans"][number]; 
  readonly featured: boolean;
}) {
  const isFree = plan.price.toLowerCase() === "free";
  const badgeText = isFree ? "FREE" : "AIGENTRA PRO";
  const ctaClassName = `mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.99] duration-300 ${
    featured
      ? "bg-emerald-500 shadow-neon-emerald hover:bg-emerald-400"
      : "bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-white/20"
  }`;

  return (
    <article className={`relative rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 sm:p-6 md:p-8 flex flex-col justify-between h-full ${
      featured
        ? "border-emerald-500/50 bg-gradient-to-b from-[#0a2016] via-[#05160f] to-[#020605] shadow-[0_12px_40px_rgba(16,185,129,0.15),inset_0_1px_1px_rgba(255,255,255,0.06)] hover:border-emerald-500/60 lg:scale-105 z-10"
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
            <span className="text-3xl font-bold tracking-tight text-white font-mono sm:text-4xl">{plan.price}</span>
            <span className="pb-1 text-zinc-500 text-xs font-semibold">{plan.cadence}</span>
          </div>
        </div>

        {isFree ? (
          <Link href="/leaderboard" className={ctaClassName}>
            {plan.cta}
          </Link>
        ) : (
          <LandingCheckoutButton className={ctaClassName}>{plan.cta}</LandingCheckoutButton>
        )}
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
    <div className="rounded-2xl border border-white/[0.08] bg-[#182533] p-4 shadow-xl transition-all duration-300 hover:-translate-y-1">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.35)]">
            <TelegramLogo size={20} weight="fill" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Aigentra Trading Bot</p>
            <p className="font-mono text-[11px] text-sky-200/70">now · favorite trader</p>
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-1 font-mono text-[10px] text-sky-100">Telegram</span>
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-[#eff6ff] p-4 text-sm leading-6 text-slate-900 shadow-md">
        <p className="font-bold text-slate-950">[AI Trader League] 트레이더 피드</p>
        <p className="mt-1 font-semibold text-slate-700">VWAP 회수반장 · BTCUSDT</p>
        <p className="mt-3 font-bold text-emerald-700">롱 아직 열려 있어요</p>
        <p className="mt-1 text-slate-700">내 롱은 살아 있고, 익절선 근처에서는 괜히 따라붙지 않을게요. 거래량이 식으면 바로 보수적으로 관리합니다.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">LONG · 5x</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">price 64,280</span>
        </div>
      </div>
      <p className="mt-4 flex items-center gap-2 font-mono text-xs text-sky-100/70">
        <Clock size={14} /> delivered 8 seconds ago · only favorites
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
          <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">{copy.footerLabels.product}</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 transition">{copy.footerLabels.howItWorks}</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">{copy.footerLabels.pricing}</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">{copy.footerLabels.operatorNotes}</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">{copy.footerLabels.faq}</Link>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">{copy.footerLabels.company}</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <a href="mailto:support@aigentra.trading" className="hover:text-zinc-900 transition">{copy.footerLabels.contact}</a>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">{copy.footerLabels.legal}</h3>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-900 transition md:hidden">
              <InstagramLogo size={20} />
            </a>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <Link href="/terms" className="hover:text-zinc-900 transition">{copy.footerLabels.terms}</Link>
            <Link href="/disclaimer" className="hover:text-zinc-900 transition">{copy.footerLabels.disclaimer}</Link>
            <Link href="/legal-notices" className="hover:text-zinc-900 transition">{copy.footerLabels.legalNotices}</Link>
            <Link href="/privacy-policy" className="hover:text-zinc-900 transition">{copy.footerLabels.privacyPolicy}</Link>
            <Link href="/risk-disclosure" className="hover:text-zinc-900 transition">{copy.footerLabels.riskDisclosure}</Link>
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
            <Link href="/terms" className="hover:text-zinc-900 transition mr-4 md:mr-6">{copy.footerLabels.terms}</Link>
            <Link href="/disclaimer" className="hover:text-zinc-900 transition mr-4 md:mr-6">{copy.footerLabels.disclaimer}</Link>
            <Link href="/legal-notices" className="hover:text-zinc-900 transition mr-4 md:mr-6">{copy.footerLabels.legalNotices}</Link>
            <Link href="/privacy-policy" className="hover:text-zinc-900 transition mr-4 md:mr-6">{copy.footerLabels.privacyPolicy}</Link>
            <Link href="/risk-disclosure" className="hover:text-zinc-900 transition">{copy.footerLabels.riskDisclosure}</Link>
          </div>
          <p className="text-zinc-400">{copy.footerLabels.madeBy} <span className="font-semibold text-zinc-800">SERN</span></p>
        </div>
        <div className="mt-6 space-y-3 border-t border-zinc-100/60 pt-6 text-left text-xs leading-6 text-zinc-500">
          <p className="font-medium text-zinc-500">{copy.disclaimer}</p>
          <p className="max-w-[112ch] text-zinc-400">{copy.footerRiskNotice}</p>
          <div className="flex flex-wrap gap-3 text-[11px] leading-5 text-zinc-400">
            <Link href="/privacy-policy" className="hover:underline">{copy.footerLabels.privacyPolicy}</Link>
            <span>|</span>
            <Link href="/disclaimer" className="hover:underline">{copy.footerLabels.disclaimer}</Link>
            <span>|</span>
            <Link href="/risk-disclosure" className="hover:underline">{copy.footerLabels.riskDisclosure}</Link>
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
