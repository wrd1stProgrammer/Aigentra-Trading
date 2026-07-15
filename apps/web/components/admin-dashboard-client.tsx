"use client";

import { useMemo, useState } from "react";
import { ArrowClockwise, ShieldCheck } from "@phosphor-icons/react";
import { AdminGrowthOverview } from "@/components/admin-growth-overview";
import { AdminOperationsPanels } from "@/components/admin-operations-panels";
import { AdminTableBrowser } from "@/components/admin-table-browser";
import type { AdminOverview, AdminTableResult } from "@/lib/admin-api";
import { formatAdminDateTime } from "@/lib/admin-dashboard-format";

type AdminDashboardClientProps = {
  readonly adminEmail: string;
  readonly initialOverview: AdminOverview;
  readonly initialTable: AdminTableResult;
};

export function AdminDashboardClient({ adminEmail, initialOverview, initialTable }: AdminDashboardClientProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const generatedAt = useMemo(() => formatAdminDateTime(overview.generatedAt), [overview.generatedAt]);

  const refreshOverview = async () => {
    setIsRefreshing(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!response.ok) throw new Error("admin_overview_refresh_failed");
      setOverview(await response.json());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "admin_overview_refresh_failed");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div data-testid="admin-dashboard" className="pb-24 text-[var(--ink)] md:pb-12">
      <header className="border-b border-[var(--border)] pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
              <span>Admin</span>
              <span className="text-[var(--ink-soft)]">/</span>
              <span className="text-[var(--ink-muted)]">Overview</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)]">운영 대시보드</h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">유입부터 유료 전환, 서비스 상태와 원본 데이터를 한곳에서 확인합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 font-mono text-[var(--ink-muted)]">
              <ShieldCheck size={15} className="text-[var(--accent)]" />
              {adminEmail}
            </span>
            <button
              type="button"
              onClick={refreshOverview}
              disabled={isRefreshing}
              className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 font-semibold text-[var(--ink)] transition hover:border-[var(--border-strong)] disabled:cursor-wait disabled:opacity-60"
            >
              <ArrowClockwise size={15} className={isRefreshing ? "animate-spin" : ""} />
              새로고침
            </button>
          </div>
        </div>
        <p className="mt-4 font-mono text-[11px] text-[var(--ink-soft)]">LAST SYNC {generatedAt}</p>
      </header>

      {errorMessage ? (
        <div role="alert" className="mt-4 rounded-md border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          데이터를 새로 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : null}

      <main className="mt-5 space-y-5">
        <AdminGrowthOverview growth={overview.growth} />
        <AdminOperationsPanels overview={overview} />
        <AdminTableBrowser tableNames={overview.tables} initialTable={initialTable} />
      </main>
    </div>
  );
}
