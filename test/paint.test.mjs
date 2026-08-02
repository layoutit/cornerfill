import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreparedOpaqueImageProgram,
  drawPreparedOpaqueImage,
  explainPreparedOpaqueImage,
  paintCornerfill,
  paintOwnedLayer,
  preparePreparedOpaqueImageContext,
  repaintPreparedOpaqueImage,
} from "../src/paint.mjs";
import { buildCornerGeometry } from "../src/geometry.mjs";

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
  repaintPreparedOpaqueImage(context, program, -512, 0);
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
    () => repaintPreparedOpaqueImage(contextRecorder(), program, 1, 0),
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

test("crossing all-scoop inset geometry is refused before surface mutation", () => {
  assertUnsupportedInsetPaint({
    width: 100,
    height: 10,
    borderRadius: "20px / 80px",
    cornerShape: [-1, -1, -1, -1],
    widths: [1, 2, 5, 1],
  });
});

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
