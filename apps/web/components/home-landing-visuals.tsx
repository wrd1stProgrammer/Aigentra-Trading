"use client";

import Link from "next/link";
import { Check, Clock, ShieldCheck, TelegramLogo, InstagramLogo } from "@phosphor-icons/react";
import { BrandMark } from "@/components/brand-mark";
import type { LandingCopy } from "@/lib/marketing-copy";
import { useAppContext } from "@/components/app-provider";
import { LandingCheckoutButton } from "@/components/landing-checkout-button";
import { BILLING_PLAN_KEYS } from "@/lib/billing-plans";

type LandingPreviewCopy = LandingCopy["previews"];

export function VideoFrame({
  title,
  src
}: {
  readonly title: string;
  readonly src: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#111413] p-2 shadow-[0_22px_90px_rgba(0,0,0,0.48)] sm:p-3">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(45,212,191,0.12),transparent_34%),linear-gradient(135deg,rgba(45,212,191,0.08),transparent_42%),linear-gradient(315deg,rgba(255,255,255,0.07),transparent_36%)]" />
      <div className="relative aspect-video overflow-hidden rounded-xl border border-white/12 bg-[#050706]">
        <video
          aria-label={title}
          autoPlay
          className="h-full w-full object-contain"
          loop
          muted
          playsInline
          preload="metadata"
          src={src}
        />
      </div>
    </div>
  );
}

