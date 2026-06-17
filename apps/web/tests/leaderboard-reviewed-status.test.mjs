import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
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
});

test("league overview stream keeps a page cache and stops duplicate infinite loading", () => {
  assert.match(leaderboardSource, /overviewActivityCache/, "overview should keep a module-level cache across route unmounts");
  assert.match(leaderboardSource, /refreshOverviewActivityCache/, "overview should refresh the first page instead of blank reloading on remount");
  assert.match(leaderboardSource, /mergeOverviewReviews/, "overview should merge newly fetched reviews into cached rows");
  assert.match(leaderboardSource, /uniqueReviews\.length === 0/, "overview should stop auto-loading when a page contains only duplicates");
  assert.match(leaderboardSource, /setHasMore\(false\)/, "overview should stop observer retries after exhausted or failed loads");
});
