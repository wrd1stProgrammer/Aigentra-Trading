"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { 
  BookOpenText, ChartLineUp, Newspaper, SignIn, Trophy, UserCircle,
  X, Users, InstagramLogo, SignOut, Ticket, ShieldCheck
} from "@phosphor-icons/react";
import { BrandMark } from "@/components/brand-mark";
import { useAppContext } from "@/components/app-provider";
import { useSubscriberAccess } from "@/components/use-subscriber-access";
import { LOCALE_OPTIONS, type Locale } from "@/lib/i18n";
import {
  isShellLinkActive,
  shouldHandleShellNavigationClick,
  visibleShellPathname
} from "@/lib/app-shell-navigation";

const links = [
  { href: "/", key: "nav.home", icon: ChartLineUp },
  { href: "/leaderboard", key: "nav.leaderboard", icon: Trophy },
  { href: "/consensus", key: "nav.consensus", icon: Users },
  { href: "/account", key: "nav.account", icon: UserCircle },
  { href: "/login", key: "nav.login", icon: SignIn }
];

const APP_SHELL_CONTAINER_CLASS = "mx-auto w-full max-w-[1760px] px-2 sm:px-6 lg:px-10 2xl:px-14";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useAppContext();
  const { data: session } = useSession();
  const isAdminPage = pathname.startsWith("/admin");
  const accessQuery = useSubscriberAccess({ enabled: !isAdminPage });
  const access = accessQuery.data;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingPathname, setPendingPathname] = useState<string | null>(null);
  const visiblePath = visibleShellPathname(pathname, pendingPathname);

  useEffect(() => {
    setPendingPathname(null);
  }, [pathname]);

  const handleShellLinkClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!shouldHandleShellNavigationClick(event)) return;
    setPendingPathname(href);
  };

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
  const isBlogPage = pathname === "/blog" || pathname.startsWith("/blog/");
  const isLearnPage = pathname === "/learn" || pathname.startsWith("/learn/");
  const isMethodologyPage = pathname === "/methodology";
  const isTraderDetailPage = pathname.startsWith("/leaderboard/") && pathname !== "/leaderboard";
  const showAppChrome =
    !isLandingPage &&
    !isLoginPage &&
    !isTermsPage &&
    !isDisclaimerPage &&
    !isLegalNoticesPage &&
    !isPrivacyPolicyPage &&
    !isRiskDisclosurePage &&
    !isBlogPage &&
    !isLearnPage &&
    !isMethodologyPage;
  const shellLinks = links.filter((link) => {
    if (link.href === "/login") return !session?.user;
    if (link.href === "/account") return Boolean(session?.user);
    return true;
  });
  const currentLink = shellLinks.find((link) => isShellLinkActive(link.href, visiblePath));

  return (
    <div className="min-h-[100dvh] overflow-x-clip transition-colors">
      {showAppChrome ? (
          <header
            className={`sticky top-0 z-20 border-b border-white/10 bg-[#070908]/90 backdrop-blur-xl text-white relative overflow-hidden ${isTraderDetailPage ? "hidden md:block" : ""}`}
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

              <Link href="/" className="focus-ring flex min-w-0 items-center gap-3 rounded-lg hover:opacity-90 transition z-10">
                <BrandMark priority />
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
                    const active = isShellLinkActive(link.href, visiblePath);
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-label={navLabel(locale, link.key, t)}
                        onClick={(event) => handleShellLinkClick(event, link.href)}
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
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  className="focus-ring shrink-0 size-9 rounded-full border border-emerald-400/25 bg-emerald-400/12 flex items-center justify-center text-xs font-bold text-emerald-100 hover:scale-105 transition active:scale-[0.96] overflow-hidden"
                  aria-label={t("shell.accountMenu")}
                >
                  {session?.user?.image ? (
                    <img src={session.user.image} alt={avatarText} width={36} height={36} referrerPolicy="no-referrer" className="size-full object-cover" />
                  ) : session?.user ? (
                    avatarText
                  ) : (
                    <UserCircle size={18} weight="bold" />
                  )}
                </button>
              </div>
            </div>
          </header>
      ) : null}
      <main className={isLoginPage || isBlogPage || isLearnPage || isMethodologyPage ? "w-full max-w-none px-0 py-0" : (isLandingPage ? "py-0" : `${APP_SHELL_CONTAINER_CLASS} min-w-0 overflow-x-clip py-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:py-7 md:pb-7`)}>
        {isTraderDetailPage ? (
          <div className="-mb-[calc(5.75rem+env(safe-area-inset-bottom)-1rem)] md:mb-0">
            {children}
          </div>
        ) : (
          children
        )}
      </main>

      {showAppChrome && !isTraderDetailPage && !isAdminPage ? (
        <nav className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-2xl border border-white/10 bg-[#0a0d0c]/94 p-1.5 text-white shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl md:hidden">
          <div className="grid grid-cols-4 gap-1">
            {shellLinks.map((link) => {
              const active = isShellLinkActive(link.href, visiblePath);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-label={navLabel(locale, link.key, t)}
                  onClick={(event) => handleShellLinkClick(event, link.href)}
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
        aria-hidden={!isDrawerOpen}
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
                    {session?.user ? (
                      <>
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
                      </>
                    ) : (
                      <Link
                        href="/login"
                        onClick={() => setIsDrawerOpen(false)}
                        className="focus-ring inline-flex items-center gap-1 rounded border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-200 transition hover:bg-emerald-400/15"
                      >
                        <SignIn size={11} weight="bold" />
                        <span>{t("nav.login")}</span>
                      </Link>
                    )}
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

            {/* Membership / Coupon Info */}
            {session?.user ? (
              <div className="mt-5 pb-5 border-b border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                    access?.isSubscribed
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {access?.isSubscribed ? <ShieldCheck size={16} weight="fill" /> : <Ticket size={16} weight="fill" />}
                  </span>
                  <div className="min-w-0 flex-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300">
                      {access?.isSubscribed ? t("access.proActive") : t("access.drawerCouponLabel")}
                    </span>
                    {!access?.isSubscribed ? (
                      <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        {access?.couponsRemaining ?? 0}/{access?.couponLimit ?? 3}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full tracking-wider">
                        ACTIVE
                      </span>
                    )}
                  </div>
                </div>
                {!access?.isSubscribed ? (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400 text-pretty">
                    {t("access.drawerCouponDetail")}
                  </p>
                ) : null}
                {!access?.isSubscribed ? (
                  <div className="mt-3 h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${((access?.couponsRemaining ?? 0) / (access?.couponLimit ?? 3)) * 100}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Menu List */}
            <div className="py-5 flex flex-col gap-2.5">
              <Link 
                href="/blog"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-3.5 text-zinc-300 hover:text-white text-sm font-semibold transition py-2 px-3 hover:bg-white/[0.03] rounded-xl focus-ring"
              >
                <Newspaper size={18} className="text-zinc-400" />
                <span>{t("shell.blog")}</span>
              </Link>
              <Link 
                href="/learn"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-3.5 text-zinc-300 hover:text-white text-sm font-semibold transition py-2 px-3 hover:bg-white/[0.03] rounded-xl focus-ring"
              >
                <BookOpenText size={18} className="text-zinc-400" />
                <span>{t("shell.glossary")}</span>
              </Link>
            </div>
          </div>

          {/* Bottom Panel (Language + Social Links) */}
          <div className="border-t border-white/[0.05] pt-5 flex flex-col gap-5">
            {/* Language Selector in Slot Control Format */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">{t("common.language")}</span>
                <span className="font-mono text-[10px] text-zinc-400 font-semibold">{currentLanguage.label}</span>
              </div>
              <div className="inline-flex w-full rounded-xl bg-white/[0.02] border border-white/[0.08] p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01)]">
                {LOCALE_OPTIONS.map((option) => {
                  const isActive = option.locale === locale;
                  return (
                    <button
                      key={option.locale}
                      type="button"
                      onClick={() => setLocale(option.locale)}
                      className={`focus-ring flex-1 text-center rounded-lg py-1.5 text-[11px] font-bold transition duration-200 ${
                        isActive
                          ? "bg-white text-zinc-950 shadow-sm"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {option.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Social Links */}
            <div>
              <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2.5">
                {t("shell.social")}
              </h4>
              <div className="flex flex-col gap-1.5">
                <a 
                  href="https://www.instagram.com/aigentra_trading/"
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-1.5 px-2 hover:bg-white/[0.02] rounded-lg focus-ring"
                >
                  <InstagramLogo size={16} className="text-zinc-500" />
                  <span>{t("shell.instagram")}</span>
                </a>
              </div>
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
