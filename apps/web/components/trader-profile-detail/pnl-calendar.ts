type Locale = "en" | "ko" | "ru" | "pt-BR" | "tr";

function intlLocale(locale?: Locale) {
  const locales: Record<Locale, string> = {
    en: "en-US",
    ko: "ko-KR",
    ru: "ru-RU",
    "pt-BR": "pt-BR",
    tr: "tr-TR"
  };
  return locale ? locales[locale] : "en-US";
}

export type NormalizedEquitySnapshot = {
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
  readonly snapshots: readonly NormalizedEquitySnapshot[];
  readonly events?: readonly EventInput[];
  readonly dailyPnl?: readonly { readonly date: string; readonly pnl: number; }[];
}): MonthlyPnlCalendar {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const snapshotEquityByDay = latestSnapshotRealizedEquityByDay(snapshots);
  const hasBackendDailyPnl = Boolean(dailyPnl?.length);

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
  let currentEquity = hasBackendDailyPnl
    ? monthlyStartingEquityFromDailyPnl(snapshots, eventPnlByDay, startingEquity, isoDateKey(monthStart))
    : startingEquity;
  const effectiveStartingEquity = currentEquity;

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day));
    const dateKey = isoDateKey(date);
    const snapshotEquity = snapshotEquityByDay.get(dateKey);
    const hasSnapshotEquity = snapshotEquity !== undefined;
    const eventPnl = eventPnlByDay.get(dateKey) ?? 0;
    const pnl = hasBackendDailyPnl ? eventPnl : hasSnapshotEquity ? snapshotEquity - currentEquity : eventPnl;
    currentEquity = hasBackendDailyPnl ? currentEquity + eventPnl : hasSnapshotEquity ? snapshotEquity : currentEquity + eventPnl;
    days.push({
      dateKey,
      day,
      pnl,
      pnlText: signedNumber(pnl),
      equity: currentEquity,
      tone: pnl > 0 ? "good" : pnl < 0 ? "bad" : "neutral"
    });
  }

  const delta = currentEquity - effectiveStartingEquity;
  const returnPct = effectiveStartingEquity ? (delta / effectiveStartingEquity) * 100 : 0;
  return {
    monthLabel: monthLabel(monthStart, locale),
    days,
    weeks: calendarWeeks(days, monthStart),
    assetChange: {
      start: effectiveStartingEquity,
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

export function normalizeEquitySnapshots(value: unknown): NormalizedEquitySnapshot[] {
  if (Array.isArray(value)) return value as NormalizedEquitySnapshot[];
  if (typeof value === "object" && value !== null && Array.isArray((value as { snapshots?: unknown }).snapshots)) {
    return (value as { snapshots: NormalizedEquitySnapshot[] }).snapshots;
  }
  return [];
}

function latestSnapshotRealizedEquityByDay(snapshots: readonly NormalizedEquitySnapshot[]) {
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

function monthlyStartingEquityFromDailyPnl(
  snapshots: readonly NormalizedEquitySnapshot[],
  eventPnlByDay: ReadonlyMap<string, number>,
  fallbackStartingEquity: number,
  monthStartKey: string
) {
  const latestSnapshot = latestSnapshotRealizedEquity(snapshots);
  if (!latestSnapshot) return fallbackStartingEquity;
  let cumulativePnl = 0;
  for (const [dateKey, pnl] of eventPnlByDay.entries()) {
    if (dateKey >= monthStartKey && dateKey <= latestSnapshot.dateKey) cumulativePnl += pnl;
  }
  return latestSnapshot.equity - cumulativePnl;
}

function latestSnapshotRealizedEquity(snapshots: readonly NormalizedEquitySnapshot[]) {
  let latest: { readonly dateKey: string; readonly equity: number; readonly time: number } | null = null;
  for (const snapshot of snapshots) {
    const equity = firstFiniteNumber(snapshot.equity);
    const unrealized = firstFiniteNumber(snapshot.unrealizedPnl ?? snapshot.unrealized_pnl);
    const key = dateKeyFromInput(snapshot.createdAt ?? snapshot.timestamp);
    const time = timeValue(snapshot);
    if (equity === null || !key) continue;
    const realizedEquity = equity - (unrealized ?? 0);
    if (!latest || time >= latest.time) {
      latest = { dateKey: key, equity: realizedEquity, time };
    }
  }
  return latest;
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

function timeValue(snapshot: NormalizedEquitySnapshot) {
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
  return new Intl.DateTimeFormat(intlLocale(locale), {
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
