import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("light theme uses a cool gray app background with white elevated surfaces", () => {
  assert.match(source, /--app-bg: #f3f4f6;/, "light app background should be neutral gray");
  assert.match(source, /--app-bg-subtle: #eef0f3;/, "light top wash should stay cool gray");
  assert.match(source, /--surface: #ffffff;/, "floating components should sit on white surfaces");
  assert.match(source, /--surface-raised: #ffffff;/, "raised surfaces should stay white in light mode");
  assert.doesNotMatch(source, /--app-bg: #f6f7f4;/, "light background should not use the old green-tinted gray");
});
