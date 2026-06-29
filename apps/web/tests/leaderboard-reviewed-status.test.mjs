import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const nextConfigSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const backendProxyRouteSource = readFileSync(new URL("../app/backend-api/[...path]/route.ts", import.meta.url), "utf8");
const overlaySource = readFileSync(new URL("../components/page-loading-overlay.tsx", import.meta.url), "utf8");
const overviewFilter = loadTsModule("../components/leaderboard-overview-filter.ts");
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

test("league overview stream is restricted to AI review records", () => {
  assert.match(leaderboardSource, /data-testid="league-overview-section"/, "overview section should have a stable first-load target");
  assert.match(leaderboardSource, /data-testid="league-overview-stream"/, "overview stream should have a stable first-load target");
  assert.match(leaderboardSource, /preferCached: true/, "initial overview load should prefer cached data and background warm cold misses");
  assert.match(leaderboardSource, /page\.warming/, "overview should retry instead of resolving an empty cold-cache warming response");
  assert.match(leaderboardSource, /const aiReviewLogsOnly = reviewsList/, "overview should derive log rows only from loaded AI review records");
  assert.doesNotMatch(leaderboardSource, /pendingPlans\.forEach/, "pending trade plans must not appear in League Overview");
  assert.doesNotMatch(leaderboardSource, /fallback-1/, "League Overview must not show synthetic scanner fallback rows");
  assert.doesNotMatch(leaderboardSource, /type: "PLAN"/, "League Overview should not emit plan log rows");
  assert.match(leaderboardSource, /review\.traderId \?\? review\.trader_id/, "overview review rows should handle backend snake_case trader ids");
  assert.match(leaderboardSource, /getLeagueOverviewReviews\(limit, offset, locale, undefined, undefined, options\)/, "overview should load one combined localized review page");
  assert.doesNotMatch(leaderboardSource, /getManagementReviews\(limit, offset/, "overview should not fetch a separate management page");
  assert.doesNotMatch(leaderboardSource, /getAiReviews\(limit, offset/, "overview should not fetch a separate entry-review page");
  assert.match(leaderboardSource, /record\.reviews/, "overview should extract combined review records from the overview API");
  assert.match(leaderboardSource, /leaderboard\.entryReviewCompleted/, "entry reviews should be labeled separately through i18n");
  assert.match(leaderboardSource, /formatRelativeDateTime\(createdAt, locale, t\)/, "overview review rows should show recent relative time");
});

test("league overview hides rejected or failed review records", () => {
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "entry_review",
      traderId: "session-raider",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "ADJUST_AND_APPROVE",
      status: "ok"
    }),
    true,
    "approved second-stage reviews should remain visible"
  );
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "entry_review",
      traderId: "session-raider",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "REJECT",
      status: "ok",
      rationale: "최근 손실 이후 동일한 전략이 거부되었습니다."
    }),
    false,
    "rejected entry reviews should not appear in League Overview"
  );
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "management_review",
      traderId: "range-maker",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "NEEDS_MORE_DATA",
      actionType: "NEEDS_MORE_DATA",
      status: "error",
      fallback: true,
      riskFlags: ["provider_failed"],
      rationale: "Position management provider failed."
    }),
    false,
    "provider-failure management reviews should not appear in League Overview"
  );
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "management_review",
      traderId: "range-maker",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "MOVE_STOP_TO_BREAKEVEN",
      actionType: "MOVE_STOP_TO_BREAKEVEN",
      status: "ok",
      rationale: "Stop moved to breakeven after favorable move."
    }),
    true,
    "applied management action reviews should remain visible"
  );
});

test("league overview stream keeps a page cache and stops duplicate infinite loading", () => {
  assert.match(leaderboardSource, /overviewActivityCache/, "overview should keep a module-level cache across route unmounts");
  assert.match(leaderboardSource, /refreshOverviewActivityCache/, "overview should refresh the first page instead of blank reloading on remount");
  assert.match(leaderboardSource, /mergeOverviewReviews/, "overview should merge newly fetched reviews into cached rows");
  assert.match(leaderboardSource, /uniqueReviews\.length === 0/, "overview should stop auto-loading when a page contains only duplicates");
  assert.match(leaderboardSource, /setHasMore\(false\)/, "overview should stop observer retries after exhausted or failed loads");
  assert.match(leaderboardSource, /OVERVIEW_WARMING_RETRY_LIMIT/, "overview cold-cache warming should have a bounded retry limit");
  assert.match(leaderboardSource, /onInitialReady/, "overview should report first-page readiness to the parent loading barrier");
  assert.match(leaderboardSource, /preferCached: false/, "overview should fall back to a direct page fetch after bounded cached warmup retries");
});

test("league overview does not auto-paginate before the user scrolls the log", () => {
  assert.match(leaderboardSource, /hasOverviewUserScrolled/, "overview should track whether the user actually scrolled the log");
  assert.match(leaderboardSource, /handleOverviewScroll/, "overview should set the scroll gate from the log container");
  assert.match(leaderboardSource, /onScroll=\{handleOverviewScroll\}/, "the log container should own the scroll gate");
  assert.match(
    leaderboardSource,
    /if \(!hasOverviewUserScrolled \|\| !hasMore \|\| isLoading\) return;/,
    "older pages should not auto-load while the initial sentinel is visible"
  );
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
  assert.match(leaderboardSource, /includeRelated: false/, "leaderboard first paint should use the summary bundle and load live context separately");
  assert.match(leaderboardSource, /data-testid="leaderboard-month-selector"/, "leaderboard should expose a stable monthly selector target");
  assert.match(leaderboardSource, /selectedLeagueMonth/, "leaderboard should keep selected month in component state");
  assert.match(leaderboardSource, /leagueMonth: selectedLeagueMonth/, "leaderboard query should be parameterized by the selected month");
  assert.match(leaderboardSource, /useSearchParams/, "league tab selection should be reflected in the URL");
  assert.match(leaderboardSource, /router\.replace\(nextUrl, \{ scroll: false \}\)/, "league tab selection should preserve browser back navigation state");
  assert.match(leaderboardSource, /next\.set\("league", "current"\)/, "current league tab should have a URL state marker");
  assert.match(leaderboardSource, /Date\.UTC/, "month options should be generated from UTC dates");
  assert.match(i18nSource, /"leaderboard\.monthlyLeague"/, "monthly selector copy should be localized");
});

