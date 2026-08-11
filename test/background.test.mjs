import test from "node:test";
import assert from "node:assert/strict";
import {
  captureComputedPaint,
  normalizePaintDescriptor,
  paintDescriptorKey,
  parseBackgroundPosition,
  parseBackgroundRepeat,
  rasterSourceDimensions,
  resolvePaintForBox,
} from "../dist/background.mjs";
import { parseCssGradient } from "../dist/gradients.mjs";

const image = Object.freeze({ width: 30, height: 15 });

test("raster dimensions match the accepted image, video, canvas, and frame shapes", () => {
  assert.deepEqual(rasterSourceDimensions({ naturalWidth: 30, naturalHeight: 15 }), [30, 15]);
  assert.deepEqual(rasterSourceDimensions({ videoWidth: 40, videoHeight: 20 }), [40, 20]);
  assert.deepEqual(rasterSourceDimensions({ displayWidth: 50, displayHeight: 25 }), [50, 25]);
  assert.deepEqual(rasterSourceDimensions({ width: 60, height: 30 }), [60, 30]);
  assert.throws(
    () => rasterSourceDimensions({ width: { baseVal: { value: 30 } }, height: { baseVal: { value: 15 } } }),
    /decoded image with intrinsic dimensions/u,
  );
});

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
  assert.deepEqual(resolved.backgroundPosition, [54, 42.4]);
  assert.deepEqual(parseBackgroundPosition("center left"), parseBackgroundPosition("left center"));
  assert.throws(() => parseBackgroundPosition("left 10px 20px"), /invalid three-value/u);
  assert.throws(() => parseBackgroundPosition("10px top 20px"), /invalid three-value/u);
  assert.doesNotThrow(() => parseBackgroundPosition("left 10px top"));
  assert.doesNotThrow(() => parseBackgroundPosition("left top 20px"));

  const edgePosition = (backgroundPosition, backgroundSize) => resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize,
    backgroundPosition,
    repeat: "no-repeat",
  }), 100, 80, image).backgroundPosition;
  assert.deepEqual(edgePosition("right 10% bottom 25%", "100px 80px"), [0, 0]);
  assert.deepEqual(edgePosition("right 10% bottom 25%", "120px 100px"), [-18, -15]);
  assert.deepEqual(edgePosition("right -10% bottom -25%", "20px 10px"), [88, 87.5]);
});

test("gradient stops reject unsupported length positions instead of absorbing them into colors", () => {
  for (const gradient of [
    "linear-gradient(red 10px, blue 90px)",
    "linear-gradient(red, blue 1em, green)",
    "radial-gradient(red calc(10% + 1px), blue)",
    "conic-gradient(red 10px, blue)",
  ]) {
    assert.throws(() => parseCssGradient(gradient), /gradient stop|finite angle/u, gradient);
  }
  assert.deepEqual(parseCssGradient("linear-gradient(red 10%, blue 90%)").stops, [
    [0.1, "red"],
    [0.9, "blue"],
  ]);
});

test("top-level quoted garbage remains visible to background grammar validation", () => {
  assert.throws(() => parseBackgroundRepeat('repeat "junk"'), /invalid background-repeat/u);
  assert.throws(
    () => normalizePaintDescriptor({
      kind: "image",
      image,
      backgroundPosition: 'center "junk" left',
    }),
    /background-position/u,
  );
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
  [0, 100 / 3, 200 / 3].forEach((expected, index) => {
    assert.ok(Math.abs(round.tilePlan.x[index] - expected) < 1e-12);
  });
  const positionedRound = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "30px 15px",
    backgroundPosition: "10px 0",
    repeat: "round no-repeat",
  }), 100, 40, image);
  [-70 / 3, 10, 130 / 3, 230 / 3].forEach((expected, index) => {
    assert.ok(Math.abs(positionedRound.tilePlan.x[index] - expected) < 1e-12);
  });

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

test("decoded image identity participates in the paint key", () => {
  const first = normalizePaintDescriptor({ kind: "image", image: { width: 1, height: 1 } });
  const second = normalizePaintDescriptor({ kind: "image", image: { width: 1, height: 1 } });
  assert.notEqual(paintDescriptorKey(first), paintDescriptorKey(second));
  assert.equal(paintDescriptorKey(first), paintDescriptorKey(first));
});

