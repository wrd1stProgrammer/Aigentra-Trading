import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDashboardClient } from "@/components/admin-dashboard-client";
import { AdminApiError, loadAdminOverview, loadAdminTable } from "@/lib/admin-api";
import { AdminAuthError, requireAdminIdentity } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Admin | Aigentra Trading"
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let identity;
  try {
    identity = await requireAdminIdentity();
  } catch (error) {
    if (error instanceof AdminAuthError && error.status === 401) redirect("/login?next=/admin");
    if (error instanceof AdminAuthError) return <AdminDenied />;
    throw error;
  }

  try {
    const [overview, initialTable] = await Promise.all([
      loadAdminOverview(),
      loadAdminTable("subscriber_preferences")
    ]);
    return <AdminDashboardClient adminEmail={identity.email} initialOverview={overview} initialTable={initialTable} />;
  } catch (error) {
    if (error instanceof AdminApiError) {
      return <AdminUnavailable message={error.message} status={error.status} />;
    }
    throw error;
  }
}

function AdminDenied() {
  return (
    <section className="panel mx-auto max-w-2xl border-rose-400/30 bg-rose-950/10 p-6">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-rose-300">Admin Access</p>
      <h1 className="mt-3 text-2xl font-bold text-white">관리자 권한이 없습니다</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">ADMIN_EMAILS allowlist에 포함된 Google 계정만 운영 콘솔을 열 수 있습니다.</p>
    </section>
  );
}

function AdminUnavailable({ message, status }: { readonly message: string; readonly status: number }) {
  return (
    <section className="panel mx-auto max-w-2xl border-amber-400/30 bg-amber-950/10 p-6">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-amber-300">Admin API</p>
      <h1 className="mt-3 text-2xl font-bold text-white">관리자 데이터를 불러오지 못했습니다</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {message} · HTTP {status}
      </p>
    </section>
  );
}
