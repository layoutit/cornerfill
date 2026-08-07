#!/usr/bin/env node
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import postcss from "postcss";
import cornerfillPostcss from "../dist/postcss.mjs";
import { closePlaywrightSession, runWithCleanup } from "./run-with-cleanup.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYWRIGHT_PACKAGE = `playwright@${JSON.parse(
  readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"),
).devDependencies.playwright}`;
const require = createRequire(import.meta.url);

function moduleFiles(directory, extension) {
  return readdirSync(join(PROJECT_ROOT, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => `${directory}/${entry.name}`);
}

const SOURCE_FILES = Object.freeze([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.types.json",
  "README.md",
  "bench/runtime-regression.html",
  "bench/runtime-regression.mjs",
  "bench/imports/child.css",
  "bench/imports/grandchild.css",
  "bench/imports/root.css",
  "bench/imports/unsafe-semantics.css",
  "bench/imports/unsafe-supports.css",
  "scripts/run-with-cleanup.mjs",
  "scripts/runtime-regressions.mjs",
  ...moduleFiles("src", ".mts"),
  ...moduleFiles("dist", ".mjs"),
].sort());
const MIME = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
});
const COMPILED_FIXTURE_CSS = (await postcss([cornerfillPostcss()]).process(`
  .cornerfill-compiled-fixture {
    width: 36px;
    height: 28px;
    border-radius: 14px;
    corner-shape: bevel;
    background: rgb(220, 40, 40);
  }
  .cornerfill-compiled-reset {
    all: unset;
    display: block;
    width: 36px;
    height: 28px;
    border-radius: 14px;
    background: rgb(220, 40, 40);
  }
  .cornerfill-compiled-important-shape { corner-shape: bevel !important; }
  .cornerfill-compiled-important-reset {
    all: unset !important;
    display: block !important;
    width: 36px !important;
    height: 28px !important;
    border-radius: 14px !important;
    background: rgb(220, 40, 40) !important;
  }
  .cornerfill-compiled-round { corner-shape: initial; }
  .cornerfill-compiled-fixture.cornerfill-compiled-scoop { corner-shape: scoop; }
  .cornerfill-compiled-logical { corner-start-start-shape: scoop; }
  .cornerfill-compiled-variable-reset {
    --compiled-reset: unset;
    all: var(--compiled-reset);
    display: block;
    width: 36px;
    height: 28px;
    border-radius: 14px;
    background: rgb(220, 40, 40);
  }
  .cornerfill-compiled-parent,
  .cornerfill-compiled-child,
  .cornerfill-compiled-layer {
    display: block;
    width: 36px;
    height: 28px;
    border-radius: 14px;
    background: rgb(220, 40, 40);
  }
  .cornerfill-compiled-parent { corner-shape: scoop; }
  .cornerfill-compiled-child { corner-shape: inherit; }
  .cornerfill-compiled-child-reset { corner-shape: unset; }
  @layer cornerfill-compiled-base, cornerfill-compiled-override;
  @layer cornerfill-compiled-base {
    .cornerfill-compiled-layer { corner-shape: bevel; }
  }
  @layer cornerfill-compiled-override {
    .cornerfill-compiled-layer { corner-shape: initial; }
    .cornerfill-compiled-layer.cornerfill-compiled-revert { corner-shape: revert-layer; }
  }
  .cornerfill-compiled-supports {
    display: block;
    width: 36px;
    height: 28px;
    border-radius: 14px;
    background: rgb(220, 40, 40);
  }
  @supports (corner-shape: bevel) {
    .cornerfill-compiled-supports {
      corner-shape: bevel;
      color: rgb(1, 2, 3);
      --cornerfill-compiled-branch: positive;
    }
  }
  @supports not (corner-shape: bevel) {
    .cornerfill-compiled-supports {
      color: rgb(4, 5, 6);
      --cornerfill-compiled-branch: negative;
    }
  }
  @supports ((corner-shape: scoop) and (display: grid)) {
    .cornerfill-compiled-supports { --cornerfill-compiled-mixed: active; }
  }
  @supports not ((corner-shape: notch) and (display: __cornerfill_invalid__)) {
    .cornerfill-compiled-supports { --cornerfill-compiled-nested: active; }
  }
  @supports (corner-shape: superellipse(pow(2, 2))) {
    .cornerfill-compiled-supports { --cornerfill-compiled-native-test: active; }
  }
  @supports not (corner-shape: superellipse(pow(2, 2))) {
    .cornerfill-compiled-supports { --cornerfill-compiled-native-test: inactive; }
  }
  .cornerfill-compiled-dynamic,
  .cornerfill-compiled-hover,
  .cornerfill-compiled-media,
  .cornerfill-compiled-cross-file,
  .cornerfill-compiled-conditional,
  .cornerfill-compiled-scoped,
  .cornerfill-compiled-hover-face,
  .cornerfill-compiled-language,
  .cornerfill-compiled-direction,
  .cornerfill-compiled-disabled,
  .cornerfill-compiled-variable-shape {
    display: block;
    width: 36px;
    height: 28px;
    border-radius: 14px;
    background: rgb(220, 40, 40);
  }
  .cornerfill-compiled-dynamic.active { corner-shape: bevel; }
  .cornerfill-compiled-dynamic[data-compiled-shape="on"] { corner-shape: scoop; }
  #cornerfill-compiled-dynamic-id { corner-shape: notch; }
  .cornerfill-compiled-hover:hover { corner-shape: bevel; }
  @media (prefers-color-scheme: dark) {
    .cornerfill-compiled-media { corner-shape: bevel; }
  }
  .cornerfill-compiled-cross-file {
    corner-shape: bevel;
    background: var(--cornerfill-compiled-cross-color, rgb(220, 40, 40));
  }
  @scope ([data-cornerfill-compiled-scope]) {
    .cornerfill-compiled-scoped { corner-shape: scoop; }
  }
  .cornerfill-compiled-hover-card:hover .cornerfill-compiled-hover-face {
    corner-shape: bevel;
    background: rgb(20, 40, 220);
  }
  .cornerfill-compiled-language:lang(fr) { corner-shape: scoop; }
  .cornerfill-compiled-direction:dir(rtl) { corner-shape: notch; }
  .cornerfill-compiled-disabled { appearance: none; border: 0; }
  .cornerfill-compiled-disabled:disabled { corner-shape: bevel; }
  .cornerfill-compiled-variable-shape {
    corner-shape: var(--cornerfill-compiled-dynamic-shape);
  }
  .cornerfill-compiled-shared-host { corner-shape: bevel; }
  @media print { * { corner-shape: bevel; } }
