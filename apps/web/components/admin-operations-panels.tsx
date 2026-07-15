import type { ReactNode } from "react";
import { ChartLineUp, CheckCircle, Database, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { AdminOverview } from "@/lib/admin-api";
import { formatAdminCurrency, formatAdminDateTime, formatAdminNumber } from "@/lib/admin-dashboard-format";

export function AdminOperationsPanels({ overview }: { readonly overview: AdminOverview }) {
  return (
    <section aria-labelledby="operations-heading">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Operations</p>
          <h2 id="operations-heading" className="mt-1 text-lg font-semibold text-[var(--ink)]">서비스 상태</h2>
        </div>
        <p className="hidden text-xs text-[var(--ink-soft)] sm:block">실시간 운영 상태와 최근 변경사항</p>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] xl:grid-cols-2">
        <Panel title="인프라 및 거래 상태" eyebrow="System health">
          <StatusRow icon={<Database size={17} />} label="Database" value={`${overview.database.status.toUpperCase()} · ${overview.database.tableCount} tables`} healthy={overview.database.status === "ok"} />
          <StatusRow icon={<ChartLineUp size={17} />} label="Open exposure" value={`${overview.paper.openPositions} positions · ${formatAdminCurrency(overview.paper.openNotional)}`} healthy />
          <StatusRow icon={<WarningCircle size={17} />} label="API errors" value={`${overview.totals.apiErrors24h} in 24h`} healthy={overview.totals.apiErrors24h === 0} />
          <StatusRow icon={<CheckCircle size={17} />} label="Trade events" value={`${overview.totals.tradeEvents24h} in 24h`} healthy />
        </Panel>

        <Panel title="최근 가입 사용자" eyebrow="Users">
          {overview.recentSubscribers.map((subscriber) => (
            <DataRow
              key={subscriber.id}
              title={subscriber.email}
              meta={`${formatAdminDateTime(subscriber.createdAt)} · Telegram ${subscriber.telegramEnabled ? "on" : "off"}`}
              value={subscriber.subscriptionStatus}
            />
          ))}
          {overview.recentSubscribers.length === 0 ? <EmptyRow label="최근 가입 사용자가 없습니다" /> : null}
        </Panel>

        <Panel title="최근 거래 이벤트" eyebrow="Paper engine">
          {overview.recentEvents.map((event) => (
            <DataRow
              key={event.id}
              title={`${event.traderId ?? "unknown"} · ${event.eventType}`}
              meta={`${event.symbol ?? "-"} · ${formatAdminDateTime(event.createdAt)}`}
              value={formatAdminCurrency(event.realizedPnl ?? 0)}
            />
          ))}
          {overview.recentEvents.length === 0 ? <EmptyRow label="최근 거래 이벤트가 없습니다" /> : null}
        </Panel>

        <Panel title="느리거나 실패한 API" eyebrow="Latency">
          {overview.slowApiCalls.map((call) => (
            <DataRow
              key={call.id}
              title={call.endpoint ?? "unknown endpoint"}
              meta={`${call.method ?? "GET"} · ${call.status} · ${formatAdminDateTime(call.createdAt)}`}
              value={call.latencyMs === null ? "-" : `${formatAdminNumber(call.latencyMs)}ms`}
            />
          ))}
          {overview.slowApiCalls.length === 0 ? <EmptyRow label="느린 API 기록이 없습니다" /> : null}
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, eyebrow, children }: { readonly title: string; readonly eyebrow: string; readonly children: ReactNode }) {
  return (
    <section className="min-w-0 border-b border-[var(--border)] p-4 last:border-b-0 xl:border-r xl:[&:nth-child(2n)]:border-r-0 xl:[&:nth-last-child(-n+2)]:border-b-0 sm:p-5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">{title}</h3>
      <div className="mt-3 divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

function StatusRow({ icon, label, value, healthy }: { readonly icon: ReactNode; readonly label: string; readonly value: string; readonly healthy: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-3">
      <span className="text-[var(--ink-soft)]">{icon}</span>
      <span className="min-w-0 flex-1 text-sm text-[var(--ink-muted)]">{label}</span>
      <span className={`truncate font-mono text-xs ${healthy ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>{value}</span>
    </div>
  );
}

function DataRow({ title, meta, value }: { readonly title: string; readonly meta: string; readonly value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{title}</p>
        <p className="mt-1 truncate text-xs text-[var(--ink-soft)]">{meta}</p>
      </div>
      <span className="shrink-0 font-mono text-xs text-[var(--ink-muted)]">{value}</span>
    </div>
  );
}

function EmptyRow({ label }: { readonly label: string }) {
  return <div className="py-5 text-sm text-[var(--ink-soft)]">{label}</div>;
}
