import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const source = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");

test("mobile leaderboard uses compact ranking rows instead of dashboard metric grids", () => {
  assert.match(source, /function MobileRankingList/, "mobile leaderboard should keep a dedicated small-screen surface");
  assert.match(source, /grid min-w-0 max-w-full gap-3 overflow-x-clip/, "leaderboard route should not let horizontal lanes widen the mobile viewport");
  assert.match(source, /data-testid="live-race-board"[\s\S]*?className="relative w-full min-w-0 max-w-full overflow-hidden/, "live race board should not widen the one-column mobile grid when unlocked for subscribers");
  assert.match(source, /grid w-full min-w-0 grid-cols-3 gap-1\.5 lg:min-w-\[420px\] lg:max-w-\[420px\]/, "live race metrics should stay three compact columns inside the mobile viewport");
  assert.match(source, /data-testid="live-race-board-lane"[\s\S]*?grid w-full min-w-0 max-w-full auto-cols/, "the horizontal race lane should scroll inside the card instead of setting page width");
  assert.match(source, /auto-cols-\[minmax\(160px,56vw\)\]/, "live race cards should stay compact on mobile");
  const mobileLeaderStart = source.indexOf('<div className="sm:hidden">');
  const desktopLeaderStart = source.indexOf('<div className="hidden min-w-0 items-start justify-between gap-2 sm:flex');
  assert.ok(mobileLeaderStart >= 0 && desktopLeaderStart > mobileLeaderStart, "race leader should split mobile and desktop layouts");
  const mobileLeaderBlock = source.slice(mobileLeaderStart, desktopLeaderStart);
  assert.doesNotMatch(mobileLeaderBlock, /TraderMark|TraderRankBadge|displayName/, "mobile lead race card should not show trader profile, name, or rank");
  assert.match(source, /mt-0\.5 hidden truncate text-\[11px\] text-zinc-500 sm:block/, "secondary race card detail copy should be hidden on mobile to reduce height");
  assert.match(source, /w-full min-w-0 max-w-full lg:hidden/, "mobile ranking list should stay bounded to the viewport");
  assert.match(source, /grid-cols-\[38px_minmax\(0,1fr\)_88px_28px\]/, "mobile rows should read like stable rank, trader, return, and favorite columns");
  assert.match(source, /<StatusPill label=\{progress\.label\} tone=\{progress\.tone\} \/>/, "mobile rows should show live entry or monitoring state");
  assert.doesNotMatch(source, /mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4/, "mobile leaderboard should not use the old 2x2 metric-card grid");
});

test("leaderboard return metric headers use the selected column labels", () => {
  assert.match(source, /function selectReturnColumns/, "leaderboard should choose return metric columns at table level");
  assert.match(source, /const returnMetricCandidates = useMemo\(/, "leaderboard should build candidate metric columns before rendering table headers");
  assert.match(source, /primaryReturnColumn\.label/, "primary return header should show the actual selected metric label");
  assert.match(source, /secondaryReturnColumn\?\.label \?\? t\("leaderboard\.trades"\)/, "secondary header should show the selected metric label or trades when monthly mode has one return column");
  assert.doesNotMatch(source, /t\("leaderboard\.bestReturn"\)/, "leaderboard should not render a generic best-return column header");
  assert.doesNotMatch(source, /t\("leaderboard\.nextReturn"\)/, "leaderboard should not render a generic next-return column header");
});
