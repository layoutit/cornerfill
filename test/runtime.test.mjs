import test from "node:test";
import assert from "node:assert/strict";
import { parseBackgroundPosition } from "../dist/background.mjs";
import {
  canRefreshDynamicPaint,
  captureBackgroundPosition,
} from "../dist/style.mjs";
import {
  observeDisabledState,
  observeStylesheetMutations,
} from "../dist/cssom-broker.mjs";

function nativeQualification(qualified) {
  const requirement = () => Object.freeze({ supported: qualified, observable: true });
  return Object.freeze({
    schema: "cornerfill-native-qualification@2",
    qualified,
    requirements: Object.freeze({
      syntax: requirement(),
      computedValues: requirement(),
      shapedHitTesting: requirement(),
    }),
    unresolved: Object.freeze(qualified ? [] : ["syntax", "computedValues", "shapedHitTesting"]),
  });
}

const qualifiedNative = nativeQualification(true);

class FakeStyle {
  constructor() {
    this.values = new Map();
    this.priorities = new Map();
  }

  get length() { return this.values.size; }
  getPropertyPriority(property) { return this.priorities.get(property) ?? ""; }
  getPropertyValue(property) { return this.values.get(property) ?? ""; }
  item(index) { return [...this.values.keys()][index] ?? ""; }
  removeProperty(property) {
    const value = this.getPropertyValue(property);
    this.values.delete(property);
    this.priorities.delete(property);
    return value;
  }
  setProperty(property, value, priority = "") {
    this.values.set(property, String(value));
    if (priority) this.priorities.set(property, priority);
    else this.priorities.delete(property);
  }
}

function nativeDocument({ liveFallback = false } = {}) {
  class Element {
    constructor(ownerDocument) {
      this.ownerDocument = ownerDocument;
      this.style = new FakeStyle();
    }
  }
  class Image {}
  const view = {
    CSS: { supports: () => true },
    Element,
    Image,
    cancelAnimationFrame() {},
    getComputedStyle(element) {
      return {
        direction: "ltr",
        getPropertyValue: (property) => element.style.getPropertyValue(property),
        writingMode: "horizontal-tb",
      };
    },
    removeEventListener() {},
  };
  const document = { baseURI: "https://example.test/", defaultView: view };
  if (liveFallback) {
    document.getCSSCanvasContext = () => {
      throw new Error("a qualified native attachment must not initialize the fallback backend");
    };
  }
  return {
    document,
    element() { return new Element(document); },
  };
}

test("runtime rejects non-finite resource budgets before creating state", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?resource-budget-validation-test");
  const { document } = nativeDocument();
  for (const name of [
    "maxActiveEntries",
    "maxSurfacePixels",
    "maxTotalSurfacePixels",
    "maxGeometryCacheEntries",
    "maxImageCacheEntries",
    "maxImageCachePixels",
    "imageTimeoutMs",
  ]) {
    assert.throws(
      () => installCornerfill({ document, [name]: Number.NaN }),
      new RegExp(name, "u"),
    );
  }
  assert.throws(
    () => installCornerfill({ document, imageTimeoutMs: 2_147_483_648 }),
    /no greater than 2147483647/u,
  );
  assert.throws(
    () => installCornerfill({ document, backend: "canvas-ish" }),
    /unknown Cornerfill surface backend/u,
  );
  assert.throws(() => installCornerfill([]), /options must be an object/u);
  assert.throws(
    () => installCornerfill({ document, observe: "false" }),
    /observe must be a boolean/u,
  );
});

