import test from "node:test";
import assert from "node:assert/strict";
import { installCornerfillAuto } from "../dist/auto-runtime.mjs";

test("automatic readiness performs one candidate pass without a deferred source-application frame", async () => {
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
      parentNode: isConnected ? null : undefined,
      sheet,
      textContent: "",
      getAttribute: (name) => attributes.get(name) ?? null,
      getRootNode() { return this.isConnected ? document : this; },
      remove() { this.isConnected = false; this.parentNode = null; },
      removeAttribute: (name) => attributes.delete(name),
      setAttribute: (name, value) => attributes.set(name, String(value)),
    };
  };
  const authoredStyle = styleElement({ isConnected: true, sheet: null });
  const frames = new Map();
  let nextFrame = 1;
  const head = {
    append(node) { node.isConnected = true; node.parentNode = this; },
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

  await automatic.ready;
  assert.equal(frames.size, 0);
  assert.equal(automatic.explain().automatic.counters.candidatePasses, 1);
  automatic.destroy();
  assert.equal(frames.size, 0);
});
