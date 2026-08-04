import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreparedOpaqueImageProgram,
  drawPreparedOpaqueImage,
  explainPreparedOpaqueImage,
  isFullyTransparentCssColor,
  paintCornerfill,
  paintOwnedLayer,
  preparePreparedOpaqueImageContext,
} from "../dist/paint.mjs";
import { buildCornerGeometry } from "../dist/geometry.mjs";
import { normalizePaintDescriptor, resolvePaintForBox } from "../dist/background.mjs";

test("transparent CSS color serialization is recognized without parsing opaque colors", () => {
  for (const color of [
    "transparent",
    "rgba(1, 2, 3, 0)",
    "rgb(1 2 3 / 0%)",
    "hsl(120 50% 50% / 0.0)",
    "color(display-p3 1 0 0 / 0)",
  ]) assert.equal(isFullyTransparentCssColor(color), true, color);
  for (const color of ["red", "rgb(1 2 3 / .1)", "rgba(1, 2, 3, 1)"]) {
    assert.equal(isFullyTransparentCssColor(color), false, color);
  }
});

function contextRecorder() {
  const calls = [];
  return {
    calls,
    save() { calls.push(["save"]); },
    restore() { calls.push(["restore"]); },
    setTransform(...values) { calls.push(["setTransform", ...values]); },
    set globalCompositeOperation(value) { calls.push(["globalCompositeOperation", value]); },
    set imageSmoothingEnabled(value) { calls.push(["imageSmoothingEnabled", value]); },
    drawImage(...values) { calls.push(["drawImage", ...values]); },
  };
}

test("prepared opaque crop repaints the retained contour with numeric source coordinates", () => {
  const image = { width: 4852, height: 3280 };
  const geometry = { width: 64, height: 44, dpr: 1 };
  const program = createPreparedOpaqueImageProgram({
    geometry,
    paint: {
      kind: "image",
      image,
      opaque: true,
      sourceSize: [4852, 3280],
      backgroundSize: [77632, 36080],
      backgroundPosition: [-448, 0],
      imageSmoothing: true,
    },
  });
  const context = contextRecorder();
  preparePreparedOpaqueImageContext(context, program);
  drawPreparedOpaqueImage(context, program, -512, 0);
  const draw = context.calls.find(([name]) => name === "drawImage");
  assert.deepEqual(draw, ["drawImage", image, 32, 0, 4, 4, 0, 0, 64, 44]);
  assert.deepEqual(explainPreparedOpaqueImage(program, -512, 0).layer.sourceRect, [32, 0, 4, 4]);
});

test("prepared opaque updates reject positions that expose stale pixels", () => {
  const program = createPreparedOpaqueImageProgram({
    geometry: { width: 10, height: 10, dpr: 1 },
    paint: {
      kind: "image",
      image: { width: 10, height: 10 },
      opaque: true,
      backgroundSize: [10, 10],
      backgroundPosition: [0, 0],
    },
  });
  assert.throws(
    () => drawPreparedOpaqueImage(contextRecorder(), program, 1, 0),
    /no longer covers/u,
  );
});

test("prepared retained-surface crop hot path is exactly one draw call", () => {
  const image = { width: 100, height: 100 };
  const program = createPreparedOpaqueImageProgram({
    geometry: { width: 10, height: 10, dpr: 2 },
    paint: {
      kind: "image",
      image,
      opaque: true,
      backgroundSize: [200, 200],
      backgroundPosition: [-20, -20],
      imageSmoothing: false,
    },
  });
  const context = contextRecorder();
  preparePreparedOpaqueImageContext(context, program);
  context.calls.length = 0;
  drawPreparedOpaqueImage(context, program, -40, -60);
  assert.deepEqual(context.calls, [["drawImage", image, 20, 30, 5, 5, 0, 0, 10, 10]]);
});

test("zero-sized no-repeat raster paint draws no image", () => {
  const calls = [];
  const context = {
    drawImage(...args) { calls.push(args); },
    imageSmoothingEnabled: true,
  };
  const image = { width: 10, height: 10 };
  const paint = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: [0, 0],
    backgroundPosition: [0, 0],
    repeat: "no-repeat",
  }), 100, 80, image);
  const result = paintOwnedLayer(context, paint, 100, 80);
  assert.equal(calls.length, 0);
  assert.equal(result.sourceRect, null);
  assert.equal(result.destinationRect, null);
});