test("qualified native handles ignore fallback API availability and tear down cleanly", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-teardown-test");
  const fixture = nativeDocument({ liveFallback: true });
  const first = fixture.element();
  first.style.setProperty("corner-shape", "round");
  first.style.setProperty("border-radius", "4px");
  const controller = installCornerfill({ document: fixture.document, nativeQualification: qualifiedNative });
  const handle = controller.attach(first, { cornerShape: "bevel", borderRadius: "16px" });
  await handle.ready;
  assert.equal(handle.backend, "native-corner-shape");
  assert.doesNotThrow(() => handle.dispose());
  assert.equal(first.style.getPropertyValue("corner-shape"), "round");
  assert.equal(first.style.getPropertyValue("border-radius"), "4px");
  assert.equal(controller.stats().counters.detachments, 1);
  assert.doesNotThrow(() => controller.destroy());

  const second = fixture.element();
  second.style.setProperty("corner-shape", "round");
  second.style.setProperty("border-radius", "5px");
  const destroyController = installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });
  await destroyController.attach(second, { cornerShape: "notch", borderRadius: "18px" }).ready;
  assert.doesNotThrow(() => destroyController.destroy());
  assert.equal(second.style.getPropertyValue("corner-shape"), "round");
  assert.equal(second.style.getPropertyValue("border-radius"), "5px");
  assert.equal(destroyController.stats().counters.detachments, 1);
});

test("native attachment claims an element before author-observable style writes", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-reentrant-claim-test");
  const fixture = nativeDocument();
  const element = fixture.element();
  const first = installCornerfill({ document: fixture.document, nativeQualification: qualifiedNative });
  const second = installCornerfill({ document: fixture.document, nativeQualification: qualifiedNative });
  const setProperty = element.style.setProperty;
  let attempted = false;
  let reentrantError = null;
  element.style.setProperty = function setPropertyWithReentry(property, value, priority) {
    if (!attempted && property === "corner-shape") {
      attempted = true;
      try { second.attach(element, { cornerShape: "notch" }); } catch (error) { reentrantError = error; }
    }
    return setProperty.call(this, property, value, priority);
  };
  const handle = first.attach(element, { cornerShape: "bevel" });
  assert.match(reentrantError?.message ?? "", /another Cornerfill controller/u);
  assert.equal(first.stats().entries, 1);
  assert.equal(second.stats().entries, 0);
  handle.dispose();
  first.destroy();
  second.destroy();
});

test("native teardown retains its element claim through author-observable restoration", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-reentrant-release-test");
  const fixture = nativeDocument();
  const element = fixture.element();
  element.style.setProperty("corner-shape", "round");
  const first = installCornerfill({ document: fixture.document, nativeQualification: qualifiedNative });
  const second = installCornerfill({ document: fixture.document, nativeQualification: qualifiedNative });
  const handle = first.attach(element, { cornerShape: "bevel" });
  const setProperty = element.style.setProperty;
  let attempted = false;
  let reentrantError = null;
  element.style.setProperty = function setPropertyWithReentry(property, value, priority) {
    if (!attempted && property === "corner-shape") {
      attempted = true;
      try { second.attach(element, { cornerShape: "notch" }); } catch (error) { reentrantError = error; }
    }
    return setProperty.call(this, property, value, priority);
  };
  handle.dispose();
  assert.match(reentrantError?.message ?? "", /another Cornerfill controller/u);
  assert.equal(element.style.getPropertyValue("corner-shape"), "round");
  assert.equal(first.stats().entries, 0);
  assert.equal(second.stats().entries, 0);
  const replacement = second.attach(element, { cornerShape: "notch" });
  replacement.dispose();
  first.destroy();
  second.destroy();
});

test("runtime owns an injected native qualification snapshot", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-qualification-snapshot-test");
  const fixture = nativeDocument();
  assert.throws(
    () => installCornerfill({ document: fixture.document, nativeQualification: { qualified: true } }),
    /requires schema/u,
  );
  assert.throws(
    () => installCornerfill({
      document: fixture.document,
      nativeQualification: {
        ...nativeQualification(false),
        qualified: true,
      },
    }),
    /contradicts its requirement evidence/u,
  );
  const unresolved = [];
  const qualification = {
    ...nativeQualification(true),
    requirements: {
      syntax: { supported: true, observable: true },
      computedValues: { supported: true, observable: true },
      shapedHitTesting: { supported: true, observable: true },
    },
    unresolved,
  };
  const controller = installCornerfill({
    document: fixture.document,
    nativeQualification: qualification,
  });
  qualification.qualified = false;
  unresolved.push("syntax");
  assert.equal(controller.capabilities.native.qualified, true);
  assert.deepEqual(controller.capabilities.native.unresolved, []);
  assert(Object.isFrozen(controller.capabilities.native));
  assert(Object.isFrozen(controller.capabilities.native.unresolved));
  const handle = controller.attach(fixture.element(), { cornerShape: "bevel" });
  assert.equal(handle.mode, "native");
  handle.dispose();
  controller.destroy();
});

