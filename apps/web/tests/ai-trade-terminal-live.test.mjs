import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const liveTerminal = loadOptionalTsModule("../lib/ai-trade-terminal-live.ts");

test("live terminal head merge preserves shifted history and advances both cursors", () => {
  assert.equal(typeof liveTerminal.mergeAITradeTerminalHead, "function");
  const current = {
    pages: [terminalPage(100, 81, 200, 181, { eventOffset: 20, reviewOffset: 20 }), terminalPage(80, 61, 180, 161, { eventOffset: 40, reviewOffset: 40 })],
    pageParams: [{ eventOffset: 0, reviewOffset: 0 }, { eventOffset: 20, reviewOffset: 20 }]
  };
  const nextHead = terminalPage(101, 82, 201, 182, { eventOffset: 20, reviewOffset: 20 });

  const merged = liveTerminal.mergeAITradeTerminalHead(current, nextHead);
  const eventIds = merged.pages.flatMap((page) => page.events.map((event) => event.id));
  const reviewIds = merged.pages.flatMap((page) => page.reviews.map((review) => review.id));

  assert.deepEqual(eventIds, descending(101, 61));
  assert.deepEqual(reviewIds, descending(201, 161));
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.equal(new Set(reviewIds).size, reviewIds.length);
  assert.deepEqual(merged.pages.at(-1).nextPage, { eventOffset: 41, reviewOffset: 41 });
  assert.deepEqual(merged.pageParams.at(-1), { eventOffset: 40, reviewOffset: 40 });
});

test("live terminal head merge keeps exhausted streams exhausted", () => {
  const current = {
    pages: [terminalPage(20, 1, 10, 1, null)],
    pageParams: [{ eventOffset: 0, reviewOffset: 0 }]
  };
  const nextHead = terminalPage(21, 2, 11, 1, { eventOffset: 20, reviewOffset: null });

  const merged = liveTerminal.mergeAITradeTerminalHead(current, nextHead);
  assert.deepEqual(merged.pages.flatMap((page) => page.events.map((event) => event.id)), descending(21, 1));
  assert.deepEqual(merged.pages.flatMap((page) => page.reviews.map((review) => review.id)), descending(11, 1));
  assert.equal(merged.pages.at(-1).nextPage, null);
});

test("live terminal head merge drops disconnected event history and keeps its continuation", () => {
  const current = {
    pages: [terminalPage(40, 21, 10, 1, null)],
    pageParams: [{ eventOffset: 0, reviewOffset: 0 }]
  };
  const nextHead = terminalPage(61, 42, 11, 1, { eventOffset: 20, reviewOffset: null });

  const merged = liveTerminal.mergeAITradeTerminalHead(current, nextHead);
  assert.deepEqual(merged.pages.flatMap((page) => page.events.map((event) => event.id)), descending(61, 42));
  assert.deepEqual(merged.pages.flatMap((page) => page.reviews.map((review) => review.id)), descending(11, 1));
  assert.deepEqual(merged.pages.at(-1).nextPage, { eventOffset: 20, reviewOffset: null });
});

test("live terminal head merge drops disconnected review history and keeps its continuation", () => {
  const current = {
    pages: [terminalPage(10, 1, 40, 21, null)],
    pageParams: [{ eventOffset: 0, reviewOffset: 0 }]
  };
  const nextHead = terminalPage(11, 1, 61, 42, { eventOffset: null, reviewOffset: 20 });

  const merged = liveTerminal.mergeAITradeTerminalHead(current, nextHead);
  assert.deepEqual(merged.pages.flatMap((page) => page.events.map((event) => event.id)), descending(11, 1));
  assert.deepEqual(merged.pages.flatMap((page) => page.reviews.map((review) => review.id)), descending(61, 42));
  assert.deepEqual(merged.pages.at(-1).nextPage, { eventOffset: null, reviewOffset: 20 });
});

test("live terminal head merge keeps fresh continuation when the cached stream is empty", () => {
  const current = {
    pages: [{ events: [], reviews: [], nextPage: null }],
    pageParams: [{ eventOffset: 0, reviewOffset: 0 }]
  };
  const nextHead = terminalPage(20, 1, 20, 1, { eventOffset: 20, reviewOffset: 20 });

  const merged = liveTerminal.mergeAITradeTerminalHead(current, nextHead);
  assert.deepEqual(merged.pages.at(-1).nextPage, { eventOffset: 20, reviewOffset: 20 });
});

test("live terminal review merge keeps identical ids from separate review tables", () => {
  const current = {
    pages: [{
      events: [],
      reviews: [{ id: 42, source: "management_review" }],
      nextPage: null
    }],
    pageParams: [{ eventOffset: 0, reviewOffset: 0 }]
  };
  const nextHead = {
    events: [],
    reviews: [{ id: 42, source: "entry_review" }],
    nextPage: null
  };

  const merged = liveTerminal.mergeAITradeTerminalHead(current, nextHead);
  assert.deepEqual(
    merged.pages.flatMap((page) => page.reviews.map((review) => review.source)),
    ["entry_review", "management_review"]
  );
});

function terminalPage(eventStart, eventEnd, reviewStart, reviewEnd, nextPage) {
  return {
    events: descending(eventStart, eventEnd).map((id) => ({ id })),
    reviews: descending(reviewStart, reviewEnd).map((id) => ({ id })),
    nextPage
  };
}

function descending(start, end) {
  return Array.from({ length: start - end + 1 }, (_, index) => start - index);
}

function loadOptionalTsModule(relativePath) {
  let source = "";
  try {
    source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const module = { exports: {} };
  Function("exports", "module", outputText)(module.exports, module);
  return module.exports;
}
