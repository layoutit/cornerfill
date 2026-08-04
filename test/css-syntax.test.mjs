import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeCornerShapeDeclarations,
  carrierSupportsCondition,
  leadingImportStatements,
  ownershipBlockingError,
  parseImportStatement,
  selectorObservation,
  supportsConditionTestsShape,
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

test("stylesheet scanning leaves an unterminated import to browser error recovery", () => {
  const source = '@import url("theme.css")';
  assert.deepEqual(leadingImportStatements(source), { imports: [], local: source });
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

test("nested support conditions share one decoded shape analysis", () => {
  const nested = String.raw`n\6ft ((\63orner-shape: v\61r(--shape)))`;
  assert(supportsConditionTestsShape(nested));
  assert(supportsConditionTestsShape(String.raw`\63orner-shape: bevel`));
  assert.match(carrierSupportsCondition(nested), /--cornerfill-supports-corner-shape/u);
  assert(!supportsConditionTestsShape('selector([data-token="corner-shape"])'));
});

test("selector observation ignores selector text inside comments and attribute values", () => {
  assert.deepEqual(selectorObservation([
    '.face/* :visited .ghost */[data-token=":checked .fake #fake"]:is(:hover)',
  ]), {
    attributes: ["class", "data-token"],
    characterData: false,
    conservative: false,
    events: ["pointerout", "pointerover"],
    unobservableStates: [],
  });
});

test("import URLs require browser-valid string or url tokens", () => {
  assert.equal(
    parseImportStatement("@import url(theme.css);", "https://example.test/root.css").url,
    "https://example.test/theme.css",
  );
  for (const source of [
    "@import /ghost.css;",
    '@import url ("ghost.css");',
    '@import url/**/("ghost.css");',
    '@import url(/* comment */ "ghost.css");',
    '@import "ghost.css" supports (display:grid);',
  ]) assert.throws(() => parseImportStatement(source, "https://example.test/root.css"), SyntaxError);
});

test("import parsing accepts CSS trivia around URL tokens", () => {
  for (const source of [
    '@import/**/"./child.css";',
    '@import /* before string */ "./child.css";',
    '@import /* before function */ url("./child.css");',
  ]) {
    assert.equal(
      parseImportStatement(source, "https://example.test/root.css").url,
      "https://example.test/child.css",
      source,
    );
  }
});

test("anonymous import layers remain ownership-blocking before media conditions", () => {
  assert.throws(
    () => parseImportStatement(
      '@import "./child.css" layer (min-width: 1px);',
      "https://example.test/root.css",
    ),
    (error) => ownershipBlockingError(error)
      && /anonymous @import layer/u.test(error.message),
  );
});

test("escaped all resets and support keywords use decoded CSS tokens", () => {
  const reset = canonicalizeCornerShapeDeclarations(
    String.raw`.face{corner-shape:bevel;all:u\6eset}`,
  );
  assert.match(reset, /--cornerfill-auto-physical-shape:__cornerfill_unset__/u);

  const substitution = canonicalizeCornerShapeDeclarations(
    String.raw`.face{corner-shape:bevel;all:v\61r(--reset)}`,
  );
  assert.match(substitution, /--cornerfill-auto-all-pending:1/u);

  const revertRule = carrierSupportsCondition(String.raw`(corner-shape: r\65vert-rule)`);
  assert.match(revertRule, /\(all:/u);
  assert(revertRule.includes(String.raw`r\65vert-rule`));
});
