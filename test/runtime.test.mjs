import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBackgroundPosition } from "../dist/background.mjs";

const qualifiedNative = Object.freeze({ qualified: true });

class FakeStyle {
  constructor() {
    this.values = new Map();
    this.priorities = new Map();
  }

  getPropertyPriority(property) { return this.priorities.get(property) ?? ""; }
  getPropertyValue(property) { return this.values.get(property) ?? ""; }
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

function nativeDocument() {
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
  return {
    document,
    element() { return new Element(document); },
  };
}

async function runtimeInternals() {
  const runtimeUrl = new URL("../dist/runtime.mjs", import.meta.url);
  const source = readFileSync(runtimeUrl, "utf8")
    .replace(/(from\s+["'])(\.\/[^"']+)(["'])/gu, (_match, start, relative, end) => (
      `${start}${new URL(relative, runtimeUrl).href}${end}`
    ));
  const instrumented = `${source}\nexport { captureBackgroundPosition as __captureBackgroundPosition, CornerfillController as __CornerfillController };`;
  return import(`data:text/javascript;base64,${Buffer.from(instrumented).toString("base64")}`);
}

test("native handles dispose and controllers destroy without teardown errors", async () => {
  const { installCornerfill } = await import("../dist/runtime.mjs?native-teardown-test");
  const fixture = nativeDocument();
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
  const { __captureBackgroundPosition } = await runtimeInternals();
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
    controller: { ownershipId: "owner-1", view },
    dynamicBackgroundPositionSpec: parseBackgroundPosition("-64px -48px"),
    element,
    initial: {
      dynamic: { paintPosition: true },
      initialBackground: { backgroundPosition: "13px 17px" },
    },
    inlineBackgroundPositionX: "-64px",
    inlineBackgroundPositionY: "-48px",
  };

  assert.equal(__captureBackgroundPosition(entry), true);
  assert.equal(entry.dynamicBackgroundPositionSpec.x.source, "13px");
  assert.equal(entry.dynamicBackgroundPositionSpec.y.source, "17px");
  assert.equal(attributes.get("data-cornerfill-owned"), "owner-1");
  assert.equal(attributes.get("data-cornerfill-owned-border"), "owner-1");
});

test("an observed position-only mutation uses the paint-only refresh path", async () => {
  const { __CornerfillController } = await runtimeInternals();
  const calls = [];
  const controller = Object.create(__CornerfillController.prototype);
  controller._reconcileEntryOwnershipRoot = () => false;
  controller._refreshDynamicPaint = (_entry, reason) => {
    calls.push(["paint-only", reason]);
    return "paint-only";
  };
  controller._refreshEntryFull = (_entry, reason) => {
    calls.push(["full", reason]);
    return "full";
  };
  const entry = {
    dynamicPaintSource: { kind: "image" },
    fullRefreshPending: false,
    initial: { dynamic: { paint: true, paintPosition: true } },
    pendingReason: "background-position",
    state: {},
  };

  assert.equal(controller._refreshEntry(entry, 1), "paint-only");
  assert.deepEqual(calls, [["paint-only", "background-position"]]);
});
