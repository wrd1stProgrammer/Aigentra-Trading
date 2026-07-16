"use client";

import Link from "next/link";
import { BellRinging, Check, Clock, TelegramLogo } from "@phosphor-icons/react";
import type { LandingCopy } from "@/lib/marketing-copy";

type AlertPreviewCopy = LandingCopy["previews"]["alert"];

function AlertPreview({ copy }: { readonly copy: AlertPreviewCopy }) {
  return (
    <article aria-label={copy.title} className="overflow-hidden rounded-xl border border-white/[0.09] bg-black/25">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#229ED9] text-white">
            <TelegramLogo size={18} weight="fill" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{copy.botName}</p>
            <p className="truncate font-mono text-[10px] text-zinc-500">{copy.meta}</p>
          </div>
        </div>
        <span className="hidden shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-zinc-400 sm:inline-flex">
          {copy.channel}
        </span>
      </header>

      <div className="p-4 sm:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold text-white">{copy.title}</p>
            <p className="mt-1 text-sm font-semibold text-zinc-500">{copy.trader}</p>
          </div>
          <span className="shrink-0 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 font-mono text-[10px] font-bold text-emerald-300">
            {copy.liveBadge}
          </span>
        </div>

        <div className="mt-4 border-l-2 border-emerald-400/50 bg-emerald-400/[0.045] px-4 py-3">
          <p className="font-bold text-emerald-200">{copy.headline}</p>
          <p className="mt-1 break-keep text-sm leading-6 text-zinc-300">{copy.body}</p>
        </div>

        <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
          <div className="bg-[#0b0e0d] px-3 py-2.5">
            <dt className="font-mono text-[10px] text-zinc-500">{copy.liveBadge}</dt>
            <dd className="mt-1 font-mono text-xs font-bold text-emerald-300">LONG · 5x</dd>
          </div>
          <div className="bg-[#0b0e0d] px-3 py-2.5">
            <dt className="font-mono text-[10px] text-zinc-500">{copy.priceLabel}</dt>
            <dd className="mt-1 font-mono text-xs font-bold text-white">64,280</dd>
          </div>
          <div className="bg-[#0b0e0d] px-3 py-2.5">
            <dt className="font-mono text-[10px] text-zinc-500">{copy.roiLabel}</dt>
            <dd className="mt-1 font-mono text-xs font-bold text-emerald-300">+0.83%</dd>
          </div>
        </dl>

        <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.08] pt-3 font-mono text-[10px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} /> {copy.delivered}
          </span>
          <span>{copy.language}</span>
          <span>{copy.event}</span>
        </footer>
      </div>
    </article>
  );
}

export function LandingTelegramAlertsSection({ copy }: { readonly copy: LandingCopy }) {
  return (
    <section
      data-testid="landing-telegram-alerts"
      className="relative overflow-hidden bg-white py-16 md:py-24"
    >
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-10 lg:px-6 2xl:px-0">
        <div
          className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070908] py-8 text-white shadow-[0_22px_60px_rgba(0,0,0,0.5)] sm:py-10 lg:rounded-[32px] lg:py-12"
          style={{
            backgroundImage:
              "linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)",
            backgroundSize: "64px 64px"
          }}
        >
          <div className="relative mx-auto max-w-[1240px] px-4 sm:px-10 lg:px-16">
            <div className="absolute inset-y-0 left-0 hidden w-px bg-white/[0.08] lg:block" />
            <div className="absolute inset-y-0 right-0 hidden w-px bg-white/[0.08] lg:block" />

            <div className="overflow-hidden border-y border-white/[0.08] bg-[#070908]/80">
              <div className="grid lg:grid-cols-[0.78fr_1.22fr]">
                <div className="contents lg:flex lg:flex-col lg:justify-between lg:border-r lg:border-white/[0.08]">
                  <div className="order-1 px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9 lg:order-none lg:p-8 xl:p-10">
                    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-400">
                      {copy.previews.alert.channel}
                    </p>
                    <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.1]">
                      {copy.alertsTitle}
                    </h2>
                    <p className="mt-4 max-w-[54ch] break-keep text-pretty text-sm leading-7 text-zinc-400 sm:text-base">{copy.alertsSubtitle}</p>
                  </div>

                  <Link
                    href="/account"
                    className="focus-ring mx-5 mb-7 hidden min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 sm:mx-8 sm:mb-9 lg:inline-flex lg:self-start xl:mx-10"
                  >
                    <BellRinging size={16} weight="bold" />
                    {copy.alertsCta}
                  </Link>
                </div>

                <div className="order-2 border-t border-white/[0.08] p-4 sm:p-6 lg:border-t-0 lg:p-8">
                  <AlertPreview copy={copy.previews.alert} />
                </div>
              </div>

              <div className="grid border-t border-white/[0.08] sm:grid-cols-3">
                {copy.alertCards.map((card, index) => (
                  <article
                    key={card.title}
                    className="grid grid-cols-[28px_1fr] gap-3 border-b border-white/[0.08] px-5 py-5 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-6 sm:last:border-r-0"
                  >
                    <span className="grid size-7 place-items-center rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300">
                      <Check size={13} weight="bold" />
                    </span>
                    <div className="min-w-0 sm:mt-3">
                      <p className="font-mono text-[10px] text-emerald-300/75">0{index + 1} · {copy.alertRuleLabel}</p>
                      <h3 className="mt-1.5 text-sm font-bold text-white break-keep">{card.title}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-zinc-500 break-keep">{card.body}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="border-t border-white/[0.08] p-5 sm:p-6 lg:hidden">
                <Link
                  href="/account"
                  className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 sm:w-fit"
                >
                  <BellRinging size={16} weight="bold" />
                  {copy.alertsCta}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
