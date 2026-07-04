import { NextResponse } from "next/server";
import { AdminApiError, loadAdminTable } from "@/lib/admin-api";
import { AdminAuthError, requireAdminIdentity } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminIdentity();
    const url = new URL(request.url);
    const table = url.searchParams.get("table") ?? "";
    const offset = readNonnegativeInteger(url.searchParams.get("offset"));
    const limit = readPositiveInteger(url.searchParams.get("limit"));
    return NextResponse.json(await loadAdminTable(table, offset, limit));
  } catch (error) {
    return adminRouteErrorResponse(error);
  }
}

function readNonnegativeInteger(value: string | null): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function readPositiveInteger(value: string | null): number {
  const parsed = Number.parseInt(value ?? "25", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 25;
  return Math.min(parsed, 100);
}

function adminRouteErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AdminApiError) {
    const status = error.status === 400 || error.status === 401 || error.status === 503 || error.status === 504 ? error.status : 502;
    return NextResponse.json({ error: error.message }, { status });
  }
  throw error;
}
