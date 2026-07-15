import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const appRootPath = fileURLToPath(new URL("../", import.meta.url));
const moduleCache = new Map();
const expectedNewBlogSlugs = [
  "bitcoin-utxo-model", "bitcoin-mining-proof-of-work", "bitcoin-halving-supply-schedule", "bitcoin-difficulty-adjustment", "bitcoin-mempool-fees", "bitcoin-confirmations-reorg-risk", "bitcoin-private-keys-addresses", "bitcoin-full-node-validation", "bitcoin-lightning-network-basics",
  "market-vs-limit-orders", "stop-vs-stop-limit-orders", "bid-ask-spread", "order-book-depth-liquidity", "maker-taker-fees", "slippage-partial-fills", "volume-vs-liquidity",
  "position-sizing-risk-budget", "r-multiple-expectancy", "stop-loss-execution-risk", "drawdown-loss-streak-risk", "margin-vs-risk-budget", "trading-journal-audit", "overtrading-costs",
  "trend-analysis-basics", "support-resistance-zones", "moving-average-lag", "rsi-explained", "macd-explained", "atr-volatility", "bollinger-bands", "multi-timeframe-analysis",
  "futures-vs-perpetuals", "crypto-funding-rates", "leverage-margin-liquidation", "mark-index-last-price", "futures-basis-contango-backwardation", "open-interest-explained",
  "crypto-transfer-network-memo-basics", "crypto-backtest-data-quality", "lookahead-survivorship-bias", "walk-forward-testing", "trading-costs-backtests", "sharpe-ratio-limitations",
  "seed-phrase-security", "hot-wallet-vs-hardware-wallet", "crypto-phishing-fake-support", "address-poisoning-scams", "token-approvals-wallet-permissions", "blockchain-bridge-risks", "stablecoin-proof-of-reserves",
];

function source(relativePath) {
  return readFileSync(join(appRootPath, relativePath), "utf8");
}

function listSourceFiles(rootPath) {
  const entries = readdirSync(rootPath);
  const files = [];
  for (const entry of entries) {
    const entryPath = join(rootPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(entryPath);
  }
  return files;
}

function resolveSourcePath(pathWithoutExtension) {
  const candidates = [
    pathWithoutExtension,
    `${pathWithoutExtension}.ts`,
    `${pathWithoutExtension}.tsx`,
    `${pathWithoutExtension}.js`,
    `${pathWithoutExtension}.jsx`,
    join(pathWithoutExtension, "index.ts"),
    join(pathWithoutExtension, "index.tsx")
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  assert.ok(resolved, `Unable to resolve test module path ${pathWithoutExtension}`);
  return resolved;
}

function stubComponentModule() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "__esModule") return true;
        return function StubComponent() {
          return null;
        };
      }
    }
  );
}

function stubModule(specifier) {
  if (specifier === "next" || specifier.endsWith(".css")) return {};
  if (specifier.startsWith("@phosphor-icons/react")) return stubComponentModule();
  if (specifier === "next/navigation") {
    return {
      notFound() {
        const error = new Error("not-found");
        error.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
        throw error;
      },
      redirect(target) {
        const error = new Error(`redirect:${target}`);
        error.digest = `NEXT_REDIRECT;${target}`;
        throw error;
      }
    };
  }
  if (specifier === "next/font/google") {
    return {
      Geist: () => ({ variable: "--font-geist-sans" }),
      Geist_Mono: () => ({ variable: "--font-geist-mono" })
    };
  }
  if (specifier === "@/auth") {
    return {
      auth: async () => null,
      authSetupComplete: false,
      googleAuthConfigured: false
    };
  }
  if (specifier.startsWith("@/components/")) return stubComponentModule();
  if (specifier === "@/lib/admin-api") {
    return {
      AdminApiError: class AdminApiError extends Error {},
      loadAdminOverview: async () => ({}),
      loadAdminTable: async () => ({ rows: [] })
    };
  }
  if (specifier === "@/lib/admin-auth") {
    return {
      AdminAuthError: class AdminAuthError extends Error {
        status = 401;
      },
      requireAdminIdentity: async () => ({ email: "admin@example.com" })
    };
  }
  if (specifier === "@/lib/subscriber-preference-api") {
    return {
      loadSubscriberPreferences: async () => ({})
    };
  }
  return null;
}

