"use client";

import { Check, CheckCircle, Info, Star, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { SUBSCRIBER_ACCOUNT_COPY } from "@/components/subscriber-account-copy";
import { TelegramConnectPanel } from "@/components/telegram-connect-panel";
import { TelegramReviewSectionSettings } from "@/components/telegram-review-section-settings";
import { TelegramTestButton } from "@/components/telegram-test-button";
import { useSubscriberPreferenceSync } from "@/components/use-subscriber-preference-sync";
import {
  mergeStoredSubscriberPreferences,
  telegramDeliveryReadiness,
  telegramEventTypes,
  toggleFavoriteTrader,
  updateTelegramSettings,
  type SubscriberPreferences,
  type TelegramEventType,
  type TelegramReviewSection
} from "@/lib/subscriber-preferences";
import { translate, type Locale } from "@/lib/i18n";
import { intlLocale } from "@/lib/format";
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
  const selectedTraderCount = preferences.favoriteTraderIds.length || fallbackTraders.length;
  const eventTypeCount = preferences.telegramSettings.eventTypes.length;
  const reviewSectionCount = preferences.telegramSettings.reviewSections.length;

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

  const updateReviewSection = (section: TelegramReviewSection) => {
    setPreferences((current) => {
      const reviewSections = current.telegramSettings.reviewSections.includes(section)
        ? current.telegramSettings.reviewSections.filter((currentSection) => currentSection !== section)
        : [...current.telegramSettings.reviewSections, section];

      return updateTelegramSettings(current, { ...current.telegramSettings, reviewSections });
    });
  };

  const updateMinReturnPct = (value: string) => {
    const minReturnPct = Number(value);
    setPreferences((current) =>
      updateTelegramSettings(current, {
        ...current.telegramSettings,
        minReturnPct
      })
    );
  };

  const refreshPreferences = async () => {
    const response = await fetch("/api/subscriber/preferences", { cache: "no-store" });
    if (!response.ok) return;
    const storedPreferences: unknown = await response.json();
    setPreferences((current) => mergeStoredSubscriberPreferences(current, storedPreferences));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12 animate-fade-in-up sm:space-y-8">
      {/* Top Header Card */}
      <header className="flex min-w-0 flex-col gap-4 border-b border-zinc-200/80 pb-5 dark:border-white/[0.08] md:flex-row md:items-center md:justify-between md:pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl break-keep">
              {copy.title}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {copy.active}
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm max-w-2xl break-keep leading-relaxed">
            {copy.subtitle}
          </p>
        </div>

        {/* Sync/Status Badge panel */}
        <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 text-xs dark:border-white/[0.08] dark:bg-[#0c0f0d] sm:w-auto sm:gap-4">
          <div className="min-w-0">
            <span className="block text-[9px] font-mono uppercase tracking-wider text-zinc-400">
              Cabinet ID
            </span>
            <span className="mt-0.5 block max-w-[48vw] truncate font-mono font-semibold text-zinc-800 dark:text-zinc-200 sm:max-w-[150px]">
              {preferences.email}
            </span>
          </div>
          <div className="h-6 w-px bg-zinc-200 dark:bg-white/10" />
          <div className="flex min-w-0 items-center gap-2">
            {saveState === "saving" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="font-mono font-medium text-zinc-500 dark:text-zinc-400">{copy.saving}</span>
              </>
            ) : saveState === "failed" ? (
              <>
                <WarningCircle size={14} className="text-rose-500" />
                <span className="font-mono font-medium text-rose-500">{copy.saveFailed}</span>
              </>
            ) : (
              <>
                <CheckCircle size={14} className="text-emerald-500" />
                <span className="truncate font-mono font-medium text-zinc-500 dark:text-zinc-400">
                  {savedAt
                    ? `${copy.saved} (${savedAt.toLocaleTimeString(
                        intlLocale(resolvedLocale),
                        { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                      )})`
                    : copy.saved}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <section data-testid="subscriber-command-summary" className="grid gap-3 sm:grid-cols-3">
        <AccountSummaryMetric
          label={copy.monitoredScope}
          value={`${selectedTraderCount}/${fallbackTraders.length}`}
          detail={preferences.favoriteTraderIds.length === 0 ? copy.allTradersActive : copy.activeTradersActive}
          tone="emerald"
        />
        <AccountSummaryMetric
          label={copy.eventChannels}
          value={`${eventTypeCount}/${telegramEventTypes.length}`}
          detail={preferences.telegramSettings.enabled ? copy.enabled : copy.disabled}
          tone={preferences.telegramSettings.enabled ? "sky" : "zinc"}
        />
        <AccountSummaryMetric
          label={copy.reviewContent}
          value={`${reviewSectionCount}/9`}
          detail={readiness.canSend ? copy.statusConnected : copy.statusDisconnected}
          tone={readiness.canSend ? "emerald" : "amber"}
        />
      </section>

      {/* Main Grid Layout */}
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-8">
        {/* Left Column: Monitored AI Traders */}
        <div className="lg:col-span-7 space-y-6">
          <div data-testid="subscriber-favorites" className="panel border-zinc-200/80 p-4 dark:border-white/[0.08] dark:bg-[#0c0f0d] sm:p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                {copy.favorites}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 break-keep leading-relaxed">
                {copy.favoritesHint}
              </p>
            </div>

            {/* Scope Status Banner */}
            <div className={`mb-6 rounded-xl border p-4 text-xs flex items-start gap-2.5 transition duration-300 ${
              preferences.favoriteTraderIds.length === 0
                ? "bg-zinc-50/50 dark:bg-zinc-900/10 border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-zinc-400"
                : "bg-emerald-50/30 dark:bg-emerald-950/5 border-emerald-500/15 text-emerald-800 dark:text-emerald-400"
            }`}>
              <Info size={16} className="shrink-0 mt-0.5 text-zinc-400 dark:text-zinc-500" />
              <div className="space-y-1">
                <span className="font-bold block">
                  {preferences.favoriteTraderIds.length === 0
                    ? copy.noFavorites
                    : `${preferences.favoriteTraderIds.length} ${copy.selectedCount}`}
                </span>
                <span className="block text-[11px] leading-relaxed break-keep">
                  {preferences.favoriteTraderIds.length === 0 ? copy.allTradersActive : copy.activeTradersActive}
                </span>
              </div>
            </div>

            {/* Trader Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {traderRows.map((trader) => {
                const selected = preferences.favoriteTraderIds.includes(trader.id);
                return (
                  <button
                    key={trader.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setPreferences((current) => toggleFavoriteTrader(current, trader.id))
                    }
                    className={`focus-ring relative min-h-[148px] overflow-hidden rounded-xl border p-4 text-left transition-all duration-300 ${
                      selected
                        ? "bg-emerald-500/[0.02] border-emerald-500 dark:border-emerald-500/40 text-zinc-950 dark:text-white shadow-[0_0_12px_rgba(16,185,129,0.04)]"
                        : "bg-white dark:bg-[#070908] border-zinc-200 dark:border-white/[0.06] hover:border-zinc-300 dark:hover:border-white/20 text-zinc-800 dark:text-zinc-300 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20"
                    }`}
                  >
                    {/* Glowing active indicator */}
                    {selected && (
                      <span className="absolute top-4 right-4 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    )}

                    <div className="flex flex-col justify-between h-full space-y-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Star className={selected ? "text-emerald-500" : "text-zinc-400"} size={14} weight={selected ? "fill" : "regular"} />
                          <span className="block text-sm font-bold tracking-tight">{trader.name}</span>
                        </div>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-2.5 leading-relaxed break-keep">
                          {trader.summary}
                        </span>
                      </div>

                      {/* Active / Muted Switch look */}
                      <div className="flex items-center justify-between pt-3.5 border-t border-zinc-100 dark:border-white/[0.04]">
                        <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${
                          selected ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"
                        }`}>
                          {selected ? copy.alertsOn : copy.alertsOff}
                        </span>
                        <div className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${
                          selected ? "bg-emerald-500" : "bg-zinc-200 dark:bg-white/10"
                        }`}>
                          <div className={`absolute top-0.5 left-0.5 size-3 rounded-full bg-white transition-transform duration-200 ${
                            selected ? "translate-x-4" : "translate-x-0"
                          }`} />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Telegram Webhook Configuration */}
        <div className="lg:col-span-5 space-y-6">
          <div data-testid="telegram-alert-settings" className="panel space-y-5 border-zinc-200/80 p-4 dark:border-white/[0.08] dark:bg-[#0c0f0d] sm:space-y-6 sm:p-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                {copy.alerts}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 break-keep leading-relaxed">
                {copy.alertsHint}
              </p>
            </div>

            {/* Connection Status Banner */}
            <div className={`rounded-xl border p-4 text-xs flex items-start gap-2.5 transition duration-300 ${
              readiness.canSend
                ? "bg-emerald-50/30 dark:bg-emerald-950/5 border-emerald-500/15 text-emerald-800 dark:text-emerald-400"
                : "bg-amber-50/30 dark:bg-amber-950/5 border-amber-500/15 text-amber-800 dark:text-amber-400"
            }`}>
              {readiness.canSend ? (
                <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-500" />
              ) : (
                <WarningCircle size={16} className="shrink-0 mt-0.5 text-amber-500" />
              )}
              <div className="space-y-1">
                <span className="font-bold block">
                  {readiness.canSend ? copy.statusConnected : copy.statusDisconnected}
                </span>
                <span className="block text-[11px] leading-relaxed break-keep">
                  {copy.readiness[readiness.status]}
                </span>
              </div>
            </div>

            {/* Master Toggle */}
            <TelegramConnectPanel preferences={preferences} onRefreshPreferences={refreshPreferences} />

            <div className="flex items-center justify-between rounded-xl border border-zinc-200/80 dark:border-white/[0.06] bg-white dark:bg-[#070908] p-4">
              <div>
                <span className="block text-sm font-bold text-zinc-900 dark:text-white">
                  {copy.telegramSettingsLabel}
                </span>
                <span className="text-zinc-500 text-xs mt-0.5 block">
                  {preferences.telegramSettings.enabled ? copy.enabled : copy.disabled}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={copy.telegramSettingsLabel}
                aria-checked={preferences.telegramSettings.enabled}
                onClick={() =>
                  setPreferences((current) =>
                    updateTelegramSettings(current, {
                      ...current.telegramSettings,
                      enabled: !current.telegramSettings.enabled,
                    })
                  )
                }
                className={`focus-ring relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  preferences.telegramSettings.enabled ? "bg-emerald-500" : "bg-zinc-200 dark:bg-white/10"
                }`}
              >
                <span className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform duration-200 ${
                  preferences.telegramSettings.enabled ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>

            {/* Inputs Block (Disabled if alerts are off) */}
            <div className={`space-y-6 transition-opacity duration-200 ${
              preferences.telegramSettings.enabled ? "opacity-100 animate-fade-in" : "opacity-40 pointer-events-none"
            }`}>
              {/* Min Return Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                  <span>{copy.minReturnPct}</span>
                  <span className="font-mono text-emerald-500 font-semibold text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {preferences.telegramSettings.minReturnPct}%
                  </span>
                </label>
                <div className="flex gap-4 items-center">
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    disabled={!preferences.telegramSettings.enabled}
                    value={preferences.telegramSettings.minReturnPct}
                    onChange={(event) => updateMinReturnPct(event.currentTarget.value)}
                    className="w-full accent-emerald-500 h-1 bg-zinc-200 dark:bg-white/10 rounded-lg cursor-pointer appearance-none"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    disabled={!preferences.telegramSettings.enabled}
                    value={preferences.telegramSettings.minReturnPct}
                    onChange={(event) => updateMinReturnPct(event.currentTarget.value)}
                    className="focus-ring w-20 rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#070908] px-2 py-1 text-xs font-mono text-center text-zinc-900 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-relaxed break-keep">
                  {copy.minReturnPctHelp}
                </p>
              </div>

              {/* Event Type Toggles */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                  {copy.eventGroupLabel}
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {telegramEventTypes.map((eventType) => {
                    const isChecked = preferences.telegramSettings.eventTypes.includes(eventType);
                    return (
                      <button
                        key={eventType}
                        type="button"
                        disabled={!preferences.telegramSettings.enabled}
                        onClick={() => updateAlertType(eventType)}
                        className={`focus-ring flex flex-col justify-between items-start text-left p-3.5 rounded-lg border transition duration-200 ${
                          isChecked
                            ? "bg-zinc-50/50 dark:bg-[#111413] border-zinc-300 dark:border-emerald-500/25"
                            : "bg-white dark:bg-[#070908] border-zinc-200 dark:border-white/[0.04] opacity-70"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center size-4 rounded border ${
                            isChecked
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-zinc-300 dark:border-white/10"
                          }`}>
                            {isChecked && <Check size={10} weight="bold" />}
                          </span>
                          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                            {copy.eventLabels[eventType]}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 leading-relaxed break-keep">
                          {copy.eventDescriptions[eventType]}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <TelegramReviewSectionSettings
                enabled={preferences.telegramSettings.enabled}
                selectedSections={preferences.telegramSettings.reviewSections}
                title={copy.reviewSectionGroupLabel}
                labels={copy.reviewSectionLabels}
                descriptions={copy.reviewSectionDescriptions}
                onToggle={updateReviewSection}
              />

              {/* Test Button Integration */}
              <div className="pt-2">
                <TelegramTestButton preferences={preferences} readiness={readiness} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountSummaryMetric({
  label,
  value,
  detail,
  tone
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "emerald" | "sky" | "amber" | "zinc";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-500"
      : tone === "sky"
        ? "border-sky-500/20 bg-sky-500/[0.04] text-sky-500"
        : tone === "amber"
          ? "border-amber-500/20 bg-amber-500/[0.04] text-amber-500"
          : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/[0.08] dark:bg-white/[0.03]";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p>
    </div>
  );
}
