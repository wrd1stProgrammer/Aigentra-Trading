import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const sortModule = loadTsModule("../components/trader-profile-detail/timeline-sort.ts");

test("trader detail timeline sorts merged plan scenario and realized rows newest first", () => {
  const items = sortModule.sortTimelineItemsByRecency([
    { id: "realized-tp", sortMs: sortModule.timelineTimeValue("2026-06-03T09:10:00.000Z") },
    { id: "latest-position", sortMs: sortModule.timelineTimeValue("2026-06-05T11:30:00.000Z") },
    { id: "latest-plan", sortMs: sortModule.timelineTimeValue("2026-06-02T08:00:00.000Z") },
    { id: "realized-sl", sortMs: sortModule.timelineTimeValue("2026-06-04T14:00:00.000Z") }
  ]);

  assert.deepEqual(items.map((item) => item.id), ["latest-position", "realized-sl", "realized-tp", "latest-plan"]);
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