function resolveProjectSpecifier(specifier, parentFile) {
  if (specifier.startsWith("@/")) return resolveSourcePath(join(appRootPath, specifier.slice(2)));
  if (specifier.startsWith(".")) return resolveSourcePath(resolve(dirname(parentFile), specifier));
  return null;
}

function loadProjectModule(modulePath) {
  const resolvedPath = resolveSourcePath(modulePath);
  const cached = moduleCache.get(resolvedPath);
  if (cached) return cached.exports;

  const module = { exports: {} };
  moduleCache.set(resolvedPath, module);
  const output = ts.transpileModule(readFileSync(resolvedPath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: resolvedPath,
    reportDiagnostics: true
  });
  const diagnostics = output.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  assert.deepEqual(
    diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    [],
    `${resolvedPath} should transpile for SEO behavior tests`
  );

  function localRequire(specifier) {
    const stub = stubModule(specifier);
    if (stub) return stub;
    const projectPath = resolveProjectSpecifier(specifier, resolvedPath);
    if (projectPath) return loadProjectModule(projectPath);
    return nativeRequire(specifier);
  }

  const executeModule = new Function("require", "module", "exports", "__filename", "__dirname", output.outputText);
  executeModule(localRequire, module, module.exports, resolvedPath, dirname(resolvedPath));
  return module.exports;
}

function assertNoindex(metadata, label) {
  assert.equal(metadata.robots.index, false, `${label} should be noindex`);
  assert.equal(metadata.robots.follow, false, `${label} should be nofollow`);
  assert.equal(metadata.robots.googleBot.index, false, `${label} should noindex Googlebot`);
}

function assertNoindexCanonical(metadata, canonical, label) {
  assertNoindex(metadata, label);
  assert.equal(metadata.alternates.canonical, canonical, `${label} should own a noindex canonical`);
}

function collectJsonKeysAndTypes(value, result = { keys: new Set(), types: new Set() }) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonKeysAndTypes(item, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    result.keys.add(key);
    if (key === "@type" && typeof child === "string") result.types.add(child);
    collectJsonKeysAndTypes(child, result);
  }
  return result;
}

test("shared SEO helpers emit canonical search and social metadata", () => {
  const seo = loadProjectModule(join(appRootPath, "lib/seo.ts"));

  assert.equal(seo.SITE_URL, "https://aigentratrading.com");
  assert.equal(seo.absoluteUrl("/leaderboard"), "https://aigentratrading.com/leaderboard");

  const home = seo.metadataForPath("/");
  assert.equal(home.alternates.canonical, "/");
  assert.equal(home.openGraph.siteName, "Aigentra Trading");
  assert.equal(home.openGraph.images[0].url, "/og-image.png");
  assert.equal(home.twitter.card, "summary_large_image");
  assert.equal(home.robots.index, true);
  assert.equal(home.robots.googleBot["max-image-preview"], "large");

  const login = seo.createNoindexMetadata("Login", "/login");
  assertNoindexCanonical(login, "/login", "login metadata");

  const blogPost = seo.metadataForBlogPost("ai-trader-league");
  assert.equal(blogPost.alternates.canonical, "/blog/ai-trader-league");
  assert.match(blogPost.title, /AI Trader League/);
});