`, { from: "compiled-fixture.css" })).css;
const COMPILED_SHADOW_FIXTURE_CSS = (await postcss([cornerfillPostcss()]).process(`
  .cornerfill-compiled-shadow,
  .cornerfill-compiled-shadow-host-child,
  .cornerfill-compiled-shadow-context {
    display: block;
    width: 36px;
    height: 28px;
    border-radius: 14px;
    background: rgb(220, 40, 40);
  }
  .cornerfill-compiled-shadow { corner-shape: bevel; }
  :host { corner-shape: notch; }
  :host(.cornerfill-compiled-shadow-active) .cornerfill-compiled-shadow-host-child {
    corner-shape: scoop;
  }
  :host-context(.cornerfill-compiled-shadow-theme) .cornerfill-compiled-shadow-context {
    corner-shape: bevel;
  }
`, { from: "compiled-shadow-fixture.css" })).css;
const COMPILED_SHADOW_RESET_CSS = (await postcss([cornerfillPostcss()]).process(`
  .cornerfill-compiled-shadow { corner-shape: initial; }
`, { from: "compiled-shadow-reset.css" })).css;
const COMPILED_PAINT_METADATA_CSS = (await postcss([cornerfillPostcss()]).process(`
  @media (prefers-color-scheme: dark) {
    .cornerfill-compiled-cross-file:hover,
    .cornerfill-compiled-cross-file {
      --cornerfill-compiled-cross-color: rgb(20, 40, 220);
    }
  }
