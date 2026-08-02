#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { platform, release } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { startMarioServer } from "./mario-server.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const CSSGRAPHICS_ROOT = "/Users/ekrof/fed/cssGraphics";
const DEFAULT_MARIO_ROOT = join(CSSGRAPHICS_ROOT, ".local/codepen-mario/codepen");
const DEFAULT_VENDOR_ROOT = join(CSSGRAPHICS_ROOT, "node_modules");
const TRACE_SCHEMA = "cornerfill-mario-firefox-trace-run@6";

function usage() {
  console.log(`Usage:
  node scripts/trace-firefox-mario.mjs [options]

Options:
  --mode=<off|on|both>   Trace baseline, Cornerfill, or both. Default: both
  --frames=<n>           Measured Mario source ticks per trial. Default: 820
  --warmup=<n>           Warmup Mario source ticks before each trial. Default: 60
  --trials=<n>           Opening-segment trials per fresh session. Default: 1
  --pairs=<n>            Fresh OFF/ON/ON/OFF capture blocks. Default: 2
  --profile              Collect Gecko profiles (kept out of timing by default)
  --headed               Use headed Firefox. Default: headless Firefox
  --out=<directory>      New output directory. Default: output/playwright/firefox-mario/<UTC>
  --mario-root=<path>    Existing standalone Mario directory

Safety:
  Firefox modes run serially, each in one exact named session. The runner never
  calls close-all or kill-all and never edits or rebuilds the Mario package.
`);
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError(`${label} must be positive`);
  return parsed;
}

function parseArguments(argv) {
  const values = {
    mode: "both",
    frames: 820,
    warmup: 60,
    trials: 1,
    pairs: 2,
    headless: true,
    profile: false,
    out: null,
    marioRoot: process.env.CORNERFILL_MARIO_ROOT || DEFAULT_MARIO_ROOT,
  };
  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument.startsWith("--mode=")) values.mode = argument.slice("--mode=".length);
    else if (argument.startsWith("--frames=")) values.frames = positiveInteger(argument.slice("--frames=".length), "frames");
    else if (argument.startsWith("--warmup=")) values.warmup = positiveInteger(argument.slice("--warmup=".length), "warmup");
    else if (argument.startsWith("--trials=")) values.trials = positiveInteger(argument.slice("--trials=".length), "trials");
    else if (argument.startsWith("--pairs=")) values.pairs = positiveInteger(argument.slice("--pairs=".length), "pairs");
    else if (argument.startsWith("--out=")) values.out = resolve(argument.slice("--out=".length));
    else if (argument.startsWith("--mario-root=")) values.marioRoot = resolve(argument.slice("--mario-root=".length));
    else if (argument === "--headless") values.headless = true;
    else if (argument === "--headed") values.headless = false;
    else if (argument === "--profile") values.profile = true;
    else throw new TypeError(`unknown option: ${argument}`);
  }
  if (!new Set(["off", "on", "both"]).has(values.mode)) throw new TypeError(`unknown mode: ${values.mode}`);
  return values;
}

function utcRunId() {
  return new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/u, "Z");
}