test("blog content publishes 60 canonical localized article records for supported locales", () => {
  const blog = loadProjectModule(join(appRootPath, "lib/blog-posts.ts"));
  const articles = loadProjectModule(join(appRootPath, "lib/blog-article-content.ts"));
  const locales = ["en", "ko", "ru", "pt-BR", "tr"];

  assert.equal(blog.blogSlugs.length, 60);
  assert.equal(new Set(blog.blogSlugs).size, 60, "canonical blog slugs should be unique");
  for (const locale of locales) {
    const posts = blog.blogPosts(locale);
    assert.equal(posts.length, 60, `${locale} should have 60 blog posts`);
    assert.deepEqual(
      posts.map((post) => post.slug),
      blog.blogSlugs,
      `${locale} should preserve canonical blog slug order`
    );
    assert.ok(
      posts.every((post) => post.title && post.excerpt && post.paragraphs.length >= 6 && post.takeaways.length >= 3),
      `${locale} posts should include article body and takeaways`
    );
    assert.ok(
      posts.every((post) => {
        const content = articles.blogArticleContent(locale, post);
        return content.sections.length >= 4
          && content.sections.every((section) => section.heading && section.paragraphs.length >= 1)
          && content.faq.length >= 3
          && content.riskBody.length > 40;
      }),
      `${locale} posts should render complete long-form sections, FAQ, and risk copy`
    );
    if (locale === "ko") {
      assert.ok(
        posts.every((post) => {
          const content = articles.blogArticleContent(locale, post);
          const renderedCopy = JSON.stringify(content);
          return !/\?[은는이가을를]/.test(renderedCopy);
        }),
        "Korean article templates should not attach particles directly to question-mark titles"
      );
    }
  }
});

test("five core product guides answer their intent with substantial, unique evidence", () => {
  const blog = loadProjectModule(join(appRootPath, "lib/blog-posts.ts"));
  const articles = loadProjectModule(join(appRootPath, "lib/blog-article-content.ts"));
  const slugs = ["ai-trader-league", "ai-trading-leaderboard", "paper-trading-vs-live-trading", "why-simulation-matters", "telegram-trading-alerts"];
  const faqQuestions = new Set();

  for (const slug of slugs) {
    const englishPost = blog.blogPostBySlug("en", slug);
    const englishContent = articles.blogArticleContent("en", englishPost);
    const englishWords = articles.visibleArticleBody(englishPost, englishContent).trim().split(/\s+/).length;
    assert.ok(englishWords >= 700, `${slug} should provide at least 700 words of visible English guidance`);
    assert.ok(englishContent.sections.length >= 5, `${slug} should include a product-specific evidence section`);
    assert.ok(englishContent.faq.length >= 4, `${slug} should answer product-specific reader questions`);
    faqQuestions.add(englishContent.faq[0].question);

    const koreanPost = blog.blogPostBySlug("ko", slug);
    const koreanContent = articles.blogArticleContent("ko", koreanPost);
    assert.ok(articles.visibleArticleBody(koreanPost, koreanContent).length >= 2_400, `${slug} should provide a substantial Korean guide`);
  }

  assert.equal(faqQuestions.size, slugs.length, "core guides should not reuse the same lead FAQ intent");
});

