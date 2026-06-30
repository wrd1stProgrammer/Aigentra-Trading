import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const loadingPolicy = loadTsModule("../lib/leaderboard-loading-policy.ts", { URLSearchParams });
const accessGatePolicy = loadTsModule("../lib/access-gate-policy.ts");
const sessionRefetchPolicy = loadTsModule("../lib/session-refetch-policy.ts");

test("league overview shell is not blocked by slower live exposure or subscriber access queries", () => {
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: true,
      rankingPending: true,
      rankingPlaceholder: false
    }),
    false,
    "renderable standings should suppress the full-page overlay even while slower queries continue"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: true,
      rankingPlaceholder: false
    }),
    true,
    "a true empty initial ranking load should still show the full-page overlay"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: true,
      rankingPlaceholder: true
    }),
    false,
    "placeholder standings should keep the shell visible during a period transition"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: false,
      rankingPlaceholder: false,
      rankingWarming: true
    }),
    true,
    "a cold-cache monthly warming bundle should keep the loading affordance instead of rendering zero-return rows"
  );
  assert.match(
    readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8"),
    /displayStandings\.length > 0 && !leaderboardWarming/,
    "warming rows built from the trader catalog should not count as renderable monthly standings"
  );
});

test("leaderboard period tabs preserve URL state without duplicate route work", () => {
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "league=current&foo=bar", "2026-06"),
    "/leaderboard?league=monthly&foo=bar&leagueMonth=2026-06",
    "monthly selection should preserve unrelated filters while selecting the month"
  );
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "?league=monthly&leagueMonth=2026-06&foo=bar", undefined),
    "/leaderboard?league=current&foo=bar",
    "current selection should clear the stale monthly parameter synchronously"
  );
});

test("locked overview can defer heavy protected children until subscriber access is known", () => {
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "pending",
      deferLockedChildren: true
    }),
    false,
    "pending access should render the lightweight preview when deferral is enabled"
  );
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "locked",
      deferLockedChildren: true
    }),
    false,
    "locked access should render the lightweight preview when deferral is enabled"
  );
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "unlocked",
      deferLockedChildren: true
    }),
    true,
    "unlocked subscribers should always render the protected children"
  );
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "locked",
      deferLockedChildren: false
    }),
    true,
    "existing gates keep their previous blurred-child behavior unless they opt into deferral"
  );
});

test("league overview initial page fetches real indexed rows instead of a cold-cache warming shell", () => {
  assert.equal(
    loadingPolicy.shouldPreferCachedOverviewInitialPage({ hasCachedReviews: false }),
    false,
    "cold overview loads should fetch real rows through the indexed backend query"
  );
  assert.equal(
    loadingPolicy.shouldPreferCachedOverviewInitialPage({ hasCachedReviews: true }),
    true,
    "existing overview rows may use the cache while a refresh warms in the background"
  );
});

test("session and subscriber access policy avoid tab-focus refetch churn", () => {
  assert.equal(
    sessionRefetchPolicy.DASHBOARD_SESSION_REFETCH_POLICY.refetchOnWindowFocus,
    false,
    "dashboard session state should not refetch on every focus"
  );
  assert.equal(
    sessionRefetchPolicy.DASHBOARD_SESSION_REFETCH_POLICY.refetchInterval,
    0,
    "dashboard session state should not refetch on every focus or timer tick"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: true,
      freeAccessLimited: false
    }),
    true,
    "unknown subscriber access should keep the cheap preview limit while entitlement resolves"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: false,
      freeAccessLimited: true
    }),
    true,
    "known free access should keep the free preview limit"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: false,
      freeAccessLimited: false
    }),
    false,
    "known subscribed access should render the full leaderboard"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: false,
      subscriberAccessUnavailable: true,
      freeAccessLimited: false
    }),
    true,
    "subscriber access errors should keep the preview limit instead of unlocking the full leaderboard"
  );
});

test("leaderboard secondary queries wait while only placeholder standings are refetching", () => {
  assert.equal(
    loadingPolicy.shouldFetchLeaderboardSecondaryData({
      primaryFetching: true,
      primaryPlaceholder: true
    }),
    false,
    "live exposure, pending plans, and monthly companion queries should wait until the primary bundle has real data"
  );
  assert.equal(
    loadingPolicy.shouldFetchLeaderboardSecondaryData({
      primaryFetching: false,
      primaryPlaceholder: true
    }),
    true,
    "placeholder content can hydrate secondary data after the primary request settles"
  );
  assert.equal(
    loadingPolicy.shouldFetchCurrentLeagueCompanion({
      selectedLeagueMonth: "2026-06",
      primaryFetching: true,
      primaryPlaceholder: true
    }),
    false,
    "monthly tabs should not immediately fan out a current-league companion request during the placeholder fetch"
  );
});

