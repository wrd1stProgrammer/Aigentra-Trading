"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Locale, isSupportedLocale, translate } from "@/lib/i18n";
import { LEAGUE_QUERY_GC_TIME_MS, LEAGUE_QUERY_STALE_TIME_MS } from "@/lib/api";

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
  const [locale, setLocaleState] = useState<Locale>("ko");
  const [theme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const storedLocale = window.localStorage.getItem("atl-locale");
    if (isSupportedLocale(storedLocale)) setLocaleState(storedLocale);
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
    <SessionProvider>
      <LocalePreferenceHydrator onLocaleResolved={setLocaleState} />
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider value={value}>{children}</AppContext.Provider>
      </QueryClientProvider>
    </SessionProvider>
  );
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
