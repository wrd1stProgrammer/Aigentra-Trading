import Link from "next/link";
import { ArrowRight, Circle } from "@phosphor-icons/react";
import type { UIEvent } from "react";

import type { AITradeTerminalEventKind, AITradeTerminalRow } from "@/lib/ai-trade-terminal";
import { formatCurrency, formatNumber, formatRelativeDateTime } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

type Translator = (key: string) => string;

const EVENT_TONES: Record<AITradeTerminalEventKind, string> = {
  entry: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  pending_entry: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  entry_confirmed: "border-teal-400/25 bg-teal-400/10 text-teal-300",
  take_profit: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  stop_loss: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  breakeven: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  position_closed: "border-white/10 bg-white/[0.04] text-zinc-300"
};

export function AITradeTerminalPanel({
  rows,
  locale,
  t,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore
}: {
  readonly rows: readonly AITradeTerminalRow[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly loading?: boolean;
  readonly loadingMore?: boolean;
  readonly hasMore?: boolean;
  readonly onLoadMore?: () => void;
}) {
  if (loading) return <AITradeTerminalSkeleton t={t} />;
  const handleScroll = (event: UIEvent<HTMLOListElement>) => {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
    if (hasMore && !loadingMore && scrollHeight - scrollTop - clientHeight <= 24) onLoadMore?.();
  };
  return (
    <section
      data-testid="ai-trade-terminal"
      aria-label={t("leaderboard.terminal.streamLabel")}
      className="ai-decision-terminal w-full overflow-hidden rounded-2xl border border-white/10 text-[var(--terminal-ink)]"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 md:px-5">
        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] font-bold tracking-[0.08em] text-emerald-300">
          <span className="hidden sm:inline">{t("leaderboard.terminal.title")}</span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-1 text-[9px] tracking-normal">
            <Circle size={7} weight="fill" /> {t("leaderboard.terminal.live")}
          </span>
        </div>
        <p className="min-w-0 flex-1 truncate text-right text-[11px] leading-5 text-zinc-400">{t("leaderboard.terminal.subtitle")}</p>
      </header>

      {rows.length ? (
        <ol
          className="focus-ring max-h-[260px] divide-y divide-white/[0.07] overflow-y-auto overscroll-contain rounded-b-2xl"
          aria-label={t("leaderboard.terminal.streamLabel")}
          aria-live="polite"
          aria-busy={loadingMore}
          onScroll={handleScroll}
          tabIndex={0}
        >
          {rows.map((row) => <TerminalRow key={row.id} row={row} locale={locale} t={t} />)}
          {loadingMore ? (
            <li className="px-4 py-3 text-center font-mono text-[10px] text-zinc-500 md:px-5">
              {t("common.loading")}
            </li>
          ) : null}
        </ol>
      ) : (
        <div data-testid="ai-trade-terminal-empty" className="px-5 py-12 text-center font-mono text-xs text-zinc-500">
          {t("leaderboard.terminal.empty")}
        </div>
      )}
    </section>
  );
}

function TerminalRow({ row, locale, t }: { readonly row: AITradeTerminalRow; readonly locale: Locale; readonly t: Translator }) {
  const traderKey = `traders.${row.traderId}.name`;
  const translatedTrader = t(traderKey);
  const traderName = translatedTrader === traderKey ? row.traderName : translatedTrader;
  const message = row.message ?? fallbackMessage(row, locale, t);
  return (
    <li data-event-kind={row.kind} className="grid min-w-0 gap-2 px-4 py-2.5 md:grid-cols-[62px_92px_150px_minmax(0,1fr)_auto] md:items-center md:px-5 xl:grid-cols-[74px_104px_170px_minmax(0,1fr)_auto]">
      <div className="flex items-center justify-between gap-3 md:block">
        <time dateTime={row.occurredAt ?? undefined} className="font-mono text-[10px] tabular-nums text-zinc-500">
          {formatRelativeDateTime(row.occurredAt, locale, t)}
        </time>
        <EventBadge kind={row.kind} t={t} className="md:hidden" />
      </div>
      <EventBadge kind={row.kind} t={t} className="hidden md:inline-flex" />
      <div className="min-w-0">
        <Link href={`/leaderboard/${row.traderId}`} prefetch={false} className="focus-ring inline-flex max-w-full items-center gap-1 rounded text-xs font-bold text-white hover:text-emerald-200">
          <span className="truncate">{traderName}</span><ArrowRight size={11} weight="bold" />
        </Link>
      </div>
      <p title={message} className="min-w-0 truncate text-xs leading-5 text-zinc-300">{message}</p>
      <TerminalFacts row={row} locale={locale} t={t} />
    </li>
  );
}

function EventBadge({ kind, t, className }: { readonly kind: AITradeTerminalEventKind; readonly t: Translator; readonly className: string }) {
  return <span className={`${className} w-fit rounded-md border px-2 py-1 font-mono text-[9px] font-bold ${EVENT_TONES[kind]}`}>{t(`leaderboard.terminal.event.${kind}`)}</span>;
}

function TerminalFacts({ row, locale, t }: { readonly row: AITradeTerminalRow; readonly locale: Locale; readonly t: Translator }) {
  const pnlClass = row.realizedPnl === null ? "text-zinc-500" : row.realizedPnl > 0 ? "text-emerald-300" : row.realizedPnl < 0 ? "text-rose-300" : "text-zinc-300";
  const showRealizedPnl = row.realizedPnl !== null && Math.abs(row.realizedPnl) >= 0.005;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-500 md:max-w-[190px] md:justify-end lg:max-w-[210px]">
      {row.side ? <span className={row.side === "long" ? "text-emerald-300" : "text-rose-300"}>{row.side.toUpperCase()}</span> : null}
      {row.price !== null ? <span>{t("leaderboard.terminal.price")} {formatNumber(row.price, 1, locale)}</span> : null}
      {showRealizedPnl ? <span className={pnlClass}>{formatCurrency(row.realizedPnl, locale)}</span> : null}
      {row.confidence !== null ? <span>{formatNumber(row.confidence, 0, locale)}%</span> : null}
    </div>
  );
}

function fallbackMessage(row: AITradeTerminalRow, locale: Locale, t: Translator): string {
  const price = row.price === null ? "-" : formatNumber(row.price, 1, locale);
  return t(`leaderboard.terminal.fallback.${row.kind}`).replace("{price}", price);
}

export function AITradeTerminalLockedPreview({ t }: { readonly t: Translator }) {
  return <AITradeTerminalSkeleton t={t} locked />;
}

function AITradeTerminalSkeleton({ t, locked = false }: { readonly t: Translator; readonly locked?: boolean }) {
  return (
    <section data-testid={locked ? "ai-trade-terminal-locked-preview" : "ai-trade-terminal-loading"} className="ai-decision-terminal w-full overflow-hidden rounded-2xl border border-white/10 px-4 py-4 text-white md:px-5">
      <p className="font-mono text-[11px] font-bold tracking-[0.08em] text-emerald-300">{t("leaderboard.terminal.title")}</p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        {["w-full", "w-[92%]", "w-[97%]", "w-[88%]"].map((width) => <div key={width} className={`h-9 ${width} rounded-md bg-white/[0.06]`} />)}
      </div>
    </section>
  );
}
