"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isSupportedLocale, translate, type Locale } from "@/lib/i18n";
import { LEAGUE_QUERY_GC_TIME_MS, LEAGUE_QUERY_STALE_TIME_MS } from "@/lib/api";
import { DASHBOARD_SESSION_REFETCH_POLICY } from "@/lib/session-refetch-policy";

type AppContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: "dark" | "light";
  toggleTheme: () => void;
  t: (key: string) => string;
};

const AppContext = createContext<AppContextValue | null>(null);
const LOCALE_STORAGE_KEY = "atl-locale";
const LOCALE_SOURCE_STORAGE_KEY = "atl-locale-source";
const LOCALE_PENDING_STORAGE_KEY = "atl-locale-pending-account-sync";

type StoredLocaleSource = "auto" | "account" | "manual";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: LEAGUE_QUERY_STALE_TIME_MS,
            gcTime: LEAGUE_QUERY_GC_TIME_MS,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedLocale = readStoredLocale(LOCALE_STORAGE_KEY);
    if (storedLocale) {
      setLocaleState(storedLocale);
      return;
    }
    const detectedLocale = detectBrowserLocale({
      languages: navigator.languages.length > 0 ? navigator.languages : [navigator.language],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    setLocaleState(detectedLocale);
    writeStoredLocale(detectedLocale, "auto");
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem("atl-theme", "dark");
  }, []);

  const resolveLocale = useCallback((nextLocale: Locale, source: StoredLocaleSource) => {
    setLocaleState(nextLocale);
    writeStoredLocale(nextLocale, source);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(nextLocale);
        writeStoredLocale(nextLocale, "manual");
        window.localStorage.setItem(LOCALE_PENDING_STORAGE_KEY, nextLocale);
        void saveAccountLocalePreference(nextLocale).then((saved) => {
          if (saved && readStoredLocale(LOCALE_PENDING_STORAGE_KEY) === nextLocale) {
            window.localStorage.removeItem(LOCALE_PENDING_STORAGE_KEY);
          }
        }).catch((error: unknown) => {
          if (isExpectedLocaleHydrationError(error)) return;
          throw error;
        });
      },
      theme: "dark",
      toggleTheme: () => {},
      t: (key) => translate(locale, key)
    }),
    [locale]
  );

  return (
    <SessionProvider {...DASHBOARD_SESSION_REFETCH_POLICY}>
      <LocalePreferenceHydrator onLocaleResolved={resolveLocale} />
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider value={value}>{children}</AppContext.Provider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

const COUNTRY_LOCALE_MAP: Readonly<Record<string, Locale>> = {
  AU: "en",
  BR: "pt-BR",
  CA: "en",
  GB: "en",
  IE: "en",
  KR: "ko",
  NZ: "en",
  RU: "ru",
  SG: "en",
  TR: "tr",
  US: "en",
  ZA: "en"
};

const LANGUAGE_LOCALE_MAP: Readonly<Record<string, Locale>> = {
  en: "en",
  ko: "ko",
  pt: "pt-BR",
  ru: "ru",
  tr: "tr"
};

const TIME_ZONE_LOCALE_MAP: Readonly<Record<string, Locale>> = {
  "America/Sao_Paulo": "pt-BR",
  "Asia/Seoul": "ko",
  "Europe/Istanbul": "tr",
  "Europe/Moscow": "ru"
};

export function detectBrowserLocale({
  languages,
  timeZone
}: {
  readonly languages?: readonly string[];
  readonly timeZone?: string;
}): Locale {
  for (const languageTag of languages ?? []) {
    const locale = localeFromLanguageTag(languageTag);
    if (locale) return locale;
  }
  if (timeZone && TIME_ZONE_LOCALE_MAP[timeZone]) return TIME_ZONE_LOCALE_MAP[timeZone];
  return "en";
}

function localeFromLanguageTag(languageTag: string): Locale | null {
  const normalizedTag = languageTag.trim().replaceAll("_", "-");
  if (!normalizedTag) return null;
  const segments = normalizedTag.split("-");
  const language = segments[0]?.toLowerCase() ?? "";
  const region = segments.find((segment) => segment.length === 2 && /^[a-z]{2}$/i.test(segment))?.toUpperCase();
  if (region && COUNTRY_LOCALE_MAP[region]) return COUNTRY_LOCALE_MAP[region];
  return LANGUAGE_LOCALE_MAP[language] ?? null;
}

function LocalePreferenceHydrator({
  onLocaleResolved
}: {
  readonly onLocaleResolved: (locale: Locale, source: StoredLocaleSource) => void;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    if (status !== "authenticated" || !session?.user?.email) return;

    const abortController = new AbortController();
    const hydrateLocale = async () => {
      const response = await fetch("/api/subscriber/preferences", {
        cache: "no-store",
        signal: abortController.signal
      });
      if (!response.ok) return;

      const nextLocale = readPreferenceLocale(await response.json());
      const pendingManualLocale = readStoredLocale(LOCALE_PENDING_STORAGE_KEY);
      if (pendingManualLocale) {
        const saved = await saveAccountLocalePreference(pendingManualLocale, abortController.signal);
        onLocaleResolved(pendingManualLocale, "manual");
        if (saved) {
          window.localStorage.removeItem(LOCALE_PENDING_STORAGE_KEY);
        }
        return;
      }

      if (!nextLocale) return;
      onLocaleResolved(nextLocale, "account");
    };

    void hydrateLocale().catch((error: unknown) => {
      if (isExpectedLocaleHydrationError(error)) return;
      throw error;
    });

    return () => {
      abortController.abort();
    };
  }, [onLocaleResolved, pathname, session?.user?.email, status]);

  return null;
}

function readStoredLocale(key: string): Locale | null {
  const storedLocale = window.localStorage.getItem(key);
  return isSupportedLocale(storedLocale) ? storedLocale : null;
}

function writeStoredLocale(locale: Locale, source: StoredLocaleSource): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.localStorage.setItem(LOCALE_SOURCE_STORAGE_KEY, source);
}

async function saveAccountLocalePreference(locale: Locale, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch("/api/subscriber/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
      signal
    });
    return response.ok;
  } catch (error: unknown) {
    if (isExpectedLocaleHydrationError(error)) return false;
    throw error;
  }
}

function readPreferenceLocale(input: unknown): Locale | null {
  if (!isRecord(input)) return null;
  const locale = input["locale"];
  return typeof locale === "string" && isSupportedLocale(locale) ? locale : null;
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isExpectedLocaleHydrationError(error: unknown): boolean {
  return error instanceof DOMException || error instanceof SyntaxError || error instanceof TypeError;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used inside AppProvider");
  return context;
}
