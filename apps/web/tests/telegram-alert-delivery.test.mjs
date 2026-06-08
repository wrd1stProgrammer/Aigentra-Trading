import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const cwd = process.cwd();
const root = fs.existsSync(path.join(cwd, "apps", "web")) ? cwd : path.resolve(cwd, "..", "..");

function readSource(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

test("Telegram alert delivery has an authenticated test-send API", () => {
  const routeSource = readSource("apps/web/app/api/telegram/test/route.ts");
  const alertSource = readSource("apps/web/lib/telegram-alerts.ts");

  assert.match(routeSource, /auth\(\)/, "test-send route should be protected by the signed-in account when auth is configured");
  assert.match(routeSource, /sendTelegramMessage/, "test-send route should call the Telegram delivery helper");
  assert.match(routeSource, /TELEGRAM_BOT_TOKEN/, "route should require the server Telegram bot token");
  assert.match(alertSource, /https:\/\/api\.telegram\.org\/bot/, "delivery helper should use the Telegram Bot API");
  assert.match(alertSource, /composeTelegramTestMessage/, "helper should create a service-specific test alert message");
});

test("subscriber account exposes a Telegram test-send control", () => {
  const accountSource = readSource("apps/web/components/subscriber-account-client.tsx");
  const buttonSource = readSource("apps/web/components/telegram-test-button.tsx");

  assert.match(accountSource, /TelegramTestButton/, "account page should render the test-send control near alert settings");
  assert.match(buttonSource, /\/api\/telegram\/test/, "test-send control should post to the local Telegram API route");
  assert.match(buttonSource, /readiness\.canSend/, "test-send control should respect delivery readiness before sending");
});
