import test from "node:test";
import assert from "node:assert/strict";
import { transportCornerShapeDeclarations } from "../src/auto-runtime.mjs";

test("automatic CSS transport changes declarations without touching selectors, values, or conditions", () => {
  const source = `
    .corner-shape:hover {
      content: "corner-shape: scoop";
      /* corner-shape: notch; */
      corner-shape: bevel !important;
      corner-start-start-shape: superellipse(2);
    }
    @supports (corner-shape: bevel) { .inside { corner-shape: scoop; } }
  `;
  const transported = transportCornerShapeDeclarations(source);
  assert.match(transported, /\.corner-shape:hover/u);
  assert.match(transported, /content: "corner-shape: scoop"/u);
  assert.match(transported, /\/\* corner-shape: notch; \*\//u);
  assert.match(transported, /--cornerfill-corner-shape: bevel !important/u);
  assert.match(transported, /--cornerfill-corner-start-start-shape: superellipse\(2\)/u);
  assert.match(transported, /@supports \(corner-shape: bevel\)/u);
  assert.match(transported, /\.inside \{ --cornerfill-corner-shape: scoop/u);
});
