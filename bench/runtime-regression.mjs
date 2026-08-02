import { installCornerfill } from "../src/index.mjs";

const backend = new URL(location.href).searchParams.get("backend") ?? "static-data-url";
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function options(extra = {}) {
  return {
    document,
    forceFallback: true,
    backend,
    staticFallback: backend === "static-data-url",
    observe: false,
    ...extra,
  };
}

function host(root = document.body, id = "") {
  const element = document.createElement("div");
  if (id) element.id = id;
  Object.assign(element.style, {
    width: "12px",
    height: "10px",
    backgroundColor: "rgb(255, 0, 0)",
  });
  root.append(element);
  return element;
}

function raster(width, height, color = "#0af") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function preparedConfig(image = raster(32, 32)) {
  return {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: {
      kind: "image",
      image,
      backgroundSize: [32, 32],
      backgroundPosition: [0, 0],
      repeat: "no-repeat",
      opaque: true,
    },
  };
}

async function test(name, operation) {
  await operation();
  results.push(Object.freeze({ name, status: "PASS" }));
}

async function waitFor(predicate, label) {
  const deadline = performance.now() + 10_000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`${label} timed out`);
    await new Promise(requestAnimationFrame);
  }
}

await test("disposed generic initialization cannot resurrect", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  handle.dispose();
  const explanation = await handle.ready;
  assert(explanation.status === "disposed", "generic ready must resolve disposed");
  assert(controller.stats().entries === 0 && controller.stats().surfaces === 0, "generic dispose leaked runtime state");
  assert(!element.hasAttribute("data-cornerfill-owned"), "generic dispose resurrected ownership");
  controller.destroy();
  element.remove();
});

await test("physical and logical declaration carriers resolve on the retained element", async () => {
  const element = host();
  element.style.direction = "rtl";
  element.style.setProperty("--cornerfill-border-radius", "2px");
  element.style.setProperty("--cornerfill-border-top-left-radius", "3px 4px");
  element.style.setProperty("--cornerfill-border-start-start-radius", "5px 6px");
  element.style.setProperty("--cornerfill-corner-shape", "round");
  element.style.setProperty("--cornerfill-corner-top-left-shape", "bevel");
  element.style.setProperty("--cornerfill-corner-start-start-shape", "scoop");
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    paint: { kind: "solid", color: "#f00" },
  });
  await handle.ready;
  const geometry = handle.explain().geometry;
  equal(geometry.radii, [
    { rx: 3, ry: 4 },
    { rx: 5, ry: 6 },
    { rx: 2, ry: 2 },
    { rx: 2, ry: 2 },
  ], "declaration radius carriers mapped incorrectly");
  equal(geometry.shapeParameters, [0, -1, 1, 1], "declaration shape carriers mapped incorrectly");
  const paintsBeforeInterpolation = handle.explain().counters.paints;
  await handle.interpolateCornerShape("scoop", "squircle", 0.5);
  const interpolated = handle.explain();
  assert(interpolated.geometry.shapeParameters.every((value) => (
    Math.abs(value - 0.28833415474651186) < 1e-12
  )), "interpolated shape did not use diagonal coordinates");
  assert(interpolated.counters.paints === paintsBeforeInterpolation + 1, "changed interpolation did not repaint once");
  await handle.interpolateCornerShape("scoop", "squircle", 0.5);
  assert(handle.explain().counters.paints === interpolated.counters.paints, "unchanged interpolation repainted");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("raster repeat respects content-box origin and clip", async () => {
  const element = host();
  Object.assign(element.style, { boxSizing: "border-box", padding: "2px" });
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "4px",
    cornerShape: "bevel",
    paint: {
      kind: "image",
      image: raster(2, 2),
      backgroundSize: [2, 2],
      backgroundPosition: [0, 0],
      backgroundOrigin: "content-box",
      backgroundClip: "content-box",
      repeat: "repeat",
    },
  });
  await handle.ready;
  const layer = handle.explain().paint.layer;
  assert(layer.tilesDrawn === 12, `content-box repeat drew ${layer.tilesDrawn} tiles instead of 12`);
  equal(layer.destinationRect, [2, 2, 2, 2], "content-box tile origin was wrong");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("mixed raster and CSS gradient layers paint in one owned surface", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "4px",
    cornerShape: "bevel",
    paint: {
      kind: "layers",
      color: "#102030",
      layers: [
        { kind: "linear-gradient", css: "linear-gradient(to right, rgba(255,0,0,.6), rgba(0,0,255,.2))" },
        { kind: "radial-gradient", css: "radial-gradient(circle closest-side at 30% 60%, white 0%, transparent 100%)" },
        { kind: "conic-gradient", css: "conic-gradient(from 45deg, red 0deg, lime 120deg, blue 1turn)" },
        {
          kind: "image",
          image: raster(2, 2),
          backgroundSize: [2, 2],
          backgroundPosition: [0, 0],
          repeat: "repeat",
        },
      ],
    },
  });
  await handle.ready;
  const painted = handle.explain().paint.layer;
  equal(painted.layers.map(({ kind }) => kind), [
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "image",
  ], "background layer order changed");
  assert(painted.layers[3].tilesDrawn === 30, "bottom raster layer did not repeat across the surface");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("unequal solid borders use the shaped inner contour", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "5px 4px 3px 2px",
    cornerShape: "squircle bevel scoop notch",
    paint: { kind: "solid", color: "#246" },
    border: { widths: [1, 2, 3, 1], color: "#fed" },
  });
  await handle.ready;
  const explanation = handle.explain();
  equal(explanation.border.widths, [1, 2, 3, 1], "unequal border widths were not retained");
  assert(explanation.paint.border.kind === "solid-shaped-ring", "border did not use the shaped ring painter");
  handle.dispose();

  const unsupported = host();
  let rejection = null;
  try {
    controller.attach(unsupported, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
      border: { width: 1, colors: ["red", "blue", "red", "blue"] },
    });
  } catch (error) {
    rejection = error;
  }
  assert(/per-side colors/u.test(rejection?.message ?? ""), "per-side border colors did not fail explicitly");
  controller.destroy();
  element.remove();
  unsupported.remove();
});

