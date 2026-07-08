import {
  createSubscriberPreferences,
  mergeStoredSubscriberPreferences,
  type SubscriberPreferences,
} from "@/lib/subscriber-preferences";
import { resolveExternalApiBaseUrl } from "@/lib/api-base-url";
import type { Locale } from "@/lib/i18n";
import { z } from "zod";

const SUBSCRIBER_PREFERENCES_READ_TIMEOUT_MS = 2_000;

const telegramStartLinkSchema = z.object({
  telegramUrl: z.string().url(),
  expiresAt: z.string(),
  botUsername: z.string().min(1)
});

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export type TelegramStartLink = z.infer<typeof telegramStartLinkSchema>;

export async function loadSubscriberPreferences(identity: SubscriberIdentity): Promise<SubscriberPreferences> {
  const basePreferences = createSubscriberPreferences(identity);
  const apiUrl = subscriberApiUrl(identity);
  if (!apiUrl) return basePreferences;

  const timeout = subscriberPreferencesTimeoutSignal();
  try {
    const response = await fetch(apiUrl, { cache: "no-store", headers: subscriberApiHeaders(), signal: timeout.signal });
    if (!response.ok) return basePreferences;
    return mergeStoredSubscriberPreferences(basePreferences, await response.json());
  } catch {
    return basePreferences;
  } finally {
    timeout.clear();
  }
}

export async function saveSubscriberPreferences(preferences: SubscriberPreferences, locale: Locale = "en"): Promise<SubscriberPreferences | null> {
  const apiUrl = subscriberApiUrl({ userId: preferences.userId, email: preferences.email });
  if (!apiUrl) return null;

  try {
    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...subscriberApiHeaders() },
      body: JSON.stringify({
        userId: preferences.userId,
        email: preferences.email,
        favoriteTraderIds: preferences.favoriteTraderIds,
        telegramSettings: preferences.telegramSettings,
        locale,
      }),
    });
    if (!response.ok) return null;
    return mergeStoredSubscriberPreferences(createSubscriberPreferences(preferences), await response.json());
  } catch {
    return null;
  }
}

export async function createTelegramStartLink(identity: SubscriberIdentity): Promise<TelegramStartLink | null> {
  const apiUrl = subscriberTelegramLinkApiUrl();
  if (!apiUrl) return null;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...subscriberApiHeaders() },
      body: JSON.stringify({ userId: identity.userId, email: identity.email }),
    });
    if (!response.ok) return null;
    const parsed = telegramStartLinkSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function subscriberApiHeaders(): Record<string, string> {
  const token = process.env.SUBSCRIBER_API_TOKEN?.trim();
  return token ? { "X-Subscriber-Api-Token": token } : {};
}

function subscriberApiUrl(identity: SubscriberIdentity): string | null {
  const baseUrl = resolveExternalApiBaseUrl();
  if (!baseUrl) return null;

  const url = new URL("/api/subscribers/preferences", baseUrl);
  url.searchParams.set("userId", identity.userId);
  url.searchParams.set("email", identity.email);
  return url.toString();
}

function subscriberPreferencesTimeoutSignal(timeoutMs = SUBSCRIBER_PREFERENCES_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("subscriber_preferences_timeout"), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

function subscriberTelegramLinkApiUrl(): string | null {
  const baseUrl = resolveExternalApiBaseUrl();
  if (!baseUrl) return null;
  return new URL("/api/subscribers/telegram/link", baseUrl).toString();
}
