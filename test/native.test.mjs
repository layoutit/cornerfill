import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { qualifyNativeCornerShape } from "../dist/native.mjs";

test("native qualification has no fallback import closure", () => {
  const source = readFileSync(new URL("../src/native.mts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/mu);
  for (const fallback of ["auto-runtime", "runtime", "geometry", "paint", "background", "images", "backends"]) {
    assert.doesNotMatch(source, new RegExp(`from ["']\\./${fallback}\\.mjs["']`, "u"));
  }
});

test("the package root statically imports only native and oracle qualification", () => {
  const source = readFileSync(new URL("../dist/auto.mjs", import.meta.url), "utf8");
  const staticImports = [...source.matchAll(/^\s*import\s+[^;]+?from\s+["']([^"']+)["']/gmu)]
    .map((match) => match[1]);
  assert.deepEqual(staticImports, ["./native.mjs", "./qualification.mjs"]);
  assert.match(source, /await import\("\.\/auto-runtime\.mjs"\)/u);
  assert.doesNotMatch(source, /getCSSCanvasContext|mozSetImageElement|fullNativeQualified/u);
});

test("syntax support alone cannot qualify native corner-shape", () => {
  const style = {
    setProperty() {},
  };
  const element = {
    remove() {},
    setAttribute() {},
    style,
  };
  const isolated = {
    createElement: () => element,
    documentElement: { append() {} },
    defaultView: {
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      innerHeight: 100,
      innerWidth: 100,
    },
  };
  const document = {
    createElement: () => ({ contentDocument: isolated, remove() {}, setAttribute() {}, style }),
    documentElement: { append() {} },
    defaultView: { CSS: { supports: () => true } },
  };
  const result = qualifyNativeCornerShape(document);
  assert.equal(result.qualified, false);
  assert.equal(result.requirements.syntax.supported, true);
  assert.equal(result.capabilities.syntax, "supported");
  assert.equal(result.capabilities.computedValues, "unsupported");
  assert.equal(result.capabilities.outerPaint, "unobserved");
  assert.deepEqual(result.unresolved, ["computedValues", "shapedHitTesting"]);
});

test("unobservable shaped hit testing cannot qualify native delegation", () => {
  let attempts = 0;
  const isolatedDocument = (size) => {
    let probe = null;
    const style = {
      currentShape: "",
      setProperty(property, value) {
        if (property === "corner-shape") this.currentShape = value;
      },
    };
    const element = { remove() {}, setAttribute() {}, style };
    return {
      body: { style: {} },
      createElement: () => element,
      documentElement: { append(value) { probe = value; } },
      elementFromPoint: () => style.currentShape === "round" ? probe : null,
      defaultView: {
        innerHeight: size,
        innerWidth: size,
        getComputedStyle: () => ({
          getPropertyValue(property) {
            if (property === "corner-shape") return style.currentShape;
            const index = [
              "corner-top-left-shape",
              "corner-top-right-shape",
              "corner-bottom-right-shape",
              "corner-bottom-left-shape",
              "corner-start-start-shape",
              "corner-start-end-shape",
              "corner-end-end-shape",
              "corner-end-start-shape",
            ].indexOf(property);
            return index >= 0
              ? ["superellipse(0)", "superellipse(-1)", "superellipse(1)", "superellipse(-infinity)"][index % 4]
              : "";
          },
        }),
      },
    };
  };
  const document = {
    createElement(name) {
      assert.equal(name, "iframe");
      attempts += 1;
      return {
        contentDocument: isolatedDocument(attempts === 1 ? 20 : 128),
        remove() {},
        setAttribute() {},
        style: { setProperty() {} },
      };
    },
    documentElement: { append() {} },
    defaultView: { CSS: { supports: () => true } },
  };
  const unobservable = qualifyNativeCornerShape(document);
  assert.equal(unobservable.qualified, false);
  assert.equal(unobservable.tiers.computedValuesQualified, true);
  assert.equal(unobservable.tiers.observableShapeQualified, false);
  assert.equal(unobservable.capabilities.shapedHitTesting, "unobserved");
  const qualified = qualifyNativeCornerShape(document);
  assert.equal(qualified.qualified, true);
  assert.equal(qualified.tiers.observableShapeQualified, true);
  assert.equal(qualified.capabilities.innerBorderContour, "unobserved");
  assert.equal(attempts, 2);
});

test("native computed-value qualification falls back to the host document when iframe isolation is blocked", () => {
  let probe = null;
  let frameRemoved = false;
  const style = {
    currentShape: "",
    setProperty(property, value) {
      if (property === "corner-shape") this.currentShape = value;
    },
  };
  const element = { remove() { probe = null; }, setAttribute() {}, style };
  const document = {
    createElement(name) {
      if (name === "iframe") return {
        contentDocument: null,
        remove() { frameRemoved = true; },
        setAttribute() {},
        style: { setProperty() {} },
      };
      assert.equal(name, "div");
      return element;
    },
    documentElement: { append(value) { probe = value; } },
    elementFromPoint: () => style.currentShape === "round" ? probe : null,
    defaultView: {
      CSS: { supports: () => true },
      innerHeight: 128,
      innerWidth: 128,
      getComputedStyle: () => ({
        getPropertyValue(property) {
          if (property === "corner-shape") return style.currentShape;
          const index = [
            "corner-top-left-shape",
            "corner-top-right-shape",
            "corner-bottom-right-shape",
            "corner-bottom-left-shape",
            "corner-start-start-shape",
            "corner-start-end-shape",
            "corner-end-end-shape",
            "corner-end-start-shape",
          ].indexOf(property);
          return index >= 0
            ? ["superellipse(0)", "superellipse(-1)", "superellipse(1)", "superellipse(-infinity)"][index % 4]
            : "";
        },
      }),
    },
  };
  const result = qualifyNativeCornerShape(document);
  assert.equal(result.qualified, true);
  assert.equal(result.capabilities.shapedHitTesting, "supported");
  assert.equal(frameRemoved, true);
});

test("observable shaped hit-testing failure prevents native qualification", () => {
  const values = ["superellipse(0)", "superellipse(-1)", "superellipse(1)", "superellipse(-infinity)"];
  const longhands = [
    "corner-top-left-shape",
    "corner-top-right-shape",
    "corner-bottom-right-shape",
    "corner-bottom-left-shape",
    "corner-start-start-shape",
    "corner-start-end-shape",
    "corner-end-end-shape",
    "corner-end-start-shape",
  ];
  const style = {
    currentShape: "",
    setProperty(property, value) {
      if (property === "corner-shape") this.currentShape = value;
    },
  };
  const element = { remove() {}, setAttribute() {}, style };
  const isolated = {
    body: { style: {} },
    createElement: () => element,
    documentElement: { append() {} },
    elementFromPoint: () => null,
    defaultView: {
      innerHeight: 128,
      innerWidth: 128,
      getComputedStyle: () => ({
        getPropertyValue(property) {
          if (property === "corner-shape") return style.currentShape;
          const index = longhands.indexOf(property);
          return index >= 0 ? values[index % 4] : "";
        },
      }),
    },
  };
  const document = {
    createElement: () => ({ contentDocument: isolated, remove() {}, setAttribute() {}, style: { setProperty() {} } }),
    documentElement: { append() {} },
    defaultView: { CSS: { supports: () => true } },
  };
  const result = qualifyNativeCornerShape(document);
  assert.equal(result.qualified, false);
  assert.deepEqual(result.unresolved, ["shapedHitTesting"]);
  assert.equal(result.capabilities.shapedHitTesting, "unsupported");
});