await test("contained inset shadow and outline are owned shaped rings", async () => {
  const element = host();
  element.style.boxShadow = "inset 0 0 0 2px rgba(255, 0, 0, 0.7)";
  element.style.outline = "2px solid rgb(0, 255, 255)";
  element.style.outlineOffset = "-2px";
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "scoop",
    paint: { kind: "solid", color: "#246" },
  });
  await handle.ready;
  const explanation = handle.explain();
  assert(explanation.paint.shadow.kind === "inset-solid-ring", "inset shadow was not painted as a ring");
  assert(explanation.paint.outline.kind === "contained-solid-ring", "outline was not painted as a ring");
  assert(getComputedStyle(element).boxShadow === "none", "native box shadow remained visible");
  assert(getComputedStyle(element).outlineStyle === "none", "native outline remained visible");
  handle.dispose();

  const unsupported = host();
  unsupported.style.boxShadow = "0 0 2px red";
  let rejection = null;
  try {
    controller.attach(unsupported, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    rejection = error;
  }
  assert(/cannot paint beyond the border box/u.test(rejection?.message ?? ""), "outer shadow did not fail explicitly");
  controller.destroy();
  element.remove();
  unsupported.remove();
});

await test("native composition stays on the host and semantic-only boxes refuse fallback", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-composition::before{content:'';position:absolute;inset:2px;background:rgba(255,255,255,.1)}.cornerfill-composition.checked{isolation:isolate}";
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-composition";
  Object.assign(element.style, {
    position: "relative",
    opacity: "0.7",
    filter: "opacity(0.9)",
    mixBlendMode: "multiply",
    isolation: "isolate",
    zIndex: "3",
    transform: "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,2,3,0,1)",
  });
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#246" },
  });
  await handle.ready;
  const initial = handle.explain();
  const computed = getComputedStyle(element);
  assert(computed.opacity === "0.7", "host opacity was overwritten");
  assert(computed.filter === "opacity(0.9)", "host filter was overwritten");
  assert(computed.mixBlendMode === "multiply", "host blend context was overwritten");
  assert(getComputedStyle(element, "::before").content !== "none", "host pseudo-element disappeared");
  assert(initial.composition.transform === "browser-compositor", "composition capability was not reported");

  element.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,4,5,0,1)";
  element.style.opacity = "0.6";
  element.style.filter = "opacity(0.8)";
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  assert(handle.explain().counters.paints === initial.counters.paints, "compositor-only style changes repainted");
  const checksBeforeClass = handle.explain().counters.styleChecks;
  element.classList.add("checked");
  await waitFor(() => handle.explain().counters.styleChecks > checksBeforeClass, "composition class check");
  assert(handle.explain().counters.paints === initial.counters.paints, "composition-only class change repainted");
  handle.dispose();

  const replaced = document.createElement("img");
  Object.assign(replaced.style, { width: "12px", height: "10px" });
  document.body.append(replaced);
  let replacedError = null;
  try {
    controller.attach(replaced, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    replacedError = error;
  }
  assert(/replaced-element pixels/u.test(replacedError?.message ?? ""), "replaced host did not fail explicitly");

  const overflow = host();
  overflow.style.overflow = "hidden";
  overflow.append(document.createElement("span"));
  let overflowError = null;
  try {
    controller.attach(overflow, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    overflowError = error;
  }
  assert(/descendant overflow clip/u.test(overflowError?.message ?? ""), "overflow host did not fail explicitly");

  const fragmentContainer = document.createElement("div");
  fragmentContainer.style.width = "42px";
  const fragmented = document.createElement("span");
  fragmented.textContent = "one two three four";
  fragmentContainer.append(fragmented);
  document.body.append(fragmentContainer);
  assert(fragmented.getClientRects().length > 1, "fragment fixture did not create multiple boxes");
  let fragmentError = null;
  try {
    controller.attach(fragmented, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    fragmentError = error;
  }
  assert(/multi-fragment/u.test(fragmentError?.message ?? ""), "fragmented host did not fail explicitly");

  controller.destroy();
  style.remove();
  element.remove();
  replaced.remove();
  overflow.remove();
  fragmentContainer.remove();
});

await test("disposed prepared initialization cannot resurrect", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  handle.dispose();
  const explanation = await handle.ready;
  assert(explanation.status === "disposed", "prepared ready must resolve disposed");
  assert(controller.stats().entries === 0 && controller.stats().surfaces === 0, "prepared dispose leaked runtime state");
  assert(!element.hasAttribute("data-cornerfill-owned"), "prepared dispose resurrected ownership");
  controller.destroy();
  element.remove();
});

