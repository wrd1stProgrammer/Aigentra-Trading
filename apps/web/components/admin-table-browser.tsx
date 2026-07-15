"use client";

import { useState } from "react";
import { CaretLeft, CaretRight, Rows } from "@phosphor-icons/react";
import type { AdminTableResult } from "@/lib/admin-api";
import { formatAdminCell, formatAdminNumber } from "@/lib/admin-dashboard-format";

type AdminTableBrowserProps = {
  readonly tableNames: readonly string[];
  readonly initialTable: AdminTableResult;
};

export function AdminTableBrowser({ tableNames, initialTable }: AdminTableBrowserProps) {
  const [table, setTable] = useState(initialTable);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchAdminTable = async (tableName: string, offset = 0) => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const url = new URL("/api/admin/table", window.location.origin);
      url.searchParams.set("table", tableName);
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(table.limit));
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("admin_table_load_failed");
      setTable(await response.json());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "admin_table_load_failed");
    } finally {
      setIsLoading(false);
    }
  };

  const canGoBack = table.offset > 0;
  const canGoForward = table.offset + table.limit < table.total;

  return (
    <section aria-labelledby="table-browser-heading">
      <div className="mb-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Database</p>
        <h2 id="table-browser-heading" className="mt-1 text-lg font-semibold text-[var(--ink)]">Table Browser</h2>
      </div>

      <div className="grid min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="관리자 데이터 테이블" className="border-b border-[var(--border)] bg-[var(--surface-muted)] p-2 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
            {tableNames.map((tableName) => (
              <button
                key={tableName}
                type="button"
                onClick={() => fetchAdminTable(tableName)}
                className={`focus-ring flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-left font-mono text-xs transition lg:w-full ${
                  table.table === tableName
                    ? "bg-[var(--surface-raised)] text-[var(--ink)] ring-1 ring-inset ring-[var(--border-strong)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]"
                }`}
              >
                <Rows size={14} className={table.table === tableName ? "text-[var(--accent)]" : "text-[var(--ink-soft)]"} />
                {tableName}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          <header className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-mono text-sm font-medium text-[var(--ink)]">{table.table}</h3>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">읽기 전용 · {formatAdminNumber(table.total)} rows</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="이전 페이지" disabled={isLoading || !canGoBack} onClick={() => fetchAdminTable(table.table, Math.max(0, table.offset - table.limit))} className="focus-ring rounded-md border border-[var(--border)] p-2 text-[var(--ink-muted)] disabled:cursor-not-allowed disabled:opacity-35">
                <CaretLeft size={15} />
              </button>
              <span className="min-w-20 text-center font-mono text-[11px] text-[var(--ink-soft)]">{table.offset + 1}–{Math.min(table.offset + table.limit, table.total)}</span>
              <button type="button" aria-label="다음 페이지" disabled={isLoading || !canGoForward} onClick={() => fetchAdminTable(table.table, table.offset + table.limit)} className="focus-ring rounded-md border border-[var(--border)] p-2 text-[var(--ink-muted)] disabled:cursor-not-allowed disabled:opacity-35">
                <CaretRight size={15} />
              </button>
            </div>
          </header>

          {errorMessage ? <p role="alert" className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">테이블을 불러오지 못했습니다.</p> : null}

          <div className={`overflow-x-auto transition-opacity ${isLoading ? "opacity-50" : "opacity-100"}`} aria-busy={isLoading}>
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                <tr>
                  {table.columns.map((column) => <th key={column} className="whitespace-nowrap border-b border-[var(--border)] px-4 py-3 font-medium">{column}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {table.rows.map((row, rowIndex) => (
                  <tr key={`${table.table}-${table.offset}-${rowIndex}`} className="text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-muted)]">
                    {table.columns.map((column) => <td key={column} className="max-w-64 truncate px-4 py-3 font-mono">{formatAdminCell(row[column])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.rows.length === 0 ? <div className="px-4 py-10 text-center text-sm text-[var(--ink-soft)]">표시할 데이터가 없습니다.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