test("authored-style inspection captures a dense property list once", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?inspection-property-snapshot-test");
  const fixture = nativeDocument();
  const element = fixture.element();
  element.style.setProperty("color", "red");
  element.style.setProperty("background-color", "blue");
  const controller = installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });
  const properties = ["color", "border-radius"];
  let reads = 0;
  Object.defineProperty(properties, 0, {
    configurable: true,
    get() {
      reads += 1;
      properties[1] = "background-color";
      return reads === 1 ? "color" : "border-color";
    },
  });
  const inspection = controller.inspectAuthoredStyle(element, properties);
  assert.equal(reads, 1);
  assert.deepEqual(inspection.values, {
    color: "red",
    "background-color": "blue",
  });
  assert(Object.isFrozen(inspection.values));
  const sparse = ["corner-shape", "border-radius"];
  delete sparse[0];
  assert.throws(
    () => controller.inspectAuthoredStyle(element, sparse),
    /dense array of strings/u,
  );
  controller.destroy();
});

test("native teardown restores owned declarations without overwriting concurrent edits", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-partial-teardown-test");
  const fixture = nativeDocument();
  const element = fixture.element();
  element.style.setProperty("color", "red");
  element.style.setProperty("corner-shape", "round");
  element.style.setProperty("corner-bottom-right-shape", "notch");
  element.style.setProperty("border-radius", "4px");
  element.style.setProperty("opacity", "0.5");
  const controller = installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });
  const handle = controller.attach(element, {
    cornerShape: {
      shorthand: "bevel",
      physical: { "top-left": "scoop", "top-right": "notch" },
    },
    borderRadius: {
      shorthand: "16px",
      physical: { "top-left": "8px", "top-right": "9px" },
    },
  });
  await handle.ready;

  element.style.setProperty("corner-top-left-shape", "square");
  element.style.setProperty("corner-bottom-left-shape", "superellipse(2)");
  element.style.setProperty("border-radius", "22px");
  handle.dispose();

  assert.equal(element.style.getPropertyValue("corner-shape"), "round");
  assert.equal(element.style.getPropertyValue("corner-bottom-right-shape"), "notch");
  assert.equal(element.style.getPropertyValue("corner-top-left-shape"), "square");
  assert.equal(element.style.getPropertyValue("corner-top-right-shape"), "");
  assert.equal(element.style.getPropertyValue("corner-bottom-left-shape"), "superellipse(2)");
  assert.equal(element.style.getPropertyValue("border-radius"), "22px");
  assert.equal(element.style.getPropertyValue("border-top-left-radius"), "");
  assert.deepEqual(
    Array.from({ length: element.style.length }, (_value, index) => element.style.item(index)),
    [
      "color",
      "corner-shape",
      "corner-bottom-right-shape",
      "border-radius",
      "opacity",
      "corner-top-left-shape",
      "corner-bottom-left-shape",
    ],
  );
  controller.destroy();
});

