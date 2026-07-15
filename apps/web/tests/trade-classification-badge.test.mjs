import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const helperUrl = new URL("../components/trade-classification.ts", import.meta.url);
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const badgeSource = readFileSync(new URL("../components/trade-classification-badges.tsx", import.meta.url), "utf8");
const positionSource = readFileSync(new URL("../components/trader-profile-detail/binance-position-panel.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const helper = existsSync(helperUrl) ? loadTsModule(helperUrl) : null;

test("trade classification reads frozen plan before trader defaults", () => {
  assert.ok(helper, "shared trade classification helper must exist");
  const classification = helper.tradeClassification(
    { payload: { managementPlan: { holdingHorizon: "SWING", strategyFamily: "PULLBACK" } } },
    { holdingHorizon: "INTRADAY", strategyFamily: "BREAKOUT" }
  );

  assert.deepEqual(classification, { holdingHorizon: "SWING", strategyFamily: "PULLBACK" });
});

test("trade classification rejects malformed values and uses a valid fallback", () => {
  assert.ok(helper, "shared trade classification helper must exist");
  const classification = helper.tradeClassification(
    { managementPlan: { holdingHorizon: "UNKNOWN", strategyFamily: "MAGIC" } },
    { holdingHorizon: "POSITION", strategyFamily: "TREND_FOLLOW" }
  );

  assert.deepEqual(classification, { holdingHorizon: "POSITION", strategyFamily: "TREND_FOLLOW" });
});

test("entry-plan and in-position trader badges render after side and leverage", () => {
  const sideIndex = leaderboardSource.indexOf("<SideBadge progress={progress} />");
  const leverageIndex = leaderboardSource.indexOf("<LeverageBadge progress={progress} />");
  const classificationIndex = leaderboardSource.indexOf("<TradeClassificationBadge progress={progress} t={t} />");

  assert.ok(sideIndex >= 0);
  assert.ok(leverageIndex > sideIndex);
  assert.ok(classificationIndex > leverageIndex);
  assert.match(leaderboardSource, /tradeClassification\(position, exposure, trader\)/);
  assert.match(leaderboardSource, /tradeClassification\(order, exposure, trader\)/);
  assert.match(leaderboardSource, /tradeClassification\(plan, exposure, trader\)/);
});

test("leaderboard classification shows strategy below the untruncated trader name", () => {
  const identitySource = leaderboardSource.slice(
    leaderboardSource.indexOf("function TraderIdentity"),
    leaderboardSource.indexOf("function TraderLifecycleBadge")
  );
  assert.match(leaderboardSource, /<TradeClassificationBadges classification=\{progress\.classification \?\? null\} t=\{t\} compact showHorizon=\{false\} \/>/);
  assert.match(badgeSource, /readonly showHorizon\?: boolean/);
  assert.match(badgeSource, /const visibleLabel = showHorizon \? `\$\{holdingLabel\} · \$\{strategyLabel\}` : strategyLabel/);
  assert.match(badgeSource, /title=\{visibleLabel\}/);
  assert.match(badgeSource, /whitespace-nowrap/);
  assert.match(identitySource, /<p className="truncate text-sm font-bold tracking-tight text-white">[\s\S]*?<\/div>\s*<div className="mt-1 flex min-w-0 items-center gap-1\.5">\s*<SideBadge/);
  assert.ok(identitySource.indexOf("</p>") < identitySource.indexOf("<SideBadge"), "the name element should close before the three position badges begin");
  assert.doesNotMatch(leaderboardSource, /mt-4 flex flex-wrap items-center gap-2/);
  assert.doesNotMatch(leaderboardSource, /flex min-w-0 flex-wrap items-center gap-2/);
});

test("trader detail places localized classification beside the perpetual symbol", () => {
  assert.match(positionSource, /<TradeClassificationBadges classification=\{tradeClassification\(position, classificationFallback\)\} t=\{t\} compact \/>/);
  assert.match(positionSource, /Perp/);
});

test("all supported locales define holding horizon and strategy family keys", () => {
  for (const key of [
    "holdingHorizon.scalp",
    "holdingHorizon.intraday",
    "holdingHorizon.swing",
    "holdingHorizon.position",
    "strategyFamily.breakout",
    "strategyFamily.trendFollow",
    "strategyFamily.pullback",
    "strategyFamily.meanReversion",
    "strategyFamily.liquidityReversal",
    "strategyFamily.flowContrarian",
    "strategyFamily.volatility"
  ]) {
    assert.equal((i18nSource.match(new RegExp(`\\"${key}\\"`, "g")) ?? []).length, 5, `${key} must exist for five locales`);
  }
});

function loadTsModule(url) {
  const source = readFileSync(url, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