test("paint normalization owns nested public input and discards unrelated fields", () => {
  const backgroundPositionSpec = {
    kind: "components",
    x: { kind: "position", px: 3, percent: 0, source: "3px" },
    y: { kind: "position", px: 4, percent: 0, source: "4px" },
  };
  const backgroundSizeSpec = {
    kind: "components",
    width: {
      kind: "length-percentage",
      source: "20px",
      value: { px: 20, percent: 0, source: "20px" },
    },
    height: { kind: "auto", source: "auto" },
  };
  const sourceSize = [30, 15];
  const line = { kind: "angle", radians: Math.PI / 2 };
  const unrelated = {};
  unrelated.circular = unrelated;
  const descriptor = normalizePaintDescriptor({
    kind: "layers",
    layers: [
      {
        kind: "image",
        image,
        backgroundPositionSpec,
        backgroundSizeSpec,
        sourceSize,
        repeat: "no-repeat",
      },
      {
        kind: "linear-gradient",
        line,
        stops: [[0, "red"], [1, "blue"]],
        unrelated,
      },
    ],
  });
  const key = paintDescriptorKey(descriptor);
  const resolved = resolvePaintForBox(descriptor, 100, 80);

  backgroundPositionSpec.x.px = 99;
  backgroundSizeSpec.width.value.px = 99;
  sourceSize[0] = 99;
  line.radians = 0;

  assert.equal(paintDescriptorKey(descriptor), key);
  assert.deepEqual(resolved.layers[0].backgroundPosition, [3, 4]);
  assert.deepEqual(resolved.layers[0].backgroundSize, [20, 10]);
  assert.deepEqual(descriptor.layers[0].sourceSize, [30, 15]);
  assert.equal(descriptor.layers[1].line.radians, Math.PI / 2);
  assert.equal("unrelated" in descriptor.layers[1], false);
  assert.throws(() => normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundPositionSpec: { kind: "prepared", x: Infinity, y: 0 },
  }), /normalized specification/u);
  assert.throws(() => parseBackgroundPosition(new Array(2)), /finite pixels/u);
  assert.throws(() => normalizePaintDescriptor({
    kind: "image",
    image,
    sourceSize: new Array(2),
  }), /finite positive numbers/u);
  assert.throws(() => normalizePaintDescriptor({
    kind: "layers",
    layers: new Array(1),
  }), /background layer is required/u);
});

test("normalized gradient stops use the CSS fixup order", () => {
  const descriptor = normalizePaintDescriptor({
    kind: "linear-gradient",
    from: [0, 0],
    to: [100, 0],
    stops: [[0.8, "red"], [0.2, "green"], [1, "blue"]],
  });
  assert.deepEqual(descriptor.stops, [
    [0.8, "red"],
    [0.8, "green"],
    [1, "blue"],
  ]);
});

test("zero-sized raster backgrounds draw no tiles", () => {
  const resolved = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "0 0",
    repeat: "repeat",
  }), 100, 80, image);
  assert.deepEqual(resolved.tilePlan, { x: [], y: [] });
  assert.throws(() => resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "-10px 20px",
    repeat: "no-repeat",
  }), 100, 80, image), /must be non-negative/u);
  const clamped = resolvePaintForBox(normalizePaintDescriptor({
    kind: "image",
    image,
    backgroundSize: "calc(10px - 20px) calc(-10px)",
    repeat: "no-repeat",
  }), 100, 80, image);
  assert.deepEqual(clamped.backgroundSize, [0, 0]);
});

test("solid and layered descriptors preserve explicit box metrics", () => {
  const box = { padding: 10 };
  const solid = resolvePaintForBox(normalizePaintDescriptor({
    kind: "solid",
    color: "red",
    clip: "content-box",
    box,
  }), 100, 80);
  assert.deepEqual(solid.clipArea, {
    name: "content-box",
    x: 10,
    y: 10,
    width: 80,
    height: 60,
    insets: [10, 10, 10, 10],
  });
  box.padding = 30;
  assert.equal(solid.boxMetrics.padding[0], 10);

  const layered = resolvePaintForBox(normalizePaintDescriptor({
    kind: "layers",
    color: "blue",
    box: { border: 4 },
    layers: [{ kind: "none", clip: "padding-box" }],
  }), 100, 80);
  assert.equal(layered.colorClipArea.x, 4);
});

test("radial gradients accept outside centers and degenerate ending radii", () => {
  const outside = resolvePaintForBox(normalizePaintDescriptor({
    kind: "radial-gradient",
    css: "radial-gradient(circle closest-side at -10px 50%, red, blue)",
  }), 100, 80);
  assert.deepEqual(outside.gradientRadii, [10, 10]);
  const degenerate = resolvePaintForBox(normalizePaintDescriptor({
    kind: "radial-gradient",
    css: "radial-gradient(ellipse 0 20px at center, red, blue)",
  }), 100, 80);
  assert.deepEqual(degenerate.gradientRadii, [0, 20]);
  const clampedCircle = resolvePaintForBox(normalizePaintDescriptor({
    kind: "radial-gradient",
    css: "radial-gradient(circle calc(-10px) at center, red, blue)",
  }), 100, 80);
  assert.deepEqual(clampedCircle.gradientRadii, [0, 0]);
  assert.throws(() => normalizePaintDescriptor({
    kind: "radial-gradient",
    css: "radial-gradient(circle -10px at center, red, blue)",
  }), /must be non-negative/u);
  assert.throws(() => normalizePaintDescriptor({
    kind: "radial-gradient",
    css: "radial-gradient(-10px, red, blue)",
  }), /must be non-negative/u);
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

  const multiplyStyle = {
    backgroundImage: "url(tiles.png)",
    backgroundColor: "rgb(40, 80, 120)",
    backgroundSize: "20px 10px",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "padding-box",
    backgroundClip: "border-box",
    backgroundBlendMode: "multiply",
    backgroundAttachment: "scroll",
  };
  assert.throws(
    () => captureComputedPaint(multiplyStyle),
    /explicitly opaque raster/u,
  );
  const multiply = captureComputedPaint(multiplyStyle, {}, { rasterIsOpaque: true });
  assert.equal(multiply.blendMode, "multiply");
  assert.equal(multiply.opaque, true);
  assert.equal(normalizePaintDescriptor(multiply).blendMode, "multiply");
  assert.throws(
    () => normalizePaintDescriptor({
      ...multiply,
      opaque: true,
      color: "rgb(40, 80, 120, .5)",
    }),
    /opaque/u,
  );
});
