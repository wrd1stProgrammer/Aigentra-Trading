import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const traders = loadTsModule("../lib/traders.ts");
const loadingPolicy = loadTsModule("../lib/leaderboard-loading-policy.ts", { URLSearchParams });

test("high voltage league owns five independent ten-thousand-dollar trader profiles", () => {
  assert.equal(traders.highVoltageTraderIds.length, 5);
  for (const traderId of traders.highVoltageTraderIds) {
    const profile = traders.fallbackTraders.find((trader) => trader.id === traderId);
    assert.ok(profile, `${traderId} should exist in the fallback roster`);
    assert.equal(profile.mockPerformance.currentEquity, 10_000);
    assert.equal(profile.riskLevel, "EXTREME");
  }
});

test("high voltage selection is refreshable and isolated from standard standings", () => {
  assert.equal(
    loadingPolicy.buildHighVoltageLeagueUrl("/leaderboard", "league=monthly&leagueMonth=2026-07&foo=bar"),
    "/leaderboard?league=high-voltage&foo=bar"
  );
  assert.match(leaderboardSource, /data-league-period="high-voltage"/);
  assert.match(leaderboardSource, /if \(leagueView === "high-voltage"\) \{/);
  assert.match(leaderboardSource, /highVoltageTraderIds\.flatMap/);
  assert.match(leaderboardSource, /fallbackTraders\.find\(\(trader\) => trader\.id === traderId\)/);
  assert.match(leaderboardSource, /\.slice\(0, 3\)/);
  assert.match(leaderboardSource, /return !highVoltage && isTraderVisibleInLeagueMonth/);
  assert.match(leaderboardSource, /leagueView === "high-voltage" \? standings : displayStandings/);
});

function loadTsModule(relativePath, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  vmRun(outputText, module, globals);
  return module.exports;
}

function vmRun(source, module, globals) {
  const run = new Function("module", "exports", ...Object.keys(globals), source);
  run(module, module.exports, ...Object.values(globals));
}
