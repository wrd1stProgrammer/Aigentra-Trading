"use client";

import { BellRinging, BellSlash, CheckCircle, PaperPlaneTilt, Star, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { SUBSCRIBER_ACCOUNT_COPY } from "@/components/subscriber-account-copy";
import { TelegramTestButton } from "@/components/telegram-test-button";
import { useSubscriberPreferenceSync } from "@/components/use-subscriber-preference-sync";
import {
  telegramDeliveryReadiness,
  telegramEventTypes,
  toggleFavoriteTrader,
  updateTelegramSettings,
  type SubscriberPreferences,
  type TelegramDeliveryReadiness,
  type TelegramEventType
} from "@/lib/subscriber-preferences";
import { translate, type Locale } from "@/lib/i18n";
import { fallbackTraders, traderNameKey, traderShortKey } from "@/lib/traders";

type SubscriberAccountClientProps = {
  readonly initialPreferences: SubscriberPreferences;
  readonly botTokenConfigured: boolean;
  readonly locale?: Locale;
};

export function SubscriberAccountClient({ initialPreferences, botTokenConfigured, locale }: SubscriberAccountClientProps) {
  const appContext = useAppContext();
  const resolvedLocale = locale ?? appContext.locale;
  const copy = SUBSCRIBER_ACCOUNT_COPY[resolvedLocale];
  const [preferences, setPreferences] = useState<SubscriberPreferences>(initialPreferences);
  const readiness = telegramDeliveryReadiness(preferences.telegramSettings, { botTokenConfigured });
  const { savedAt, saveState } = useSubscriberPreferenceSync(preferences, resolvedLocale);

  const favoriteCountLabel = useMemo(() => {
    const count = preferences.favoriteTraderIds.length;
    return count ? `${count} ${copy.favorites}` : copy.noFavorites;
  }, [copy.favorites, copy.noFavorites, preferences.favoriteTraderIds.length]);

  const traderRows = useMemo(
    () =>
      fallbackTraders.map((trader) => ({
        id: trader.id,
        name: translate(resolvedLocale, traderNameKey(trader.id)),
        summary: translate(resolvedLocale, traderShortKey(trader.id))
      })),
    [resolvedLocale]
  );

  const updateAlertType = (eventType: TelegramEventType) => {
    setPreferences((current) => {
      const eventTypes = current.telegramSettings.eventTypes.includes(eventType)
        ? current.telegramSettings.eventTypes.filter((currentType) => currentType !== eventType)
        : [...current.telegramSettings.eventTypes, eventType];

      return updateTelegramSettings(current, { ...current.telegramSettings, eventTypes });
    });
  };

  return (
    <div className="grid gap-4 pb-8">
      <section 
        className="relative overflow-hidden border border-white/10 bg-[#070908] text-white rounded-[22px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)] animate-fade-in-up"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(circle at 50% 25%, rgba(16,185,129,0.12), transparent 40%)",
          backgroundSize: "96px 96px, 96px 96px, auto"
        }}
      >
        {/* Corner Markers / Notches */}
        <div className="absolute top-0 left-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />
        <div className="absolute top-0 right-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />
        <div className="absolute bottom-0 left-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />
        <div className="absolute bottom-0 right-0 h-3.5 w-[3px] bg-emerald-500 animate-pulse" />

        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.15em] text-emerald-400">[ SUBSCRIBER CABINET ]</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl break-keep animate-fade-in-up">{copy.title}</h1>
            <p className="text-zinc-400 mt-2 max-w-3xl text-sm leading-6 break-keep animate-fade-in-up animation-delay-100">{copy.subtitle}</p>
          </div>
          <div className="animate-fade-in-up animation-delay-200">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
              <UserCircle size={15} weight="bold" />
              {copy.active}
            </span>
          </div>
        </div>
        <div className="grid gap-px bg-white/5 md:grid-cols-3 rounded-b-[22px] overflow-hidden">
          <AccountStat label="Email" value={preferences.email} />
          <AccountStat label={copy.favorites} value={favoriteCountLabel} />
          <AccountStat label={saveState === "failed" ? copy.saveFailed : saveState === "saving" ? copy.saving : copy.saved} value={savedAt ? savedAt.toLocaleTimeString(resolvedLocale === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "-"} />
        </div>
      </section>

      <section data-testid="subscriber-favorites" className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] shadow-sm overflow-hidden">
        <SectionHeader title={copy.favorites} body={copy.favoritesHint} icon={<Star size={18} />} />
        <div className="grid gap-px bg-zinc-200/60 dark:bg-white/5 sm:grid-cols-2 xl:grid-cols-3">
          {traderRows.map((trader) => {
            const selected = preferences.favoriteTraderIds.includes(trader.id);
            return (
              <button
                key={trader.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setPreferences((current) => toggleFavoriteTrader(current, trader.id))}
                className={`focus-ring min-h-[132px] p-5 text-left transition duration-300 border border-zinc-200/40 dark:border-white/[0.04] ${
                  selected
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                    : "bg-white dark:bg-[#0c0f0d] hover:bg-zinc-50 dark:hover:bg-[#141816] text-zinc-900 dark:text-zinc-200"
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold tracking-tight break-keep">{trader.name}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 mt-2 block text-xs leading-relaxed break-keep">{trader.summary}</span>
                  </span>
                  <Star className="shrink-0 text-emerald-500" size={18} weight={selected ? "fill" : "regular"} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section data-testid="telegram-alert-settings" className="data-card rounded-[22px] border-zinc-200/80 dark:border-white/[0.08] shadow-sm overflow-hidden">
        <SectionHeader title={copy.alerts} body={copy.alertsHint} icon={preferences.telegramSettings.enabled ? <BellRinging size={18} /> : <BellSlash size={18} />} />
        <div className="grid gap-px bg-zinc-200/60 dark:bg-white/5 lg:grid-cols-[minmax(0,0.78fr)_minmax(360px,1fr)]">
          <div className="grid gap-4 bg-white dark:bg-[#0c0f0d] p-5 md:p-6">
            <button
              type="button"
              aria-pressed={preferences.telegramSettings.enabled}
              onClick={() => setPreferences((current) => updateTelegramSettings(current, { ...current.telegramSettings, enabled: !current.telegramSettings.enabled }))}
              className="focus-ring flex items-center justify-between gap-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0c0f0d] px-5 py-4 text-left transition hover:bg-zinc-50 dark:hover:bg-[#141816]"
            >
              <span>
                <span className="block text-sm font-bold tracking-tight text-zinc-900 dark:text-white">{preferences.telegramSettings.enabled ? copy.enabled : copy.disabled}</span>
                <span className="text-zinc-500 dark:text-zinc-400 mt-1 block text-xs">{copy.readiness[readiness.status]}</span>
              </span>
              <StatusIcon readiness={readiness} />
            </button>
            <label className="grid gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {copy.chatId}
              <input
                value={preferences.telegramSettings.chatId}
                onChange={(event) => setPreferences((current) => updateTelegramSettings(current, { ...current.telegramSettings, chatId: event.currentTarget.value }))}
                className="focus-ring rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#070908] px-4 py-2.5 text-sm font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 transition duration-200"
                placeholder="123456789"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {copy.minReturnPct}
              <input
                type="number"
                step="0.1"
                value={String(preferences.telegramSettings.minReturnPct)}
                onChange={(event) => setPreferences((current) => updateTelegramSettings(current, { ...current.telegramSettings, minReturnPct: event.currentTarget.value }))}
                className="focus-ring rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#070908] px-4 py-2.5 text-sm font-medium text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 transition duration-200"
              />
            </label>
          </div>
          <div className="grid content-start gap-4 bg-white dark:bg-[#0c0f0d] p-5 md:p-6 border-t lg:border-t-0 lg:border-l border-zinc-200/80 dark:border-white/[0.08]">
            <div className="flex">
              <StatusBadge label={readiness.canSend ? copy.signaled : copy.readiness[readiness.status]} icon={<PaperPlaneTilt size={14} weight="bold" />} tone={readiness.canSend ? "good" : "warn"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {telegramEventTypes.map((eventType) => (
                <label key={eventType} className="focus-within:ring-2 focus-within:ring-emerald-500/30 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#0c0f0d] px-4 py-3.5 text-sm font-semibold cursor-pointer hover:bg-zinc-50 dark:hover:bg-[#141816] transition duration-200">
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={preferences.telegramSettings.eventTypes.includes(eventType)} onChange={() => updateAlertType(eventType)} className="size-4 rounded accent-emerald-500 text-emerald-600 border-zinc-300" />
                    <span className="text-zinc-800 dark:text-zinc-200 break-keep">{copy.eventLabels[eventType]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="pt-2">
              <TelegramTestButton preferences={preferences} readiness={readiness} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, body, icon }: { readonly title: string; readonly body: string; readonly icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-zinc-200/80 dark:border-white/[0.08] px-6 py-5 bg-zinc-50/50 dark:bg-[#111413]">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">{icon}</span>
      <div>
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white break-keep">{title}</h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs sm:text-sm leading-relaxed break-keep">{body}</p>
      </div>
    </div>
  );
}

function AccountStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 bg-[#0a0c0b] px-6 py-5 hover:bg-[#101311] transition duration-300">
      <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</p>
      <p className="mt-2 truncate font-mono text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ label, icon, tone }: { readonly label: string; readonly icon: React.ReactNode; readonly tone: "good" | "warn" }) {
  const toneClass = tone === "good" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20";
  return <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold border ${toneClass}`}>{icon}{label}</span>;
}

function StatusIcon({ readiness }: { readonly readiness: TelegramDeliveryReadiness }) {
  if (readiness.canSend) return <CheckCircle className="shrink-0 text-[var(--good)]" size={20} />;
  return <WarningCircle className="shrink-0 text-[var(--warn)]" size={20} />;
}
