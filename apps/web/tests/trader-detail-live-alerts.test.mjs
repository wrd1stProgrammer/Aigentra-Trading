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

test("detail page does not notify for an existing scenario that predates the current detail session", () => {
  const item = {
    id: "scenario-live-fetch",
    title: "유지 · 포지션 진행 · 롱",
    body: "시장에 즉각적인 무효화 신호 없음",
    time: "4분 전",
    sortMs: 1_000
  };
  const next = alerts.nextLiveDetailAlert({
    previousKey: "scenario-placeholder",
    item,
    hydrated: true,
    minSortMs: 2_000,
    t: identityT
  });
  assert.equal(next.alert, null);
  assert.equal(next.nextKey, "scenario-live-fetch");
});

test("detail page notifies for a scenario created after the current detail session starts", () => {
  const item = {
    id: "scenario-live-created",
    title: "손절가 조정",
    body: "AI가 손절선을 올렸습니다.",
    time: "방금 전",
    sortMs: 3_000
  };
  const next = alerts.nextLiveDetailAlert({
    previousKey: "scenario-placeholder",
    item,
    hydrated: true,
    minSortMs: 2_000,
    t: identityT
  });
  assert.equal(next.alert.itemTitle, "손절가 조정");
});

test("trader detail page renders a bottom-right live alert surface", () => {
  assert.match(pageSource, /data-testid="live-detail-alert"/, "detail page needs a stable live alert QA target");
  assert.match(pageSource, /bottom-4[^"`']*right-4|right-4[^"`']*bottom-4/, "desktop live alert should appear at the lower right");
  assert.match(pageSource, /nextLiveDetailAlert/, "detail page should use the shared alert baseline helper");
  assert.match(pageSource, /liveAlertStartedAtRef/, "detail page should anchor live alerts to the active detail session time");
  assert.match(pageSource, /minSortMs:\s*liveAlertStartedAtRef\.current/, "detail page should suppress alerts for reviews older than the session");
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
