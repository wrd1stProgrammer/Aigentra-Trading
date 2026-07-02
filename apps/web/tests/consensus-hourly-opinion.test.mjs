import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const consensusSource = readFileSync(new URL("../components/consensus-page-client.tsx", import.meta.url), "utf8");
const opinionCardSource = readFileSync(new URL("../components/consensus-hourly-opinion.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const policySource = readFileSync(new URL("../lib/league-sentiment-ui-policy.ts", import.meta.url), "utf8");
const opinionViewPolicySource = readFileSync(new URL("../lib/consensus-opinion-view-policy.ts", import.meta.url), "utf8");

function loadPolicyModule() {
  const compiled = ts.transpileModule(policySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: () => ({}) });
  return module.exports;
}

function loadOpinionViewPolicyModule() {
  const compiled = ts.transpileModule(opinionViewPolicySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: () => ({}) });
  return module.exports;
}

test("AI sentiment page renders a cached hourly Aigentra opinion before dense sentiment panels", () => {
  assert.match(consensusSource, /ConsensusHourlyOpinion/, "consensus page should render the hourly aggregate opinion card");
  assert.match(consensusSource, /getLeagueSentimentOpinion/, "consensus page should load the backend-generated opinion");
  assert.match(consensusSource, /preferCached: true/, "sentiment page should request the latest cached opinion before blocking on a new hourly generation");
  assert.match(consensusSource, /setQueryData\(hourlyOpinionQueryKey, freshOpinion\)/, "stale cached opinions should be replaced by a background fresh opinion");
  assert.match(consensusSource, /placeholderData: \(previousData\) => previousData/, "opinion card should keep prior data visible during refreshes");
  assert.match(consensusSource, /data-testid="consensus-hourly-opinion"/, "opinion card should be a testable first-class surface");
  assert.match(opinionCardSource, /aigentra/i, "opinion card should be branded as an Aigentra aggregate opinion");
  assert.match(opinionCardSource, /formatMinutesUntil/, "opinion card should show how many minutes remain until the next generation");
  assert.match(opinionCardSource, /data\?\.createdAt/, "opinion card should show when the current opinion was generated");
  assert.doesNotMatch(opinionCardSource, /formatDateTime\(nextRefreshAt, locale\)/, "opinion card should not lead with a fixed next hourly timestamp");
  assert.match(opinionCardSource, /isLoading/, "opinion card should distinguish generated data from a loading placeholder");
  assert.match(opinionCardSource, /data-testid="consensus-opinion-loading"/, "opinion card should show an explicit loading state while generated data is unavailable");
  assert.match(consensusSource, /hourlyOpinionLoading/, "sentiment page should calculate a dedicated opinion loading state");
  assert.doesNotMatch(consensusSource, /hourlyOpinionLoading\s*=\s*[^;]*\.stale/, "stale cached opinions should stay visible while a fresh opinion is generated in the background");
  assert.doesNotMatch(opinionCardSource, /opinionDataQuality|dataQuality/, "opinion card should not render the removed data-quality panel");
});

test("hourly opinion freshness policy exposes overdue cached opinions instead of hiding them", () => {
  const { leagueSentimentFreshnessView, refreshCountdownLabel } = loadPolicyModule();
  const nowMs = Date.parse("2026-06-18T10:30:00.000Z");
  const staleData = {
    cacheHit: true,
    stale: true,
    nextRefreshAt: "2026-06-18T09:00:00.000Z",
  };
  const t = (key) => ({ "consensus.minutesOverdue": "{minutes}분 지연" }[key] ?? key);

  const view = leagueSentimentFreshnessView(staleData, nowMs);

  assert.equal(view.status, "overdue");
  assert.equal(view.labelKey, "consensus.freshness.overdue");
  assert.equal(view.overdueMinutes, 90);
  assert.equal(refreshCountdownLabel(staleData.nextRefreshAt, nowMs, t), "90분 지연");
});

test("hourly opinion source policy separates active exposure, pending intent, outcomes, and AI reviews", () => {
  const { leagueSentimentSourceGroups } = loadPolicyModule();

  const groups = leagueSentimentSourceGroups({
    activePositions: 4,
    activeLongPositions: 1,
    activeShortPositions: 3,
    pendingOrders: 2,
    pendingLongOrders: 2,
    pendingShortOrders: 0,
    recentClosedPositions: 5,
    recentTradeEvents: 8,
    recentTakeProfits: 3,
    recentStopLosses: 2,
    recentEntryReviews: 7,
    recentManagementReviews: 11,
  });

  assert.deepEqual(Array.from(groups, (group) => group.key), ["activeExposure", "pendingOrders", "recentOutcomes", "aiReviews"]);
  assert.equal(groups[0].value, 4);
  assert.equal(groups[1].detail, "LONG 2 / SHORT 0");
  assert.equal(groups[2].value, 13);
  assert.equal(groups[3].value, 18);
});

