import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { BillingApiError, createWhopCheckout } from "@/lib/billing-api";
import { readBillingPlanKey } from "@/lib/billing-plans";
import { isSupportedLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const origin = checkoutOrigin(request);
  const requestBody = await readJson(request);
  const locale = readLocale(requestBody);
  const planKey = readBillingPlanKey(readPlanKey(requestBody));
  const redirectUrl = new URL("/leaderboard?billing=whop-success", origin).toString();
  const sourceUrl = new URL("/", origin).toString();

  try {
    return NextResponse.json(await createWhopCheckout({ identity, locale, planKey, redirectUrl, sourceUrl }));
  } catch (error) {
    if (error instanceof BillingApiError) {
      const status = error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "billing_request_failed" }, { status: 502 });
  }
}

async function subscriberIdentity() {
  if (!authSetupComplete) return null;

  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id ?? email;
  if (!email || !userId) return null;
  return { userId, email };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function readLocale(input: unknown): Locale {
  if (typeof input !== "object" || input === null || !("locale" in input)) return "ko";
  const locale = input.locale;
  return typeof locale === "string" && isSupportedLocale(locale) ? locale : "ko";
}

function readPlanKey(input: unknown): unknown {
  if (typeof input !== "object" || input === null || !("planKey" in input)) return undefined;
  return input.planKey;
}

function checkoutOrigin(request: Request): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "";
  const configuredOrigin = parseOrigin(configuredUrl);
  return configuredOrigin ?? new URL(request.url).origin;
}

function parseOrigin(value: string): string | null {
  if (!value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
