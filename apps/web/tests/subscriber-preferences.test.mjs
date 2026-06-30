import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const preferences = loadTsModule("../lib/subscriber-preferences.ts");
const requireFromTest = createRequire(import.meta.url);
const accountSource = readFileSync(new URL("../components/subscriber-account-client.tsx", import.meta.url), "utf8");
const appProviderSource = readFileSync(new URL("../components/app-provider.tsx", import.meta.url), "utf8");
const preferencesSource = readFileSync(new URL("../lib/subscriber-preferences.ts", import.meta.url), "utf8");

test("subscriber preferences keep favorite traders scoped to the signed-in user", () => {
  const initial = preferences.createSubscriberPreferences({
    userId: "user_google_1",
    email: "operator@example.com"
  });

  const favorited = preferences.toggleFavoriteTrader(initial, "pullback-architect");
  const removed = preferences.toggleFavoriteTrader(favorited, "pullback-architect");

  assert.equal(initial.subscriptionStatus, "active");
  assert.equal(initial.locale, "ko");
  assert.deepEqual(favorited.favoriteTraderIds, ["pullback-architect"]);
  assert.deepEqual(removed.favoriteTraderIds, []);
  assert.equal(favorited.storageKey, "atl:subscriber:operator@example.com");
});

test("subscriber preferences preserve the account locale for localized AI review requests", () => {
  const initial = preferences.createSubscriberPreferences({
    userId: "user_google_1",
    email: "operator@example.com"
  });
  const merged = preferences.mergeStoredSubscriberPreferences(initial, {
    favoriteTraderIds: ["session-raider"],
    locale: "ru",
    telegramSettings: {}
  });

  assert.equal(merged.locale, "ru");
  assert.deepEqual(merged.favoriteTraderIds, ["session-raider"]);
});

test("telegram alert settings normalize unsupported inputs and report delivery readiness", () => {
  const normalized = preferences.normalizeTelegramSettings({
    enabled: true,
    chatId: " 123456789 ",
    eventTypes: ["entry", "take_profit", "ai_review_high", "invalid-kind"],
    reviewSections: ["position", "action", "watch_conditions", "invalid-section"],
    minReturnPct: "2.75"
  });

  assert.equal(normalized.chatId, "123456789");
  assert.deepEqual(normalized.eventTypes, ["pending_entry", "position_entry", "take_profit", "ai_review_high"]);
  assert.deepEqual(normalized.reviewSections, ["position", "action", "watch_conditions"]);
  assert.equal(normalized.minReturnPct, 2.75);
  assert.deepEqual(preferences.telegramDeliveryReadiness(normalized, { botTokenConfigured: false }), {
    status: "missing_server_token",
    canSend: false
  });
});

test("account UI exposes favorites and Telegram alert customization", () => {
  assert.match(accountSource, /data-testid="subscriber-favorites"/, "account page should expose favorite traders");
  assert.match(accountSource, /data-testid="telegram-alert-settings"/, "account page should expose Telegram alert settings");
  assert.match(accountSource, /data-testid="subscriber-command-summary"/, "account page should expose a compact operational summary");
  assert.match(accountSource, /aria-label=\{copy\.telegramSettingsLabel\}/, "Telegram master switch should have an accessible label");
  assert.match(accountSource, /TelegramReviewSectionSettings/, "account page should expose Telegram review section settings");
  assert.match(preferencesSource, /"pending_entry"/, "alert types should cover pending entries");
  assert.match(preferencesSource, /"ai_review_high"/, "alert types should expose AI review importance");
  assert.match(preferencesSource, /"league_sentiment"/, "alert types should expose Aigentra aggregate opinion alerts");
  assert.match(preferencesSource, /"trader_status_feed"/, "alert types should expose trader status feed alerts");
  assert.match(preferencesSource, /"watch_conditions"/, "review section settings should expose full AI review content");
});

test("telegram alert settings default to core event types and full review content", () => {
  const initial = preferences.createSubscriberPreferences({
    userId: "user_google_1",
    email: "operator@example.com"
  });

  assert.deepEqual(initial.telegramSettings.eventTypes, [
    "pending_entry",
    "position_entry",
    "take_profit",
    "stop_loss",
    "ai_review_low",
    "ai_review_medium",
    "ai_review_high",
    "league_sentiment",
    "risk"
  ]);
  assert.equal(initial.telegramSettings.eventTypes.includes("trader_status_feed"), false);
  assert.deepEqual(initial.telegramSettings.reviewSections, [
    "status",
    "position",
    "summary",
    "action",
    "key_reasons",
    "risks",
    "watch_conditions",
    "manager_note",
    "rationale"
  ]);
});