test("league tab switches update URL state immediately before async route refresh", () => {
  assert.match(
    leaderboardSource,
    /data-league-period="monthly"/,
    "monthly tab should be a real navigable control with a stable target"
  );
  assert.match(
    leaderboardSource,
    /href=\{selectedLeagueHref\}/,
    "monthly tab should have an href so fast pre-hydration clicks still switch tabs"
  );
  assert.match(
    leaderboardSource,
    /href=\{currentLeagueHref\}/,
    "current tab should have an href so back/refresh preserves explicit current state"
  );
  assert.match(
    leaderboardSource,
    /const nextUrl = `\$\{pathname\}\$\{nextLeagueSearch\(searchParams, leagueMonth\)\}`/,
    "league tab handlers should compute one canonical URL for state and router updates"
  );
  assert.match(
    leaderboardSource,
    /window\.history\.replaceState\(null, "", nextUrl\)/,
    "league tab clicks should update the address bar synchronously so back/refresh preserves the chosen tab"
  );
  assert.match(
    leaderboardSource,
    /router\.replace\(nextUrl, \{ scroll: false \}\)/,
    "Next router should still be notified after the immediate URL state update"
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

test("monthly league keeps trailing return labels on live trailing metrics", () => {
  assert.match(
    leaderboardSource,
    /const liveReturnMetricByTrader =/,
    "monthly rows should keep live trailing return metrics separate from the monthly ranking return"
  );
  assert.match(
    leaderboardSource,
    /applyLiveReturnMetrics\(standings, liveReturnMetricByTrader\)/,
    "visible return columns should use live 7D/24H/30D values even when the selected ranking period is monthly"
  );
  assert.match(
    leaderboardSource,
    /value=\{formatSignedPercent\(trader\.return7d\)\}/,
    "preview 7D cell must render the 7D field, not monthlyReturn"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /label=\{t\("common\.return7d"\)\} value=\{formatSignedPercent\(trader\.monthlyReturn\)\}/,
    "a cell labeled 7D must never render monthlyReturn"
  );
});

test("monthly league uses the same dynamic return metric selection as current league", () => {
  assert.doesNotMatch(
    leaderboardSource,
    /selectedLeagueMonth \? \[fallbackReturnColumn\("monthly", t\), fallbackReturnColumn\("cumulative", t\)\] : topReturnColumns\(visibleStandings, t\)/,
    "monthly tabs should not pin monthly/cumulative columns while current tabs choose the strongest two metrics"
  );
  assert.match(
    leaderboardSource,
    /topReturnColumns\(visibleStandings, t\)/,
    "both current and monthly tabs should share the dynamic two-column return metric picker"
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

test("leaderboard uses the shared full-screen loading overlay", () => {
  assert.match(leaderboardSource, /PageLoadingOverlay/, "leaderboard should render the shared loading overlay");
  assert.match(leaderboardSource, /common\.loadingLeagueData/, "leaderboard overlay should use localized loading copy");
  assert.match(
    leaderboardSource,
    /const criticalDataReady =/,
    "leaderboard overlay should wait for the selected bundle, access state, live exposure state, and overview readiness"
  );
  assert.match(leaderboardSource, /const showBackgroundFetching = !initialLoading && isFetching/, "inline loading chip should only appear after the central initial overlay has finished");
  assert.match(overlaySource, /fixed inset-0/, "loading overlay should cover the viewport");
  assert.match(overlaySource, /createPortal/, "loading overlay should be portaled outside animated page containers");
  assert.match(overlaySource, /backdrop-blur-\[3px\]/, "loading overlay should blur the existing page");
});

test("leaderboard favorites are account-backed and clear on logout", () => {
  assert.doesNotMatch(leaderboardSource, /aigentra:leaderboard:favorites/, "leaderboard must not use a browser-global favorites key");
  assert.doesNotMatch(leaderboardSource, /localStorage\.getItem\("aigentra:leaderboard:favorites"/, "leaderboard must not hydrate favorites from global localStorage");
  assert.doesNotMatch(leaderboardSource, /localStorage\.setItem\("aigentra:leaderboard:favorites"/, "leaderboard must not persist favorites to global localStorage");
  assert.match(leaderboardSource, /\/api\/subscriber\/preferences/, "leaderboard should hydrate favorites from the signed-in subscriber preference API");
  assert.match(leaderboardSource, /session\.status === "unauthenticated"/, "leaderboard should explicitly clear favorite state after logout");
  assert.match(leaderboardSource, /favoriteTraderIds: \[\.\.\.next\]/, "favorite toggles should save the next account-scoped favorite list");
});

test("leaderboard preview renders the latest trader status feed", () => {
  assert.match(leaderboardSource, /buildLatestStatusFeedMap\(bundle\.statusFeeds \?\? \[\]\)/, "leaderboard should derive latest feed by trader");
  assert.match(leaderboardSource, /latestStatusFeed=/, "preview panel should receive the active trader feed");
  assert.match(leaderboardSource, /LatestStatusFeedNote/, "preview panel should render the compact feed note");
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
