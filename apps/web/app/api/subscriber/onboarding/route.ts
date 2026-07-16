import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { loadSubscriberOnboarding, saveSubscriberOnboarding } from "@/lib/subscriber-onboarding-api";
import { subscriberOnboardingAnswersSchema } from "@/lib/subscriber-onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await subscriberIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await loadSubscriberOnboarding(identity);
  return status
    ? NextResponse.json(status)
    : NextResponse.json({ error: "subscriber_onboarding_unavailable" }, { status: 502 });
}

export async function PUT(request: Request) {
  const identity = await subscriberIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = subscriberOnboardingAnswersSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: "invalid_onboarding_answers" }, { status: 400 });
  const status = await saveSubscriberOnboarding(identity, parsed.data);
  return status?.completed
    ? NextResponse.json(status)
    : NextResponse.json({ error: "subscriber_onboarding_unavailable" }, { status: 502 });
}

async function subscriberIdentity(): Promise<{ readonly userId: string; readonly email: string } | null> {
  if (!authSetupComplete) return null;
  const session = await auth();
  const email = session?.user?.email;
  const userId = session?.user?.id ?? email;
  return email && userId ? { userId, email } : null;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
