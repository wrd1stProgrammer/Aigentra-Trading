import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { createTelegramStartLink } from "@/lib/subscriber-preference-api";

export const dynamic = "force-dynamic";

export async function POST() {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const link = await createTelegramStartLink(identity);
  if (!link) {
    return NextResponse.json({ error: "telegram_link_unavailable" }, { status: 502 });
  }

  return NextResponse.json(link);
}

async function subscriberIdentity() {
  if (!authSetupComplete) return null;

  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id ?? email;
  if (!email || !userId) return null;
  return { userId, email };
}
