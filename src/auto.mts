import {
  snapshotRegisterRootOptions,
  snapshotRefreshOptions,
  replacementStylesheetBaseUrl,
  validateAdoptedStylesheetSource,
  validateStylesheetSourceReplacement,
  validateShadowRootRegistration,
} from "./auto-contract.mjs";
import type {
  RegisterRootOptions,
  RefreshOptions,
  ReplaceStylesheetSourceOptions,
} from "./auto-contract.mjs";
import { qualifyNativeCornerShape } from "./native.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import type {
  CornerfillAutoControllerHandle,
  CornerfillAutoExplanation,
} from "./auto-runtime.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{
  defaultView: RuntimeWindow;
}>;

interface NativeControllerOptions {
  readonly autoObserve?: boolean | undefined;
  readonly document?: RuntimeDocument | undefined;
  readonly includeAdoptedStyleSheets?: boolean | undefined;
  readonly parent?: NativeAutoController | null | undefined;
  readonly root?: Document | ShadowRoot | undefined;
  readonly scopeRegistry?: Map<ShadowRoot, NativeAutoController> | undefined;
}

interface NativeAutoController extends CornerfillAutoControllerHandle {
  _removeScope(shadowRoot: ShadowRoot, scope: NativeAutoController): void;
  explain(): Readonly<CornerfillAutoExplanation>;
  explain(element: HTMLElement): null;
  registerRoot(shadowRoot: ShadowRoot, options?: Readonly<RegisterRootOptions>): NativeAutoController;
}

function nativeController(
  nativeQualification: Readonly<CornerfillNativeQualification>,
  {
  autoObserve = true,
  document = globalThis.document as RuntimeDocument,
  includeAdoptedStyleSheets = false,
  parent = null,
  root = document,
  scopeRegistry = new Map(),
}: Readonly<NativeControllerOptions> = {},
): NativeAutoController {
  let destroyed = false;
  const scopes = new Map<ShadowRoot, NativeAutoController>();
  function explain(): Readonly<CornerfillAutoExplanation>;
  function explain(element: HTMLElement): null;
  function explain(element: HTMLElement | null = null): Readonly<CornerfillAutoExplanation> | null {
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
        reason: "native-observable-proxy-satisfied",
        unresolvedNativeRequirements: Object.freeze([]),
      }),
      implementation: Object.freeze({
        automaticDiscovery: "BYPASSED_NATIVE",
        fallbackRenderer: "NOT_LOADED",
      }),
      oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
      runtime: null,
    });
  }
  const initialExplanation = explain();
  if (!initialExplanation) throw new Error("native Cornerfill explanation is unavailable");
  const controller: NativeAutoController = {
    ready: Promise.resolve(initialExplanation),
    refresh(options: Readonly<RefreshOptions> = {}): Promise<Readonly<CornerfillAutoExplanation>> {
      if (destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
      try {
        snapshotRefreshOptions(options);
      } catch (error) {
        return Promise.reject(error);
      }
      const explanation = explain();
      if (!explanation) return Promise.reject(new Error("native Cornerfill explanation is unavailable"));
      return Promise.resolve(explanation);
    },
    explain,
    registerRoot(shadowRoot: ShadowRoot, options: Readonly<RegisterRootOptions> = {}): NativeAutoController {
      if (destroyed) throw new Error("Cornerfill auto controller is destroyed");
      options = snapshotRegisterRootOptions(options);
      validateShadowRootRegistration(document, root, autoObserve, shadowRoot, options.autoObserve);
      const existing = scopes.get(shadowRoot);
      if (existing) return existing;
      if (scopeRegistry.has(shadowRoot)) {
        throw new TypeError("This ShadowRoot is already registered by another automatic scope; unregister it first");
      }
      const scope = nativeController(nativeQualification, {
        document,
        autoObserve: options.autoObserve ?? autoObserve,
        includeAdoptedStyleSheets: options.adoptedStyleSheets === true,
        parent: controller,
        root: shadowRoot,
        scopeRegistry,
      });
      scopes.set(shadowRoot, scope);
      scopeRegistry.set(shadowRoot, scope);
      return scope;
    },
    unregisterRoot(shadowRoot: ShadowRoot): boolean {
      const scope = scopes.get(shadowRoot);
      if (!scope) return false;
      scope.destroy();
      return true;
    },
    refreshAdoptedStyleSheet(sheet: CSSStyleSheet, source: string) {
      if (destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
      try {
        validateAdoptedStylesheetSource(root, sheet, source, includeAdoptedStyleSheets);
      } catch (error) {
        return Promise.reject(error);
      }
      return controller.refresh();
    },
    replaceStylesheetSource(
      stylesheet: CSSStyleSheet | HTMLLinkElement | HTMLStyleElement,
      source: string,
      options: Readonly<ReplaceStylesheetSourceOptions> = {},
    ) {
      if (destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
      try {
        const target = validateStylesheetSourceReplacement(
          root,
          document,
          stylesheet,
          source,
          includeAdoptedStyleSheets,
        );
        replacementStylesheetBaseUrl(target.owner, document, options);
      } catch (error) {
        return Promise.reject(error);
      }
      return controller.refresh();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const scope of [...scopes.values()]) scope.destroy();
      scopes.clear();
      if (parent && root instanceof document.defaultView.ShadowRoot) {
        if (scopeRegistry.get(root) === controller) scopeRegistry.delete(root);
        parent._removeScope(root, controller);
      }
    },
    _removeScope(shadowRoot: ShadowRoot, scope: NativeAutoController): void {
      if (scopes.get(shadowRoot) === scope) scopes.delete(shadowRoot);
    },
  };
  return controller;
}

async function automaticController(): Promise<CornerfillAutoControllerHandle | null> {
  const document = globalThis.document as RuntimeDocument | undefined;
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

export const cornerfill: CornerfillAutoControllerHandle | null = await automaticController();

cornerfill?.ready.catch((error) => {
  console.error("Cornerfill automatic installation failed", error);
});

export default cornerfill;
