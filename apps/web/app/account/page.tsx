import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, authSetupComplete } from "@/auth";
import { SubscriberAccountClient } from "@/components/subscriber-account-client";
import { createNoindexMetadata } from "@/lib/seo";
import { loadSubscriberPreferences } from "@/lib/subscriber-preference-api";

export const metadata: Metadata = createNoindexMetadata("Account", "/account");

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = authSetupComplete ? await auth() : null;
  const email = session?.user?.email;
  const userId = session?.user?.id ?? email;

  if (!email || !userId) {
    redirect("/login?next=/account");
  }

  return (
    <SubscriberAccountClient
      initialPreferences={await loadSubscriberPreferences({
        userId,
        email
      })}
      botTokenConfigured={Boolean(process.env.TELEGRAM_BOT_TOKEN)}
    />
  );
}
