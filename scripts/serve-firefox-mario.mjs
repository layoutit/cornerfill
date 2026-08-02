#!/usr/bin/env node
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARIO_SERVER_INSTRUMENTATION_SCHEMA,
  startMarioServer,
} from "./mario-server.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const CSSGRAPHICS_ROOT = "/Users/ekrof/fed/cssGraphics";
const DEFAULT_MARIO_ROOT = join(CSSGRAPHICS_ROOT, ".local/codepen-mario/codepen");
const DEFAULT_VENDOR_ROOT = join(CSSGRAPHICS_ROOT, "node_modules");

function positivePort(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new TypeError(`invalid port: ${value}`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    port: 8768,
    marioRoot: process.env.CORNERFILL_MARIO_ROOT || DEFAULT_MARIO_ROOT,
    vendorRoot: process.env.CORNERFILL_VENDOR_ROOT || DEFAULT_VENDOR_ROOT,
  };
  for (const argument of argv) {
    if (argument.startsWith("--port=")) options.port = positivePort(argument.slice("--port=".length));
    else if (argument.startsWith("--mario-root=")) options.marioRoot = resolve(argument.slice("--mario-root=".length));
    else if (argument.startsWith("--vendor-root=")) options.vendorRoot = resolve(argument.slice("--vendor-root=".length));
    else throw new TypeError(`unknown option: ${argument}`);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));
for (const path of [options.marioRoot, options.vendorRoot]) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`required directory is unavailable: ${path}`);
  }
}
const polycssRoot = realpathSync(join(options.vendorRoot, "@layoutit/polycss"));
const server = await startMarioServer({
  marioRoot: options.marioRoot,
  projectRoot: PROJECT_ROOT,
  vendorRoots: {
    polycss: polycssRoot,
    polycssMorph: realpathSync(join(options.vendorRoot, "@layoutit/polycss-morph")),
    polycssCore: realpathSync(join(dirname(polycssRoot), "polycss-core")),
  },
  port: options.port,
  autoCornerfill: true,
});

console.log(`Cornerfill Firefox Mario preview: ${server.origin}/mario/`);
console.log(`Instrumentation: ${MARIO_SERVER_INSTRUMENTATION_SCHEMA}`);
console.log(`PID: ${process.pid}`);

let closing = false;
async function close(signal) {
  if (closing) return;
  closing = true;
  console.log(`Closing exact preview server on ${signal}`);
  await server.close();
}
process.once("SIGINT", () => { close("SIGINT").catch((error) => { console.error(error); process.exitCode = 1; }); });
process.once("SIGTERM", () => { close("SIGTERM").catch((error) => { console.error(error); process.exitCode = 1; }); });
