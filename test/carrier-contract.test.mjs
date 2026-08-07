import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_ALL_PENDING,
  AUTO_ALL_VALUE,
  AUTO_SHAPE_SOURCE,
  COMPILED_MANIFEST_SCHEMA,
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
    [AUTO_SHAPE_SOURCE]: "1",
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
    selectors: [".z", ".a", ".z"],
    mediaQueries: ["(min-width: 10px)", ""],
    observation,
  };
  const created = createCompiledManifest(input);
  assert.equal(created.schema, COMPILED_MANIFEST_SCHEMA);
  assert.deepEqual(created.selectors, [".a", ".z"]);
  assert.deepEqual(created.observation.attributes, ["class", "id"]);
  assert.deepEqual(parseCompiledManifest(serializeCompiledManifest(input)), created);
});

test("compiled manifests fail closed on malformed or mismatched input", () => {
  assert.throws(
    () => parseCompiledManifest('{"schema":"cornerfill-compiled@2"}'),
    /unsupported compiled manifest schema/u,
  );
  assert.throws(
    () => parseCompiledManifest(JSON.stringify({
      schema: COMPILED_MANIFEST_SCHEMA,
      selectors: [7],
      mediaQueries: [],
      observation,
    })),
    /entries must be strings/u,
  );
});
