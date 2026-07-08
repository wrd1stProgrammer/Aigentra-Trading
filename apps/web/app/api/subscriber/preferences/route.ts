import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { mergeStoredSubscriberPreferences, type SubscriberPreferences } from "@/lib/subscriber-preferences";
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

  const currentPreferences = await loadSubscriberPreferences(identity);
  const body: unknown = await readJson(request);
  const nextPreferences = mergeSubscriberPreferencePatch(currentPreferences, body);
  const savedPreferences = await saveSubscriberPreferences(nextPreferences, nextPreferences.locale);
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

function mergeSubscriberPreferencePatch(currentPreferences: SubscriberPreferences, input: unknown): SubscriberPreferences {
  if (!isRecord(input)) return currentPreferences;

  return mergeStoredSubscriberPreferences(currentPreferences, {
    locale: readLocaleWithFallback(input, currentPreferences.locale),
    favoriteTraderIds: "favoriteTraderIds" in input ? input["favoriteTraderIds"] : currentPreferences.favoriteTraderIds,
    telegramSettings: "telegramSettings" in input ? input["telegramSettings"] : currentPreferences.telegramSettings
  });
}

function readLocaleWithFallback(input: unknown, fallback: Locale): Locale {
  if (!isRecord(input) || !("locale" in input)) return fallback;
  const locale = input["locale"];
  return typeof locale === "string" && isSupportedLocale(locale) ? locale : fallback;
}

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
