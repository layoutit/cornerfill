#!/usr/bin/env node
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { platform, release } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { getOracleCase, oracleCases } from "../oracle/cases.mjs";
import { compareFrameDirectories, readTolerances } from "./compare.mjs";
import {
  readPng,
  reconstructTransparencyFromBlackAndWhite,
  writePng,
} from "./png.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const VALID_BROWSERS = new Set(["chrome", "webkit", "firefox"]);
const MANIFEST_SCHEMA = "cornerfill-oracle-run@1";

function usage() {
  console.log(`Usage:
  node scripts/oracle.mjs list
  node scripts/oracle.mjs run [options]

Options:
  --browsers=<list>       Sequential browser list. Default: chrome
  --cases=<list>          Fixture ids. Default: all portable cases
  --out=<directory>       Run output. Default: oracle/results/<UTC timestamp>
  --mario-texels=<path>   Existing texels.webp source path, required by the Mario case
  --enforce-candidate     Exit nonzero unless approved candidate tolerances pass

Environment:
  CORNERFILL_PLAYWRIGHT_CLI  playwright-cli binary/wrapper path
  CORNERFILL_MARIO_TEXELS    existing texels.webp source path

Safety:
  Browsers are always opened and closed serially. This command never calls
  playwright-cli kill-all and never launches multiple engines concurrently.
`);
}

function parseArguments(argv) {
  const command = argv.shift();
  if (!command || command === "--help" || command === "-h") return { command: "help" };
  if (!new Set(["list", "run"]).has(command)) throw new Error(`unknown command: ${command}`);
  const values = {
    command,
    browsers: ["chrome"],
    cases: oracleCases.filter(({ id }) => id !== "mario-texel-face").map(({ id }) => id),
    out: null,
    marioTexels: process.env.CORNERFILL_MARIO_TEXELS
      ? resolve(process.env.CORNERFILL_MARIO_TEXELS)
      : null,
    enforceCandidate: false,
  };
  for (const argument of argv) {
    if (argument.startsWith("--browsers=")) {
      values.browsers = argument.slice("--browsers=".length).split(",").filter(Boolean);
    } else if (argument.startsWith("--cases=")) {
      values.cases = argument.slice("--cases=".length).split(",").filter(Boolean);
    } else if (argument.startsWith("--out=")) {
      values.out = resolve(argument.slice("--out=".length));
    } else if (argument.startsWith("--mario-texels=")) {
      values.marioTexels = resolve(argument.slice("--mario-texels=".length));
    } else if (argument === "--enforce-candidate") values.enforceCandidate = true;
    else if (argument === "--help" || argument === "-h") return { command: "help" };
    else throw new Error(`unknown option: ${argument}`);
  }
  if (values.browsers.length === 0 || new Set(values.browsers).size !== values.browsers.length) {
    throw new Error("browser list must be non-empty and unique");
  }
  for (const browser of values.browsers) {
    if (!VALID_BROWSERS.has(browser)) throw new Error(`unsupported browser: ${browser}`);
  }
  if (values.cases.length === 0 || new Set(values.cases).size !== values.cases.length) {
    throw new Error("case list must be non-empty and unique");
  }
  for (const id of values.cases) if (!getOracleCase(id)) throw new Error(`unknown case: ${id}`);
  values.cases = oracleCases.map(({ id }) => id).filter((id) => values.cases.includes(id));
  return values;
}

function utcRunId() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/u, "Z");
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sourceIdentity(path) {
  const stats = statSync(path);
  return Object.freeze({
    path: realpathSync(path),
    bytes: stats.size,
    sha256: hashFile(path),
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function locatePlaywrightCli() {
  const explicit = process.env.CORNERFILL_PLAYWRIGHT_CLI;
  if (explicit) {
    const path = resolve(explicit);
    if (!existsSync(path)) throw new Error(`CORNERFILL_PLAYWRIGHT_CLI does not exist: ${path}`);
    return path;
  }
  const local = join(PROJECT_ROOT, "node_modules", ".bin", "playwright-cli");
  if (existsSync(local)) return local;
  throw new Error(
    "playwright-cli is unavailable; run npm install or set CORNERFILL_PLAYWRIGHT_CLI",
  );
}

function topLevelFiles(directory, predicate) {
  return readdirSync(join(PROJECT_ROOT, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => `${directory}/${entry.name}`);
}

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
});

function sendFile(response, path) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
  });
  createReadStream(path).pipe(response);
}

