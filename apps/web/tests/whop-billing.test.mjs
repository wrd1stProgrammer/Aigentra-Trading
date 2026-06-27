import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const billingApiSource = readFileSync(new URL("../lib/billing-api.ts", import.meta.url), "utf8");
const billingRouteSource = readFileSync(new URL("../app/api/billing/checkout/route.ts", import.meta.url), "utf8");
const billingStatusRouteSource = readFileSync(new URL("../app/api/billing/status/route.ts", import.meta.url), "utf8");
const billingPanelSource = readFileSync(new URL("../components/whop-billing-panel.tsx", import.meta.url), "utf8");
const landingCheckoutButtonSource = readFileSync(new URL("../components/landing-checkout-button.tsx", import.meta.url), "utf8");
const accountSource = readFileSync(new URL("../components/subscriber-account-client.tsx", import.meta.url), "utf8");

test("account UI exposes Whop subscription status without starting checkout", () => {
  assert.match(accountSource, /WhopBillingPanel/, "account page should render the Whop billing panel");
  assert.match(billingPanelSource, /\/api\/billing\/status/, "account panel should read the signed-in user's billing status");
  assert.doesNotMatch(billingPanelSource, /\/api\/billing\/checkout/, "account panel should not create checkout sessions");
  assert.doesNotMatch(billingPanelSource, /window\.location\.assign/, "account panel should not send users to hosted checkout");
  assert.match(billingPanelSource, /data-testid="whop-billing-panel"/, "billing panel should have a stable UI test target");
  assert.doesNotMatch(billingPanelSource, /WHOP_API_KEY|WHOP_WEBHOOK_SECRET|WHOP_COMPANY_ID/, "browser component must not reference server Whop secrets");
});

test("checkout route requires Auth.js and proxies only through backend subscriber token", () => {
  assert.match(billingRouteSource, /auth\(\)/, "checkout route should be protected by the signed-in session");
  assert.match(billingRouteSource, /createWhopCheckout/, "checkout route should proxy through the server billing API helper");
  assert.match(billingRouteSource, /\/leaderboard\?billing=whop-success/, "successful hosted checkout should return users to the leaderboard");
  assert.doesNotMatch(billingRouteSource, /WHOP_API_KEY|WHOP_WEBHOOK_SECRET/, "Next route should not call Whop directly");
  assert.match(billingApiSource, /\/api\/billing\/whop\/checkout/, "server helper should call the backend billing endpoint");
  assert.match(billingApiSource, /X-Subscriber-Api-Token/, "server helper should authenticate to the backend with the internal token");
  assert.doesNotMatch(billingApiSource, /process\.env\.WHOP_API_KEY|process\.env\.WHOP_WEBHOOK_SECRET/, "Whop secrets should live only in the backend API app");
});

test("billing status route is session-protected and proxied through the backend", () => {
  assert.match(billingStatusRouteSource, /auth\(\)/, "billing status should be scoped to the signed-in account");
  assert.match(billingStatusRouteSource, /readWhopSubscriptionStatus/, "status route should use the backend billing helper");
  assert.match(billingApiSource, /\/api\/billing\/whop\/status/, "server helper should call the backend status endpoint");
});

test("landing pricing paid CTA starts hosted checkout directly", () => {
  assert.match(landingCheckoutButtonSource, /\/api\/billing\/checkout/, "landing paid CTA should create a checkout session");
  assert.match(landingCheckoutButtonSource, /planKey/, "landing checkout should send the selected Whop plan key");
  assert.match(landingCheckoutButtonSource, /window\.location\.assign\(purchaseUrl\)/, "landing CTA should leave for Whop checkout");
  assert.match(landingCheckoutButtonSource, /readCheckoutError/, "landing CTA should show the server-provided checkout failure reason");
  assert.doesNotMatch(landingCheckoutButtonSource, /\/account/, "landing paid CTA should not route through account settings");
});
