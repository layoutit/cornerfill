import { qualifyNativeCornerShape } from "./native.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import type {
  CornerfillCompiledControllerHandle,
  CornerfillCompiledExplanation,
  CornerfillCompiledScopeHandle,
} from "./compiled-runtime.mjs";
import type { CornerfillEntryExplanation } from "./runtime.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{ defaultView: RuntimeWindow }>;

export interface CornerfillExplanation {
  readonly compiled: Readonly<CornerfillCompiledExplanation> | null;
  readonly fallbackLoaded: boolean;
  readonly mode: "compiled" | "native";
  readonly nativeQualification: Readonly<CornerfillNativeQualification>;
  readonly oracleQualification: typeof CORNERFILL_ORACLE_QUALIFICATION;
  readonly schema: "cornerfill@1";
  readonly scopes: number;
}

export interface CornerfillScopeHandle {
  readonly ready: Promise<Readonly<CornerfillExplanation>>;
  destroy(): void;
  explain(): Readonly<CornerfillExplanation>;
  explain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
  refresh(): Promise<Readonly<CornerfillExplanation>>;
}

export interface CornerfillControllerHandle extends CornerfillScopeHandle {
  registerRoot(root: ShadowRoot): CornerfillScopeHandle;
  unregisterRoot(root: ShadowRoot): boolean;
}

function explanation(
  nativeQualification: Readonly<CornerfillNativeQualification>,
  compiled: Readonly<CornerfillCompiledExplanation> | null,
  scopes: number,
): Readonly<CornerfillExplanation> {
  return Object.freeze({
    schema: "cornerfill@1",
    mode: compiled ? "compiled" : "native",
    fallbackLoaded: Boolean(compiled),
    nativeQualification,
    oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
    compiled,
    scopes,
  });
}

function validateOpenRoot(document: RuntimeDocument, root: unknown): asserts root is ShadowRoot {
  if (!(root instanceof document.defaultView.ShadowRoot) || root.ownerDocument !== document) {
    throw new TypeError("Cornerfill scopes require an open ShadowRoot in the same document");
  }
  if (root.host.shadowRoot !== root) {
    throw new TypeError("Cornerfill scopes cannot register a closed ShadowRoot");
  }
}

function nativeController(
  document: RuntimeDocument,
  nativeQualification: Readonly<CornerfillNativeQualification>,
): CornerfillControllerHandle {
  const scopes = new Map<ShadowRoot, CornerfillScopeHandle>();
  let destroyed = false;

  const createScope = (root: ShadowRoot | null): CornerfillScopeHandle => {
    let scopeDestroyed = false;
    const report = (): Readonly<CornerfillExplanation> => explanation(
      nativeQualification,
      null,
      root ? 0 : scopes.size,
    );
    function explain(): Readonly<CornerfillExplanation>;
    function explain(element: HTMLElement): null;
    function explain(element?: HTMLElement): Readonly<CornerfillExplanation> | null {
      return element ? null : report();
    }
    const handle: CornerfillScopeHandle = Object.freeze({
      ready: Promise.resolve(report()),
      explain,
      refresh() {
        return destroyed || scopeDestroyed
          ? Promise.reject(new Error("Cornerfill scope is destroyed"))
          : Promise.resolve(report());
      },
      destroy() {
        if (scopeDestroyed) return;
        scopeDestroyed = true;
        if (root && scopes.get(root) === handle) scopes.delete(root);
      },
    });
    return handle;
  };

  const documentScope = createScope(null);
  const controller: CornerfillControllerHandle = Object.freeze({
    ready: documentScope.ready,
    explain: documentScope.explain.bind(documentScope),
    refresh: documentScope.refresh.bind(documentScope),
    registerRoot(root: ShadowRoot): CornerfillScopeHandle {
      if (destroyed) throw new Error("Cornerfill controller is destroyed");
      validateOpenRoot(document, root);
      const existing = scopes.get(root);
      if (existing) return existing;
      const scope = createScope(root);
      scopes.set(root, scope);
      return scope;
    },
    unregisterRoot(root: ShadowRoot): boolean {
      const scope = scopes.get(root);
      if (!scope) return false;
      scope.destroy();
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const scope of [...scopes.values()]) scope.destroy();
      scopes.clear();
      documentScope.destroy();
    },
  });
  return controller;
}

function compiledController(
  controller: CornerfillCompiledControllerHandle,
  nativeQualification: Readonly<CornerfillNativeQualification>,
): CornerfillControllerHandle {
  const wrappers = new WeakMap<CornerfillCompiledScopeHandle, CornerfillScopeHandle>();
  const wrap = (
    handle: CornerfillCompiledScopeHandle,
    topLevel: boolean,
  ): CornerfillScopeHandle => {
    const existing = wrappers.get(handle);
    if (existing) return existing;
    const report = (): Readonly<CornerfillExplanation> => {
      const compiled = handle.explain();
      return explanation(nativeQualification, compiled, topLevel ? compiled.scopes : 0);
    };
    function explain(): Readonly<CornerfillExplanation>;
    function explain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
    function explain(
      element?: HTMLElement,
    ): Readonly<CornerfillExplanation> | Readonly<CornerfillEntryExplanation> | null {
      return element ? handle.explain(element) : report();
    }
    const wrapper: CornerfillScopeHandle = Object.freeze({
      ready: handle.ready.then(() => report()),
      explain,
      refresh: () => handle.refresh().then(() => report()),
      destroy: () => handle.destroy(),
    });
    wrappers.set(handle, wrapper);
    return wrapper;
  };

  const documentScope = wrap(controller, true);
  return Object.freeze({
    ready: documentScope.ready,
    explain: documentScope.explain.bind(documentScope),
    refresh: documentScope.refresh.bind(documentScope),
    registerRoot(root: ShadowRoot): CornerfillScopeHandle {
      return wrap(controller.registerRoot(root), false);
    },
    unregisterRoot: (root: ShadowRoot) => controller.unregisterRoot(root),
    destroy: () => controller.destroy(),
  });
}

async function installDefault(): Promise<CornerfillControllerHandle | null> {
  const document = globalThis.document as RuntimeDocument | undefined;
  if (!document?.defaultView) return null;
  const nativeQualification = qualifyNativeCornerShape(document);
  if (nativeQualification.qualified) return nativeController(document, nativeQualification);
  const { installCornerfillCompiled } = await import("./compiled-runtime.mjs");
  return compiledController(installCornerfillCompiled({
    document,
    nativeQualification,
    onError(error, context) {
      console.error(`Cornerfill could not polyfill ${context}:`, error);
    },
  }), nativeQualification);
}

const cornerfill: CornerfillControllerHandle | null = await installDefault();

cornerfill?.ready.catch((error) => {
  console.error("Cornerfill compiled installation failed", error);
});

export default cornerfill;