async function startFixtureServer(marioTexels) {
  const rootWithSeparator = `${PROJECT_ROOT}${sep}`;
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/__mario/texels.webp") {
        if (!marioTexels || !existsSync(marioTexels)) {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          response.end("Mario texels source is unavailable\n");
          return;
        }
        sendFile(response, marioTexels);
        return;
      }
      const requested = url.pathname === "/" ? "/oracle/fixture.html" : decodeURIComponent(url.pathname);
      const path = resolve(PROJECT_ROOT, `.${requested}`);
      if (path !== PROJECT_ROOT && !path.startsWith(rootWithSeparator)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (!existsSync(path) || !statSync(path).isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      sendFile(response, path);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(`${error instanceof Error ? error.message : String(error)}\n`);
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind a TCP port");
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) => {
      server.close((error) => error ? reject(error) : resolvePromise());
    }),
  });
}

function runCli(cli, session, driverDirectory, args, { raw = false, allowFailure = false } = {}) {
  const commandArgs = raw ? ["--raw", ...args] : args;
  console.log(`  playwright ${args[0]}`);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli, commandArgs, {
      cwd: driverDirectory,
      env: { ...process.env, PLAYWRIGHT_CLI_SESSION: session },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 30000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (status, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`playwright-cli ${args[0]} timed out after 30s\n${stdout}${stderr}`));
        return;
      }
      if (status !== 0 && !allowFailure) {
        reject(new Error(
          `playwright-cli ${args[0]} failed (${status ?? signal ?? "unknown"})\n${stdout}${stderr}`,
        ));
        return;
      }
      resolvePromise(Object.freeze({ status, stdout, stderr }));
    });
  });
}

function parseReturnedJson(output, label) {
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error(`${label} returned no JSON object: ${output}`);
  return JSON.parse(output.slice(first, last + 1));
}

const NEXT_PAINT_CODE = "await page.evaluate(() => new Promise(resolve => "
  + "requestAnimationFrame(() => requestAnimationFrame(resolve))));";

function screenshotCode(paths, { opaquePairs = null } = {}) {
  const captureOptions = "animations:\"disabled\",scale:\"css\"";
  let calls;
  let captureMethod;
  if (opaquePairs) {
    captureMethod = "dual-opaque-alpha-reconstruction";
    calls = opaquePairs.map(({ black, white }) => [
      "await page.evaluate(color => {",
      "document.documentElement.style.setProperty(\"background\",color,\"important\");",
      "document.body.style.setProperty(\"background\",color,\"important\");",
      "}, \"#000\");",
      NEXT_PAINT_CODE,
      `await page.locator(\"#capture\").screenshot({path:${JSON.stringify(black)},${captureOptions},omitBackground:false});`,
      "await page.evaluate(color => {",
      "document.documentElement.style.setProperty(\"background\",color,\"important\");",
      "document.body.style.setProperty(\"background\",color,\"important\");",
      "}, \"#fff\");",
      NEXT_PAINT_CODE,
      `await page.locator(\"#capture\").screenshot({path:${JSON.stringify(white)},${captureOptions},omitBackground:false});`,
    ].join("")).join(NEXT_PAINT_CODE);
  } else {
    captureMethod = "transparent-browser-screenshot";
    calls = paths.map((path) => (
      `await page.locator(\"#capture\").screenshot({path:${JSON.stringify(path)},${captureOptions},omitBackground:true});`
    )).join(NEXT_PAINT_CODE);
  }
  const code = [
    "async (page) => {",
    "await page.waitForFunction(() => globalThis.__cornerfillOracle?.ready === true ",
    "|| Boolean(globalThis.__cornerfillOracle?.error), null, {timeout:15000});",
    "const metadata = await page.evaluate(() => globalThis.__cornerfillOracle);",
    "if (!metadata.ready) throw new Error(metadata.error || \"fixture failed\");",
    calls,
    "const lifecycle = await page.evaluate(() => typeof globalThis.__cornerfillOracleRunLifecycle === \"function\"",
    "? globalThis.__cornerfillOracleRunLifecycle() : null);",
    `return {...metadata,driverCaptureMethod:${JSON.stringify(captureMethod)},lifecycle};`,
    "}",
  ].join("");
  if (process.env.CORNERFILL_DEBUG) console.log(`  run-code source: ${code}`);
  return code;
}

