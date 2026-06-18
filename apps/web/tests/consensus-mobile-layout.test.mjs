import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const consensusSource = readFileSync(new URL("../components/consensus-page-client.tsx", import.meta.url), "utf8");
const averagePricesSource = readFileSync(new URL("../components/consensus-average-prices.tsx", import.meta.url), "utf8");

test("consensus average prices use mobile cards before the wide desktop table", () => {
  assert.match(consensusSource, /ConsensusAveragePrices/, "consensus page should delegate dense average-price UI");
  assert.match(consensusSource, /grid min-w-0 gap-6 md:grid-cols-2/, "top consensus grid should not force mobile viewport expansion");
  assert.match(consensusSource, /data-testid="consensus-command-header"/, "consensus page should expose a command-style header");
  assert.match(consensusSource, /data-testid="consensus-market-strip"/, "consensus page should summarize market state before dense panels");
  assert.match(averagePricesSource, /data-testid="consensus-average-mobile-cards"/, "mobile average cards should be testable");
  assert.match(averagePricesSource, /sm:hidden/, "mobile cards should be the primary small-screen surface");
  assert.match(averagePricesSource, /hidden overflow-x-auto sm:block/, "wide table should wait until small-plus viewports");
});

test("consensus delays browser-cache placeholders until after hydration", () => {
  assert.match(consensusSource, /const \[cacheReady, setCacheReady\] = useState\(false\)/, "cache readiness should be client-state driven");
  assert.match(consensusSource, /useEffect\(\(\) => \{\s*setCacheReady\(true\);\s*\}, \[\]\);/s, "browser cache should only activate after mount");
  assert.match(consensusSource, /cacheReady \? getCachedLeaderboardBundle\("BTCUSDT", locale\)/, "localStorage-backed cache should not run during the first hydrated render");
});
