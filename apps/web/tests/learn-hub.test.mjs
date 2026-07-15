import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("knowledge hub publishes a focused first collection", () => {
  const learn = read("lib/learn.ts");
  const locales = read("lib/learn-locales.ts");
  const requiredSlugs = [
    "funding-rate",
    "open-interest",
    "liquidation",
    "position-sizing",
    "maximum-drawdown",
    "backtest-overfitting",
  ];

  for (const slug of requiredSlugs) {
    assert.match(learn, new RegExp(`slug: "${slug}"`));
    assert.match(locales, new RegExp(`(?:"${slug}"|${slug}):`), `${slug} needs localized article copy`);
  }
  assert.match(locales, /formula:/);
  assert.match(locales, /workedExample:/);
  assert.match(locales, /misconception:/);
  assert.match(locales, /riskNote:/);
});

test("every knowledge article and interface label is localized in all supported languages", () => {
  const locales = read("lib/learn-locales.ts");
  const index = read("components/learn/learn-index-client.tsx");
  const article = read("components/learn/learn-entry-client.tsx");
  const card = read("components/learn/learn-card.tsx");

  for (const locale of ['en', 'ko', 'ru', '"pt-BR"', 'tr']) {
    assert.match(locales, new RegExp(`\\n  ${locale}:`), `${locale} needs a complete knowledge dictionary`);
  }
  assert.match(locales, /satisfies LearnLocaleDictionary/, "locale completeness should be checked by TypeScript");
  assert.match(index, /learnEntries\(locale\)/, "the index should resolve entries from the active locale");
  assert.match(article, /learnEntryBySlug\(slug, locale\)/, "article copy should resolve from the active locale");
  assert.match(article, /learnUiCopy\[locale\]/, "article chrome should use localized keys");
  assert.doesNotMatch(card, /koreanTerm/, "cards should not depend on a Korean-only title field");
  assert.doesNotMatch(article, />정의</, "article section labels should not be hard-coded in Korean");
});

test("knowledge hub owns index, detail, home preview, and SEO discovery", () => {
  assert.equal(existsSync(new URL("app/learn/page.tsx", root)), true);
  assert.equal(existsSync(new URL("app/learn/[slug]/page.tsx", root)), true);
  assert.equal(existsSync(new URL("components/learn/learn-preview-section.tsx", root)), true);

  const home = read("components/home-page-client.tsx");
  const sitemap = read("app/sitemap.ts");
  const seo = read("lib/seo.ts");
  const shell = read("components/app-shell.tsx");

  assert.match(home, /<LearnPreviewSection \/>/);
  assert.match(home, /<BlogPreviewSection \/>[\s\S]*<LearnPreviewSection \/>/);
  assert.match(sitemap, /learnSlugs/);
  assert.match(seo, /path: "\/learn"/);
  assert.match(seo, /metadataForLearnEntry/);
  assert.match(shell, /pathname === "\/learn" \|\| pathname\.startsWith\("\/learn\/"\)/);
});

test("knowledge pages expose semantic hierarchy and DefinedTerm data", () => {
  const detail = read("components/learn/learn-entry-client.tsx");
  assert.match(detail, /DefinedTerm/);
  assert.match(detail, /BreadcrumbList/);
  assert.match(detail, /application\/ld\+json/);
  assert.match(detail, /relatedBlogSlugs/);
  assert.match(detail, /<EditorialActionPanel/, "every concept article should end with the same take-action card as blog articles");
});

test("blog and knowledge surfaces expose a small home link", () => {
  const blogIndex = read("components/blog/blog-index-client.tsx");
  const blogArticle = read("components/blog/blog-article-client.tsx");
  const learnIndex = read("components/learn/learn-index-client.tsx");
  const learnArticle = read("components/learn/learn-entry-client.tsx");

  for (const source of [blogIndex, blogArticle, learnIndex, learnArticle]) {
    assert.match(source, /<EditorialHomeLink \/>/);
  }
});

test("footer brand links back to the home page", () => {
  const footer = read("components/home-landing-visuals.tsx");
  assert.match(footer, /<Link href="\/" className="focus-ring footer-brand-link"/);
});
