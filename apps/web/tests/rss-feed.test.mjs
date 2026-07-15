import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const rssBuilderPath = new URL("../lib/rss.ts", import.meta.url);
const rssRoutePath = new URL("../app/rss.xml/route.ts", import.meta.url);

test("RSS feed publishes escaped Korean blog and knowledge content", () => {
  // Given
  assert.ok(existsSync(rssBuilderPath), "RSS XML builder should exist");
  assert.ok(existsSync(rssRoutePath), "/rss.xml route should exist");
  const output = ts.transpileModule(readFileSync(rssBuilderPath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const loadedModule = { exports: {} };
  new Function("module", "exports", output.outputText)(loadedModule, loadedModule.exports);

  // When
  const xml = loadedModule.exports.buildRssXml({
    title: "Aigentra & Trading",
    link: "https://aigentratrading.com",
    description: "AI <트레이딩> 지식",
    language: "ko-KR",
    updatedAt: "2026-07-13",
    items: [{
      title: "펀딩비 & 미결제약정",
      link: "https://aigentratrading.com/learn/funding-rate",
      description: "롱 < 숏일 수 있습니다.",
      publishedAt: "2026-07-13",
      category: "지식 허브",
    }],
  });

  // Then
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<rss version="2\.0">/);
  assert.match(xml, /<language>ko-KR<\/language>/);
  assert.match(xml, /Aigentra &amp; Trading/);
  assert.match(xml, /AI &lt;트레이딩&gt; 지식/);
  assert.match(xml, /펀딩비 &amp; 미결제약정/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/aigentratrading\.com\/learn\/funding-rate<\/guid>/);
  assert.match(xml, /<pubDate>Sun, 12 Jul 2026 15:00:00 GMT<\/pubDate>/);

  const routeSource = readFileSync(rssRoutePath, "utf8");
  assert.match(routeSource, /blogPosts\("ko"\)/);
  assert.match(routeSource, /learnEntries\("ko"\)/);
  assert.match(routeSource, /application\/rss\+xml/);
});
