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
    /const MONTHLY_RETURN_METRIC_KEYS: readonly ReturnMetricKey\[\] = \["monthly", "return7d", "return24h"\]/,
    "monthly tabs should offer only selected-month, 7D, and 24H return metrics"
  );
  assert.match(
    leaderboardSource,
    /keys: selectedLeagueMonth \? MONTHLY_RETURN_METRIC_KEYS : RETURN_METRIC_KEYS/,
    "monthly tabs should use a three-metric candidate set while the full league keeps the four-metric set"
  );
  assert.match(
    leaderboardSource,
    /selectReturnColumns\(\{ candidates: returnMetricCandidates, selectedKey: effectiveReturnMetricKey, count: 2 \}\)/,
    "desktop monthly tabs should display the chosen period plus one best non-duplicate companion"
  );
  assert.match(
    leaderboardSource,
    /const monthlyReturnLabel = selectedLeagueMonth \? monthReturnMetricLabel\(locale, selectedLeagueMonthParts\.month, t\) : t\("leaderboard\.monthlyReturn"\)/,
    "monthly tabs should label the primary return metric with the selected UTC month"
  );
  assert.match(i18nSource, /"leaderboard\.monthlyReturnWithMonth": "\{month\}월 수익률"/, "Korean monthly return label should include the selected month");
  assert.match(i18nSource, /"leaderboard\.monthlyReturnWithMonth": "\{month\} Return"/, "English monthly return label should use an interpolated month");
  assert.doesNotMatch(i18nSource, /24H \/ 7D 최고|Best 24H \/ 7D/, "monthly UI should not expose a generic best-of short-term label");
  assert.doesNotMatch(i18nSource, /24H 최고/, "short-term race labels should not read as a static best-of metric");
  assert.match(i18nSource, /"leaderboard\.currentLeague": "전체"/, "the non-monthly league tab should be labeled as the full league");
  assert.match(i18nSource, /"leaderboard\.terminal\.live": "LIVE"/, "the terminal should expose a stable live status independent of the selected league month");
  assert.match(leaderboardSource, /queryKey: \["league", "ai-trade-terminal", "BTCUSDT", locale\]/, "monthly tabs should reuse the same current terminal query");
  assert.doesNotMatch(leaderboardSource, /"ai-trade-terminal"[^\n]*selectedLeagueMonth/, "terminal events should not be rewritten by a historical ranking tab");
});

test("leaderboard replaces MDD with biggest win", () => {
  assert.match(leaderboardSource, /t\("leaderboard\.biggestWin"\)/, "leaderboard should label the column as biggest win");
  assert.match(leaderboardSource, /formatCurrency\(trader\.biggestWin, locale\)/, "leaderboard rows should render the biggest winning trade");
  assert.doesNotMatch(leaderboardSource, /t\("leaderboard\.mdd"\)/, "leaderboard should no longer use the MDD column label");
  assert.match(leagueSource, /biggestWin: numberValue\(summary\?\.biggestWin, 0\)/, "standings should preserve the API biggest-win payload");
  assert.doesNotMatch(leaderboardSource, /recentForm/, "leaderboard should not render the abandoned recent-form metric");
  assert.doesNotMatch(i18nSource, /leaderboard\.recent10/, "recent-form copy should not stay in the i18n bundle");
});

test("new and retired trader lifecycle badges are modeled for leaderboard surfaces", () => {
  assert.match(tradersSource, /"liquidation-pressure-sniper"/, "fallback trader catalog should include the liquidation trader");
  assert.match(tradersSource, /"volatility-skew-sentinel"/, "fallback trader catalog should include the skew trader");
  assert.match(tradersSource, /retiredFromMonth: "2026-07"/, "retired fallback traders should carry the July retirement marker");
  assert.match(leaderboardSource, /TraderLifecycleBadge/, "leaderboard rows should render lifecycle badges");
  assert.match(leaderboardSource, /function TraderRankBadge/, "retired traders should use a lifecycle-aware rank slot");
  assert.match(leaderboardSource, /isRetiredTraderLifecycle/, "retired lifecycle detection should be shared by rank and lifecycle badges");
  assert.match(leaderboardSource, /<TraderRankBadge trader=\{trader\} t=\{t\}/, "trader rows and preview should use a lifecycle-aware rank slot");
  assert.match(leaderboardSource, /isTraderVisibleInLeagueMonth/, "monthly placeholders should apply lifecycle visibility before rendering rows");
  assert.doesNotMatch(leaderboardSource, /trader\.retiredFromMonth && isSameOrAfterLeagueMonth/, "retired traders should remain in monthly league history");
  assert.match(leaderboardSource, /standings\.filter\(hasLeaderboardTradingRecord\)/, "the full leaderboard should retain retired traders with trading history");
  assert.match(leaderboardSource, /const retiredDelta = Number\(isRetiredTraderLifecycle\(a\)\) - Number\(isRetiredTraderLifecycle\(b\)\)/, "retired traders should sort below active traders in the full list");
  assert.match(leaderboardSource, /t\("leaderboard\.newTraderBadge"\)/, "new trader badge copy should be localized");
  assert.match(leaderboardSource, /t\("leaderboard\.retiredTraderBadge"\)/, "retired trader badge copy should be localized");
  assert.match(i18nSource, /"leaderboard\.retiredRankBadge": "감시 중단"/, "retired rank icon should carry an accessible localized label");
  assert.match(leagueSource, /"liquidation-pressure-sniper"/, "new trader visuals should be registered");
  assert.match(leagueSource, /"volatility-skew-sentinel"/, "new trader visuals should be registered");
  assert.match(i18nSource, /"traders\.liquidation-pressure-sniper\.name"/, "liquidation trader name should be localized");
  assert.match(i18nSource, /"traders\.volatility-skew-sentinel\.name"/, "skew trader name should be localized");
});
