import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const scenarioWindow = loadTsModule("../components/trader-profile-detail/scenario-window.ts");

test("scenario date counts prefer backend exact totals over loaded rows", () => {
  const items = [
    { id: "a", sortMs: Date.parse("2026-06-13T23:50:00Z") },
    { id: "b", sortMs: Date.parse("2026-06-13T00:10:00Z") },
    { id: "c", sortMs: Date.parse("2026-06-12T23:59:00Z") }
  ];

  const fallback = scenarioWindow.timelineCountByUtcDate(items);
  assert.equal(fallback.get("2026-06-13"), 2);
  assert.equal(fallback.get("2026-06-12"), 1);

  const exact = scenarioWindow.countByUtcDateWithFallback([{ date: "2026-06-13", count: 17 }], items);
  assert.equal(exact.get("2026-06-13"), 17);
  assert.equal(exact.get("2026-06-12"), 1);
});

test("scenario rows are windowed to the selected UTC date and visible limit", () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    id: `june-13-${index}`,
    sortMs: Date.parse(`2026-06-13T${String(23 - index).padStart(2, "0")}:00:00Z`)
  })).concat([
    { id: "june-12", sortMs: Date.parse("2026-06-12T23:00:00Z") }
  ]);

  const visible = scenarioWindow.timelineItemsForUtcDate(items, "2026-06-13", 10);

  assert.equal(visible.length, 10);
  assert.equal(visible[0].id, "june-13-0");
  assert.equal(visible[9].id, "june-13-9");
  assert.equal(scenarioWindow.nextVisibleCount(10, 12), 12);
  assert.equal(scenarioWindow.nextVisibleCount(10, 35), 20);
});

test("scenario review hydration stops after paging beyond the selected UTC date", () => {
  const currentDateOnly = [
    { createdAt: "2026-07-15T14:47:03Z" },
    { createdAt: "2026-07-15T10:00:06Z" }
  ];
  const crossedDateBoundary = [
    ...currentDateOnly,
    { createdAt: "2026-07-14T22:46:15Z" }
  ];

  assert.equal(scenarioWindow.hasLoadedRecordsBeforeUtcDate(currentDateOnly, "2026-07-15"), false);
  assert.equal(scenarioWindow.hasLoadedRecordsBeforeUtcDate(crossedDateBoundary, "2026-07-15"), true);
  assert.equal(scenarioWindow.hasLoadedRecordsBeforeUtcDate([{ createdAt: "invalid" }], "2026-07-15"), false);
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
