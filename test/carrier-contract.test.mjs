import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_ALL_PENDING,
  AUTO_ALL_VALUE,
  AUTO_SHAPE_SOURCE,
  COMPILED_MANIFEST_SCHEMA,
  SHAPE_CARRIERS,
  compileAllCarrierDeclarations,
  compileShapeCarrierDeclarations,
  compiledCarrierProblem,
  createCompiledManifest,
  parseCompiledManifest,
  serializeCompiledManifest,
} from "../dist/carrier-contract.mjs";

const observation = Object.freeze({
  attributes: Object.freeze(["id", "class", "class"]),
  characterData: false,
  conservative: false,
  events: Object.freeze(["focusout", "focusin"]),
  invalidation: "self",
  unobservableStates: Object.freeze([]),
});

test("pending all substitutions accept reset outcomes and refuse cascade-dependent ones", () => {
  const values = {
    [AUTO_ALL_PENDING]: "1",
    [SHAPE_CARRIERS[0]]: "bevel",
    [AUTO_ALL_VALUE]: "__cornerfill_all__ unset",
  };
  assert.equal(compiledCarrierProblem(values), null);
  assert.match(
    compiledCarrierProblem({
      ...values,
      [AUTO_ALL_VALUE]: "__cornerfill_all__ revert-layer",
    }),
    /cannot safely transport this all: var/u,
  );
  assert.match(
    compiledCarrierProblem({
      [AUTO_ALL_PENDING]: "1",
      [AUTO_ALL_VALUE]: "__cornerfill_all__ revert-layer",
      [AUTO_SHAPE_SOURCE]: "1",
    }),
    /cannot safely transport this all: var/u,
  );
});

test("the shared carrier compiler emits structured per-corner declarations", () => {
  const records = compileShapeCarrierDeclarations("corner-shape", "bevel", true);
  assert.deepEqual(records.slice(0, 4), [
    { property: "--cornerfill-corner-top-left-shape", value: "bevel", important: true },
    { property: "--cornerfill-corner-top-right-shape", value: "bevel", important: true },
    { property: "--cornerfill-corner-bottom-right-shape", value: "bevel", important: true },
    { property: "--cornerfill-corner-bottom-left-shape", value: "bevel", important: true },
  ]);
  assert(records.some(({ property, value }) => property === AUTO_SHAPE_SOURCE && value === "1"));
  assert(compileAllCarrierDeclarations("var(--reset)").some(
    ({ property, value }) => property === AUTO_ALL_PENDING && value === "1",
  ));
});

test("compiled manifests normalize and round-trip deterministically", () => {
  const input = {
    candidateSelectors: [".z", ".a", ".z"],
    customProperties: [{
      name: "--tone",
      references: ["--palette", "--palette"],
      observation,
    }, {
      name: "--ä",
      observation,
    }, {
      name: "--z",
      observation,
    }],
    inheritedReferencedCustomProperties: ["--tone"],
    mediaQueries: ["(min-width: 10px)", ""],
    observation,
    referencedCustomProperties: ["--tone"],
  };
  const created = createCompiledManifest(input);
  assert.equal(created.schema, COMPILED_MANIFEST_SCHEMA);
  assert.deepEqual(created.candidateSelectors, [".a", ".z"]);
  assert.deepEqual(created.referencedCustomProperties, ["--tone"]);
  assert.deepEqual(created.inheritedReferencedCustomProperties, ["--tone"]);
  assert.deepEqual(created.customProperties.map(({ name }) => name), ["--tone", "--z", "--ä"]);
  assert.deepEqual(created.customProperties[0].references, ["--palette"]);
  assert.deepEqual(created.observation.attributes, ["class", "id"]);
  assert.deepEqual(parseCompiledManifest(serializeCompiledManifest(input)), created);
});

test("compiled manifests permit metadata without candidate selectors", () => {
  const created = createCompiledManifest({
    observation,
    referencedCustomProperties: ["--paint"],
  });
  assert.deepEqual(created.candidateSelectors, []);
  assert.deepEqual(created.referencedCustomProperties, ["--paint"]);
});

test("compiled manifests fail closed on malformed or mismatched input", () => {
  assert.throws(
    () => parseCompiledManifest('{"schema":"cornerfill-compiled@999"}'),
    /unsupported compiled manifest schema/u,
  );
  assert.throws(
    () => parseCompiledManifest(JSON.stringify({
      schema: COMPILED_MANIFEST_SCHEMA,
      candidateSelectors: [7],
      customProperties: [],
      inheritedReferencedCustomProperties: [],
      mediaQueries: [],
      referencedCustomProperties: [],
      observation,
    })),
    /entries must be strings/u,
  );
});
