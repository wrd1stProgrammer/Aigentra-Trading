import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const overlaySource = readFileSync(new URL("../components/page-loading-overlay.tsx", import.meta.url), "utf8");
const overviewFilter = loadTsModule("../components/leaderboard-overview-filter.ts");
const formatSource = readFileSync(new URL("../lib/format.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("leaderboard completed status uses entry-ended copy and compact elapsed time", () => {
  assert.match(i18nSource, /"leaderboard\.status\.reviewed": "진입종료"/, "Korean completed status should read as entry ended");
  assert.match(i18nSource, /"leaderboard\.status\.reviewed": "Entry ended"/, "English completed status should read as entry ended");
  assert.match(i18nSource, /"leaderboard\.status\.reviewedAt": "종료"/, "Korean completion-time label should be compact");
  assert.match(i18nSource, /"leaderboard\.status\.reviewedAt": "Ended"/, "English completion-time label should be compact");
  assert.match(formatSource, /export function formatClockTime/, "format helper should expose HH:mm clock time");
  assert.match(leaderboardSource, /getElapsedTimeString\(summary\?\.updatedAt\)/, "leaderboard should use elapsed time for reviewed rows");
  assert.doesNotMatch(leaderboardSource, /detail: formatDateTime\(summary\?\.updatedAt, locale\)/, "reviewed rows should not show full date/time");
});

test("leaderboard preview omits the lower current-state block", () => {
  assert.doesNotMatch(leaderboardSource, /t\("leaderboard\.previewStatus"\)/, "hover preview should not render the lower current-state heading");
  assert.doesNotMatch(leaderboardSource, /StatusLine/, "hover preview should not keep the removed status-row helper");
});

test("league overview stream is restricted to AI review records", () => {
  assert.match(leaderboardSource, /const aiReviewLogsOnly = reviewsList/, "overview should derive log rows only from loaded AI review records");
  assert.doesNotMatch(leaderboardSource, /pendingPlans\.forEach/, "pending trade plans must not appear in League Overview");
  assert.doesNotMatch(leaderboardSource, /fallback-1/, "League Overview must not show synthetic scanner fallback rows");
  assert.doesNotMatch(leaderboardSource, /type: "PLAN"/, "League Overview should not emit plan log rows");
  assert.match(leaderboardSource, /review\.traderId \?\? review\.trader_id/, "overview review rows should handle backend snake_case trader ids");
  assert.match(leaderboardSource, /getLeagueOverviewReviews\(limit, offset, locale\)/, "overview should load one combined localized review page");
  assert.doesNotMatch(leaderboardSource, /getManagementReviews\(limit, offset/, "overview should not fetch a separate management page");
  assert.doesNotMatch(leaderboardSource, /getAiReviews\(limit, offset/, "overview should not fetch a separate entry-review page");
  assert.match(leaderboardSource, /record\.reviews/, "overview should extract combined review records from the overview API");
  assert.match(leaderboardSource, /leaderboard\.entryReviewCompleted/, "entry reviews should be labeled separately through i18n");
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
  assert.match(leaderboardSource, /cacheReady \? getCachedLeaderboardBundle\("BTCUSDT", locale\)/, "localStorage-backed leaderboard cache should not run during hydration");
});

test("leaderboard uses the shared full-screen loading overlay", () => {
  assert.match(leaderboardSource, /PageLoadingOverlay/, "leaderboard should render the shared loading overlay");
  assert.match(leaderboardSource, /common\.loadingLeagueData/, "leaderboard overlay should use localized loading copy");
  assert.match(overlaySource, /fixed inset-0/, "loading overlay should cover the viewport");
  assert.match(overlaySource, /createPortal/, "loading overlay should be portaled outside animated page containers");
  assert.match(overlaySource, /backdrop-blur-\[3px\]/, "loading overlay should blur the existing page");
});

test("leaderboard preview renders the latest trader status feed", () => {
  assert.match(leaderboardSource, /buildLatestStatusFeedMap\(bundle\.statusFeeds \?\? \[\]\)/, "leaderboard should derive latest feed by trader");
  assert.match(leaderboardSource, /latestStatusFeed=/, "preview panel should receive the active trader feed");
  assert.match(leaderboardSource, /LatestStatusFeedNote/, "preview panel should render the compact feed note");
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
