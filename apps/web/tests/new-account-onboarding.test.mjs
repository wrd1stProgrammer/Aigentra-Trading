import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const shellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../components/new-account-onboarding-modal.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/subscriber/onboarding/route.ts", import.meta.url), "utf8");
const dictionarySource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("new accounts complete onboarding before the reward modal", () => {
  assert.match(shellSource, /setWelcomePhase\("onboarding"\)/);
  assert.match(shellSource, /setWelcomePhase\("reward"\)/);
  assert.ok(shellSource.indexOf("NewAccountOnboardingModal") < shellSource.indexOf("NewAccountRewardModal"));
});

test("onboarding collects four answers and only completes after persistence", () => {
  assert.match(modalSource, /acquisitionSource/);
  assert.match(modalSource, /weeklyPositionFrequency/);
  assert.match(modalSource, /primaryGoal/);
  assert.match(modalSource, /experienceLevel/);
  assert.match(modalSource, /method: "PUT"/);
  assert.match(modalSource, /if \(!response\.ok\)/);
  assert.match(modalSource, /type="radio"/);
  assert.match(modalSource, /role="progressbar"/);
  assert.match(modalSource, /activeIndex <= 0/, "Shift+Tab from the dialog container should wrap to the last control");
  assert.match(modalSource, /activeIndex < 0 \|\| document\.activeElement === last/, "Tab from the dialog container should enter the first control");
});

test("authenticated route owns identity and all locales define onboarding copy", () => {
  assert.match(routeSource, /const identity = await subscriberIdentity\(\)/);
  assert.doesNotMatch(routeSource, /userId: parsed\.data/);
  for (const localeMarker of ["const ruOverrides", "const ptBROverrides", "const trOverrides"]) {
    const localeStart = dictionarySource.indexOf(localeMarker);
    assert.notEqual(localeStart, -1);
    assert.ok(dictionarySource.indexOf('"onboarding.discovery.title"', localeStart) > localeStart);
  }
});
