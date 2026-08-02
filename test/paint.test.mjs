import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreparedOpaqueImageProgram,
  drawPreparedOpaqueImage,
  explainPreparedOpaqueImage,
  preparePreparedOpaqueImageContext,
  repaintPreparedOpaqueImage,
} from "../src/paint.mjs";

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