test("hourly opinion API contract is typed and localized", () => {
  assert.match(apiSource, /export type LeagueSentimentOpinion/, "web API layer should expose a typed opinion payload");
  assert.match(apiSource, /getLeagueSentimentOpinion/, "web API layer should call the opinion endpoint");
  assert.match(apiSource, /preferCached/, "web API should support non-blocking cached sentiment lookup");
  assert.match(apiSource, /stale\?: boolean/, "web API type should expose stale cached opinion state");
  assert.match(apiSource, /confidenceReason/, "web API type should expose confidence explanation");
  assert.match(apiSource, /evidenceRefs/, "web API type should expose evidence references");
  assert.match(apiSource, /dataFreshness/, "web API type should expose source freshness metadata");
  assert.match(apiSource, /\/api\/league\/sentiment\/opinion/, "web API should target the backend hourly opinion endpoint");
  assert.doesNotMatch(apiSource, /dataQuality/, "web opinion type should not expose dataQuality");
  assert.match(i18nSource, /"consensus\.aigentraOpinion"/, "Korean copy should include the opinion title key");
  assert.match(i18nSource, /"consensus\.nextOpinionCountdown"/, "copy should explain minutes until the next opinion generation");
  assert.match(i18nSource, /"consensus\.opinionGeneratedAt"/, "copy should label when the current opinion was generated");
  assert.match(i18nSource, /"consensus\.freshness\.overdue"/, "copy should distinguish overdue stale opinions");
  assert.match(i18nSource, /"consensus\.sourceGroup\.aiReviews"/, "copy should label AI review evidence separately");
  assert.doesNotMatch(i18nSource, /"consensus\.nextOpinionRefresh": "다음 정시 갱신"/, "Korean UI should not show the old fixed-hour refresh label");
  assert.doesNotMatch(i18nSource, /"consensus\.opinionDataQuality"/, "data-quality copy should be removed");
});

test("AI sentiment status copy is localized instead of leaking raw backend enums", () => {
  assert.match(opinionCardSource, /localizedRiskLevel/, "risk level values should be mapped through locale copy");
  assert.doesNotMatch(opinionCardSource, /value=\{opinion\?\.riskLevel \?\? "-"\}/, "raw LOW/MEDIUM/HIGH values should not be printed directly");
  assert.match(consensusSource, /localizedActiveRationale/, "raw English position rationales should be replaced with localized fallback copy when needed");
  assert.match(i18nSource, /"consensus\.riskLevel\.MEDIUM"/, "risk level locale keys should exist");
  assert.match(i18nSource, /"consensus\.activeRationale\.inPosition"/, "localized active-position rationale copy should exist");
});

test("Aigentra opinion card stays compact while preserving decision signals", () => {
  const { compactItems, compactLongShortContext, compactOpinionInsights, stripEvidenceCitation } = loadOpinionViewPolicyModule();

  assert.equal(
    stripEvidenceCitation("SHORT 명목 가치가 LONG 명목 가치보다 큽니다. 출처: position:516, position:515."),
    "SHORT 명목 가치가 LONG 명목 가치보다 큽니다.",
    "visible compact bullets should remove raw backend evidence ids",
  );
  assert.deepEqual(
    Array.from(compactItems(["첫 근거. 출처: position:1.", "둘째 근거.", "셋째 근거."], "비어 있음", 2)),
    ["첫 근거.", "둘째 근거."],
    "compact bullets should keep the highest-priority readable items only",
  );
  assert.deepEqual(Array.from(compactItems([], "비어 있음", 1)), ["비어 있음"], "compact bullets should keep an explicit empty state");
  assert.equal(
    compactLongShortContext("SHORT 압력이 더 강하며, 4개의 활성 SHORT 포지션과 1개의 활성 LONG 포지션이 있습니다."),
    "SHORT 압력이 더 강하며",
    "long-short context should be summarized before display",
  );
  assert.deepEqual(
    Array.from(
      compactOpinionInsights({
        drivers: ["숏 노출 우세. 출처: position:1."],
        risks: ["손절 집중으로 오판 가능. 출처: closed_position:2."],
        watch: ["60535 돌파 여부 확인. 출처: position:3."],
        driverLabel: "핵심 근거",
        riskLabel: "주의할 점",
        watchLabel: "다음 확인",
        emptyDriver: "근거 없음",
        emptyRisk: "리스크 없음",
        emptyWatch: "확인 없음",
      }),
      (insight) => ({ label: insight.label, item: insight.item, tone: insight.tone }),
    ),
    [
      { label: "핵심 근거", item: "숏 노출 우세.", tone: "good" },
      { label: "주의할 점", item: "손절 집중으로 오판 가능.", tone: "warn" },
      { label: "다음 확인", item: "60535 돌파 여부 확인.", tone: "neutral" },
    ],
    "compact insight policy should keep drivers, risks, and watch conditions visible without raw evidence ids",
  );

  assert.match(opinionCardSource, /consensus\.opinionAction/, "action copy should be localized and visible as the primary next step");
  assert.match(opinionCardSource, /consensus\.opinionRisk/, "risk should remain visible in the compact summary");
  assert.match(opinionCardSource, /consensus\.opinionConfidence/, "confidence should remain visible in the compact summary");
  assert.match(opinionCardSource, /consensus\.opinionLongShort/, "long/short context should remain visible in the compact summary");
  assert.match(opinionCardSource, /consensus\.opinionWatch/, "next checks should remain visible");
  assert.match(opinionCardSource, /compactOpinionInsights/, "drivers, risks, and watch conditions should share one compact display policy");
  assert.doesNotMatch(opinionCardSource, /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/, "opinion card should not keep the heavy right sidebar layout");
  assert.doesNotMatch(opinionCardSource, /md:grid-cols-3/, "opinion card should not render three dense evidence cards");
  assert.doesNotMatch(opinionCardSource, /SourceGroupList|FreshnessRow/, "source and freshness details should not dominate the simplified opinion card");
  assert.doesNotMatch(opinionCardSource, /opinion\.confidenceReason &&/, "confidence explanation should not expand the compact card");
  assert.doesNotMatch(opinionCardSource, /Suggested Action/, "visible action label should not leak English copy in localized UI");
});
