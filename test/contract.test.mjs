import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("production sources contain none of the prohibited CSS renderers", () => {
  const source = readdirSync(join(root, "src"))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => readFileSync(join(root, "src", name), "utf8"))
    .join("\n");
  for (const prohibited of ["clip-path", "mask-image", "-webkit-mask", "data:image/svg", "<svg"]) {
    assert.equal(source.includes(prohibited), false, `production source contains prohibited renderer ${prohibited}`);
  }
  assert.doesNotMatch(source, /setProperty\(["']transform["']/u);
});

test("oracle candidate tolerances remain deliberately unapproved", () => {
  const tolerances = JSON.parse(readFileSync(join(root, "oracle", "tolerances.json"), "utf8"));
  assert.equal(tolerances.calibration.approved, true);
  assert.equal(tolerances.calibration.maxMeanAlpha, 0);
  assert.equal(tolerances.calibration.maxMeanPremultipliedRgb, 0);
  assert.equal(tolerances.calibration.maxChangedPixelRatio, 0);
  assert.equal(tolerances.candidate.approved, false);
});
