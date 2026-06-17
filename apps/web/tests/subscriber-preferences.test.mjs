import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const preferences = loadTsModule("../lib/subscriber-preferences.ts");
const accountSource = readFileSync(new URL("../components/subscriber-account-client.tsx", import.meta.url), "utf8");
const preferencesSource = readFileSync(new URL("../lib/subscriber-preferences.ts", import.meta.url), "utf8");

test("subscriber preferences keep favorite traders scoped to the signed-in user", () => {
  const initial = preferences.createSubscriberPreferences({
    userId: "user_google_1",
    email: "operator@example.com"
  });

  const favorited = preferences.toggleFavoriteTrader(initial, "pullback-architect");
  const removed = preferences.toggleFavoriteTrader(favorited, "pullback-architect");

  assert.equal(initial.subscriptionStatus, "active");
  assert.deepEqual(favorited.favoriteTraderIds, ["pullback-architect"]);
  assert.deepEqual(removed.favoriteTraderIds, []);
  assert.equal(favorited.storageKey, "atl:subscriber:operator@example.com");
});

test("telegram alert settings normalize unsupported inputs and report delivery readiness", () => {
  const normalized = preferences.normalizeTelegramSettings({
    enabled: true,
    chatId: " 123456789 ",
    eventTypes: ["entry", "take_profit", "ai_review_high", "invalid-kind"],
    minReturnPct: "2.75"
  });

  assert.equal(normalized.chatId, "123456789");
  assert.deepEqual(normalized.eventTypes, ["pending_entry", "position_entry", "take_profit", "ai_review_high"]);
  assert.equal(normalized.minReturnPct, 2.75);
  assert.deepEqual(preferences.telegramDeliveryReadiness(normalized, { botTokenConfigured: false }), {
    status: "missing_server_token",
    canSend: false
  });
});

test("account UI exposes favorites and Telegram alert customization", () => {
  assert.match(accountSource, /data-testid="subscriber-favorites"/, "account page should expose favorite traders");
  assert.match(accountSource, /data-testid="telegram-alert-settings"/, "account page should expose Telegram alert settings");
  assert.match(preferencesSource, /"pending_entry"/, "alert types should cover pending entries");
  assert.match(preferencesSource, /"ai_review_high"/, "alert types should expose AI review importance");
});

test("telegram alert settings default to core trade lifecycle alerts", () => {
  const initial = preferences.createSubscriberPreferences({
    userId: "user_google_1",
    email: "operator@example.com"
  });

  assert.deepEqual(initial.telegramSettings.eventTypes, ["pending_entry", "position_entry", "take_profit", "stop_loss"]);
});

test("subscriber preferences are account-backed instead of browser-only localStorage", () => {
  const accountRouteSource = readFileSync(new URL("../app/api/subscriber/preferences/route.ts", import.meta.url), "utf8");
  const accountPageSource = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");
  const syncHookSource = readFileSync(new URL("../components/use-subscriber-preference-sync.ts", import.meta.url), "utf8");

  assert.match(accountRouteSource, /auth\(\)/, "preference API should be protected by Auth.js session");
  assert.match(accountRouteSource, /saveSubscriberPreferences/, "preference API should persist changes through the backend service");
  assert.match(accountPageSource, /loadSubscriberPreferences/, "account page should hydrate initial preferences from server persistence");
  assert.match(syncHookSource, /\/api\/subscriber\/preferences/, "account UI should save preference edits through the account API");
  assert.doesNotMatch(accountSource, /localStorage/, "subscriber preferences should not be browser-only state");
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
