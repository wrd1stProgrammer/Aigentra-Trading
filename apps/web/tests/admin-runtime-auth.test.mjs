import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "@auth/core/jwt";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTH_SECRET = "admin-runtime-auth-secret-minimum-32-chars";
const ADMIN_EMAIL = "admin@example.com";
const NON_ADMIN_EMAIL = "viewer@example.com";
const ADMIN_API_TOKEN = "test-admin-token";

let backendServer;
let backendBaseUrl;
let nextProcess;
let nextBaseUrl;
let backendRequests = [];

before(async () => {
  backendServer = await startBackendServer();
  backendBaseUrl = `http://127.0.0.1:${backendServer.address().port}`;
  nextProcess = await startNextDevServer();
  nextBaseUrl = `http://127.0.0.1:${nextProcess.port}`;
});

after(async () => {
  if (nextProcess) {
    await stopChild(nextProcess.child);
  }
  if (backendServer) {
    await new Promise((resolveClose) => backendServer.close(resolveClose));
  }
});

test("admin API routes enforce unauthenticated, non-admin, and admin sessions", async () => {
  const unauthenticated = await fetch(`${nextBaseUrl}/api/admin/overview`);
  assert.equal(unauthenticated.status, 401);

  const nonAdmin = await fetch(`${nextBaseUrl}/api/admin/overview`, {
    headers: { cookie: await sessionCookie(NON_ADMIN_EMAIL) },
  });
  assert.equal(nonAdmin.status, 403);

  const adminOverview = await fetch(`${nextBaseUrl}/api/admin/overview`, {
    headers: { cookie: await sessionCookie(ADMIN_EMAIL) },
  });
  assert.equal(adminOverview.status, 200);
  assert.equal((await adminOverview.json()).database.status, "ok");

  const adminTable = await fetch(`${nextBaseUrl}/api/admin/table?table=subscriber_preferences&limit=5`, {
    headers: { cookie: await sessionCookie(ADMIN_EMAIL) },
  });
  assert.equal(adminTable.status, 200);
  assert.equal((await adminTable.json()).table, "subscriber_preferences");

  const blockedTable = await fetch(`${nextBaseUrl}/api/admin/table?table=sqlite_master`, {
    headers: { cookie: await sessionCookie(ADMIN_EMAIL) },
  });
  assert.equal(blockedTable.status, 400);

  assert.ok(backendRequests.length >= 3, "admin requests should reach the backend only after admin auth succeeds");
  assert.ok(
    backendRequests.every((request) => request.token === ADMIN_API_TOKEN),
    "backend admin API calls must include only the admin token"
  );
});

test("admin page redirects guests, blocks non-admins, and renders the dashboard for admins", async () => {
  const guestPage = await fetch(`${nextBaseUrl}/admin`, { redirect: "manual" });
  assert.equal(guestPage.status, 307);
  assert.match(guestPage.headers.get("location") ?? "", /\/login\?next=\/admin$/);

  const nonAdminPage = await fetch(`${nextBaseUrl}/admin`, {
    headers: { cookie: await sessionCookie(NON_ADMIN_EMAIL) },
  });
  assert.equal(nonAdminPage.status, 200);
  assert.match(await nonAdminPage.text(), /관리자 권한이 없습니다/);

  const adminPage = await fetch(`${nextBaseUrl}/admin`, {
    headers: { cookie: await sessionCookie(ADMIN_EMAIL) },
  });
  const html = await adminPage.text();
  assert.equal(adminPage.status, 200);
  assert.match(html, /Aigentra 운영 대시보드/);
  assert.match(html, /data-testid="admin-dashboard"/);
  assert.doesNotMatch(html, /postgres:\/\/|password=/i);
});

async function startBackendServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const token = request.headers["x-admin-api-token"];
    backendRequests.push({ method: request.method, path: url.pathname, token });

    if (token !== ADMIN_API_TOKEN) {
      writeJson(response, 401, { detail: "admin API token required" });
      return;
    }

    if (url.pathname === "/api/admin/overview") {
      writeJson(response, 200, adminOverviewPayload());
      return;
    }
    if (url.pathname === "/api/admin/table") {
      const table = url.searchParams.get("table") ?? "";
      if (table !== "subscriber_preferences") {
        writeJson(response, 400, { detail: "unsupported admin table" });
        return;
      }
      writeJson(response, 200, adminTablePayload());
      return;
    }

    writeJson(response, 404, { detail: "not found" });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function startNextDevServer() {
  const port = await freePort();
  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      AUTH_SECRET,
      AUTH_GOOGLE_ID: "test-google-client",
      AUTH_GOOGLE_SECRET: "test-google-secret",
      ADMIN_EMAILS: ADMIN_EMAIL,
      ADMIN_API_TOKEN,
      NEXT_PUBLIC_API_BASE_URL: backendBaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  await waitForServer(child, `http://127.0.0.1:${port}/api/admin/overview`, logs);
  return { child, port };
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForServer(child, url, logs) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(url);
      if (response.status === 401) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 500));
  }
  throw new Error(`Next dev server did not become ready: ${logs.join("").slice(-2_000)}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), 5_000)),
  ]);
  if (exited) return;
  child.kill("SIGKILL");
  await once(child, "exit");
}

async function sessionCookie(email) {
  const token = await encode({
    token: { sub: `google-${email}`, email, name: email.split("@")[0], picture: "" },
    secret: AUTH_SECRET,
    salt: "authjs.session-token",
  });
  return `authjs.session-token=${encodeURIComponent(token)}`;
}

function writeJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function adminOverviewPayload() {
  return {
    generatedAt: "2026-07-02T00:00:00.000Z",
    database: {
      status: "ok",
      dialect: "postgresql",
      databaseUrl: "postgresql://***:***@rds.amazonaws.com:5432/aigentra",
      appEnv: "test",
      remoteDatabaseBlockedInLocal: false,
      tableCount: 26,
    },
    totals: {
      subscribers: 1,
      activeSubscriptions: 1,
      telegramLinked: 0,
      reviewUnlocks: 0,
      tradeEvents24h: 2,
      apiErrors24h: 0,
    },
    paper: {
      openOrders: 1,
      openPositions: 1,
      closedPositions: 2,
      openOrderNotional: 1000,
      openPositionNotional: 2500,
      openNotional: 3500,
      openMargin: 700,
      unrealizedPnl: 12.3,
    },
    recentEvents: [],
    recentSubscribers: [
      {
        id: 1,
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        userId: "google-admin",
        email: ADMIN_EMAIL,
        subscriptionStatus: "active",
        telegramEnabled: false,
        locale: "ko",
      },
    ],
    slowApiCalls: [],
    tables: ["subscriber_preferences", "paper_orders", "api_call_logs"],
  };
}

function adminTablePayload() {
  return {
    table: "subscriber_preferences",
    columns: ["id", "email", "subscription_status"],
    total: 1,
    limit: 5,
    offset: 0,
    rows: [{ id: 1, email: ADMIN_EMAIL, subscription_status: "active" }],
  };
}
