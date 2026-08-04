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

const qualifiedNative = Object.freeze({ qualified: true });

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
});
