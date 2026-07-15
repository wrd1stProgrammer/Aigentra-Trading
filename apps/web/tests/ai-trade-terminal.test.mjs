import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const terminalPolicy = loadTsModule("../lib/ai-trade-terminal.ts");
const terminalComponentSource = readFileSync(new URL("../components/ai-trade-terminal.tsx", import.meta.url), "utf8");
const leaderboardSource = readFileSync(new URL("../components/leaderboard-page-client.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("terminal keeps a breakeven close separate from a later entry cycle", () => {
  const rows = terminalPolicy.buildAITradeTerminal({
    traders: [{ id: "rsi-divergence-scout", name: "RSI Divergence Scout" }],
    events: [
      event(1, "rsi-divergence-scout", 802, "position_closed", "2026-07-14T14:04:19Z", { payload: { reason: "breakeven" } }),
      event(2, "rsi-divergence-scout", null, "paper_order_created", "2026-07-14T14:09:03Z", { orderId: 1751, payload: { tradePlanId: 1135 } }),
      event(3, "rsi-divergence-scout", 804, "order_filled", "2026-07-14T14:09:08Z", { orderId: 1751 })
    ],
    reviews: []
  });

  assert.deepEqual(rows.map((row) => row.kind), ["entry_confirmed", "pending_entry", "breakeven"]);
  assert.equal(rows[0].positionId, "804");
  assert.equal(rows[2].positionId, "802");
});

test("terminal emits only the seven requested decision event classes", () => {
  const rows = terminalPolicy.buildAITradeTerminal({
    traders: [{ id: "rsi", name: "RSI" }],
    events: [
      event(1, "rsi", 7, "stop_moved_to_breakeven", "2026-07-14T10:00:00Z"),
      event(2, "rsi", 7, "funding_payment", "2026-07-14T10:01:00Z"),
      event(3, "rsi", 7, "order_canceled_by_ai", "2026-07-14T10:02:00Z"),
      event(4, "rsi", 7, "take_partial_profit", "2026-07-14T10:03:00Z", { realizedPnl: 12 }),
      event(5, "rsi", 7, "position_reduced_by_ai", "2026-07-14T10:04:00Z", { realizedPnl: -3 }),
      event(6, "rsi", 7, "position_closed", "2026-07-14T10:05:00Z", { payload: { reason: "manual_close" } })
    ],
    reviews: [
      { id: 8, traderId: "rsi", source: "entry_review", decision: "APPROVE", createdAt: "2026-07-14T09:59:00Z", confidence: 81 },
      { id: 9, traderId: "rsi", source: "management_review", decision: "HOLD", createdAt: "2026-07-14T10:06:00Z" }
    ]
  });

  assert.deepEqual(new Set(rows.map((row) => row.kind)), new Set(["entry", "take_profit", "stop_loss", "position_closed"]));
  assert.equal(rows.some((row) => row.kind === "entry" && row.confidence === 81), true);
});

test("leaderboard terminal is chart-free, replay-free, and loaded from bounded parallel data", () => {
  assert.match(terminalComponentSource, /data-testid="ai-trade-terminal"/, "terminal should expose a stable browser QA target");
  assert.doesNotMatch(terminalComponentSource, /type="range"|setInterval|requestAnimationFrame|autoplay|lightweight-charts/i, "terminal should have no scrubber, autoplay, or chart runtime");
  assert.match(leaderboardSource, /<AITradeTerminalPanel/, "leaderboard should render the terminal");
  assert.doesNotMatch(leaderboardSource, /AITradeReplayPanel|ai-trade-replay/, "the discarded replay should not remain connected");
  assert.match(apiSource, /getAITradeTerminalSource/, "terminal should use a named bounded source");
  assert.match(apiSource, /Promise\.all\(\[/, "event and review windows should load in parallel");
  assert.match(apiSource, /includePayload: "true"/, "events should retain real execution metadata");
});

test("terminal uses compact relative-time rows and fetches the next bounded page at the scroll edge", () => {
  assert.match(terminalComponentSource, /formatRelativeDateTime\(row\.occurredAt, locale, t\)/, "row timestamps should use localized relative time");
  assert.doesNotMatch(terminalComponentSource, /formatTerminalTime/, "the old UTC clock formatter should not remain");
  assert.match(terminalComponentSource, /max-h-\[260px\]/, "the terminal stream should be half the previous vertical height");
  assert.match(terminalComponentSource, /scrollHeight - scrollTop - clientHeight <=/, "the terminal should detect the bottom scroll edge");
  assert.match(terminalComponentSource, /text-\[10px\][^\n]*lg:max-w-\[210px\]/, "right-side facts should be slightly larger");
  assert.match(leaderboardSource, /useInfiniteQuery/, "terminal history should load through a paged query");
  assert.match(leaderboardSource, /getNextPageParam/, "terminal history should expose the next bounded page");
  assert.match(leaderboardSource, /onLoadMore=\{loadMoreAITradeTerminal\}/, "the stream edge should request the next page");
  assert.match(apiSource, /eventParams\.set\("offset"/, "event history should request a page offset");
  assert.match(apiSource, /reviewParams\.set\("offset"/, "review history should request a page offset");
  assert.match(apiSource, /nextPage:/, "the API adapter should return a pagination cursor");
});

test("confirmed entries show the localized second-stage review rationale", () => {
  const rows = terminalPolicy.buildAITradeTerminal({
    locale: "ko",
    traders: [{ id: "atr-trail-commander", name: "ATR Trail Boss" }],
    events: [event(5090, "atr-trail-commander", 808, "order_filled", "2026-07-14T16:02:10Z", { price: 64647.7 })],
    reviews: [{
      id: 3517,
      traderId: "atr-trail-commander",
      source: "entry_review",
      decision: "ADJUST_AND_APPROVE",
      createdAt: "2026-07-14T16:02:06Z",
      structuredReview: { headline: "강한 4시간 거래량으로 EMA 밴드 위 돌파가 확인돼 진입을 승인했습니다." }
    }]
  });

  assert.equal(rows[0].message, "강한 4시간 거래량으로 EMA 밴드 위 돌파가 확인돼 진입을 승인했습니다.");
  assert.doesNotMatch(rows[0].message, /신규 포지션 진입이 확정/);
});

test("terminal removes decorative and redundant metadata from the compact stream", () => {
  assert.doesNotMatch(terminalComponentSource, /cycleLabel|leaderboard\.terminal\.heading/, "position, order, and plan ids plus the duplicate heading should not render");
  assert.doesNotMatch(terminalComponentSource, /\{row\.symbol\}/, "the repeated market symbol should not render in terminal facts");
  assert.doesNotMatch(globalCssSource, /\.ai-decision-terminal\s*\{[^}]*background-image/s, "terminal background should not render a grid");
  assert.match(terminalComponentSource, /truncate[^\n]*\{message\}/, "review rationale should remain on one ellipsized line");
  assert.match(terminalComponentSource, /Math\.abs\(row\.realizedPnl\)/, "zero realized PnL should be hidden from facts");
  assert.match(terminalComponentSource, /py-2\.5/, "event rows should use a tighter vertical rhythm");
});

function event(id, traderId, positionId, eventType, createdAt, overrides = {}) {
  return { id, traderId, positionId, eventType, createdAt, symbol: "BTCUSDT", ...overrides };
}

function loadTsModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
