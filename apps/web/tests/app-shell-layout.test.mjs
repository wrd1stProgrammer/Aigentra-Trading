import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

test("app shell gives leaderboard and detail pages reference-style horizontal gutters", () => {
  assert.match(source, /APP_SHELL_CONTAINER_CLASS/, "shell should centralize the content width token");
  assert.match(source, /max-w-\[1760px\]/, "content should keep a wide but bounded desktop measure");
  assert.match(source, /px-4 sm:px-6 lg:px-10 2xl:px-14/, "content should keep mobile gutters compact and expand on desktop");
});

test("app shell lets the root landing page own its reference-style header", () => {
  assert.ok(source.includes('const isLandingPage = pathname === "/"'), "root landing should be detected explicitly");
  assert.ok(source.includes("!isLandingPage && ("), "global app header should not render above the landing hero");
  assert.ok(source.includes('isLandingPage ? "py-0" : `${APP_SHELL_CONTAINER_CLASS} py-5 md:py-7`'), "root landing should not be wrapped in dashboard gutters");
});

test("app shell mobile nav keeps labels from wrapping inside trader detail", () => {
  assert.match(source, /aria-label=\{navLabel\(locale, link\.key, t\)\}/, "icon-only mobile links still need accessible labels");
  assert.match(source, /overflow-x-auto/, "mobile nav should scroll instead of forcing body overflow");
  assert.match(source, /max-w-\[calc\(100vw-9rem\)\]/, "mobile nav should reserve room for language and account controls");
  assert.match(source, /whitespace-nowrap/, "nav links should not wrap Korean labels one glyph per line");
  assert.match(source, /hidden md:inline/, "visual nav labels should wait for medium viewports");
});
