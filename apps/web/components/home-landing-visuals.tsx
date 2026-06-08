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

export function AgentWorkflowPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-[22px] border border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:border-emerald-500/30 hover:shadow-[0_8px_32px_rgba(16,185,129,0.06)] hover:-translate-y-1 transition-all duration-300">
        <p className="mb-4 font-mono text-sm text-zinc-400">Graph analysis...</p>
        {["Probable scenarios", "Fibonacci", "RSI score", "Support/Resistance", "Macro context"].map((item) => (
          <div key={item} className="flex items-center justify-between border-b border-white/10 py-3 text-sm text-zinc-200 last:border-b-0">
            <span>{item}</span>
            <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
              <Check size={12} weight="bold" />
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-[22px] border border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:border-emerald-500/30 hover:shadow-[0_8px_32px_rgba(16,185,129,0.06)] hover:-translate-y-1 transition-all duration-300">
        <div className="mb-5 flex items-center justify-between">
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 font-mono text-xs text-zinc-300">Total Profit: 318$</span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            LIVE
          </span>
        </div>
        <MiniChart tall />
        <div className="mt-5 space-y-3">
          {["Explanations", "Technical analysis", "Probable scenarios"].map((item) => (
            <div key={item} className="flex items-center justify-between rounded-[10px] border border-emerald-500/10 bg-emerald-950/20 px-4 py-2.5">
              <span className="text-sm font-medium text-zinc-200">{item}</span>
              <span className="font-mono text-[11px] text-emerald-300/80 bg-emerald-500/10 px-2 py-0.5 rounded-full">reviewed</span>
            </div>
          ))}
        </div>
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

