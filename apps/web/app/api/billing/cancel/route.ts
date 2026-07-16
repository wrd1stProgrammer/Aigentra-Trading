import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { BillingApiError, cancelWhopSubscription } from "@/lib/billing-api";

export const dynamic = "force-dynamic";

export async function POST() {
  const identity = await subscriberIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await cancelWhopSubscription(identity));
  } catch (error) {
    if (error instanceof BillingApiError) {
      const status = error.status === 409 ? 409 : error.status === 503 ? 503 : 502;
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
  return email && userId ? { userId, email } : null;
}
