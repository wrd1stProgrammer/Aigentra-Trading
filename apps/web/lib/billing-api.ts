import type { Locale } from "@/lib/i18n";
import { z } from "zod";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

const whopCheckoutSchema = z.object({
  checkoutId: z.string().min(1),
  planId: z.string(),
  purchaseUrl: z.string().url(),
  sandbox: z.boolean()
});

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export type WhopCheckoutResult = z.infer<typeof whopCheckoutSchema>;

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

function whopCheckoutApiUrl(): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;
  return new URL("/api/billing/whop/checkout", baseUrl).toString();
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
