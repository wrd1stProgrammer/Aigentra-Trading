import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, authSetupComplete } from "@/auth";
import { SubscriberAccessApiError, unlockSubscriberSource } from "@/lib/subscriber-access-api";

export const dynamic = "force-dynamic";

const unlockRequestSchema = z.object({
  sourceKey: z.string().min(1),
  sourceType: z.enum(["scenario", "review", "trader_detail"]).default("scenario"),
  traderId: z.string().optional(),
  symbol: z.string().optional()
});

export async function POST(request: Request) {
  const identity = await subscriberIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = unlockRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_unlock_request" }, { status: 400 });
  }

  try {
    return NextResponse.json(await unlockSubscriberSource({ identity, ...parsed.data }));
  } catch (error) {
    if (error instanceof SubscriberAccessApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "subscriber_unlock_request_failed" }, { status: 502 });
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
