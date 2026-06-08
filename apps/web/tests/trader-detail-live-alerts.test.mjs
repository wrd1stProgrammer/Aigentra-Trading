import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";

const alerts = loadTsModule("../components/trader-profile-detail/live-alerts.ts");
const pageSource = readFileSync(new URL("../components/trader-profile-page-client.tsx", import.meta.url), "utf8");

test("detail page does not notify for initial hydrated scenario baseline", () => {
  const item = { id: "scenario-1", title: "익절", body: "목표가 도달", time: "6월 5일 15:27" };
  const next = alerts.nextLiveDetailAlert({ previousKey: null, item, hydrated: false, t: identityT });
  assert.equal(next.alert, null);
  assert.equal(next.nextKey, "scenario-1");
});

test("detail page emits a new live alert when a later scenario arrives", () => {
  const item = { id: "scenario-2", title: "손절가 조정", body: "AI가 손절선을 올렸습니다.", time: "6월 5일 15:32" };
  const next = alerts.nextLiveDetailAlert({ previousKey: "scenario-1", item, hydrated: true, t: identityT });
  assert.equal(next.nextKey, "scenario-2");
  assert.equal(next.alert.title, "detail.liveAlertScenario");
  assert.equal(next.alert.itemTitle, "손절가 조정");
});

test("trader detail page renders a bottom-right live alert surface", () => {
  assert.match(pageSource, /data-testid="live-detail-alert"/, "detail page needs a stable live alert QA target");
  assert.match(pageSource, /bottom-4[^"`']*right-4|right-4[^"`']*bottom-4/, "desktop live alert should appear at the lower right");
  assert.match(pageSource, /nextLiveDetailAlert/, "detail page should use the shared alert baseline helper");
});

function identityT(key) {
  return key;
}

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
