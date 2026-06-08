export type RecencySortableItem = {
  readonly id: string;
  readonly sortMs?: number;
};

export function sortTimelineItemsByRecency<T extends RecencySortableItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const rightTime = safeSortTime(right.sortMs);
    const leftTime = safeSortTime(left.sortMs);
    if (rightTime !== leftTime) return rightTime - leftTime;
    return left.id.localeCompare(right.id);
  });
}

export function timelineTimeValue(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.NEGATIVE_INFINITY : date.getTime();
}

function safeSortTime(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}
