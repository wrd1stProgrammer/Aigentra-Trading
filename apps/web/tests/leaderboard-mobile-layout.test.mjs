import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const source = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");

test("mobile leaderboard uses compact ranking rows instead of dashboard metric grids", () => {
  assert.match(source, /function MobileRankingList/, "mobile leaderboard should keep a dedicated small-screen surface");
  assert.match(source, /grid-cols-\[38px_minmax\(0,1fr\)_88px_28px\]/, "mobile rows should read like stable rank, trader, return, and favorite columns");
  assert.match(source, /<StatusPill label=\{progress\.label\} tone=\{progress\.tone\} \/>/, "mobile rows should show live entry or monitoring state");
  assert.doesNotMatch(source, /mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4/, "mobile leaderboard should not use the old 2x2 metric-card grid");
});

test("leaderboard return metric headers use the selected column labels", () => {
  assert.match(source, /function topReturnColumns/, "leaderboard should choose return metric columns at table level");
  assert.match(source, /primaryReturnColumn\.label/, "primary return header should show the actual selected metric label");
  assert.match(source, /secondaryReturnColumn\.label/, "secondary return header should show the actual selected metric label");
  assert.doesNotMatch(source, /t\("leaderboard\.bestReturn"\)/, "leaderboard should not render a generic best-return column header");
  assert.doesNotMatch(source, /t\("leaderboard\.nextReturn"\)/, "leaderboard should not render a generic next-return column header");
});
