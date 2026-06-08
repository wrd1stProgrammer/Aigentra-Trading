"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { 
  ChartLineUp, SignIn, Translate, Trophy, UserCircle,
  X, User, Users, FileText, InstagramLogo, ThreadsLogo, ChatCircleText, SignOut
} from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";

const links = [
  { href: "/", key: "nav.home", icon: ChartLineUp },
  { href: "/leaderboard", key: "nav.leaderboard", icon: Trophy },
  { href: "/account", key: "nav.account", icon: UserCircle },
  { href: "/login", key: "nav.login", icon: SignIn }
];

const APP_SHELL_CONTAINER_CLASS = "mx-auto w-full max-w-[1760px] px-6 sm:px-8 lg:px-12 2xl:px-16";
const fallbackLabels = {
  ko: {
    "nav.account": "내 알림",
    "nav.login": "로그인"
  },
  en: {
    "nav.account": "Alerts",
    "nav.login": "Login"
  }
} as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useAppContext();
  const { data: session } = useSession();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const userName = session?.user?.name || "사용자";
  const avatarText = userName.length > 2 ? userName.slice(-2) : userName;

  const isLandingPage = pathname === "/";
  const isLoginPage = pathname === "/login";

  return (
    <div className="min-h-[100dvh] transition-colors">
      {!isLandingPage && (
        !isLoginPage ? (
          <header
            className="sticky top-0 z-20 border-b border-white/10 bg-[#070908]/90 backdrop-blur-xl text-white relative overflow-hidden"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), radial-gradient(circle at 50% 50%, rgba(16,185,129,0.08), transparent 70%)",
              backgroundSize: "64px 64px, 64px 64px, auto"
            }}
          >
            <div className={`${APP_SHELL_CONTAINER_CLASS} relative flex items-center justify-between gap-3 py-3`}>
              {/* Vertical grid lines aligning with the page grids */}
              <div className="absolute inset-y-0 left-0 hidden w-px bg-white/10 lg:block" />
              <div className="absolute inset-y-0 right-0 hidden w-px bg-white/10 lg:block" />

              {/* Corner Markers / Notches */}
              <div className="absolute top-0 left-0 hidden h-3.5 w-[3px] -translate-x-[1px] bg-emerald-500 lg:block animate-pulse" />
              <div className="absolute top-0 right-0 hidden h-3.5 w-[3px] -translate-x-[1px] bg-emerald-500 lg:block animate-pulse" />
              <div className="absolute bottom-0 left-0 hidden h-3.5 w-[3px] -translate-x-[1px] bg-emerald-500 lg:block animate-pulse" />
              <div className="absolute bottom-0 right-0 hidden h-3.5 w-[3px] -translate-x-[1px] bg-emerald-500 lg:block animate-pulse" />

              <Link href="/" className="focus-ring flex min-w-0 items-center gap-3 rounded-lg hover:opacity-90 transition z-10">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-emerald-400/35 bg-emerald-400/10 font-mono text-xs text-emerald-300">
                  AT
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-bold tracking-tight text-white">Aigentra Trading</span>
                  <span className="text-zinc-500 block text-[10px] font-mono uppercase tracking-wider">{t("common.paperOnly")}</span>
                </span>
              </Link>
              <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md z-10">
                {links
                  .filter((link) => !(link.href === "/login" && session?.user))
                  .map((link) => {
                    const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`focus-ring inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                          active
                            ? "bg-white text-zinc-950 shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        <Icon size={14} weight={active ? "bold" : "regular"} />
                        <span>{navLabel(locale, link.key, t)}</span>
                      </Link>
                    );
                  })}
              </nav>
              <div className="flex items-center gap-2 z-10">
                <button
                  type="button"
                  onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-1.5 font-mono text-xs text-zinc-200 hover:bg-white/[0.08] transition"
                  aria-label={t("common.language")}
                >
                  <Translate size={14} />
                  <span className="hidden sm:inline">{locale.toUpperCase()}</span>
                </button>

                {session?.user ? (
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="focus-ring shrink-0 size-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 border border-white/10 flex items-center justify-center text-xs font-bold text-white hover:scale-105 transition active:scale-[0.96] overflow-hidden"
                  >
                    {session.user.image ? (
                      <img src={session.user.image} alt={avatarText} className="size-full object-cover" />
                    ) : (
                      avatarText
                    )}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="focus-ring inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] transition hover:text-white"
                    aria-label="Login"
                  >
                    <SignIn size={14} />
                  </Link>
                )}
              </div>
            </div>
          </header>
        ) : null
      )}
      <main className={isLoginPage ? "py-0 px-0 w-full max-w-none" : (isLandingPage ? "py-0" : `${APP_SHELL_CONTAINER_CLASS} py-5 md:py-7`)}>{children}</main>

      {/* Profile Drawer Backdrop */}
      <div 
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[4px] transition-opacity duration-300 ${
          isDrawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`} 
        onClick={() => setIsDrawerOpen(false)} 
      />

      {/* Profile Drawer Panel */}
      <div 
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[350px] bg-[#0c0d0d] border-l border-white/[0.06] shadow-2xl transition-transform duration-300 ease-in-out will-change-transform p-6 flex flex-col justify-between ${
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full justify-between">
          <div>
            {/* Header / Profile Card */}
            <div className="flex items-start justify-between border-b border-white/[0.05] pb-6 relative">
              <div className="flex items-center gap-3.5">
                <div className="shrink-0 size-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 border border-white/10 flex items-center justify-center text-xs font-bold text-white shadow-lg overflow-hidden">
                  {session?.user?.image ? (
                    <img src={session.user.image} alt={avatarText} className="size-full object-cover" />
                  ) : (
                    avatarText
                  )}
                </div>
                <div>
                  <h3 className="text-white text-sm font-bold tracking-tight">{session?.user?.name || "사용자"}</h3>
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
                      <span>{locale === "ko" ? "로그아웃" : "Sign out"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button 
                type="button" 
                onClick={() => setIsDrawerOpen(false)}
                className="text-zinc-400 hover:text-white transition duration-200 focus-ring rounded p-1"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            {/* Menu List */}
            <div className="py-8 flex flex-col gap-5">
              <Link 
                href="/account"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-4 text-zinc-300 hover:text-white text-sm font-semibold transition py-1 focus-ring rounded"
              >
                <User size={18} className="text-zinc-400" />
                <span>{locale === "ko" ? "마이페이지" : "My Page"}</span>
              </Link>
              <Link 
                href="/traders"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-4 text-zinc-300 hover:text-white text-sm font-semibold transition py-1 focus-ring rounded"
              >
                <Users size={18} className="text-zinc-400" />
                <span>{locale === "ko" ? "팀 소개" : "Team"}</span>
              </Link>
              <Link 
                href="/tests"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-4 text-zinc-300 hover:text-white text-sm font-semibold transition py-1 focus-ring rounded"
              >
                <FileText size={18} className="text-zinc-400" />
                <span>{locale === "ko" ? "Aigentra Trading 사용법 (Docs)" : "Aigentra Trading Guide (Docs)"}</span>
              </Link>
            </div>
          </div>

          {/* Social Links Panel at bottom */}
          <div className="border-t border-white/[0.05] pt-6">
            <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-3.5">
              {locale === "ko" ? "Aigentra Trading SNS" : "Aigentra Trading SNS"}
            </h4>
            <div className="flex flex-col gap-2">
              <a 
                href="https://instagram.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-0.5 focus-ring rounded"
              >
                <InstagramLogo size={16} className="text-zinc-500" />
                <span>{locale === "ko" ? "공식 인스타" : "Official Instagram"}</span>
              </a>
              <a 
                href="https://threads.net" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-0.5 focus-ring rounded"
              >
                <ThreadsLogo size={16} className="text-zinc-500" />
                <span>{locale === "ko" ? "공식 스레드" : "Official Threads"}</span>
              </a>
              <a 
                href="https://kakao.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-zinc-400 hover:text-white text-xs font-semibold transition py-0.5 focus-ring rounded"
              >
                <ChatCircleText size={16} className="text-zinc-500" />
                <span>{locale === "ko" ? "유저 커뮤니티" : "User Community"}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function navLabel(locale: "ko" | "en", key: string, t: (key: string) => string) {
  const translated = t(key);
  if (translated !== key) return translated;
  return fallbackLabels[locale][key as keyof (typeof fallbackLabels)["ko"]] ?? key;
}
