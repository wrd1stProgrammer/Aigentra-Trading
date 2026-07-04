"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowClockwise,
  ChartLineUp,
  Database,
  ShieldCheck,
  Table,
  UserCircle,
  WarningCircle
} from "@phosphor-icons/react";
import type { AdminOverview, AdminTableResult } from "@/lib/admin-api";

type AdminDashboardClientProps = {
  readonly adminEmail: string;
  readonly initialOverview: AdminOverview;
  readonly initialTable: AdminTableResult;
};

export function AdminDashboardClient({ adminEmail, initialOverview, initialTable }: AdminDashboardClientProps) {
  const [overview, setOverview] = useState(initialOverview);
  const [table, setTable] = useState(initialTable);
  const [selectedTable, setSelectedTable] = useState(initialTable.table);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const generatedAt = useMemo(() => formatDateTime(overview.generatedAt), [overview.generatedAt]);

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

  const fetchAdminTable = async (nextTable = selectedTable, offset = 0) => {
    setTableLoading(true);
    setErrorMessage("");
    try {
      const url = new URL("/api/admin/table", window.location.origin);
      url.searchParams.set("table", nextTable);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(table.limit));
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("admin_table_load_failed");
      setTable(await response.json());
      setSelectedTable(nextTable);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "admin_table_load_failed");
    } finally {
      setTableLoading(false);
    }
  };

  return (
    <div data-testid="admin-dashboard" className="space-y-5 pb-12 text-zinc-100">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-300">Admin Console</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Aigentra 운영 대시보드</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            RDS 이전 후 필요한 DB 상태, 유저/구독, 페이퍼 트레이딩, API 지연을 한 화면에서 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 font-mono text-emerald-200">
            <ShieldCheck size={15} />
            {adminEmail}
          </span>
          <button type="button" onClick={refreshOverview} className="focus-ring ghost-button border-white/10 bg-white/[0.04] text-zinc-200">
            <ArrowClockwise size={15} className={isRefreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="DB Overview" value={overview.database.status.toUpperCase()} detail={`${overview.database.dialect} · ${overview.database.tableCount} tables`} icon={<Database size={18} />} />
        <MetricCard title="Subscribers" value={formatNumber(overview.totals.subscribers)} detail={`${overview.totals.activeSubscriptions} active · ${overview.totals.telegramLinked} Telegram`} icon={<UserCircle size={18} />} />
        <MetricCard title="Paper Trading" value={formatNumber(overview.paper.openPositions)} detail={`${formatCurrency(overview.paper.openNotional)} open notional`} icon={<ChartLineUp size={18} />} />
        <MetricCard title="API Incidents" value={formatNumber(overview.totals.apiErrors24h)} detail={`24h errors · updated ${generatedAt}`} icon={<WarningCircle size={18} />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Panel title="Recent trade events" eyebrow="Paper engine">
          <div className="divide-y divide-white/[0.06]">
            {overview.recentEvents.map((event) => (
              <DataRow
                key={event.id}
                title={`${event.traderId ?? "unknown"} · ${event.eventType}`}
                meta={`${event.symbol ?? "-"} · ${formatDateTime(event.createdAt)}`}
                value={formatCurrency(event.realizedPnl ?? 0)}
              />
            ))}
            {overview.recentEvents.length === 0 ? <EmptyRow label="최근 이벤트 없음" /> : null}
          </div>
        </Panel>

        <Panel title="Recent subscribers" eyebrow="Users">
          <div className="divide-y divide-white/[0.06]">
            {overview.recentSubscribers.map((subscriber) => (
              <DataRow
                key={subscriber.id}
                title={subscriber.email}
                meta={`${subscriber.subscriptionStatus} · Telegram ${subscriber.telegramEnabled ? "on" : "off"}`}
                value={subscriber.locale.toUpperCase()}
              />
            ))}
            {overview.recentSubscribers.length === 0 ? <EmptyRow label="최근 유저 없음" /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel title="Slow or failed API calls" eyebrow="Latency">
          <div className="divide-y divide-white/[0.06]">
            {overview.slowApiCalls.map((call) => (
              <DataRow
                key={call.id}
                title={call.endpoint ?? "unknown endpoint"}
                meta={`${call.method ?? "GET"} · ${call.status} · ${formatDateTime(call.createdAt)}`}
                value={call.latencyMs === null ? "-" : `${call.latencyMs}ms`}
              />
            ))}
            {overview.slowApiCalls.length === 0 ? <EmptyRow label="느린 API 기록 없음" /> : null}
          </div>
        </Panel>

        <Panel title="Table Browser" eyebrow="Read-only whitelist">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedTable}
              onChange={(event) => setSelectedTable(event.target.value)}
              className="focus-ring min-h-10 rounded-lg border border-white/10 bg-[#080b0a] px-3 text-sm text-zinc-100"
            >
              {overview.tables.map((tableName) => (
                <option key={tableName} value={tableName}>
                  {tableName}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => fetchAdminTable(selectedTable, 0)} className="focus-ring ghost-button border-white/10 bg-white/[0.04] text-zinc-200">
              <Table size={15} />
              Load table
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                <tr>
                  {table.columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-3 py-2 font-bold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${table.table}-${table.offset}-${rowIndex}`} className="text-zinc-300">
                    {table.columns.map((column) => (
                      <td key={column} className="max-w-[260px] truncate px-3 py-2 font-mono">
                        {formatCell(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>{table.table} · {table.total} rows</span>
            <button
              type="button"
              disabled={tableLoading || table.offset + table.limit >= table.total}
              onClick={() => fetchAdminTable(table.table, table.offset + table.limit)}
              className="focus-ring rounded-lg border border-white/10 px-3 py-2 font-semibold text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tableLoading ? "Loading" : "Next"}
            </button>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function MetricCard({ title, value, detail, icon }: { readonly title: string; readonly value: string; readonly detail: string; readonly icon: ReactNode }) {
  return (
    <article className="panel bg-[#0d1210] p-4">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-xs font-bold">{title}</span>
        {icon}
      </div>
      <p className="mt-4 font-mono text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </article>
  );
}

function Panel({ title, eyebrow, children }: { readonly title: string; readonly eyebrow: string; readonly children: ReactNode }) {
  return (
    <section className="panel bg-[#0d1210] p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-300">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DataRow({ title, meta, value }: { readonly title: string; readonly meta: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-200">{title}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">{meta}</p>
      </div>
      <span className="shrink-0 font-mono text-sm font-bold text-zinc-100">{value}</span>
    </div>
  );
}

function EmptyRow({ label }: { readonly label: string }) {
  return <div className="py-5 text-sm text-zinc-500">{label}</div>;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "currency", currency: "USD" }).format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
