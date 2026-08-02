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
  assert.deepEqual(result.unresolved, ["computedValues", "shapedBehavior"]);
});

test("an unobservable native probe is not cached", () => {
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
            ].indexOf(property);
            return index >= 0
              ? ["superellipse(0)", "superellipse(-1)", "superellipse(1)", "superellipse(-infinity)"][index]
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
  assert.equal(qualifyNativeCornerShape(document).qualified, false);
  const qualified = qualifyNativeCornerShape(document);
  assert.equal(qualified.qualified, true);
  assert.equal(qualified.capabilities.shapedHitTesting, "supported");
  assert.equal(qualified.capabilities.innerBorderContour, "unobserved");
  assert.equal(attempts, 2);
});
