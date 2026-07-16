import type { Locale } from "@/lib/i18n";

export const LOCALIZED_HOME_LOCALES = ["ko", "ru", "pt-BR", "tr"] as const satisfies readonly Locale[];

const HOME_PATH_BY_LOCALE = {
  en: "/",
  ko: "/ko",
  ru: "/ru",
  "pt-BR": "/pt-BR",
  tr: "/tr"
} as const satisfies Record<Locale, `/${string}`>;

export function homePathForLocale(locale: Locale): `/${string}` {
  return HOME_PATH_BY_LOCALE[locale];
}

export function isLocalizedHomeLocale(value: string): value is (typeof LOCALIZED_HOME_LOCALES)[number] {
  return LOCALIZED_HOME_LOCALES.some((locale) => locale === value);
}
