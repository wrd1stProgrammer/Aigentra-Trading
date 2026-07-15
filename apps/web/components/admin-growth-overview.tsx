import type { ReactNode } from "react";
import { CreditCard, TrendUp, UserPlus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { AdminOverview } from "@/lib/admin-api";
import { formatAdminNumber, formatAdminShortDate } from "@/lib/admin-dashboard-format";

type AdminGrowth = AdminOverview["growth"];

export function AdminGrowthOverview({ growth }: { readonly growth: AdminGrowth }) {
  const today = growth.today;
  const yesterday = growth.yesterday;
  return (
    <section aria-labelledby="growth-heading" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">Today · KST</p>
          <h2 id="growth-heading" className="mt-1 text-lg font-semibold text-[var(--ink)]">오늘의 성장 퍼널</h2>
        </div>
        <p className="text-xs text-[var(--ink-soft)]">순사용자는 로그인 계정과 익명 브라우저를 당일 기준으로 중복 제거합니다.</p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4">
        <GrowthMetric
          label="순사용자"
          value={formatAdminNumber(today.uniqueVisitors)}
          detail="오늘 사이트를 방문한 고유 사용자"
          current={today.uniqueVisitors}
          previous={yesterday.uniqueVisitors}
          series={growth.series.map((day) => day.uniqueVisitors)}
          icon={<UsersThree size={18} />}
        />
        <GrowthMetric
          label="신규 가입"
          value={formatAdminNumber(today.signups)}
          detail="오늘 처음 생성된 계정"
          current={today.signups}
          previous={yesterday.signups}
          series={growth.series.map((day) => day.signups)}
          icon={<UserPlus size={18} />}
        />
        <GrowthMetric
          label="유료 전환"
          value={formatAdminNumber(today.paidConversions)}
          detail="오늘 결제가 확인된 고유 사용자"
          current={today.paidConversions}
          previous={yesterday.paidConversions}
          series={growth.series.map((day) => day.paidConversions)}
          icon={<CreditCard size={18} />}
        />
        <GrowthMetric
          label="가입→구독 전환율"
          value={`${today.signupConversionRate.toFixed(1)}%`}
          detail="오늘 유료 전환 ÷ 오늘 신규 가입"
          current={today.signupConversionRate}
          previous={yesterday.signupConversionRate}
          series={growth.series.map((day) => day.signupConversionRate)}
          icon={<TrendUp size={18} />}
          percentagePoints
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-[11px] text-[var(--ink-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>최근 7일 추이 · {formatAdminShortDate(growth.series[0]?.date ?? null)}–{formatAdminShortDate(today.date)}</span>
        <span>{growth.trackingStartedAt ? `방문 데이터 수집 시작 ${formatAdminShortDate(growth.trackingStartedAt)}` : "방문 데이터가 오늘부터 수집됩니다"}</span>
      </div>
    </section>
  );
}

function GrowthMetric(props: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly current: number;
  readonly previous: number;
  readonly series: readonly number[];
  readonly icon: ReactNode;
  readonly percentagePoints?: boolean;
}) {
  const delta = props.current - props.previous;
  const deltaLabel = props.percentagePoints
    ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%p`
    : `${delta >= 0 ? "+" : ""}${formatAdminNumber(delta)}`;
  return (
    <article className="group min-w-0 border-b border-[var(--border)] p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0 sm:p-5">
      <div className="flex items-center justify-between gap-3 text-[var(--ink-muted)]">
        <h3 className="text-xs font-medium">{props.label}</h3>
        <span className="text-[var(--ink-soft)]">{props.icon}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="font-mono text-3xl font-medium tabular-nums tracking-tight text-[var(--ink)]">{props.value}</p>
        <span className={`mb-1 font-mono text-[11px] ${delta > 0 ? "text-[var(--good)]" : delta < 0 ? "text-[var(--bad)]" : "text-[var(--ink-soft)]"}`}>
          {deltaLabel} 전일 대비
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-soft)]">{props.detail}</p>
      <Sparkline values={props.series} label={`${props.label} 최근 7일 추이`} />
    </article>
  );
}

function Sparkline({ values, label }: { readonly values: readonly number[]; readonly label: string }) {
  const maximum = Math.max(...values, 1);
  return (
    <div role="img" aria-label={`${label}: ${values.join(", ")}`} className="mt-4 flex h-8 items-end gap-1" title={label}>
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          className="min-h-px flex-1 rounded-sm bg-[var(--accent)] opacity-25 transition-opacity group-hover:opacity-45"
          style={{ height: `${Math.max(8, (value / maximum) * 100)}%` }}
        />
      ))}
    </div>
  );
}
