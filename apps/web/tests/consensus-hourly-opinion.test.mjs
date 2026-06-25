import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const consensusSource = readFileSync(new URL("../components/consensus-page-client.tsx", import.meta.url), "utf8");
const opinionCardSource = readFileSync(new URL("../components/consensus-hourly-opinion.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

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

test("hourly opinion API contract is typed and localized", () => {
  assert.match(apiSource, /export type LeagueSentimentOpinion/, "web API layer should expose a typed opinion payload");
  assert.match(apiSource, /getLeagueSentimentOpinion/, "web API layer should call the opinion endpoint");
  assert.match(apiSource, /preferCached/, "web API should support non-blocking cached sentiment lookup");
  assert.match(apiSource, /stale\?: boolean/, "web API type should expose stale cached opinion state");
  assert.match(apiSource, /\/api\/league\/sentiment\/opinion/, "web API should target the backend hourly opinion endpoint");
  assert.doesNotMatch(apiSource, /dataQuality/, "web opinion type should not expose dataQuality");
  assert.match(i18nSource, /"consensus\.aigentraOpinion"/, "Korean copy should include the opinion title key");
  assert.match(i18nSource, /"consensus\.nextOpinionCountdown"/, "copy should explain minutes until the next opinion generation");
  assert.match(i18nSource, /"consensus\.opinionGeneratedAt"/, "copy should label when the current opinion was generated");
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
