import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const subscriberAccessCacheStorage = new Map();
const subscriberAccessPolicy = loadTsModule("../lib/subscriber-access-cache-policy.ts", {
  Date,
  encodeURIComponent,
  JSON,
  require,
  window: {
    sessionStorage: {
      getItem: (key) => subscriberAccessCacheStorage.get(key) ?? null,
      setItem: (key, value) => {
        subscriberAccessCacheStorage.set(key, value);
      }
    }
  }
});

const appShellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const accountSource = readFileSync(new URL("../components/subscriber-account-client.tsx", import.meta.url), "utf8");
const consensusSource = readFileSync(new URL("../components/consensus-page-client.tsx", import.meta.url), "utf8");
const traderDetailSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const accessGateSource = readFileSync(new URL("../components/access-gate.tsx", import.meta.url), "utf8");
const subscriberAccessSource = readFileSync(new URL("../components/use-subscriber-access.ts", import.meta.url), "utf8");
const subscriberAccessApiSource = readFileSync(new URL("../lib/subscriber-access-api.ts", import.meta.url), "utf8");
const subscriberAccessRouteSource = readFileSync(new URL("../app/api/subscriber/access/route.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const freePreviewSource = readFileSync(new URL("../lib/free-leaderboard-preview.ts", import.meta.url), "utf8");

test("account drawer exposes remaining AI review coupons for free users", () => {
  assert.match(appShellSource, /access\.drawerCouponLabel/, "drawer should label free review coupons");
  assert.match(appShellSource, /couponsRemaining/, "drawer should show remaining coupon count");
  assert.match(appShellSource, /couponsRemaining \?\? 0\}\/\{access\?\.couponLimit \?\? 3/, "drawer should render remaining/limit");
});

test("free leaderboard renders today's three public traders and locks the rest", () => {
  assert.match(freePreviewSource, /FREE_LEADERBOARD_LIMIT/, "preview policy should use the shared free preview limit");
  assert.match(leaderboardSource, /buildFreeLeaderboardPreview\(displayStandings, freePreviewSeed\)/, "free standings should use the curated preview picker");
  assert.doesNotMatch(leaderboardSource, /displayStandings\.slice\(0, FREE_LEADERBOARD_LIMIT\)/, "free standings should not be a raw top-N slice");
  assert.match(leaderboardSource, /visibleStandings/, "all visible leaderboard metrics should be derived from gated standings");
  assert.match(leaderboardSource, /LeaderboardLockedRows/, "hidden rows should advertise locked traders");
  assert.match(leaderboardSource, /access\.leaderboardPreviewTitle/, "locked rows should use localized preview copy");
  assert.match(leaderboardSource, /accessPreviewDescription\(t\("access\.leaderboardPreviewBody"\), count, locale\)/, "locked rows should insert the hidden trader count");
  assert.match(leaderboardSource, /const rankMasked = shouldUsePreviewLimit/, "free preview rows should mask their real rank");
  assert.match(leaderboardSource, /function MaskedRankBadge/, "free preview rows should render a rank-obscuring badge");
  assert.match(leaderboardSource, /<TraderRankBadge trader=\{trader\} t=\{t\} compact masked=\{rankMasked\}/, "mobile free preview rows should hide live rank numbers");
  assert.match(leaderboardSource, /<TraderRankBadge trader=\{trader\} t=\{t\} masked=\{rankMasked\}/, "desktop free preview rows should hide live rank numbers");
  assert.match(i18nSource, /오늘의 무료 공개 3명/, "Korean copy should describe the daily free public sample");
  assert.match(i18nSource, /\{count\}명/, "Korean copy should include the hidden trader count");
  assert.match(i18nSource, /오늘의 무료 공개 트레이더는 실제 순위를 숨깁니다\./, "Korean copy should explain hidden preview ranks");
});

test("free and live leaderboard surfaces exclude retired and zero-trade standings before access gating", () => {
  assert.match(
    leaderboardSource,
    /const displayStandings = useMemo\(\(\) => standings\.filter\(hasLeaderboardTradingRecord\)/,
    "the main table should remove ineligible traders before selecting public rows"
  );
  assert.match(
    leaderboardSource,
    /liveStandings\.filter\(isLeaderboardStandingVisible\)/,
    "the live race should use the same eligibility policy for subscribers and free users"
  );
});

test("AI decision terminal is redacted behind the subscriber gate", () => {
  const terminalSource = readFileSync(new URL("../components/ai-trade-terminal.tsx", import.meta.url), "utf8");
  assert.match(leaderboardSource, /AITradeTerminalLockedPreview/, "leaderboard should render a redacted terminal preview for locked users");
  assert.match(leaderboardSource, /lockedPreview=\{<AITradeTerminalLockedPreview/, "terminal lock should not render real execution details while locked");
  assert.match(leaderboardSource, /deferLockedChildren/, "terminal lock should defer real children until access is unlocked");
  assert.match(terminalSource, /ai-trade-terminal-locked-preview/, "redacted terminal preview should be testable");
});

test("subscriber access query state is scoped to the signed-in account", () => {
  assert.match(subscriberAccessSource, /session\.data\?\.user\?\.id/, "subscriber access should read the signed-in user id");
  assert.match(subscriberAccessSource, /session\.data\?\.user\?\.email/, "subscriber access should read the signed-in email");
  assert.doesNotMatch(
    subscriberAccessSource,
    /export const subscriberAccessQueryKey = \["subscriber", "access"\] as const;/,
    "subscriber access must not use one shared React Query key across all users"
  );
  assert.match(
    subscriberAccessSource,
    /queryKey: subscriberAccessQueryKey\([^)]*userId[^)]*email[^)]*\)/s,
    "subscriber access query key should include user identity so logout/account changes cannot reuse stale subscription state"
  );
  assert.doesNotMatch(
    subscriberAccessSource,
    /placeholderData: \(previousData\) => previousData \?\? guestSubscriberAccess/,
    "subscriber access should not show previous account access as placeholder data"
  );
});

test("subscriber access placeholder and browser cache only reuse the current account", () => {
  subscriberAccessCacheStorage.clear();
  const currentAccess = subscriberAccessFixture({ userId: "google-1", email: "operator@example.com", isSubscribed: true });
  const otherAccess = subscriberAccessFixture({ userId: "google-2", email: "other@example.com", isSubscribed: true });

  assert.equal(
    subscriberAccessPolicy.subscriberAccessPlaceholderData({
      isAuthenticated: true,
      userId: "google-1",
      email: "operator@example.com",
      previousData: currentAccess
    }),
    currentAccess,
    "same-account previous access should keep the UI stable while a refetch runs"
  );
  assert.equal(
    subscriberAccessPolicy.subscriberAccessPlaceholderData({
      isAuthenticated: true,
      userId: "google-1",
      email: "operator@example.com",
      previousData: otherAccess
    }),
    undefined,
    "previous access from another account must not be reused"
  );
  assert.deepEqual(
    subscriberAccessPolicy.subscriberAccessPlaceholderData({ isAuthenticated: false }),
    subscriberAccessPolicy.guestSubscriberAccess,
    "signed-out users should still get the guest preview state"
  );

  subscriberAccessPolicy.writeCachedSubscriberAccess(currentAccess);
  assert.deepEqual(
    subscriberAccessPolicy.readCachedSubscriberAccess("google-1", "operator@example.com"),
    currentAccess,
    "same-account browser cache should seed the authenticated leaderboard"
  );
  assert.equal(
    subscriberAccessPolicy.readCachedSubscriberAccess("google-2", "other@example.com"),
    null,
    "another account should not read the current account cache entry"
  );

  const cacheKey = subscriberAccessPolicy.subscriberAccessBrowserCacheKey("google-1", "operator@example.com");
  subscriberAccessCacheStorage.set(
    cacheKey,
    JSON.stringify({
      savedAt: Date.now() - subscriberAccessPolicy.SUBSCRIBER_ACCESS_BROWSER_CACHE_MS - 1,
      access: currentAccess
    })
  );
  assert.equal(
    subscriberAccessPolicy.readCachedSubscriberAccess("google-1", "operator@example.com"),
    null,
    "expired access cache should not mask a fresh entitlement lookup"
  );
});

test("authenticated subscriber access server failures degrade to a conservative non-cacheable preview", () => {
  assert.doesNotMatch(
    subscriberAccessSource,
    /if \(!response\.ok\) return guestSubscriberAccess/,
    "authenticated subscriber access 5xx responses must not be converted into a free guest state"
  );
  assert.doesNotMatch(
    subscriberAccessSource,
    /return parsed\.success \? parsed\.data : guestSubscriberAccess/,
    "invalid authenticated subscriber access responses must not be converted into a free guest state"
  );
  assert.match(
    subscriberAccessSource,
    /throw new SubscriberAccessClientError/,
    "authenticated subscriber access failures should surface as typed query errors"
  );
  assert.match(
    subscriberAccessApiSource,
    /subscriberAccessTimeoutSignal/,
    "server-side subscriber access calls should have a bounded timeout"
  );
  assert.match(
    subscriberAccessRouteSource,
    /subscriberAccessFallback/,
    "subscriber access route should return a conservative preview fallback when entitlement lookup is temporarily unavailable"
  );
  assert.match(
    subscriberAccessRouteSource,
    /status >= 500 && status < 600/,
    "subscriber access route should treat upstream 5xx responses as temporary fallback states"
  );
  assert.match(
    subscriberAccessRouteSource,
    /X-Subscriber-Access-Fallback/,
    "temporary fallback responses should be marked for operational debugging"
  );
  assert.match(
    subscriberAccessSource,
    /if \(!access\.unavailable\) writeCachedSubscriberAccess\(access\);/,
    "temporary fallback access should not poison the account-scoped browser cache"
  );
  assert.match(
    subscriberAccessSource,
    /refetchInterval: subscriberAccessRefetchInterval/,
    "temporary fallback access should retry in the background instead of staying stale for the normal cache window"
  );
});

test("subscriber gates use neutral pending state instead of guest blur while access is unknown", () => {
  assert.match(
    accessGateSource,
    /subscriber-access-pending/,
    "protected gates should render a neutral access-pending state while authenticated access is unresolved"
  );
  assert.match(
    accessGateSource,
    /const containerClass = fitContent \? "w-fit shrink-0" : "w-full min-w-0 max-w-full"/,
    "protected gates should not let blurred locked previews widen mobile route layouts"
  );
  assert.match(
    accessGateSource,
    /return <div className=\{`\$\{containerClass\} \$\{className\}`\}>\{children\}<\/div>;/,
    "unlocked subscriber gates should keep the same bounded width wrapper as locked previews"
  );
  assert.doesNotMatch(
    accessGateSource,
    /const resolvedAccess = access \?\? \{/,
    "protected gates must not immediately resolve missing authenticated access to the guest lock state"
  );
  assert.match(
    leaderboardSource,
    /const accessReady =/,
    "leaderboard should model access readiness separately from subscription truthiness"
  );
  assert.match(
    leaderboardSource,
    /const shouldLimitForFreeAccess =/,
    "leaderboard should only show free preview rows for a known free or guest state"
  );
  assert.match(
    leaderboardSource,
    /Boolean\(access\?\.unavailable\)/,
    "leaderboard should keep the locked preview when subscriber access is temporarily unavailable"
  );
  assert.doesNotMatch(
    leaderboardSource,
    /const isSubscribed = Boolean\(access\?\.isSubscribed\)/,
    "missing access data should not be treated the same as a known non-subscriber"
  );
});

test("subscriber-only screens are blurred behind the subscription gate", () => {
  assert.match(accountSource, /ProtectedContentGate/, "account settings should be protected");
  assert.match(accountSource, /access\.accountLockedTitle/, "account lock copy should be localized");
  assert.match(consensusSource, /ProtectedContentGate/, "AI sentiment should be protected");
  assert.match(consensusSource, /access\.consensusLockedTitle/, "sentiment lock copy should be localized");
  assert.match(consensusSource, /lockPlacement="viewport"/, "AI sentiment lock affordance should stay fixed in the viewport center");
});

test("subscription gate CTA jumps directly to the landing pricing plans", () => {
  assert.match(accessGateSource, /SUBSCRIPTION_PLANS_HREF = "\/#pricing"/, "subscription CTA should target the landing pricing anchor");
  assert.match(accessGateSource, /primaryHref = isGuest \? "\/login\?next=\/leaderboard" : SUBSCRIPTION_PLANS_HREF/, "signed-in locked users should not be sent to the top of the home page");
});

test("AI review timeline uses coupon unlocks instead of leaking modal content", () => {
  assert.match(traderDetailSource, /protectedScenarioSourceKey/, "scenario rows should have stable unlock keys");
  assert.match(traderDetailSource, /mode="coupon"/, "scenario reviews should use coupon mode");
  assert.match(traderDetailSource, /deferLockedChildren/, "locked scenario rows should not render real review children");
  assert.match(traderDetailSource, /scenario-timeline-locked-preview/, "locked scenario rows should render a static preview");
  assert.match(traderDetailSource, /scenarioUnlocked \? \(\) => setSelectedScenario/, "locked rows should not open the review modal before unlock");
});

test("locked content supports static previews with a charge confirmation dialog", () => {
  assert.match(accessGateSource, /deferLockedChildren/, "protected gates should support deferred real content");
  assert.match(accessGateSource, /lockedPreview/, "protected gates should accept a sanitized preview");
  assert.match(accessGateSource, /shouldRenderProtectedGateChildren/, "protected gates should choose children by access phase");
  assert.match(accessGateSource, /access\.reviewInlineLocked/, "coupon rows should use a compact inline locked label instead of a large repeated card");
  assert.match(accessGateSource, /lockPlacement === "viewport"/, "long locked content should support a viewport-centered affordance");
  assert.match(accessGateSource, /fixed left-1\/2 top-1\/2/, "viewport locks should be fixed in the visual center");
  assert.match(accessGateSource, /access\.useCouponDescription/, "coupon mode should explain the charge before unlocking");
  assert.match(accessGateSource, /unlockProtectedSource/, "coupon unlocks should call the server before revealing content");
  assert.match(accessGateSource, /review_coupon_limit_reached/, "coupon exhaustion should produce a specific localized state");
});

function subscriberAccessFixture(overrides = {}) {
  return {
    userId: "google-1",
    email: "operator@example.com",
    subscriptionStatus: "active",
    isSubscribed: false,
    couponLimit: 3,
    couponsUsed: 0,
    couponsRemaining: 3,
    unlockedSourceKeys: [],
    ...overrides
  };
}

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
