import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const billingApiSource = readFileSync(new URL("../lib/billing-api.ts", import.meta.url), "utf8");
const billingRouteSource = readFileSync(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
const billingPanelSource = readFileSync(new URL("../components/whop-billing-panel.tsx", import.meta.url), "utf8");
const accountSource = readFileSync(new URL("../components/subscriber-account-client.tsx", import.meta.url), "utf8");

test("account UI exposes Whop checkout without leaking Whop secrets", () => {
  assert.match(accountSource, /WhopBillingPanel/, "account page should render the Whop billing panel");
  assert.match(billingPanelSource, /\/api\/billing\/checkout/, "browser should call the authenticated Next route");
  assert.match(billingPanelSource, /window\.location\.assign/, "successful checkout should leave for the hosted Whop URL");
  assert.match(billingPanelSource, /data-testid="whop-billing-panel"/, "billing panel should have a stable UI test target");
  assert.doesNotMatch(billingPanelSource, /WHOP_API_KEY|WHOP_WEBHOOK_SECRET|WHOP_COMPANY_ID/, "browser component must not reference server Whop secrets");
});

test("checkout route requires Auth.js and proxies only through backend subscriber token", () => {
  assert.match(billingRouteSource, /auth\(\)/, "checkout route should be protected by the signed-in session");
  assert.match(billingRouteSource, /createWhopCheckout/, "checkout route should proxy through the server billing API helper");
  assert.doesNotMatch(billingRouteSource, /WHOP_API_KEY|WHOP_WEBHOOK_SECRET/, "Next route should not call Whop directly");
  assert.match(billingApiSource, /\/api\/billing\/whop\/checkout/, "server helper should call the backend billing endpoint");
  assert.match(billingApiSource, /X-Subscriber-Api-Token/, "server helper should authenticate to the backend with the internal token");
  assert.doesNotMatch(billingApiSource, /process\.env\.WHOP_API_KEY|process\.env\.WHOP_WEBHOOK_SECRET/, "Whop secrets should live only in the backend API app");
});
