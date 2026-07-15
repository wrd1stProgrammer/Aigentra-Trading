#!/usr/bin/env node
import assert from "node:assert/strict";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const base = stripTrailingSlash(args.get("--base") ?? "http://127.0.0.1:3109");
const expectDomain = stripTrailingSlash(args.get("--expect-domain") ?? "https://aigentratrading.com");
const expectedPages = ["/", "/leaderboard", "/consensus", "/leaderboard/channel-rider", "/terms"];
const excludedSitemapPaths = ["/account", "/admin", "/login", "/tests", "/api/", "/backend-api/", "/traders"];
const observations = {
  base,
  canonicalDomain: expectDomain,
  pages: [],
  robots: null,
  sitemap: null
};

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function absolute(path) {
  return `${base}${path}`;
}

async function fetchText(path) {
  const response = await fetch(absolute(path), { redirect: "manual" });
  assert.equal(response.status, 200, `${path} should return HTTP 200`);
  return response.text();
}

function metaContent(html, key, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const keyPattern = new RegExp(`\\b${key}=["']${escapeRegex(value)}["']`, "i");
  for (const tag of tags) {
    if (!keyPattern.test(tag)) continue;
    const content = tag.match(/\bcontent=(["'])(.*?)\1/i);
    if (content) return content[2];
  }
  return null;
}

function linkHref(html, relValue) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  const relPattern = new RegExp(`\\brel=["'][^"']*${escapeRegex(relValue)}[^"']*["']`, "i");
  for (const tag of tags) {
    if (!relPattern.test(tag)) continue;
    const href = tag.match(/\bhref=(["'])(.*?)\1/i);
    if (href) return href[2];
  }
  return null;
}

function assertPageHead(path, html) {
  const canonical = path === "/" ? expectDomain : `${expectDomain}${path}`;
  const description = metaContent(html, "name", "description");
  const ogTitle = metaContent(html, "property", "og:title");
  const ogDescription = metaContent(html, "property", "og:description");
  const twitterTitle = metaContent(html, "name", "twitter:title");
  const twitterDescription = metaContent(html, "name", "twitter:description");
  assert.equal(linkHref(html, "canonical"), canonical, `${path} should expose canonical URL ${canonical}`);
  assert.ok(description, `${path} should include a meta description`);
  assert.ok(ogTitle, `${path} should include og:title`);
  assert.ok(ogDescription, `${path} should include og:description`);
  assert.equal(metaContent(html, "property", "og:url"), canonical, `${path} should include a canonical og:url`);
  assert.match(metaContent(html, "property", "og:image") ?? "", /^https:\/\/aigentratrading\.com\/og-image\.png$/, `${path} should use the canonical OG image`);
  assert.equal(metaContent(html, "name", "twitter:card"), "summary_large_image", `${path} should use a large Twitter/X card`);
  assert.ok(twitterTitle, `${path} should include twitter:title`);
  assert.ok(twitterDescription, `${path} should include twitter:description`);
  assert.match(html, /Aigentra Trading/i, `${path} should include the product brand`);
  return {
    path,
    canonical,
    descriptionLength: description.length,
    ogTitle,
    ogDescriptionLength: ogDescription.length,
    twitterTitle,
    twitterDescriptionLength: twitterDescription.length
  };
}

function jsonLdTypes(html) {
  const scriptMatches = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const types = [];
  for (const script of scriptMatches) {
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const parsed = JSON.parse(body);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (node && typeof node === "object" && typeof node["@type"] === "string") types.push(node["@type"]);
      }
    } catch {
      types.push("unparseable");
    }
  }
  return types;
}

const failures = [];

for (const path of expectedPages) {
  try {
    const html = await fetchText(path);
    const pageObservation = assertPageHead(path, html);
    if (path === "/") {
      assert.match(html, /type=["']application\/ld\+json["']/i, "homepage should include JSON-LD");
      assert.match(html, /FAQPage|SoftwareApplication|WebSite|Organization/, "homepage JSON-LD should include core schema types");
      pageObservation.jsonLdTypes = jsonLdTypes(html);
    }
    observations.pages.push(pageObservation);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

try {
  const robots = await fetchText("/robots.txt");
  assert.match(robots, new RegExp(`Sitemap:\\s*${escapeRegex(expectDomain)}/sitemap\\.xml`), "robots.txt should advertise canonical sitemap");
  const disallowRules = [];
  for (const path of excludedSitemapPaths) {
    assert.match(robots, new RegExp(`Disallow:\\s*${escapeRegex(path)}`), `robots.txt should disallow ${path}`);
    disallowRules.push(path);
  }
  observations.robots = {
    sitemap: `${expectDomain}/sitemap.xml`,
    disallowRules
  };
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

try {
  const sitemap = await fetchText("/sitemap.xml");
  const sitemapUrls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
  for (const path of ["/", "/leaderboard", "/consensus", "/leaderboard/channel-rider", "/privacy-policy", "/risk-disclosure", "/disclaimer", "/legal-notices", "/terms"]) {
    const expected = path === "/" ? `${expectDomain}/` : `${expectDomain}${path}`;
    assert.match(sitemap, new RegExp(escapeRegex(expected)), `sitemap should include ${expected}`);
  }
  for (const path of excludedSitemapPaths) {
    assert.doesNotMatch(sitemap, new RegExp(escapeRegex(`${expectDomain}${path}`)), `sitemap should exclude ${path}`);
  }
  assert.doesNotMatch(sitemap, /<lastmod>/i, "sitemap should not fake lastmod values");
  observations.sitemap = {
    urlCount: sitemapUrls.length,
    sampleUrls: sitemapUrls.slice(0, 12),
    hasLastmod: /<lastmod>/i.test(sitemap)
  };
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify(observations, null, 2));
