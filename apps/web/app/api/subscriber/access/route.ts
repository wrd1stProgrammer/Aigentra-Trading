import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { readSubscriberAccess, SubscriberAccessApiError, type SubscriberAccessState } from "@/lib/subscriber-access-api";

export const dynamic = "force-dynamic";

type SubscriberIdentity = {
  readonly userId: string;
  readonly email: string;
};

export async function GET() {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await readSubscriberAccess(identity));
  } catch (error) {
    if (error instanceof SubscriberAccessApiError) {
      if (error.status === 503 || error.status === 504) {
        return NextResponse.json(subscriberAccessFallback(identity), {
          headers: { "Cache-Control": "no-store" }
        });
      }
      const status = error.status === 503 || error.status === 504 ? error.status : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "subscriber_access_request_failed" }, { status: 502 });
  }
}

async function subscriberIdentity(): Promise<SubscriberIdentity | null> {
  if (!authSetupComplete) return null;

  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id ?? email;
  if (!email || !userId) return null;
  return { userId, email };
}

function subscriberAccessFallback(identity: SubscriberIdentity): SubscriberAccessState {
  return {
    userId: identity.userId,
    email: identity.email,
    subscriptionStatus: "pending",
    isSubscribed: false,
    couponLimit: 3,
    couponsUsed: 3,
    couponsRemaining: 0,
    unlockedSourceKeys: [],
    unavailable: true
  };
}
