import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeCornerShapeDeclarations,
  carrierSupportsCondition,
  leadingImportStatements,
  parseImportStatement,
} from "../dist/carriers.mjs";
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
  assert.deepEqual(cssDeclarations(
    'corner-\\73 hape:bevel;border-r\\61 dius:5px;background/**/:red;back/**/ground:blue;back ground:green',
  ), [
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

test("EOF closes CSS comments in declarations and carrier values", () => {
  assert.deepEqual(cssDeclarations("corner-shape:bevel/*"), [
    { property: "corner-shape", value: "bevel/*" },
  ]);
  const transformed = canonicalizeCornerShapeDeclarations(".card{corner-shape:bevel/*");
  assert.match(transformed, /--cornerfill-corner-top-left-shape:bevel/u);
  assert.doesNotMatch(transformed, /bevel\/\*/u);
});

test("stylesheet canonicalization preserves custom-property block values", () => {
  const source = ".card{--shape:{corner-shape:bevel};--reset:{all:var(--value)};corner-shape:notch}";
  const transformed = canonicalizeCornerShapeDeclarations(source);
  assert.match(transformed, /--shape:\{corner-shape:bevel\}/u);
  assert.match(transformed, /--reset:\{all:var\(--value\)\}/u);
  assert.doesNotMatch(transformed, /--shape:\{--cornerfill/u);
  assert.match(transformed, /--cornerfill-corner-top-left-shape:notch/u);
});

test("stylesheet scanning rejects an unterminated import", () => {
  assert.throws(
    () => leadingImportStatements('@import url("theme.css")'),
    /malformed top-level @import/u,
  );
});

test("import control grammar decodes escaped CSS identifiers", () => {
  const source = String.raw`
    @l\61yer reset, theme;
    @im\70ort "./child.css" l\61yer(theme) s\75pports(\63orner-shape: bevel);
    .local { corner-shape: scoop }
  `;
  const split = leadingImportStatements(source);
  assert.equal(split.imports.length, 1);
  assert(split.local.includes(String.raw`@l\61yer reset, theme`));
  assert.match(split.local, /\.local/u);
  const imported = parseImportStatement(split.imports[0].prelude, "https://example.test/root.css");
  assert.deepEqual(imported, {
    url: "https://example.test/child.css",
    layer: "theme",
    supports: String.raw`\63orner-shape: bevel`,
    media: "",
  });
  assert.match(
    carrierSupportsCondition(imported.supports),
    /--cornerfill-supports-corner-shape:bevel/u,
  );
});
