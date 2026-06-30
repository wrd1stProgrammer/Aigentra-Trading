"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Locale, isSupportedLocale, translate } from "@/lib/i18n";
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
    const storedLocale = window.localStorage.getItem("atl-locale");
    if (isSupportedLocale(storedLocale)) {
      setLocaleState(storedLocale);
      return;
    }
    const detectedLocale = detectBrowserLocale({
      languages: navigator.languages.length > 0 ? navigator.languages : [navigator.language],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    setLocaleState(detectedLocale);
    window.localStorage.setItem("atl-locale", detectedLocale);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    window.localStorage.setItem("atl-theme", "dark");
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(nextLocale);
        window.localStorage.setItem("atl-locale", nextLocale);
      },
      theme: "dark",
      toggleTheme: () => {},
      t: (key) => translate(locale, key)
    }),
    [locale]
  );

  return (
    <SessionProvider {...DASHBOARD_SESSION_REFETCH_POLICY}>
      <LocalePreferenceHydrator onLocaleResolved={setLocaleState} />
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

function LocalePreferenceHydrator({ onLocaleResolved }: { readonly onLocaleResolved: (locale: Locale) => void }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;

    const abortController = new AbortController();
    const hydrateLocale = async () => {
      const response = await fetch("/api/subscriber/preferences", {
        cache: "no-store",
        signal: abortController.signal
      });
      if (!response.ok) return;

      const nextLocale = readPreferenceLocale(await response.json());
      if (!nextLocale) return;

      onLocaleResolved(nextLocale);
      window.localStorage.setItem("atl-locale", nextLocale);
    };

    void hydrateLocale().catch((error: unknown) => {
      if (isExpectedLocaleHydrationError(error)) return;
      throw error;
    });

    return () => {
      abortController.abort();
    };
  }, [onLocaleResolved, session?.user?.email, status]);

  return null;
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
