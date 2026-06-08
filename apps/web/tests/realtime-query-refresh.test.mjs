import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");

test("league bundle queries poll live paper-trading data", () => {
  assert.match(apiSource, /LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "live query interval should be centralized");
  assert.match(apiSource, /leaderboardBundleQueryOptions[\s\S]*refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "leaderboard bundle should poll");
  assert.match(apiSource, /traderDetailBundleQueryOptions[\s\S]*refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "trader detail bundle should poll");
});

test("leaderboard adjacent live queries also refresh while viewing", () => {
  assert.match(leaderboardSource, /getCachedLeaderboardBundle/, "leaderboard should seed initial data from browser cache");
  assert.doesNotMatch(leaderboardSource, /initialData/, "fallback data must not block the first live fetch");
  assert.match(leaderboardSource, /placeholderData[\s\S]*getCachedLeaderboardBundle/, "leaderboard should use browser cache only as placeholder data");
  assert.match(leaderboardSource, /pendingPlansQuery[\s\S]*refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "pending plans should refresh on leaderboard");
  assert.match(leaderboardSource, /activeSnapshotsQuery[\s\S]*refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "equity snapshots should refresh on leaderboard");
});

test("trader detail page keeps the live bundle polling after navigation", () => {
  assert.match(detailSource, /traderDetailBundleQueryOptions\(traderId, symbol\)/, "detail page should use the shared live query options");
});
