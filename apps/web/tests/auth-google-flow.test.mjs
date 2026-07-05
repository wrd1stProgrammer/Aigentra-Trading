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
  assert.match(authSource, /Credentials/, "email login should use the Auth.js Credentials provider");
  assert.match(authSource, /verifyPasswordAccount/, "Credentials authorize should verify password accounts through the backend");
  assert.match(authSource, /session:\s*\{\s*strategy:\s*"jwt"/s, "local QA should not require a live Neon session adapter");
  assert.match(routeSource, /export const \{ GET, POST \} = handlers/, "route should re-export Auth.js GET and POST handlers");
});

test("login surface and env contract support Google and email credentials", () => {
  assert.ok(existsSync(new URL("../app/login/page.tsx", import.meta.url)), "login page should exist");
  assert.ok(existsSync(new URL("../components/login-page-client.tsx", import.meta.url)), "login page needs a polished client surface");
  assert.ok(existsSync(new URL("../app/api/auth/signup/route.ts", import.meta.url)), "email signup should have a server route");
  const loginSource = readFileSync(new URL("../components/login-page-client.tsx", import.meta.url), "utf8");
  const loginPageSource = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  const signupRouteSource = readFileSync(new URL("../app/api/auth/signup/route.ts", import.meta.url), "utf8");
  assert.match(loginSource, /signIn\("google"/, "primary login action should start Google OAuth");
  assert.match(loginSource, /signIn\("credentials"/, "email login and post-signup login should create an Auth.js session");
  assert.match(loginSource, /fetch\("\/api\/auth\/signup"/, "signup form should call the server-side signup route");
  assert.match(loginSource, /window\.location\.assign\(safeInternalPath/, "post-credentials auth should hard-navigate so the dashboard starts with a fresh session");
  assert.doesNotMatch(loginSource, /router\.refresh\(\)/, "post-login navigation should not refresh during an App Router transition");
  assert.match(loginSource, /const signupBlocked =/, "signup blocked state should be modeled explicitly");
  assert.match(loginSource, /termsAccepted;/, "signup submit should require accepted terms");
  assert.match(loginSource, /disabled=\{submitting \|\| !credentialsConfigured\}[\s\S]*?\{submitting \? text\.submitting : text\.signinSubmit\}/, "signin button should not depend on signup terms");
  assert.match(loginSource, /disabled=\{submitting \|\| signupBlocked\}[\s\S]*?\{submitting \? text\.submitting : text\.signupSubmit\}/, "signup button should stay disabled until terms are accepted");
  assert.match(loginSource, /aria-label=\{locale === "ko" \? "홈으로 돌아가기" : "Back home"\}/, "top-left home affordance should be icon-only with an accessible label");
  assert.doesNotMatch(loginSource, /Aigentra Trading으로 돌아가기|Back to Aigentra Trading/, "top-left home affordance should not show text copy");
  assert.doesNotMatch(loginSource, /demoNotice|mocked|데모 모드/, "email auth should no longer be a demo alert");
  assert.match(loginPageSource, /safeInternalPath\(nextValue, "\/leaderboard"\)/, "login should default successful auth back to leaderboard");
  assert.match(signupRouteSource, /createPasswordAccount/, "signup route should create a backend password account");
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
