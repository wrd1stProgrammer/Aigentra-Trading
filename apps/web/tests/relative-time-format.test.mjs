import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const format = loadTsModule("../lib/format.ts");
const dataSource = readFileSync(new URL("../components/trader-profile-detail/data.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("relative date time uses localized minute and hour labels within 24 hours", () => {
  const ko = (key) =>
    ({
      "time.relative.justNow": "방금 전",
      "time.relative.ago": "{value} 전",
      "time.relative.hour": "시간",
      "time.relative.hours": "시간",
      "time.relative.minute": "분",
      "time.relative.minutes": "분"
    })[key] ?? key;
  const en = (key) =>
    ({
      "time.relative.justNow": "Just now",
      "time.relative.ago": "{value} ago",
      "time.relative.hour": "hr",
      "time.relative.hours": "hr",
      "time.relative.minute": "min",
      "time.relative.minutes": "min"
    })[key] ?? key;
  const now = new Date("2026-06-17T12:00:00Z");

  assert.equal(format.formatRelativeDateTime("2026-06-17T11:57:00Z", "ko", ko, now), "3분 전");
  assert.equal(format.formatRelativeDateTime("2026-06-17T10:57:00Z", "ko", ko, now), "1시간 3분 전");
  assert.equal(format.formatRelativeDateTime("2026-06-17T11:10:00Z", "en", en, now), "50 min ago");
  assert.equal(
    format.formatRelativeDateTime("2026-06-16T11:59:00Z", "ko", ko, now),
    format.formatDateTime("2026-06-16T11:59:00Z", "ko")
  );
});

test("latest scenarios and UTC trade history use relative time formatter", () => {
  assert.match(i18nSource, /"time\.relative\.ago"/, "relative time i18n keys should exist");
  assert.match(dataSource, /formatRelativeDateTime\(scenario\.createdAt, locale, t\)/, "latest scenarios should show recent relative time");
  assert.match(dataSource, /formatRelativeDateTime\(position\.closedAt \?\? position\.closed_at \?\? position\.updatedAt \?\? event\?\.createdAt \?\? event\?\.timestamp, locale, t\)/, "closed-position trade history should show recent relative time");
  assert.match(dataSource, /formatRelativeDateTime\(event\.createdAt, locale, t\)/, "event trade history should show recent relative time");
  assert.match(pageSource, /formatRelativeDateTime\(item\.time, locale, t\)/, "merged trade-history API rows should show recent relative time");
});

function loadTsModule(relativePath) {
  const tsSource = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
