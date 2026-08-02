import test from "node:test";
import assert from "node:assert/strict";
import { installCornerfillAuto } from "../dist/auto-runtime.mjs";

test("automatic teardown settles readiness when source application is waiting for a frame", async () => {
  class CSSStyleSheet {
    replaceSync() { this.cssRules = []; }
  }

  const styleElement = ({ isConnected = false, sheet = { cssRules: [{}] } } = {}) => {
    const attributes = new Map();
    return {
      disabled: false,
      isConnected,
      localName: "style",
      media: "",
      sheet,
      textContent: "",
      getAttribute: (name) => attributes.get(name) ?? null,
      remove() { this.isConnected = false; },
      removeAttribute: (name) => attributes.delete(name),
      setAttribute: (name, value) => attributes.set(name, String(value)),
    };
  };
  const authoredStyle = styleElement({ isConnected: true, sheet: null });
  const frames = new Map();
  let nextFrame = 1;
  const head = {
    append(node) { node.isConnected = true; },
  };
  const view = {
    CSSStyleSheet,
    cancelAnimationFrame(id) { frames.delete(id); },
    requestAnimationFrame(callback) {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    },
  };
  const document = {
    baseURI: "https://example.test/",
    defaultView: view,
    documentElement: head,
    head,
    readyState: "complete",
    createElement() { return styleElement(); },
    querySelector() { return null; },
    querySelectorAll(selector) { return selector.startsWith("style:not") ? [authoredStyle] : []; },
  };
  const controller = {
    capabilities: { native: { qualified: false } },
    options: { forceFallback: true },
    stats() { return {}; },
  };
  const automatic = installCornerfillAuto({
    autoObserve: false,
    controller,
    document,
    nativeQualification: { qualified: false, unresolved: ["syntax"] },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(frames.size, 1);
  let readySettled = false;
  automatic.ready.then(
    () => { readySettled = true; },
    () => { readySettled = true; },
  );
  await Promise.resolve();
  assert.equal(readySettled, false);

  automatic.destroy();
  let readinessTimeout;
  try {
    await Promise.race([
      automatic.ready,
      new Promise((_, reject) => {
        readinessTimeout = setTimeout(() => reject(new Error("automatic readiness stayed pending")), 100);
      }),
    ]);
  } finally {
    clearTimeout(readinessTimeout);
  }
  assert.equal(readySettled, true);
  assert.equal(frames.size, 0);
  assert.equal(automatic.explain().automatic.counters.candidatePasses, 0);
});