function opaquePairPaths(outputPath, compositeDirectory) {
  const stem = basename(outputPath, extname(outputPath));
  return Object.freeze({
    output: outputPath,
    black: join(compositeDirectory, `${stem}.black.png`),
    white: join(compositeDirectory, `${stem}.white.png`),
  });
}

function reconstructOpaquePairs(pairs) {
  return pairs.map(({ output, black, white }) => {
    const reconstructed = reconstructTransparencyFromBlackAndWhite(readPng(black), readPng(white));
    writePng(output, reconstructed);
    return Object.freeze({ output, black, white, diagnostics: reconstructed.diagnostics });
  });
}

function fixtureUrl(origin, caseId, mode) {
  const url = new URL("/oracle/fixture.html", origin);
  url.searchParams.set("case", caseId);
  url.searchParams.set("mode", mode);
  return url.href;
}

function captureMetadata({
  browser,
  mode,
  frame,
  caseId,
  metadata,
  files,
  composites = [],
  reconstruction = null,
}) {
  return Object.freeze({
    browser,
    mode,
    frame,
    caseId,
    files: Object.freeze(files.map((path) => relative(PROJECT_ROOT, path))),
    composites: Object.freeze(composites.map((path) => relative(PROJECT_ROOT, path))),
    reconstruction,
    metadata,
  });
}

async function captureBrowser({
  browser,
  cli,
  driverDirectory,
  compositesRoot,
  framesRoot,
  origin,
  selectedCases,
}) {
  const session = `cornerfill-oracle-${process.pid}-${browser}`;
  const candidateDirectory = join(framesRoot, `candidate-${browser}`);
  mkdirSync(candidateDirectory, { recursive: true });
  const compositeDirectory = join(compositesRoot, `candidate-${browser}`);
  if (browser === "firefox") mkdirSync(compositeDirectory, { recursive: true });
  const nativeADirectory = join(framesRoot, "native-chrome-a");
  const nativeBDirectory = join(framesRoot, "native-chrome-b");
  if (browser === "chrome") {
    mkdirSync(nativeADirectory, { recursive: true });
    mkdirSync(nativeBDirectory, { recursive: true });
  }
  const records = [];
  const firstMode = browser === "chrome" ? "native" : "candidate";
  const firstUrl = fixtureUrl(origin, selectedCases[0].id, firstMode);
  try {
    await runCli(cli, session, driverDirectory, ["open", firstUrl, "--browser", browser]);
    await runCli(cli, session, driverDirectory, ["resize", "420", "360"]);
    for (let index = 0; index < selectedCases.length; index += 1) {
      const oracleCase = selectedCases[index];
      const frame = `frame_${String(index).padStart(4, "0")}.png`;
      if (browser === "chrome") {
        await runCli(cli, session, driverDirectory, ["goto", fixtureUrl(origin, oracleCase.id, "native")]);
        const nativeAPath = join(nativeADirectory, frame);
        const nativeBPath = join(nativeBDirectory, frame);
        const result = await runCli(
          cli,
          session,
          driverDirectory,
          ["run-code", screenshotCode([nativeAPath, nativeBPath])],
          { raw: true },
        );
        const metadata = parseReturnedJson(result.stdout, `${oracleCase.id} native capture`);
        if (!metadata.nativeSupported || !metadata.computed?.cornerShape) {
          throw new Error(
            `INVALID ORACLE: Chrome did not compute corner-shape for ${oracleCase.id}; `
            + `supported=${metadata.nativeSupported} computed=${metadata.computed?.cornerShape ?? "missing"}`,
          );
        }
        records.push(captureMetadata({
          browser,
          mode: "native-a-b",
          frame,
          caseId: oracleCase.id,
          metadata,
          files: [nativeAPath, nativeBPath],
        }));
      }

      await runCli(cli, session, driverDirectory, ["goto", fixtureUrl(origin, oracleCase.id, "candidate")]);
      const candidatePath = join(candidateDirectory, frame);
      const opaquePairs = browser === "firefox"
        ? [opaquePairPaths(candidatePath, compositeDirectory)]
        : null;
      const result = await runCli(
        cli,
        session,
        driverDirectory,
        ["run-code", screenshotCode([candidatePath], { opaquePairs })],
        { raw: true },
      );
      const metadata = parseReturnedJson(result.stdout, `${oracleCase.id} candidate capture`);
      const expectedBackend = browser === "chrome"
        ? "static-data-url"
        : browser === "webkit"
          ? "webkit-canvas"
          : "moz-element";
      if (metadata.candidate?.runtime !== "cornerfill-runtime@2"
        || metadata.backend !== expectedBackend) {
        throw new Error(
          `production candidate did not use the required ${browser} adapter for ${oracleCase.id}; `
          + `runtime=${metadata.candidate?.runtime ?? "missing"} backend=${metadata.backend ?? "missing"}`,
        );
      }
      if (oracleCase.id === "bevel" && metadata.lifecycle?.passed !== true) {
        throw new Error(`production lifecycle proof failed in ${browser}: ${JSON.stringify(metadata.lifecycle)}`);
      }
      if (oracleCase.id === "mario-texel-face" && metadata.lifecycle?.passed !== true) {
        throw new Error(`production raster-update proof failed in ${browser}: ${JSON.stringify(metadata.lifecycle)}`);
      }
      const reconstruction = opaquePairs ? reconstructOpaquePairs(opaquePairs) : null;
      records.push(captureMetadata({
        browser,
        mode: "candidate",
        frame,
        caseId: oracleCase.id,
        metadata,
        files: [candidatePath],
        composites: opaquePairs ? opaquePairs.flatMap(({ black, white }) => [black, white]) : [],
        reconstruction: reconstruction?.map(({ diagnostics }) => diagnostics) ?? null,
      }));
    }
  } finally {
    try {
      const close = await runCli(cli, session, driverDirectory, ["close"], { allowFailure: true });
      if (close.status !== 0) {
        console.error(`warning: failed to close Playwright session ${session}\n${close.stdout}${close.stderr}`);
      }
    } catch (error) {
      console.error(`warning: failed to close Playwright session ${session}: ${error.message}`);
    }
  }
  return Object.freeze(records);
}

