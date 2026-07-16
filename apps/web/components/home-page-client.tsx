"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CaretDown, Check, SignIn, SignOut, Translate, Trophy, UserCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { BlogPreviewSection } from "@/components/blog/blog-preview-section";
import { LearnPreviewSection } from "@/components/learn/learn-preview-section";
import { LandingTelegramAlertsSection } from "@/components/landing-telegram-alerts-section";
import { useAppContext } from "@/components/app-provider";
import { PipelinePreview, PositionManagementPreview, ConsensusPreview, TradePlanPreview, LandingFooter, PricingCard, VideoFrame } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";
import { LOCALE_OPTIONS } from "@/lib/i18n";
import { homePathForLocale } from "@/lib/locale-routing";

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
        isVisible ? "translate-y-0" : "translate-y-3"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function formatAboutText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function HomePageClient() {
  const { locale, setLocale, t } = useAppContext();
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const copy = landingCopy(locale);
  const [activeFaqIndex, setActiveFaqIndex] = useState<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const currentLanguage = LOCALE_OPTIONS.find((option) => option.locale === locale) ?? LOCALE_OPTIONS[0];
  const userName = session?.user?.name || t("shell.user");
  const avatarText = userName.length > 2 ? userName.slice(-2) : userName;

  return (
    <div className="landing-page bg-white text-zinc-950 antialiased overflow-x-hidden">
      <section
        data-testid="landing-hero"
        className="relative overflow-hidden bg-[#070908] text-white pt-6 pb-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(180deg, rgba(16,185,129,0.14), transparent 44%)",
          backgroundSize: "128px 128px, 128px 128px, auto"
        }}
      >
        <div className="relative mx-auto max-w-[1240px] px-4 pb-14 sm:px-10 sm:pb-16 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />

          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5 pt-4">
            <Link href={homePathForLocale(locale)} className="focus-ring flex items-center gap-3 rounded-lg hover:opacity-90 transition">
              <BrandMark priority />
              <span className="text-base font-bold tracking-tight sm:text-lg">Aigentra Trading</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <Link href="/leaderboard" className="hidden text-white hover:text-emerald-300 font-mono text-sm font-semibold transition shrink-0 sm:inline">
                {copy.headerCta} →
              </Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((open) => !open)}
                  className="focus-ring inline-flex size-10 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/[0.04] text-xs font-bold text-zinc-100 transition hover:bg-white/[0.08] select-none"
                  aria-label={t("shell.accountMenu")}
                  aria-expanded={isProfileMenuOpen}
                >
                  {session?.user?.image ? (
                    <img src={session.user.image} alt={avatarText} width={40} height={40} referrerPolicy="no-referrer" className="size-full object-cover" />
                  ) : session?.user ? (
                    avatarText
                  ) : (
                    <UserCircle size={18} weight="bold" />
                  )}
                </button>
                {isProfileMenuOpen ? (
                  <div
                    role="menu"
                    aria-label={t("shell.accountMenu")}
                    className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#101312] p-3 text-left shadow-2xl"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{session?.user?.name || t("shell.user")}</p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{session?.user?.email || t("nav.login")}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">{currentLanguage.shortLabel}</span>
                    </div>
                    <div className="mt-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-300">
                        <Translate size={14} className="text-emerald-300" />
                        <span>{t("common.language")}</span>
                      </div>
                      <div role="radiogroup" aria-label={t("common.language")} className="grid grid-cols-1 gap-1.5">
                        {LOCALE_OPTIONS.map((option) => (
                          <button
                            key={option.locale}
                            type="button"
                            role="radio"
                            aria-checked={option.locale === locale}
                            onClick={() => {
                              setLocale(option.locale);
                              const nextPath = homePathForLocale(option.locale);
                              if (pathname !== nextPath) router.replace(nextPath);
                            }}
                            className={`focus-ring flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition ${
                              option.locale === locale
                                ? "bg-emerald-400/12 text-emerald-200"
                                : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                            }`}
                          >
                            <span>{option.label}</span>
                            <span className="font-mono text-[10px] text-zinc-500">{option.shortLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 border-t border-white/10 pt-3">
                      {session?.user ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            void signOut();
                          }}
                          className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"
                        >
                          <SignOut size={14} weight="bold" />
                          <span>{t("shell.signOut")}</span>
                        </button>
                      ) : (
                        <Link
                          href="/login"
                          role="menuitem"
                          onClick={() => setIsProfileMenuOpen(false)}
                          className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-400/10"
                        >
                          <SignIn size={14} weight="bold" />
                          <span>{t("nav.login")}</span>
                        </Link>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Hero Content */}
          <div className="mx-auto flex max-w-[880px] flex-col items-center py-12 text-center md:py-20">
            <div className="mb-6 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-emerald-400 animate-fade-in-up">
              <span>[</span>
              <span>{copy.heroEyebrow}</span>
              <span>]</span>
            </div>
            <h1 className="max-w-4xl text-balance text-3xl font-bold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-[3.75rem] lg:leading-[1.1] animate-fade-in-up">
              {copy.heroTitle}
            </h1>
            <p className="mt-6 max-w-[62ch] text-pretty text-base sm:text-lg leading-relaxed text-zinc-400 animate-fade-in-up animation-delay-100">
              {copy.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in-up animation-delay-300">
              <Link href="/leaderboard" className="focus-ring inline-flex items-center justify-center gap-2.5 rounded-full bg-emerald-500 px-8 py-4 text-base font-bold text-white shadow-neon-emerald hover:bg-emerald-400 active:scale-[0.99] transition duration-300">
                <Trophy size={18} weight="bold" />
                {copy.primaryCta}
              </Link>
              <p className="max-w-[64ch] text-pretty font-mono text-[11px] leading-5 text-zinc-500 sm:text-xs">{copy.heroTrustLine}</p>
            </div>
          </div>

          <div
            data-testid="landing-focus-rail"
            className="mx-auto mb-10 grid max-w-[1040px] overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.025] sm:grid-cols-3"
          >
            {copy.focusPoints.map((point, index) => (
              <article
                key={point.title}
                className="grid grid-cols-[32px_1fr] gap-3 border-b border-white/[0.08] px-4 py-4 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-5 sm:py-5 sm:last:border-r-0"
              >
                <span className="font-mono text-[10px] font-bold text-emerald-400">0{index + 1}</span>
                <div className="min-w-0 sm:mt-3">
                  <h2 className="text-sm font-bold tracking-tight text-white sm:text-base">{point.title}</h2>
                  <p className="mt-1.5 text-pretty text-xs leading-5 text-zinc-400 sm:mt-2">{point.body}</p>
                </div>
              </article>
            ))}
          </div>

          <div data-testid="landing-product-proof" className="relative mx-auto w-full max-w-[1240px] animate-fade-in-up animation-delay-500">
            <div data-testid="landing-video-placeholder">
              <VideoFrame
                title={copy.videoTitle}
                src="/landing/aigentra1-home.mp4"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Connection Divider Block */}
      <div className="relative bg-[#070908]">
        <div className="relative mx-auto h-8 max-w-[1240px] px-4 sm:h-12 sm:px-10 lg:px-16">
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
          <div className="relative mx-auto max-w-[1240px] px-4 pt-14 sm:px-10 sm:pt-16 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="bottom-left" theme="dark" pulse />
          <CandleNotch position="bottom-right" theme="dark" pulse />

          <div className="mx-auto max-w-3xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">{copy.agentSystemEyebrow}</p>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">{copy.agentSystemTitle}</h2>
            <p className="mt-5 text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">{copy.agentSystemSubtitle}</p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-5">
            {/* Cell 1: Pipeline (Col span 7) */}
            <div className="md:col-span-7 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141615] to-[#0a0b0a] p-4 sm:p-5 md:p-6 flex flex-col justify-between hover:border-white/15 hover:from-[#171a19] hover:to-[#0d0e0d] transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
              <div className="flex min-h-[210px] w-full flex-1 items-center justify-center sm:min-h-[250px]">
                <PipelinePreview copy={copy.previews.pipeline} />
              </div>
              <div className="mt-5 border-t border-white/5 pt-4">
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400 font-bold">{copy.agentCardKickers[0]}</span>
                <h3 className="text-lg font-bold text-white tracking-tight mt-1.5 break-keep">{copy.agentCards[0].title}</h3>
                <p className="mt-2.5 hidden text-sm leading-6 text-zinc-400 break-keep sm:block">{copy.agentCards[0].body}</p>
              </div>
            </div>

            {/* Cell 2: Position Risk (Col span 5) */}
            <div className="md:col-span-5 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141615] to-[#0a0b0a] p-4 sm:p-5 md:p-6 flex flex-col justify-between hover:border-white/15 hover:from-[#171a19] hover:to-[#0d0e0d] transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
              <div className="flex min-h-[210px] w-full flex-1 items-center justify-center sm:min-h-[250px]">
                <PositionManagementPreview copy={copy.previews.position} />
              </div>
              <div className="mt-5 border-t border-white/5 pt-4">
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400 font-bold">{copy.agentCardKickers[1]}</span>
                <h3 className="text-lg font-bold text-white tracking-tight mt-1.5 break-keep">{copy.agentCards[1].title}</h3>
                <p className="mt-2.5 hidden text-sm leading-6 text-zinc-400 break-keep sm:block">{copy.agentCards[1].body}</p>
              </div>
            </div>

            {/* Cell 3: Consensus (Col span 6) */}
            <div className="md:col-span-6 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141615] to-[#0a0b0a] p-4 sm:p-5 md:p-6 flex flex-col justify-between hover:border-white/15 hover:from-[#171a19] hover:to-[#0d0e0d] transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
              <div className="flex min-h-[210px] w-full flex-1 items-center justify-center sm:min-h-[250px]">
                <ConsensusPreview copy={copy.previews.consensus} />
              </div>
              <div className="mt-5 border-t border-white/5 pt-4">
                <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400 font-bold">{copy.agentCardKickers[2]}</span>
                <h3 className="text-lg font-bold text-white tracking-tight mt-1.5 break-keep">{copy.agentCards[2].title}</h3>
                <p className="mt-2.5 hidden text-sm leading-6 text-zinc-400 break-keep sm:block">{copy.agentCards[2].body}</p>
              </div>
            </div>

            {/* Cell 4: Trade Plan (Col span 6 - Option 1 Emphasized) */}
            <div className="md:col-span-6 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#141615] to-[#0a0b0a] p-4 sm:p-5 md:p-6 flex flex-col justify-between hover:border-white/15 hover:from-[#171a19] hover:to-[#0d0e0d] transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
              <div className="flex min-h-[210px] w-full flex-1 items-center justify-center sm:min-h-[250px]">
                <TradePlanPreview copy={copy.previews.tradePlan} />
              </div>
              <div className="mt-5 border-t border-white/5 pt-4">
                <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400 font-bold">{copy.agentCardKickers[3]}</span>
                <h3 className="text-lg font-bold text-white tracking-tight mt-1.5 break-keep">{copy.agentCards[3].title}</h3>
                <p className="mt-2.5 hidden text-sm leading-6 text-zinc-400 break-keep sm:block">{copy.agentCards[3].body}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section data-testid="landing-get-started" className="relative overflow-hidden bg-white py-16 text-zinc-950 border-y border-zinc-200 md:py-24">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-10 lg:px-16">
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
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">{copy.getStartedEyebrow}</p>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">{copy.getStartedTitle}</h2>
              <p className="mx-auto mt-5 max-w-[64ch] text-pretty text-base leading-relaxed text-zinc-600 sm:text-lg">{copy.getStartedSubtitle}</p>
              <Link href="/consensus" className="focus-ring mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-sm font-bold text-white shadow-neon-emerald hover:bg-emerald-400 transition duration-300">
                {copy.getStartedCta}
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
            <div data-testid="landing-second-video" className="mx-auto mt-14 w-full max-w-[1240px] text-left">
              <VideoFrame
                title={copy.secondVideoTitle}
                src="/landing/aigentra2-home.mp4"
              />
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

      <LandingTelegramAlertsSection copy={copy} />

      <section id="pricing" data-testid="landing-pricing" className="relative scroll-mt-20 overflow-hidden bg-[#070908] py-16 text-white md:scroll-mt-24 md:py-24">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-10 lg:px-16">
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
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">{copy.pricingEyebrow}</p>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">{copy.pricingTitle}</h2>
              <p className="mx-auto mt-5 max-w-[64ch] text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">{copy.pricingSubtitle}</p>
            </div>
          </ScrollReveal>

          <div className="mx-auto mt-12 grid max-w-[920px] gap-6 md:grid-cols-2">
            <ScrollReveal className="w-full" delay={150}>
              <PricingCard plan={copy.pricingPlans[0]} featured={true} billingInterval="yearly" />
            </ScrollReveal>
            <ScrollReveal className="w-full" delay={300}>
              <PricingCard plan={copy.pricingPlans[0]} featured={false} billingInterval="monthly" />
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white py-16 text-zinc-950 border-t border-zinc-200 md:py-24">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-10 lg:px-16">
          {/* Vertical grid lines */}
          <div className="absolute inset-y-0 left-0 hidden w-px bg-zinc-200 lg:block" />
          <div className="absolute inset-y-0 right-0 hidden w-px bg-zinc-200 lg:block" />
          {/* Corner Markers / Notches */}
          <CandleNotch position="top-left" theme="light" />
          <CandleNotch position="top-right" theme="light" />
          <CandleNotch position="bottom-left" theme="light" />
          <CandleNotch position="bottom-right" theme="light" />

          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] items-start">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-600">{copy.faqEyebrow}</p>
              <h2 className="mt-5 text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl">
                {copy.faqTitle}
              </h2>
              <p className="mt-4 max-w-[34ch] text-pretty text-sm leading-6 text-zinc-600">
                {copy.faqSubtitle}
              </p>
              <Link
                href="/leaderboard"
                className="focus-ring mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 px-6 py-3.5 text-sm font-bold text-white shadow-neon-emerald transition duration-300"
              >
                {copy.faqCta}
              </Link>
            </div>

            <div data-testid="landing-faq" className="space-y-0 divide-y divide-zinc-200 border-t border-zinc-200">
              {copy.faqs.map((faq, index) => {
                const isOpen = activeFaqIndex === index;
                return (
                  <div key={faq.question} className="py-5">
                    <button
                      onClick={() => setActiveFaqIndex(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 text-left text-base font-bold text-zinc-900 select-none hover:text-emerald-600 transition-colors"
                    >
                      <span className="break-keep">{faq.question}</span>
                      <CaretDown
                        size={18}
                        className={`text-zinc-400 transition-transform duration-300 shrink-0 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${
                        isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="text-sm leading-6 text-zinc-600 break-keep pr-8 pl-1">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section data-testid="landing-about" className="relative bg-white py-16 border-t border-zinc-200 md:py-24">
        <div className="relative mx-auto max-w-[1440px] px-4 sm:px-10 lg:px-0">
          {/* The main dark card block */}
          <div
            className="relative rounded-2xl border border-white/[0.08] bg-[#070908] px-5 py-12 text-center overflow-hidden shadow-[0_22px_60px_rgba(0,0,0,0.5)] sm:px-12 sm:py-16 lg:rounded-[32px] lg:px-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(16,185,129,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.08) 1px, transparent 1px)",
              backgroundSize: "64px 64px"
            }}
          >
            {/* Absolute wicks (vertical green lines with notches) inside card */}
            <div className="absolute inset-y-0 left-[10%] hidden w-px bg-white/10 lg:block">
              <CandleNotch position="top-left" theme="dark" pulse flush />
              <CandleNotch position="bottom-left" theme="dark" pulse flush />
            </div>
            <div className="absolute inset-y-0 right-[10%] hidden w-px bg-white/10 lg:block">
              <CandleNotch position="top-right" theme="dark" pulse flush />
              <CandleNotch position="bottom-right" theme="dark" pulse flush />
            </div>

            <div className="relative mx-auto max-w-4xl z-10 flex flex-col items-center">
              <span className="inline-block text-emerald-400 font-mono text-[11px] sm:text-xs uppercase tracking-[0.15em] mb-4 select-none">
                {copy.aboutEyebrow}
              </span>
              <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-[2.6rem] lg:leading-[1.15]">
                {copy.aboutTitle}
              </h2>
              
              <div className="mt-8 w-full text-center">
                <p className="mx-auto max-w-[70ch] text-pretty text-sm leading-7 text-zinc-400 sm:text-base">
                  {formatAboutText(copy.aboutBody[0] ?? "")}
                </p>
                <ul className="mx-auto mt-7 grid max-w-3xl gap-2 text-left sm:grid-cols-3">
                  {copy.aboutPoints.map((point) => (
                    <li key={point} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-zinc-200">
                      <Check size={14} weight="bold" className="shrink-0 text-emerald-300" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href="/leaderboard"
                className="focus-ring mt-8 inline-flex items-center justify-center rounded-xl bg-[#10b981] hover:bg-[#059669] px-8 py-3.5 text-base font-bold text-white shadow-[0_0_24px_rgba(16,185,129,0.35)] hover:shadow-[0_0_30px_rgba(16,185,129,0.55)] transition-all duration-300 select-none"
              >
                {copy.aboutPrimaryCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <BlogPreviewSection />
      <LearnPreviewSection />

      <footer data-testid="landing-footer" className="relative overflow-hidden bg-white py-14 text-zinc-950 border-t border-zinc-200 sm:py-16">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-10 lg:px-16">
          <LandingFooter copy={copy} />
        </div>
      </footer>
    </div>
  );
}
