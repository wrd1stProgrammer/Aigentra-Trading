import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const homeSource = readFileSync(new URL("../components/home-page-client.tsx", import.meta.url), "utf8");
const blogPreviewSource = readFileSync(new URL("../components/blog/blog-preview-section.tsx", import.meta.url), "utf8");
const learnPreviewSource = readFileSync(new URL("../components/learn/learn-preview-section.tsx", import.meta.url), "utf8");
const learnCardSource = readFileSync(new URL("../components/learn/learn-card.tsx", import.meta.url), "utf8");
const blogCardSource = readFileSync(new URL("../components/blog/blog-card.tsx", import.meta.url), "utf8");
const blogArticleSource = readFileSync(new URL("../components/blog/blog-article-client.tsx", import.meta.url), "utf8");
const blogArticleUiSource = readFileSync(new URL("../lib/blog/article-ui.ts", import.meta.url), "utf8");
const globalStylesSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const visualSource = readFileSync(new URL("../components/home-landing-visuals.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const marketingSource = readFileSync(new URL("../lib/marketing-copy.ts", import.meta.url), "utf8");
const appProviderSource = readFileSync(new URL("../components/app-provider.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

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
  assert.match(homeSource, /<BlogPreviewSection \/>/, "landing should mount the blog preview section before footer");
  assert.match(homeSource, /<LearnPreviewSection \/>/, "landing should mount the knowledge hub below the blog preview");
  assert.match(learnPreviewSource, /data-testid="landing-learn"/, "knowledge preview should expose a stable QA target");
  assert.match(blogPreviewSource, /data-testid="landing-blog"/, "blog preview should expose a stable QA target");
  assert.doesNotMatch(blogCardSource, /BlogThumbnail|<img/, "blog cards should use the requested image-free editorial design");
  assert.match(blogCardSource, /blog-editorial-card/, "blog surfaces should reuse the editorial card primitive");
  assert.match(globalStylesSource, /--blog-card-min-height: 22\.5rem/, "image-free cards should keep a tokenized stable desktop rhythm");
  assert.match(homeSource, /data-testid="landing-footer"/, "landing should end with a simple footer");
  assert.match(
    homeSource,
    /data-testid="landing-about"[\s\S]*<BlogPreviewSection \/>[\s\S]*<LearnPreviewSection \/>[\s\S]*data-testid="landing-footer"/,
    "blog and knowledge previews should sit between the about band and footer"
  );
});

test("blog article copy-link action has a browser fallback", () => {
  assert.match(`${blogArticleSource}\n${blogArticleUiSource}`, /document\.execCommand\("copy"\)/, "copy link should still work when Clipboard API rejects local browser writes");
  assert.match(blogArticleSource, /manualCopyHint/, "blocked clipboard environments should expose a selectable manual-copy fallback");
  assert.match(blogArticleSource, /blog-list--unordered/, "article takeaways should use the shared bullet-list primitive");
  assert.match(blogArticleSource, /blog-list--ordered/, "article workflows should use the shared numbered-list primitive");
  assert.match(globalStylesSource, /word-break: keep-all/, "localized editorial primitives should preserve Korean words and endings");
  assert.match(globalStylesSource, /\.blog-list--unordered[\s\S]*list-style-type: disc/, "the bullet-list primitive should restore visible markers after Tailwind reset");
});

test("landing representative copy avoids forced Korean line breaks and removes view-less copy", () => {
  assert.match(homeSource, /<h1 className="max-w-4xl text-balance/, "hero headline should keep balanced wrapping");
  assert.doesNotMatch(homeSource, /<h1 className="[^"]*break-keep/, "hero headline should not force phrase-level breaks");
  assert.doesNotMatch(homeSource, /View less/, "expanded about section should not show a View less control");
  assert.match(homeSource, /setIsAboutExpanded\(true\)/, "about section should still expose a one-way View more expansion");
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
  assert.match(marketingSource, /blog: "블로그"/, "footer copy should localize the blog hub link");
});

test("home knowledge cards localize every visible concept field for all supported locales", () => {
  assert.match(learnPreviewSource, /<LearnCard[^>]*locale=\{locale\}/, "home concept cards should receive the active locale");
  assert.match(learnCardSource, /learnUiCopy\[locale\]/, "concept cards should resolve their labels through the complete knowledge dictionary");
  assert.match(learnCardSource, /entry\.localizedTerm/, "concept cards should render the active locale's term title");
  assert.doesNotMatch(learnCardSource, /정의와 계산 예시/, "concept card actions should not be hard-coded in Korean");

  const requiredKeys = [
    "learn.card.category.derivatives",
    "learn.card.label",
    "learn.card.action",
    "learn.card.funding-rate.title",
    "learn.card.funding-rate.summary",
    "learn.card.open-interest.title",
    "learn.card.open-interest.summary",
    "learn.card.liquidation.title",
    "learn.card.liquidation.summary",
  ];

  for (const key of requiredKeys) {
    assert.equal(i18nSource.match(new RegExp(`"${key}"`, "g"))?.length, 5, `${key} should exist in all five locale dictionaries`);
  }
});

test("pricing plan calls to action route to real product surfaces", () => {
  assert.match(visualSource, /import Link from "next\/link"/, "pricing cards should use Next links, not inert buttons");
  assert.match(visualSource, /LandingCheckoutButton/, "paid pricing CTAs should start checkout directly from the landing page");
  assert.match(visualSource, /href="\/leaderboard"/, "free pricing CTA should still route to leaderboard");
  assert.doesNotMatch(visualSource, /href=\{isFree \? "\/leaderboard" : "\/account"\}/, "paid CTA should not detour through account settings");
});

test("landing profile menu owns language selection and first visit locale can be inferred", () => {
  assert.match(homeSource, /isProfileMenuOpen/, "landing should open locale choices from the profile menu");
  assert.match(homeSource, /aria-expanded=\{isProfileMenuOpen\}/, "profile menu should expose expanded state");
  assert.match(homeSource, /LOCALE_OPTIONS\.map/, "landing profile menu should list supported locales instead of cycling immediately");
  assert.match(homeSource, /role="radiogroup"/, "language choices should be grouped as selectable radio options");
  assert.match(homeSource, /role="radio"/, "each language choice should expose selected state");
  assert.doesNotMatch(homeSource, /setIsLanguageMenuOpen/, "landing should not keep a separate top-level language menu");
  assert.doesNotMatch(homeSource, /nextLocale|SUPPORTED_LOCALES/, "landing language click should not rotate through locales");
  assert.match(appProviderSource, /detectBrowserLocale/, "first visit locale should be inferred before falling back");
  assert.match(appProviderSource, /COUNTRY_LOCALE_MAP/, "locale detection should include country-to-locale mapping");
  assert.match(appProviderSource, /return "en"/, "unsupported regions should fall back to English");
});

test("AI agent monitoring preview reflects current product language", () => {
  assert.match(marketingSource, /AI Agent|AI 에이전트/, "decision pipeline badge should not name a specific provider model");
  assert.doesNotMatch(visualSource, /Gemini-3\.5/, "landing should not expose Gemini branding in the pipeline");
  assert.match(marketingSource, /20 AI Strategists|AI 전략가 20명/, "consensus preview should reflect the 20-trader sentiment system");
  assert.match(visualSource, />ROI</, "position monitor should label the metric as ROI");
  assert.doesNotMatch(visualSource, /ROI PnL/, "position monitor should not use the old ROI PnL label");
  assert.match(marketingSource, /TARGET ROI|목표 ROE/, "scenario plan should describe target as ROI");
  assert.match(visualSource, /candles\.map/, "scenario plan preview should render candle-like marks, not only a line chart");
  assert.doesNotMatch(marketingSource, /LLM agents|LLM 에이전트/, "landing monitoring copy should describe AI agents without provider or model-class jargon");
  assert.match(visualSource, /LandingCopy\["previews"\]/, "home preview cards should source copy from localized marketing data");
  assert.doesNotMatch(visualSource, /\[AI Trader League\] 트레이더 피드|변동성 확장 구간|단기 매도 거래량 급증/, "preview cards should not hardcode Korean copy in React components");
});

test("the second landing video introduces AI sentiment in every supported locale", () => {
  assert.match(marketingSource, /\[ AI 센티멘트 \]/, "Korean copy should identify the AI sentiment feature");
  assert.match(marketingSource, /\[ AI SENTIMENT \]/, "English copy should identify the AI sentiment feature");
  assert.match(marketingSource, /\[ AI-СЕНТИМЕНТ \]/, "Russian copy should identify the AI sentiment feature");
  assert.match(marketingSource, /\[ SENTIMENTO DE IA \]/, "Portuguese copy should identify the AI sentiment feature");
  assert.match(marketingSource, /\[ AI PİYASA EĞİLİMİ \]/, "Turkish copy should identify the AI sentiment feature");
  assert.match(marketingSource, /20개 AI 전략/, "the Korean headline should explain the 20-strategy consensus");
  assert.match(marketingSource, /20 AI strategies/, "the English headline should explain the 20-strategy consensus");
  assert.match(homeSource, /href="\/consensus"[\s\S]{0,300}\{copy\.getStartedCta\}/, "the sentiment CTA should open the consensus product surface");
  assert.match(homeSource, /\{copy\.headerCta\} →/, "the header CTA should keep its own localized label");
  assert.doesNotMatch(marketingSource, /\[ 간단한 3단계 \]|\[ 3 SIMPLE STEPS \]/, "the old onboarding label should not describe the sentiment video");
});

test("pricing, Telegram preview, and FAQ match the simplified Pro offer", () => {
  assert.match(marketingSource, /name: "Aigentra Pro"/, "pricing should expose the single Pro plan");
  assert.doesNotMatch(marketingSource, /\$49|Elite Operator|Tactician|Observer/, "old extra pricing tiers should be removed from landing copy");
  assert.match(marketingSource, /Questions users actually ask|유저가 실제로 궁금해할 질문/, "FAQ should be rewritten around buyer questions");
  assert.match(marketingSource, /Aigentra Trading Bot/, "Telegram preview should resemble the actual bot message surface");
  assert.match(marketingSource, /\[AI Trader League\] 트레이더 피드|\[AI Trader League\] Trader Feed/, "Telegram preview copy should echo the production message format through i18n");
  assert.match(visualSource, /ROI/, "Telegram preview should show a useful trading summary, not only prose");
  assert.match(homeSource, /max-w-\[1500px\]/, "Telegram section should use the wider landing panel requested by the user");
  assert.match(marketingSource, /자동매매 버튼이 아니라|not an auto-trading button/, "Telegram section should explain that Aigentra is a monitoring surface, not an execution bot");
});
