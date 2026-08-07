import test from "node:test";
import assert from "node:assert/strict";
import {
  diagonalToShapeParameter,
  interpolateCornerShape,
  logicalCornerToPhysical,
  parseBorderRadius,
  parseCornerShape,
  parseCornerShapeValue,
  parseLengthPercentage,
  resolveBorderRadius,
  resolveBorderRadiusDeclarations,
  resolveCornerRadiusLonghands,
  resolveCornerShape,
  resolveCornerShapeDeclarations,
  resolveLengthPercentage,
  serializeShapeParameter,
  shapeParameterToDiagonal,
} from "../dist/values.mjs";

test("border-radius expands one through four values and slash axes", () => {
  const resolved = resolveBorderRadius("50% 20px 10% / 100% 30px", 200, 80);
  assert.deepEqual(resolved, [
    { rx: 100, ry: 80 },
    { rx: 20, ry: 30 },
    { rx: 20, ry: 80 },
    { rx: 20, ry: 30 },
  ]);
  assert.equal(parseBorderRadius("12px").length, 4);
  assert.throws(() => resolveBorderRadius(new Array(4), 20, 20), /parsed radii\[0\]/u);
  assert.throws(() => resolveCornerRadiusLonghands(new Array(4), 20, 20), /longhands\[0\]/u);
});

test("supported calc length-percentages resolve without evaluation", () => {
  const parsed = parseLengthPercentage("calc(50% - 10px)");
  assert.deepEqual(parsed, { px: -10, percent: 0.5, source: "calc(50% - 10px)" });
  const resolved = resolveBorderRadius("calc(50% - 10px)", 200, 100);
  assert.equal(resolved[0].rx, 90);
  assert.equal(resolved[0].ry, 40);
});

test("CSS comments form token boundaries in supported values", () => {
  assert.deepEqual(resolveBorderRadius("5px/**/10px / calc(50%/**/ - 5px)", 100, 80), [
    { rx: 5, ry: 35 },
    { rx: 10, ry: 35 },
    { rx: 5, ry: 35 },
    { rx: 10, ry: 35 },
  ]);
  assert.deepEqual(parseCornerShape("bevel/**/scoop superellipse(/**/2/**/)"), [
    0,
    -1,
    2,
    -1,
  ]);
});

test("browser-computed corner radii resolve min, max, and clamp", () => {
  assert.deepEqual(resolveCornerRadiusLonghands([
    "min(20%, 32px)",
    "max(10%, 12px)",
    "clamp(8px, 15%, 40px)",
    "calc(5% + 20px)",
  ], 200, 100), [
    { rx: 32, ry: 20 },
    { rx: 20, ry: 12 },
    { rx: 30, ry: 15 },
    { rx: 30, ry: 25 },
  ]);
});

test("deep computed radius math resolves without recursive stack growth", () => {
  const nested = `${"min(100px,".repeat(6_000)}25%${")".repeat(6_000)}`;
  assert.deepEqual(resolveCornerRadiusLonghands([nested, nested, nested, nested], 200, 100), [
    { rx: 50, ry: 25 },
    { rx: 50, ry: 25 },
    { rx: 50, ry: 25 },
    { rx: 50, ry: 25 },
  ]);
});

test("corner-shape expands keywords and arbitrary superellipse parameters", () => {
  assert.deepEqual(parseCornerShape("bevel scoop squircle"), [0, -1, 2, -1]);
  assert.deepEqual(parseCornerShape("notch superellipse(-1.5) square round"), [
    Number.NEGATIVE_INFINITY,
    -1.5,
    Number.POSITIVE_INFINITY,
    1,
  ]);
  assert.throws(() => resolveCornerShape(new Array(4)), /four numeric parameters/u);
});

test("logical corner longhands resolve through writing mode and direction", () => {
  assert.equal(logicalCornerToPhysical("start-start"), "top-left");
  assert.equal(logicalCornerToPhysical("start-start", { direction: "rtl" }), "top-right");
  assert.equal(logicalCornerToPhysical("start-start", { writingMode: "vertical-rl" }), "top-right");
  assert.deepEqual(resolveCornerShapeDeclarations({
    shorthand: "round",
    logical: { "start-start": "bevel", "end-end": "notch" },
    writingMode: "vertical-rl",
    direction: "ltr",
  }), [1, 0, 1, Number.NEGATIVE_INFINITY]);
  assert.deepEqual(resolveCornerShape({
    shorthand: "round squircle",
    physical: { "corner-top-left-shape": "square" },
    logical: { "corner-start-start-shape": "scoop" },
  }, { direction: "rtl" }), [Number.POSITIVE_INFINITY, -1, 1, 2]);
  assert.deepEqual(resolveBorderRadiusDeclarations({
    shorthand: "10px / 20px",
    physical: { "border-top-right-radius": "25% 50%" },
    logical: { "border-end-start-radius": "30px 40px" },
    writingMode: "vertical-rl",
  }, 200, 100), [
    { rx: 30, ry: 40 },
    { rx: 50, ry: 50 },
    { rx: 10, ry: 20 },
    { rx: 10, ry: 20 },
  ]);
});

