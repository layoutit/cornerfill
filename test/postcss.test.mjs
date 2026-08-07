import test from "node:test";
import assert from "node:assert/strict";
import postcss from "postcss";
import cornerfillPostcss from "../dist/postcss.mjs";
import {
  COMPILED_MANIFEST_PROPERTY_PREFIX,
  compiledHostContextAttribute,
  parseCompiledManifestCssValue,
} from "../dist/carrier-contract.mjs";
import { resolveCornerShapeDeclarations } from "../dist/values.mjs";

test("the PostCSS plugin preserves authored declarations and emits one manifest", async () => {
  const input = `
.card {
  width: 36px;
  corner-shape: bevel !important;
  background: red;
}
`;
  const first = await postcss([cornerfillPostcss()]).process(input, { from: "fixture.css" });
  const root = postcss.parse(first.css, { from: "fixture.css" });
  const card = root.nodes.find((node) => node.type === "rule" && node.selector === ".card");
  const authored = card.nodes.find((node) => node.type === "decl" && node.prop === "corner-shape");
  assert.equal(authored.value, "bevel");
  assert.equal(authored.important, true);
  assert.deepEqual(authored.source.start, { column: 3, line: 4, offset: 26 });
  const carrier = card.nodes[card.nodes.indexOf(authored) + 1];
  assert.equal(carrier.prop, "--cornerfill-corner-top-left-shape");
  assert.equal(carrier.value, "bevel");
  assert.equal(carrier.important, true);

  const manifests = [];
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) {
      manifests.push(parseCompiledManifestCssValue(declaration.value));
    }
  });
  assert.equal(manifests.length, 2);
  assert.deepEqual(manifests[0].candidateSelectors, [".card"]);
  assert.deepEqual(manifests[1], manifests[0]);

  const second = await postcss([cornerfillPostcss()]).process(first.css, { from: "fixture.css" });
  assert.equal(second.css, first.css);
});

test("the PostCSS plugin covers implemented shape declarations without changing authored CSS", async () => {
  const input = String.raw`
.shape {
  c\6frner-shape: b\65vel scoop notch squircle;
  corner-top-left-shape: var(--physical);
  corner-bottom-right-shape: env(--fallback, round);
}
.logical {
  writing-mode: vertical-rl;
  direction: rtl;
  corner-start-start-shape: scoop !im\70ortant;
  corner-end-end-shape: notch;
}
.invalid { corner-shape: bevel scoop notch round extra; }
`;
  const result = await postcss([cornerfillPostcss()]).process(input, { from: "coverage.css" });
  const root = postcss.parse(result.css, { from: "coverage.css" });
  const shape = root.nodes.find((node) => node.type === "rule" && node.selector === ".shape");
  const authoredShorthand = shape.nodes.find((node) => (
    node.type === "decl" && node.prop === String.raw`c\6frner-shape`
  ));
  assert.equal(authoredShorthand.value, String.raw`b\65vel scoop notch squircle`);
  assert.deepEqual(authoredShorthand.source.start, { column: 3, line: 3, offset: 12 });
  const shorthandCarriers = shape.nodes.slice(
    shape.nodes.indexOf(authoredShorthand) + 1,
    shape.nodes.indexOf(authoredShorthand) + 5,
  ).map(({ prop, value }) => ({ prop, value }));
  assert.deepEqual(shorthandCarriers, [
    { prop: "--cornerfill-corner-top-left-shape", value: "bevel" },
    { prop: "--cornerfill-corner-top-right-shape", value: "scoop" },
    { prop: "--cornerfill-corner-bottom-right-shape", value: "notch" },
    { prop: "--cornerfill-corner-bottom-left-shape", value: "squircle" },
  ]);
  assert(result.css.includes("--cornerfill-corner-top-left-shape: var(--physical)"));
  assert(result.css.includes("--cornerfill-corner-bottom-right-shape: env(--fallback, round)"));

  const logical = root.nodes.find((node) => node.type === "rule" && node.selector === ".logical");
  const authoredLogical = logical.nodes.find((node) => (
    node.type === "decl" && node.prop === "corner-start-start-shape"
  ));
  assert.equal(authoredLogical.value, String.raw`scoop !im\70ortant`);
  assert.equal(authoredLogical.important, undefined);
  const logicalCarrier = logical.nodes[logical.nodes.indexOf(authoredLogical) + 1];
  assert.equal(logicalCarrier.prop, "--cornerfill-corner-start-start-shape");
  assert.equal(logicalCarrier.value, "scoop");
  assert.equal(logicalCarrier.important, true);
  assert.deepEqual(
    resolveCornerShapeDeclarations({
      logical: {
        "corner-start-start-shape": "scoop",
        "corner-end-end-shape": "notch",
      },
      writingMode: "vertical-rl",
      direction: "rtl",
    }),
    [-Infinity, 1, -1, 1],
  );

  const invalid = root.nodes.find((node) => node.type === "rule" && node.selector === ".invalid");
  assert.equal(invalid.nodes.length, 1);
  assert.equal(invalid.first.prop, "corner-shape");
  const second = await postcss([cornerfillPostcss()]).process(result.css, { from: "coverage.css" });
  assert.equal(second.css, result.css);
});

