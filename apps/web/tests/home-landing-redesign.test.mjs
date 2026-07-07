import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const homeSource = readFileSync(new URL("../components/home-page-client.tsx", import.meta.url), "utf8");
const visualSource = readFileSync(new URL("../components/home-landing-visuals.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const marketingSource = readFileSync(new URL("../lib/marketing-copy.ts", import.meta.url), "utf8");
const appProviderSource = readFileSync(new URL("../components/app-provider.tsx", import.meta.url), "utf8");

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
  assert.match(homeSource, /id="pricing"/, "landing pricing should be addressable from subscription CTAs");
  assert.match(homeSource, /scroll-mt-20/, "pricing anchor should land below the viewport chrome instead of hiding the section title");
  assert.match(homeSource, /data-testid="landing-faq"/, "landing should include the split FAQ area from the reference");
  assert.match(homeSource, /data-testid="landing-about"/, "landing should include the black about band before footer");
  assert.match(homeSource, /data-testid="landing-footer"/, "landing should end with a simple footer");
});

test("marketing copy includes subscription and reference-aligned content for all supported landing locales", () => {
  assert.match(marketingSource, /pricingPlans/, "copy should define pricing plans for the BullGPT-style pricing band");
  assert.match(marketingSource, /testimonials/, "copy should define testimonials for the white social-proof section");
  assert.match(marketingSource, /Telegram/, "copy should keep the service-specific Telegram subscription workflow visible");
  assert.match(marketingSource, /구독/, "Korean copy should describe subscribing to selected AI traders");
  assert.match(marketingSource, /ru:/, "landing copy should include Russian content for supported locale detection");
  assert.match(marketingSource, /"pt-BR":/, "landing copy should include Brazilian Portuguese content for supported locale detection");
  assert.match(marketingSource, /tr:/, "landing copy should include Turkish content for supported locale detection");
  assert.match(marketingSource, /Record<Locale, LandingCopy>/, "landing copy should be complete for every supported locale");
});

test("pricing plan calls to action route to real product surfaces", () => {
  assert.match(visualSource, /import Link from "next\/link"/, "pricing cards should use Next links, not inert buttons");
  assert.match(visualSource, /LandingCheckoutButton/, "paid pricing CTAs should start checkout directly from the landing page");
  assert.match(visualSource, /href="\/leaderboard"/, "free pricing CTA should still route to leaderboard");
  assert.doesNotMatch(visualSource, /href=\{isFree \? "\/leaderboard" : "\/account"\}/, "paid CTA should not detour through account settings");
});

test("landing language selector opens a menu and first visit locale can be inferred", () => {
  assert.match(homeSource, /LOCALE_OPTIONS\.map/, "landing language control should open a locale menu instead of cycling immediately");
  assert.match(homeSource, /aria-expanded=\{isLanguageMenuOpen\}/, "language menu should expose expanded state");
  assert.match(homeSource, /role="menuitemradio"/, "language choices should be exposed as selectable menu items");
  assert.doesNotMatch(homeSource, /nextLocale|SUPPORTED_LOCALES/, "landing language click should not rotate through locales");
  assert.match(appProviderSource, /detectBrowserLocale/, "first visit locale should be inferred before falling back");
  assert.match(appProviderSource, /COUNTRY_LOCALE_MAP/, "locale detection should include country-to-locale mapping");
  assert.match(appProviderSource, /return "en"/, "unsupported regions should fall back to English");
});

test("AI agent monitoring preview reflects current product language", () => {
  assert.match(visualSource, /AI Agent/, "decision pipeline badge should not name a specific provider model");
  assert.doesNotMatch(visualSource, /Gemini-3\.5/, "landing should not expose Gemini branding in the pipeline");
  assert.match(visualSource, /20 AI Strategists/, "consensus preview should reflect the 20-trader sentiment system");
  assert.match(visualSource, />ROI</, "position monitor should label the metric as ROI");
  assert.doesNotMatch(visualSource, /ROI PnL/, "position monitor should not use the old ROI PnL label");
  assert.match(visualSource, /TARGET ROI/, "scenario plan should describe target as ROI");
  assert.match(visualSource, /candles\.map/, "scenario plan preview should render candle-like marks, not only a line chart");
  assert.doesNotMatch(marketingSource, /LLM agents|LLM 에이전트/, "landing monitoring copy should describe AI agents without provider or model-class jargon");
});

test("pricing, Telegram preview, and FAQ match the simplified Pro offer", () => {
  assert.match(marketingSource, /name: "Aigentra Pro"/, "pricing should expose the single Pro plan");
  assert.doesNotMatch(marketingSource, /\$49|Elite Operator|Tactician|Observer/, "old extra pricing tiers should be removed from landing copy");
  assert.match(marketingSource, /Questions users actually ask|유저가 실제로 궁금해할 질문/, "FAQ should be rewritten around buyer questions");
  assert.match(visualSource, /Aigentra Trading Bot/, "Telegram preview should resemble the actual bot message surface");
  assert.match(visualSource, /\[AI Trader League\] 트레이더 피드/, "Telegram preview should echo the production message format");
  assert.match(visualSource, /ROI/, "Telegram preview should show a useful trading summary, not only prose");
  assert.match(homeSource, /max-w-\[1500px\]/, "Telegram section should use the wider landing panel requested by the user");
  assert.match(marketingSource, /자동매매 버튼이 아니라|not an auto-trading button/, "Telegram section should explain that Aigentra is a monitoring surface, not an execution bot");
});
