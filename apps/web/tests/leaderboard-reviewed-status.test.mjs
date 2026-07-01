import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const backendProxyRouteSource = readFileSync(new URL("../app/backend-api/[...path]/route.ts", import.meta.url), "utf8");
const loadingPolicy = loadTsModule("../lib/leaderboard-loading-policy.ts");
const formatSource = readFileSync(new URL("../lib/format.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("leaderboard completed status uses watching copy and compact elapsed time", () => {
  assert.match(i18nSource, /"leaderboard\.status\.reviewed": "감시중"/, "Korean completed status should read as watching");
  assert.match(i18nSource, /"leaderboard\.status\.reviewed": "Watching"/, "English completed status should read as watching");
  assert.match(i18nSource, /"leaderboard\.status\.reviewedAt": "감시중"/, "Korean completion-time label should match watching copy");
  assert.match(i18nSource, /"leaderboard\.status\.reviewedAt": "Watching"/, "English completion-time label should match watching copy");
  assert.match(formatSource, /export function formatClockTime/, "format helper should expose HH:mm clock time");
  assert.match(leaderboardSource, /getElapsedTimeString\(liveSummary\?\.updatedAt \?\? summary\?\.updatedAt\)/, "leaderboard should use live elapsed time for reviewed rows");
  assert.doesNotMatch(leaderboardSource, /detail: formatDateTime\(summary\?\.updatedAt, locale\)/, "reviewed rows should not show full date/time");
});

test("leaderboard preview omits the lower current-state block", () => {
  assert.doesNotMatch(leaderboardSource, /t\("leaderboard\.previewStatus"\)/, "hover preview should not render the lower current-state heading");
  assert.doesNotMatch(leaderboardSource, /StatusLine/, "hover preview should not keep the removed status-row helper");
});

test("leaderboard uses a zero-extra-fetch live race board instead of league overview", () => {
  assert.match(leaderboardSource, /data-testid="live-race-board"/, "race board should have a stable first-load target");
  assert.match(leaderboardSource, /function LiveRaceBoard/, "race board should be a named component inside the leaderboard surface");
  assert.match(leaderboardSource, /buildRaceBoardItems/, "race board items should be derived from existing leaderboard data");
  assert.match(leaderboardSource, /return24h/, "race board should emphasize short-window movement, not duplicate all-time ranking only");
  assert.doesNotMatch(leaderboardSource, /\[ LEAGUE OVERVIEW \]/, "old overview title should be fully removed");
  assert.doesNotMatch(leaderboardSource, /data-testid="league-overview-section"/, "old overview section target should be removed");
  assert.doesNotMatch(leaderboardSource, /data-testid="league-overview-stream"/, "old overview stream target should be removed");
  assert.doesNotMatch(leaderboardSource, /OptionActivityStream/, "old overview stream component should be removed");
  assert.doesNotMatch(leaderboardSource, /getLeagueOverviewReviews/, "leaderboard should not import or call the slow overview API");
  assert.doesNotMatch(apiSource, /\/api\/league\/overview-reviews/, "web API client should not keep the removed overview endpoint helper");
});

test("leaderboard browser cache placeholders wait until after hydration", () => {
  assert.match(leaderboardSource, /const \[cacheReady, setCacheReady\] = useState\(false\)/, "leaderboard cache readiness should be client-state driven");
  assert.match(leaderboardSource, /useEffect\(\(\) => \{\s*setCacheReady\(true\);\s*\}, \[\]\);/s, "leaderboard cache should only activate after mount");
  assert.match(leaderboardSource, /cacheReady \? getCachedLeaderboardBundle\("BTCUSDT", locale, leaderboardBundleOptions\)/, "localStorage-backed leaderboard cache should not run during hydration");
});