test("leaderboard hot live queries use canonical endpoints instead of alias fallback storms", () => {
  const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
  const activePositionsBlock = functionBlock(apiSource, "getActivePaperPositions");
  const ordersBlock = functionBlock(apiSource, "getPaperOrders");
  const equityBlock = functionBlock(apiSource, "getEquitySnapshots");

  assert.doesNotMatch(activePositionsBlock, /requestFirst/, "active positions should not retry alias endpoints after a timeout");
  assert.doesNotMatch(ordersBlock, /requestFirst/, "paper orders should not retry alias endpoints after a timeout");
  assert.doesNotMatch(equityBlock, /requestFirst/, "equity snapshots should not retry alias endpoints after a timeout");
  assert.doesNotMatch(
    `${activePositionsBlock}\n${ordersBlock}\n${equityBlock}`,
    /\/api\/paper-trading\/|`\/api\/equity-snapshots/,
    "leaderboard hot paths should avoid legacy aliases that duplicate backend work"
  );
});

test("monthly leaderboard warming bundles stay transient and refetch quickly", async () => {
  const storage = new Map();
  const writes = [];
  let responseBody = leaderboardBundle({ warming: true, scheduledRefresh: true, stale: true, summaries: [] });
  const api = loadTsModule("../lib/api.ts", {
    AbortController,
    clearTimeout,
    fetch: async () => ({
      ok: true,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody)
    }),
    Headers,
    process: { env: { NEXT_PUBLIC_API_BASE_URL: "http://backend.test" } },
    setTimeout,
    URLSearchParams,
    window: {
      location: { hostname: "localhost", origin: "http://localhost:3000" },
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          writes.push({ key, value });
          storage.set(key, value);
        }
      }
    }
  });

  const warmingBundle = await api.getLeaderboardBundle("BTCUSDT", "ko", { includeRelated: false, leagueMonth: "2026-06" });
  assert.equal(warmingBundle.warming, true);
  assert.equal(writes.length, 0, "transient warming bundles should not overwrite the browser cache with empty standings");
  assert.equal(api.getCachedLeaderboardBundle("BTCUSDT", "ko", { includeRelated: false, leagueMonth: "2026-06" }), null);

  responseBody = leaderboardBundle({
    cacheHit: true,
    stale: false,
    scheduledRefresh: false,
    summaries: [{ traderId: "channel-rider", return30d: 4.2 }]
  });
  const completeBundle = await api.getLeaderboardBundle("BTCUSDT", "ko", { includeRelated: false, leagueMonth: "2026-06" });
  assert.equal(completeBundle.warming, undefined);
  assert.equal(writes.length, 1, "complete monthly standings should still seed the browser cache");
  assert.equal(
    JSON.stringify(api.getCachedLeaderboardBundle("BTCUSDT", "ko", { includeRelated: false, leagueMonth: "2026-06" })?.summaries),
    JSON.stringify(completeBundle.summaries)
  );

  const queryOptions = api.leaderboardBundleQueryOptions("BTCUSDT", "ko", { includeRelated: false, leagueMonth: "2026-06" });
  const now = Date.now();
  assert.equal(
    queryOptions.refetchInterval({ state: { data: warmingBundle, dataUpdatedAt: now } }),
    api.LEAGUE_WARMING_REFETCH_INTERVAL_MS,
    "warming monthly bundles should not wait for the normal live polling interval"
  );
  assert.equal(
    queryOptions.refetchInterval({ state: { data: warmingBundle, dataUpdatedAt: now - api.LEAGUE_WARMING_REFETCH_WINDOW_MS - 1 } }),
    api.LEAGUE_LIVE_REFETCH_INTERVAL_MS,
    "warming retry pressure should be bounded if the backend cannot finish the refresh"
  );
  assert.equal(
    queryOptions.refetchInterval({ state: { data: completeBundle, dataUpdatedAt: now } }),
    api.LEAGUE_LIVE_REFETCH_INTERVAL_MS
  );
});

function loadTsModule(relativePath, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: module.exports,
    module,
    ...globals
  });
  return module.exports;
}

function functionBlock(source, name) {
  const start = source.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nexport function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function leaderboardBundle(overrides = {}) {
  return {
    symbol: "BTCUSDT",
    period: {
      type: "monthly",
      month: "2026-06",
      start: "2026-06-01T00:00:00+00:00",
      end: "2026-07-01T00:00:00+00:00",
      timezone: "UTC"
    },
    traders: [],
    summaries: [],
    positions: [],
    orders: [],
    managementReviews: [],
    statusFeeds: [],
    scanner: null,
    ...overrides
  };
}