test("degenerate radial gradients retain circle, zero-width, and zero-height semantics", () => {
  const calls = [];
  const gradient = (kind) => ({
    addColorStop(offset, color) { calls.push([kind, "stop", offset, color]); },
  });
  const context = {
    createLinearGradient(...args) { calls.push(["linear", ...args]); return gradient("linear"); },
    createRadialGradient(...args) { calls.push(["radial", ...args]); return gradient("radial"); },
    fillRect(...args) { calls.push(["fillRect", ...args]); },
    restore() { calls.push(["restore"]); },
    save() { calls.push(["save"]); },
    scale(...args) { calls.push(["scale", ...args]); },
    translate(...args) { calls.push(["translate", ...args]); },
    set fillStyle(value) { calls.push(["fillStyle", value]); },
  };
  const base = {
    kind: "radial-gradient",
    gradientCenter: [5, 5],
    stops: [[0, "red"], [1, "blue"]],
  };
  paintOwnedLayer(context, { ...base, shape: "circle", gradientRadii: [0, 0] }, 10, 10);
  assert(calls.some(([name]) => name === "radial"), "zero circle did not retain a tiny radial shape");
  calls.length = 0;
  paintOwnedLayer(context, { ...base, shape: "ellipse", gradientRadii: [0, 20] }, 10, 10);
  assert(calls.some(([name]) => name === "linear"), "zero-width ellipse was not mirrored horizontally");
  calls.length = 0;
  paintOwnedLayer(context, { ...base, shape: "ellipse", gradientRadii: [20, 0] }, 10, 10);
  assert(!calls.some(([name]) => name === "linear" || name === "radial"));
  assert(calls.some(([name, value]) => name === "fillStyle" && value === "blue"));
});

test("multiply uses Canvas compositing only on the admitted raster layer", () => {
  const image = { width: 4, height: 4 };
  const context = contextRecorder();
  const result = paintOwnedLayer(context, {
    kind: "image",
    image,
    backgroundSize: [4, 4],
    tilePlan: { x: [0], y: [0] },
    repeat: { x: "no-repeat", y: "no-repeat" },
    blendMode: "multiply",
  }, 4, 4);
  assert.equal(result.blendMode, "multiply");
  assert.deepEqual(context.calls, [
    ["save"],
    ["globalCompositeOperation", "multiply"],
    ["imageSmoothingEnabled", true],
    ["drawImage", image, 0, 0, 4, 4, 0, 0, 4, 4],
    ["restore"],
  ]);
});

function assertUnsupportedInsetPaint({ width, height, borderRadius, cornerShape, widths }) {
  const geometry = buildCornerGeometry({ width, height, borderRadius, cornerShape });
  const context = contextRecorder();
  const paint = () => paintCornerfill(context, {
    geometry,
    paint: { kind: "solid", color: "#123456" },
    border: {
      widths,
      styles: ["solid", "solid", "solid", "solid"],
      color: "#abcdef",
    },
  });
  assert.throws(paint, /shaped inset contour self-intersects after clipping and is unsupported/u);
  assert.throws(paint, /shaped inset contour self-intersects after clipping and is unsupported/u);
  assert.deepEqual(context.calls, []);
}

test("global clipped-contour crossings are refused before surface mutation", () => {
  assertUnsupportedInsetPaint({
    width: 39.105241601622424,
    height: 211.3169662447694,
    borderRadius: [
      { rx: 1.3225144041088894, ry: 153.08962407738628 },
      { rx: 5.57310388412243, ry: 184.650892110809 },
      { rx: 16.512622098688556, ry: 39.40128968658898 },
      { rx: 7.304793159782682, ry: 87.42960496571885 },
    ],
    cornerShape: [8, -2, 2, -2],
    widths: [8.34886265579794, 5.063831898145306, 65.41168509124148, 20.733630000645288],
  });
});

test("zero-inset topology is refused before surface mutation", () => {
  const geometry = buildCornerGeometry({
    width: 100,
    height: 100,
    borderRadius: "90px",
    cornerShape: "notch round notch round",
  });
  const context = contextRecorder();
  const paint = () => paintCornerfill(context, {
    geometry,
    paint: { kind: "solid", color: "#123456" },
  });
  assert.throws(paint, /shaped inset contour self-intersects after clipping and is unsupported/u);
  assert.deepEqual(context.calls, []);
});
