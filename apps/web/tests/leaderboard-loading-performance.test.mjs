import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const loadingPolicy = loadTsModule("../lib/leaderboard-loading-policy.ts", { URLSearchParams });
const accessGatePolicy = loadTsModule("../lib/access-gate-policy.ts");
const sessionRefetchPolicy = loadTsModule("../lib/session-refetch-policy.ts");

test("league overview shell is not blocked by slower live exposure or subscriber access queries", () => {
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: true,
      rankingPending: true,
      rankingPlaceholder: false
    }),
    false,
    "renderable standings should suppress the full-page overlay even while slower queries continue"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: true,
      rankingPlaceholder: false
    }),
    true,
    "a true empty initial ranking load should still show the full-page overlay"
  );
  assert.equal(
    loadingPolicy.shouldShowLeaderboardInitialOverlay({
      hasRenderableLeaderboard: false,
      rankingPending: true,
      rankingPlaceholder: true
    }),
    false,
    "placeholder standings should keep the shell visible during a period transition"
  );
});

test("leaderboard period tabs preserve URL state without duplicate route work", () => {
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "league=current&foo=bar", "2026-06"),
    "/leaderboard?league=monthly&foo=bar&leagueMonth=2026-06",
    "monthly selection should preserve unrelated filters while selecting the month"
  );
  assert.equal(
    loadingPolicy.buildLeaguePeriodUrl("/leaderboard", "?league=monthly&leagueMonth=2026-06&foo=bar", undefined),
    "/leaderboard?league=current&foo=bar",
    "current selection should clear the stale monthly parameter synchronously"
  );
});

test("locked overview can defer heavy protected children until subscriber access is known", () => {
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "pending",
      deferLockedChildren: true
    }),
    false,
    "pending access should render the lightweight preview when deferral is enabled"
  );
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "locked",
      deferLockedChildren: true
    }),
    false,
    "locked access should render the lightweight preview when deferral is enabled"
  );
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "unlocked",
      deferLockedChildren: true
    }),
    true,
    "unlocked subscribers should always render the protected children"
  );
  assert.equal(
    accessGatePolicy.shouldRenderProtectedGateChildren({
      phase: "locked",
      deferLockedChildren: false
    }),
    true,
    "existing gates keep their previous blurred-child behavior unless they opt into deferral"
  );
});

test("session and subscriber access policy avoid tab-focus refetch churn", () => {
  assert.equal(
    sessionRefetchPolicy.DASHBOARD_SESSION_REFETCH_POLICY.refetchOnWindowFocus,
    false,
    "dashboard session state should not refetch on every focus"
  );
  assert.equal(
    sessionRefetchPolicy.DASHBOARD_SESSION_REFETCH_POLICY.refetchInterval,
    0,
    "dashboard session state should not refetch on every focus or timer tick"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: true,
      freeAccessLimited: false
    }),
    true,
    "unknown subscriber access should keep the cheap preview limit while entitlement resolves"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: false,
      freeAccessLimited: true
    }),
    true,
    "known free access should keep the free preview limit"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: false,
      freeAccessLimited: false
    }),
    false,
    "known subscribed access should render the full leaderboard"
  );
  assert.equal(
    loadingPolicy.shouldUseLeaderboardPreviewLimit({
      subscriberAccessPending: false,
      subscriberAccessUnavailable: true,
      freeAccessLimited: false
    }),
    true,
    "subscriber access errors should keep the preview limit instead of unlocking the full leaderboard"
  );
});

function loadTsModule(relativePath, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
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