test("native CSSOM failures preserve inline state and do not stop later teardown", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-cssom-failure-test");
  const fixture = nativeDocument();
  const first = fixture.element();
  first.style.setProperty("color", "red");
  first.style.setProperty("opacity", "0.5");
  first.style.setProperty("corner-shape", "round");
  first.style.setProperty("border-radius", "3px");
  const originalOrder = Array.from(
    { length: first.style.length },
    (_value, index) => first.style.item(index),
  );
  const controller = installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });

  const originalSetProperty = first.style.setProperty;
  let failWrite = true;
  first.style.setProperty = function setPropertyWithFailure(property, value, priority) {
    if (failWrite && property === "border-radius") {
      failWrite = false;
      throw new Error("injected native write failure");
    }
    return originalSetProperty.call(this, property, value, priority);
  };
  assert.throws(
    () => controller.attach(first, { cornerShape: "bevel", borderRadius: "8px" }),
    /injected native write failure/u,
  );
  first.style.setProperty = originalSetProperty;
  assert.deepEqual(
    Array.from({ length: first.style.length }, (_value, index) => first.style.item(index)),
    originalOrder,
  );
  assert.equal(first.style.getPropertyValue("color"), "red");
  assert.equal(first.style.getPropertyValue("opacity"), "0.5");
  assert.equal(first.style.getPropertyValue("corner-shape"), "round");
  assert.equal(first.style.getPropertyValue("border-radius"), "3px");
  assert.equal(controller.stats().entries, 0);

  const second = fixture.element();
  second.style.setProperty("corner-shape", "round");
  second.style.setProperty("border-radius", "4px");
  const firstHandle = controller.attach(first, { cornerShape: "bevel", borderRadius: "8px" });
  const secondHandle = controller.attach(second, { cornerShape: "notch", borderRadius: "9px" });
  await Promise.all([firstHandle.ready, secondHandle.ready]);
  failWrite = true;
  first.style.setProperty = function setPropertyWithFailure(property, value, priority) {
    if (failWrite && property === "border-radius") {
      failWrite = false;
      throw new Error("injected native update failure");
    }
    return originalSetProperty.call(this, property, value, priority);
  };
  assert.throws(
    () => firstHandle.update({ cornerShape: "scoop", borderRadius: "11px" }),
    /injected native update failure/u,
  );
  first.style.setProperty = originalSetProperty;
  assert.equal(first.style.getPropertyValue("corner-shape"), "bevel");
  assert.equal(first.style.getPropertyValue("border-radius"), "8px");
  const originalRemoveProperty = first.style.removeProperty;
  let failRestore = true;
  first.style.removeProperty = function removePropertyWithFailure(property) {
    if (failRestore && property === "corner-shape") {
      failRestore = false;
      throw new Error("injected native restore failure");
    }
    return originalRemoveProperty.call(this, property);
  };
  assert.throws(() => controller.destroy(), AggregateError);
  first.style.removeProperty = originalRemoveProperty;
  assert.equal(first.style.getPropertyValue("color"), "red");
  assert.equal(first.style.getPropertyValue("opacity"), "0.5");
  assert.equal(second.style.getPropertyValue("corner-shape"), "round");
  assert.equal(second.style.getPropertyValue("border-radius"), "4px");
  assert.equal(controller.stats().entries, 0);

  const recovery = installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });
  await recovery.attach(first, { cornerShape: "scoop", borderRadius: "7px" }).ready;
  assert.doesNotThrow(() => recovery.destroy());
});

test("query-distinct runtime modules share one per-document element owner registry", async () => {
  const firstRuntime = await import("../dist/runtime.mjs?owner-registry-first");
  const secondRuntime = await import("../dist/runtime.mjs?owner-registry-second");
  const fixture = nativeDocument();
  const element = fixture.element();
  element.style.setProperty("corner-shape", "round");
  element.style.setProperty("border-radius", "4px");
  const first = firstRuntime.installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });
  const second = secondRuntime.installCornerfill({
    document: fixture.document,
    nativeQualification: qualifiedNative,
  });
  const firstHandle = first.attach(element, { cornerShape: "bevel", borderRadius: "10px" });
  await firstHandle.ready;
  assert.throws(
    () => second.attach(element, { cornerShape: "scoop", borderRadius: "20px" }),
    /already attached to another Cornerfill controller/u,
  );
  assert.equal(element.style.getPropertyValue("corner-shape"), "bevel");
  assert.equal(element.style.getPropertyValue("border-radius"), "10px");

  firstHandle.dispose();
  const secondHandle = second.attach(element, { cornerShape: "scoop", borderRadius: "20px" });
  await secondHandle.ready;
  assert.doesNotThrow(() => second.destroy());
  assert.equal(element.style.getPropertyValue("corner-shape"), "round");
  assert.equal(element.style.getPropertyValue("border-radius"), "4px");
  first.destroy();
});