test("the PostCSS plugin transports all and CSS-wide resets through the browser cascade", async () => {
  const input = String.raw`
@layer base, override;
@layer base {
  .card { corner-shape: bevel !important; }
}
@layer override {
  .card.reset { all: u\6eset !im\70ortant; }
  .card.revert { corner-shape: revert-layer; }
}
.inherit { corner-top-left-shape: inherit; }
.pending { all: var(--cornerfill-reset); }
.invalid { all: bevel; }
`;
  const result = await postcss([cornerfillPostcss()]).process(input, { from: "resets.css" });
  const root = postcss.parse(result.css, { from: "resets.css" });
  const reset = root.nodes
    .find((node) => node.type === "atrule" && node.name === "layer" && node.params === "override")
    .nodes.find((node) => node.type === "rule" && node.selector === ".card.reset");
  const authoredReset = reset.nodes.find((node) => node.type === "decl" && node.prop === "all");
  assert.equal(authoredReset.value, String.raw`u\6eset !im\70ortant`);
  assert.equal(authoredReset.important, undefined);
  const resetCarriers = reset.nodes.slice(reset.nodes.indexOf(authoredReset) + 1);
  assert(resetCarriers.length > 0);
  assert(resetCarriers.every(({ important, value }) => important && value === "__cornerfill_unset__"));

  const revert = root.nodes
    .find((node) => node.type === "atrule" && node.name === "layer" && node.params === "override")
    .nodes.find((node) => node.type === "rule" && node.selector === ".card.revert");
  assert(revert.nodes.some(({ prop, value }) => (
    prop === "--cornerfill-corner-top-left-shape" && value === "revert-layer"
  )));
  const inherit = root.nodes.find((node) => node.type === "rule" && node.selector === ".inherit");
  assert(inherit.nodes.some(({ prop, value }) => (
    prop === "--cornerfill-corner-top-left-shape" && value === "inherit"
  )));
  const pending = root.nodes.find((node) => node.type === "rule" && node.selector === ".pending");
  assert(pending.nodes.some(({ prop, value }) => (
    prop === "--cornerfill-auto-all-pending" && value === "1"
  )));
  assert(pending.nodes.some(({ prop, value }) => (
    prop === "--cornerfill-auto-all-value"
      && value === "__cornerfill_all__ var(--cornerfill-reset)"
  )));
  const invalid = root.nodes.find((node) => node.type === "rule" && node.selector === ".invalid");
  assert.equal(invalid.nodes.length, 1);
  assert.equal(invalid.first.prop, "all");
});