await test("async refresh commits only the newest revision", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  await handle.ready;
  const originalDecode = Image.prototype.decode;
  const gates = new Map();
  Image.prototype.decode = function decodeWithGate() {
    const image = this;
    return originalDecode.call(image).then(() => new Promise((resolve) => gates.set(image.src, resolve)));
  };
  try {
    const firstUrl = raster(2, 2, "#f00").toDataURL();
    const secondUrl = raster(3, 3, "#0f0").toDataURL();
    const paint = (url) => ({
      kind: "image",
      url,
      backgroundSize: [12, 10],
      backgroundPosition: [0, 0],
      repeat: "no-repeat",
      opaque: true,
    });
    const first = handle.update({ paint: paint(firstUrl) });
    await waitFor(() => gates.has(firstUrl), "first image decode gate");
    const second = handle.update({ paint: paint(secondUrl) });
    gates.get(firstUrl)();
    await waitFor(() => gates.has(secondUrl), "second image decode gate");
    gates.get(secondUrl)();
    await Promise.all([first, second]);
    equal(handle.explain().paint.layer.imageSize, [3, 3], "stale image revision won");
    assert(handle.explain().counters.paints === 2, "stale refresh performed a visible paint");
  } finally {
    Image.prototype.decode = originalDecode;
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("prepared batches validate before mutating", async () => {
  const element = host();
  const unattached = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  const before = handle.explain();
  let error = null;
  try {
    controller.updatePreparedBatch([
      { element, backgroundPosition: [-1, 0] },
      { element: unattached, visible: false },
    ]);
  } catch (caught) {
    error = caught;
  }
  assert(error, "invalid prepared batch was accepted");
  equal(handle.explain().prepared.backgroundPosition, before.prepared.backgroundPosition, "failed batch mutated crop state");
  assert(handle.explain().counters.paints === before.counters.paints, "failed batch painted");
  assert(controller.flushPrepared() === 0, "failed batch leaked dirty work");
  handle.dispose();
  controller.destroy();
  element.remove();
  unattached.remove();
});

await test("prepared errors do not poison later successful state", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  let error = null;
  try { controller.setPreparedBackgroundPosition(element, 1, 0); } catch (caught) { error = caught; }
  assert(error instanceof RangeError, "invalid crop did not fail before mutation");
  controller.setPreparedBackgroundPosition(element, -1, 0);
  controller.flushPrepared();
  assert(handle.explain().status === "active" && handle.explain().error === null, "successful crop retained current error state");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("prepared layout resize rebuilds once and crop remains paint-only", async () => {
  const element = host();
  element.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,4,5,0,1)";
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  const before = handle.explain().counters.paints;
  await handle.resize({ size: [15, 11], dpr: 2 });
  const resized = handle.explain();
  equal([resized.geometry.width, resized.geometry.height, resized.geometry.dpr], [15, 11, 2], "prepared geometry did not resize");
  equal([resized.surface.size.backingWidth, resized.surface.size.backingHeight], [30, 22], "prepared backing did not resize for DPR");
  assert(resized.counters.paints === before + 1, "prepared layout change did not repaint exactly once");
  const afterLayout = resized.counters.paints;
  controller.updatePreparedBatch([{ element, backgroundPosition: [-1, 0] }]);
  assert(handle.explain().counters.paints === afterLayout + 1, "prepared crop did not use one retained repaint");
  assert(element.style.transform.startsWith("matrix3d("), "Cornerfill modified the original transform");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("shadow-root ownership paints and verifies", async () => {
  const shell = host();
  const shadow = shell.attachShadow({ mode: "open" });
  const element = host(shadow);
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  await handle.ready;
  assert(getComputedStyle(element).backgroundImage !== "none", "shadow-root live image did not paint");
  assert(handle.verify().ownershipVerified, "shadow-root ownership did not verify");
  handle.dispose();
  controller.destroy();
  shell.remove();
});

await test("higher-specificity author important ownership is rejected", async () => {
  const style = document.createElement("style");
  style.textContent = "#important-owner{background-image:none!important;background-color:red!important}";
  document.head.append(style);
  const element = host(document.body, "important-owner");
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  let error = null;
  try { await handle.ready; } catch (caught) { error = caught; }
  assert(error instanceof TypeError, "author !important conflict was not rejected");
  assert(handle.explain().status === "error", "ownership conflict was not reported");
  handle.dispose();
  controller.destroy();
  element.remove();
  style.remove();
});

await test("controllers reject conflicts and stale handles cannot detach replacements", async () => {
  const element = host();
  const firstController = installCornerfill(options());
  const secondController = installCornerfill(options());
  const first = firstController.attachPrepared(element, preparedConfig());
  await first.ready;
  let conflict = null;
  try { secondController.attachPrepared(element, preparedConfig()); } catch (error) { conflict = error; }
  assert(conflict, "second controller claimed an already-owned element");
  first.dispose();
  const second = secondController.attachPrepared(element, preparedConfig());
  await second.ready;
  first.dispose();
  assert(secondController.stats().entries === 1, "stale handle detached a replacement entry");
  second.dispose();
  firstController.destroy();
  secondController.destroy();
  element.remove();
});

await test("solid prepared visibility batches do not require an image program", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  await handle.ready;
  controller.updatePreparedBatch([{ element, visible: false }]);
  controller.updatePreparedBatch([{ element, visible: true }]);
  assert(handle.explain().status === "active", "solid visibility batch failed");
  handle.dispose();
  controller.destroy();
  element.remove();
});

const report = Object.freeze({
  schema: "cornerfill-runtime-browser-regressions@1",
  backend,
  userAgent: navigator.userAgent,
  tests: Object.freeze(results),
});
globalThis.__CORNERFILL_RUNTIME_REGRESSIONS__ = report;
document.querySelector("#status").textContent = `PASS ${results.length}`;
document.documentElement.dataset.runtimeRegressions = "pass";
