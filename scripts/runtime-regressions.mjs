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

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYWRIGHT_CLI_PACKAGE = "@playwright/cli@0.1.17";
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

async function drivePointerStates(page) {
  let stage = "";
  while (stage !== "done") {
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
    } else if (stage === "active-ready") {
      await page.locator(".cornerfill-auto-active").hover();
      await page.mouse.down();
      stage = "active-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "active-driven"; });
    } else if (stage === "active-release") {
      await page.mouse.up();
      stage = "active-released";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "active-released"; });
    } else if (stage === "media-dark-ready") {
      await page.emulateMedia({ colorScheme: "dark" });
      stage = "media-dark-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "media-dark-driven"; });
    } else if (stage === "media-light-ready") {
      await page.emulateMedia({ colorScheme: "light" });
      stage = "media-light-driven";
      await page.evaluate(() => { globalThis.__CORNERFILL_POINTER_DRIVER__.stage = "media-light-driven"; });
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
try {
  for (const browserName of selected) {
    const session = `cornerfill-runtime-${process.pid}-${browserName}`;
    const backend = browserName === "chrome" ? "static-data-url" : browserName === "webkit" ? "webkit-canvas" : "moz-element";
    console.log(`runtime regressions: launch exact ${session}`);
    const browserType = browserName === "chrome" ? playwright.chromium : playwright[browserName];
    let browser = null;
    let context = null;
    const errors = [];
    try {
      browser = await browserType.launch({ headless: true });
      context = await browser.newContext({ viewport: { width: 800, height: 600 } });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(new Error(message.text()));
      });
      await page.goto(`${server.origin}/bench/runtime-regression.html?backend=${backend}&drivePointer=1`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await drivePointerStates(page);
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
    } finally {
      if (context) await context.close();
      if (browser) {
        await browser.close();
        if (browser.isConnected()) throw new Error(`exact session ${session} remained connected`);
      }
    }
  }
} finally {
  await server.close();
}
writeFileSync(join(out, "manifest.json"), `${JSON.stringify({
  schema: "cornerfill-runtime-browser-regression-run@2",
  status: "COMPLETE",
  playwrightCliPackage: PLAYWRIGHT_CLI_PACKAGE,
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