test("account min-return inputs capture DOM values before scheduling preference updates", () => {
  assert.match(
    accountSource,
    /const updateMinReturnPct = \(value: string\) =>/,
    "account page should normalize the input value before invoking a state updater"
  );
  assert.doesNotMatch(
    accountSource,
    /setPreferences\(\(current\)[\s\S]{0,260}event\.currentTarget\.value/,
    "React event targets should not be read inside functional state updaters"
  );
});

test("subscriber preferences are account-backed instead of browser-only localStorage", () => {
  const accountRouteSource = readFileSync(new URL("../app/api/subscriber/preferences/route.ts", import.meta.url), "utf8");
  const accountPageSource = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");
  const syncHookSource = readFileSync(new URL("../components/use-subscriber-preference-sync.ts", import.meta.url), "utf8");
  const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");

  assert.match(accountRouteSource, /auth\(\)/, "preference API should be protected by Auth.js session");
  assert.match(accountRouteSource, /saveSubscriberPreferences/, "preference API should persist changes through the backend service");
  assert.match(accountPageSource, /loadSubscriberPreferences/, "account page should hydrate initial preferences from server persistence");
  assert.match(syncHookSource, /\/api\/subscriber\/preferences/, "account UI should save preference edits through the account API");
  assert.doesNotMatch(accountSource, /localStorage/, "subscriber preferences should not be browser-only state");
  assert.match(leaderboardSource, /\/api\/subscriber\/preferences/, "leaderboard favorites should use the same account preference API");
  assert.doesNotMatch(leaderboardSource, /aigentra:leaderboard:favorites/, "leaderboard should not keep a browser-global favorite cache");
});

test("app locale hydrates from signed-in subscriber preferences", () => {
  assert.match(appProviderSource, /useSession/, "app provider should wait for the signed-in user before hydrating account locale");
  assert.match(appProviderSource, /\/api\/subscriber\/preferences/, "app provider should read the account-backed locale");
  assert.match(appProviderSource, /atl-locale/, "account locale should update the browser locale cache used by localized API queries");
  assert.match(preferencesSource, /readonly locale: Locale/, "subscriber preferences should carry the saved account locale");
});

test("subscriber preference hydration falls back quickly when the account API stalls", async () => {
  let requestedUrl = "";
  let requestedTimeoutMs = 0;
  let abortObserved = false;
  let timerCleared = false;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const api = loadSubscriberPreferenceApiModule({
    fetchImpl: (url, init) => {
      requestedUrl = String(url);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          abortObserved = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    },
    setTimeoutImpl: (callback, timeoutMs) => {
      requestedTimeoutMs = timeoutMs;
      return realSetTimeout(callback, 0);
    },
    clearTimeoutImpl: (timer) => {
      timerCleared = true;
      realClearTimeout(timer);
    }
  });

  const result = await api.loadSubscriberPreferences({
    userId: "user_google_1",
    email: "operator@example.com"
  });

  assert.equal(requestedTimeoutMs, 2_000, "preference reads should use the short local-login timeout budget");
  assert.equal(abortObserved, true, "stalled preference reads should be aborted by the timeout signal");
  assert.equal(timerCleared, true, "timeout timers should be cleared after the request settles");
  assert.equal(new URL(requestedUrl).pathname, "/api/subscribers/preferences");
  assert.equal(result.email, "operator@example.com");
  assert.deepEqual(result.favoriteTraderIds, []);
  assert.equal(result.locale, "ko");
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

function loadSubscriberPreferenceApiModule({
  fetchImpl,
  setTimeoutImpl,
  clearTimeoutImpl
}) {
  const tsSource = readFileSync(new URL("../lib/subscriber-preference-api.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  const requireMock = (specifier) => {
    if (specifier === "@/lib/subscriber-preferences") return preferences;
    if (specifier === "zod") return requireFromTest("zod");
    throw new Error(`Unexpected subscriber preference API import: ${specifier}`);
  };
  vm.runInNewContext(outputText, {
    AbortController,
    DOMException,
    URL,
    clearTimeout: clearTimeoutImpl,
    exports: module.exports,
    fetch: fetchImpl,
    module,
    process: {
      env: {
        NEXT_PUBLIC_API_BASE_URL: "https://subscriber-api.example.test",
        SUBSCRIBER_API_TOKEN: "test-token"
      }
    },
    require: requireMock,
    setTimeout: setTimeoutImpl
  });
  return module.exports;
}
