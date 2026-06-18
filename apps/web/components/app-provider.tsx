"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import { SessionProvider } from "next-auth/react";

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
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider value={value}>{children}</AppContext.Provider>
      </QueryClientProvider>
    </SessionProvider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used inside AppProvider");
  return context;
}
