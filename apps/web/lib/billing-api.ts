import type { Locale } from "@/lib/i18n";
import { z } from "zod";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

const whopCheckoutSchema = z.object({
  checkoutId: z.string().min(1),
  planId: z.string(),
  purchaseUrl: z.string().url(),
  sandbox: z.boolean()
});

const whopSubscriptionStatusSchema = z.object({
  status: z.enum(["none", "pending", "active", "inactive"]),
  checkoutStatus: z.string(),
  planKey: z.string().nullable(),
  planId: z.string().nullable(),
  checkoutId: z.string().nullable(),
  paymentId: z.string().nullable(),
  membershipId: z.string().nullable(),
  currency: z.string().nullable(),
  amount: z.number().nullable(),
  sandbox: z.boolean()
});

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export type WhopCheckoutResult = z.infer<typeof whopCheckoutSchema>;
export type WhopSubscriptionStatus = z.infer<typeof whopSubscriptionStatusSchema>;

export class BillingApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "BillingApiError";
    this.status = status;
  }
}

export async function createWhopCheckout(input: {
  readonly identity: SubscriberIdentity;
  readonly locale: Locale;
  readonly redirectUrl: string;
  readonly sourceUrl: string;
}): Promise<WhopCheckoutResult> {
  const apiUrl = whopCheckoutApiUrl();
  if (!apiUrl) throw new BillingApiError("billing_api_unavailable", 503);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...subscriberApiHeaders() },
    body: JSON.stringify({
      userId: input.identity.userId,
      email: input.identity.email,
      locale: input.locale,
      redirectUrl: input.redirectUrl,
      sourceUrl: input.sourceUrl,
    }),
  });
  const responseBody: unknown = await safeJson(response);
  if (!response.ok) {
    throw new BillingApiError(readError(responseBody), response.status);
  }
  const parsed = whopCheckoutSchema.safeParse(responseBody);
  if (!parsed.success) throw new BillingApiError("invalid_billing_response", 502);
  return parsed.data;
}

export async function readWhopSubscriptionStatus(identity: SubscriberIdentity): Promise<WhopSubscriptionStatus> {
  const apiUrl = whopStatusApiUrl(identity);
  if (!apiUrl) throw new BillingApiError("billing_api_unavailable", 503);

  const response = await fetch(apiUrl, {
    cache: "no-store",
    headers: subscriberApiHeaders(),
  });
  const responseBody: unknown = await safeJson(response);
  if (!response.ok) {
    throw new BillingApiError(readError(responseBody), response.status);
  }
  const parsed = whopSubscriptionStatusSchema.safeParse(responseBody);
  if (!parsed.success) throw new BillingApiError("invalid_billing_response", 502);
  return parsed.data;
}

function whopCheckoutApiUrl(): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;
  return new URL("/api/billing/whop/checkout", baseUrl).toString();
}

function whopStatusApiUrl(identity: SubscriberIdentity): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;
  const url = new URL("/api/billing/whop/status", baseUrl);
  url.searchParams.set("userId", identity.userId);
  url.searchParams.set("email", identity.email);
  return url.toString();
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
  if (typeof input !== "object" || input === null || !("detail" in input)) return "billing_request_failed";
  return typeof input.detail === "string" ? input.detail : "billing_request_failed";
}
