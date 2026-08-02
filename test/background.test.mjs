import test from "node:test";
import assert from "node:assert/strict";
import {
  captureComputedPaint,
  normalizePaintDescriptor,
  parseBackgroundPosition,
  parseBackgroundRepeat,
  resolvePaintForBox,
} from "../src/background.mjs";

const image = Object.freeze({ width: 30, height: 15 });

test("background position resolves edge offsets and keyword order", () => {
  const descriptor = normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "20px 10px",
    backgroundPosition: "right 10px bottom 20%",
    backgroundOrigin: "content-box",
    backgroundClip: "padding-box",
    repeat: "no-repeat",
  });
  const resolved = resolvePaintForBox(descriptor, 100, 80, image, {
    border: [2, 4, 6, 8],
    padding: [10, 12, 14, 16],
  });
  assert.deepEqual(resolved.positioningArea, {
    name: "content-box",
    x: 24,
    y: 12,
    width: 60,
    height: 48,
    insets: [12, 16, 20, 24],
  });
  assert.deepEqual(resolved.clipArea, {
    name: "padding-box",
    x: 8,
    y: 2,
    width: 88,
    height: 72,
    insets: [2, 4, 6, 8],
  });
  assert.deepEqual(resolved.backgroundPosition, [54, 40.4]);
  assert.deepEqual(parseBackgroundPosition("center left"), parseBackgroundPosition("left center"));
});

test("repeat, round, and space produce bounded tile plans", () => {
  assert.deepEqual(parseBackgroundRepeat("repeat-x"), { x: "repeat", y: "no-repeat" });
  const round = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "30px auto",
    backgroundPosition: "center",
    repeat: "round no-repeat",
  }), 100, 40, image);
  assert.ok(Math.abs(round.backgroundSize[0] - 100 / 3) < 1e-12);
  assert.ok(Math.abs(round.backgroundSize[1] - 50 / 3) < 1e-12);
  assert.deepEqual(round.tilePlan.x, [0, 100 / 3, 200 / 3]);

  const spaced = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "30px 15px",
    backgroundPosition: "right bottom",
    repeat: "space no-repeat",
  }), 100, 40, image);
  assert.deepEqual(spaced.tilePlan.x, [0, 35, 70]);
  assert.deepEqual(spaced.tilePlan.y, [25]);
});

test("zero-sized raster backgrounds draw no tiles", () => {
  const resolved = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "0 0",
    repeat: "repeat",
  }), 100, 80, image);
  assert.deepEqual(resolved.tilePlan, { x: [], y: [] });
});

test("computed pixelated raster backgrounds disable Canvas smoothing", () => {
  const descriptor = captureComputedPaint({
    backgroundColor: "transparent",
    backgroundImage: 'url("/atlas.webp")',
    backgroundSize: "64px 64px",
    backgroundPosition: "0px 0px",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    backgroundBlendMode: "normal",
    backgroundAttachment: "scroll",
    imageRendering: "pixelated",
  });
  assert.equal(descriptor.imageSmoothing, false);
});

test("computed crisp-edge raster modes disable Canvas smoothing", () => {
  for (const imageRendering of ["crisp-edges", "-webkit-optimize-contrast"]) {
    const paint = captureComputedPaint({
      backgroundAttachment: "scroll",
      backgroundBlendMode: "normal",
      backgroundClip: "border-box",
      backgroundColor: "transparent",
      backgroundImage: 'url("atlas.png")',
      backgroundOrigin: "padding-box",
      backgroundPosition: "0% 0%",
      backgroundRepeat: "no-repeat",
      backgroundSize: "auto",
      imageRendering,
    });
    assert.equal(paint.imageSmoothing, false, `${imageRendering} enabled smoothing`);
  }
});

test("linear, radial, and conic layers retain CSS order and per-layer geometry", () => {
  const descriptor = captureComputedPaint({
    backgroundImage: "linear-gradient(to right, red 0%, blue 100%), radial-gradient(circle closest-side at 25% 75%, white 0%, black 100%), conic-gradient(from 45deg at center, red 0deg, lime 120deg, blue 1turn)",
    backgroundColor: "rgb(1, 2, 3)",
    backgroundSize: "50% 100%, auto, 40px 40px",
    backgroundPosition: "left top, center, right bottom",
    backgroundRepeat: "repeat-x, no-repeat, round",
    backgroundOrigin: "padding-box, content-box, border-box",
    backgroundClip: "content-box, padding-box, border-box",
  });
  assert.deepEqual(descriptor.layers.map(({ kind }) => kind), [
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
  ]);
  const resolved = resolvePaintForBox(descriptor, 200, 100, undefined, {
    border: [2, 2, 2, 2],
    padding: [4, 4, 4, 4],
  });
  assert.deepEqual(resolved.layers[0].backgroundSize, [98, 96]);
  assert.deepEqual(resolved.layers[0].tilePlan.x, [2, 100]);
  assert.deepEqual(resolved.layers[1].gradientCenter, [47, 66]);
  assert.deepEqual(resolved.layers[1].gradientRadii, [22, 22]);
  assert.equal(resolved.layers[2].tilePlan.x.length * resolved.layers[2].tilePlan.y.length, 15);
  assert.equal(resolved.colorClipArea.name, "border-box");
  assert.throws(
    () => normalizePaintDescriptor({
      kind: "linear-gradient",
      css: "repeating-linear-gradient(red 0%, blue 20%)",
    }),
    /repeating gradient/u,
  );
  assert.throws(
    () => captureComputedPaint({
      backgroundImage: "linear-gradient(red, blue)",
      backgroundColor: "transparent",
      backgroundSize: "auto",
      backgroundPosition: "0% 0%",
      backgroundRepeat: "repeat",
      backgroundOrigin: "padding-box",
      backgroundClip: "border-box",
      backgroundBlendMode: "multiply",
      backgroundAttachment: "scroll",
    }),
    /multiply requires/u,
  );

  const multiply = captureComputedPaint({
    backgroundImage: "url(tiles.png)",
    backgroundColor: "rgb(40, 80, 120)",
    backgroundSize: "20px 10px",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    backgroundBlendMode: "multiply",
    backgroundAttachment: "scroll",
  });
  assert.equal(multiply.blendMode, "multiply");
  assert.equal(normalizePaintDescriptor({ ...multiply, opaque: true }).blendMode, "multiply");
  assert.throws(
    () => normalizePaintDescriptor(multiply),
    /explicitly opaque raster/u,
  );
  assert.throws(
    () => normalizePaintDescriptor({
      ...multiply,
      opaque: true,
      color: "rgb(40, 80, 120, .5)",
    }),
    /opaque/u,
  );
});
