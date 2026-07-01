import { z } from "zod";

export const FREE_LEADERBOARD_LIMIT = 5;
export const SUBSCRIBER_ACCESS_BROWSER_CACHE_MS = 5 * 60_000;

export const subscriberAccessSchema = z.object({
  userId: z.string().nullable(),
  email: z.string().nullable(),
  subscriptionStatus: z.enum(["none", "pending", "active", "inactive"]),
  isSubscribed: z.boolean(),
  couponLimit: z.number().int().nonnegative(),
  couponsUsed: z.number().int().nonnegative(),
  couponsRemaining: z.number().int().nonnegative(),
  unlockedSourceKeys: z.array(z.string()),
  unavailable: z.boolean().optional()
});

export const subscriberAccessCacheRecordSchema = z.object({
  savedAt: z.number().int().nonnegative(),
  access: subscriberAccessSchema
});

export type SubscriberAccessState = z.infer<typeof subscriberAccessSchema>;
export type SubscriberAccessCacheRecord = z.infer<typeof subscriberAccessCacheRecordSchema>;

export const guestSubscriberAccess: SubscriberAccessState = {
  userId: null,
  email: null,
  subscriptionStatus: "none",
  isSubscribed: false,
  couponLimit: 3,
  couponsUsed: 3,
  couponsRemaining: 0,
  unlockedSourceKeys: []
};

export function subscriberAccessPlaceholderData(input: {
  readonly isAuthenticated: boolean;
  readonly userId?: string | null;
  readonly email?: string | null;
  readonly previousData?: SubscriberAccessState;
  readonly cachedAccess?: SubscriberAccessState | null;
}): SubscriberAccessState | undefined {
  if (!input.isAuthenticated) return guestSubscriberAccess;
  if (matchesSubscriberIdentity(input.previousData, input.userId, input.email)) return input.previousData;
  if (matchesSubscriberIdentity(input.cachedAccess, input.userId, input.email)) return input.cachedAccess ?? undefined;
  return undefined;
}

export function matchesSubscriberIdentity(
  access: SubscriberAccessState | null | undefined,
  userId?: string | null,
  email?: string | null
) {
  if (!access) return false;
  const expectedEmail = normalizeSubscriberIdentity(email);
  const expectedUserId = normalizeSubscriberIdentity(userId);
  if (!expectedEmail || normalizeSubscriberIdentity(access.email) !== expectedEmail) return false;
  return !expectedUserId || normalizeSubscriberIdentity(access.userId) === expectedUserId;
}

export function subscriberAccessBrowserCacheKey(userId?: string | null, email?: string | null) {
  const cleanEmail = normalizeSubscriberIdentity(email);
  if (!cleanEmail) return null;
  const cleanUserId = normalizeSubscriberIdentity(userId) || cleanEmail;
  return `aigentra:subscriber-access:${encodeURIComponent(cleanUserId)}:${encodeURIComponent(cleanEmail)}`;
}

export function readCachedSubscriberAccess(userId?: string | null, email?: string | null): SubscriberAccessState | null {
  const cacheKey = subscriberAccessBrowserCacheKey(userId, email);
  if (!cacheKey || typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = subscriberAccessCacheRecordSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (Date.now() - parsed.data.savedAt > SUBSCRIBER_ACCESS_BROWSER_CACHE_MS) return null;
    return matchesSubscriberIdentity(parsed.data.access, userId, email) ? parsed.data.access : null;
  } catch (error) {
    if (isBrowserCacheReadError(error)) return null;
    throw error;
  }
}

export function writeCachedSubscriberAccess(access: SubscriberAccessState): void {
  const cacheKey = subscriberAccessBrowserCacheKey(access.userId, access.email);
  if (!cacheKey || typeof window === "undefined") return;
  const record: SubscriberAccessCacheRecord = { savedAt: Date.now(), access };

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(record));
  } catch (error) {
    if (isBrowserStorageWriteError(error)) return;
    throw error;
  }
}

function normalizeSubscriberIdentity(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function isBrowserCacheReadError(error: unknown) {
  return error instanceof SyntaxError || isDomException(error);
}

function isBrowserStorageWriteError(error: unknown) {
  return isDomException(error);
}

function isDomException(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException;
}