test("new blog articles expose topic-specific SEO content and semantic relations", () => {
  const blog = loadProjectModule(join(appRootPath, "lib/blog-posts.ts"));
  const locales = ["en", "ko", "ru", "pt-BR", "tr"];
  const additions = blog.blogSlugs.slice(10);
  const scripts = {
    ko: /[가-힣]/,
    ru: /[А-Яа-яЁё]/,
    tr: /[çğıöşüÇĞİÖŞÜ]/,
  };
  const seenEnglishParagraphs = new Set();
  const ptBrRiskNotices = new Set();

  assert.equal(additions.length, 50, "exactly 50 canonical articles should be added");
  assert.deepEqual(additions, expectedNewBlogSlugs, "new slugs should match the research-converged topic map exactly");
  for (const locale of locales) {
    for (const slug of additions) {
      const post = blog.blogPostBySlug(locale, slug);
      assert.ok(post, `${locale}/${slug} should resolve`);
      assert.equal(post.paragraphs.length, 6, `${locale}/${slug} should have six topic-specific paragraphs`);
      assert.equal(new Set(post.paragraphs.map((paragraph) => paragraph.trim())).size, 6, `${locale}/${slug} paragraphs should be unique`);
      assert.ok(post.takeaways.length >= 3, `${locale}/${slug} should have practical takeaways`);
      assert.ok(post.riskNotice?.length > 40, `${locale}/${slug} should include a risk notice`);
      assert.ok(post.methodologyDisclosure?.length > 40, `${locale}/${slug} should disclose its methodology`);
      assert.ok(post.sources?.length >= 2, `${locale}/${slug} should expose authoritative sources`);
      assert.ok(post.sources.every((source) => source.title && /^https:\/\//.test(source.url)), `${locale}/${slug} sources should be visible HTTPS references`);
      if (scripts[locale]) {
        assert.ok(scripts[locale].test(`${post.title} ${post.paragraphs.join(" ")}`), `${locale}/${slug} should use its native script`);
      }
      if (locale === "en") {
        for (const paragraph of post.paragraphs) {
          const normalized = paragraph.toLowerCase().replace(/\s+/g, " ").trim();
          assert.equal(seenEnglishParagraphs.has(normalized), false, `${slug} repeats an English paragraph from another article`);
          seenEnglishParagraphs.add(normalized);
        }
      }
      const searchable = `${post.title} ${post.excerpt} ${post.paragraphs.join(" ")} ${post.takeaways.join(" ")}`;
      assert.doesNotMatch(searchable, /guaranteed profit|risk[- ]free return|certain profit|수익 보장|безрисковая прибыль|lucro garantido|garantili kâr/i, `${locale}/${slug} should avoid financial promises`);
      const related = blog.relatedBlogPosts(locale, slug);
      assert.equal(related.length, 3, `${locale}/${slug} should have three semantic related posts`);
      assert.ok(related.every((candidate) => candidate.slug !== slug), `${locale}/${slug} should not relate to itself`);
      if (locale === "pt-BR") {
        ptBrRiskNotices.add(post.riskNotice);
        for (const takeaway of post.takeaways) {
          const normalizedTakeaway = takeaway.toLowerCase().replace(/^[^:]+:\s*/, "").trim();
          assert.ok(
            post.paragraphs.every((paragraph) => !paragraph.toLowerCase().includes(normalizedTakeaway)),
            `${locale}/${slug} takeaways should be independently phrased`,
          );
        }
        assert.ok(
          post.paragraphs.every((paragraph) => paragraph !== post.riskNotice && !paragraph.includes(post.riskNotice) && !post.riskNotice.includes(paragraph)),
          `${locale}/${slug} risk notice should not duplicate a body paragraph`,
        );
      }
    }
  }
  assert.ok(ptBrRiskNotices.size >= 45, "pt-BR articles should have topic-specific risk notices");
});

test("article sources and related links follow topic-specific editorial decisions", () => {
  const canonical = loadProjectModule(join(appRootPath, "lib/blog/canonical-posts.ts"));
  const bySlug = new Map(canonical.canonicalBlogAdditions.map((post) => [post.slug, post]));
  assert.deepEqual(bySlug.get("bitcoin-lightning-network-basics").sourceIds, ["lightning", "bitcoin-dev"]);
  assert.deepEqual(bySlug.get("token-approvals-wallet-permissions").sourceIds, ["eip20", "eip721", "eip1155", "eip2612", "ethereum-security"]);
  assert.deepEqual(bySlug.get("stablecoin-proof-of-reserves").sourceIds, ["fsb", "pcaob"]);
  assert.deepEqual(bySlug.get("stablecoin-proof-of-reserves").relatedSlugs, ["blockchain-bridge-risks", "hot-wallet-vs-hardware-wallet", "crypto-backtest-data-quality"]);
  assert.deepEqual(bySlug.get("market-vs-limit-orders").relatedSlugs, ["maker-taker-fees", "slippage-partial-fills", "order-book-depth-liquidity"]);
  assert.deepEqual(bySlug.get("crypto-funding-rates").sourceIds, ["coinbase-funding", "kraken-futures"]);
  assert.deepEqual(bySlug.get("crypto-transfer-network-memo-basics").sourceIds, ["bitcoin-dev", "coinbase-transfers"]);
  assert.deepEqual(bySlug.get("trading-costs-backtests").sourceIds, ["cfa", "coinbase-fees", "kraken-fees"]);
  assert.deepEqual(bySlug.get("hot-wallet-vs-hardware-wallet").sourceIds, ["ledger", "trezor", "sec-custody"]);
  assert.deepEqual(bySlug.get("crypto-phishing-fake-support").sourceIds, ["ftc", "fbi", "cisa", "korean-fsc"]);
  const sources = loadProjectModule(join(appRootPath, "lib/blog/sources.ts"));
  assert.equal(
    sources.resolveBlogSources(["korean-fsc"])[0].url,
    "https://www.fsc.go.kr/edu/news/83658?curPage=8&srchCtgry=&srchKey=&srchText=",
  );
  assert.equal(bySlug.get("rsi-explained").category, "TECHNICAL-ANALYSIS");
  assert.equal(bySlug.get("crypto-backtest-data-quality").category, "BACKTESTING");
  const sourceCombinations = new Set(canonical.canonicalBlogAdditions.map((post) => post.sourceIds.join("|")));
  assert.ok(sourceCombinations.size >= 30, "sources should be assigned at article level, not inherited from broad clusters");
});

test("Telegram alert guidance cites the delivery API contract", () => {
  const blog = loadProjectModule(join(appRootPath, "lib/blog-posts.ts"));
  const post = blog.blogPostBySlug("en", "telegram-trading-alerts");
  assert.ok(post.sources.some((source) => source.url.includes("core.telegram.org/bots/api#sendmessage")));
});

test("copy fallback executes a selectable textarea workflow", () => {
  const ui = loadProjectModule(join(appRootPath, "lib/blog/article-ui.ts"));
  const calls = [];
  const textArea = {
    setAttribute(name, value) { calls.push(["attribute", name, value]); },
    style: {},
    select() { calls.push(["select"]); },
    remove() { calls.push(["remove"]); },
    value: "",
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    body: { append(node) { assert.equal(node, textArea); calls.push(["append"]); } },
    createElement(tag) { assert.equal(tag, "textarea"); return textArea; },
    execCommand(command) { calls.push(["exec", command]); return true; },
  };
  try {
    assert.equal(ui.copyTextWithSelection("https://aigentratrading.com/blog/test"), true);
    assert.equal(textArea.value, "https://aigentratrading.com/blog/test");
    assert.deepEqual(calls, [
      ["attribute", "readonly", ""],
      ["append"],
      ["select"],
      ["exec", "copy"],
      ["remove"],
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("every localized blog article uses the complete long-form rendering contract", () => {
  // Given: every canonical article in every supported locale.
  const blog = loadProjectModule(join(appRootPath, "lib/blog-posts.ts"));
  const articles = loadProjectModule(join(appRootPath, "lib/blog-article-content.ts"));
  const renderer = source("components/blog/blog-article-client.tsx");

  // When: the article content and its normalized visible body are assembled.
  for (const locale of ["en", "ko", "ru", "pt-BR", "tr"]) {
    for (const post of blog.blogPosts(locale)) {
      const content = articles.blogArticleContent(locale, post);
      const visibleBody = articles.visibleArticleBody(post, content);

      // Then: the user receives the same complete semantic structure for all 60 articles.
      assert.ok(content.sections.length >= 4, `${locale}/${post.slug} should render at least four semantic sections`);
      assert.ok(content.sections.every((section) => section.paragraphs.length >= 1), `${locale}/${post.slug} sections should contain prose`);
      for (const paragraph of post.paragraphs) {
        assert.ok(
          content.sections.some((section) => section.paragraphs.includes(paragraph)),
          `${locale}/${post.slug} should render every topic-specific paragraph in a semantic section`,
        );
      }
      assert.ok(content.faq.length >= 3, `${locale}/${post.slug} should answer at least three reader questions`);
      assert.ok(post.methodologyDisclosure, `${locale}/${post.slug} should disclose how the article was prepared`);
      assert.ok(post.riskNotice, `${locale}/${post.slug} should include a topic-specific risk notice`);
      assert.ok(post.sources?.length >= 2, `${locale}/${post.slug} should cite at least two authoritative sources`);
      assert.match(post.publishedAt ?? "", /^\d{4}-\d{2}-\d{2}$/, `${locale}/${post.slug} should use an ISO publication date`);
      assert.match(post.modifiedAt ?? "", /^\d{4}-\d{2}-\d{2}$/, `${locale}/${post.slug} should use an ISO modification date`);
      assert.ok(visibleBody.includes(post.paragraphs[0]), `${locale}/${post.slug} visible body should include its topic-specific opening`);
      assert.ok(visibleBody.includes(content.faq[0].answer), `${locale}/${post.slug} visible body should include its FAQ answers`);
      assert.ok(visibleBody.includes(post.methodologyDisclosure), `${locale}/${post.slug} visible body should include its methodology disclosure`);
      assert.ok(visibleBody.includes(post.riskNotice), `${locale}/${post.slug} visible body should include its risk notice`);
    }
  }

  assert.doesNotMatch(renderer, /const expanded =|expanded \? \(/, "all articles should use one long-form rendering path");
});

test("new article BlogPosting data mirrors every visible localized article", () => {
  const blog = loadProjectModule(join(appRootPath, "lib/blog-posts.ts"));
  const detail = loadProjectModule(join(appRootPath, "lib/blog/json-ld.ts"));
  const slug = "bitcoin-utxo-model";
  for (const locale of ["en", "ko", "ru", "pt-BR", "tr"]) {
    const post = blog.blogPostBySlug(locale, slug);
    const schema = detail.blogPostingJsonLd(locale, slug);
    assert.ok(post);
    assert.equal(schema["@type"], "BlogPosting");
    assert.equal(schema.headline, post.title);
    assert.equal(schema.description, post.excerpt);
    assert.equal(schema.inLanguage, locale);
    assert.equal(schema.mainEntityOfPage, `https://aigentratrading.com/blog/${slug}`);
    const articles = loadProjectModule(join(appRootPath, "lib/blog-article-content.ts"));
    const content = articles.blogArticleContent(locale, post);
    assert.equal(schema.articleBody, articles.visibleArticleBody(post, content));
    assert.deepEqual(schema.citation, post.sources.map((source) => source.url));
    assert.equal(schema.author.name, "Aigentra Trading");
  }
});

test("public and private route modules export the expected metadata objects", async () => {
  const layout = loadProjectModule(join(appRootPath, "app/layout.tsx"));
  assert.equal(layout.metadata.metadataBase.toString(), "https://aigentratrading.com/");
  assert.equal(layout.metadata.twitter.card, "summary_large_image");
  assert.equal(
    layout.metadata.verification.other["naver-site-verification"],
    "6cecf585a2c292f0706f14738977fd48fb926154",
  );

  const leaderboard = loadProjectModule(join(appRootPath, "app/leaderboard/page.tsx"));
  const consensus = loadProjectModule(join(appRootPath, "app/consensus/page.tsx"));
  const blog = loadProjectModule(join(appRootPath, "app/blog/page.tsx"));
  const methodology = loadProjectModule(join(appRootPath, "app/methodology/page.tsx"));
  assert.match(leaderboard.metadata.title, /Leaderboard/);
  assert.match(consensus.metadata.title, /Consensus/);
  assert.match(blog.metadata.title, /Blog/);
  assert.match(methodology.metadata.title, /Methodology/);
  assert.notEqual(leaderboard.metadata.description, consensus.metadata.description);

  for (const route of ["terms", "privacy-policy", "risk-disclosure", "disclaimer", "legal-notices"]) {
    const layoutModule = loadProjectModule(join(appRootPath, `app/${route}/layout.tsx`));
    assert.equal(layoutModule.metadata.alternates.canonical, `/${route}`);
    assert.equal(layoutModule.metadata.robots.index, true);
  }

  const detail = loadProjectModule(join(appRootPath, "app/leaderboard/[id]/page.tsx"));
  assert.equal(detail.dynamicParams, false, "unknown trader IDs should be rejected before a streamed 200 response starts");
  assert.ok(detail.generateStaticParams().some((params) => params.id === "channel-rider"));
  const knownTrader = await detail.generateMetadata({ params: Promise.resolve({ id: "channel-rider" }) });
  assert.match(knownTrader.title, /Channel Cartographer/);
  assert.equal(knownTrader.alternates.canonical, "/leaderboard/channel-rider");
  await assert.rejects(
    detail.generateMetadata({ params: Promise.resolve({ id: "not-a-trader" }) }),
    (error) => error?.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
    "unknown leaderboard trader metadata should stop with a server 404",
  );
  await assert.rejects(
    detail.default({ params: Promise.resolve({ id: "not-a-trader" }) }),
    (error) => error?.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
    "unknown leaderboard trader IDs should produce a server 404",
  );

  const legacyDetail = loadProjectModule(join(appRootPath, "app/traders/[id]/page.tsx"));
  await assert.rejects(
    legacyDetail.default({ params: Promise.resolve({ id: "not-a-trader" }) }),
    (error) => error?.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
    "unknown legacy trader IDs should produce a server 404",
  );
  await assert.rejects(
    legacyDetail.default({ params: Promise.resolve({ id: "channel-rider" }) }),
    (error) => error?.digest === "NEXT_REDIRECT;/leaderboard/channel-rider",
    "known legacy trader IDs should retain their redirect",
  );

  const notFoundPage = loadProjectModule(join(appRootPath, "app/not-found.tsx"));
  assertNoindex(notFoundPage.metadata, "global 404 metadata");
  assert.equal(notFoundPage.metadata.alternates.canonical, null, "global 404 should not inherit the homepage canonical");

  const blogDetail = loadProjectModule(join(appRootPath, "app/blog/[slug]/page.tsx"));
  assert.equal(blogDetail.dynamicParams, false, "unknown blog slugs should return a server 404 before streaming");
  assert.ok(blogDetail.generateStaticParams().some((params) => params.slug === "ai-trader-league"));
  const knownPost = await blogDetail.generateMetadata({ params: Promise.resolve({ slug: "ai-trader-league" }) });
  assert.equal(knownPost.alternates.canonical, "/blog/ai-trader-league");
  assert.equal(knownPost.openGraph.type, "article");
  assert.equal(knownPost.openGraph.locale, "en_US");
  assert.equal(knownPost.openGraph.publishedTime, "2026-07-10");
  assert.equal(knownPost.openGraph.modifiedTime, "2026-07-12");
  await assert.rejects(
    blogDetail.generateMetadata({ params: Promise.resolve({ slug: "missing-post" }) }),
    (error) => error?.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
    "unknown blog metadata should stop with a server 404",
  );

  const learnDetail = loadProjectModule(join(appRootPath, "app/learn/[slug]/page.tsx"));
  assert.equal(learnDetail.dynamicParams, false, "unknown knowledge slugs should return a server 404 before streaming");
  await assert.rejects(
    learnDetail.generateMetadata({ params: Promise.resolve({ slug: "missing-term" }) }),
    (error) => error?.digest === "NEXT_HTTP_ERROR_FALLBACK;404",
    "unknown knowledge metadata should stop with a server 404",
  );

  const noindexPages = new Map([
    ["app/account/page.tsx", "/account"],
    ["app/admin/page.tsx", "/admin"],
    ["app/login/page.tsx", "/login"],
    ["app/tests/page.tsx", "/tests"],
    ["app/traders/page.tsx", "/traders"],
    ["app/traders/[id]/page.tsx", "/traders"]
  ]);
  for (const [page, canonical] of noindexPages) {
    const pageModule = loadProjectModule(join(appRootPath, page));
    assertNoindexCanonical(pageModule.metadata, canonical, page);
  }
});

test("sitemap and robots emit crawl discovery from the route catalog", () => {
  const seo = loadProjectModule(join(appRootPath, "lib/seo.ts"));
  const sitemapModule = loadProjectModule(join(appRootPath, "app/sitemap.ts"));
  const robotsModule = loadProjectModule(join(appRootPath, "app/robots.ts"));

  const sitemap = sitemapModule.default();
  const sitemapUrls = sitemap.map((entry) => entry.url);
  for (const route of seo.publicRoutes) {
    assert.ok(sitemapUrls.includes(seo.absoluteUrl(route.path)), `sitemap should include ${route.path}`);
  }
  assert.ok(sitemapUrls.includes("https://aigentratrading.com/leaderboard/channel-rider"));
  assert.ok(sitemapUrls.includes("https://aigentratrading.com/blog/ai-trader-league"));
  assert.ok(sitemapUrls.includes("https://aigentratrading.com/blog/bitcoin-utxo-model"));
  assert.equal(sitemapUrls.filter((url) => url.includes("/blog/")).length, 60);
  assert.ok(sitemap.every((entry) => !("lastModified" in entry)), "sitemap should not fake per-page lastModified values");
  for (const privatePath of seo.privateDisallowPaths) {
    assert.equal(sitemapUrls.some((url) => url.includes(privatePath)), false, `sitemap should exclude ${privatePath}`);
  }

  const robots = robotsModule.default();
  assert.equal(robots.host, "https://aigentratrading.com");
  assert.equal(robots.sitemap, "https://aigentratrading.com/sitemap.xml");
  assert.deepEqual(robots.rules.disallow, [...seo.privateDisallowPaths]);
});

test("homepage JSON-LD renders parseable claim-safe structured data", () => {
  const { HomeSeoJsonLd } = loadProjectModule(join(appRootPath, "app/seo-json-ld.tsx"));
  const element = HomeSeoJsonLd();
  const script = element.type(element.props);
  const json = script.props.dangerouslySetInnerHTML.__html;
  const graph = JSON.parse(json);
  const graphText = JSON.stringify(graph);
  const schemaShape = collectJsonKeysAndTypes(graph);

  assert.equal(script.type, "script");
  assert.equal(script.props.type, "application/ld+json");
  assert.deepEqual(
    graph.map((item) => item["@type"]),
    ["Organization", "WebSite", "SoftwareApplication", "FAQPage"]
  );
  assert.equal(graph[0].url, "https://aigentratrading.com");
  assert.equal(graph[0].contactPoint.email, "support@aigentratrading.com");
  for (const forbiddenType of ["AggregateRating", "Review"]) assert.equal(schemaShape.types.has(forbiddenType), false);
  for (const forbiddenKey of ["ratingValue", "reviewBody"]) assert.equal(schemaShape.keys.has(forbiddenKey), false);
  assert.doesNotMatch(graphText, /guaranteed|risk-free|financial advice/i);
});

test("public copy uses the canonical domain while preserving backend API fallback", () => {
  const publicFiles = [
    ...listSourceFiles(join(appRootPath, "app")),
    ...listSourceFiles(join(appRootPath, "components")),
    ...listSourceFiles(join(appRootPath, "lib")).filter((file) => !/lib\/api(?:-base-url)?\.ts$/.test(file))
  ];

  for (const filePath of publicFiles) {
    const fileSource = readFileSync(filePath, "utf8");
    assert.doesNotMatch(fileSource, /aigentra\.trading/i, `${filePath} should not reference the stale public domain`);
    assert.doesNotMatch(fileSource, /kicoa24@gmail\.com/i, `${filePath} should not expose the legacy personal support email`);
  }

  assert.match(source("components/home-landing-visuals.tsx"), /support@aigentratrading\.com/);
  assert.match(source("lib/api.ts"), /aigentra-trading\.nostalgia-drive\.com/);
  assert.match(source("lib/api-base-url.ts"), /aigentra-trading\.nostalgia-drive\.com/);
});

test("uppercase blog normalization cannot redirect canonical lowercase articles to themselves", () => {
  const nextConfigSource = source("next.config.ts");
  const middlewareSource = source("middleware.ts");
  assert.doesNotMatch(nextConfigSource, /source:\s*"\/BLOG\/:path\*"/, "Next redirect matching is case-insensitive and would loop on /blog URLs");
  assert.match(middlewareSource, /pathname\.startsWith\("\/BLOG\/"\)/, "middleware should normalize only the exact uppercase legacy prefix");
});
