import { CORNERFILL_ORACLE_QUALIFICATION, qualifyNativeCornerShape } from "./native.mjs";

function nativeController(nativeQualification, {
  document = globalThis.document,
  parent = null,
  root = document,
} = {}) {
  let destroyed = false;
  const scopes = new Map();
  const controller = {
    ready: null,
    refresh() {
      if (destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
      return Promise.resolve(controller.explain());
    },
    explain(element = null) {
      if (element) return null;
      return Object.freeze({
        schema: "cornerfill-auto@1",
        mode: "native",
        fallbackLoaded: false,
        attached: 0,
        stylesheets: 0,
        inlineElements: 0,
        scopes: scopes.size,
        errors: Object.freeze([]),
        nativeQualification,
        decision: Object.freeze({
          selected: "native",
          reason: "native-requirements-satisfied",
          unresolvedNativeRequirements: Object.freeze([]),
        }),
        implementation: Object.freeze({
          automaticDiscovery: "BYPASSED_NATIVE",
          fallbackRenderer: "NOT_LOADED",
        }),
        oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
        runtime: null,
      });
    },
    registerRoot(shadowRoot) {
      if (destroyed) throw new Error("Cornerfill auto controller is destroyed");
      const ShadowRoot = document.defaultView.ShadowRoot;
      if (!(shadowRoot instanceof ShadowRoot) || shadowRoot.ownerDocument !== document) {
        throw new TypeError("Cornerfill automatic scopes require an open ShadowRoot in the same document");
      }
      if (shadowRoot.host.shadowRoot !== shadowRoot) {
        throw new TypeError("Cornerfill automatic scopes cannot register a closed ShadowRoot");
      }
      const existing = scopes.get(shadowRoot);
      if (existing) return existing;
      const scope = nativeController(nativeQualification, {
        document,
        parent: controller,
        root: shadowRoot,
      });
      scopes.set(shadowRoot, scope);
      return scope;
    },
    unregisterRoot(shadowRoot) {
      const scope = scopes.get(shadowRoot);
      if (!scope) return false;
      scope.destroy();
      return true;
    },
    refreshAdoptedStyleSheet(_sheet, source) {
      if (typeof source !== "string") {
        return Promise.reject(new TypeError("refreshAdoptedStyleSheet() requires the exact standard CSS source"));
      }
      return controller.refresh();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const scope of [...scopes.values()]) scope.destroy();
      scopes.clear();
      if (parent) parent._removeScope(root, controller);
    },
    _removeScope(shadowRoot, scope) {
      if (scopes.get(shadowRoot) === scope) scopes.delete(shadowRoot);
    },
  };
  controller.ready = Promise.resolve(controller.explain());
  return controller;
}

async function automaticController() {
  const document = globalThis.document;
  if (!document) return null;
  const nativeQualification = qualifyNativeCornerShape(document);
  if (nativeQualification.qualified) return nativeController(nativeQualification);
  const { installCornerfillAuto } = await import("./auto-runtime.mjs");
  return installCornerfillAuto({
    nativeQualification,
    onError(error, context) {
      console.error(`Cornerfill could not polyfill ${context}:`, error);
    },
  });
}

export const cornerfill = await automaticController();

cornerfill?.ready.catch((error) => {
  console.error("Cornerfill automatic installation failed", error);
});

export default cornerfill;
