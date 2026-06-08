export const telegramEventTypes = ["entry", "exit", "management", "risk"] as const;

export type TelegramEventType = (typeof telegramEventTypes)[number];

export type TelegramSettings = {
  readonly enabled: boolean;
  readonly chatId: string;
  readonly eventTypes: readonly TelegramEventType[];
  readonly minReturnPct: number;
};

export type SubscriberPreferences = {
  readonly userId: string;
  readonly email: string;
  readonly subscriptionStatus: "active";
  readonly storageKey: string;
  readonly favoriteTraderIds: readonly string[];
  readonly telegramSettings: TelegramSettings;
};

export type TelegramDeliveryReadiness =
  | { readonly status: "disabled"; readonly canSend: false }
  | { readonly status: "missing_server_token"; readonly canSend: false }
  | { readonly status: "missing_chat_id"; readonly canSend: false }
  | { readonly status: "missing_event_types"; readonly canSend: false }
  | { readonly status: "ready"; readonly canSend: true };

type SubscriberPreferenceInput = {
  readonly userId: string;
  readonly email: string;
};

type TelegramSettingsInput = {
  readonly enabled?: unknown;
  readonly chatId?: unknown;
  readonly eventTypes?: unknown;
  readonly minReturnPct?: unknown;
};

export function createSubscriberPreferences({ userId, email }: SubscriberPreferenceInput): SubscriberPreferences {
  const normalizedEmail = email.trim();

  return {
    userId,
    email: normalizedEmail,
    subscriptionStatus: "active",
    storageKey: `atl:subscriber:${normalizedEmail}`,
    favoriteTraderIds: [],
    telegramSettings: normalizeTelegramSettings({})
  };
}

export function toggleFavoriteTrader(preferences: SubscriberPreferences, traderId: string): SubscriberPreferences {
  const normalizedTraderId = traderId.trim();
  if (!normalizedTraderId) return preferences;

  const favoriteTraderIds = preferences.favoriteTraderIds.includes(normalizedTraderId)
    ? preferences.favoriteTraderIds.filter((currentTraderId) => currentTraderId !== normalizedTraderId)
    : [...preferences.favoriteTraderIds, normalizedTraderId];

  return {
    ...preferences,
    favoriteTraderIds
  };
}

export function updateTelegramSettings(preferences: SubscriberPreferences, settings: TelegramSettingsInput): SubscriberPreferences {
  return {
    ...preferences,
    telegramSettings: normalizeTelegramSettings(settings)
  };
}

export function normalizeTelegramSettings(settings: TelegramSettingsInput): TelegramSettings {
  return {
    enabled: settings.enabled === true,
    chatId: typeof settings.chatId === "string" ? settings.chatId.trim() : "",
    eventTypes: normalizeEventTypes(settings.eventTypes),
    minReturnPct: normalizeMinReturnPct(settings.minReturnPct)
  };
}

export function telegramDeliveryReadiness(
  settings: TelegramSettings,
  { botTokenConfigured }: { readonly botTokenConfigured: boolean }
): TelegramDeliveryReadiness {
  if (!settings.enabled) {
    return { status: "disabled", canSend: false };
  }

  if (!botTokenConfigured) {
    return { status: "missing_server_token", canSend: false };
  }

  if (!settings.chatId) {
    return { status: "missing_chat_id", canSend: false };
  }

  if (settings.eventTypes.length === 0) {
    return { status: "missing_event_types", canSend: false };
  }

  return { status: "ready", canSend: true };
}

export function mergeStoredSubscriberPreferences(
  basePreferences: SubscriberPreferences,
  storedPreferences: unknown
): SubscriberPreferences {
  if (!isRecord(storedPreferences)) return basePreferences;

  return {
    ...basePreferences,
    favoriteTraderIds: normalizeFavoriteTraderIds(storedPreferences["favoriteTraderIds"]),
    telegramSettings: normalizeTelegramSettings(readTelegramSettings(storedPreferences["telegramSettings"]))
  };
}

function normalizeEventTypes(input: unknown): readonly TelegramEventType[] {
  if (!Array.isArray(input)) return [];

  const eventTypeSet = new Set<TelegramEventType>();
  for (const item of input) {
    if (isTelegramEventType(item)) {
      eventTypeSet.add(item);
    }
  }

  return telegramEventTypes.filter((eventType) => eventTypeSet.has(eventType));
}

function normalizeFavoriteTraderIds(input: unknown): readonly string[] {
  if (!Array.isArray(input)) return [];

  const traderIdSet = new Set<string>();
  for (const item of input) {
    if (typeof item === "string" && item.trim()) {
      traderIdSet.add(item.trim());
    }
  }

  return Array.from(traderIdSet);
}

function normalizeMinReturnPct(input: unknown): number {
  const value = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : 0;
  return Number.isFinite(value) ? value : 0;
}

function readTelegramSettings(input: unknown): TelegramSettingsInput {
  if (!isRecord(input)) return {};

  return {
    enabled: input["enabled"],
    chatId: input["chatId"],
    eventTypes: input["eventTypes"],
    minReturnPct: input["minReturnPct"]
  };
}

function isTelegramEventType(input: unknown): input is TelegramEventType {
  switch (input) {
    case "entry":
    case "exit":
    case "management":
    case "risk":
      return true;
    default:
      return false;
  }
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