test("removing observed inline position axes restores the authored computed position", async () => {
  const style = new FakeStyle();
  const attributes = new Map([
    ["data-cornerfill-owned", "owner-1"],
    ["data-cornerfill-owned-border", "owner-1"],
  ]);
  const element = {
    style,
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, String(value)),
  };
  const view = {
    getComputedStyle() {
      assert.equal(attributes.has("data-cornerfill-owned"), false);
      return {
        backgroundPosition: "13px 17px",
        getPropertyValue(property) {
          return property === "background-position" ? "13px 17px" : "";
        },
      };
    },
  };
  const entry = {
    backgroundPositionSpec: parseBackgroundPosition("-64px -48px"),
    element,
    initial: {
      dynamic: { paintPosition: true },
      initialBackgroundPosition: "13px 17px",
    },
    inlineBackgroundPositionX: "-64px",
    inlineBackgroundPositionY: "-48px",
  };

  assert.equal(captureBackgroundPosition(entry, (callback) => {
    attributes.delete("data-cornerfill-owned");
    attributes.delete("data-cornerfill-owned-border");
    try {
      return callback(view.getComputedStyle(element));
    } finally {
      attributes.set("data-cornerfill-owned", "owner-1");
      attributes.set("data-cornerfill-owned-border", "owner-1");
    }
  }), true);
  assert.equal(entry.backgroundPositionSpec.x.source, "13px");
  assert.equal(entry.backgroundPositionSpec.y.source, "17px");
  assert.equal(attributes.get("data-cornerfill-owned"), "owner-1");
  assert.equal(attributes.get("data-cornerfill-owned-border"), "owner-1");
});

test("an observed position-only mutation uses the paint-only refresh path", () => {
  assert.equal(canRefreshDynamicPaint({
    explicitPaint: false,
    fullRefresh: false,
    paintKind: "image",
    paintPosition: true,
    reason: "background-position",
  }), true);
  assert.equal(canRefreshDynamicPaint({
    explicitPaint: false,
    fullRefresh: true,
    paintKind: "image",
    paintPosition: true,
    reason: "background-position",
  }), false);
});

test("CSSOM mutation brokers notify every controller before surfacing an error", () => {
  const sheet = {
    rules: [],
    insertRule(rule, index = this.rules.length) {
      this.rules.splice(index, 0, rule);
      return index;
    },
    deleteRule(index) {
      this.rules.splice(index, 1);
    },
  };
  const originalInsertRule = sheet.insertRule;
  const calls = [];
  const reported = [];
  const brokerGlobal = { reportError(error) { reported.push(error); } };
  const releaseFirst = observeStylesheetMutations(brokerGlobal, sheet, () => {
    calls.push("first");
    throw undefined;
  });
  const releaseSecond = observeStylesheetMutations(brokerGlobal, sheet, () => {
    calls.push("second");
  });
  assert.equal(sheet.insertRule(".fixture{}"), 0);
  assert.deepEqual(calls, ["first", "second"]);
  assert.deepEqual(reported, [undefined]);
  releaseFirst();
  releaseSecond();
  assert.equal(sheet.insertRule, originalInsertRule);
});

test("disabled-state brokers notify every controller before surfacing an error", () => {
  const target = { disabled: false };
  const calls = [];
  const reported = [];
  const brokerGlobal = { reportError(error) { reported.push(error); } };
  const releaseFirst = observeDisabledState(brokerGlobal, target, () => {
    calls.push("first");
    throw new Error("first controller failed");
  });
  const releaseSecond = observeDisabledState(brokerGlobal, target, () => {
    calls.push("second");
  });
  target.disabled = true;
  assert.equal(target.disabled, true);
  assert.deepEqual(calls, ["first", "second"]);
  assert.match(reported[0].message, /first controller failed/u);
  releaseFirst();
  releaseSecond();
  assert.equal(target.disabled, true);
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "disabled"), {
    configurable: true,
    enumerable: true,
    value: true,
    writable: true,
  });
});
