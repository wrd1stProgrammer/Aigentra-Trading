import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { createSubscriberPreferences, mergeStoredSubscriberPreferences } from "@/lib/subscriber-preferences";
import { loadSubscriberPreferences, saveSubscriberPreferences } from "@/lib/subscriber-preference-api";
import { isSupportedLocale, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await loadSubscriberPreferences(identity));
}

export async function PUT(request: Request) {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const basePreferences = createSubscriberPreferences(identity);
  const body: unknown = await readJson(request);
  const nextPreferences = mergeStoredSubscriberPreferences(basePreferences, body);
  const locale = readLocale(body);
  const savedPreferences = await saveSubscriberPreferences(nextPreferences, locale);
  if (!savedPreferences) {
    return NextResponse.json({ error: "subscriber_preferences_unavailable" }, { status: 502 });
  }

  return NextResponse.json(savedPreferences);
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
  if (typeof input !== "object" || input === null || !("locale" in input)) return "en";
  const locale = input.locale;
  return typeof locale === "string" && isSupportedLocale(locale) ? locale : "en";
}
