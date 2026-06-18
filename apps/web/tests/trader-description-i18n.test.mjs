import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const traders = loadTsModule("../lib/traders.ts");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const headerSource = readFileSync(new URL("../components/trader-profile-detail/header.tsx", import.meta.url), "utf8");

test("all fallback traders expose richer localized detail copy", () => {
  for (const trader of traders.fallbackTraders) {
    assert.equal(traders.traderDetailKey(trader.id), `traders.${trader.id}.detail`);
    assert.match(i18nSource, new RegExp(`"traders\\.${escapeRegExp(trader.id)}\\.detail": ".{42,}"`), `${trader.id} needs Korean detail copy`);
    assert.match(i18nSource, new RegExp(`"traders\\.${escapeRegExp(trader.id)}\\.detail": "[^"]{70,}"`, "g"), `${trader.id} needs English detail copy`);
  }
});

test("detail surfaces use rich copy while compact trader cards keep short copy", () => {
  assert.match(headerSource, /traderDetailKey/, "trader profile hero should use rich descriptions");
  assert.match(leaderboardSource, /traderDetailKey/, "leaderboard preview sidebar should use rich descriptions");
  assert.match(leaderboardSource, /traderShortKey/, "dense leaderboard rows should keep compact descriptions");
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
