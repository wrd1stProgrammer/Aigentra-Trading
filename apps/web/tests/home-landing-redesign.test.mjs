import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const homeSource = readFileSync(new URL("../components/home-page-client.tsx", import.meta.url), "utf8");
const visualSource = readFileSync(new URL("../components/home-landing-visuals.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const marketingSource = readFileSync(new URL("../lib/marketing-copy.ts", import.meta.url), "utf8");

test("home page is a first-visit landing page instead of the operations dashboard", () => {
  assert.match(homeSource, /data-testid="landing-hero"/, "landing hero needs a stable QA target");
  assert.match(homeSource, /data-testid="landing-product-proof"/, "landing should show product proof, not only copy");
  assert.match(homeSource, /data-testid="landing-telegram-alerts"/, "landing should sell the alert workflow requested by the user");
  assert.doesNotMatch(homeSource, /leaderboardBundleQueryOptions|useQuery\(/, "root landing should not be the old live command-center dashboard");
});

test("essential routes remain available after removing dashboard", () => {
  assert.match(shellSource, /href: "\/login"/, "top nav should expose login");
  assert.match(shellSource, /href: "\/account"/, "top nav should expose subscriber settings");
});


test("home page follows the BullGPT-style section contract requested by the user", () => {
  assert.match(homeSource, /data-testid="landing-video-placeholder"/, "hero should lead into a framed video placeholder");
  assert.match(homeSource, /data-testid="landing-agent-system"/, "landing should explain the monitored AI-agent workflow");
  assert.match(homeSource, /data-testid="landing-get-started"/, "landing needs the white get-started section from the reference");
  assert.match(homeSource, /data-testid="landing-second-video"/, "get-started section should reserve the second video area");
  assert.match(homeSource, /data-testid="landing-pricing"/, "landing needs the dark pricing band from the reference");
  assert.match(homeSource, /data-testid="landing-faq"/, "landing should include the split FAQ area from the reference");
  assert.match(homeSource, /data-testid="landing-about"/, "landing should include the black about band before footer");
  assert.match(homeSource, /data-testid="landing-footer"/, "landing should end with a simple footer");
});

test("marketing copy includes subscription and reference-aligned content for both locales", () => {
  assert.match(marketingSource, /pricingPlans/, "copy should define pricing plans for the BullGPT-style pricing band");
  assert.match(marketingSource, /testimonials/, "copy should define testimonials for the white social-proof section");
  assert.match(marketingSource, /Telegram/, "copy should keep the service-specific Telegram subscription workflow visible");
  assert.match(marketingSource, /구독/, "Korean copy should describe subscribing to selected AI traders");
});

test("pricing plan calls to action route to real product surfaces", () => {
  assert.match(visualSource, /import Link from "next\/link"/, "pricing cards should use Next links, not inert buttons");
  assert.ok(visualSource.includes('href={isFree ? "/leaderboard" : "/account"}'), "free pricing CTA should route to leaderboard and paid CTAs should route to account checkout");
  assert.ok(!visualSource.includes("<button className={`mt-9 w-full"), "pricing CTAs should not be inert buttons");
});