test("the PostCSS plugin rewrites only implemented corner-shape support tests", async () => {
  const input = String.raw`
@supports (c\6frner-shape: b\65vel) {
  .positive { color: green; corner-shape: bevel; }
}
@supports not ((corner-shape: scoop) and (display: grid)) {
  .negative { color: red; }
}
@supports ((corner-shape: notch) or (display: __invalid__)) and (color: red) {
  .nested { color: blue; }
}
@supports (corner-shape: superellipse(pow(2, 2))) {
  .native-only { color: purple; }
}
@supports selector([data-token="corner-shape: bevel"]) {
  .selector { color: black; }
}
`;
  const result = await postcss([cornerfillPostcss()]).process(input, { from: "supports.css" });
  const root = postcss.parse(result.css, { from: "supports.css" });
  const conditions = root.nodes
    .filter((node) => node.type === "atrule" && node.name === "supports")
    .map(({ params }) => params);
  assert.match(conditions[0], /--cornerfill-supports-corner-shape:\s*b\\65vel/u);
  assert.match(conditions[1], /^not \(\(--cornerfill-supports-corner-shape:\s*scoop\) and \(display: grid\)\)$/u);
  assert.match(conditions[2], /\(--cornerfill-supports-corner-shape:\s*notch\) or \(display: __invalid__\)/u);
  assert.equal(conditions[3], "(corner-shape: superellipse(pow(2, 2)))");
  assert.equal(conditions[4], 'selector([data-token="corner-shape: bevel"])');
  const positive = root.nodes[0].nodes.find((node) => node.type === "rule");
  assert.equal(positive.nodes[0].toString(), "color: green");
  assert.equal(root.nodes.filter((node) => node.type === "atrule" && node.name === "supports").length, 5);
  const second = await postcss([cornerfillPostcss()]).process(result.css, { from: "supports.css" });
  assert.equal(second.css, result.css);
});

test("the PostCSS plugin accepts scoped rules and rejects unobservable build input at its source", async () => {
  const scoped = await postcss([cornerfillPostcss()]).process(
    "@scope /* preserved comment */ (.shell) { .scoped { corner-shape: bevel } }",
    { from: "scoped.css" },
  );
  assert.match(scoped.css, /\.scoped \{ corner-shape: bevel;/u);
  const scopedManifest = [];
  postcss.parse(scoped.css).walkDecls((declaration) => {
    if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) {
      scopedManifest.push(parseCompiledManifestCssValue(declaration.value));
    }
  });
  assert.deepEqual(scopedManifest[0].candidateSelectors, [".scoped"]);
  assert(scopedManifest[0].observation.attributes.includes("class"));
  assert.equal(scopedManifest[0].observation.invalidation, "subtree");

  const contextArgument = ".theme";
  const context = await postcss([cornerfillPostcss()]).process(
    `:host-context(${contextArgument}) .card { color: red; corner-shape: bevel }`,
    { from: "shadow.css" },
  );
  const marker = compiledHostContextAttribute(contextArgument);
  assert.match(context.css, /:host-context\(\.theme\) \.card/u);
  assert(context.css.includes(
    `:host(:where([${marker}]):is(.theme,:where([${marker}]))) .card`,
  ));
  assert.equal((context.css.match(/color: red/gu) ?? []).length, 2);

  for (const [source, message] of [
    ['@import "./unexpanded.css";', /after @import expansion/u],
    [".card::before { corner-shape: bevel }", /pseudo-elements/u],
    [".card:visited { corner-shape: bevel }", /cannot observe selector state: visited/u],
    ["@container (width > 20px) { .card { corner-shape: bevel } }", /dynamic @container/u],
    ["@scope (.shell) { > .card { corner-shape: bevel } }", /relative selectors/u],
    ["@keyframes morph { from { corner-shape: bevel } }", /inside keyframes/u],
    ["@keyframes morph { to { border-radius: 12px } }", /fallback-relevant border-radius inside keyframes/u],
    [":scope .card { corner-shape: bevel }", /unsupported stylesheet scoping semantics/u],
    [".card:focus-visible { corner-shape: bevel }", /cannot observe selector state: focus-visible/u],
    ["@media all { @layer theme { .card { corner-shape: bevel } } }", /conditional cascade-layer ordering/u],
    ["@media all { @property --shape { syntax: '*'; inherits: false; initial-value: round } }", /conditional @property registration/u],
    ["@property --cornerfill-corner-top-left-shape { syntax: '<color>'; inherits: true; initial-value: red } .card { corner-shape: bevel }", /incompatible descriptors/u],
    [":host-context(.theme .wrapper) .card { corner-shape: bevel }", /one compound selector/u],
    [".parent { & .card { corner-shape: bevel } }", /after the nesting transform/u],
  ]) {
    await assert.rejects(
      postcss([cornerfillPostcss()]).process(source, { from: "unsafe.css" }),
      (error) => error.name === "CssSyntaxError"
        && error.line === 1
        && message.test(error.message),
    );
  }
});

