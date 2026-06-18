import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const overviewFilter = loadTsModule("../components/leaderboard-overview-filter.ts");
const formatSource = readFileSync(new URL("../lib/format.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("leaderboard reviewed status uses a compact localized review time", () => {
  assert.match(i18nSource, /"leaderboard\.status\.reviewedAt": "검토"/, "Korean review-time label should be compact");
  assert.match(i18nSource, /"leaderboard\.status\.reviewedAt": "Reviewed"/, "English review-time label should be compact");
  assert.match(formatSource, /export function formatClockTime/, "format helper should expose HH:mm clock time");
  assert.match(leaderboardSource, /getElapsedTimeString\(summary\?\.updatedAt\)/, "leaderboard should use elapsed time for reviewed rows");
  assert.doesNotMatch(leaderboardSource, /detail: formatDateTime\(summary\?\.updatedAt, locale\)/, "reviewed rows should not show full date/time");
});

test("league overview stream is restricted to AI review records", () => {
  assert.match(leaderboardSource, /const aiReviewLogsOnly = reviewsList/, "overview should derive log rows only from loaded AI review records");
  assert.doesNotMatch(leaderboardSource, /pendingPlans\.forEach/, "pending trade plans must not appear in League Overview");
  assert.doesNotMatch(leaderboardSource, /fallback-1/, "League Overview must not show synthetic scanner fallback rows");
  assert.doesNotMatch(leaderboardSource, /type: "PLAN"/, "League Overview should not emit plan log rows");
  assert.match(leaderboardSource, /review\.traderId \?\? review\.trader_id/, "overview review rows should handle backend snake_case trader ids");
  assert.match(leaderboardSource, /getManagementReviews\(limit, offset\)/, "overview should still load AI management reviews");
  assert.match(leaderboardSource, /getAiReviews\(limit, offset\)/, "overview should include second-stage entry AI reviews");
  assert.match(leaderboardSource, /record\.aiReviews/, "overview should extract entry review records from the AI reviews API");
  assert.match(leaderboardSource, /진입 심사 완료/, "entry reviews should be labeled separately from risk audits");
  assert.match(leaderboardSource, /formatRelativeDateTime\(createdAt, locale, t\)/, "overview review rows should show recent relative time");
});

test("league overview hides rejected or failed review records", () => {
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "entry_review",
      traderId: "session-raider",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "ADJUST_AND_APPROVE",
      status: "ok"
    }),
    true,
    "approved second-stage reviews should remain visible"
  );
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "entry_review",
      traderId: "session-raider",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "REJECT",
      status: "ok",
      rationale: "최근 손실 이후 동일한 전략이 거부되었습니다."
    }),
    false,
    "rejected entry reviews should not appear in League Overview"
  );
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "management_review",
      traderId: "range-maker",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "NEEDS_MORE_DATA",
      actionType: "NEEDS_MORE_DATA",
      status: "error",
      fallback: true,
      riskFlags: ["provider_failed"],
      rationale: "Position management provider failed."
    }),
    false,
    "provider-failure management reviews should not appear in League Overview"
  );
  assert.equal(
    overviewFilter.isDisplayableOverviewReview({
      overviewSource: "management_review",
      traderId: "range-maker",
      createdAt: "2026-06-18T12:00:00Z",
      decision: "MOVE_STOP_TO_BREAKEVEN",
      actionType: "MOVE_STOP_TO_BREAKEVEN",
      status: "ok",
      rationale: "Stop moved to breakeven after favorable move."
    }),
    true,
    "applied management action reviews should remain visible"
  );
});

test("league overview stream keeps a page cache and stops duplicate infinite loading", () => {
  assert.match(leaderboardSource, /overviewActivityCache/, "overview should keep a module-level cache across route unmounts");
  assert.match(leaderboardSource, /refreshOverviewActivityCache/, "overview should refresh the first page instead of blank reloading on remount");
  assert.match(leaderboardSource, /mergeOverviewReviews/, "overview should merge newly fetched reviews into cached rows");
  assert.match(leaderboardSource, /uniqueReviews\.length === 0/, "overview should stop auto-loading when a page contains only duplicates");
  assert.match(leaderboardSource, /setHasMore\(false\)/, "overview should stop observer retries after exhausted or failed loads");
});

test("leaderboard browser cache placeholders wait until after hydration", () => {
  assert.match(leaderboardSource, /const \[cacheReady, setCacheReady\] = useState\(false\)/, "leaderboard cache readiness should be client-state driven");
  assert.match(leaderboardSource, /useEffect\(\(\) => \{\s*setCacheReady\(true\);\s*\}, \[\]\);/s, "leaderboard cache should only activate after mount");
  assert.match(leaderboardSource, /cacheReady \? getCachedLeaderboardBundle\("BTCUSDT"\)/, "localStorage-backed leaderboard cache should not run during hydration");
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
