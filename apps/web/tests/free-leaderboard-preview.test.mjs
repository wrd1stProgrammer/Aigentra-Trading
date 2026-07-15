import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const previewPolicy = loadTsModule("../lib/free-leaderboard-preview.ts", {
  Date,
  Math,
  Number,
  require: (specifier) => {
    if (specifier === "@/lib/subscriber-access-cache-policy") return { FREE_LEADERBOARD_LIMIT: 3 };
    return require(specifier);
  }
});

test("free leaderboard preview keeps rank one, one non-negative trader, and one soft negative trader", () => {
  const standings = [
    standing("rank-one", 1, 12.5),
    standing("positive-a", 2, 2.4),
    standing("positive-b", 3, 0),
    standing("soft-negative-a", 4, -0.05),
    standing("soft-negative-b", 5, -0.4),
    standing("soft-negative-c", 6, -0.8),
    standing("deep-negative", 7, -7.2)
  ];

  const preview = previewPolicy.buildFreeLeaderboardPreview(standings, "2026-07-05");

  assert.equal(preview.length, 3);
  assert.equal(preview[0].id, "rank-one");
  assert.ok(["positive-a", "positive-b"].includes(preview[1].id), "second slot should be non-negative and not the leader");
  assert.ok(
    ["soft-negative-a", "soft-negative-b", "soft-negative-c"].includes(preview[2].id),
    "third slot should come from the least-negative candidate pool"
  );
  assert.notEqual(preview[2].id, "deep-negative");
  assert.equal(new Set(preview.map((item) => item.id)).size, 3);
});

test("free leaderboard preview fills to three traders when one bucket is empty", () => {
  const standings = [
    standing("rank-one", 1, 8),
    standing("positive-a", 2, 3),
    standing("positive-b", 3, 1),
    standing("positive-c", 4, 0.5)
  ];

  const preview = previewPolicy.buildFreeLeaderboardPreview(standings, "2026-07-05");

  assert.equal(preview.length, 3);
  assert.equal(preview[0].id, "rank-one");
  assert.deepEqual(new Set(preview.map((item) => item.id)), new Set(["rank-one", "positive-a", "positive-b"]));
});

test("free leaderboard preview excludes retired and zero-trade traders before selecting three rows", () => {
  const standings = [
    standing("retired-leader", 1, 15, { lifecycleStatus: "retired", trades: 12 }),
    standing("zero-trade", 2, 10, { trades: 0 }),
    standing("eligible-leader", 3, 8),
    standing("eligible-positive", 4, 2),
    standing("eligible-negative", 5, -0.2),
    standing("eligible-extra", 6, -1)
  ];

  const preview = previewPolicy.buildFreeLeaderboardPreview(standings, "2026-07-05");

  assert.equal(preview.length, 3);
  assert.equal(preview[0].id, "eligible-leader");
  assert.equal(preview.some((item) => item.id === "retired-leader"), false);
  assert.equal(preview.some((item) => item.id === "zero-trade"), false);
});

test("free leaderboard preview seed uses a stable UTC day key", () => {
  assert.equal(
    previewPolicy.currentFreeLeaderboardPreviewSeed(new Date("2026-07-05T23:59:59Z")),
    "2026-07-05"
  );
});

function standing(id, rank, rankingReturn, overrides = {}) {
  return {
    id,
    rank,
    rankingReturn,
    returnPct: rankingReturn,
    trades: 1,
    lifecycleStatus: "active",
    retiredFromMonth: null,
    ...overrides
  };
}

function loadTsModule(relativePath, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: module.exports,
    module,
    ...globals
  });
  return module.exports;
}
