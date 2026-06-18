import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("global responsive media rule does not constrain chart canvases", () => {
  assert.match(source, /img,\s*svg,\s*video\s*\{\s*max-width:\s*100%;\s*\}/s, "images, SVGs, and videos should keep responsive bounds");
  assert.doesNotMatch(source, /canvas,\s*video\s*\{\s*max-width:\s*100%;/s, "chart canvases should keep library-computed dimensions");
});