function locatePlaywrightModule() {
  const explicit = process.env.CORNERFILL_PLAYWRIGHT_MODULE;
  if (explicit) return resolve(explicit);
  const lookup = spawnSync(
    "npx",
    ["--yes", "--package", "@playwright/cli", "sh", "-c", "command -v playwright-cli"],
    { encoding: "utf8" },
  );
  if (lookup.status !== 0 || !lookup.stdout.trim()) {
    throw new Error(`could not locate Playwright through @playwright/cli: ${lookup.stderr}`);
  }
  const nodeModules = resolve(dirname(lookup.stdout.trim()), "..");
  const modulePath = join(nodeModules, "playwright", "index.mjs");
  if (!existsSync(modulePath)) throw new Error(`Playwright module is unavailable: ${modulePath}`);
  return modulePath;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function identity(path) {
  const stats = statSync(path);
  return Object.freeze({ path: realpathSync(path), bytes: stats.size, sha256: sha256(path) });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assertCleanTeardown(teardown, label = "Cornerfill teardown") {
  const runtimeTeardownFailed = teardown.runtime && (
    teardown.runtime.entries !== 0
    || teardown.runtime.surfaces !== 0
    || teardown.runtime.imageCache.references !== 0
    || teardown.runtime.surfaceResources.firefox.registrations !== 0
  );
  if (teardown.bridgeInstalled
    || teardown.ownedElements !== 0
    || teardown.liveImageProperties !== 0
    || teardown.errors.length !== 0
    || runtimeTeardownFailed) {
    throw new Error(`${label} invariant failed: ${JSON.stringify(teardown)}`);
  }
}

function waitForFile(path, timeoutMs = 120_000) {
  const started = Date.now();
  return new Promise((resolvePromise, reject) => {
    const poll = () => {
      if (existsSync(path) && statSync(path).size > 0) {
        resolvePromise();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Firefox did not write Gecko profile: ${path}`));
        return;
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

function profileInventory(path) {
  const root = JSON.parse(readFileSync(path, "utf8"));
  const profiles = [];
  const visit = (profile, depth = 0) => {
    const threads = (profile.threads ?? []).map((thread) => Object.freeze({
      name: thread.name,
      processType: thread.processType ?? null,
      pid: thread.pid,
      tid: thread.tid,
      samples: thread.samples?.data?.length ?? 0,
      markers: thread.markers?.data?.length ?? 0,
      relevantStrings: (thread.stringTable ?? []).filter((value) => (
        /cornerfill|moz-element|canvas|webrender|displaylist|refreshdriver/iu.test(value)
      )).slice(0, 200),
    }));
    profiles.push(Object.freeze({
      depth,
      product: profile.meta?.product ?? null,
      interval: profile.meta?.interval ?? null,
      startTime: profile.meta?.startTime ?? null,
      shutdownTime: profile.meta?.shutdownTime ?? null,
      threads,
      counters: (profile.counters ?? []).map((counter) => counter.name ?? counter.category ?? "counter"),
    }));
    for (const child of profile.processes ?? []) visit(child, depth + 1);
  };
  visit(root);
  return Object.freeze({
    schema: "cornerfill-gecko-profile-inventory@1",
    bytes: statSync(path).size,
    profiles,
    totalThreads: profiles.reduce((sum, profile) => sum + profile.threads.length, 0),
    totalSamples: profiles.reduce((sum, profile) => (
      sum + profile.threads.reduce((threadSum, thread) => threadSum + thread.samples, 0)
    ), 0),
    totalMarkers: profiles.reduce((sum, profile) => (
      sum + profile.threads.reduce((threadSum, thread) => threadSum + thread.markers, 0)
    ), 0),
  });
}

async function traceMode({ playwright, origin, out, lane, mode, frames, warmup, trials, headless, profile }) {
  const modeDirectory = join(out, lane);
  mkdirSync(modeDirectory, { recursive: true });
  const profilePath = join(modeDirectory, `firefox-${mode}.profile.json`);
  const screenshotPath = join(modeDirectory, `firefox-${mode}.png`);
  const finalScreenshotPath = join(modeDirectory, `firefox-${mode}-animation-end.png`);
  const resultPath = join(modeDirectory, `firefox-${mode}.page.json`);
  const browserLogPath = join(modeDirectory, `firefox-${mode}.browser.log`);
  const session = `cornerfill-mario-firefox-${process.pid}-${lane}`;
  const profilerEnv = {
    ...process.env,
    MOZ_PROFILER_STARTUP: "1",
    MOZ_PROFILER_SHUTDOWN: profilePath,
    MOZ_PROFILER_STARTUP_INTERVAL: "1",
    MOZ_PROFILER_STARTUP_ENTRIES: "2000000",
    MOZ_PROFILER_STARTUP_FEATURES: "js,stackwalk,leaf,responsiveness",
    MOZ_PROFILER_STARTUP_FILTERS: "GeckoMain,Compositor,Renderer,SwComposite",
  };
  const browserLog = [];
  const fatalBrowserEvents = [];
  let browser = null;
  let context = null;
  let page = null;
  let pageResult = null;
  let browserVersion = null;
  let traceDisposed = false;
  let bodyError = null;
  const cleanupErrors = [];
  const installPayload = Object.freeze({
    moduleUrl: `${origin}/cornerfill/bench/mario-firefox-trace.mjs`,
    config: Object.freeze({
      mode,
      cornerfillModuleUrl: `${origin}/cornerfill/src/index.mjs`,
      expectedFaceCount: 1213,
    }),
  });
  try {
    console.log(`  launch exact ${session} (${headless ? "headless" : "headed"}${profile ? ", profiled" : ""})`);
    browser = await playwright.firefox.launch({
      headless,
      ...(profile ? { env: profilerEnv } : {}),
    });
    browserVersion = browser.version();
    context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    page = await context.newPage();
    page.on("console", (message) => {
      const record = `[console:${message.type()}] ${message.text()}`;
      browserLog.push(record);
      if (message.type() === "error") fatalBrowserEvents.push(record);
    });
    page.on("pageerror", (error) => {
      const record = `[pageerror] ${error.stack || error.message}`;
      browserLog.push(record);
      fatalBrowserEvents.push(record);
    });
    page.on("requestfailed", (request) => {
      const record = `[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`;
      browserLog.push(record);
      fatalBrowserEvents.push(record);
    });
    await page.goto(`${origin}/mario/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForFunction(() => (
      document.documentElement.dataset.modelReady !== undefined
      || document.querySelector("#status[data-error]") !== null
    ), null, { timeout: 120_000 });
    const errorStatus = page.locator("#status[data-error]");
    const loadError = await errorStatus.count() > 0 ? await errorStatus.textContent() : null;
    if (loadError) throw new Error(`Mario failed to mount: ${loadError}`);
    const setupResult = await page.evaluate(async (payload) => {
      const module = await import(payload.moduleUrl);
      return module.installMarioFirefoxTrace(payload.config);
    }, installPayload);
    console.log(`  ${mode} setup: ${setupResult.setupMs.toFixed(1)}ms, ${setupResult.faceCount} faces`);
    await page.locator("#demo").screenshot({ path: screenshotPath, animations: "allow", scale: "css" });
    for (let index = 1; index <= trials; index += 1) {
      const result = await page.evaluate((payload) => (
        globalThis.__CORNERFILL_MARIO_TRACE__.runTrial(payload)
      ), {
        index,
        frames,
        warmupFrames: warmup,
      });
      console.log(
        `  ${mode} trial ${index}: ${result.sourceTiming.effectiveFps.toFixed(2)} source-fps, `
        + `p95=${result.frameTiming.p95.toFixed(2)}ms, >33ms=${result.frameTiming.over33ms}`,
      );
    }
    pageResult = await page.evaluate(() => globalThis.__CORNERFILL_MARIO_TRACE__.summary());
    await page.locator("#demo").screenshot({ path: finalScreenshotPath, animations: "allow", scale: "css" });
    const teardown = await page.evaluate(() => globalThis.__CORNERFILL_MARIO_TRACE__.dispose());
    traceDisposed = true;
    assertCleanTeardown(teardown);

    let lifecycleProbe = null;
    if (mode === "on") {
      traceDisposed = false;
      lifecycleProbe = await page.evaluate(async (payload) => {
        const module = await import(payload.moduleUrl);
        const setup = await module.installMarioFirefoxTrace(payload.config);
        const trace = globalThis.__CORNERFILL_MARIO_TRACE__;
        const trial = await trace.runTrial({ index: 1, frames: 4, warmupFrames: 4 });
        const beforeDispose = trace.summary();
        const secondTeardown = trace.dispose();
        return Object.freeze({
          schema: "cornerfill-mario-firefox-lifecycle-probe@1",
          setup: Object.freeze({
            faceCount: setup.faceCount,
            backendCounts: setup.backendCounts,
            computedBackendFaces: setup.computedBackendFaces,
            setupBridgeCoverage: setup.setupBridgeCoverage,
          }),
          trial: Object.freeze({
            sourceTiming: Object.freeze({
              start: trial.sourceTiming.start,
              end: trial.sourceTiming.end,
              count: trial.sourceTiming.count,
              elapsedMs: trial.sourceTiming.elapsedMs,
              effectiveFps: trial.sourceTiming.effectiveFps,
            }),
            workload: trial.workload,
            runtimeDelta: trial.runtimeDelta,
          }),
          runtimeBeforeDispose: beforeDispose.runtime,
          teardown: secondTeardown,
        });
      }, installPayload);
      traceDisposed = true;
      assertCleanTeardown(lifecycleProbe.teardown, "Cornerfill same-page reattach teardown");
    }
    pageResult = Object.freeze({ ...pageResult, teardown, lifecycleProbe });
    if (fatalBrowserEvents.length > 0) {
      throw new Error(`Firefox emitted fatal browser events: ${fatalBrowserEvents.join("\n")}`);
    }
    writeJson(resultPath, pageResult);
  } catch (error) {
    bodyError = error;
  } finally {
    if (page && !traceDisposed && !page.isClosed()) {
      try {
        traceDisposed = await page.evaluate(() => {
          const trace = globalThis.__CORNERFILL_MARIO_TRACE__;
          if (!trace) return true;
          trace.dispose();
          return true;
        });
      } catch (error) {
        cleanupErrors.push(error);
        browserLog.push(`[trace-dispose-error] ${error.stack || error.message}`);
      }
    }
    if (context) {
      try {
        await context.close();
      } catch (error) {
        cleanupErrors.push(error);
        browserLog.push(`[context-close-error] ${error.stack || error.message}`);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        cleanupErrors.push(error);
        browserLog.push(`[browser-close-error] ${error.stack || error.message}`);
      }
      if (browser.isConnected()) {
        const error = new Error(`exact Firefox session ${session} remained connected after close()`);
        cleanupErrors.push(error);
        browserLog.push(`[browser-disconnect-error] ${error.message}`);
      }
    }
    writeFileSync(browserLogPath, `${browserLog.join("\n")}\n`);
  }
  if (bodyError || cleanupErrors.length > 0) {
    const errors = [bodyError, ...cleanupErrors].filter(Boolean);
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, `Firefox lane ${lane} failed and did not cleanly close`);
  }
  if (profile) await waitForFile(profilePath);
  return {
    lane,
    mode,
    session,
    browserVersion,
    profilePath: profile ? profilePath : null,
    screenshotPath,
    finalScreenshotPath,
    resultPath,
    browserLogPath,
    pageResult,
  };
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarizeIntervals(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const mean = sorted.length === 0 ? 0 : total / sorted.length;
  return Object.freeze({
    count: sorted.length,
    mean,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    over20ms: sorted.filter((value) => value > 20).length,
    over33ms: sorted.filter((value) => value > 1000 / 30).length,
    effectiveFps: mean > 0 ? 1000 / mean : 0,
  });
}

function aggregateMode(results, mode) {
  const captures = results.filter((result) => result.mode === mode);
  if (captures.length === 0) return null;
  const intervals = captures.flatMap((capture) => (
    capture.pageResult.trials.flatMap((trial) => trial.frameIntervalsMs)
  ));
  const sourceFrames = captures.reduce((sum, capture) => (
    sum + capture.pageResult.trials.reduce((trialSum, trial) => trialSum + trial.sourceTiming.count, 0)
  ), 0);
  const sourceElapsedMs = captures.reduce((sum, capture) => (
    sum + capture.pageResult.trials.reduce((trialSum, trial) => trialSum + trial.sourceTiming.elapsedMs, 0)
  ), 0);
  return Object.freeze({
    mode,
    sessions: captures.length,
    trials: captures.reduce((sum, capture) => sum + capture.pageResult.trials.length, 0),
    timing: summarizeIntervals(intervals),
    sourceTiming: Object.freeze({
      count: sourceFrames,
      elapsedMs: sourceElapsedMs,
      effectiveFps: sourceElapsedMs > 0 ? sourceFrames * 1000 / sourceElapsedMs : 0,
    }),
    sessionSourceFps: Object.freeze(captures.map((capture) => capture.pageResult.aggregateSourceTiming.effectiveFps)),
  });
}

function summarizeSamples(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const margin95 = values.length > 1 ? 1.96 * standardDeviation / Math.sqrt(values.length) : null;
  return Object.freeze({
    count: values.length,
    mean,
    standardDeviation,
    confidence95: margin95 === null ? null : Object.freeze([mean - margin95, mean + margin95]),
  });
}

function workloadSignature(trial) {
  const { workload, preparedWrites } = trial;
  return JSON.stringify({
    frames: trial.frames,
    start: {
      playbackTick: workload.startSourceState.playbackTick,
      sourceFrame: workload.startSourceState.sourceFrame,
      experienceMode: workload.startSourceState.experienceMode,
    },
    end: {
      playbackTick: workload.endSourceState.playbackTick,
      sourceFrame: workload.endSourceState.sourceFrame,
      experienceMode: workload.endSourceState.experienceMode,
    },
    beforeLeafHash: workload.beforeLeafHash,
    afterLeafHash: workload.afterLeafHash,
    streamHash: workload.streamHash,
    streamEvents: workload.streamEvents,
    positionWrites: preparedWrites.positionWrites,
    positionChanges: preparedWrites.positionChanges,
    visibilityWrites: preparedWrites.visibilityWrites,
    visibilityChanges: preparedWrites.visibilityChanges,
    touchedLeaves: preparedWrites.touchedLeaves,
  });
}

function comparison(results) {
  const off = aggregateMode(results, "off");
  const on = aggregateMode(results, "on");
  if (!off || !on) return null;
  const offTiming = off.timing;
  const onTiming = on.timing;
  const ratio = (after, before) => before === 0 ? null : after / before;
  const trials = results.flatMap((result) => result.pageResult.trials.map((trial) => ({
    lane: result.lane,
    mode: result.mode,
    index: trial.index,
    signature: workloadSignature(trial),
  })));
  const signatures = [...new Set(trials.map(({ signature }) => signature))];
  const workloadEquivalent = signatures.length === 1;
  return Object.freeze({
    schema: "cornerfill-mario-firefox-comparison@4",
    qualified: workloadEquivalent,
    qualification: Object.freeze({
      workloadEquivalent,
      uniqueWorkloadSignatures: signatures.length,
      trials: Object.freeze(trials),
    }),
    sessions: Object.freeze({ off: off.sessions, on: on.sessions }),
    trials: Object.freeze({ off: off.trials, on: on.trials }),
    sourceTickFps: Object.freeze({
      off: off.sourceTiming.effectiveFps,
      on: on.sourceTiming.effectiveFps,
      ratio: ratio(on.sourceTiming.effectiveFps, off.sourceTiming.effectiveFps),
      offUncertainty: summarizeSamples(off.sessionSourceFps),
      onUncertainty: summarizeSamples(on.sessionSourceFps),
    }),
    effectiveFps: Object.freeze({ off: offTiming.effectiveFps, on: onTiming.effectiveFps, ratio: ratio(onTiming.effectiveFps, offTiming.effectiveFps) }),
    meanFrameMs: Object.freeze({ off: offTiming.mean, on: onTiming.mean, ratio: ratio(onTiming.mean, offTiming.mean) }),
    p95FrameMs: Object.freeze({ off: offTiming.p95, on: onTiming.p95, ratio: ratio(onTiming.p95, offTiming.p95) }),
    p99FrameMs: Object.freeze({ off: offTiming.p99, on: onTiming.p99, ratio: ratio(onTiming.p99, offTiming.p99) }),
    framesOver20ms: Object.freeze({ off: offTiming.over20ms, on: onTiming.over20ms }),
    framesOver33ms: Object.freeze({ off: offTiming.over33ms, on: onTiming.over33ms }),
  });
}

function markdown(run) {
  const rows = run.modes.map((entry) => {
    const timing = entry.pageResult.aggregateFrameTiming;
    const sourceTiming = entry.pageResult.aggregateSourceTiming;
    const measuredCounters = entry.pageResult.trials.reduce((totals, trial) => {
      totals.paints += trial.runtimeDelta?.paints ?? 0;
      totals.styleChecks += trial.runtimeDelta?.styleChecks ?? 0;
      return totals;
    }, { paints: 0, styleChecks: 0 });
    return `| ${entry.lane} | ${entry.mode} | ${sourceTiming.count} | ${sourceTiming.effectiveFps.toFixed(2)} | ${timing.p95.toFixed(3)} | ${timing.p99.toFixed(3)} | ${timing.over33ms} | ${measuredCounters.paints} | ${measuredCounters.styleChecks} |`;
  });
  return `# Firefox Mario Cornerfill trace\n\n`
    + `Status: **${run.status}**\n\n`
    + `Workload: the standalone 1,213-leaf Mario title-head, unchanged on disk and response-instrumented with the recorded bridge schema. `
    + `Every qualified OFF/ON comparison has an identical ordered crop/visibility stream hash and identical model/leaf start and end states.\n\n`
    + `| Lane | Mode | Source ticks | Source FPS | Display p95 ms | Display p99 ms | Display >33ms | Measured Cornerfill paints | Measured style checks |\n`
    + `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`
    + `${rows.join("\n")}\n\n`
    + `No candidate tolerance is involved. Each lane is a fresh exact Firefox session; profiling is recorded in the manifest and disabled for timing runs by default. `
    + `Heap availability and post-dispose resource counts are recorded explicitly.\n`;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const marioRoot = resolve(args.marioRoot);
  const vendorRoot = resolve(DEFAULT_VENDOR_ROOT);
  for (const path of [marioRoot, vendorRoot]) {
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`required directory is unavailable: ${path}`);
  }
  const runId = utcRunId();
  const out = args.out ?? join(PROJECT_ROOT, "output", "playwright", "firefox-mario", runId);
  if (existsSync(out)) throw new Error(`output already exists: ${out}`);
  mkdirSync(out, { recursive: true });
  const playwrightModulePath = locatePlaywrightModule();
  const playwright = await import(pathToFileURL(playwrightModulePath).href);
  const playwrightPackage = JSON.parse(readFileSync(join(dirname(playwrightModulePath), "package.json"), "utf8"));
  const polycssRoot = realpathSync(join(vendorRoot, "@layoutit/polycss"));
  const vendorRoots = Object.freeze({
    polycss: polycssRoot,
    polycssMorph: realpathSync(join(vendorRoot, "@layoutit/polycss-morph")),
    polycssCore: realpathSync(join(dirname(polycssRoot), "polycss-core")),
  });
  const sourceIdentities = Object.freeze({
    traceRunner: identity(fileURLToPath(import.meta.url)),
    marioIndex: identity(join(marioRoot, "index.html")),
    marioStyles: identity(join(marioRoot, "style.css")),
    marioScript: identity(join(marioRoot, "script.js")),
    marioModel: identity(join(marioRoot, "assets/model.json")),
    marioTexels: identity(join(marioRoot, "assets/texels.webp")),
    marioBackground: identity(join(marioRoot, "assets/background.webp")),
    marioCursor: identity(join(marioRoot, "assets/cursor.webp")),
    marioEffects: identity(join(marioRoot, "assets/effects.webp")),
    marioRuntimeIndex: identity(join(marioRoot, "runtime/index.js")),
    marioRuntimeAnimation: identity(join(marioRoot, "runtime/animation.js")),
    marioRuntimeInteraction: identity(join(marioRoot, "runtime/interaction.js")),
    marioRuntimeModel: identity(join(marioRoot, "runtime/model.js")),
    marioRuntimeScene: identity(join(marioRoot, "runtime/scene.js")),
    cornerfillRuntime: identity(join(PROJECT_ROOT, "src/runtime.mjs")),
    cornerfillPainter: identity(join(PROJECT_ROOT, "src/paint.mjs")),
    cornerfillBackends: identity(join(PROJECT_ROOT, "src/backends.mjs")),
    cornerfillImages: identity(join(PROJECT_ROOT, "src/images.mjs")),
    pageHarness: identity(join(PROJECT_ROOT, "bench/mario-firefox-trace.mjs")),
    serverHarness: identity(join(PROJECT_ROOT, "scripts/mario-server.mjs")),
    playwrightPackage: identity(join(dirname(playwrightModulePath), "package.json")),
  });
  const server = await startMarioServer({
    marioRoot,
    projectRoot: PROJECT_ROOT,
    vendorRoots,
  });
  const capturePlan = [];
  if (args.mode === "both") {
    for (let pair = 1; pair <= args.pairs; pair += 1) {
      const prefix = `pair-${String(pair).padStart(2, "0")}`;
      capturePlan.push(
        { lane: `${prefix}-off-a`, mode: "off" },
        { lane: `${prefix}-on-a`, mode: "on" },
        { lane: `${prefix}-on-b`, mode: "on" },
        { lane: `${prefix}-off-b`, mode: "off" },
      );
    }
  } else capturePlan.push({ lane: args.mode, mode: args.mode });
  const results = [];
  let servedClosure = null;
  try {
    for (const lane of capturePlan) {
      console.log(`trace Firefox Mario: ${lane.lane} (${lane.mode})`);
      const result = await traceMode({ ...args, ...lane, playwright, origin: server.origin, out });
      const profile = result.profilePath ? profileInventory(result.profilePath) : null;
      const profileInventoryPath = profile
        ? join(out, lane.lane, `firefox-${lane.mode}.profile-inventory.json`)
        : null;
      if (profileInventoryPath) writeJson(profileInventoryPath, profile);
      results.push(Object.freeze({ ...result, profileInventoryPath, profile }));
    }
  } finally {
    servedClosure = server.manifest();
    await server.close();
  }
  const runComparison = comparison(results);
  const fullGate = args.mode === "both"
    && args.frames >= 820
    && args.pairs >= 2
    && !args.profile;
  const status = args.mode === "both" && !runComparison?.qualified
    ? "UNQUALIFIED"
    : args.profile
      ? "PROFILE_COMPLETE"
      : args.mode === "both"
        ? fullGate ? "COMPLETE" : "SMOKE_COMPLETE"
        : "CAPTURE_COMPLETE";
  const run = Object.freeze({
    schema: TRACE_SCHEMA,
    status,
    runId,
    createdAt: new Date().toISOString(),
    outputDirectory: out,
    host: Object.freeze({ platform: platform(), release: release(), node: process.version }),
    configuration: Object.freeze({
      mode: args.mode,
      frames: args.frames,
      warmup: args.warmup,
      trials: args.trials,
      pairs: args.pairs,
      headless: args.headless,
      profile: args.profile,
      captureOrder: capturePlan.map(({ lane, mode }) => Object.freeze({ lane, mode })),
      playwrightModule: playwrightModulePath,
      playwrightVersion: playwrightPackage.version,
      fullGate,
      serverInstrumentation: server.schema,
    }),
    sources: sourceIdentities,
    servedClosure,
    modes: Object.freeze(results.map((result) => Object.freeze({
      mode: result.mode,
      lane: result.lane,
      session: result.session,
      browserVersion: result.browserVersion,
      profilePath: result.profilePath ? relative(out, result.profilePath) : null,
      profileInventoryPath: result.profileInventoryPath ? relative(out, result.profileInventoryPath) : null,
      screenshotPath: relative(out, result.screenshotPath),
      finalScreenshotPath: relative(out, result.finalScreenshotPath),
      resultPath: relative(out, result.resultPath),
      browserLogPath: relative(out, result.browserLogPath),
      pageResult: result.pageResult,
      profile: result.profile,
    }))),
    comparison: runComparison,
  });
  writeJson(join(out, "manifest.json"), run);
  writeFileSync(join(out, "README.md"), markdown(run));
  console.log(`Firefox Mario trace: ${status}`);
  console.log(`evidence: ${out}`);
  if (status === "UNQUALIFIED") {
    throw new Error("OFF/ON workload equivalence failed; see the written evidence manifest");
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
