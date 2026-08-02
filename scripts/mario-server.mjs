import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

export const MARIO_PREPARED_BRIDGE = "__CORNERFILL_MARIO_PREPARED__";
export const MARIO_SOURCE_TICK = "__CORNERFILL_MARIO_SOURCE_TICK__";
export const MARIO_SOURCE_STATE = "__CORNERFILL_MARIO_SOURCE_STATE__";
export const MARIO_RUNTIME_ERROR = "__CORNERFILL_MARIO_RUNTIME_ERROR__";
export const MARIO_SERVER_INSTRUMENTATION_SCHEMA = "cornerfill-mario-direct-prepared-bridge@3";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
});

function replaceExactly(source, needle, replacement, expected, label) {
  const matches = source.split(needle).length - 1;
  if (matches !== expected) {
    throw new Error(`Mario instrumentation expected ${expected} ${label} match(es), got ${matches}`);
  }
  return source.split(needle).join(replacement);
}

function instrumentScene(source) {
  let output = replaceExactly(
    source,
    `function writeStyle(element, property, value) {\n  if (element.style[property] !== value) element.style[property] = value;\n}`,
    `function writeStyle(element, property, value) {\n  if (element.style[property] !== value) element.style[property] = value;\n}\nfunction writePreparedLeafVisibility(element, value) {\n  element.style.visibility = value;\n  globalThis.${MARIO_PREPARED_BRIDGE}?.setVisibility?.(element, value !== "hidden");\n}\nfunction writePreparedLeafBackgroundPositionY(element, value) {\n  const handled = globalThis.${MARIO_PREPARED_BRIDGE}?.setBackgroundPositionY?.(element, value) === true;\n  if (!handled) element.style.backgroundPositionY = value;\n}`,
    1,
    "scene helper",
  );
  output = replaceExactly(
    output,
    `    element.style.visibility = visible[index] === 1 ? "visible" : "hidden";`,
    `    writePreparedLeafVisibility(element, visible[index] === 1 ? "visible" : "hidden");`,
    1,
    "initial leaf visibility",
  );
  output = replaceExactly(
    output,
    `    leaves[index].style.visibility = shouldShow ? "visible" : "hidden";`,
    `    writePreparedLeafVisibility(leaves[index], shouldShow ? "visible" : "hidden");`,
    1,
    "leaf visibility writer",
  );
  output = replaceExactly(
    output,
    `        leaves[index].style.visibility = "hidden";`,
    `        writePreparedLeafVisibility(leaves[index], "hidden");`,
    2,
    "hidden leaf writer",
  );
  output = replaceExactly(
    output,
    `      leaves[index].style.backgroundPositionY = light.positions[face.stateOffset + state];`,
    `      writePreparedLeafBackgroundPositionY(leaves[index], light.positions[face.stateOffset + state]);`,
    1,
    "prepared crop writer",
  );
  return output;
}

function instrumentAnimation(source) {
  return replaceExactly(
    source,
    `        tick += 1;\n        if (experienceMode === "animation") advanceAnimation();\n        else advanceInteraction();\n        nextTick += SOURCE_TICK_MS;`,
    `        tick += 1;\n        const preparedBridge = globalThis.${MARIO_PREPARED_BRIDGE};\n        preparedBridge?.beginFrame?.();\n        try {\n          if (experienceMode === "animation") advanceAnimation();\n          else advanceInteraction();\n          preparedBridge?.endFrame?.();\n          const completedTick = (globalThis.${MARIO_SOURCE_TICK} ?? 0) + 1;\n          globalThis.${MARIO_SOURCE_TICK} = completedTick;\n          globalThis.${MARIO_SOURCE_STATE} = Object.freeze({\n            completedTick,\n            clockTick: tick,\n            playbackTick: playback.tick,\n            sourceFrame: playback.sourceFrame,\n            experienceMode\n          });\n        } catch (error) {\n          preparedBridge?.abortFrame?.(error);\n          globalThis.${MARIO_RUNTIME_ERROR} = Object.freeze({\n            name: error?.name ?? "Error",\n            message: error?.message ?? String(error),\n            stack: error?.stack ?? null\n          });\n          throw error;\n        }\n        nextTick += SOURCE_TICK_MS;`,
    1,
    "animation frame boundary",
  );
}

export function instrumentMarioModule(relativePath, source) {
  if (relativePath === "runtime/scene.js") return instrumentScene(source);
  if (relativePath === "runtime/animation.js") return instrumentAnimation(source);
  return source;
}