test("browser API calls use the same-origin backend proxy to avoid cold-load CORS retries", () => {
  assert.match(apiSource, /const BROWSER_API_PROXY_BASE_URL = "\/backend-api"/, "browser fetches should use the Next proxy prefix");
  assert.match(apiSource, /typeof window === "undefined"/, "server-side calls should keep using the external API base URL");
  assert.match(apiSource, /\^https\?:\\\/\\\//, "absolute public API bases should be proxied in the browser");
  assert.match(apiSource, /requestTimeoutMs/, "browser API calls should have bounded timeouts instead of waiting for 75s proxy failures");
  assert.match(apiSource, /composeAbortSignal/, "browser API calls should preserve React Query abort signals while adding a timeout");
  assert.doesNotMatch(nextConfigSource, /rewrites\(\)/, "backend proxy should not rely on Next rewrites that log navigation aborts loudly");
  assert.match(backendProxyRouteSource, /proxyBackendRequest/, "Next should expose a non-conflicting backend proxy route handler");
  assert.match(backendProxyRouteSource, /isNavigationAbort/, "backend proxy should classify rapid-navigation aborts");
  assert.match(backendProxyRouteSource, /collectProxyErrorSignals/, "backend proxy should inspect nested undici socket error causes");
  assert.match(backendProxyRouteSource, /UND_ERR_SOCKET/, "backend proxy should treat undici socket termination as client navigation abort noise");
  assert.match(backendProxyRouteSource, /terminated/, "backend proxy should classify terminated fetch streams through nested causes");
  assert.match(backendProxyRouteSource, /status: 499/, "navigation aborts should resolve as client-cancelled proxy responses");
  assert.match(backendProxyRouteSource, /BACKEND_PROXY_TIMEOUT_MS/, "backend proxy should bound slow upstream requests");
  assert.match(backendProxyRouteSource, /status: 504/, "backend proxy timeouts should resolve as gateway timeout instead of hanging until platform timeout");
});

test("leaderboard BTC and favorites filters render as compact standalone areas", () => {
  assert.match(leaderboardSource, /data-testid="leaderboard-filter-rail"/, "market and favorites filters should have a stable standalone rail target");
  assert.doesNotMatch(leaderboardSource, /data-testid="leaderboard-market-toggle"/, "filter control should not use the previous segmented toggle target");
  assert.doesNotMatch(leaderboardSource, /grid min-h-11 grid-cols-2 rounded-full/, "filters should not render as one wide segmented toggle");
  assert.match(leaderboardSource, /setFavoritesOnly\(false\)/, "BTC area should return to the full BTC ranking");
  assert.match(leaderboardSource, /setFavoritesOnly\(true\)/, "Favorites area should switch to favorite traders only");
  assert.match(leaderboardSource, /hover:-translate-y-0\.5/, "standalone areas should lift subtly on hover");
  assert.match(leaderboardSource, /group-hover:-rotate-6 group-hover:scale-110/, "Favorites icon should animate without adding a motion dependency");
  assert.match(leaderboardSource, /active:scale-\[0\.96\]/, "areas should use tactile press feedback");
  assert.match(leaderboardSource, /transition-\[background-color,color,box-shadow,transform\]/, "areas should animate only explicit safe properties");
});

test("leaderboard supports isolated UTC monthly league selection", () => {
  assert.match(apiSource, /leagueMonth\?: string/, "leaderboard API options should accept a UTC YYYY-MM month");
  assert.match(apiSource, /params\.set\("leagueMonth", options\.leagueMonth\)/, "leaderboard API should send the selected UTC month to the backend");
  assert.match(apiSource, /options\?\.leagueMonth \?\? "current"/, "browser cache and query keys should separate current and monthly bundles");
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "league=monthly&leagueMonth=2026-06&filter=favorites", undefined),
    "/leaderboard?league=current&filter=favorites",
    "current league tab should clear the stale month while preserving other URL state"
  );
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "league=current&filter=favorites", "2026-06"),
    "/leaderboard?league=monthly&filter=favorites&leagueMonth=2026-06",
    "monthly league tab should encode the selected UTC month while preserving other URL state"
  );
  assert.match(leaderboardSource, /Date\.UTC/, "month options should be generated from UTC dates");
  assert.match(i18nSource, /"leaderboard\.monthlyLeague"/, "monthly selector copy should be localized");
});

test("league period URL policy preserves refreshable state without stale monthly params", () => {
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "league=current&range=ALL", "2026-06"),
    "/leaderboard?league=monthly&range=ALL&leagueMonth=2026-06",
    "monthly selection should preserve unrelated search state"
  );
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "?league=monthly&leagueMonth=2026-06&range=7D", undefined),
    "/leaderboard?league=current&range=7D",
    "current selection should remove a stale monthly value"
  );
});

test("monthly league rankings keep live exposure state separate from monthly returns", () => {
  assert.match(leaderboardSource, /getActivePaperPositions/, "leaderboard should fetch live active positions independently of the monthly bundle");
  assert.match(leaderboardSource, /getPaperOrders/, "leaderboard should fetch live open orders independently of the monthly bundle");
  assert.match(leaderboardSource, /const liveExposurePositionsQuery = useQuery/, "live positions should have their own refreshable query");
  assert.match(leaderboardSource, /const liveExposureOrdersQuery = useQuery/, "live orders should have their own refreshable query");
  assert.match(leaderboardSource, /currentLeagueBundleQuery/, "monthly screens should hydrate current live summaries separately");
  assert.match(leaderboardSource, /currentSummaryByTrader/, "monthly screens should use current live summaries for monitoring details");
  assert.match(
    leaderboardSource,
    /buildExposureMap\(liveExposurePositions, liveExposureOrders, pendingPlans\)/,
    "ranking progress should use live exposure even when standings are monthly"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /const pendingPlans = selectedLeagueMonth \? \[\] : pendingPlansQuery\.data \?\? \[\];/,
    "monthly tabs should not blank live pending plan context"
  );
});

