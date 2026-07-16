export type TimelineDateItem = {
  readonly sortMs?: number;
};

export type ScenarioCountByDay = {
  readonly date: string;
  readonly count: number;
};

export type TimestampedRecord = {
  readonly createdAt?: string | null;
};

const DEFAULT_SCENARIO_PAGE_SIZE = 10;

export function utcDateKeyFromSortMs(sortMs: unknown) {
  if (typeof sortMs !== "number" || !Number.isFinite(sortMs)) return "";
  const date = new Date(sortMs);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function timelineCountByUtcDate(items: readonly TimelineDateItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const dateKey = utcDateKeyFromSortMs(item.sortMs);
    if (!dateKey) continue;
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }
  return counts;
}

export function countByUtcDateWithFallback(rows: readonly ScenarioCountByDay[], fallbackItems: readonly TimelineDateItem[]) {
  const counts = timelineCountByUtcDate(fallbackItems);
  for (const row of rows) {
    if (!row.date) continue;
    counts.set(row.date, Math.max(0, Math.trunc(row.count)));
  }
  return counts;
}

export function timelineItemsForUtcDate<T extends TimelineDateItem>(items: readonly T[], dateKey: string, limit: number) {
  const safeLimit = Math.max(0, Math.trunc(limit));
  return items.filter((item) => utcDateKeyFromSortMs(item.sortMs) === dateKey).slice(0, safeLimit);
}

export function hasLoadedRecordsBeforeUtcDate(records: readonly TimestampedRecord[], dateKey: string) {
  return records.some((record) => {
    const sortMs = Date.parse(record.createdAt ?? "");
    return Number.isFinite(sortMs) && utcDateKeyFromSortMs(sortMs) < dateKey;
  });
}

export function nextVisibleCount(current: number, total: number, pageSize = DEFAULT_SCENARIO_PAGE_SIZE) {
  const safeCurrent = Math.max(0, Math.trunc(current));
  const safeTotal = Math.max(0, Math.trunc(total));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  return Math.min(safeTotal, safeCurrent + safePageSize);
}
