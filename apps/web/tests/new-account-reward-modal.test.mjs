import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const storage = new Map();
const rewardPolicy = loadTsModule("../lib/new-account-reward.ts", {
  DOMException,
  require,
  window: {
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, value)
    }
  }
});

const loginSource = readFileSync(new URL("../components/login-page-client.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/new-account-reward-modal.tsx", import.meta.url), "utf8");

test("successful account creation leaves a one-session reward signal", () => {
  storage.clear();

  rewardPolicy.markNewAccountRewardPending("NEW@Example.com ");

  assert.equal(rewardPolicy.isNewAccountRewardPending("new@example.com"), true);
  assert.equal(rewardPolicy.isNewAccountRewardPending("other@example.com"), false);
  rewardPolicy.acknowledgeNewAccountReward();
  assert.equal(rewardPolicy.isNewAccountRewardPending("new@example.com"), false);
  assert.match(loginSource, /markNewAccountRewardPending\(email\)/, "signup should bind the reward to the created account");
});

test("leaderboard only opens the reward for an untouched confirmed coupon balance", () => {
  assert.match(shellSource, /pathname !== "\/leaderboard"/, "reward should be limited to the leaderboard landing route");
  assert.match(shellSource, /access\.couponsRemaining === access\.couponLimit/, "used coupon balances should not reopen the welcome reward");
  assert.match(shellSource, /access\.couponLimit === 3/, "the welcome reward should reflect the three-view grant");
  assert.match(shellSource, /!access\.isSubscribed/, "subscribers should not see the reward");
  assert.match(shellSource, /!access\.unavailable/, "unresolved access states should not see the reward");
  assert.match(shellSource, /isNewAccountRewardPending\(authenticatedEmail\)/, "another account should not inherit the signup reward");
});

test("reward modal is accessible, dismissible, and localized", () => {
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /event\.key === "Escape"/, "Escape should dismiss the reward");
  assert.match(modalSource, /event\.key !== "Tab"/, "keyboard focus should stay inside the modal");
  assert.match(modalSource, /overflow-y-auto/, "short viewports should be able to scroll the full reward");
  assert.match(modalSource, /my-auto/, "the reward should center only while the viewport has enough height");
  assert.match(modalSource, /무료 보기 3회가 도착했습니다/, "Korean reward copy should lead with the actual benefit");
  assert.match(modalSource, /Your 3 free views are ready/, "English users should receive equivalent copy");
  assert.match(modalSource, /무료 보기 시작하기/, "the primary action should return users to the leaderboard experience");
});

function loadTsModule(relativePath, globals) {
  const filename = new URL(relativePath, import.meta.url);
  const source = readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ ...globals, exports: module.exports, module });
  new vm.Script(transpiled, { filename: filename.pathname }).runInContext(context);
  return module.exports;
}