test("monthly league progress rows prefer current live summary status fields", () => {
  assert.match(
    leaderboardSource,
    /const liveSummary = currentSummary \?\? summary/,
    "monthly rows should derive an effective live summary from the current leaderboard bundle"
  );
  assert.match(
    leaderboardSource,
    /const planStatus = normalizeStatusText\(liveSummary\?\.latestPlanStatus\)/,
    "pending setup status should use live summary fields instead of monthly snapshot-only fields"
  );
  assert.match(
    leaderboardSource,
    /const runStatus = normalizeStatusText\(liveSummary\?\.latestRunStatus\)/,
    "reviewed/watching status should use live run status in monthly mode"
  );
  assert.match(
    leaderboardSource,
    /detail: getElapsedTimeString\(liveSummary\?\.updatedAt \?\? summary\?\.updatedAt\)/,
    "reviewed rows should not show '-' when the current summary has a live updatedAt"
  );
  assert.match(
    leaderboardSource,
    /detail: statusLabel\(liveSummary\?\.agentPhase \?\? summary\?\.agentPhase, t\)/,
    "pending-order rows should not fall back to '-' when only the current live summary has the phase"
  );
});

test("monthly league keeps selected-month returns separate from live trailing metrics", () => {
  assert.doesNotMatch(
    leaderboardSource,
    /applyLiveReturnMetrics|liveReturnMetricByTrader/,
    "monthly rankings should not overwrite selected-month returns with current trailing metrics"
  );
  assert.match(
    leaderboardSource,
    /value=\{formatSignedPercent\(trader\.return7d\)\}/,
    "preview 7D cells can still render the explicit 7D field when that metric is shown"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /label=\{t\("common\.return7d"\)\} value=\{formatSignedPercent\(trader\.monthlyReturn\)\}/,
    "a cell labeled 7D must never render monthlyReturn"
  );
});

test("monthly league pins the visible return metric to the selected UTC month", () => {
  assert.doesNotMatch(
    leaderboardSource,
    /selectedLeagueMonth \? \[fallbackReturnColumn\("monthly", t\), fallbackReturnColumn\("cumulative", t\)\] : topReturnColumns\(visibleStandings, t\)/,
    "monthly tabs should not show cumulative return as a second primary period metric"
  );
  assert.match(
    leaderboardSource,
    /selectedLeagueMonth \? \[fallbackReturnColumn\("monthly", t\)\] : topReturnColumns\(visibleStandings, t\)/,
    "monthly tabs should show the selected-month return column while current tabs keep the dynamic picker"
  );
});

test("leaderboard trader links do not prefetch detail bundles during the click path", () => {
  assert.doesNotMatch(
    leaderboardSource,
    /prefetchTraderDetailBundle/,
    "leaderboard rows should not import expensive detail prefetching for hover or click navigation"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /const prefetchTrader = useCallback/,
    "leaderboard should not define a detail-prefetch callback that can compete with route transitions"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /onMouseEnter=\{\(\) => onPrefetch/,
    "hover handlers must not call a detail prefetch callback before navigation"
  );
});

test("leaderboard initial loading policy only blocks a truly empty ranking load", () => {
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: true,
      rankingPlaceholder: false
    }),
    true,
    "empty first loads should still show the loading overlay"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: true,
      rankingPending: true,
      rankingPlaceholder: false
    }),
    false,
    "renderable standings should keep the shell interactive while slower queries finish"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: true,
      rankingPlaceholder: true
    }),
    false,
    "placeholder standings should keep period transitions from blanking the page"
  );
});

test("leaderboard favorites are account-backed and clear on logout", () => {
  assert.doesNotMatch(leaderboardSource, /aigentra:leaderboard:favorites/, "leaderboard must not use a browser-global favorites key");
  assert.doesNotMatch(leaderboardSource, /localStorage\.getItem\("aigentra:leaderboard:favorites"/, "leaderboard must not hydrate favorites from global localStorage");
  assert.doesNotMatch(leaderboardSource, /localStorage\.setItem\("aigentra:leaderboard:favorites"/, "leaderboard must not persist favorites to global localStorage");
  assert.match(leaderboardSource, /\/api\/subscriber\/preferences/, "leaderboard should hydrate favorites from the signed-in subscriber preference API");
  assert.match(leaderboardSource, /session\.status === "unauthenticated"/, "leaderboard should explicitly clear favorite state after logout");
  assert.match(leaderboardSource, /favoriteTraderIds: \[\.\.\.next\]/, "favorite toggles should save the next account-scoped favorite list");
});

test("leaderboard preview omits trader status feed snippets", () => {
  assert.doesNotMatch(leaderboardSource, /buildLatestStatusFeedMap\(bundle\.statusFeeds \?\? \[\]\)/, "leaderboard should not derive feed snippets for the preview panel");
  assert.doesNotMatch(leaderboardSource, /latestStatusFeed=/, "preview panel should not receive active trader feed snippets");
  assert.doesNotMatch(leaderboardSource, /LatestStatusFeedNote/, "preview panel should stay compact without a feed note");
});

function loadTsModule(relativePath) {
  const tsSource = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
