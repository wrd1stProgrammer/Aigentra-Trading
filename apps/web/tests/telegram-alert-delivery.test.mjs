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

test("subscriber account connects Telegram through a user-bound start link", () => {
  const accountSource = readSource("apps/web/components/subscriber-account-client.tsx");
  const copySource = readSource("apps/web/components/subscriber-account-copy.ts");
  const connectPanelSource = readSource("apps/web/components/telegram-connect-panel.tsx");
  const linkRouteSource = readSource("apps/web/app/api/telegram/link/route.ts");
  const apiClientSource = readSource("apps/web/lib/subscriber-preference-api.ts");

  assert.match(accountSource, /TelegramConnectPanel/, "account page should render the connection panel instead of a raw chat-id workflow");
  assert.match(copySource, /Chat ID 입력은 필요 없습니다/, "connection copy should explain that users do not manually enter a Chat ID");
  assert.match(connectPanelSource, /\/api\/telegram\/link/, "connection panel should request a signed Telegram start link");
  assert.match(connectPanelSource, /window\.open/, "connection panel should open Telegram for the user");
  assert.match(linkRouteSource, /createTelegramStartLink/, "local route should proxy link creation through the backend service");
  assert.match(apiClientSource, /\/api\/subscribers\/telegram\/link/, "backend client should call the subscriber Telegram link endpoint");
});
