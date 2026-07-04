import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("admin dashboard is a protected App Router surface", () => {
  assert.ok(existsSync(new URL("../app/admin/page.tsx", import.meta.url)), "admin page should exist");
  assert.ok(existsSync(new URL("../components/admin-dashboard-client.tsx", import.meta.url)), "admin page should render a client dashboard shell");
  assert.ok(existsSync(new URL("../lib/admin-auth.ts", import.meta.url)), "admin auth helper should centralize allowlist checks");

  const pageSource = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const authSource = readFileSync(new URL("../lib/admin-auth.ts", import.meta.url), "utf8");

  assert.match(pageSource, /export const dynamic = "force-dynamic"/, "admin page must never be statically prerendered");
  assert.match(pageSource, /requireAdminIdentity\(\)/, "admin page should require a signed-in admin identity");
  assert.match(pageSource, /loadAdminOverview\(\)/, "admin page should load the backend overview before rendering");
  assert.match(authSource, /ADMIN_EMAILS/, "admin allowlist must be controlled by server env");
  assert.match(authSource, /auth\(\)/, "admin allowlist should be scoped to the Auth.js session");
  assert.doesNotMatch(authSource, /NEXT_PUBLIC_ADMIN/, "admin allowlist must not be exposed to the browser");
});

test("admin API proxy is session-protected and uses only the backend admin token", () => {
  assert.ok(existsSync(new URL("../app/api/admin/overview/route.ts", import.meta.url)), "overview proxy route should exist");
  assert.ok(existsSync(new URL("../app/api/admin/table/route.ts", import.meta.url)), "table proxy route should exist");
  assert.ok(existsSync(new URL("../lib/admin-api.ts", import.meta.url)), "admin API helper should parse backend responses");

  const overviewRouteSource = readFileSync(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8");
  const tableRouteSource = readFileSync(new URL("../app/api/admin/table/route.ts", import.meta.url), "utf8");
  const apiSource = readFileSync(new URL("../lib/admin-api.ts", import.meta.url), "utf8");

  assert.match(overviewRouteSource, /requireAdminIdentity\(\)/, "overview route should reject non-admin sessions");
  assert.match(tableRouteSource, /requireAdminIdentity\(\)/, "table route should reject non-admin sessions");
  assert.match(apiSource, /\/api\/admin\/overview/, "helper should call the backend overview endpoint");
  assert.match(apiSource, /\/api\/admin\/table/, "helper should call the backend table browser endpoint");
  assert.match(apiSource, /X-Admin-Api-Token/, "helper should authenticate to backend with admin token");
  assert.doesNotMatch(apiSource, /SUBSCRIBER_API_TOKEN|WHOP_API_KEY|DATABASE_URL/, "admin proxy must not reuse unrelated secrets");
});

test("admin UI exposes operations-focused sections without raw SQL execution", () => {
  const dashboardSource = readFileSync(new URL("../components/admin-dashboard-client.tsx", import.meta.url), "utf8");

  for (const label of ["DB Overview", "Subscribers", "Paper Trading", "API Incidents", "Table Browser"]) {
    assert.match(dashboardSource, new RegExp(label), `admin dashboard should render ${label}`);
  }
  assert.match(dashboardSource, /data-testid="admin-dashboard"/, "admin dashboard needs a stable QA target");
  assert.match(dashboardSource, /fetchAdminTable/, "table browser should fetch whitelisted tables");
  assert.doesNotMatch(dashboardSource, /textarea|raw sql|executeSql|DROP TABLE/i, "MVP should not expose raw SQL execution");
});

test("admin shell does not trigger subscriber hydration requests", () => {
  const appShellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
  const appProviderSource = readFileSync(new URL("../components/app-provider.tsx", import.meta.url), "utf8");
  const accessHookSource = readFileSync(new URL("../components/use-subscriber-access.ts", import.meta.url), "utf8");

  assert.match(appShellSource, /pathname\.startsWith\("\/admin"\)/, "app shell should detect the admin surface");
  assert.match(
    appShellSource,
    /useSubscriberAccess\(\{\s*enabled:\s*!isAdminPage\s*\}\)/,
    "admin shell should not start the subscriber access query"
  );
  assert.match(appProviderSource, /pathname\.startsWith\("\/admin"\)/, "locale hydrator should detect the admin surface");
  assert.match(appProviderSource, /if \(pathname\.startsWith\("\/admin"\)\) return;/, "admin page should skip subscriber preferences hydration");
  assert.match(accessHookSource, /options:\s*\{\s*enabled\?:\s*boolean\s*\}/, "subscriber access hook should expose a narrow enabled gate");
});
