import test from "node:test";
import assert from "node:assert/strict";
import { createSurface, getSurfaceResourceStats } from "../src/backends.mjs";

function webkitDocument() {
  const contexts = new Map();
  const calls = [];
  return {
    calls,
    defaultView: {
      devicePixelRatio: 1,
      CSS: { supports: () => false },
    },
    getCSSCanvasContext(_kind, id, width, height) {
      calls.push({ id, width, height });
      const context = {
        canvas: { width, height },
        save() {},
        restore() {},
        setTransform() {},
        clearRect() {},
      };
      contexts.set(id, context);
      return context;
    },
  };
}

test("disposed WebKit named canvas identifiers are reused per document and prefix", () => {
  const document = webkitDocument();
  const first = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 10,
    cssHeight: 10,
    idPrefix: "reuse-proof",
  });
  const firstId = first.id;
  first.dispose();
  assert.deepEqual(document.calls.at(-1), { id: firstId, width: 1, height: 1 });
  assert.deepEqual(getSurfaceResourceStats(document).webkit, {
    activeCanvases: 0,
    pooledCanvases: 1,
    pooledPixels: 1,
    retiredCanvases: 0,
    retiredPixels: 0,
    retainedCanvases: 1,
    retainedPixels: 1,
    prefixes: 1,
    shrinkFailures: 0,
  });
  const second = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 20,
    cssHeight: 5,
    idPrefix: "reuse-proof",
  });
  assert.equal(second.id, firstId);
  assert.deepEqual(second.size, {
    cssWidth: 20,
    cssHeight: 5,
    dpr: 1,
    backingWidth: 20,
    backingHeight: 5,
  });
  second.dispose();
});

function firefoxDocument({ context = {}, registrationThrows = false } = {}) {
  const registrations = [];
  const canvas = {
    id: "",
    width: 300,
    height: 150,
    style: {},
    setAttribute() {},
    getContext() { return context; },
    remove() {},
  };
  return {
    registrations,
    canvas,
    defaultView: {
      devicePixelRatio: 1,
      CSS: { supports: () => true },
    },
    createElement(name) {
      assert.equal(name, "canvas");
      return canvas;
    },
    mozSetImageElement(id, element) {
      registrations.push([id, element]);
      if (registrationThrows && element) throw new Error("registration failed");
    },
  };
}

test("Firefox validates allocation before registering a live image", () => {
  const document = firefoxDocument();
  assert.throws(() => createSurface(document, {
    backend: "moz-element",
    cssWidth: 100,
    cssHeight: 100,
    maxSurfacePixels: 10,
  }), /exceeds 10 pixels/u);
  assert.deepEqual(document.registrations, []);
});

test("Firefox registration failure rolls back the exact ID", () => {
  const document = firefoxDocument({ registrationThrows: true });
  assert.throws(() => createSurface(document, {
    backend: "moz-element",
    cssWidth: 10,
    cssHeight: 10,
  }), /registration failed/u);
  assert.equal(document.registrations.length, 2);
  assert.equal(document.registrations[0][0], document.registrations[1][0]);
  assert.equal(document.registrations[1][1], null);
  assert.equal(document.canvas.width, 1);
  assert.equal(document.canvas.height, 1);
  assert.equal(getSurfaceResourceStats(document).firefox.registrations, 0);
});

test("WebKit reuse pools are bounded and every released canvas is shrunk", () => {
  const document = webkitDocument();
  const surfaces = Array.from({ length: 3 }, () => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 20,
    cssHeight: 20,
    idPrefix: "bounded",
    maxWebkitPoolEntries: 1,
    maxWebkitPoolPrefixes: 1,
  }));
  for (const surface of surfaces) surface.dispose();
  const stats = getSurfaceResourceStats(document).webkit;
  assert.equal(stats.pooledCanvases, 1);
  assert.equal(stats.retiredCanvases, 2);
  assert.equal(stats.retainedPixels, 3);
  assert.equal(stats.shrinkFailures, 0);
});
