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
  const compiledCss = readFileSync(join(consumerRoot, "compiled.css"), "utf8");
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
        <style>${compiledCss}</style>
        <div id="fixture"></div>
        <script type="importmap">{"imports":{"cornerfill":"/package/dist/index.mjs"}}</script>
        <script type="module">
          try {
            const cornerfill = (await import("cornerfill")).default;
            const report = await cornerfill?.ready;
            const entry = cornerfill?.explain(document.querySelector("#fixture"));
            const rawStyle = document.createElement("style");
            rawStyle.textContent = "#unprocessed{width:20px;height:16px;border-radius:8px;corner-shape:bevel;background:red}";
            const unprocessed = document.createElement("div");
            unprocessed.id = "unprocessed";
            document.head.append(rawStyle);
            document.body.append(unprocessed);
            await cornerfill?.refresh();
            globalThis.__cornerfillPackage = {
              controller: Boolean(cornerfill),
              entryBackend: entry?.backend ?? null,
              entryStatus: entry?.status ?? null,
              fallbackLoaded: report?.fallbackLoaded,
              mode: report?.mode,
              unprocessedEntry: cornerfill?.explain(unprocessed) ?? null,
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
  await runWithCleanup(async () => {
    await new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    for (const [name, browserType, expectedMode, expectedBackend] of [
      ["Chromium", playwright.chromium, "native", null],
      ["WebKit", playwright.webkit, "compiled", "webkit-canvas"],
      ["Firefox", playwright.firefox, "compiled", "moz-element"],
    ]) {
      let browser = null;
      let context = null;
      await runWithCleanup(async () => {
        browser = await browserType.launch({ headless: true });
        context = await browser.newContext();
        const page = await context.newPage();
        const requested = [];
        page.on("request", (request) => requested.push(request.url()));
        await page.goto(origin, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
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
        if (status.status !== "pass") throw new Error(`${name} packed browser import failed: ${status.error}`);
        if (status.result?.mode !== expectedMode || (expectedMode === "native") !== (status.result?.fallbackLoaded === false)) {
          throw new Error(`${name} packed browser root selected the wrong path: ${JSON.stringify(status.result)}`);
        }
        if (expectedBackend && (status.result?.entryStatus !== "active" || status.result?.entryBackend !== expectedBackend)) {
          throw new Error(`${name} packed fallback did not paint the fixture: ${JSON.stringify(status.result)}`);
        }
        if (status.result?.unprocessedEntry !== null) {
          throw new Error(`${name} packed root silently claimed unprocessed CSS`);
        }
        const fallbackRequested = requested.some((url) => /\/(?:compiled-runtime|runtime)\.mjs(?:$|\?)/u.test(url));
        if ((expectedMode === "compiled") !== fallbackRequested) {
          throw new Error(`${name} packed browser loaded the wrong module closure`);
        }
        if (requested.some((url) => /\/(?:auto-runtime|postcss)\.mjs(?:$|\?)/u.test(url))) {
          throw new Error(`${name} packed browser loaded automatic or Node-only compiler code`);
        }
      }, [
        () => closePlaywrightSession(context, browser, `packed-consumer ${name} session`),
      ], `${name} packed browser import and cleanup failed`);
    }
  }, [
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
  writeFileSync(join(consumerRoot, "compile-css.mjs"), `
    import { writeFileSync } from "node:fs";
    import postcss from "postcss";
    import cornerfillPostcss from "cornerfill/postcss";
    const input = "#fixture{width:120px;height:100px;border-radius:50% 50% 0 0 / 100% 100% 0 0;corner-shape:bevel bevel round round;background:#f05a47}";
    const result = await postcss([cornerfillPostcss()]).process(input, { from: "consumer.css" });
    writeFileSync(new URL("./compiled.css", import.meta.url), result.css);
  `);
  run(process.execPath, ["compile-css.mjs"], consumerRoot);
  writeFileSync(join(consumerRoot, "node-consumer.mjs"), `
    import assert from "node:assert/strict";
    const root = await import("cornerfill");
    assert.equal(root.default, null);
    for (const specifier of [
      "cornerfill/auto",
      "cornerfill/compiled",
      "cornerfill/postcss",
      "cornerfill/runtime",
    ]) await import(specifier);
  `);
  run(process.execPath, ["node-consumer.mjs"], consumerRoot);
  writeFileSync(join(consumerRoot, "index.mts"), `
    import cornerfill from "cornerfill";
    import automatic from "cornerfill/auto";
    import { installCornerfillCompiled } from "cornerfill/compiled";
    import cornerfillPostcss from "cornerfill/postcss";
    import { installCornerfill } from "cornerfill/runtime";
    declare const element: HTMLElement;
    declare const shadowRoot: ShadowRoot;
    declare const runtime: ReturnType<typeof installCornerfill>;
    const attached = runtime.attach(element);
    // @ts-expect-error attach() can select native or fallback, so mode must be narrowed first.
    attached.update({ paint: { kind: "solid", color: "red" } });
    if (attached.mode === "native") {
      attached.update({ cornerShape: "bevel" });
      // @ts-expect-error native handles do not own paint.
      attached.update({ paint: { kind: "solid", color: "red" } });
    } else {
      attached.update({ paint: { kind: "solid", color: "red" } });
      // @ts-expect-error dynamic handles do not expose prepared crop updates.
      attached.update({ backgroundPosition: [0, 0] });
    }
    declare const prepared: ReturnType<typeof runtime.attachPrepared>;
    prepared.update({ backgroundPosition: [0, 0] });
    prepared.resize({ cornerShape: "scoop", borderRadius: "5px" });
    prepared.interpolateCornerShape("round", "bevel", 0.5);
    // @ts-expect-error prepared direct updates do not accept geometry fields.
    prepared.update({ cornerShape: "scoop" });
    cornerfill?.registerRoot(shadowRoot);
    void [cornerfill, automatic, cornerfillPostcss, installCornerfillCompiled, installCornerfill, attached, prepared];
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
