import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

test("app shell gives leaderboard and detail pages reference-style horizontal gutters", () => {
  assert.match(source, /APP_SHELL_CONTAINER_CLASS/, "shell should centralize the content width token");
  assert.match(source, /max-w-\[1760px\]/, "content should keep a wide but bounded desktop measure");
  assert.match(source, /px-6 sm:px-8 lg:px-12 2xl:px-16/, "content should have visible side gutters across app pages");
});

test("app shell lets the root landing page own its reference-style header", () => {
  assert.ok(source.includes('const isLandingPage = pathname === "/"'), "root landing should be detected explicitly");
  assert.ok(source.includes("!isLandingPage && ("), "global app header should not render above the landing hero");
  assert.ok(source.includes('isLandingPage ? "py-0" : `${APP_SHELL_CONTAINER_CLASS} py-5 md:py-7`'), "root landing should not be wrapped in dashboard gutters");
});
