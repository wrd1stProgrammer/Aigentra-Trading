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
  assert.match(opinionCardSource, /Aigentra/, "opinion card should be branded as an Aigentra aggregate opinion");
  assert.match(opinionCardSource, /nextRefreshAt/, "opinion card should expose the exact next hourly refresh time");
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
  assert.match(i18nSource, /"consensus\.nextOpinionRefresh"/, "copy should explain the hourly refresh");
  assert.doesNotMatch(i18nSource, /"consensus\.opinionDataQuality"/, "data-quality copy should be removed");
});