test("vertical upright flow uses the ltr used direction", () => {
  assert.equal(
    logicalCornerToPhysical("start-start", {
      writingMode: "vertical-rl",
      direction: "rtl",
      textOrientation: "upright",
    }),
    "top-right",
  );
  assert.equal(
    logicalCornerToPhysical("start-start", {
      writingMode: "vertical-rl",
      direction: "rtl",
      textOrientation: "mixed",
    }),
    "bottom-right",
  );
});

test("corner-shape parsing consumes CSS identifier escapes", () => {
  assert.deepEqual(parseCornerShape(String.raw`\62 evel scoop`), [0, -1, 0, -1]);
  assert.equal(parseCornerShapeValue(String.raw`sup\65 rellipse(2)`), 2);
  assert.throws(
    () => parseCornerShapeValue(String.raw`superellipse\28 2\29 `),
    /unsupported value/u,
  );
});

test("sideways-lr reverses its inline axis relative to vertical-lr", () => {
  assert.equal(logicalCornerToPhysical("start-start", { writingMode: "sideways-lr" }), "bottom-left");
  assert.equal(logicalCornerToPhysical("start-end", { writingMode: "sideways-lr" }), "top-left");
  assert.equal(logicalCornerToPhysical("start-start", { writingMode: "sideways-lr", direction: "rtl" }), "top-left");
  assert.equal(logicalCornerToPhysical("start-end", { writingMode: "sideways-lr", direction: "rtl" }), "bottom-left");
});

test("corner-shape accepts supported numeric calc values", () => {
  assert.deepEqual(parseCornerShape("superellipse(calc(1 + 1))"), [2, 2, 2, 2]);
  assert.deepEqual(parseCornerShape("superellipse(calc(1 - 1))"), [0, 0, 0, 0]);
});

test("corner-shape interpolation is linear in the diagonal coordinate", () => {
  for (const parameter of [Number.NEGATIVE_INFINITY, -2, -1, 0, 1, 2, Number.POSITIVE_INFINITY]) {
    const roundTrip = diagonalToShapeParameter(shapeParameterToDiagonal(parameter));
    if (Number.isFinite(parameter)) assert.ok(Math.abs(roundTrip - parameter) < 1e-12);
    else assert.equal(roundTrip, parameter);
  }
  const midpoint = interpolateCornerShape("scoop", "squircle", 0.5);
  assert.ok(midpoint.every((value) => Math.abs(value - 0.28833415474651186) < 1e-12));
  assert.deepEqual(interpolateCornerShape("notch", "square", 0.5), [0, 0, 0, 0]);
  assert.deepEqual(interpolateCornerShape("notch", "square", -1), [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]);
});

test("unsupported value grammar is rejected explicitly", () => {
  assert.throws(() => parseBorderRadius("1em"), /supported px\/% syntax/u);
  assert.throws(() => parseBorderRadius("-1px"), /cannot be negative/u);
  assert.throws(() => parseCornerShape("url(shape)"), /unsupported value/u);
  assert.throws(() => parseCornerShape("superellipse(+infinity)"), /finite number or signed infinity/u);
  assert.throws(() => parseCornerShape("superellipse(calc(1+1))"), /unsupported calc/u);
  assert.throws(() => parseCornerShape("superellipse(calc(1 * 2))"), /unsupported calc/u);
  assert.throws(() => parseCornerShape("superellipse(calc(infinity))"), /unsupported calc/u);
  assert.throws(() => parseLengthPercentage("calc(10px+2%)"), /unsupported calc/u);
  assert.throws(() => parseLengthPercentage("calc(10px * 2)"), /unsupported calc/u);
  assert.throws(() => parseLengthPercentage("calc(1e308px + 1e308px)"), /overflows/u);
  assert.throws(
    () => resolveLengthPercentage({ px: 1e308, percent: 1, source: "oversized" }, 1e308),
    /finite numeric range/u,
  );
  assert.throws(() => serializeShapeParameter(Number.NaN), /must be numeric/u);
  assert.throws(() => logicalCornerToPhysical("start-start", { direction: "auto" }), /unsupported direction/u);
});
