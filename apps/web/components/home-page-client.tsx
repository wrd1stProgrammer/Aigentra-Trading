"use client";

import Link from "next/link";
import { ArrowRight, BellRinging, Check, Star, TelegramLogo, Translate, Trophy } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { AgentWorkflowPreview, AlertPreview, LandingFooter, PricingCard, VideoFrame } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";

function CandleNotch({
  position,
  theme = "dark",
  pulse = false,
  flush = false
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  theme?: "dark" | "light";
  pulse?: boolean;
  flush?: boolean;
}) {
  const verticalClass = flush
    ? (position.startsWith("top") ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2")
    : (position.startsWith("top") ? "top-2.5" : "bottom-2.5");
  const horizontalClass = position.endsWith("left") ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2";
  const bodyColor = theme === "dark" ? "bg-emerald-500" : "bg-emerald-600";
  const wickColor = theme === "dark" ? "bg-emerald-500/60" : "bg-emerald-600/60";
  const pulseClass = pulse ? "animate-pulse" : "";

  return (
    <div className={`absolute ${verticalClass} ${horizontalClass} hidden lg:flex flex-col items-center justify-center w-[8px] h-[24px] pointer-events-none z-20 ${pulseClass}`}>
      {/* Wick */}
      <div className={`w-[1px] h-[24px] ${wickColor}`} />
      {/* Body */}
      <div className={`absolute w-[6px] h-[12px] ${bodyColor} rounded-[1px] shadow-[0_0_8px_rgba(16,185,129,0.3)]`} />
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";

function ScrollReveal({
  children,
  className = "",
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -50px 0px"
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`transform transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function HomePageClient() {
  const { locale, setLocale, t } = useAppContext();
  const copy = landingCopy(locale);

  return (
    <div className="landing-page bg-white text-zinc-950 antialiased overflow-x-hidden">
      <section
        data-testid="landing-hero"
        className="relative overflow-hidden bg-[#070908] text-white pt-6 pb-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px), radial-gradient(circle at 50% 25%, rgba(16,185,129,0.15), transparent 40%)",
          backgroundSize: "128px 128px, 128px 128px, auto"
        }}
      >
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16 pb-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="dark" pulse />
          <CandleNotch position="top-right" theme="dark" pulse />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-5 pt-4">
            <Link href="/" className="focus-ring flex items-center gap-3 rounded-lg hover:opacity-90 transition">
              <span className="grid size-9 place-items-center rounded-lg border border-emerald-400/35 bg-emerald-400/10 font-mono text-xs text-emerald-300">AT</span>
              <span className="text-lg font-bold tracking-tight">Aigentra Trading</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-6 font-mono text-sm text-zinc-300 lg:flex">
                <Link href="/leaderboard" className="hover:text-white transition">Leaderboard</Link>
                <Link href="/account" className="hover:text-white transition">Alerts</Link>
                <Link href="/login" className="text-white hover:text-emerald-300 transition">Get started now →</Link>
              </div>
              <button
                type="button"
                onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 font-mono text-xs text-zinc-200 hover:bg-white/[0.08] transition"
                aria-label={t("common.language")}
              >
                <Translate size={14} />
                {locale.toUpperCase()}
              </button>
            </div>
          </div>

          {/* Hero Content */}
          <div className="mx-auto flex max-w-[880px] flex-col items-center py-12 text-center md:py-20">
            <div className="mb-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-emerald-400 animate-fade-in-up">
              <span>[</span>
              <span>{copy.heroEyebrow}</span>
              <span>]</span>
            </div>
            <h1 className="max-w-4xl text-balance text-3xl font-bold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.75rem] lg:leading-[1.1] break-keep animate-fade-in-up">
              {copy.heroTitle}
            </h1>
            <p className="mt-6 max-w-[62ch] text-pretty text-base sm:text-lg leading-relaxed text-zinc-400 break-keep animate-fade-in-up animation-delay-100">
              {copy.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in-up animation-delay-300">
              <Link href="/leaderboard" className="focus-ring inline-flex items-center justify-center gap-2.5 rounded-full bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-neon-emerald hover:bg-emerald-400 active:scale-[0.99] transition duration-300">
                <Trophy size={18} weight="bold" />
                {copy.primaryCta}
              </Link>
              <p className="hidden max-w-[56ch] text-xs text-zinc-500 sm:block break-keep">{copy.videoSubtitle}</p>
            </div>
          </div>

          <div data-testid="landing-video-placeholder" className="relative mx-auto max-w-[1100px] animate-fade-in-up animation-delay-500">
            <VideoFrame title={copy.videoTitle} subtitle={copy.videoSubtitle} />
          </div>
        </div>
      </section>

      {/* Connection Divider Block */}
      <div className="relative bg-[#070908]">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16 h-12">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
          
          {/* Connector Box Border (Horizontal lines) */}
          <div className="absolute inset-x-0 top-0 border-t border-white/10" />
          <div className="absolute inset-x-0 bottom-0 border-b border-white/10" />

          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="dark" pulse flush />
          <CandleNotch position="top-right" theme="dark" pulse flush />
          <CandleNotch position="bottom-left" theme="dark" pulse flush />
          <CandleNotch position="bottom-right" theme="dark" pulse flush />
        </div>
      </div>

      <section data-testid="landing-agent-system" className="relative overflow-hidden bg-[#070908] pt-0 pb-24 text-white">
          <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16 pt-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="bottom-left" theme="dark" pulse />
          <CandleNotch position="bottom-right" theme="dark" pulse />

          <ScrollReveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">[ AI AGENT MONITORING ]</p>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl break-keep">{copy.agentSystemTitle}</h2>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-zinc-400 break-keep">{copy.agentSystemSubtitle}</p>
            </div>
          </ScrollReveal>

          <div className="mt-14 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <ScrollReveal className="w-full">
              <AgentWorkflowPreview />
            </ScrollReveal>
            <div className="grid gap-4">
              {copy.agentCards.map((card, index) => (
                <ScrollReveal key={card.title} delay={index * 100}>
                  <article className="rounded-[22px] border border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] hover:border-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300">
                    <h3 className="text-lg font-bold text-white tracking-tight break-keep">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-zinc-400 break-keep">{card.body}</p>
                  </article>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section data-testid="landing-get-started" className="relative overflow-hidden bg-white py-24 text-zinc-950 border-y border-zinc-200">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-zinc-200 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-zinc-200 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="light" />
          <CandleNotch position="top-right" theme="light" />
          <CandleNotch position="bottom-left" theme="light" />
          <CandleNotch position="bottom-right" theme="light" />

          <ScrollReveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">[ 3 SIMPLE STEPS ]</p>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl md:text-5xl break-keep">{copy.getStartedTitle}</h2>
              <p className="mx-auto mt-5 max-w-[64ch] text-base sm:text-lg leading-relaxed text-zinc-600 break-keep">{copy.getStartedSubtitle}</p>
              <Link href="/leaderboard" className="focus-ring mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-sm font-bold text-white shadow-neon-emerald hover:bg-emerald-400 transition duration-300">
                {copy.getStartedCta}
                <ArrowRight size={16} weight="bold" />
              </Link>
              <div data-testid="landing-second-video" className="mt-14 text-left">
                <VideoFrame title={copy.secondVideoTitle} subtitle={copy.alertsSubtitle} compact />
              </div>
            </div>
          </ScrollReveal>

          <div className="mx-auto mt-14 grid max-w-5xl gap-8 md:grid-cols-3">
            {copy.steps.map((step, index) => (
              <ScrollReveal key={step.title} delay={index * 120}>
                <article className="grid grid-cols-[48px_1fr] gap-4 text-left hover:-translate-y-0.5 transition duration-300">
                  <span className="grid size-10 place-items-center rounded-full bg-zinc-50 border border-zinc-200 text-emerald-600 font-mono font-bold shadow-sm">{index + 1}</span>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-zinc-950 break-keep">{step.title}</h3>
                    <p className="mt-2.5 text-sm leading-6 text-zinc-600 break-keep">{step.body}</p>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section data-testid="landing-telegram-alerts" className="relative overflow-hidden bg-white py-24 text-zinc-950">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-zinc-200 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-zinc-200 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="light" />
          <CandleNotch position="top-right" theme="light" />
          <CandleNotch position="bottom-left" theme="light" />
          <CandleNotch position="bottom-right" theme="light" />

          <ScrollReveal>
            <div className="mx-auto grid gap-8 rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-[#131615] to-[#070908] p-8 text-white shadow-[0_22px_60px_rgba(0,0,0,0.5)] lg:grid-cols-[0.82fr_1.18fr] hover:border-emerald-500/10 transition duration-300">
              <div className="flex flex-col justify-between py-2">
                <div>
                  <span className="grid size-12 place-items-center rounded-xl bg-sky-500 text-white shadow-[0_0_20px_rgba(14,165,233,0.35)]">
                    <TelegramLogo size={26} weight="fill" />
                  </span>
                  <h2 className="mt-6 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-[2.6rem] lg:leading-[1.1] break-keep">{copy.alertsTitle}</h2>
                  <p className="mt-4 text-sm leading-6 text-zinc-400 break-keep">{copy.alertsSubtitle}</p>
                </div>
                <Link href="/account" className="focus-ring mt-8 inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] px-6 py-3.5 text-sm font-bold text-white transition self-start">
                  <BellRinging size={16} />
                  {copy.alertsCta}
                </Link>
              </div>
              <div className="grid gap-4 md:grid-cols-[0.8fr_1fr]">
                <AlertPreview />
                <div className="grid gap-4">
                  {copy.alertCards.map((card, idx) => (
                    <ScrollReveal key={card.title} delay={idx * 100}>
                      <article className="rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-5 hover:border-emerald-500/20 hover:-translate-y-0.5 transition duration-300">
                        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
                          <Check size={12} weight="bold" />
                        </span>
                        <h3 className="mt-3 text-base font-bold text-white tracking-tight break-keep">{card.title}</h3>
                        <p className="mt-2 text-xs leading-5 text-zinc-400 break-keep">{card.body}</p>
                      </article>
                    </ScrollReveal>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section data-testid="landing-pricing" className="relative overflow-hidden bg-[#070908] py-24 text-white">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="dark" pulse />
          <CandleNotch position="top-right" theme="dark" pulse />
          <CandleNotch position="bottom-left" theme="dark" pulse />
          <CandleNotch position="bottom-right" theme="dark" pulse />

          <ScrollReveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">[ PRICING ]</p>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl break-keep">{copy.pricingTitle}</h2>
              <p className="mx-auto mt-5 max-w-[64ch] text-base sm:text-lg leading-relaxed text-zinc-400 break-keep">{copy.pricingSubtitle}</p>
            </div>
          </ScrollReveal>

          <div className="mx-auto mt-14 grid max-w-[1080px] gap-6 lg:grid-cols-2">
            {copy.pricingPlans.map((plan, index) => (
              <ScrollReveal key={plan.name} className="w-full" delay={index * 150}>
                <PricingCard plan={plan} featured={index === 1} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white py-24 text-zinc-950 border-t border-zinc-200">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-zinc-200 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-zinc-200 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="light" />
          <CandleNotch position="top-right" theme="light" />
          <CandleNotch position="bottom-left" theme="light" />
          <CandleNotch position="bottom-right" theme="light" />

          <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr]">
            <ScrollReveal>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">[ TESTIMONIALS ]</p>
                <h2 className="mt-5 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl break-keep">{copy.testimonialsTitle}</h2>
                <div className="mt-10 grid gap-5 md:grid-cols-2">
                  {copy.testimonials.map((item, idx) => (
                    <ScrollReveal key={item.author} delay={idx * 100}>
                      <article className="rounded-[20px] border border-zinc-200 bg-zinc-50/50 p-6 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all duration-300">
                        <p className="text-sm leading-6 text-zinc-700 break-keep">"{item.quote}"</p>
                        <div className="mt-6 flex items-center justify-between border-t border-zinc-200/60 pt-4">
                          <div>
                            <p className="font-bold text-zinc-900 text-sm">{item.author}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{item.role}</p>
                          </div>
                        </div>
                      </article>
                    </ScrollReveal>
                  ))}
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div data-testid="landing-faq">
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">[ FAQ ]</p>
                <h2 className="mt-5 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl break-keep">{copy.faqTitle}</h2>
                <div className="mt-9 divide-y divide-zinc-200 border-t border-zinc-200">
                  {copy.faqs.map((faq) => (
                    <details key={faq.question} className="group py-5 transition-all">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-zinc-900 select-none hover:text-emerald-600 transition-colors">
                        <span className="break-keep">{faq.question}</span>
                        <span className="text-zinc-400 group-open:rotate-45 transition-transform duration-200 text-xl font-light">+</span>
                      </summary>
                      <p className="mt-3 text-sm leading-6 text-zinc-600 break-keep pr-8 pl-1">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section
        data-testid="landing-about"
        className="relative overflow-hidden bg-[#070908] py-24 text-center text-white"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)",
          backgroundSize: "64px 64px"
        }}
      >
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="dark" pulse />
          <CandleNotch position="top-right" theme="dark" pulse />
          <CandleNotch position="bottom-left" theme="dark" pulse />
          <CandleNotch position="bottom-right" theme="dark" pulse />

          <ScrollReveal>
            <div className="mx-auto max-w-3xl">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">[ JOIN YOUR AI TRADING SOFTWARE ]</p>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl break-keep">{copy.aboutTitle}</h2>
              <p className="mt-6 text-sm sm:text-base leading-7 text-zinc-400 break-keep">{copy.aboutBody}</p>
              <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
                {copy.aboutPoints.map((point) => (
                  <p key={point} className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-zinc-300 font-mono break-keep">{point}</p>
                ))}
              </div>
              <Link href="/leaderboard" className="focus-ring mt-10 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-sm font-bold text-white shadow-neon-emerald hover:bg-emerald-400 transition duration-300">
                {copy.primaryCta}
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <footer data-testid="landing-footer" className="relative overflow-hidden bg-white py-16 text-zinc-950 border-t border-zinc-200">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-zinc-200 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-zinc-200 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="light" />
          <CandleNotch position="top-right" theme="light" />
          <CandleNotch position="bottom-left" theme="light" />
          <CandleNotch position="bottom-right" theme="light" />

          <LandingFooter copy={copy} />
        </div>
      </footer>
    </div>
  );
}

