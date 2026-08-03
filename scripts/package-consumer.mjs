#!/usr/bin/env node
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closePlaywrightSession, runWithCleanup } from "./run-with-cleanup.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "cornerfill-package-"));
const consumerRoot = join(temporaryRoot, "consumer");
const require = createRequire(import.meta.url);

function run(command, args, cwd = projectRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(" ")} failed with ${result.status ?? result.signal}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

function within(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function browserImport() {
  const playwrightPath = require.resolve("playwright");
  const playwrightModule = await import(pathToFileURL(playwrightPath).href);
  const playwright = playwrightModule.default ?? playwrightModule;
  const packageRoot = join(consumerRoot, "node_modules", "cornerfill");
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <script type="importmap">{"imports":{"cornerfill":"/package/dist/auto.mjs"}}</script>
        <script type="module">
          try {
            const { default: cornerfill } = await import("cornerfill");
            const report = await cornerfill?.ready;
            globalThis.__cornerfillPackage = {
              controller: Boolean(cornerfill),
              fallbackLoaded: report?.fallbackLoaded,
              mode: report?.mode,
            };
            document.documentElement.dataset.packageTest = "pass";
          } catch (error) {
            globalThis.__cornerfillPackageError = error?.stack ?? String(error);
            document.documentElement.dataset.packageTest = "fail";
          }
        </script>`);
      return;
    }
    const path = resolve(packageRoot, decodeURIComponent(url.pathname.slice("/package/".length)));
    if (!url.pathname.startsWith("/package/") || !within(packageRoot, path)) {
      response.writeHead(404).end();
      return;
    }
    try {
      if (!statSync(path).isFile()) throw new Error("not a file");
      const type = extname(path) === ".mjs" ? "text/javascript; charset=utf-8" : "application/octet-stream";
      response.writeHead(200, { "cache-control": "no-store", "content-type": type });
      response.end(readFileSync(path));
    } catch {
      response.writeHead(404).end();
    }
  });
  let browser = null;
  let context = null;
  await runWithCleanup(async () => {
    await new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await playwright.chromium.launch({ headless: true });
    context = await browser.newContext();
    const page = await context.newPage();
    const requested = [];
    page.on("request", (request) => requested.push(request.url()));
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.packageTest !== undefined,
      null,
      { timeout: 30_000 },
    );
    const status = await page.evaluate(() => ({
      error: globalThis.__cornerfillPackageError ?? null,
      result: globalThis.__cornerfillPackage ?? null,
      status: document.documentElement.dataset.packageTest,
    }));
    if (status.status !== "pass") throw new Error(`packed browser import failed: ${status.error}`);
    if (status.result?.mode !== "native" || status.result?.fallbackLoaded !== false) {
      throw new Error(`packed browser root did not select the qualified native path: ${JSON.stringify(status.result)}`);
    }
    if (requested.some((url) => /\/(?:auto-runtime|runtime)\.mjs(?:$|\?)/u.test(url))) {
      throw new Error("packed native browser import loaded fallback runtime modules");
    }
  }, [
    () => closePlaywrightSession(context, browser, "packed-consumer Chromium session"),
    () => server.listening && new Promise((resolvePromise, reject) => server.close((error) => (
      error ? reject(error) : resolvePromise()
    ))),
  ], "packed browser import and cleanup failed");
}

await runWithCleanup(async () => {
  mkdirSync(consumerRoot);
  const pack = JSON.parse(run("npm", [
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    temporaryRoot,
  ]));
  const archive = join(temporaryRoot, pack[0].filename);
  writeFileSync(join(consumerRoot, "package.json"), `${JSON.stringify({
    name: "cornerfill-packed-consumer",
    private: true,
    type: "module",
  }, null, 2)}\n`);
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--no-package-lock",
    archive,
  ], consumerRoot);
  writeFileSync(join(consumerRoot, "node-consumer.mjs"), `
    import assert from "node:assert/strict";
    const root = await import("cornerfill");
    assert.equal(root.default, null);
    assert.equal(root.cornerfill, null);
    for (const specifier of [
      "cornerfill/auto",
      "cornerfill/runtime",
      "cornerfill/geometry",
      "cornerfill/values",
      "cornerfill/spec",
    ]) await import(specifier);
  `);
  run(process.execPath, ["node-consumer.mjs"], consumerRoot);
  writeFileSync(join(consumerRoot, "index.mts"), `
    import cornerfill from "cornerfill";
    import { installCornerfillAuto } from "cornerfill/auto";
    import { installCornerfill } from "cornerfill/runtime";
    import { buildCornerGeometry } from "cornerfill/geometry";
    import { parseCornerShape } from "cornerfill/values";
    import { CORNERFILL_SPEC_REVISION } from "cornerfill/spec";
    void [cornerfill, installCornerfillAuto, installCornerfill, buildCornerGeometry,
      parseCornerShape, CORNERFILL_SPEC_REVISION];
  `);
  writeFileSync(join(consumerRoot, "tsconfig.json"), `${JSON.stringify({
    compilerOptions: {
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      strict: true,
      target: "ES2022",
    },
    files: ["index.mts"],
  }, null, 2)}\n`);
  run(process.execPath, [join(projectRoot, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], consumerRoot);
  await browserImport();
  console.log(`packed consumer: PASS ${pack[0].filename}`);
}, [
  () => rmSync(temporaryRoot, { force: true, recursive: true }),
], "packed consumer test and cleanup failed");