function localIndex(sourceIndex, { autoCornerfill }) {
  const importMap = JSON.stringify({
    imports: {
      "@layoutit/polycss": "/vendor/polycss/dist/index.js",
      "@layoutit/polycss-morph": "/vendor/polycss-morph/dist/index.js",
      "@layoutit/polycss-core": "/vendor/polycss-core/dist/index.js",
    },
  });
  let output = sourceIndex.replace(
    /<script type="importmap">[\s\S]*?<\/script>/u,
    `<script type="importmap">${importMap}</script>`,
  );
  if (output === sourceIndex) throw new Error("Mario index has no replaceable import map");
  if (!autoCornerfill) return output;
  const boot = `
<style>#cornerfill-status{position:fixed;z-index:2147483647;top:10px;left:10px;padding:6px 9px;border-radius:5px;background:#111c;color:#fff;font:12px/1.3 ui-monospace,monospace}</style>
<output id="cornerfill-status">Cornerfill: loading…</output>
<script type="module">
const badge=document.querySelector("#cornerfill-status");
let installedTrace=null;
try {
  while(document.documentElement.dataset.modelReady===undefined&&!document.querySelector("#status[data-error]")) await new Promise(requestAnimationFrame);
  const error=document.querySelector("#status[data-error]");
  if(error) throw new Error(error.textContent);
  const module=await import("/cornerfill/bench/mario-firefox-trace.mjs");
  const summary=await module.installMarioFirefoxTrace({mode:"on",cornerfillModuleUrl:"/cornerfill/src/index.mjs",expectedFaceCount:1213});
  installedTrace=globalThis.__CORNERFILL_MARIO_TRACE__;
  const animation=document.querySelector('input[name="mode"][value="animation"]');
  if(animation&&!animation.checked){animation.checked=true;animation.dispatchEvent(new Event("change",{bubbles:true}));}
  badge.textContent="Cornerfill ready: "+(summary.backendCounts["moz-element"]??0)+" prepared faces";
  badge.style.background="#063d2dcc";
  document.documentElement.dataset.cornerfillPreviewReady="";
  addEventListener("pagehide",event=>{if(!event.persisted)installedTrace?.dispose();});
} catch(error) {
  try{globalThis.__CORNERFILL_MARIO_TRACE__?.dispose();}catch(cleanupError){console.error(cleanupError);}
  badge.textContent="Cornerfill error: "+error.message;
  badge.style.background="#651b1bcc";
  console.error(error);
}
<\/script>`;
  return output.replace("</body>", `${boot}</body>`);
}

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sendFile(response, path, bytes) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
  });
  response.end(bytes);
}

export async function startMarioServer({
  marioRoot,
  projectRoot,
  vendorRoots,
  port = 0,
  autoCornerfill = false,
} = {}) {
  const roots = Object.freeze({
    mario: resolve(marioRoot),
    project: resolve(projectRoot),
    polycss: resolve(vendorRoots.polycss),
    polycssMorph: resolve(vendorRoots.polycssMorph),
    polycssCore: resolve(vendorRoots.polycssCore),
  });
  const responseCache = new Map();
  const served = new Map();
  const makePayload = (pathname, path, { transform = null, label = null } = {}) => {
    let payload = responseCache.get(pathname);
    if (!payload) {
      const sourceBytes = readFileSync(path);
      const responseBytes = transform
        ? Buffer.from(transform(sourceBytes.toString("utf8")), "utf8")
        : sourceBytes;
      payload = Object.freeze({
        path,
        bytes: responseBytes,
        identity: Object.freeze({
          url: pathname,
          sourcePath: realpathSync(path),
          sourceBytes: sourceBytes.length,
          sourceSha256: sha256(sourceBytes),
          responseBytes: responseBytes.length,
          responseSha256: sha256(responseBytes),
          transformed: Boolean(transform),
          transform: label,
        }),
      });
      responseCache.set(pathname, payload);
    }
    const record = served.get(pathname) ?? { identity: payload.identity, requests: 0 };
    record.requests += 1;
    served.set(pathname, record);
    return payload;
  };
  const indexPath = join(roots.mario, "index.html");
  const indexOptions = {
    transform: (source) => localIndex(source, { autoCornerfill }),
    label: autoCornerfill ? "local-import-map-and-preview-boot" : "local-import-map",
  };
  makePayload("/mario/", indexPath, indexOptions);
  served.delete("/mario/");
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/" || url.pathname === "/mario" || url.pathname === "/mario/") {
        response.writeHead(200, { "cache-control": "no-store", "content-type": MIME_TYPES[".html"] });
        response.end(makePayload("/mario/", indexPath, indexOptions).bytes);
        return;
      }
      const routes = [
        ["/mario/", roots.mario, true],
        ["/cornerfill/", roots.project, false],
        ["/vendor/polycss-morph/", roots.polycssMorph, false],
        ["/vendor/polycss-core/", roots.polycssCore, false],
        ["/vendor/polycss/", roots.polycss, false],
      ];
      const route = routes.find(([prefix]) => url.pathname.startsWith(prefix));
      if (!route) {
        response.writeHead(404);
        response.end();
        return;
      }
      const [prefix, root, instrument] = route;
      const relativePath = decodeURIComponent(url.pathname.slice(prefix.length));
      const path = resolve(root, relativePath);
      if (!within(root, path)) {
        response.writeHead(403);
        response.end();
        return;
      }
      if (!existsSync(path) || !statSync(path).isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      const shouldInstrument = instrument && extname(path).toLowerCase() === ".js";
      const payload = makePayload(url.pathname, path, shouldInstrument ? {
        transform: (source) => instrumentMarioModule(relativePath, source),
        label: "mario-runtime-instrumentation",
      } : {});
      sendFile(response, path, payload.bytes);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mario server did not bind");
  return Object.freeze({
    schema: MARIO_SERVER_INSTRUMENTATION_SCHEMA,
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    manifest: () => Object.freeze({
      schema: "cornerfill-mario-served-closure@1",
      resources: Object.freeze([...served.values()]
        .map(({ identity, requests }) => Object.freeze({ ...identity, requests }))
        .sort((left, right) => left.url.localeCompare(right.url))),
    }),
    close: () => new Promise((resolvePromise, reject) => {
      server.close((error) => error ? reject(error) : resolvePromise());
    }),
  });
}
