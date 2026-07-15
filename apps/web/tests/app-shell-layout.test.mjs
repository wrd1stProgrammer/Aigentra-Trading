import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const navigationPolicySource = readFileSync(new URL("../lib/app-shell-navigation.ts", import.meta.url), "utf8");

function loadAppShellNavigationPolicy() {
  const { outputText } = ts.transpileModule(navigationPolicySource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: module.exports,
    module
  });
  return module.exports;
}

const navigationPolicy = loadAppShellNavigationPolicy();

test("app shell gives leaderboard and detail pages reference-style horizontal gutters", () => {
  assert.match(source, /APP_SHELL_CONTAINER_CLASS/, "shell should centralize the content width token");
  assert.match(source, /max-w-\[1760px\]/, "content should keep a wide but bounded desktop measure");
  assert.match(source, /px-2 sm:px-6 lg:px-10 2xl:px-14/, "content should keep mobile gutters tight and expand on desktop");
});

test("app shell lets the root landing page own its reference-style header", () => {
  assert.ok(source.includes('const isLandingPage = pathname === "/"'), "root landing should be detected explicitly");
  assert.ok(source.includes("const showAppChrome ="), "global chrome visibility should be explicit");
  assert.ok(source.includes("!isLandingPage &&"), "global app header should not render above the landing hero");
  assert.ok(source.includes('isLandingPage ? "py-0" : `${APP_SHELL_CONTAINER_CLASS} min-w-0 overflow-x-clip py-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:py-7 md:pb-7`'), "root landing should not be wrapped in dashboard gutters");
});

test("app shell lets editorial pages render edge to edge without dark dashboard gutters", () => {
  assert.ok(
    source.includes('const isBlogPage = pathname === "/blog" || pathname.startsWith("/blog/")'),
    "blog index and article routes should share the public-page layout"
  );
  assert.ok(source.includes('const isLearnPage = pathname === "/learn" || pathname.startsWith("/learn/")'), "knowledge pages should share the public-page layout");
  assert.ok(source.includes('const isMethodologyPage = pathname === "/methodology"'), "methodology should share the public-page layout");
  assert.ok(source.includes("!isBlogPage &&\n    !isLearnPage &&\n    !isMethodologyPage;"), "editorial pages should not render dashboard chrome");
  assert.ok(
    source.includes('isLoginPage || isBlogPage || isLearnPage || isMethodologyPage ? "w-full max-w-none px-0 py-0"'),
    "editorial pages should not expose the dark app background around their white surface"
  );
});

test("app shell mobile nav uses a bottom tab bar without forcing body overflow", () => {
  assert.match(source, /min-h-\[100dvh\] overflow-x-clip/, "closed drawers and wide route panels should not expand the mobile layout viewport");
  assert.match(source, /APP_SHELL_CONTAINER_CLASS\} min-w-0 overflow-x-clip/, "dashboard routes should clip accidental page-level horizontal overflow");
  assert.match(source, /aria-label=\{navLabel\(locale, link\.key, t\)\}/, "icon-only mobile links still need accessible labels");
  assert.match(source, /hidden min-w-0 items-center gap-1 overflow-x-auto/, "desktop nav should stay scroll-safe at intermediate widths");
  assert.match(source, /fixed inset-x-3 bottom-\[max\(0\.75rem,env\(safe-area-inset-bottom\)\)\]/, "mobile nav should live in a thumb-reachable bottom bar");
  assert.match(source, /grid grid-cols-4 gap-1/, "mobile nav should reserve stable tap targets for the primary routes");
  assert.match(source, /md:hidden/, "mobile bottom nav should not appear on desktop");
  assert.match(source, /whitespace-nowrap/, "nav links should not wrap Korean labels one glyph per line");
  assert.match(source, /hidden md:inline/, "visual nav labels should wait for medium viewports");
});

test("app shell nav marks the clicked tab active before the next route finishes", () => {
  assert.doesNotMatch(source, /event\.preventDefault\(\)/, "shell nav should keep Next Link's native navigation path");
  assert.doesNotMatch(source, /router\.push\(href\)/, "shell nav should not replace Next Link navigation with a manual router push");
  assert.match(source, /setPendingPathname\(href\)/, "plain clicks should still mark the next tab active immediately");
  assert.equal(
    navigationPolicy.visibleShellPathname("/leaderboard", "/consensus"),
    "/consensus",
    "pending route state should win immediately for active nav feedback"
  );
  assert.equal(
    navigationPolicy.visibleShellPathname("/consensus", null),
    "/consensus",
    "actual pathname should take over after the router catches up"
  );
  assert.equal(
    navigationPolicy.isShellLinkActive("/leaderboard", "/leaderboard/atr-trail-boss"),
    true,
    "nested leaderboard routes should keep the leaderboard tab active"
  );
  assert.equal(
    navigationPolicy.isShellLinkActive("/", "/leaderboard"),
    false,
    "the home tab should only be active on the exact root path"
  );
  assert.equal(
    navigationPolicy.shouldHandleShellNavigationClick({
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false
    }),
    true,
    "plain primary clicks should use the immediate navigation path"
  );
  assert.equal(
    navigationPolicy.shouldHandleShellNavigationClick({
      defaultPrevented: false,
      button: 0,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false
    }),
    false,
    "modifier clicks should keep native browser behavior"
  );
});

test("profile drawer exposes only the official Aigentra Instagram social link", () => {
  assert.match(
    source,
    /href="https:\/\/www\.instagram\.com\/aigentra_trading\/"/,
    "official Instagram should open the Aigentra Trading profile"
  );
  assert.doesNotMatch(source, /shell\.threads/, "official Threads should be removed from the profile drawer");
  assert.doesNotMatch(source, /shell\.community/, "user community should be removed from the profile drawer");
  assert.doesNotMatch(source, /ThreadsLogo|ChatCircleText/, "removed social links should not leave unused icons behind");
});

test("profile drawer routes every user to blog and glossary without legacy account rows", () => {
  assert.match(source, /href="\/blog"/, "profile drawer should link to the blog home");
  assert.match(source, /href="\/learn"/, "profile drawer should link to the glossary home");
  assert.doesNotMatch(source, /href="\/traders"/, "team row should be removed for every access state");
  assert.doesNotMatch(source, /href="\/tests"/, "guide row should be removed for every access state");
  assert.doesNotMatch(source, /href="\/account"[\s\S]*shell\.myPage/, "My Page should be removed from the drawer");
  assert.doesNotMatch(source, /access\.proDetail/, "Pro explanation should be removed below the active badge");
});
