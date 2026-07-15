import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");

test("league bundle queries poll live paper-trading data", () => {
  assert.match(apiSource, /LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "live query interval should be centralized");
  assert.match(apiSource, /TRADER_DETAIL_LIVE_REFETCH_INTERVAL_MS/, "detail live query interval should be centralized");
  assert.match(apiSource, /leaderboardBundleQueryOptions[\s\S]*refetchInterval: leaderboardBundleRefetchInterval/, "leaderboard bundle should poll through the warming-aware interval policy");
  assert.match(apiSource, /leaderboardBundleRefetchInterval[\s\S]*LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "complete leaderboard bundles should keep the normal live polling interval");
  assert.match(apiSource, /traderDetailBundleQueryOptions[\s\S]*refetchInterval: TRADER_DETAIL_LIVE_REFETCH_INTERVAL_MS/, "trader detail bundle should poll on its faster detail interval");
});

test("leaderboard adjacent live queries also refresh while viewing", () => {
  assert.match(leaderboardSource, /getCachedLeaderboardBundle/, "leaderboard should seed initial data from browser cache");
  assert.doesNotMatch(leaderboardSource, /initialData/, "fallback data must not block the first live fetch");
  assert.match(leaderboardSource, /placeholderData[\s\S]*getCachedLeaderboardBundle/, "leaderboard should use browser cache only as placeholder data");
  assert.match(leaderboardSource, /pendingPlansQuery[\s\S]*refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "pending plans should refresh on leaderboard");
  assert.match(leaderboardSource, /activeSnapshotsQuery[\s\S]*refetchInterval: LEAGUE_LIVE_REFETCH_INTERVAL_MS/, "equity snapshots should refresh on leaderboard");
});

test("trader detail page keeps the live bundle polling after navigation", () => {
  assert.match(detailSource, /traderDetailBundleQueryOptions\(traderId, symbol, locale\)/, "detail page should use the shared localized live query options");
  assert.doesNotMatch(detailSource, /traderDetailBundleQueryOptions\(traderId, symbol, reviewsLimit, eventsLimit, locale\)/, "detail pagination should not churn the live bundle query key");
  assert.match(detailSource, /enabled:\s*clientHydrated/, "detail page should wait for browser locale hydration before issuing the localized bundle request");
});

test("trader detail page subscribes to server execution events for immediate fills", () => {
  assert.match(apiSource, /getTraderExecutionEventsUrl/, "API helper should expose the server execution event stream URL");
  assert.match(apiSource, /resolveEventStreamBaseUrl/, "execution event streams should resolve their own base URL");
  assert.match(apiSource, /EVENT_STREAM_API_BASE_URL/, "SSE should avoid the normal browser fetch proxy when an absolute API URL is configured");
  assert.doesNotMatch(
    apiSource,
    /getTraderExecutionEventsUrl[\s\S]*`\$\{API_BASE_URL\}\/api\/league\/traders/,
    "EventSource should not run through the Next backend proxy because aborted streams create noisy pipe failures"
  );
  assert.match(detailSource, /new EventSource\(executionEventsUrl\)/, "detail page should subscribe to backend paper execution events when available");
  assert.match(detailSource, /refetchQueries\(\{ queryKey: detailKey, type: "active" \}\)/, "execution events should immediately refetch the active detail bundle");
  assert.match(detailSource, /invalidateQueries\(\{ queryKey: leaderboardKey \}\)/, "execution events should also invalidate the visible leaderboard cache");
});

test("leaderboard uses one global event stream for immediate terminal refresh", () => {
  assert.match(apiSource, /getLeagueLiveEventsUrl/, "API helper should expose one league-wide event stream URL");
  assert.match(leaderboardSource, /new EventSource\(leagueLiveEventsUrl\)/, "leaderboard should open one global event stream");
  assert.match(leaderboardSource, /addEventListener\("paper_execution"/, "execution changes should refresh the terminal");
  assert.match(leaderboardSource, /addEventListener\("ai_review_created"/, "new AI reviews should refresh the terminal");
  assert.match(leaderboardSource, /setQueryData<InfiniteData<AITradeTerminalSource, AITradeTerminalPage>>/, "live events should merge a bounded terminal head page");
  assert.match(leaderboardSource, /mergeAITradeTerminalHead\(current, nextHead\)/, "head refresh should preserve and repaginate loaded terminal history");
  assert.match(leaderboardSource, /INITIAL_AI_TRADE_TERMINAL_PAGE,[\s\S]*\{ refresh: true \}/, "only the SSE head refresh should bypass the process-local review cache");
  assert.match(apiSource, /if \(options\?\.refresh\) reviewParams\.set\("refresh", "true"\)/, "normal terminal loads and pagination should retain review caching");
  assert.equal(
    leaderboardSource.match(/cancelQueries\(\{ queryKey: terminalKey, exact: true \}\)/g)?.length,
    2,
    "SSE head refresh should cancel stale terminal fetches before its request and before its final cache merge"
  );
  assert.doesNotMatch(leaderboardSource, /invalidateQueries\(\{ queryKey: terminalKey/, "live events must not refetch every loaded infinite-query page");
  assert.match(leaderboardSource, /setTimeout\([\s\S]*250/, "bursty live events should be coalesced before refreshing queries");
  assert.match(leaderboardSource, /removeEventListener\("paper_execution"/, "the execution listener should be cleaned up");
  assert.match(leaderboardSource, /source\.close\(\)/, "the global stream should close on unmount");
  assert.match(leaderboardSource, /300_000/, "periodic terminal polling should remain only as a sparse recovery path");
});

test("execution event stream URL policy skips local cross-origin SSE only", () => {
  assert.equal(
    loadApiModule({
      apiBaseUrl: "https://aigentra-trading.nostalgia-drive.com",
      windowLocation: { hostname: "localhost", origin: "http://localhost:3001" }
    }).getTraderExecutionEventsUrl("channel-rider", "BTCUSDT"),
    null,
    "local frontend sessions should skip remote SSE streams that fail CORS"
  );

  assert.equal(
    loadApiModule({
      apiBaseUrl: "http://localhost:3001",
      windowLocation: { hostname: "localhost", origin: "http://localhost:3001" }
    }).getTraderExecutionEventsUrl("channel-rider", "BTCUSDT"),
    "http://localhost:3001/api/league/traders/channel-rider/execution-events?symbol=BTCUSDT",
    "same-origin local SSE streams should remain available"
  );

  assert.equal(
    loadApiModule({
      apiBaseUrl: "https://aigentra-trading.nostalgia-drive.com",
      windowLocation: { hostname: "app.aigentra.test", origin: "https://app.aigentra.test" }
    }).getTraderExecutionEventsUrl("channel-rider", "BTCUSDT"),
    "https://aigentra-trading.nostalgia-drive.com/api/league/traders/channel-rider/execution-events?symbol=BTCUSDT",
    "non-local deployments should keep the configured backend event stream"
  );
});

function loadApiModule({
  apiBaseUrl,
  windowLocation
}) {
  const { outputText } = ts.transpileModule(apiSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    AbortController,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    exports: module.exports,
    fetch,
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    },
    module,
    process: {
      env: {
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl
      }
    },
    setTimeout,
    window: {
      location: windowLocation,
      localStorage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined
      }
    }
  });
  return module.exports;
}