export function PipelinePreview({ copy }: { readonly copy: LandingPreviewCopy["pipeline"] }) {
  return (
    <div className="w-full text-left font-sans">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">{copy.eyebrow}</span>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-200">{copy.scanBadge}</span>
      </div>
      <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_54px_1fr]">
        <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{copy.setupTitle}</p>
          </div>
          <div className="space-y-2.5 text-[13px]">
            <div className="flex justify-between gap-3 border-b border-white/[0.04] pb-2">
              <span className="text-zinc-500">{copy.strategyLabel}</span>
              <span className="text-zinc-200 font-semibold">Pullback EMA 200</span>
            </div>
            <div className="flex justify-between gap-3 border-b border-white/[0.04] pb-2">
              <span className="text-zinc-500">{copy.triggerLimitLabel}</span>
              <span className="text-emerald-400 font-bold font-mono">67,200 USDT</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-500">{copy.timeframeLabel}</span>
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
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">{copy.auditTitle}</p>
            </div>
            <span className="rounded-md border border-amber-400/25 bg-amber-400/12 px-2 py-1 font-mono text-[9px] font-bold text-amber-200">{copy.auditBadge}</span>
          </div>
          <div className="space-y-2.5">
            <div className="inline-flex rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-300">{copy.decisionBadge}</div>
            <p className="text-[13px] leading-6 text-zinc-300 break-keep font-sans">
              {copy.body}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PositionManagementPreview({ copy }: { readonly copy: LandingPreviewCopy["position"] }) {
  return (
    <div className="w-full text-left font-sans">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">{copy.eyebrow}</span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] text-zinc-400">{copy.marketBadge}</span>
      </div>

      <div className="grid items-stretch gap-3 sm:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4 shadow-lg space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-400">ROI</span>
            <span className="font-mono text-2xl font-bold tracking-tight text-emerald-400">+32.40%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px] text-zinc-400">
            <div>
              <span className="block font-mono text-[10px] text-zinc-500">{copy.entryLabel}</span>
              <span className="text-zinc-200 font-semibold font-mono">67,520 USDT</span>
            </div>
            <div className="text-right">
              <span className="block font-mono text-[10px] text-zinc-500">{copy.markLabel}</span>
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
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">{copy.warningTitle}</span>
            </div>
            <span className="text-[8px] text-zinc-500 font-mono font-semibold">[18:24]</span>
          </div>
          <p className="text-[13px] leading-6 text-zinc-300 break-keep font-sans">
            {copy.warningBody}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ConsensusPreview({ copy }: { readonly copy: LandingPreviewCopy["consensus"] }) {
  return (
    <div className="w-full text-left font-sans">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-400">{copy.eyebrow}</span>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-200">{copy.strategistsBadge}</span>
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
            <MiniConsensusMetric label={copy.activeLabel} value="8" tone="text-emerald-300" />
            <MiniConsensusMetric label={copy.waitingLabel} value="7" tone="text-amber-300" />
            <MiniConsensusMetric label={copy.flatLabel} value="5" tone="text-zinc-300" />
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between gap-3 border-b border-white/[0.04] pb-1.5">
              <span className="text-zinc-500">{copy.avgEntryLabel}</span>
              <span className="text-zinc-200 font-semibold font-mono">64,280 USDT</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-500">{copy.hourlyOpinionLabel}</span>
              <span className="font-mono font-bold text-emerald-400">{copy.hourlyOpinionValue}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 shadow-md">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">{copy.aggregateLabel}</p>
          <p className="mt-2 text-[13px] leading-6 text-zinc-300 break-keep">
            {copy.body}
          </p>
          <div className="mt-4 space-y-2">
            <ConsensusLine label={copy.trendDesksLabel} value="12 / 20" />
            <ConsensusLine label={copy.riskFlagsLabel} value={copy.riskFlagsValue} />
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

export function TradePlanPreview({ copy }: { readonly copy: LandingPreviewCopy["tradePlan"] }) {
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
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-400">{copy.eyebrow}</span>
        <span className="rounded-md bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-amber-300">{copy.triggerBadge}</span>
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
            <text x="458" y="108" fill="#fbbf24" fontSize="12" fontFamily="monospace" fontWeight="800">{copy.waitLabel}</text>
          </svg>
        </div>

        <div className="flex flex-col justify-between space-y-2">
          <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left text-[13px] text-zinc-300 shadow-md">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">{copy.technicalCheckLabel}</span>
            <div className="space-y-2 font-semibold">
              {copy.checks.map((check) => (
                <div key={check} className="flex items-center gap-2"><span className="text-emerald-400">✔</span> {check}</div>
              ))}
            </div>
          </div>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 font-bold text-amber-300">
              <span>{copy.entryLimitLabel}</span>
              <span>67,200</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-bold text-emerald-300">
              <span>{copy.targetRoiLabel}</span>
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
  billingInterval
}: { 
  readonly plan: LandingCopy["pricingPlans"][number]; 
  readonly featured: boolean;
  readonly billingInterval: "yearly" | "monthly";
}) {
  const { locale } = useAppContext();
  const isFree = plan.price.toLowerCase() === "free";

  const getCardTitle = () => {
    if (isFree) return plan.name;
    if (billingInterval === "yearly") {
      switch (locale) {
        case "ko": return "연간 결제";
        case "ru": return "Годовой план";
        case "pt-BR": return "Plano Anual";
        case "tr": return "Yıllık Plan";
        default: return "Yearly";
      }
    } else {
      switch (locale) {
        case "ko": return "월간 결제";
        case "ru": return "Месячный план";
        case "pt-BR": return "Plano Mensal";
        case "tr": return "Aylık Plan";
        default: return "Monthly";
      }
    }
  };

  const badgeText = isFree
    ? "[ FREE ]"
    : billingInterval === "yearly"
      ? "[ BEST VALUE ]"
      : "[ POPULAR ]";

  const ctaClassName = `mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.99] duration-300 ${
    featured
      ? "bg-emerald-500 shadow-neon-emerald hover:bg-emerald-400"
      : "bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-white/20"
  }`;

  const isYearly = billingInterval === "yearly";
  const originalPrice = isYearly ? "$348" : "$29";
  const discountedPrice = isYearly ? "$15.83" : "$19";
  const discountBadge = isYearly ? "45% OFF" : "34% OFF";

  let cadenceLabel = "/ mo";
  if (locale === "ko") cadenceLabel = "/ 월";
  else if (locale === "ru") cadenceLabel = "/ мес.";
  else if (locale === "pt-BR") cadenceLabel = "/ mês";
  else if (locale === "tr") cadenceLabel = "/ ay";

  let explanation = "";
  if (isYearly) {
    switch (locale) {
      case "ko":
        explanation = "연간 결제 시 총 $190 (매월 $15.83 상당)";
        break;
      case "ru":
        explanation = "Оплата раз в год $190 ($15.83/мес. эквивалент)";
        break;
      case "pt-BR":
        explanation = "Cobrado anualmente a $190/ano (equivalente a $15.83/mês)";
        break;
      case "tr":
        explanation = "Yıllık $190 olarak faturalandırılır ($15.83/ay eşdeğeri)";
        break;
      default:
        explanation = "Billed annually at $190/yr ($15.83/mo equivalent)";
    }
  } else {
    switch (locale) {
      case "ko":
        explanation = "정가 $29에서 34% 특별 할인 적용";
        break;
      case "ru":
        explanation = "Обычная цена $29, скидка 34% включена";
        break;
      case "pt-BR":
        explanation = "Preço original $29, desconto especial de 34% aplicado";
        break;
      case "tr":
        explanation = "Orijinal fiyatı $29, %34 özel indirim uygulandı";
        break;
      default:
        explanation = "Originally $29, special 34% discount applied";
    }
  }

  const priceDisplay = isFree ? (
    <div className="flex flex-wrap items-end gap-1.5">
      <span className="text-4xl font-bold tracking-tight text-white font-mono">{plan.price}</span>
      <span className="pb-1 text-zinc-500 text-xs font-semibold">{plan.cadence}</span>
    </div>
  ) : (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 line-through text-sm font-medium">{originalPrice}</span>
        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 font-mono">
          {discountBadge}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-5xl font-extrabold tracking-tight text-white font-mono">{discountedPrice}</span>
        <span className="text-zinc-400 text-sm font-semibold">{cadenceLabel}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed break-keep mt-1">
        {explanation}
      </p>
    </div>
  );

  return (
    <article className={`relative rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 sm:p-8 flex flex-col justify-between h-full ${
      featured
        ? "border-emerald-500/40 bg-gradient-to-b from-[#0d261b] via-[#051710] to-[#020705] shadow-[0_20px_50px_rgba(16,185,129,0.12),inset_0_1px_1px_rgba(255,255,255,0.05)] hover:border-emerald-500/60 lg:scale-[1.03] z-10"
        : "border-white/[0.06] bg-gradient-to-b from-[#111413] to-[#050706] shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-emerald-500/15"
    }`}>
      <div>
        <div className="min-h-[110px] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-2xl font-extrabold text-white tracking-tight">{getCardTitle()}</h3>
            <span className="whitespace-nowrap font-mono text-[10px] tracking-wider text-emerald-400 font-bold uppercase mt-1">
              {badgeText}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400 break-keep flex-1">{plan.description}</p>
        </div>

        <div className="mt-6">
          {priceDisplay}
        </div>

        {isFree ? (
          <Link href="/leaderboard" className={ctaClassName}>
            {plan.cta}
          </Link>
        ) : (
          <LandingCheckoutButton
            className={ctaClassName}
            planKey={isYearly ? BILLING_PLAN_KEYS.annual : BILLING_PLAN_KEYS.monthly}
          >
            {plan.cta}
          </LandingCheckoutButton>
        )}
      </div>

      <div className="mt-8 pt-6 border-t border-white/[0.06] space-y-4 text-sm text-zinc-300">
        {plan.features.map((feature) => (
          <p key={feature} className="flex gap-3 items-start">
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

export function AlertPreview({ copy }: { readonly copy: LandingPreviewCopy["alert"] }) {
  return (
    <div className="rounded-2xl border border-sky-300/15 bg-[#172535] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.32)] transition-all duration-300 hover:-translate-y-1 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-sky-500 text-white shadow-[0_0_18px_rgba(14,165,233,0.38)]">
            <TelegramLogo size={22} weight="fill" />
          </span>
          <div>
            <p className="text-base font-bold tracking-tight text-white">{copy.botName}</p>
            <p className="font-mono text-[11px] text-sky-100/65">{copy.meta}</p>
          </div>
        </div>
        <span className="rounded-full border border-sky-300/15 bg-white/10 px-2.5 py-1 font-mono text-[10px] text-sky-100">{copy.channel}</span>
      </div>
      <div className="rounded-[18px] rounded-tl-sm bg-[#f3f7ff] p-4 text-sm leading-6 text-slate-900 shadow-[0_12px_24px_rgba(4,15,29,0.24)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold text-slate-950">{copy.title}</p>
            <p className="mt-1 font-semibold text-slate-600">{copy.trader}</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-700">{copy.liveBadge}</span>
        </div>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="font-bold text-emerald-800">{copy.headline}</p>
          <p className="mt-1 text-slate-700">{copy.body}</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
          <span className="rounded-lg bg-slate-950 px-2.5 py-2 text-emerald-300">LONG · 5x</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-2 text-slate-600">{copy.priceLabel}<br /><strong className="text-slate-900">64,280</strong></span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-2 text-slate-600">{copy.roiLabel}<br /><strong className="text-emerald-700">+0.83%</strong></span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-sky-100/72">
        <p className="flex items-center gap-2 font-mono">
          <Clock size={14} /> {copy.delivered}
        </p>
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          <span className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2">{copy.language}</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2">{copy.event}</span>
        </div>
      </div>
    </div>
  );
}


export function LandingFooter({ copy }: { readonly copy: LandingCopy }) {
  return (
    <>
      <div className="mx-auto grid max-w-[1500px] gap-10 border-b border-zinc-200 pb-12 sm:grid-cols-2 md:grid-cols-6 text-left">
        <div className="md:col-span-2">
          <Link href="/" className="focus-ring footer-brand-link">
            <BrandMark framed />
            <span className="text-xl font-bold tracking-tight text-zinc-900">Aigentra Trading</span>
          </Link>
          <p className="mt-5 max-w-[32ch] text-sm leading-6 text-zinc-500">{copy.footerTagline}</p>
        </div>
        
        <div>
          <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">{copy.footerLabels.product}</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 transition">{copy.footerLabels.howItWorks}</Link>
            <Link href="/blog" className="hover:text-zinc-900 transition">{copy.footerLabels.blog}</Link>
            <Link href="/methodology" className="hover:text-zinc-900 transition">{copy.footerLabels.methodology}</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">{copy.footerLabels.pricing}</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">{copy.footerLabels.operatorNotes}</Link>
            <Link href="/login" className="hover:text-zinc-900 transition">{copy.footerLabels.faq}</Link>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-zinc-800 uppercase tracking-wider">{copy.footerLabels.company}</h3>
          <div className="mt-4 grid gap-3 text-sm text-zinc-500">
            <a href="mailto:support@aigentratrading.com" className="hover:text-zinc-900 transition">{copy.footerLabels.contact}</a>
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
