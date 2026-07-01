import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const tradersSource = readFileSync(new URL("../lib/traders.ts", import.meta.url), "utf8");
const leagueSource = readFileSync(new URL("../lib/league.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("monthly league defaults to the current UTC month instead of a hard-coded June tab", () => {
  assert.match(
    leaderboardSource,
    /function currentUtcLeagueMonth/,
    "leaderboard should compute the default monthly tab from UTC now"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /DEFAULT_LEAGUE_MONTH = "2026-06"|option\.year === 2026 && option\.month === 6/,
    "July and later months must not be filtered out by a June-only guard"
  );
  assert.match(
    leaderboardSource,
    /return parseLeagueMonth\(month \?\? undefined\) \? String\(month\) : currentUtcLeagueMonth\(\);/,
    "plain leaderboard loads should default to the current UTC monthly league"
  );
  assert.match(
    leaderboardSource,
    /setSelectedLeagueMonth\(initialLeagueMonthFromSearchParams\(searchParams\)\)/,
    "URL changes should continue to re-apply the current UTC monthly default"
  );
});

test("monthly league UI does not overwrite selected-month returns with live trailing returns", () => {
  assert.doesNotMatch(
    leaderboardSource,
    /applyLiveReturnMetrics\(standings, liveReturnMetricByTrader\)/,
    "monthly rankings should keep selected-month return metrics intact"
  );
  assert.match(
    leaderboardSource,
    /selectedLeagueMonth \? \[fallbackReturnColumn\("monthly", t\)\] : topReturnColumns\(visibleStandings, t\)/,
    "monthly tabs should display the selected-month return column"
  );
});

test("new and retired trader lifecycle badges are modeled for leaderboard surfaces", () => {
  assert.match(tradersSource, /"liquidation-pressure-sniper"/, "fallback trader catalog should include the liquidation trader");
  assert.match(tradersSource, /"volatility-skew-sentinel"/, "fallback trader catalog should include the skew trader");
  assert.match(tradersSource, /retiredFromMonth: "2026-07"/, "retired fallback traders should carry the July retirement marker");
  assert.match(leaderboardSource, /TraderLifecycleBadge/, "leaderboard rows should render lifecycle badges");
  assert.match(leaderboardSource, /isTraderVisibleInLeagueMonth/, "monthly placeholders should apply lifecycle visibility before rendering rows");
  assert.match(leaderboardSource, /t\("leaderboard\.newTraderBadge"\)/, "new trader badge copy should be localized");
  assert.match(leaderboardSource, /t\("leaderboard\.retiredTraderBadge"\)/, "retired trader badge copy should be localized");
  assert.match(leagueSource, /"liquidation-pressure-sniper"/, "new trader visuals should be registered");
  assert.match(leagueSource, /"volatility-skew-sentinel"/, "new trader visuals should be registered");
  assert.match(i18nSource, /"traders\.liquidation-pressure-sniper\.name"/, "liquidation trader name should be localized");
  assert.match(i18nSource, /"traders\.volatility-skew-sentinel\.name"/, "skew trader name should be localized");
});
