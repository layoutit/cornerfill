import test from "node:test";
import assert from "node:assert/strict";
import { installCornerfillAuto } from "../dist/auto-runtime.mjs";
import {
  replacementStylesheetBaseUrl,
  snapshotRefreshOptions,
  snapshotRegisterRootOptions,
} from "../dist/auto-contract.mjs";

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

test("automatic option contracts reject route-dependent coercion", () => {
  assert.throws(() => installCornerfillAuto([]), /options must be an object/u);
  assert.throws(
    () => snapshotRegisterRootOptions({ autoObserve: "false" }),
    /autoObserve must be a boolean/u,
  );
  assert.throws(
    () => snapshotRegisterRootOptions({ onError: null }),
    /onError must be a function/u,
  );
  assert.throws(() => snapshotRefreshOptions([]), /refresh\(\) options must be an object/u);
  assert.throws(
    () => snapshotRefreshOptions({ retryFailed: "true" }),
    /retryFailed must be a boolean/u,
  );
  class HTMLLinkElement {}
  const document = {
    baseURI: "https://example.test/root/",
    defaultView: { HTMLLinkElement, URL },
  };
  assert.throws(
    () => replacementStylesheetBaseUrl(
      new HTMLLinkElement(),
      document,
      { baseUrl: 123 },
    ),
    /baseUrl must be a string or URL/u,
  );
});

test("automatic construction does not register a mismatched controller", () => {
  const registry = { handles: new Map(), scopes: new Set() };
  let destroyed = false;
  let controllerReads = 0;
  let qualificationReads = 0;
  const controller = {
    capabilities: { native: nativeQualification(false) },
    destroy() { destroyed = true; },
    options: { forceFallback: true },
  };
  const document = {
    baseURI: "https://example.test/",
    defaultView: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  assert.throws(
    () => installCornerfillAuto({
      get controller() {
        controllerReads += 1;
        return controller;
      },
      document,
      handleRegistry: registry,
      get nativeQualification() {
        qualificationReads += 1;
        return nativeQualification(true);
      },
    }),
    /qualification results must agree/u,
  );
  assert.equal(registry.scopes.size, 0);
  assert.equal(destroyed, false);
  assert.equal(controllerReads, 1);
  assert.equal(qualificationReads, 1);
  assert.throws(
    () => installCornerfillAuto({
      controller,
      document,
      handleRegistry: registry,
      nativeQualification: {
        ...nativeQualification(false),
        requirements: {
          syntax: { supported: true, observable: true },
          computedValues: { supported: false, observable: true },
          shapedHitTesting: { supported: false, observable: true },
        },
        unresolved: ["computedValues", "shapedHitTesting"],
      },
    }),
    /qualification results must agree/u,
  );
  assert.equal(registry.scopes.size, 0);
});

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
    capabilities: { native: nativeQualification(false) },
    options: { forceFallback: true },
    stats() { return {}; },
  };
  const automatic = installCornerfillAuto({
    autoObserve: false,
    controller,
    document,
    nativeQualification: nativeQualification(false),
  });

  await automatic.ready;
  assert.equal(frames.size, 0);
  assert.equal(automatic.explain().automatic.counters.candidatePasses, 1);
  automatic.destroy();
  assert.equal(frames.size, 0);
});
