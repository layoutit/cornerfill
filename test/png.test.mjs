import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  comparePngImages,
  decodePngBuffer,
  encodePng,
  reconstructTransparencyFromBlackAndWhite,
} from "../scripts/png.mjs";

function image(width, height, values) {
  return Object.freeze({ width, height, pixels: Buffer.from(values) });
}

test("RGBA PNG encode/decode round-trips exact bytes", () => {
  const source = image(2, 2, [
    255, 0, 0, 255,
    0, 255, 0, 127,
    0, 0, 255, 0,
    20, 40, 60, 200,
  ]);
  const decoded = decodePngBuffer(encodePng(source), "round-trip");
  assert.equal(decoded.width, source.width);
  assert.equal(decoded.height, source.height);
  assert.deepEqual(decoded.pixels, source.pixels);
});

test("identical images produce a strict zero diff", () => {
  const source = image(1, 1, [12, 34, 56, 200]);
  const comparison = comparePngImages(source, source);
  assert.equal(comparison.metrics.changedPixels, 0);
  assert.equal(comparison.metrics.meanAlpha, 0);
  assert.equal(comparison.metrics.meanPremultipliedRgb, 0);
});

test("transparent RGB is ignored but alpha remains independently measured", () => {
  const expected = image(2, 1, [255, 0, 0, 0, 100, 50, 25, 255]);
  const transparentRgbOnly = image(2, 1, [0, 255, 255, 0, 100, 50, 25, 255]);
  const ignored = comparePngImages(expected, transparentRgbOnly);
  assert.equal(ignored.metrics.changedPixels, 0);
  assert.equal(ignored.metrics.meanPremultipliedRgb, 0);

  const alphaChanged = image(2, 1, [255, 0, 0, 64, 100, 50, 25, 255]);
  const measured = comparePngImages(expected, alphaChanged);
  assert.equal(measured.metrics.changedPixels, 1);
  assert.equal(measured.metrics.maxAlpha, 64);
  assert.ok(measured.metrics.meanPremultipliedRgb > 0);
});

test("connected changed regions are reported separately", () => {
  const expected = image(3, 1, [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const actual = image(3, 1, [
    255, 255, 255, 255,
    0, 0, 0, 0,
    255, 255, 255, 255,
  ]);
  const comparison = comparePngImages(expected, actual);
  assert.equal(comparison.metrics.connectedRegions.length, 2);
  assert.equal(comparison.metrics.connectedRegions[0].pixels, 1);
});

test("black and white composites reconstruct straight RGBA", () => {
  const black = image(3, 1, [
    10, 30, 50, 255,
    0, 0, 0, 255,
    12, 34, 56, 255,
  ]);
  const white = image(3, 1, [
    180, 200, 220, 255,
    255, 255, 255, 255,
    12, 34, 56, 255,
  ]);
  const reconstructed = reconstructTransparencyFromBlackAndWhite(black, white);
  assert.deepEqual(reconstructed.pixels, Buffer.from([
    30, 90, 150, 85,
    0, 0, 0, 0,
    12, 34, 56, 255,
  ]));
  assert.equal(reconstructed.diagnostics.maxChannelSpread, 0);
  assert.equal(reconstructed.diagnostics.pixelsWithChannelSpreadAboveOne, 0);
});
