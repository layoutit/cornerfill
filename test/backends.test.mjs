import test from "node:test";
import assert from "node:assert/strict";
import { createSurface, getSurfaceResourceStats } from "../dist/backends.mjs";

function webkitDocument({ allocationMismatch = false, releaseClearThrows = false } = {}) {
  const contexts = new Map();
  const calls = [];
  const state = { failAllocations: false, restores: 0, saves: 0 };
  return {
    calls,
    state,
    defaultView: {
      devicePixelRatio: 1,
      CSS: { supports: () => false },
    },
    getCSSCanvasContext(_kind, id, width, height) {
      calls.push({ id, width, height });
      if (state.failAllocations && width !== 1) {
        throw new Error("injected WebKit allocation failure");
      }
      const context = {
        canvas: {
          width: allocationMismatch && width !== 1 ? width * 2 : width,
          height,
        },
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

test("disposed WebKit named canvas identifiers are reused per document", () => {
  const document = webkitDocument();
  const first = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 10,
    cssHeight: 10,
  });
  const firstId = first.id;
  first.dispose();
  assert.deepEqual(document.calls.at(-1), { id: firstId, width: 1, height: 1 });
  assert.deepEqual(getSurfaceResourceStats(document).webkit, {
    activeCanvases: 0,
    activePixels: 0,
    peakActiveCanvases: 1,
    pooledCanvases: 1,
    pooledPixels: 1,
    shrinkFailures: 0,
  });
  const second = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 20,
    cssHeight: 5,
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
  });
  assert.equal(second.id, id);
  second.dispose();
});

test("failed WebKit reactivation retains the pooled canvas pixel ledger", () => {
  const document = webkitDocument({ releaseClearThrows: true });
  const first = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 10,
    cssHeight: 10,
  });
  first.dispose();
  assert.equal(getSurfaceResourceStats(document).webkit.pooledPixels, 100);
  document.state.failAllocations = true;
  assert.throws(() => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 5,
    cssHeight: 5,
  }), /injected WebKit allocation failure/u);
  const stats = getSurfaceResourceStats(document).webkit;
  assert.equal(stats.activeCanvases, 0);
  assert.equal(stats.pooledCanvases, 1);
  assert.equal(stats.pooledPixels, 100);
});

test("failed WebKit size validation retains the largest observed canvas allocation", () => {
  const document = webkitDocument({ allocationMismatch: true, releaseClearThrows: true });
  assert.throws(() => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 5,
    cssHeight: 5,
  }), /backing size mismatch/u);
  const stats = getSurfaceResourceStats(document).webkit;
  assert.equal(stats.activeCanvases, 0);
  assert.equal(stats.pooledCanvases, 1);
  assert.equal(stats.pooledPixels, 50);
  assert.equal(stats.shrinkFailures, 1);
});

test("failed WebKit resize exposes its conservative retained allocation", () => {
  const document = webkitDocument();
  const surface = createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 5,
    cssHeight: 5,
  });
  assert.equal(surface.allocationPixels, 25);
  document.state.failAllocations = true;
  assert.throws(() => surface.resize(10, 10, 1), /injected WebKit allocation failure/u);
  assert.equal(surface.allocationPixels, 100);
  assert.equal(getSurfaceResourceStats(document).webkit.activePixels, 100);
  document.state.failAllocations = false;
  assert.equal(surface.resize(5, 5, 1), true);
  assert.equal(surface.allocationPixels, 25);
  assert.equal(getSurfaceResourceStats(document).webkit.activePixels, 25);
  surface.dispose();
});

function firefoxDocument({
  context = {},
  registrationThrows = false,
  unregisterThrows = false,
} = {}) {
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

test("surface creation rejects a non-finite per-surface pixel budget before allocation", () => {
  const document = firefoxDocument();
  assert.throws(() => createSurface(document, {
    backend: "moz-element",
    cssWidth: 10,
    cssHeight: 10,
    maxSurfacePixels: Number.NaN,
  }), /maxSurfacePixels must be a positive safe integer/u);
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

test("every released WebKit canvas remains reusable and shrunk", () => {
  const document = webkitDocument();
  const surfaces = Array.from({ length: 3 }, () => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 20,
    cssHeight: 20,
  }));
  const originalIds = new Set(surfaces.map(({ id }) => id));
  for (const surface of surfaces) surface.dispose();
  const stats = getSurfaceResourceStats(document).webkit;
  assert.equal(stats.pooledCanvases, 3);
  assert.equal(stats.peakActiveCanvases, 3);
  assert.equal(stats.pooledPixels, 3);
  assert.equal(stats.shrinkFailures, 0);
  const reused = Array.from({ length: 3 }, () => createSurface(document, {
    backend: "webkit-canvas",
    cssWidth: 10,
    cssHeight: 10,
  }));
  assert.deepEqual(new Set(reused.map(({ id }) => id)), originalIds);
  const activeStats = getSurfaceResourceStats(document).webkit;
  assert.equal(activeStats.activeCanvases, 3);
  assert.equal(activeStats.activePixels, 300);
  assert.equal(activeStats.pooledCanvases, 0);
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