`, { from: "compiled-paint-metadata.css" })).css;
const COMPILED_CONDITIONAL_FIXTURE_CSS = (await postcss([cornerfillPostcss()]).process(`
  .cornerfill-compiled-conditional { corner-shape: bevel; }
`, { from: "compiled-conditional-fixture.css" })).css;
const COMPILED_BUDGET_FIXTURE_CSS = (await postcss([cornerfillPostcss()]).process(`
  .cornerfill-compiled-budget-real { corner-shape: bevel; }
  .cornerfill-compiled-budget-round { corner-shape: round; }
  @media print { * { corner-shape: bevel; } }
`, { from: "compiled-budget-fixture.css" })).css;

function locatePlaywrightModule() {
  const explicit = process.env.CORNERFILL_PLAYWRIGHT_MODULE;
  if (explicit) return resolve(explicit);
  try {
    return require.resolve("playwright");
  } catch {
    throw new Error("Playwright is unavailable; run npm install");
  }
}

function sourceIdentity(path) {
  const bytes = readFileSync(path);
  return Object.freeze({
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

function browsers(argv) {
  const option = argv.find((value) => value.startsWith("--browsers="));
  const values = (option?.slice("--browsers=".length) ?? "chrome,webkit,firefox").split(",");
  for (const value of values) {
    if (!new Set(["chrome", "webkit", "firefox"]).has(value)) throw new TypeError(`unknown browser: ${value}`);
  }
  return values;
}

function within(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/bench/compiled-fixture.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(COMPILED_FIXTURE_CSS);
      return;
    }
    if (url.pathname === "/bench/compiled-shadow-fixture.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(COMPILED_SHADOW_FIXTURE_CSS);
      return;
    }
    if (url.pathname === "/bench/compiled-shadow-reset.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(COMPILED_SHADOW_RESET_CSS);
      return;
    }
    if (url.pathname === "/bench/compiled-paint-metadata.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(COMPILED_PAINT_METADATA_CSS);
      return;
    }
    if (url.pathname === "/bench/compiled-conditional-fixture.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(COMPILED_CONDITIONAL_FIXTURE_CSS);
      return;
    }
    if (url.pathname === "/bench/compiled-budget-fixture.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(COMPILED_BUDGET_FIXTURE_CSS);
      return;
    }
    if (url.pathname === "/bench/imports/delayed-runtime.css") {
      const css = url.searchParams.get("css") ?? "";
      const browserStyleRequest = request.headers["sec-fetch-dest"] === "style"
        || request.headers["sec-fetch-mode"] === "no-cors";
      const delay = browserStyleRequest ? Number(url.searchParams.get("delay") ?? 0) : 0;
      setTimeout(() => {
        response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
        response.end(css);
      }, Number.isFinite(delay) && delay > 0 ? delay : 0);
      return;
    }
    if (url.pathname === "/bench/imports/redirect-root.css") {
      response.writeHead(302, {
        "cache-control": "no-store",
        location: "/bench/redirect-target/root.css",
      });
      response.end();
      return;
    }
    if (url.pathname === "/bench/redirect-target/root.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end("/* redirected stylesheet root */");
      return;
    }
    if (url.pathname === "/bench/redirect-target/child.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(".cornerfill-redirect-relative{corner-shape:bevel;border-radius:5px;background:red}");
      return;
    }
    if (url.pathname === "/bench/alternate-target/child.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(".cornerfill-redirect-relative{corner-shape:scoop;border-radius:5px;background:red}");
      return;
    }
    if (/^\/cornerfill-shadow-base-[ab]\/theme\.css$/u.test(url.pathname)) {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(".cornerfill-shadow-base{corner-shape:bevel}");
      return;
    }
    if (url.pathname === "/bench/imports/conditional-root.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(`
        @import "/bench/imports/conditional-skipped.css" supports(display: __cornerfill_impossible__);
        @import "/bench/imports/conditional-media-skipped.css" (max-width: 1px);
        @import "/bench/imports/conditional-active.css" supports(corner-shape: bevel);
        .cornerfill-import-condition-local { corner-shape: bevel }
      `);
      return;
    }
    if (url.pathname === "/bench/imports/conditional-active.css"
      || url.pathname === "/bench/imports/conditional-skipped.css"
      || url.pathname === "/bench/imports/conditional-media-skipped.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(url.pathname.endsWith("active.css")
        ? ".cornerfill-import-condition-active{corner-shape:scoop}"
        : ".cornerfill-import-condition-skipped{corner-shape:notch}");
      return;
    }
    if (url.pathname === "/bench/imports/escaped-control-child.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(".cornerfill-escaped-import{corner-shape:scoop}");
      return;
    }
    if (url.pathname === "/bench/imports/nested-support-child.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(".cornerfill-nested-support-import{corner-shape:scoop}");
      return;
    }
    if (url.pathname === "/bench/imports/escaped-strict-child.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end(".cornerfill-escaped-strict-import{corner-shape:bevel;display:none}");
      return;
    }
    if (url.pathname === "/cornerfill-invalid-bare.css") {
      response.writeHead(200, { "cache-control": "no-store", "content-type": "text/css; charset=utf-8" });
      response.end("");
      return;
    }
    const path = resolve(PROJECT_ROOT, decodeURIComponent(url.pathname.slice(1)));
    if (!within(PROJECT_ROOT, path) || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": MIME[extname(path)] ?? "application/octet-stream",
    });
    createReadStream(path).pipe(response);
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

async function driveBrowserStates(page) {
  let stage = "";
  while (true) {
    await page.waitForFunction((previous) => {
      if (document.documentElement.dataset.runtimeRegressions !== undefined) return true;
      const current = globalThis.__CORNERFILL_POINTER_DRIVER__?.stage;
      return Boolean(current && current !== previous);
    }, stage, { timeout: 120_000 });
    if (await page.locator("html[data-runtime-regressions]").count() > 0) return;
    stage = await page.evaluate(() => globalThis.__CORNERFILL_POINTER_DRIVER__?.stage ?? "");
    if (stage === "hover-ready") {
      await page.locator(".cornerfill-auto-hover").hover();
      stage = "hover-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "hover-driven"; });
    } else if (stage === "compiled-hover-ready") {
      await page.locator(".cornerfill-compiled-hover").hover();
      stage = "compiled-hover-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "compiled-hover-driven"; });
    } else if (stage === "compiled-hover-out-ready") {
      await page.locator("#status").hover({ force: true });
      stage = "compiled-hover-out-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "compiled-hover-out-driven"; });
    } else if (stage === "compiled-ancestor-hover-ready") {
      await page.locator(".cornerfill-compiled-hover-trigger").hover();
      stage = "compiled-ancestor-hover-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "compiled-ancestor-hover-driven"; });
    } else if (stage === "compiled-ancestor-hover-out-ready") {
      await page.locator("#status").hover({ force: true });
      stage = "compiled-ancestor-hover-out-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "compiled-ancestor-hover-out-driven"; });
    } else if (stage === "media-dark-ready") {
      await page.emulateMedia({ colorScheme: "dark" });
      stage = "media-dark-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "media-dark-driven"; });
    } else if (stage === "media-light-ready") {
      await page.emulateMedia({ colorScheme: "light" });
      stage = "media-light-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "media-light-driven"; });
    } else if (stage === "compiled-media-dark-ready") {
      await page.emulateMedia({ colorScheme: "dark" });
      stage = "compiled-media-dark-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "compiled-media-dark-driven"; });
    } else if (stage === "compiled-media-light-ready") {
      await page.emulateMedia({ colorScheme: "light" });
      stage = "compiled-media-light-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "compiled-media-light-driven"; });
    } else if (/^keyboard-tab-\d+-ready$/u.test(stage)) {
      await page.keyboard.press("Tab");
      const driven = stage.replace(/-ready$/u, "-driven");
      stage = driven;
      await page.evaluate((value) => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = value; }, driven);
    }
  }
}

const selected = browsers(process.argv.slice(2));
const out = join(PROJECT_ROOT, "output", "playwright", "runtime-hardening", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(out, { recursive: true });
const playwrightModule = await import(pathToFileURL(locatePlaywrightModule()).href);
const playwright = playwrightModule.default ?? playwrightModule;
const server = await startServer();
const reports = [];
await runWithCleanup(async () => {
  for (const browserName of selected) {
    const session = `cornerfill-runtime-${process.pid}-${browserName}`;
    const backend = browserName === "chrome" ? "static-data-url" : browserName === "webkit" ? "webkit-canvas" : "moz-element";
    console.log(`runtime regressions: launch exact ${session}`);
    const browserType = browserName === "chrome" ? playwright.chromium : playwright[browserName];
    let browser = null;
    let context = null;
    const errors = [];
    await runWithCleanup(async () => {
      browser = await browserType.launch({ headless: true });
      context = await browser.newContext({ viewport: { width: 800, height: 600 } });
      const page = await context.newPage();
      page.on("pageerror", (error) => {
        errors.push(error);
        void page.evaluate((message) => {
          document.querySelector("#status").textContent = message;
          document.documentElement.dataset.runtimeRegressions = "fail";
        }, error.message).catch(() => undefined);
      });
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(new Error(message.text()));
      });
      await page.goto(`${server.origin}/bench/runtime-regression.html?backend=${backend}&drivePointer=1`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await driveBrowserStates(page);
      await page.waitForFunction(() => (
        document.documentElement.dataset.runtimeRegressions !== undefined
      ), null, { timeout: 120_000 });
      const status = await page.locator("#status").textContent();
      if (await page.locator("html[data-runtime-regressions='fail']").count() > 0) {
        throw new Error(`${browserName} runtime regression failed: ${status}`);
      }
      if (errors.length > 0) throw new AggregateError(errors, `${browserName} emitted runtime errors`);
      const report = await page.evaluate(() => globalThis.__CORNERFILL_RUNTIME_REGRESSIONS__);
      reports.push(Object.freeze({ browser: browserName, session, version: browser.version(), report }));
      writeFileSync(join(out, `${browserName}.json`), `${JSON.stringify(report, null, 2)}\n`);
    }, [
      () => closePlaywrightSession(context, browser, `exact session ${session}`),
    ], `${browserName} runtime regression and cleanup failed`);
  }
}, [
  () => server.close(),
], "runtime regression run and server cleanup failed");
writeFileSync(join(out, "manifest.json"), `${JSON.stringify({
  schema: "cornerfill-runtime-browser-regression-run@2",
  status: "COMPLETE",
  playwrightPackage: PLAYWRIGHT_PACKAGE,
  sources: Object.fromEntries(SOURCE_FILES.map((path) => [
    path,
    sourceIdentity(join(PROJECT_ROOT, path)),
  ])),
  browsers: selected,
  reports: reports.map(({ browser, session, version, report }) => ({
    browser,
    version,
    session,
    tests: report.tests.length,
    failures: report.tests.filter(({ status }) => status !== "PASS").length,
    artifact: relative(out, join(out, `${browser}.json`)),
  })),
}, null, 2)}\n`);
console.log(`runtime regressions: COMPLETE ${out}`);
