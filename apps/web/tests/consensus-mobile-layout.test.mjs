import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const consensusSource = readFileSync(new URL("../components/consensus-page-client.tsx", import.meta.url), "utf8");
const averagePricesSource = readFileSync(new URL("../components/consensus-average-prices.tsx", import.meta.url), "utf8");
const overlaySource = readFileSync(new URL("../components/page-loading-overlay.tsx", import.meta.url), "utf8");

test("consensus average prices use mobile cards before the wide desktop table", () => {
  assert.match(consensusSource, /ConsensusAveragePrices/, "consensus page should delegate dense average-price UI");
  assert.match(consensusSource, /grid min-w-0 gap-3 md:grid-cols-2 md:gap-6/, "top consensus grid should not force mobile viewport expansion");
  assert.match(consensusSource, /data-testid="consensus-command-header"/, "consensus page should expose a command-style header");
  assert.doesNotMatch(consensusSource, /data-testid="consensus-market-strip"/, "removed market summary boxes should not render before the opinion card");
  assert.match(averagePricesSource, /data-testid="consensus-average-mobile-cards"/, "mobile average cards should be testable");
  assert.match(averagePricesSource, /sm:hidden/, "mobile cards should be the primary small-screen surface");
  assert.match(averagePricesSource, /hidden sm:block/, "wide table should wait until small-plus viewports");
  assert.match(averagePricesSource, /table-fixed/, "wide table should avoid horizontal scroll by keeping compact fixed columns");
});

test("consensus delays browser-cache placeholders until after hydration", () => {
  assert.match(consensusSource, /const \[cacheReady, setCacheReady\] = useState\(false\)/, "cache readiness should be client-state driven");
  assert.match(consensusSource, /useEffect\(\(\) => \{\s*setCacheReady\(true\);\s*\}, \[\]\);/s, "browser cache should only activate after mount");
  assert.match(consensusSource, /cacheReady \? getCachedLeaderboardBundle\("BTCUSDT", locale, CONSENSUS_BUNDLE_OPTIONS\)/, "localStorage-backed cache should not run during the first hydrated render");
});

test("consensus uses a lightweight initial bundle and full-screen loading overlay", () => {
  assert.match(consensusSource, /CONSENSUS_BUNDLE_OPTIONS: LeaderboardBundleRequestOptions = \{ includeRelated: false \}/, "sentiment page should not pull the full related leaderboard bundle");
  assert.match(consensusSource, /getActivePaperPositions\("BTCUSDT", undefined, CONSENSUS_EXPOSURE_LIMIT, \{ signal: context\.signal \}\)/, "active positions should load through the narrow exposure API with abort support");
  assert.match(consensusSource, /getPaperOrders\(CONSENSUS_EXPOSURE_LIMIT, "BTCUSDT", "open", undefined, \{ signal: context\.signal \}\)/, "active orders should load through the narrow order API with abort support");
  assert.doesNotMatch(consensusSource, /getRecentTradePlans/, "sentiment page should not fetch full pending trade-plan payloads");
  assert.doesNotMatch(consensusSource, /hourlyOpinionQuery\.isPending && !hourlyOpinionQuery\.data/, "the full-screen overlay should not wait for hourly AI opinion generation");
  assert.match(consensusSource, /PageLoadingOverlay/, "consensus should use the shared loading overlay");
  assert.match(overlaySource, /createPortal/, "loading overlay should portal to body instead of living under animated page transforms");
  assert.match(overlaySource, /backdrop-blur-\[3px\]/, "loading overlay should blur the page background");
});
