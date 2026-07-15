import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AdminApiError, recordAdminVisit } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "aigentra_visitor_id";
const VISITOR_COOKIE_MAX_AGE_SECONDS = 31_536_000;

export async function POST() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.ADMIN_API_TOKEN?.trim();
  if (!secret) return NextResponse.json({ error: "analytics_unavailable" }, { status: 503 });

  const cookieStore = await cookies();
  const storedVisitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  const visitorId = storedVisitorId || randomUUID();
  const session = await auth();
  const userIdentity = session?.user?.id || session?.user?.email || null;

  try {
    await recordAdminVisit(hashIdentifier(visitorId, secret), userIdentity ? hashIdentifier(userIdentity, secret) : null);
  } catch (error) {
    if (error instanceof AdminApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status >= 500 ? error.status : 502 });
    }
    throw error;
  }

  const response = new NextResponse(null, { status: 204 });
  if (!storedVisitorId) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }
  return response;
}

function hashIdentifier(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
