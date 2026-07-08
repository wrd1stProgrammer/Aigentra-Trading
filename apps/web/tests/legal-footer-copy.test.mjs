import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const footerSource = readFileSync(new URL("../components/home-landing-visuals.tsx", import.meta.url), "utf8");
const marketingSource = readFileSync(new URL("../lib/marketing-copy.ts", import.meta.url), "utf8");
const riskSource = readFileSync(new URL("../app/risk-disclosure/page.tsx", import.meta.url), "utf8");
const privacySource = readFileSync(new URL("../app/privacy-policy/page.tsx", import.meta.url), "utf8");
const landingFooterSource = footerSource.slice(
  footerSource.indexOf("export function LandingFooter"),
  footerSource.indexOf("function MiniChart")
);

test("landing footer uses localized readable risk disclosure instead of hardcoded tiny English copy", () => {
  assert.match(marketingSource, /footerRiskNotice/, "landing copy should expose a localized full risk notice");
  assert.match(landingFooterSource, /copy\.footerRiskNotice/, "footer should render the localized full risk notice");
  assert.doesNotMatch(landingFooterSource, /AI-powered chart analysis tool for educational purposes only/, "footer should not hardcode the English long disclaimer");
  assert.doesNotMatch(landingFooterSource, /text-\[9px\]/, "footer legal copy should stay legible");
});

test("marketing copy avoids testimonial-shaped fake endorsement risk", () => {
  assert.doesNotMatch(marketingSource, /Min Park|J\. Kim/, "marketing notes should not look like named user endorsements unless verified");
  assert.doesNotMatch(footerSource, />Testimonials</, "footer navigation should not advertise testimonials before verified endorsement controls exist");
  assert.match(marketingSource, /operator/i, "replacement copy should frame the section as product operator notes");
});

test("risk disclosure matches the crypto futures simulation product scope", () => {
  assert.doesNotMatch(riskSource, /Forex|Commodities|외환|원자재/, "risk disclosure should not foreground unsupported asset classes");
  assert.match(riskSource, /perpetual|futures|선물|무기한/i, "risk disclosure should explicitly cover crypto futures/perpetual simulation risk");
  assert.doesNotMatch(riskSource, /⚠️/, "risk warnings should use icon components instead of emoji glyphs");
});

test("risk disclosure warning callouts keep icon, title, and body separated", () => {
  assert.match(riskSource, /sm:grid-cols-\[32px_minmax\(0,1fr\)\]/, "warning callouts should reserve a distinct icon column on wider screens");
  assert.match(riskSource, /<div className="min-w-0">/, "warning title and body should sit in a separate text column");
  assert.match(riskSource, /<p className="mt-2 text-xs font-semibold leading-relaxed">/, "warning body should have vertical spacing below the title");
});

test("privacy policy names the account, payment, alert, and analytics processors users actually touch", () => {
  for (const required of ["Google", "Telegram", "Whop", "Meta", "Google Analytics"]) {
    assert.match(privacySource, new RegExp(required), `privacy policy should mention ${required}`);
  }
  assert.match(privacySource, /chat id|Chat ID|채팅 ID|chatId/i, "Telegram connection data should be described");
  assert.match(privacySource, /OAuth|Google 로그인|Google sign-in/i, "Google sign-in data should be described");
});
