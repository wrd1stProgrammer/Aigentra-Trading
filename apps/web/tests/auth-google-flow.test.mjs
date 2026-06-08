import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const envExample = readFileSync(new URL("../.env.local.example", import.meta.url), "utf8");

test("Google auth is wired through Auth.js App Router handlers", () => {
  assert.match(pkg.dependencies?.["next-auth"] ?? "", /^\^?5\./, "Auth.js v5 beta is expected for the App Router auth.ts pattern");
  assert.ok(existsSync(new URL("../auth.ts", import.meta.url)), "auth.ts should export Auth.js helpers");
  assert.ok(existsSync(new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url)), "Auth.js route handler should exist");

  const authSource = readFileSync(new URL("../auth.ts", import.meta.url), "utf8");
  const routeSource = readFileSync(new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url), "utf8");
  assert.match(authSource, /Google/, "Google should be the main provider");
  assert.match(authSource, /session:\s*\{\s*strategy:\s*"jwt"/s, "local QA should not require a live Neon session adapter");
  assert.match(routeSource, /export const \{ GET, POST \} = handlers/, "route should re-export Auth.js GET and POST handlers");
});

test("login surface and env contract are Google-first", () => {
  assert.ok(existsSync(new URL("../app/login/page.tsx", import.meta.url)), "login page should exist");
  assert.ok(existsSync(new URL("../components/login-page-client.tsx", import.meta.url)), "login page needs a polished client surface");
  const loginSource = readFileSync(new URL("../components/login-page-client.tsx", import.meta.url), "utf8");
  assert.match(loginSource, /signIn\("google"/, "primary login action should start Google OAuth");
  assert.match(envExample, /AUTH_SECRET=/, "Auth.js secret must be documented");
  assert.match(envExample, /AUTH_GOOGLE_ID=/, "Google OAuth client id must be documented");
  assert.match(envExample, /AUTH_GOOGLE_SECRET=/, "Google OAuth client secret must be documented");
});

test("account auth guard remains dynamic and redirects unsigned users", () => {
  const accountSource = readFileSync(new URL("../app/account/page.tsx", import.meta.url), "utf8");
  assert.match(accountSource, /export const dynamic = "force-dynamic"/, "account page should not be statically prerendered without auth env");
  assert.match(accountSource, /redirect\("\/login\?next=\/account"\)/, "unsigned users should be sent to the Google login page");
});

test("login callback path rejects protocol-relative and absolute redirects", () => {
  const { safeInternalPath } = loadTsModule("../lib/safe-redirect.ts");

  assert.equal(safeInternalPath("/account"), "/account");
  assert.equal(safeInternalPath("/leaderboard?symbol=BTCUSDT"), "/leaderboard?symbol=BTCUSDT");
  assert.equal(safeInternalPath("//evil.example"), "/account");
  assert.equal(safeInternalPath("https://evil.example/account"), "/account");
  assert.equal(safeInternalPath("javascript:alert(1)"), "/account");
});

function loadTsModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const require = (id) => {
    throw new Error(`Unexpected import while loading ${relativePath}: ${id}`);
  };
  new Function("module", "exports", "require", transpiled)(module, module.exports, require);
  return module.exports;
}
