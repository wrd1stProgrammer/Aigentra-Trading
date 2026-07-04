import { NextResponse } from "next/server";
import { AdminApiError, loadAdminOverview } from "@/lib/admin-api";
import { AdminAuthError, requireAdminIdentity } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminIdentity();
    return NextResponse.json(await loadAdminOverview());
  } catch (error) {
    return adminRouteErrorResponse(error);
  }
}

function adminRouteErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AdminApiError) {
    const status = error.status === 401 || error.status === 503 || error.status === 504 ? error.status : 502;
    return NextResponse.json({ error: error.message }, { status });
  }
  throw error;
}
