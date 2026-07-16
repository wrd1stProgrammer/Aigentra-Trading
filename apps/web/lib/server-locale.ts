import { isSupportedLocale, type Locale } from "@/lib/i18n";
import { isLocalizedHomeLocale, LOCALIZED_HOME_LOCALES } from "@/lib/locale-routing";

export { isLocalizedHomeLocale, LOCALIZED_HOME_LOCALES };

export const REQUEST_LOCALE_HEADER = "x-aigentra-locale";
export const LOCALE_COOKIE_NAME = "atl-locale";

const LANGUAGE_LOCALE_MAP: Readonly<Record<string, Locale>> = {
  en: "en",
  ko: "ko",
  pt: "pt-BR",
  ru: "ru",
  tr: "tr"
};

export function resolveRequestLocale({
  pathname,
  cookieLocale,
  acceptLanguage
}: {
  readonly pathname: string;
  readonly cookieLocale?: string | null;
  readonly acceptLanguage?: string | null;
}): Locale {
  const pathLocale = pathname.split("/").filter(Boolean)[0];
  if (isSupportedLocale(pathLocale)) return pathLocale;
  if (isSupportedLocale(cookieLocale)) return cookieLocale;
  return localeFromAcceptLanguage(acceptLanguage) ?? "en";
}

export function localeFromRequestHeader(value: string | null): Locale {
  return isSupportedLocale(value) ? value : "en";
}

function localeFromAcceptLanguage(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const languageTags = value
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part));

  for (const languageTag of languageTags) {
    const normalized = languageTag.replaceAll("_", "-");
    if (isSupportedLocale(normalized)) return normalized;
    const language = normalized.split("-")[0]?.toLowerCase() ?? "";
    const locale = LANGUAGE_LOCALE_MAP[language];
    if (locale) return locale;
  }
  return null;
}
