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
.all-inherit { all: inherit; }
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
  const manifestDeclarations = [];
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) {
      manifestDeclarations.push(declaration);
    }
  });
  const manifest = parseCompiledManifestCssValue(manifestDeclarations[0].value);
  assert(manifest.candidateSelectors.includes(".all-inherit"));
  assert(manifest.candidateSelectors.includes(".pending"));
  assert(!manifest.candidateSelectors.includes(".card.reset"));
});

test("the PostCSS plugin rejects feature queries that would overstate runtime health", async () => {
  await assert.rejects(
    postcss([cornerfillPostcss()]).process(String.raw`
@supports (c\6frner-shape: b\65vel) {
  .positive { color: green; corner-shape: bevel; }
}`, { from: "supports.css" }),
    /feature query cannot represent runtime health/u,
  );
  const input = `
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
  assert.equal(conditions[0], "(corner-shape: superellipse(pow(2, 2)))");
  assert.equal(conditions[1], 'selector([data-token="corner-shape: bevel"])');
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
    ["@media all { @layer theme { .card { corner-shape: bevel } } }", /conditional cascade-layer first establishment/u],
    ["@media all { @property --shape { syntax: '*'; inherits: false; initial-value: round } }", /conditional @property registration/u],
    ["@property --cornerfill-corner-top-left-shape { syntax: '<color>'; inherits: true; initial-value: red } .card { corner-shape: bevel }", /incompatible descriptors/u],
    ["@unknown { @property --cornerfill-corner-top-left-shape { syntax: '*'; inherits: false; initial-value: __cornerfill_unset__ } } .card { corner-shape: bevel }", /must be one top-level rule/u],
    ["@property --cornerfill-corner-top-left-shape { syntax: '*' !important; inherits: false; initial-value: __cornerfill_unset__ } .card { corner-shape: bevel }", /cannot be important/u],
    [":host-context(.theme .wrapper) .card { corner-shape: bevel }", /one compound selector/u],
    [":host > .card { corner-shape: bevel }", /host-relative child and sibling combinators/u],
    [".card { border-radius: attr(data-radius type(<length>), 0px); corner-shape: bevel }", /attr\(\) creates an unobservable attribute dependency/u],
    [".card { --radius: attr(data-radius type(<length>), 0px); border-radius: var(--radius); corner-shape: bevel }", /cannot observe --radius.*attr\(\)/u],
    [".card { border-radius: 10cqi; corner-shape: bevel }", /container-relative units create an unobservable container dependency/u],
    [".card { --radius: 10cqmin; border-radius: var(--radius); corner-shape: bevel }", /cannot observe --radius.*container-relative units/u],
    [".parent { & .card { corner-shape: bevel } }", /after the nesting transform/u],
  ]) {
    await assert.rejects(
      postcss([cornerfillPostcss()]).process(source, { from: "unsafe.css" }),
      (error) => error.name === "CssSyntaxError"
        && error.line === 1
        && message.test(error.message),
    );
  }

  const layered = await postcss([cornerfillPostcss()]).process(`
    @layer base, theme;
    @media all {
      @layer theme { .card { corner-shape: bevel } }
    }
  `, { from: "layered.css" });
  assert.match(layered.css, /@layer base, theme/u);
  assert.match(layered.css, /@media all\s*\{\s*@layer theme/u);

  await assert.rejects(
    postcss([cornerfillPostcss()]).process(`
      @layer { @layer theme { .unrelated { color: red } } }
      @media (prefers-color-scheme: dark) { @layer theme; }
      @layer base { .face { corner-shape: bevel } }
      @layer theme { .face { corner-shape: scoop } }
    `, { from: "anonymous-layer.css" }),
    /conditional cascade-layer first establishment/u,
  );
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
  const reset = await postcss([cornerfillPostcss()]).process(
    ".theme { all: initial; }",
    { from: "reset.css" },
  );
  const alias = await postcss([cornerfillPostcss()]).process(
    "@media (prefers-color-scheme: dark) { .face { -webkit-border-radius: 12px; } }",
    { from: "alias.css" },
  );
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
  assert.equal(read(reset.css).observation.invalidation, "subtree");
  assert.deepEqual(read(alias.css).mediaQueries, ["(prefers-color-scheme: dark)"]);
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
