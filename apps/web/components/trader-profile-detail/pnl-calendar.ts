type Locale = "ko" | "en";

type SnapshotInput = {
  readonly equity?: number | string | null;
  readonly unrealizedPnl?: number | string | null;
  readonly unrealized_pnl?: number | string | null;
  readonly createdAt?: string | null;
  readonly timestamp?: string | null;
};

type EventInput = {
  readonly realizedPnl?: number | string | null;
  readonly createdAt?: string | null;
  readonly timestamp?: string | null;
};

export type CalendarTone = "good" | "bad" | "neutral";

export type PnlCalendarDay = {
  readonly dateKey: string;
  readonly day: number;
  readonly pnl: number;
  readonly pnlText: string;
  readonly equity: number;
  readonly tone: CalendarTone;
};

export type MonthlyPnlCalendar = {
  readonly monthLabel: string;
  readonly days: readonly PnlCalendarDay[];
  readonly weeks: readonly (PnlCalendarDay | null)[][];
  readonly assetChange: {
    readonly start: number;
    readonly current: number;
    readonly delta: number;
    readonly deltaText: string;
    readonly returnPct: number;
    readonly returnText: string;
  };
};

export function buildMonthlyPnlCalendar({
  now = new Date(),
  locale,
  startingEquity,
  snapshots,
  events,
  dailyPnl
}: {
  readonly now?: Date;
  readonly locale: Locale;
  readonly startingEquity: number;
  readonly snapshots: readonly SnapshotInput[];
  readonly events?: readonly EventInput[];
  readonly dailyPnl?: readonly { readonly date: string; readonly pnl: number; }[];
}): MonthlyPnlCalendar {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const snapshotEquityByDay = latestSnapshotRealizedEquityByDay(snapshots);
  
  const eventPnlByDay = new Map<string, number>();
  if (dailyPnl) {
    for (const item of dailyPnl) {
      if (item.date) {
        eventPnlByDay.set(item.date, (eventPnlByDay.get(item.date) ?? 0) + (item.pnl ?? 0));
      }
    }
  } else if (events) {
    const parsed = realizedPnlByDay(events);
    for (const [key, val] of parsed.entries()) {
      eventPnlByDay.set(key, val);
    }
  }
  const days: PnlCalendarDay[] = [];
  let currentEquity = startingEquity;

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day));
    const dateKey = isoDateKey(date);
    const snapshotEquity = snapshotEquityByDay.get(dateKey);
    const hasEventPnl = eventPnlByDay.has(dateKey);
    const eventPnl = eventPnlByDay.get(dateKey) ?? 0;
    const pnl = hasEventPnl ? eventPnl : snapshotEquity === undefined ? eventPnl : snapshotEquity - currentEquity;
    currentEquity = hasEventPnl ? currentEquity + eventPnl : snapshotEquity === undefined ? currentEquity + eventPnl : snapshotEquity;
    days.push({
      dateKey,
      day,
      pnl,
      pnlText: signedNumber(pnl),
      equity: currentEquity,
      tone: pnl > 0 ? "good" : pnl < 0 ? "bad" : "neutral"
    });
  }

  const delta = currentEquity - startingEquity;
  const returnPct = startingEquity ? (delta / startingEquity) * 100 : 0;
  return {
    monthLabel: monthLabel(monthStart, locale),
    days,
    weeks: calendarWeeks(days, monthStart),
    assetChange: {
      start: startingEquity,
      current: currentEquity,
      delta,
      deltaText: signedNumber(delta),
      returnPct,
      returnText: `${returnPct > 0 ? "+" : ""}${returnPct.toFixed(2)}%`
    }
  };
}

export function accountStartingEquity(currentEquity: number | null | undefined, totalPnl: number | null | undefined) {
  if (typeof currentEquity === "number" && Number.isFinite(currentEquity) && typeof totalPnl === "number" && Number.isFinite(totalPnl)) {
    return currentEquity - totalPnl;
  }
  return 10_000;
}

export function normalizeEquitySnapshots(value: unknown): SnapshotInput[] {
  if (Array.isArray(value)) return value as SnapshotInput[];
  if (typeof value === "object" && value !== null && Array.isArray((value as { snapshots?: unknown }).snapshots)) {
    return (value as { snapshots: SnapshotInput[] }).snapshots;
  }
  return [];
}

function latestSnapshotRealizedEquityByDay(snapshots: readonly SnapshotInput[]) {
  const values = new Map<string, number>();
  for (const snapshot of [...snapshots].sort((left, right) => timeValue(left) - timeValue(right))) {
    const equity = firstFiniteNumber(snapshot.equity);
    const unrealized = firstFiniteNumber(snapshot.unrealizedPnl ?? snapshot.unrealized_pnl);
    const key = dateKeyFromInput(snapshot.createdAt ?? snapshot.timestamp);
    if (equity !== null && key) {
      const realizedEquity = equity - (unrealized ?? 0);
      values.set(key, realizedEquity);
    }
  }
  return values;
}

function realizedPnlByDay(events: readonly EventInput[]) {
  const values = new Map<string, number>();
  for (const event of events) {
    const pnl = firstFiniteNumber(event.realizedPnl);
    const key = dateKeyFromInput(event.createdAt ?? event.timestamp);
    if (pnl !== null && key) values.set(key, (values.get(key) ?? 0) + pnl);
  }
  return values;
}

function calendarWeeks(days: readonly PnlCalendarDay[], monthStart: Date) {
  const cells: (PnlCalendarDay | null)[] = Array.from({ length: monthStart.getUTCDay() }, () => null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (PnlCalendarDay | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

function timeValue(snapshot: SnapshotInput) {
  const date = new Date(snapshot.createdAt ?? snapshot.timestamp ?? "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dateKeyFromInput(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return isoDateKey(date);
}

function isoDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(date);
}

function signedNumber(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function firstFiniteNumber(...values: readonly unknown[]) {
  for (const value of values) {
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}
