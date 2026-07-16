import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const appRoot = new URL("../", import.meta.url);
const source = (path) => readFileSync(new URL(path, appRoot), "utf8");

test("landing exposes a three-part focus rail before product proof", () => {
  const homeSource = source("components/home-page-client.tsx");
  const marketingSource = source("lib/marketing-copy.ts");

  assert.match(homeSource, /data-testid="landing-focus-rail"/);
  assert.match(homeSource, /copy\.focusPoints\.map/);
  assert.match(
    homeSource,
    /data-testid="landing-focus-rail"[\s\S]*data-testid="landing-product-proof"/,
    "the core product promise should be understood before the large product preview"
  );
  assert.match(marketingSource, /readonly focusPoints:/);
  assert.match(marketingSource, /readonly heroTrustLine:/);
});

test("landing locale is available to server rendering and persisted for later requests", () => {
  const providerSource = source("components/app-provider.tsx");
  const layoutSource = source("app/layout.tsx");
  const middlewareSource = source("middleware.ts");
  const serverLocaleSource = source("lib/server-locale.ts");

  assert.match(providerSource, /readonly initialLocale: Locale/);
  assert.match(providerSource, /document\.cookie/);
  assert.match(layoutSource, /await headers\(\)/);
  assert.match(layoutSource, /<AppProvider initialLocale=\{initialLocale\}>/);
  assert.match(middlewareSource, /REQUEST_LOCALE_HEADER/);
  assert.match(serverLocaleSource, /x-aigentra-locale/);
  assert.match(middlewareSource, /resolveRequestLocale/);
});

test("localized landing routes publish canonical and language alternate metadata", () => {
  const localizedPagePath = new URL("app/[locale]/page.tsx", appRoot);
  assert.equal(existsSync(localizedPagePath), true);

  const localizedPageSource = readFileSync(localizedPagePath, "utf8");
  const seoSource = source("lib/seo.ts");
  const sitemapSource = source("app/sitemap.ts");

  assert.match(localizedPageSource, /generateStaticParams/);
  assert.match(localizedPageSource, /metadataForHomeLocale/);
  assert.match(seoSource, /export function metadataForHomeLocale/);
  assert.match(seoSource, /languages:/);
  assert.match(sitemapSource, /localizedHomeRoutes/);
});

test("localized landing routes use the landing header without duplicate app chrome", () => {
  const appShellSource = source("components/app-shell.tsx");

  assert.match(appShellSource, /isLocalizedHomeLocale\(pathname\.slice\(1\)\)/);
});

test("Korean landing headings keep words and grammatical units intact", () => {
  const globalStylesSource = source("app/globals.css");

  assert.match(globalStylesSource, /html\[lang="ko"\] \.landing-page :is\(h1, h2, h3\)/);
  assert.match(globalStylesSource, /word-break: keep-all/);
});
