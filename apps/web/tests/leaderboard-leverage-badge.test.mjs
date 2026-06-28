import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const leverageHelpers = loadTsModule("../components/leaderboard-leverage.ts");

test("leaderboard shows leverage next to active side badges", () => {
  const sideBadgeIndex = source.indexOf("<SideBadge progress={progress} />");
  const leverageBadgeIndex = source.indexOf("<LeverageBadge progress={progress} />");

  assert.ok(sideBadgeIndex >= 0, "trader identity rows should render side badges");
  assert.ok(leverageBadgeIndex > sideBadgeIndex, "leverage badge should render next to and after the side badge");
  assert.match(source, /activePositionLeverage\(\{ exposure, summary: liveSummary \?\? summary, trader, position \}\)/, "active positions should use the shared leverage selector with live monthly-tab summaries");
  assert.match(source, /orderLeverage\(order\)/, "pending orders with a side badge should use known leverage");
  assert.match(source, /planLeverage\(plan\)/, "pending plans with a side badge should use known leverage");
  assert.match(source, /<LeverageBadge progress=\{progress\} \/>/, "trader identity rows should render a leverage badge next to side");
});

test("leaderboard averages multiple active leverage samples", () => {
  // Given: one trader has two active exposure entries.
  const first = leverageHelpers.appendLeverageSample({}, 5);

  // When: both leverage samples are folded into the exposure state.
  const exposure = leverageHelpers.appendLeverageSample(first, 10);

  // Then: the displayed value uses the average leverage.
  assert.equal(exposure.averageLeverage, 7.5);
  assert.equal(leverageHelpers.formatLeverageBadge(exposure.averageLeverage), "7.5x");
});

test("leaderboard active position leverage prefers exposure average", () => {
  // Given: every fallback source has a leverage value.
  const input = {
    exposure: { averageLeverage: 7.5 },
    summary: { averageLeverage: 4, leverage: 3 },
    trader: { averageLeverage: 2, leverage: 1 },
    position: { leverage: 9 }
  };

  // When: the active row chooses the leverage badge value.
  const leverage = leverageHelpers.activePositionLeverage(input);

  // Then: the aggregated exposure average wins over stale summaries and raw position data.
  assert.equal(leverage, 7.5);
});

test("leaderboard reads leverage from nested position payloads", () => {
  // Given: a position stores suggested leverage in the persisted plan payload.
  const position = { payload: { leveragePlan: { suggestedLeverage: "12" } } };

  // When: the row extracts position leverage.
  const leverage = leverageHelpers.positionLeverage(position);

  // Then: numeric strings are accepted from the API boundary.
  assert.equal(leverage, 12);
});

test("leaderboard reads leverage from nested order and plan payloads", () => {
  assert.equal(leverageHelpers.orderLeverage({ payload: { leverage: "3" } }), 3);
  assert.equal(leverageHelpers.planLeverage({ payload: { leveragePlan: { suggestedLeverage: 6 } } }), 6);
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
