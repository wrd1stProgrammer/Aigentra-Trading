"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { 
  ChartLineUp, SignIn, Translate, Trophy, UserCircle,
  X, User, Users, FileText, InstagramLogo, ThreadsLogo, ChatCircleText, SignOut, Ticket, ShieldCheck
} from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { useSubscriberAccess } from "@/components/use-subscriber-access";
import { Locale, LOCALE_OPTIONS } from "@/lib/i18n";

const links = [
  { href: "/", key: "nav.home", icon: ChartLineUp },
  { href: "/leaderboard", key: "nav.leaderboard", icon: Trophy },
  { href: "/consensus", key: "nav.consensus", icon: Users },
  { href: "/account", key: "nav.account", icon: UserCircle },
  { href: "/login", key: "nav.login", icon: SignIn }
];

const APP_SHELL_CONTAINER_CLASS = "mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-10 2xl:px-14";

function CandleNotch({
  position,
  theme = "dark",
  pulse = false
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  theme?: "dark" | "light";
  pulse?: boolean;
}) {
  const verticalClass = position.startsWith("top") ? "top-2.5" : "bottom-2.5";
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
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useAppContext();
  const { data: session } = useSession();
  const accessQuery = useSubscriberAccess();
  const access = accessQuery.data;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  const currentLanguage = LOCALE_OPTIONS.find((option) => option.locale === locale) ?? LOCALE_OPTIONS[0];
  const userName = session?.user?.name || t("shell.user");
  const avatarText = userName.length > 2 ? userName.slice(-2) : userName;

  const isLandingPage = pathname === "/";
  const isLoginPage = pathname === "/login";
  const isTermsPage = pathname === "/terms";
  const isDisclaimerPage = pathname === "/disclaimer";
  const isLegalNoticesPage = pathname === "/legal-notices";
  const isPrivacyPolicyPage = pathname === "/privacy-policy";
  const isRiskDisclosurePage = pathname === "/risk-disclosure";
  const showAppChrome =
    !isLandingPage &&
    !isLoginPage &&
    !isTermsPage &&
    !isDisclaimerPage &&
    !isLegalNoticesPage &&
    !isPrivacyPolicyPage &&
    !isRiskDisclosurePage;
  const shellLinks = links.filter((link) => {
    if (link.href === "/login") return !session?.user;
    if (link.href === "/account") return Boolean(session?.user);
    return true;
  });
  const currentLink = shellLinks.find((link) => link.href === "/" ? pathname === "/" : pathname.startsWith(link.href));

  return (
    <div className="min-h-[100dvh] transition-colors">
      {showAppChrome ? (
          <header
            className="sticky top-0 z-20 border-b border-white/10 bg-[#070908]/90 backdrop-blur-xl text-white relative overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(180deg, rgba(16,185,129,0.08), transparent 72%)",
              backgroundSize: "64px 64px, 64px 64px, auto"
            }}
          >
            <div className={`${APP_SHELL_CONTAINER_CLASS} relative flex min-w-0 items-center justify-between gap-2 py-2.5 md:py-3 sm:gap-3`}>
              {/* Vertical grid lines aligning with the page grids */}
              <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
              <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />

              {/* Corner Markers / Notches */}
              <CandleNotch position="top-left" theme="dark" pulse />
              <CandleNotch position="top-right" theme="dark" pulse />
              <CandleNotch position="bottom-left" theme="dark" pulse />
              <CandleNotch position="bottom-right" theme="dark" pulse />

              <Link href="/" className="focus-ring flex min-w-0 items-center gap-3 rounded-lg hover:opacity-90 transition z-10">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-emerald-400/35 bg-emerald-400/10 font-mono text-xs text-emerald-300">
                  AT
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold tracking-tight text-white">Aigentra Trading</span>
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500 md:hidden">
                    {currentLink ? navLabel(locale, currentLink.key, t) : t("common.paperOnly")}
                  </span>
                  <span className="hidden text-[10px] font-mono uppercase tracking-wider text-zinc-500 md:block">{t("common.paperOnly")}</span>
                </span>
              </Link>
              <nav className="z-10 hidden min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md scrollbar-none md:flex">
                {shellLinks
                  .map((link) => {
                    const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-label={navLabel(locale, link.key, t)}
                        className={`focus-ring inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition md:px-4 ${
                          active
                            ? "bg-white text-zinc-950 shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Icon size={14} weight={active ? "bold" : "regular"} />
                        <span className="hidden md:inline">{navLabel(locale, link.key, t)}</span>
                      </Link>
                    );
                  })}
              </nav>
              <div className="flex items-center gap-2 z-10">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsLanguageMenuOpen((open) => !open)}
                    className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-zinc-200 transition hover:bg-white/[0.08] sm:px-4"
                    aria-label={t("common.language")}
                    aria-expanded={isLanguageMenuOpen}
                  >
                    <Translate size={14} />
                    <span>{currentLanguage.shortLabel}</span>
                  </button>
                  {isLanguageMenuOpen ? (
                    <div className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-lg border border-white/10 bg-[#101312] p-1.5 shadow-2xl">
                      {LOCALE_OPTIONS.map((option) => (
                        <button
                          key={option.locale}
                          type="button"
                          onClick={() => {
                            setLocale(option.locale);
                            setIsLanguageMenuOpen(false);
                          }}
                          className={`focus-ring flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-semibold transition ${
                            option.locale === locale ? "bg-emerald-400/12 text-emerald-200" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span>{option.label}</span>
                          <span className="font-mono text-[10px] text-zinc-500">{option.shortLabel}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                {session?.user ? (
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="focus-ring shrink-0 size-9 rounded-full border border-emerald-400/25 bg-emerald-400/12 flex items-center justify-center text-xs font-bold text-emerald-100 hover:scale-105 transition active:scale-[0.96] overflow-hidden"
                    aria-label={t("shell.accountMenu")}
                  >
                    {session.user.image ? (
                      <img src={session.user.image} alt={avatarText} width={36} height={36} referrerPolicy="no-referrer" className="size-full object-cover" />
                    ) : (
                      avatarText
                    )}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="focus-ring inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] transition hover:text-white"
                    aria-label={t("nav.login")}
                  >
                    <SignIn size={14} />
                  </Link>
                )}
              </div>
            </div>
          </header>
      ) : null}
      <main className={isLoginPage ? "py-0 px-0 w-full max-w-none" : (isLandingPage ? "py-0" : `${APP_SHELL_CONTAINER_CLASS} py-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:py-7 md:pb-7`)}>{children}</main>

      {showAppChrome ? (
        <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-2xl border border-white/10 bg-[#0a0d0c]/94 p-1.5 text-white shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl md:hidden">
          <div className="grid grid-cols-4 gap-1">
            {shellLinks.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={navLabel(locale, link.key, t)}
                  className={`focus-ring flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition ${
                    active
                      ? "bg-white text-zinc-950 shadow-sm"
                      : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <Icon size={17} weight={active ? "bold" : "regular"} />
                  <span className="max-w-full truncate">{navLabel(locale, link.key, t)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      {/* Profile Drawer Backdrop */}
      <div 
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[4px] transition-opacity duration-300 ${
          isDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`} 
        onClick={() => setIsDrawerOpen(false)} 
      />

      {/* Profile Drawer Panel */}
      <div 
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-[390px] bg-[#0c0d0d] border-l border-white/[0.06] shadow-2xl transition-transform duration-300 ease-in-out will-change-transform p-5 sm:p-6 flex flex-col justify-between ${
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full justify-between">
          <div>
            {/* Header / Profile Card */}
            <div className="flex items-start justify-between border-b border-white/[0.05] pb-6 relative">
              <div className="flex items-center gap-3.5">
                <div className="shrink-0 size-12 rounded-full border border-emerald-400/25 bg-emerald-400/12 flex items-center justify-center text-xs font-bold text-emerald-100 shadow-lg overflow-hidden">
                  {session?.user?.image ? (
                    <img src={session.user.image} alt={avatarText} width={48} height={48} referrerPolicy="no-referrer" className="size-full object-cover" />
                  ) : (
                    avatarText
                  )}
                </div>
                <div>
                  <h3 className="text-white text-sm font-bold tracking-tight">{session?.user?.name || t("shell.user")}</h3>
                  <p className="text-zinc-400 text-[10px] mt-0.5 font-mono break-all leading-none">{session?.user?.email || ""}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-block text-zinc-500 text-[9px] font-mono border border-white/10 rounded px-1.5 py-0.5 bg-white/[0.02] tracking-wider leading-none">
                      GOOGLE
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDrawerOpen(false);
                        void signOut();
                      }}
                      className="focus-ring text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 transition cursor-pointer leading-none"
                    >
                      <SignOut size={10} weight="bold" />
                      <span>{t("shell.signOut")}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button 
                type="button" 
                onClick={() => setIsDrawerOpen(false)}
                className="text-zinc-400 hover:text-white transition duration-200 focus-ring rounded p-1"
                aria-label={t("shell.closeMenu")}
              >
                <X size={16} />
              </button>
            </div>

            {session?.user ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${
                    access?.isSubscribed
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                  }`}>
                    {access?.isSubscribed ? <ShieldCheck size={18} weight="bold" /> : <Ticket size={18} weight="bold" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">
                      {access?.isSubscribed ? t("access.proActive") : t("access.drawerCouponLabel")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400 text-pretty">
                      {access?.isSubscribed ? t("access.proDetail") : t("access.drawerCouponDetail")}
                    </p>
                    {!access?.isSubscribed ? (
                      <p className="mt-3 font-mono text-lg font-semibold text-emerald-200">
                        {access?.couponsRemaining ?? 0}/{access?.couponLimit ?? 3}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Menu List */}
            <div className="py-8 flex flex-col gap-5">
              <Link 
                href="/account"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-4 text-zinc-300 hover:text-white text-sm font-semibold transition py-1 focus-ring rounded"
              >
                <User size={18} className="text-zinc-400" />
                <span>{t("shell.myPage")}</span>
              </Link>
              <Link 
                href="/traders"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-4 text-zinc-300 hover:text-white text-sm font-semibold transition py-1 focus-ring rounded"
              >
                <Users size={18} className="text-zinc-400" />
                <span>{t("shell.team")}</span>
              </Link>
              <Link 
                href="/tests"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-4 text-zinc-300 hover:text-white text-sm font-semibold transition py-1 focus-ring rounded"
              >
                <FileText size={18} className="text-zinc-400" />
                <span>{t("shell.guide")}</span>
              </Link>
            </div>
          </div>

          {/* Social Links Panel at bottom */}
          <div className="border-t border-white/[0.05] pt-6">
            <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-3.5">
              {t("shell.social")}
            </h4>
            <div className="flex flex-col gap-2">
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-0.5 focus-ring rounded"
              >
                <InstagramLogo size={16} className="text-zinc-500" />
                <span>{t("shell.instagram")}</span>
              </a>
              <a 
                href="https://threads.net" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-0.5 focus-ring rounded"
              >
                <ThreadsLogo size={16} className="text-zinc-500" />
                <span>{t("shell.threads")}</span>
              </a>
              <a 
                href="https://kakao.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-0.5 focus-ring rounded"
              >
                <ChatCircleText size={16} className="text-zinc-500" />
                <span>{t("shell.community")}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function navLabel(_locale: Locale, key: string, t: (key: string) => string) {
  const translated = t(key);
  if (translated !== key) return translated;
  return key;
}
