import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { readSubscriberAccess, SubscriberAccessApiError } from "@/lib/subscriber-access-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await readSubscriberAccess(identity));
  } catch (error) {
    if (error instanceof SubscriberAccessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 503 ? 503 : 502 });
    }
    return NextResponse.json({ error: "subscriber_access_request_failed" }, { status: 502 });
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
