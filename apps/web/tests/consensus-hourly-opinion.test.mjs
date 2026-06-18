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
  assert.match(consensusSource, /data-testid="consensus-hourly-opinion"/, "opinion card should be a testable first-class surface");
  assert.match(opinionCardSource, /Aigentra/, "opinion card should be branded as an Aigentra aggregate opinion");
  assert.match(opinionCardSource, /nextRefreshAt/, "opinion card should expose the exact next hourly refresh time");
});

test("hourly opinion API contract is typed and localized", () => {
  assert.match(apiSource, /export type LeagueSentimentOpinion/, "web API layer should expose a typed opinion payload");
  assert.match(apiSource, /getLeagueSentimentOpinion/, "web API layer should call the opinion endpoint");
  assert.match(apiSource, /\/api\/league\/sentiment\/opinion/, "web API should target the backend hourly opinion endpoint");
  assert.match(i18nSource, /"consensus\.aigentraOpinion"/, "Korean copy should include the opinion title key");
  assert.match(i18nSource, /"consensus\.nextOpinionRefresh"/, "copy should explain the hourly refresh");
});
