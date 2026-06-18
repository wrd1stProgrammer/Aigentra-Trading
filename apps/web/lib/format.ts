import type { Locale } from "@/lib/i18n";

type Translator = (key: string) => string;

export function intlLocale(locale?: Locale) {
  const locales: Record<Locale, string> = {
    en: "en-US",
    ko: "ko-KR",
    ru: "ru-RU",
    "pt-BR": "pt-BR",
    tr: "tr-TR"
  };
  return locale ? locales[locale] : "en-US";
}

export function formatCurrency(value: number | null | undefined, locale?: Locale): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 2, locale?: Locale): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: digits
  }).format(value);
}

export function formatDateTime(value: string | null | undefined, locale?: Locale): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

export function formatRelativeDateTime(value: string | null | undefined, locale: Locale, t: Translator, now = new Date()): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0 || diffMs >= 24 * 60 * 60 * 1000) return formatDateTime(value, locale);

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return t("time.relative.justNow");

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(formatRelativeUnit(hours, "time.relative.hour", "time.relative.hours", locale, t));
  if (minutes > 0) parts.push(formatRelativeUnit(minutes, "time.relative.minute", "time.relative.minutes", locale, t));
  return formatRelativeAgo(parts.join(" "), t);
}

function formatRelativeUnit(count: number, singularKey: string, pluralKey: string, locale: Locale, t: Translator) {
  const gap = locale === "ko" ? "" : " ";
  return `${count}${gap}${t(count === 1 ? singularKey : pluralKey)}`;
}

function formatRelativeAgo(value: string, t: Translator) {
  const template = t("time.relative.ago");
  return template.includes("{value}") ? template.replace("{value}", value) : `${value} ${template}`;
}

export function formatClockTime(value: string | null | undefined, locale?: Locale): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(11, 16);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC"
  }).format(date);
}
