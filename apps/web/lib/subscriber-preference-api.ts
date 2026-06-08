import {
  createSubscriberPreferences,
  mergeStoredSubscriberPreferences,
  type SubscriberPreferences,
} from "@/lib/subscriber-preferences";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export async function loadSubscriberPreferences(identity: SubscriberIdentity): Promise<SubscriberPreferences> {
  const basePreferences = createSubscriberPreferences(identity);
  const apiUrl = subscriberApiUrl(identity);
  if (!apiUrl) return basePreferences;

  try {
    const response = await fetch(apiUrl, { cache: "no-store", headers: subscriberApiHeaders() });
    if (!response.ok) return basePreferences;
    return mergeStoredSubscriberPreferences(basePreferences, await response.json());
  } catch {
    return basePreferences;
  }
}

export async function saveSubscriberPreferences(preferences: SubscriberPreferences, locale: "ko" | "en" = "ko"): Promise<SubscriberPreferences | null> {
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

function subscriberApiHeaders(): Record<string, string> {
  const token = process.env.SUBSCRIBER_API_TOKEN?.trim();
  return token ? { "X-Subscriber-Api-Token": token } : {};
}

function subscriberApiUrl(identity: SubscriberIdentity): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;

  const url = new URL("/api/subscribers/preferences", baseUrl);
  url.searchParams.set("userId", identity.userId);
  url.searchParams.set("email", identity.email);
  return url.toString();
}
