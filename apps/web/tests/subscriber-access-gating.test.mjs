import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const appShellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const accountSource = readFileSync(new URL("../components/subscriber-account-client.tsx", import.meta.url), "utf8");
const consensusSource = readFileSync(new URL("../components/consensus-page-client.tsx", import.meta.url), "utf8");
const traderDetailSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const accessGateSource = readFileSync(new URL("../components/access-gate.tsx", import.meta.url), "utf8");

test("account drawer exposes remaining AI review coupons for free users", () => {
  assert.match(appShellSource, /access\.drawerCouponLabel/, "drawer should label free review coupons");
  assert.match(appShellSource, /couponsRemaining/, "drawer should show remaining coupon count");
  assert.match(appShellSource, /couponsRemaining \?\? 0\}\/\{access\?\.couponLimit \?\? 3/, "drawer should render remaining/limit");
});

test("free leaderboard only renders the public top five and locks the rest", () => {
  assert.match(leaderboardSource, /FREE_LEADERBOARD_LIMIT/, "leaderboard should use the shared free preview limit");
  assert.match(leaderboardSource, /standings\.slice\(0, FREE_LEADERBOARD_LIMIT\)/, "free standings should be sliced to top five");
  assert.match(leaderboardSource, /visibleStandings/, "all visible leaderboard metrics should be derived from gated standings");
  assert.match(leaderboardSource, /LeaderboardLockedRows/, "hidden rows should advertise locked traders");
  assert.match(leaderboardSource, /access\.leaderboardPreviewTitle/, "locked rows should use localized preview copy");
});

test("subscriber-only screens are blurred behind the subscription gate", () => {
  assert.match(accountSource, /ProtectedContentGate/, "account settings should be protected");
  assert.match(accountSource, /access\.accountLockedTitle/, "account lock copy should be localized");
  assert.match(consensusSource, /ProtectedContentGate/, "AI sentiment should be protected");
  assert.match(consensusSource, /access\.consensusLockedTitle/, "sentiment lock copy should be localized");
});

test("AI review timeline uses coupon unlocks instead of leaking modal content", () => {
  assert.match(traderDetailSource, /protectedScenarioSourceKey/, "scenario rows should have stable unlock keys");
  assert.match(traderDetailSource, /mode="coupon"/, "scenario reviews should use coupon mode");
  assert.match(traderDetailSource, /scenarioUnlocked \? \(\) => setSelectedScenario/, "locked rows should not open the review modal before unlock");
});

test("locked content uses a click-through blur with a charge confirmation dialog", () => {
  assert.match(accessGateSource, /blur-\[3px\]/, "locked content should remain visible enough to create curiosity");
  assert.match(accessGateSource, /access\.useCouponDescription/, "coupon mode should explain the charge before unlocking");
  assert.match(accessGateSource, /unlockProtectedSource/, "coupon unlocks should call the server before revealing content");
  assert.match(accessGateSource, /review_coupon_limit_reached/, "coupon exhaustion should produce a specific localized state");
});
