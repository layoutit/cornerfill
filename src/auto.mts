import { qualifyNativeCornerShape } from "./native.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import type {
  CornerfillAutoControllerHandle,
  CornerfillAutoExplanation,
  RegisterRootOptions,
} from "./auto-runtime.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{
  defaultView: RuntimeWindow;
  getCSSCanvasContext?: unknown;
  mozSetImageElement?: unknown;
}>;

interface NativeControllerOptions {
  readonly document?: RuntimeDocument | undefined;
  readonly parent?: NativeAutoController | null | undefined;
  readonly root?: Document | ShadowRoot | undefined;
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
  document = globalThis.document as RuntimeDocument,
  parent = null,
  root = document,
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
    refresh(): Promise<Readonly<CornerfillAutoExplanation>> {
      if (destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
      const explanation = explain();
      if (!explanation) return Promise.reject(new Error("native Cornerfill explanation is unavailable"));
      return Promise.resolve(explanation);
    },
    explain,
    registerRoot(shadowRoot: ShadowRoot, _options: Readonly<RegisterRootOptions> = {}): NativeAutoController {
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
    unregisterRoot(shadowRoot: ShadowRoot): boolean {
      const scope = scopes.get(shadowRoot);
      if (!scope) return false;
      scope.destroy();
      return true;
    },
    refreshAdoptedStyleSheet(_sheet: CSSStyleSheet, source: string) {
      if (typeof source !== "string") {
        return Promise.reject(new TypeError(
          "refreshAdoptedStyleSheet() requires the exact standard CSS source",
        ));
      }
      return controller.refresh();
    },
    replaceStylesheetSource(
      _stylesheet: CSSStyleSheet | HTMLLinkElement | HTMLStyleElement,
      source: string,
    ) {
      if (typeof source !== "string") {
        return Promise.reject(new TypeError(
          "replaceStylesheetSource() requires the exact standard CSS source",
        ));
      }
      return controller.refresh();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const scope of [...scopes.values()]) scope.destroy();
      scopes.clear();
      if (parent && root instanceof document.defaultView.ShadowRoot) {
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
  const liveFallbackAvailable = typeof document.getCSSCanvasContext === "function"
    || typeof document.mozSetImageElement === "function";
  const preferFallback = nativeQualification.qualified
    && liveFallbackAvailable
    && !nativeQualification.tiers.fullNativeQualified;
  if (nativeQualification.qualified && !preferFallback) return nativeController(nativeQualification);
  const { installCornerfillAuto } = await import("./auto-runtime.mjs");
  return installCornerfillAuto({
    forceFallback: preferFallback,
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