function runSummary({ runDirectory, manifest, reports }) {
  const lines = [
    "# Cornerfill oracle run",
    "",
    `Run: \`${manifest.runId}\``,
    "",
    `Browsers (serial): ${manifest.configuration.browsers.join(", ")}`,
    "",
    `Cases: ${manifest.configuration.cases.join(", ")}`,
    "",
    "| Comparison | Status | Report |",
    "| --- | --- | --- |",
  ];
  for (const report of reports) {
    const path = relative(runDirectory, report.outputDirectory);
    lines.push(`| ${report.label} | ${report.status} | [summary](${path}/summary.md) |`);
  }
  lines.push(
    "",
    "Raw numbered PNGs are the source of truth. Diff PNGs are diagnostic heatmaps.",
    "",
  );
  return lines.join("\n");
}

async function runOracle(options) {
  const runId = utcRunId();
  const runDirectory = options.out ?? join(PROJECT_ROOT, "oracle", "results", runId);
  if (existsSync(runDirectory)) throw new Error(`output already exists: ${runDirectory}`);
  const selectedCases = options.cases.map(getOracleCase);
  const usesMario = (paint) => paint?.url === "/__mario/texels.webp"
    || paint?.layers?.some(usesMario) === true;
  const needsMario = selectedCases.some(({ paint }) => usesMario(paint));
  if (needsMario && (!options.marioTexels || !existsSync(options.marioTexels))) {
    throw new Error(
      "Mario case requires texels.webp; set CORNERFILL_MARIO_TEXELS or pass --mario-texels=<path>",
    );
  }
  const cli = locatePlaywrightCli();
  const driverDirectory = join(runDirectory, "driver");
  const framesRoot = join(runDirectory, "frames");
  const compositesRoot = join(runDirectory, "composites");
  const reportsRoot = join(runDirectory, "reports");
  mkdirSync(driverDirectory, { recursive: true });
  mkdirSync(framesRoot, { recursive: true });
  mkdirSync(reportsRoot, { recursive: true });

  const sourceFiles = [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig.types.json",
    "README.md",
    "scripts/compare.mjs",
    "scripts/generate-qualification.mjs",
    "scripts/oracle.mjs",
    "scripts/png.mjs",
    ...topLevelFiles("oracle", (name) => /\.(?:html|json|mjs)$/u.test(name)),
    ...topLevelFiles("src", (name) => name.endsWith(".mts")),
    ...topLevelFiles("dist", (name) => name.endsWith(".mjs")),
  ].sort();
  const sources = Object.fromEntries(sourceFiles.map((path) => [path, sourceIdentity(join(PROJECT_ROOT, path))]));
  const marioSource = needsMario
    ? sourceIdentity(options.marioTexels)
    : null;
  const configuration = Object.freeze({
    browsers: Object.freeze([...options.browsers]),
    cases: Object.freeze(selectedCases.map(({ id }) => id)),
    captureOrder: "strictly sequential, one browser session at a time",
    enforceCandidate: options.enforceCandidate,
  });
  const manifest = {
    schema: MANIFEST_SCHEMA,
    runId,
    status: "CAPTURING",
    createdAt: new Date().toISOString(),
    projectRoot: PROJECT_ROOT,
    runDirectory,
    host: Object.freeze({ platform: platform(), release: release(), node: process.version }),
    configuration,
    playwrightCli: sourceIdentity(cli),
    sources,
    assets: Object.freeze({ marioTexels: marioSource }),
    cases: Object.freeze(selectedCases.map((entry, index) => Object.freeze({
      frame: `frame_${String(index).padStart(4, "0")}.png`,
      id: entry.id,
      description: entry.description,
      expectedCandidateLimitation: entry.expectedCandidateLimitation ?? null,
      nativeOracleLimitation: entry.nativeOracleLimitation ?? null,
    }))),
    captures: [],
    reports: [],
  };
  writeJson(join(runDirectory, "manifest.partial.json"), manifest);

  const server = await startFixtureServer(options.marioTexels);
  try {
    for (const browser of options.browsers) {
      console.log(`capture ${browser}: ${selectedCases.length} case(s), one session`);
      const records = await captureBrowser({
        browser,
        cli,
        driverDirectory,
        compositesRoot,
        framesRoot,
        origin: server.origin,
        selectedCases,
      });
      manifest.captures.push(...records);
      writeJson(join(runDirectory, "manifest.partial.json"), manifest);
    }
  } finally {
    await server.close();
  }

  const tolerances = readTolerances(join(PROJECT_ROOT, "oracle", "tolerances.json"));
  const caseByFrame = new Map(manifest.cases.map(({ frame, id }) => [frame, id]));
  const reports = [];
  const nativeA = join(framesRoot, "native-chrome-a");
  const nativeB = join(framesRoot, "native-chrome-b");
  if (options.browsers.includes("chrome")) {
    const outputDirectory = join(reportsRoot, "native-chrome-a-vs-native-chrome-b");
    const report = compareFrameDirectories({
      expectedDirectory: nativeA,
      actualDirectory: nativeB,
      outputDirectory,
      label: "Native Chrome A/A calibration",
      tolerance: tolerances.calibration,
      caseByFrame,
    });
    reports.push(Object.freeze({ ...report, outputDirectory }));
  }
  if (options.browsers.includes("chrome")) {
    for (const browser of options.browsers) {
      const outputDirectory = join(reportsRoot, `native-chrome-vs-candidate-${browser}`);
      const report = compareFrameDirectories({
        expectedDirectory: nativeA,
        actualDirectory: join(framesRoot, `candidate-${browser}`),
        outputDirectory,
        label: `Native Chrome vs candidate ${browser}`,
        tolerance: tolerances.candidate,
        caseByFrame,
      });
      reports.push(Object.freeze({ ...report, outputDirectory }));
    }
  }

  manifest.status = reports.some((report) => report.label.includes("A/A") && report.status !== "PASS")
    ? "INVALID_CALIBRATION"
    : options.enforceCandidate && reports.some((report) => report.label.includes("candidate") && report.status !== "PASS")
      ? "CANDIDATE_FAILED"
      : "COMPLETE";
  manifest.completedAt = new Date().toISOString();
  manifest.reports = reports.map((report) => Object.freeze({
    label: report.label,
    status: report.status,
    path: relative(runDirectory, report.outputDirectory),
  }));
  writeJson(join(runDirectory, "manifest.json"), manifest);
  writeFileSync(join(runDirectory, "README.md"), runSummary({ runDirectory, manifest, reports }));
  console.log(`oracle run: ${manifest.status}`);
  console.log(`evidence: ${runDirectory}`);
  if (manifest.status !== "COMPLETE") process.exitCode = 1;
}

function listCases() {
  for (const [index, entry] of oracleCases.entries()) {
    console.log(`${String(index).padStart(2, "0")}  ${entry.id.padEnd(28)} ${entry.description}`);
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "help") usage();
  else if (options.command === "list") listCases();
  else await runOracle(options);
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
}
