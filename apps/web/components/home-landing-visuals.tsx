"use client";

import Link from "next/link";
import { ChartLineUp, Check, Clock, Pulse, ShieldCheck, Star, TelegramLogo, TrendUp } from "@phosphor-icons/react";
import type { LandingCopy } from "@/lib/marketing-copy";

const traderRows = [
  { name: "Channel Rider", state: "SHORT · 5x", pnl: "+1.33%" },
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
      className={`relative overflow-hidden rounded-[18px] border border-white/15 bg-[#111413] p-3 shadow-[0_22px_90px_rgba(0,0,0,0.48)] ${
        compact ? "min-h-[360px]" : "min-h-[430px]"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(96,165,250,0.22),transparent_26%),radial-gradient(circle_at_92%_95%,rgba(249,115,22,0.25),transparent_24%),linear-gradient(90deg,rgba(16,185,129,0.08),transparent)]" />
      <div className="relative h-full rounded-[14px] border border-white/12 bg-[#090b0a] p-5 text-white md:p-7">
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
            <button className="mb-5 w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(16,185,129,0.45)]">
              + New analysis
            </button>
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
    <div className="flex h-full w-full flex-col justify-center px-1 py-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1.1fr] items-center">
        {/* Step 1: Scanner Setup */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-left shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400 font-bold">[ Step 1: Scanner ]</span>
            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
          <h4 className="mt-2 text-xs font-bold text-white">BTCUSDT Setup</h4>
          <div className="mt-2 space-y-1 font-mono text-[10px] text-zinc-400">
            <div className="flex justify-between">
              <span>Strategy:</span>
              <span className="text-zinc-200">Pullback EMA</span>
            </div>
            <div className="flex justify-between">
              <span>Side:</span>
              <span className="text-emerald-400 font-bold">LONG</span>
            </div>
            <div className="flex justify-between">
              <span>Trigger:</span>
              <span className="text-zinc-200">67,524 USDT</span>
            </div>
          </div>
        </div>

        {/* Connection Vector Arrow */}
        <div className="flex flex-row sm:flex-col items-center justify-center py-1 sm:py-0">
          <div className="h-[2px] w-6 sm:h-6 sm:w-[2px] bg-gradient-to-r sm:bg-gradient-to-b from-amber-400/80 to-emerald-400/80" />
          <span className="text-[10px] text-emerald-400 font-mono font-bold animate-pulse py-0.5">🤖</span>
          <div className="h-[2px] w-6 sm:h-6 sm:w-[2px] bg-gradient-to-r sm:bg-gradient-to-b from-emerald-400/80 to-emerald-500" />
        </div>

        {/* Step 2: AI Risk Review */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3.5 text-left shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 blur-xl rounded-full" />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400 font-bold">[ Step 2: AI Review ]</span>
            <span className="font-mono text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full scale-90">Gemini</span>
          </div>
          <h4 className="mt-2 text-xs font-bold text-white flex items-center gap-1.5">
            Decision: <span className="text-amber-300">ADJUSTED</span>
          </h4>
          <div className="mt-2 rounded bg-black/40 border border-white/[0.04] p-2 font-mono text-[9px] leading-relaxed text-zinc-300">
            <span className="text-emerald-400 font-bold">"</span>최근 15분봉 하락 장대음봉 감지. 변동성 증가로 레버리지를 <span className="text-amber-300 font-semibold">10x ➔ 5x</span>로 축소하여 모의 진입 승인.<span className="text-emerald-400 font-bold">"</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PositionManagementPreview() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 py-1">
      {/* Active Position Ticket */}
      <div className="rounded-xl border border-white/10 bg-[#111413] p-4 text-left shadow-md">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
          <div>
            <h4 className="text-xs font-bold text-white">BTCUSDT Long Position</h4>
            <p className="font-mono text-[9px] text-zinc-500">Leverage: 5x | Simulated</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
            ROI +32.40%
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 pt-2.5 font-mono text-[10px] text-zinc-400">
          <div>
            <span className="text-zinc-500">Entry Price:</span>
            <p className="text-zinc-200 font-semibold mt-0.5">67,520 USDT</p>
          </div>
          <div className="text-right">
            <span className="text-zinc-500">Mark Price:</span>
            <p className="text-emerald-400 font-bold mt-0.5">71,840 USDT</p>
          </div>
        </div>

        {/* TP / SL Slider Bar */}
        <div className="mt-3">
          <div className="flex justify-between font-mono text-[8px] text-zinc-500 mb-1">
            <span>SL: 66,000</span>
            <span>Current: 71,840</span>
            <span>TP: 73,000</span>
          </div>
          <div className="relative h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
            {/* SL indicator */}
            <div className="absolute left-[10%] top-0 h-full w-1 bg-rose-500" />
            {/* Current Price progress */}
            <div className="absolute left-[10%] right-[20%] top-0 h-full bg-gradient-to-r from-emerald-500/30 to-emerald-400" />
            {/* Current Price dot */}
            <div className="absolute left-[80%] top-1/2 -translate-y-1/2 size-2 rounded-full bg-emerald-400 border border-black shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
            {/* TP indicator */}
            <div className="absolute right-[10%] top-0 h-full w-1 bg-emerald-500" />
          </div>
        </div>
      </div>

      {/* AI Risk Review Alert */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-2 text-left flex gap-2.5 items-start">
        <div className="size-1.5 bg-amber-400 rounded-full animate-ping mt-1.5 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] font-bold text-amber-300">AI Risk Warning [18:24]</span>
            <span className="font-mono text-[8px] text-zinc-500">Auto</span>
          </div>
          <p className="mt-0.5 font-mono text-[9px] leading-relaxed text-zinc-300 break-keep">
            단기 매도 거래량 급증 포착. 스톱로스를 본절가(67,520)로 상향 이동하고 자산의 30%를 부분 익절 관리합니다.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ConsensusPreview() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2.5 py-1">
      {/* Long/Short Ratio Bar */}
      <div>
        <div className="flex justify-between items-end mb-1">
          <span className="font-mono text-[10px] font-bold text-emerald-400">LONG 70%</span>
          <span className="font-mono text-[9px] text-zinc-500">AI Consensus Ratio</span>
          <span className="font-mono text-[10px] font-bold text-rose-400">SHORT 30%</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-white/5 bg-zinc-950 p-0.5">
          <div className="h-full rounded-l-full bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]" style={{ width: "70%" }} />
          <div className="h-full rounded-r-full bg-gradient-to-r from-rose-500 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]" style={{ width: "30%" }} />
        </div>
      </div>

      {/* Target price averages */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/40 border border-white/[0.04] p-2.5 text-left font-mono text-[9px] text-zinc-400">
        <div>
          <span className="text-zinc-500">Avg Entry Price</span>
          <p className="text-zinc-200 font-bold text-[11px] mt-0.5">67,820 USDT</p>
        </div>
        <div className="text-right">
          <span className="text-zinc-500">Target Exit Range</span>
          <p className="text-emerald-400 font-bold text-[11px] mt-0.5">72,500 - 73,100 USDT</p>
        </div>
      </div>

      {/* Active strategy position list */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center rounded-lg border border-white/[0.04] bg-white/[0.01] px-2.5 py-1 font-mono text-[9px] text-zinc-300">
          <span className="font-semibold">Pullback Architect</span>
          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[8px]">LONG (ROI +24.8%)</span>
        </div>
        <div className="flex justify-between items-center rounded-lg border border-white/[0.04] bg-white/[0.01] px-2.5 py-1 font-mono text-[9px] text-zinc-300">
          <span className="font-semibold">Channel Rider</span>
          <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded text-[8px]">SHORT (ROI +1.33%)</span>
        </div>
        <div className="flex justify-between items-center rounded-lg border border-white/[0.04] bg-white/[0.01] px-2.5 py-1 font-mono text-[9px] text-zinc-300">
          <span className="font-semibold">Funding Contrarian</span>
          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[8px]">LONG (ROI +5.20%)</span>
        </div>
      </div>
    </div>
  );
}

export function TradePlanPreview() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 py-1">
      {/* Trade Plan Box */}
      <div className="rounded-xl border border-white/10 bg-[#111413] p-4 text-left shadow-md">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white">BTCUSDT Trade Plan</h4>
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <p className="font-mono text-[9px] text-zinc-500">Strategy: Pullback Architect</p>
          </div>
          <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-300">
            PENDING
          </span>
        </div>

        {/* Expected Scenario details */}
        <div className="mt-3 font-mono text-[10px] text-zinc-400 space-y-1.5">
          <div className="flex justify-between border-b border-white/[0.02] pb-1.5">
            <span className="text-zinc-500">Expected Scenario:</span>
            <span className="text-zinc-200">Rebound from EMA 200</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="rounded bg-white/[0.02] p-1.5 border border-white/[0.04]">
              <span className="text-zinc-500 text-[8px] block">Entry Limit</span>
              <span className="text-zinc-200 font-semibold text-[10px]">67,200</span>
            </div>
            <div className="rounded bg-rose-950/10 p-1.5 border border-rose-500/10">
              <span className="text-rose-400 text-[8px] block">Stop Loss (SL)</span>
              <span className="text-rose-300 font-semibold text-[10px]">65,800</span>
            </div>
            <div className="rounded bg-emerald-950/10 p-1.5 border border-emerald-500/10">
              <span className="text-emerald-400 text-[8px] block">Target (TP)</span>
              <span className="text-emerald-300 font-semibold text-[10px]">72,000</span>
            </div>
          </div>
        </div>
      </div>

      {/* Rationale Quote */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] p-2.5 text-left font-mono text-[9px] leading-relaxed text-zinc-300">
        <span className="text-emerald-400 font-bold">"</span>단기 EMA 200 지지선 부근 터치 시 기술적 반등 시나리오가 유효합니다. 해당 가격대 진입 시 롱 포지션 대기 주문이 실행됩니다.<span className="text-emerald-400 font-bold">"</span>
      </div>
    </div>
  );
}

export function PricingCard({ plan, featured }: { readonly plan: LandingCopy["pricingPlans"][number]; readonly featured: boolean }) {
  return (
    <article className={`rounded-[22px] border p-6 md:p-8 hover:-translate-y-1 transition-all duration-300 ${
      featured 
        ? "border-emerald-500/35 bg-gradient-to-b from-[#0a1e16] via-[#05140e] to-[#020504] shadow-[0_4px_30px_rgba(16,185,129,0.06),inset_0_1px_1px_rgba(255,255,255,0.06)] hover:border-emerald-500/50" 
        : "border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:border-emerald-500/20"
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-white tracking-tight">{plan.name}</h3>
          <p className="mt-3 max-w-[42ch] text-sm leading-6 text-zinc-400 break-keep">{plan.description}</p>
        </div>
        <span className="whitespace-nowrap font-mono text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
          {featured ? "POPULAR" : "BEST VALUE"}
        </span>
      </div>
      <div className="mt-8 flex items-end gap-2">
        <span className="text-5xl font-bold tracking-tight text-white">{plan.price}</span>
        <span className="pb-2 text-zinc-500 text-sm">{plan.cadence}</span>
      </div>
      <Link href={featured ? "/leaderboard" : "/account"} className={`mt-9 inline-flex w-full justify-center rounded-full px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.99] ${
        featured 
          ? "bg-emerald-500 shadow-neon-emerald hover:bg-emerald-400" 
          : "bg-white/[0.06] border border-white/10 hover:bg-white/[0.1]"
      }`}>
        {plan.cta}
      </Link>
      <div className="mt-9 space-y-4 text-sm text-zinc-300">
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
    <div className="rounded-[20px] border border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:-translate-y-1 transition-all duration-300">
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
    <div className="rounded-[20px] border border-white/[0.08] bg-gradient-to-b from-[#111413] to-[#080a09] p-5 shadow-xl hover:-translate-y-1 transition-all duration-300">
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
      <div className="mx-auto grid max-w-[1500px] gap-10 border-b border-zinc-200 pb-12 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-emerald-200 text-emerald-600">AT</span>
            <span className="text-2xl font-semibold">Aigentra Trading</span>
          </div>
          <p className="mt-5 max-w-[42ch] text-base leading-7 text-zinc-600">{copy.footerTagline}</p>
        </div>
        {[
          ["Product", "Home", "Leaderboard", "Traders"],
          ["Company", "Account", "Login", "Telegram"],
          ["Legal", "Disclaimer", "Risk notice", "Privacy"]
        ].map(([title, ...items]) => (
          <div key={title}>
            <h3 className="font-semibold">{title}</h3>
            <div className="mt-4 grid gap-3 text-sm text-zinc-600">
              {items.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 pt-8 text-sm text-zinc-500 md:flex-row md:items-center md:justify-between">
        <p>© 2026 AI Trader League.</p>
        <p className="max-w-[88ch] leading-6">{copy.disclaimer}</p>
      </div>
    </>
  );
}

function MiniChart({ tall = false }: { readonly tall?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[14px] bg-gradient-to-b from-[#0a0f0d] to-[#040605] border border-white/[0.03] ${tall ? "h-52" : "h-44"}`}>
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