test("unrelated custom properties do not become Cornerfill paint dependencies", async () => {
  const result = await postcss([cornerfillPostcss()]).process(`
.card::before { --brand-accent: red; }
@container card (width > 20rem) { .title { --title-size: large; } }
.face { corner-shape: bevel; }
`, { from: "application.css" });
  const manifests = [];
  postcss.parse(result.css).walkDecls((declaration) => {
    if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) {
      manifests.push(parseCompiledManifestCssValue(declaration.value));
    }
  });
  assert.deepEqual(manifests[0].candidateSelectors, [".face"]);
  assert(!manifests[0].customProperties.some(({ name }) => name === "--brand-accent"));
  const title = manifests[0].customProperties.find(({ name }) => name === "--title-size");
  assert(title?.problems.some((problem) => /@container/u.test(problem)));
});

test("paint-only and cross-file variable chunks emit observation metadata", async () => {
  const shape = await postcss([cornerfillPostcss()]).process(
    ".face { corner-shape: bevel; background: var(--face-color); }",
    { from: "shape.css" },
  );
  const theme = await postcss([cornerfillPostcss()]).process(`
@media (prefers-color-scheme: dark) {
  .face:hover { --face-color: blue; }
}
`, { from: "theme.css" });
  const read = (css) => {
    const manifests = [];
    postcss.parse(css).walkDecls((declaration) => {
      if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) {
        manifests.push(parseCompiledManifestCssValue(declaration.value));
      }
    });
    return manifests[0];
  };
  const shapeManifest = read(shape.css);
  const themeManifest = read(theme.css);
  assert.deepEqual(shapeManifest.referencedCustomProperties, ["--face-color"]);
  assert.deepEqual(themeManifest.candidateSelectors, []);
  assert.deepEqual(themeManifest.customProperties[0].mediaQueries, ["(prefers-color-scheme: dark)"]);
  assert(themeManifest.customProperties[0].observation.events.includes("pointerover"));
});

test("a second pass rebuilds valid manifests and compiles newly concatenated CSS", async () => {
  const first = await postcss([cornerfillPostcss()]).process(
    ".card-a { corner-shape: bevel }",
    { from: "a.css" },
  );
  const combined = `${first.css}\n.card-b { corner-shape: scoop }`;
  const result = await postcss([cornerfillPostcss()]).process(combined, { from: "bundle.css" });
  const manifests = [];
  postcss.parse(result.css).walkDecls((declaration) => {
    if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) {
      manifests.push(parseCompiledManifestCssValue(declaration.value));
    }
  });
  assert.deepEqual(manifests[0].candidateSelectors, [".card-a", ".card-b"]);
  assert.match(result.css, /\.card-b \{ corner-shape: scoop; --cornerfill-corner-top-left-shape: scoop/u);
  const second = await postcss([cornerfillPostcss()]).process(result.css, { from: "bundle.css" });
  assert.equal(second.css, result.css);
});

test("reserved manifest-looking declarations fail instead of disabling compilation", async () => {
  await assert.rejects(
    postcss([cornerfillPostcss()]).process(`
:root { --cornerfill-compiled-manifest-debug: "test"; }
.face { corner-shape: bevel; }
`, { from: "forged.css" }),
    /invalid compiled manifest/u,
  );
  await assert.rejects(
    postcss([cornerfillPostcss()]).process(
      ".face { --cornerfill-corner-shape: bevel; corner-shape: scoop; }",
      { from: "forged-carrier.css" },
    ),
    /authored or orphaned private carrier/u,
  );
  await assert.rejects(
    postcss([cornerfillPostcss()]).process(`
@property --cornerfill-corner-top-left-shape {
  syntax: "<color>";
  inherits: true;
  initial-value: red;
}
`, { from: "conflicting-registration.css" }),
    /incompatible descriptors/u,
  );
});
