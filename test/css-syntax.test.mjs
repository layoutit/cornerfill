import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeCornerShapeDeclarations } from "../dist/carriers.mjs";
import { cssDeclarationSignature, cssDeclarations } from "../dist/css-syntax.mjs";

test("declaration signatures retain semicolons inside CSS values", () => {
  const first = 'background-image:url("data:image/png;base64,AAAA;BBBB");color:red';
  const second = 'background-image:url("data:image/png;base64,AAAA;CCCC");color:red';
  assert.notEqual(cssDeclarationSignature(first, () => true), cssDeclarationSignature(second, () => true));
  assert.deepEqual(cssDeclarations('--image:url("data:image/svg+xml;utf8,<svg></svg>");color:blue'), [
    { property: "--image", value: 'url("data:image/svg+xml;utf8,<svg></svg>")' },
    { property: "color", value: "blue" },
  ]);
});

test("declaration tokenization decodes escaped and commented property names", () => {
  assert.deepEqual(cssDeclarations('corner-\\73 hape:bevel;border-r\\61 dius:5px;back/**/ground:red'), [
    { property: "corner-shape", value: "bevel" },
    { property: "border-radius", value: "5px" },
    { property: "background", value: "red" },
  ]);
});

test("stylesheet canonicalization does not treat a custom-element selector as a declaration", () => {
  const source = "corner-shape:hover{color:red}.card{corner-shape:bevel}";
  const transformed = canonicalizeCornerShapeDeclarations(source);
  assert.match(transformed, /^corner-shape:hover\{color:red\}/u);
  assert.doesNotMatch(transformed, /\.card\{corner-shape:bevel\}/u);
  assert.match(transformed, /\.card\{--cornerfill-corner-top-left-shape:bevel/u);
});

test("inline canonicalization accepts escaped corner-shape properties", () => {
  const transformed = canonicalizeCornerShapeDeclarations(
    "corner-\\73 hape:bevel;background:red",
    null,
    "declarations",
  );
  assert.match(transformed, /--cornerfill-corner-top-left-shape:bevel/u);
});
