#!/usr/bin/env node
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
});

function locatePlaywrightModule() {
  const explicit = process.env.CORNERFILL_PLAYWRIGHT_MODULE;
  if (explicit) return resolve(explicit);
  const lookup = spawnSync(
    "npx",
    ["--yes", "--package", "@playwright/cli", "sh", "-c", "command -v playwright-cli"],
    { encoding: "utf8" },
  );
  if (lookup.status !== 0 || !lookup.stdout.trim()) throw new Error("Playwright is unavailable");
  return join(resolve(dirname(lookup.stdout.trim()), ".."), "playwright", "index.mjs");
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

const selected = browsers(process.argv.slice(2));
const out = join(PROJECT_ROOT, "output", "playwright", "runtime-hardening", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(out, { recursive: true });
const playwright = await import(pathToFileURL(locatePlaywrightModule()).href);
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
      await page.goto(`${server.origin}/bench/runtime-regression.html?backend=${backend}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.waitForFunction(() => (
        document.documentElement.dataset.runtimeRegressions !== undefined
      ), null, { timeout: 120_000 });
      const status = await page.locator("#status").textContent();
      if (await page.locator("html[data-runtime-regressions='fail']").count() > 0) {
        throw new Error(`${browserName} runtime regression failed: ${status}`);
      }
      if (errors.length > 0) throw new AggregateError(errors, `${browserName} emitted runtime errors`);
      const report = await page.evaluate(() => globalThis.__CORNERFILL_RUNTIME_REGRESSIONS__);
      reports.push(Object.freeze({ browser: browserName, session, report }));
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
  schema: "cornerfill-runtime-browser-regression-run@1",
  status: "COMPLETE",
  browsers: selected,
  reports: reports.map(({ browser, session, report }) => ({
    browser,
    session,
    tests: report.tests.length,
    failures: report.tests.filter(({ status }) => status !== "PASS").length,
    artifact: relative(out, join(out, `${browser}.json`)),
  })),
}, null, 2)}\n`);
console.log(`runtime regressions: COMPLETE ${out}`);
