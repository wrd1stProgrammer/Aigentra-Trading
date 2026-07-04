import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const profileSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("trader detail first load keeps visible data while paginating heavy review history", () => {
  assert.match(apiSource, /const TRADER_DETAIL_INITIAL_REVIEWS_LIMIT = 20/, "detail first load should keep the latest visible scenarios");
  assert.match(apiSource, /const TRADER_DETAIL_INITIAL_EVENTS_LIMIT = 20/, "detail first load should keep the visible execution log rows");
  assert.match(
    apiSource,
    /export const traderDetailBundleQueryKey = \(traderId: string, symbol: string, locale: Locale\) =>\s*\n\s*\["league", "trader", traderId, symbol, locale\]/,
    "detail query key should not churn when more reviews are requested"
  );
  assert.match(
    apiSource,
    /queryFn: \(context: \{ signal\?: AbortSignal \}\) => getTraderDetailBundle\(traderId, symbol, locale, \{ signal: context\.signal \}\)/,
    "route transitions should be able to abort stale detail requests cleanly"
  );
  assert.match(apiSource, /export function getTraderManagementReviews/, "older management reviews should have a dedicated page API");
  assert.match(profileSource, /getTraderManagementReviews\(/, "detail screen should append older reviews without refetching the whole bundle");
  assert.match(profileSource, /reviews:\s*mergeManagementReviews\(bundle\?\.managementReviews \?\? \[\], extraReviews\)/, "initial and appended reviews should dedupe into one timeline");
  assert.match(profileSource, /setReviewsNextOffset\(response\.nextOffset\)/, "review pagination should follow the server-provided next offset");
  assert.match(profileSource, /const sameContext = historyContextKeyRef\.current === requestContextKey/, "trade history pagination should scope exhausted/loading guards to the current trader context");
  assert.match(profileSource, /setHistoryOffset\(responseNextOffset\)/, "trade history pagination should follow the server-provided next offset");
  assert.match(profileSource, /setHistoryHasMore\(typeof res\.hasMore === "boolean" \? res\.hasMore : responseNextOffset < res\.total\)/, "trade history pagination should follow the server-provided has-more flag");
  assert.match(profileSource, /setHistoryItems\(\[\]\)/, "trader switches should clear stale trade history before the next page loads");
  assert.doesNotMatch(apiSource, /path\.includes\("\/trade-history"\)/, "trade history should use the trader-detail timeout budget instead of the fast 8s budget");
  assert.match(profileSource, /tradeHistoryItems=\{historyItems\}/, "visible trade history should use the loaded rows directly");
  assert.match(profileSource, /disabled=\{loadingMoreReviews\}/, "scenario pagination should avoid duplicate requests while loading");
  assert.doesNotMatch(profileSource, /setReviewsLimit|setEventsLimit/, "pagination should not mutate the primary detail bundle parameters");
  assert.doesNotMatch(profileSource, /historyItems\.slice\(0,\s*eventsLimit\)/, "sidebar history should not depend on the removed detail event limit");
});
