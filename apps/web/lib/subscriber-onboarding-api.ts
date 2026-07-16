import { resolveExternalApiBaseUrl } from "@/lib/api-base-url";
import {
  subscriberOnboardingStatusSchema,
  type SubscriberOnboardingAnswers,
  type SubscriberOnboardingStatus
} from "@/lib/subscriber-onboarding";

const ONBOARDING_TIMEOUT_MS = 4_000;

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export async function loadSubscriberOnboarding(
  identity: SubscriberIdentity
): Promise<SubscriberOnboardingStatus | null> {
  return requestSubscriberOnboarding(identity, "GET");
}

export async function saveSubscriberOnboarding(
  identity: SubscriberIdentity,
  answers: SubscriberOnboardingAnswers
): Promise<SubscriberOnboardingStatus | null> {
  return requestSubscriberOnboarding(identity, "PUT", answers);
}

async function requestSubscriberOnboarding(
  identity: SubscriberIdentity,
  method: "GET" | "PUT",
  answers?: SubscriberOnboardingAnswers
): Promise<SubscriberOnboardingStatus | null> {
  const url = subscriberOnboardingApiUrl(identity);
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("subscriber_onboarding_timeout"), ONBOARDING_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      cache: "no-store",
      headers: method === "PUT"
        ? { "Content-Type": "application/json", ...subscriberApiHeaders() }
        : subscriberApiHeaders(),
      body: method === "PUT" && answers ? JSON.stringify({ ...identity, ...answers }) : undefined,
      signal: controller.signal
    });
    if (!response.ok) return null;
    const parsed = subscriberOnboardingStatusSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function subscriberOnboardingApiUrl(identity: SubscriberIdentity): string | null {
  const baseUrl = resolveExternalApiBaseUrl();
  if (!baseUrl) return null;
  const url = new URL("/api/subscribers/onboarding", baseUrl);
  url.searchParams.set("userId", identity.userId);
  url.searchParams.set("email", identity.email);
  return url.toString();
}

function subscriberApiHeaders(): Record<string, string> {
  const token = process.env.SUBSCRIBER_API_TOKEN?.trim();
  return token ? { "X-Subscriber-Api-Token": token } : {};
}
