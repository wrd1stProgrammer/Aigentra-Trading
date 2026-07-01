import { z } from "zod";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const SUBSCRIBER_ACCESS_TIMEOUT_MS = 8_000;

const subscriberAccessSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  subscriptionStatus: z.enum(["none", "pending", "active", "inactive"]),
  isSubscribed: z.boolean(),
  couponLimit: z.number().int().nonnegative(),
  couponsUsed: z.number().int().nonnegative(),
  couponsRemaining: z.number().int().nonnegative(),
  unlockedSourceKeys: z.array(z.string()),
  unavailable: z.boolean().optional()
});

const unlockResponseSchema = z.object({
  sourceKey: z.string().min(1),
  sourceType: z.string().min(1),
  unlocked: z.boolean(),
  charged: z.boolean(),
  access: subscriberAccessSchema
});

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export type SubscriberAccessState = z.infer<typeof subscriberAccessSchema>;
export type SubscriberUnlockResponse = z.infer<typeof unlockResponseSchema>;

export class SubscriberAccessApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "SubscriberAccessApiError";
    this.status = status;
  }
}

export async function readSubscriberAccess(identity: SubscriberIdentity): Promise<SubscriberAccessState> {
  const apiUrl = subscriberAccessApiUrl(identity);
  if (!apiUrl) throw new SubscriberAccessApiError("subscriber_access_unavailable", 503);

  const timeout = subscriberAccessTimeoutSignal();
  try {
    const response = await fetch(apiUrl, {
      cache: "no-store",
      headers: subscriberApiHeaders(),
      signal: timeout.signal
    });
    const responseBody: unknown = await safeJson(response);
    if (!response.ok) {
      throw new SubscriberAccessApiError(readError(responseBody), response.status);
    }
    const parsed = subscriberAccessSchema.safeParse(responseBody);
    if (!parsed.success) throw new SubscriberAccessApiError("invalid_subscriber_access_response", 502);
    return parsed.data;
  } catch (error) {
    if (isAbortError(error)) throw new SubscriberAccessApiError("subscriber_access_timeout", 504);
    throw error;
  } finally {
    timeout.clear();
  }
}

export async function unlockSubscriberSource(input: {
  readonly identity: SubscriberIdentity;
  readonly sourceKey: string;
  readonly sourceType: "scenario" | "review" | "trader_detail";
  readonly traderId?: string;
  readonly symbol?: string;
}): Promise<SubscriberUnlockResponse> {
  const apiUrl = subscriberUnlockApiUrl();
  if (!apiUrl) throw new SubscriberAccessApiError("subscriber_access_unavailable", 503);

  const timeout = subscriberAccessTimeoutSignal();
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...subscriberApiHeaders() },
      body: JSON.stringify({
        userId: input.identity.userId,
        email: input.identity.email,
        sourceKey: input.sourceKey,
        sourceType: input.sourceType,
        traderId: input.traderId,
        symbol: input.symbol
      }),
      signal: timeout.signal
    });
    const responseBody: unknown = await safeJson(response);
    if (!response.ok) {
      throw new SubscriberAccessApiError(readError(responseBody), response.status);
    }
    const parsed = unlockResponseSchema.safeParse(responseBody);
    if (!parsed.success) throw new SubscriberAccessApiError("invalid_subscriber_unlock_response", 502);
    return parsed.data;
  } catch (error) {
    if (isAbortError(error)) throw new SubscriberAccessApiError("subscriber_access_timeout", 504);
    throw error;
  } finally {
    timeout.clear();
  }
}

function subscriberAccessTimeoutSignal(timeoutMs = SUBSCRIBER_ACCESS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("subscriber_access_timeout"), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

function subscriberAccessApiUrl(identity: SubscriberIdentity): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;
  const url = new URL("/api/subscribers/access", baseUrl);
  url.searchParams.set("userId", identity.userId);
  url.searchParams.set("email", identity.email);
  return url.toString();
}

function subscriberUnlockApiUrl(): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;
  return new URL("/api/subscribers/access/unlock", baseUrl).toString();
}

function subscriberApiHeaders(): Record<string, string> {
  const token = process.env.SUBSCRIBER_API_TOKEN?.trim();
  return token ? { "X-Subscriber-Api-Token": token } : {};
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readError(input: unknown): string {
  if (typeof input !== "object" || input === null || !("detail" in input)) return "subscriber_access_request_failed";
  return typeof input.detail === "string" ? input.detail : "subscriber_access_request_failed";
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /abort|timeout/i.test(message);
}
