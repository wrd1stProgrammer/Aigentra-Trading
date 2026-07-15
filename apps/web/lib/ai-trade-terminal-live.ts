import type {
  AITradeTerminalPage,
  AITradeTerminalSource,
  LeagueOverviewReview,
  PaperTradeEvent
} from "@/lib/api";

const TERMINAL_PAGE_SIZE = 20;

export type AITradeTerminalInfiniteData = {
  pages: AITradeTerminalSource[];
  pageParams: AITradeTerminalPage[];
};

export function mergeAITradeTerminalHead(
  current: AITradeTerminalInfiniteData,
  nextHead: AITradeTerminalSource
): AITradeTerminalInfiniteData {
  const previousTail = current.pages.at(-1)?.nextPage ?? null;
  const eventStream = mergeTerminalStream(
    nextHead.events,
    current.pages.flatMap((page) => page.events),
    nextHead.nextPage?.eventOffset,
    previousTail?.eventOffset,
    eventIdentity
  );
  const reviewStream = mergeTerminalStream(
    nextHead.reviews,
    current.pages.flatMap((page) => page.reviews),
    nextHead.nextPage?.reviewOffset,
    previousTail?.reviewOffset,
    reviewIdentity
  );
  const events = eventStream.records;
  const reviews = reviewStream.records;
  const pageCount = Math.max(
    1,
    Math.ceil(events.length / TERMINAL_PAGE_SIZE),
    Math.ceil(reviews.length / TERMINAL_PAGE_SIZE)
  );
  const pages: AITradeTerminalSource[] = [];
  const pageParams: AITradeTerminalPage[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const offset = index * TERMINAL_PAGE_SIZE;
    const pageEvents = events.slice(offset, offset + TERMINAL_PAGE_SIZE);
    const pageReviews = reviews.slice(offset, offset + TERMINAL_PAGE_SIZE);
    const eventEnd = offset + pageEvents.length;
    const reviewEnd = offset + pageReviews.length;
    const eventOffset = eventEnd < events.length ? eventEnd : eventStream.hasMore ? events.length : null;
    const reviewOffset = reviewEnd < reviews.length ? reviewEnd : reviewStream.hasMore ? reviews.length : null;
    const nextPage = eventOffset === null && reviewOffset === null
      ? null
      : { eventOffset, reviewOffset };

    pages.push({ events: pageEvents, reviews: pageReviews, nextPage });
    pageParams.push({
      eventOffset: offset < events.length ? offset : null,
      reviewOffset: offset < reviews.length ? offset : null
    });
  }

  return { pages, pageParams };
}

function mergeTerminalStream<T>(
  nextHead: readonly T[],
  current: readonly T[],
  nextOffset: number | null | undefined,
  previousOffset: number | null | undefined,
  identity: (record: T) => string
): { records: T[]; hasMore: boolean } {
  const nextHasMore = nextOffset !== null && nextOffset !== undefined;
  const previousHasMore = previousOffset !== null && previousOffset !== undefined;
  const currentIdentities = new Set(current.map(identity));
  const overlapsCurrent = nextHead.some((record) => currentIdentities.has(identity(record)));

  if (nextHasMore && current.length > 0 && !overlapsCurrent) {
    return { records: uniqueRecords(nextHead, identity), hasMore: true };
  }

  return {
    records: uniqueRecords([...nextHead, ...current], identity),
    hasMore: current.length === 0 ? nextHasMore : previousHasMore
  };
}

function uniqueRecords<T>(records: readonly T[], identity: (record: T) => string): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const record of records) {
    const key = identity(record);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }
  return unique;
}

function eventIdentity(event: PaperTradeEvent): string {
  if (event.id !== null && event.id !== undefined) return `id:${String(event.id)}`;
  return [event.eventType, event.type, event.traderId, event.createdAt, event.timestamp, event.orderId, event.positionId]
    .map((value) => String(value ?? ""))
    .join("|");
}

function reviewIdentity(review: LeagueOverviewReview): string {
  const source = String(review.source ?? review.overviewSource ?? "review").trim().toLowerCase();
  if (review.id !== null && review.id !== undefined) return `${source}:id:${String(review.id)}`;
  return [review.source, review.overviewSource, review.traderId, review.createdAt, review.timestamp, review.decision]
    .map((value) => String(value ?? ""))
    .join("|");
}
