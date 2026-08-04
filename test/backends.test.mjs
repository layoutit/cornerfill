import test from "node:test";
import assert from "node:assert/strict";
import { createSurface, getSurfaceResourceStats } from "../dist/backends.mjs";

function webkitDocument({ releaseClearThrows = false } = {}) {
  const contexts = new Map();
  const calls = [];
  const state = { restores: 0, saves: 0 };
  return {
    calls,
    state,
    defaultView: {
      devicePixelRatio: 1,
      CSS: { supports: () => false },
    },
    getCSSCanvasContext(_kind, id, width, height) {
      calls.push({ id, width, height });
      const context = {
        canvas: { width, height },
        save() { state.saves += 1; },
        restore() { state.restores += 1; },
        setTransform() {},
        clearRect() {
          if (releaseClearThrows && width === 1 && height === 1) {
            throw new Error("injected WebKit release clear failure");
          }
        },
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

test("failed WebKit release restores Canvas state before pooling its identifier", () => {
  const document = webkitDocument({ releaseClearThrows: true });
  const first = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 10,
    cssHeight: 10,
    idPrefix: "failed-release-proof",
  });
  const id = first.id;
  first.dispose();
  assert.equal(document.state.saves, 1);
  assert.equal(document.state.restores, 1);
  assert.equal(getSurfaceResourceStats(document).webkit.shrinkFailures, 1);
  const second = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 5,
    cssHeight: 5,
    idPrefix: "failed-release-proof",
  });
  assert.equal(second.id, id);
  second.dispose();
});

function firefoxDocument({ context = {}, registrationThrows = false, unregisterThrows = false } = {}) {
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
      if (unregisterThrows && !element) throw new Error("unregister failed");
    },
  };
}

test("Firefox support requires live Canvas registration, not syntax alone", () => {
  const document = {
    defaultView: {
      CSS: { supports: () => true },
      devicePixelRatio: 1,
    },
    createElement() {
      return {
        getContext: () => ({}),
        remove() {},
        setAttribute() {},
        style: {},
      };
    },
  };
  assert.throws(() => createSurface(document, {
    backend: "moz-element",
    cssWidth: 10,
    cssHeight: 10,
  }), /unavailable/u);
});

test("Firefox admits the surface pixel boundary and validates overflow before registration", () => {
  const document = firefoxDocument();
  const below = createSurface(document, {
    backend: "moz-element",
    cssWidth: 3,
    cssHeight: 3,
    maxSurfacePixels: 10,
  });
  below.dispose();
  const exact = createSurface(document, {
    backend: "moz-element",
    cssWidth: 2,
    cssHeight: 5,
    maxSurfacePixels: 10,
  });
  exact.dispose();
  document.registrations.length = 0;
  assert.throws(() => createSurface(document, {
    backend: "moz-element",
    cssWidth: 11,
    cssHeight: 1,
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
  assert.deepEqual(getSurfaceResourceStats(document).firefox, {
    registrations: 0,
    unregisterFailures: 0,
  });
});

test("Firefox teardown completes and reports an unregister failure", () => {
  const document = firefoxDocument({ unregisterThrows: true });
  const surface = createSurface(document, {
    backend: "moz-element",
    cssWidth: 10,
    cssHeight: 10,
  });
  assert.doesNotThrow(() => surface.dispose());
  assert.equal(document.canvas.width, 1);
  assert.equal(document.canvas.height, 1);
  assert.deepEqual(getSurfaceResourceStats(document).firefox, {
    registrations: 1,
    unregisterFailures: 1,
  });
});

test("WebKit overflow IDs remain reusable and every released canvas is shrunk", () => {
  const document = webkitDocument();
  const surfaces = Array.from({ length: 3 }, () => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 20,
    cssHeight: 20,
    idPrefix: "bounded",
    maxWebkitPoolEntries: 1,
    maxWebkitPoolPrefixes: 1,
  }));
  const originalIds = new Set(surfaces.map(({ id }) => id));
  for (const surface of surfaces) surface.dispose();
  const stats = getSurfaceResourceStats(document).webkit;
  assert.equal(stats.pooledCanvases, 3);
  assert.equal(stats.retainedPixels, 3);
  assert.equal(stats.shrinkFailures, 0);
  const reused = Array.from({ length: 3 }, () => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 10,
    cssHeight: 10,
    idPrefix: "different-prefix",
    maxWebkitPoolEntries: 1,
    maxWebkitPoolPrefixes: 1,
  }));
  assert.deepEqual(new Set(reused.map(({ id }) => id)), originalIds);
  assert.equal(getSurfaceResourceStats(document).webkit.activeCanvases, 3);
  for (const surface of reused) surface.dispose();
});

test("separate module copies share a collision-resistant document ID registry", async () => {
  const firstModule = await import("../dist/backends.mjs?copy=first");
  const secondModule = await import("../dist/backends.mjs?copy=second");
  const document = firefoxDocument();
  const first = firstModule.createSurface(document, {
    backend: "moz-element",
    cssWidth: 10,
    cssHeight: 10,
  });
  const second = secondModule.createSurface(document, {
    backend: "moz-element",
    cssWidth: 10,
    cssHeight: 10,
  });
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.id, "cornerfill-1");
  first.dispose();
  second.dispose();
});
