import { installCornerfill } from "./runtime.mjs";
import type {
  CornerfillControllerHandle,
  CornerfillControllerStats,
  CornerfillEntryExplanation,
  CornerfillHandle,
  CornerfillInstallOptions,
} from "./runtime.mjs";
import {
  AUTO_CARRIERS,
  AUTO_UNSET,
  COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX,
  COMPILED_MANIFEST_PROPERTY_PREFIX,
  compiledCarrierProblem,
  hasResolvedShapeCarrier,
  parseCompiledManifestCssValue,
} from "./carrier-contract.mjs";
import type {
  CornerfillCompiledManifest,
  SelectorInvalidation,
  SelectorObservation,
} from "./carrier-contract.mjs";
import { compiledSelectorPlan } from "./compiled-selectors.mjs";
import type { CompiledHostContext } from "./compiled-selectors.mjs";
import { mergeSelectorObservation, selectorObservation } from "./selector-metadata.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{ defaultView: RuntimeWindow }>;
type CompiledRoot = Document | ShadowRoot;

interface CompiledCounters {
  attachmentPasses: number;
  candidatePasses: number;
  computedChecks: number;
  eventInvalidations: number;
  handleAttaches: number;
  handleDetaches: number;
  handleRefreshes: number;
  manifestReads: number;
  mediaInvalidations: number;
  mutationBatches: number;
  scannedElements: number;
  sourceCompiles: 0;
  sourceFetches: 0;
  sourceReads: 0;
}

export type CornerfillCompiledCounters = Readonly<CompiledCounters>;

export interface CornerfillCompiledOptions extends CornerfillInstallOptions {
  readonly autoObserve?: boolean | undefined;
  readonly maxCandidateElements?: number | undefined;
  readonly maxScannedElements?: number | undefined;
  readonly onError?: ((error: unknown, context: string) => void) | undefined;
}

export interface CornerfillCompiledExplanation {
  readonly attached: number;
  readonly candidates: number;
  readonly counters: CornerfillCompiledCounters;
  readonly errors: readonly string[];
  readonly limits: Readonly<{
    maxCandidateElements: number;
    maxScannedElements: number;
  }>;
  readonly manifests: number;
  readonly mode: "compiled";
  readonly observation: Readonly<SelectorObservation>;
  readonly observing: boolean;
  readonly root: "document" | "shadow";
  readonly runtime: Readonly<CornerfillControllerStats>;
  readonly schema: "cornerfill-compiled-controller@1";
  readonly scopes: number;
}

export interface CornerfillCompiledScopeHandle {
  readonly ready: Promise<Readonly<CornerfillCompiledExplanation>>;
  destroy(): void;
  explain(): Readonly<CornerfillCompiledExplanation>;
  explain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
  refresh(): Promise<Readonly<CornerfillCompiledExplanation>>;
}

export interface CornerfillCompiledControllerHandle extends CornerfillCompiledScopeHandle {
  registerRoot(root: ShadowRoot): CornerfillCompiledScopeHandle;
  unregisterRoot(root: ShadowRoot): boolean;
}

interface CompiledManifestState {
  readonly hostCandidate: boolean;
  readonly hostContext: boolean;
  readonly hostContexts: readonly Readonly<CompiledHostContext>[];
  readonly hostDependent: boolean;
  readonly manifests: readonly Readonly<CornerfillCompiledManifest>[];
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
  readonly selectorList: string;
  readonly selectors: readonly string[];
}

interface EventListenerRecord {
  readonly listener: EventListener;
  readonly options: boolean | AddEventListenerOptions;
  readonly target: EventTarget;
  readonly type: string;
}

interface MediaListenerRecord {
  readonly legacy: boolean;
  readonly list: MediaQueryList;
  readonly listener: (event: MediaQueryListEvent) => void;
}

interface ScanRoot {
  readonly element: Element;
  readonly subtree: boolean;
}

interface ScanResult {
  readonly matched: ReadonlySet<HTMLElement>;
  readonly visited: ReadonlySet<HTMLElement>;
}

interface ReconcileResult {
  readonly errors: readonly string[];
  readonly synchronized: ReadonlySet<HTMLElement>;
}

interface CompiledScopeInternal {
  readonly candidates: Set<HTMLElement>;
  readonly counters: CompiledCounters;
  readonly handle: CornerfillCompiledScopeHandle;
  readonly root: CompiledRoot;
  readonly performRefresh: () => Promise<Readonly<CornerfillCompiledExplanation>>;
  readonly destroyLocal: () => void;
  readonly contains: (element: HTMLElement) => boolean;
}

const DEFAULT_MAX_CANDIDATE_ELEMENTS = 512;
const DEFAULT_MAX_SCANNED_ELEMENTS = 100_000;
const STYLESHEET_ATTRIBUTES = Object.freeze([
  "disabled", "href", "media", "rel", "title",
]);
const EMPTY_STATE: Readonly<CompiledManifestState> = Object.freeze({
  hostCandidate: false,
  hostContext: false,
  hostContexts: Object.freeze([]),
  hostDependent: false,
  manifests: Object.freeze([]),
  mediaQueries: Object.freeze([]),
  observation: selectorObservation([]),
  selectorList: "",
  selectors: Object.freeze([]),
});

function positiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sumCounters(records: Iterable<Readonly<CompiledCounters>>): CompiledCounters {
  const total: CompiledCounters = {
    attachmentPasses: 0,
    candidatePasses: 0,
    computedChecks: 0,
    eventInvalidations: 0,
    handleAttaches: 0,
    handleDetaches: 0,
    handleRefreshes: 0,
    manifestReads: 0,
    mediaInvalidations: 0,
    mutationBatches: 0,
    scannedElements: 0,
    sourceCompiles: 0,
    sourceFetches: 0,
    sourceReads: 0,
  };
  for (const record of records) {
    total.attachmentPasses += record.attachmentPasses;
    total.candidatePasses += record.candidatePasses;
    total.computedChecks += record.computedChecks;
    total.eventInvalidations += record.eventInvalidations;
    total.handleAttaches += record.handleAttaches;
    total.handleDetaches += record.handleDetaches;
    total.handleRefreshes += record.handleRefreshes;
    total.manifestReads += record.manifestReads;
    total.mediaInvalidations += record.mediaInvalidations;
    total.mutationBatches += record.mutationBatches;
    total.scannedElements += record.scannedElements;
  }
  return total;
}

function *subtreeElements(root: Element): Generator<Element, void, unknown> {
  let element: Element | null = root;
  while (element) {
    yield element;
    if (element.firstElementChild) {
      element = element.firstElementChild;
      continue;
    }
    while (element && element !== root && !element.nextElementSibling) {
      element = element.parentElement;
    }
    element = element === root ? null : element?.nextElementSibling ?? null;
  }
}

function isGeneratedStyle(element: Element, view: RuntimeWindow): boolean {
  return element instanceof view.HTMLStyleElement
    && element.hasAttribute("data-cornerfill-ownership-styles");
}

function isStylesheetElement(element: Element, view: RuntimeWindow): boolean {
  return (element instanceof view.HTMLStyleElement && !isGeneratedStyle(element, view))
    || element instanceof view.HTMLLinkElement;
}

function nodeContainsStylesheet(node: Node, view: RuntimeWindow): boolean {
  if (!(node instanceof view.Element)) return false;
  for (const element of subtreeElements(node)) {
    if (isStylesheetElement(element, view)) return true;
  }
  return false;
}

function stylesheetTextOwner(node: Node, view: RuntimeWindow): HTMLStyleElement | null {
  const parent = node instanceof view.Element ? node : node.parentElement;
  if (!(parent instanceof view.HTMLStyleElement) || isGeneratedStyle(parent, view)) return null;
  return parent;
}

function compiledManifests(
  view: RuntimeWindow,
  target: Element,
): readonly Readonly<CornerfillCompiledManifest>[] {
  const computed = view.getComputedStyle(target);
  const manifests = new Map<string, Readonly<CornerfillCompiledManifest>>();
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) continue;
    const value = computed.getPropertyValue(property).trim();
    if (!value || value === AUTO_UNSET) continue;
    manifests.set(property, parseCompiledManifestCssValue(value));
  }
  return Object.freeze([...manifests.values()]);
}

function manifestState(
  document: RuntimeDocument,
  root: CompiledRoot,
  manifests: readonly Readonly<CornerfillCompiledManifest>[],
): Readonly<CompiledManifestState> {
  const authoredSelectors = Object.freeze([
    ...new Set(manifests.flatMap(({ selectors }) => selectors)),
  ].sort());
  const plan = compiledSelectorPlan(authoredSelectors);
  const hostContexts = new Map<string, Readonly<CompiledHostContext>>();
  for (const context of [
    ...plan.hostContexts,
    ...manifests.flatMap(({ hostContexts: values }) => values),
  ]) {
    document.documentElement.matches(context.argument);
    const existing = hostContexts.get(context.attribute);
    if (existing && existing.argument !== context.argument) {
      throw new TypeError("compiled :host-context() marker collision");
    }
    hostContexts.set(context.attribute, context);
  }
  const selectors = root === document ? plan.documentSelectors : plan.elementSelectors;
  for (const selector of selectors) document.documentElement.matches(selector);
  const mediaQueries = Object.freeze([
    ...new Set(manifests.flatMap(({ mediaQueries: values }) => values)),
  ].sort());
  return Object.freeze({
    hostCandidate: root === document ? false : plan.hostCandidate,
    hostContext: root === document ? false : plan.hostContext || hostContexts.size > 0,
    hostContexts: root === document
      ? Object.freeze([])
      : Object.freeze([...hostContexts.values()].sort((left, right) => (
        left.attribute.localeCompare(right.attribute)
      ))),
    hostDependent: root === document ? false : plan.hostDependent || hostContexts.size > 0,
    manifests,
    mediaQueries,
    observation: mergeSelectorObservation(manifests.map(({ observation }) => observation)),
    selectorList: selectors.join(","),
    selectors,
  });
}

function mutationContainsNode(record: MutationRecord, target: Node): boolean {
  for (const node of [...record.addedNodes, ...record.removedNodes]) {
    if (node === target || (node instanceof Element && node.contains(target))) return true;
  }
  return false;
}

function matchesShadowIncludingContext(
  view: RuntimeWindow,
  host: Element,
  argument: string,
): boolean {
  let current: Element | null = host;
  while (current) {
    if (current.matches(argument)) return true;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    const containingRoot = current.getRootNode();
    current = containingRoot instanceof view.ShadowRoot ? containingRoot.host : null;
  }
  return false;
}

export function installCornerfillCompiled(
  options: Readonly<CornerfillCompiledOptions> = {},
): CornerfillCompiledControllerHandle {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("installCornerfillCompiled() options must be an object");
  }
  const document = (options.document ?? globalThis.document) as RuntimeDocument | undefined;
  if (!document?.defaultView) throw new TypeError("installCornerfillCompiled() requires a browser document");
  const view = document.defaultView;
  const autoObserve = options.autoObserve !== false;
  const maxCandidateElements = options.maxCandidateElements
    ?? options.maxActiveEntries
    ?? DEFAULT_MAX_CANDIDATE_ELEMENTS;
  const maxScannedElements = options.maxScannedElements ?? DEFAULT_MAX_SCANNED_ELEMENTS;
  positiveSafeInteger(maxCandidateElements, "maxCandidateElements");
  positiveSafeInteger(maxScannedElements, "maxScannedElements");
  if (options.autoObserve !== undefined && typeof options.autoObserve !== "boolean") {
    throw new TypeError("autoObserve must be a boolean");
  }
  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new TypeError("onError must be a function");
  }
  const {
    autoObserve: _autoObserve,
    maxCandidateElements: _maxCandidateElements,
    maxScannedElements: _maxScannedElements,
    onError,
    ...runtimeOptions
  } = options;
  void _autoObserve;
  void _maxCandidateElements;
  void _maxScannedElements;

  const runtime: CornerfillControllerHandle = installCornerfill({
    ...runtimeOptions,
    document,
    observe: autoObserve && options.observe !== false,
  });
  const handles = new Map<HTMLElement, Readonly<CornerfillHandle>>();
  const claims = new Map<HTMLElement, Set<CompiledScopeInternal>>();
  const scopes = new Map<ShadowRoot, CompiledScopeInternal>();
  let primary: CompiledScopeInternal;
  let destroyed = false;
  let operationChain: Promise<void> = Promise.resolve();

  const queueOperation = (operation: () => Promise<void>): Promise<void> => {
    const result = operationChain.then(operation, operation);
    operationChain = result.then(() => undefined, () => undefined);
    return result;
  };

  const detach = (element: HTMLElement): void => {
    const handle = handles.get(element);
    if (!handle) return;
    handles.delete(element);
    for (const scope of claims.get(element) ?? []) scope.counters.handleDetaches += 1;
    handle.dispose();
  };

  const validClaims = (element: HTMLElement): ReadonlySet<CompiledScopeInternal> => {
    const elementClaims = claims.get(element);
    if (!elementClaims) return new Set();
    for (const scope of [...elementClaims]) {
      if (!scope.candidates.has(element) || !scope.contains(element)) elementClaims.delete(scope);
    }
    if (elementClaims.size === 0) claims.delete(element);
    return elementClaims;
  };

  const syncElements = async (elements: Iterable<HTMLElement>): Promise<readonly string[]> => {
    const nextErrors: string[] = [];
    for (const element of new Set(elements)) {
      const elementClaims = validClaims(element);
      for (const scope of elementClaims) scope.counters.attachmentPasses += 1;
      if (elementClaims.size === 0 || !element.isConnected) {
        try { detach(element); } catch (error) { nextErrors.push(errorMessage(error)); }
        continue;
      }
      try {
        for (const scope of elementClaims) scope.counters.computedChecks += 1;
        const inspection = runtime.inspectAuthoredStyle(element, AUTO_CARRIERS);
        const problem = compiledCarrierProblem(inspection.values);
        if (problem) throw new TypeError(problem);
        if (!hasResolvedShapeCarrier(inspection.values) || !inspection.requiresFallback) {
          detach(element);
          continue;
        }
        const existing = handles.get(element);
        if (existing) {
          for (const scope of elementClaims) scope.counters.handleRefreshes += 1;
          await existing.refresh();
        } else {
          const handle = runtime.attach(element);
          handles.set(element, handle);
          for (const scope of elementClaims) scope.counters.handleAttaches += 1;
          try {
            await handle.ready;
          } catch (error) {
            detach(element);
            throw error;
          }
        }
      } catch (error) {
        try { detach(element); } catch (cleanupError) { nextErrors.push(errorMessage(cleanupError)); }
        nextErrors.push(errorMessage(error));
      }
    }
    return Object.freeze(nextErrors);
  };

  const addClaim = (scope: CompiledScopeInternal, element: HTMLElement): void => {
    let elementClaims = claims.get(element);
    if (!elementClaims) {
      elementClaims = new Set();
      claims.set(element, elementClaims);
    }
    elementClaims.add(scope);
  };

  const removeClaim = (scope: CompiledScopeInternal, element: HTMLElement): void => {
    const elementClaims = claims.get(element);
    if (!elementClaims) return;
    elementClaims.delete(scope);
    if (elementClaims.size === 0) {
      claims.delete(element);
      if (handles.has(element)) scope.counters.handleDetaches += 1;
    }
  };

  const createScope = (root: CompiledRoot, isPrimary: boolean): CompiledScopeInternal => {
    const candidates = new Set<HTMLElement>();
    const eventListeners: EventListenerRecord[] = [];
    const mediaListeners: MediaListenerRecord[] = [];
    const pendingElements = new Set<Element>();
    const pendingSubtrees = new Set<Element>();
    const pendingRefresh = new Set<HTMLElement>();
    const counters: CompiledCounters = {
      attachmentPasses: 0,
      candidatePasses: 0,
      computedChecks: 0,
      eventInvalidations: 0,
      handleAttaches: 0,
      handleDetaches: 0,
      handleRefreshes: 0,
      manifestReads: 0,
      mediaInvalidations: 0,
      mutationBatches: 0,
      scannedElements: 0,
      sourceCompiles: 0,
      sourceFetches: 0,
      sourceReads: 0,
    };
    let scopeDestroyed = false;
    let errors: readonly string[] = Object.freeze([]);
    let manifestCount = 0;
    let state = EMPTY_STATE;
    let observer: MutationObserver | null = null;
    let externalObserver: MutationObserver | null = null;
    let pendingFull = false;
    let queued = false;
    let stateFrame: number | null = null;
    let manifestFrame: number | null = null;
    const ownedHostContextMarkers = new Set<string>();

    const manifestTarget = (): Element => (
      root === document ? document.documentElement : (root as ShadowRoot).host
    );

    const contains = (element: HTMLElement): boolean => {
      if (root === document) return element.isConnected && element.getRootNode() === document;
      const shadow = root as ShadowRoot;
      if (!shadow.host.isConnected || !element.isConnected) return false;
      return element === shadow.host ? state.hostCandidate : element.getRootNode() === shadow;
    };

    const releaseHostContextMarker = (attribute: string): void => {
      if (root === document || !ownedHostContextMarkers.delete(attribute)) return;
      const host = (root as ShadowRoot).host;
      if (host.getAttribute(attribute) === "1") host.removeAttribute(attribute);
    };

    const syncHostContextMarkers = (): void => {
      if (root === document) return;
      const host = (root as ShadowRoot).host;
      const current = new Set(state.hostContexts.map(({ attribute }) => attribute));
      for (const attribute of [...ownedHostContextMarkers]) {
        if (!current.has(attribute)) releaseHostContextMarker(attribute);
      }
      for (const { argument, attribute } of state.hostContexts) {
        if (matchesShadowIncludingContext(view, host, argument)) {
          if (!host.hasAttribute(attribute)) {
            host.setAttribute(attribute, "1");
            ownedHostContextMarkers.add(attribute);
          }
        } else releaseHostContextMarker(attribute);
      }
    };

    const reportAsyncError = (error: unknown, context: string): void => {
      errors = Object.freeze([errorMessage(error)]);
      try { onError?.(error, context); } catch { /* Diagnostics cannot re-enter work. */ }
    };

    const localAttached = (): number => {
      let count = 0;
      for (const element of candidates) if (handles.has(element)) count += 1;
      return count;
    };

    function explain(): Readonly<CornerfillCompiledExplanation>;
    function explain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
    function explain(
      element?: HTMLElement,
    ): Readonly<CornerfillCompiledExplanation> | Readonly<CornerfillEntryExplanation> | null {
      if (element) return candidates.has(element) ? runtime.explain(element) : null;
      return Object.freeze({
        schema: "cornerfill-compiled-controller@1",
        mode: "compiled",
        root: root === document ? "document" : "shadow",
        scopes: isPrimary ? scopes.size : 0,
        manifests: manifestCount,
        candidates: candidates.size,
        attached: localAttached(),
        errors,
        observing: Boolean(observer),
        observation: state.observation,
        limits: Object.freeze({ maxCandidateElements, maxScannedElements }),
        counters: Object.freeze({ ...counters }),
        runtime: runtime.stats(),
      });
    }

    const scan = (roots: Iterable<Readonly<ScanRoot>>, replaceAll: boolean): Readonly<ScanResult> => {
      const matched = new Set<HTMLElement>();
      const visited = new Set<HTMLElement>();
      if (!state.selectorList && !(root !== document && state.hostCandidate)) {
        return Object.freeze({ matched, visited });
      }
      let scanned = 0;
      const inspect = (element: Element, forceHost = false): void => {
        scanned += 1;
        if (scanned > maxScannedElements) {
          throw new RangeError(
            `compiled root exceeds the maximum scanned element count of ${maxScannedElements}`,
          );
        }
        if (!(element instanceof view.HTMLElement)) return;
        if (candidates.has(element)) visited.add(element);
        if (!forceHost && (!state.selectorList || !element.matches(state.selectorList))) return;
        matched.add(element);
        if (matched.size > maxCandidateElements) {
          throw new RangeError(
            `compiled root exceeds the maximum candidate element count of ${maxCandidateElements}`,
          );
        }
      };
      for (const scanRoot of roots) {
        if (scanRoot.subtree) {
          for (const element of subtreeElements(scanRoot.element)) inspect(element);
        } else inspect(scanRoot.element);
      }
      if (root !== document && state.hostCandidate) inspect((root as ShadowRoot).host, true);
      counters.scannedElements += scanned;
      const projected = replaceAll ? matched.size : candidates.size - visited.size + matched.size;
      if (projected > maxCandidateElements) {
        throw new RangeError(
          `compiled root exceeds the maximum candidate element count of ${maxCandidateElements}`,
        );
      }
      return Object.freeze({ matched, visited });
    };

    const fullScanRoots = (): readonly Readonly<ScanRoot>[] => {
      if (root === document) {
        return Object.freeze([Object.freeze({ element: document.documentElement, subtree: true })]);
      }
      return Object.freeze([...root.children].map((element) => (
        Object.freeze({ element, subtree: true })
      )));
    };

    const reconcile = async (
      roots: Iterable<Readonly<ScanRoot>>,
      full: boolean,
    ): Promise<Readonly<ReconcileResult>> => {
      counters.candidatePasses += 1;
      const { matched, visited } = scan(roots, full);
      const affected = new Set<HTMLElement>(matched);
      const removals = full ? [...candidates] : [...visited];
      for (const element of removals) {
        if (matched.has(element)) continue;
        candidates.delete(element);
        removeClaim(scope, element);
        affected.add(element);
      }
      for (const element of matched) {
        candidates.add(element);
        addClaim(scope, element);
      }
      return Object.freeze({
        errors: await syncElements(affected),
        synchronized: affected,
      });
    };

    const clearObservation = (): void => {
      observer?.disconnect();
      observer = null;
      externalObserver?.disconnect();
      externalObserver = null;
      for (const { target, type, listener, options: listenerOptions } of eventListeners.splice(0)) {
        target.removeEventListener(type, listener, listenerOptions);
      }
      for (const { list, listener, legacy } of mediaListeners.splice(0)) {
        if (legacy) list.removeListener(listener);
        else list.removeEventListener("change", listener);
      }
    };

    const scopeFor = (target: Element, invalidation: SelectorInvalidation): void => {
      if (invalidation === "root") {
        pendingFull = true;
        pendingElements.clear();
        pendingSubtrees.clear();
        return;
      }
      if (invalidation === "self") pendingElements.add(target);
      else if (invalidation === "subtree") pendingSubtrees.add(target);
      else if (target.parentElement) pendingSubtrees.add(target.parentElement);
      else pendingFull = true;
    };

    const refreshCandidateDescendants = (target: Element): void => {
      for (const candidate of candidates) {
        if (candidate === target || target.contains(candidate)) pendingRefresh.add(candidate);
      }
    };

    const refreshAllCandidates = (): void => {
      for (const candidate of candidates) pendingRefresh.add(candidate);
    };

    const failClosed = (error: unknown): void => {
      clearObservation();
      const cleanupErrors: unknown[] = [];
      for (const attribute of [...ownedHostContextMarkers]) releaseHostContextMarker(attribute);
      for (const element of [...candidates]) {
        candidates.delete(element);
        removeClaim(scope, element);
        if (!claims.has(element)) {
          try { detach(element); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
        }
      }
      manifestCount = 0;
      state = EMPTY_STATE;
      errors = Object.freeze([errorMessage(error), ...cleanupErrors.map(errorMessage)]);
    };

    const performPending = async (): Promise<void> => {
      if (destroyed || scopeDestroyed) return;
      const full = pendingFull;
      const elements = [...pendingElements];
      const subtrees = [...pendingSubtrees];
      const refresh = new Set(pendingRefresh);
      pendingFull = false;
      pendingElements.clear();
      pendingSubtrees.clear();
      pendingRefresh.clear();
      syncHostContextMarkers();
      for (const candidate of [...candidates]) {
        if (contains(candidate)) continue;
        candidates.delete(candidate);
        removeClaim(scope, candidate);
        refresh.add(candidate);
      }
      try {
        let nextErrors: readonly string[] = Object.freeze([]);
        if (full) {
          const reconciled = await reconcile(fullScanRoots(), true);
          nextErrors = reconciled.errors;
          for (const element of reconciled.synchronized) refresh.delete(element);
        } else if (state.selectorList && (elements.length > 0 || subtrees.length > 0)) {
          const reconciled = await reconcile([
            ...elements.filter((element) => element.isConnected)
              .map((element) => Object.freeze({ element, subtree: false })),
            ...subtrees.filter((element) => element.isConnected)
              .map((element) => Object.freeze({ element, subtree: true })),
          ], false);
          nextErrors = reconciled.errors;
          for (const element of reconciled.synchronized) refresh.delete(element);
        }
        const refreshErrors = refresh.size > 0 ? await syncElements(refresh) : Object.freeze([]);
        errors = Object.freeze([...nextErrors, ...refreshErrors]);
      } catch (error) {
        failClosed(error);
        throw error;
      }
    };

    const queuePending = (): void => {
      if (queued || destroyed || scopeDestroyed) return;
      queued = true;
      view.queueMicrotask(() => {
        queued = false;
        if (destroyed || scopeDestroyed) return;
        void queueOperation(performPending).catch((error) => (
          reportAsyncError(error, "compiled invalidation")
        ));
      });
    };

    function scheduleManifestRefresh(): void {
      if (manifestFrame !== null || destroyed || scopeDestroyed) return;
      manifestFrame = view.requestAnimationFrame(() => {
        manifestFrame = null;
        if (destroyed || scopeDestroyed) return;
        void queueOperation(async () => { await performRefresh(); }).catch((error) => (
          reportAsyncError(error, "compiled stylesheet lifecycle")
        ));
      });
    }

    const handleMutations = (records: readonly MutationRecord[]): void => {
      counters.mutationBatches += 1;
      const attributes = new Set(state.observation.attributes);
      let stylesheetChanged = false;
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target as Element;
          const attribute = record.attributeName ?? "";
          if (isStylesheetElement(target, view) && STYLESHEET_ATTRIBUTES.includes(attribute)) {
            stylesheetChanged = true;
            continue;
          }
          if (attribute.startsWith("data-cornerfill-owned")) continue;
          if (attribute.startsWith(COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX)) continue;
          if (attribute === "style" && target instanceof view.HTMLElement && handles.has(target)) continue;
          refreshCandidateDescendants(target);
          if (state.observation.conservative || attributes.has(attribute)) {
            scopeFor(target, state.observation.invalidation);
          }
          continue;
        }
        if (record.type === "characterData") {
          if (stylesheetTextOwner(record.target, view)) {
            stylesheetChanged = true;
            continue;
          }
          const parent = record.target.parentElement;
          if (parent && state.observation.characterData) scopeFor(parent, "parent");
          continue;
        }
        const target = record.target instanceof view.Element ? record.target : null;
        if (stylesheetTextOwner(record.target, view)) stylesheetChanged = true;
        for (const node of record.addedNodes) {
          if (nodeContainsStylesheet(node, view)) stylesheetChanged = true;
          else if (node instanceof view.Element
            && !isGeneratedStyle(node, view)
            && state.selectorList) pendingSubtrees.add(node);
        }
        for (const node of record.removedNodes) {
          if (nodeContainsStylesheet(node, view)) stylesheetChanged = true;
        }
        if (target && state.observation.invalidation !== "self") {
          refreshCandidateDescendants(target);
          scopeFor(target, state.observation.invalidation);
        }
      }
      if (stylesheetChanged) scheduleManifestRefresh();
      queuePending();
    };

    const handleStateEvent = (event: Event): void => {
      counters.eventInvalidations += 1;
      const target = event.target instanceof view.Element ? event.target : null;
      if (!target || state.observation.invalidation === "root") pendingFull = true;
      else {
        scopeFor(target, state.observation.invalidation);
        let ancestor = target.parentElement;
        while (ancestor) {
          pendingElements.add(ancestor);
          ancestor = ancestor.parentElement;
        }
      }
      if (stateFrame === null) {
        stateFrame = view.requestAnimationFrame(() => {
          stateFrame = null;
          queuePending();
        });
      }
    };

    const handleExternalMutations = (records: readonly MutationRecord[]): void => {
      if (root === document) return;
      const host = (root as ShadowRoot).host;
      let refresh = false;
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target as Element;
          const attribute = record.attributeName ?? "";
          if (attribute.startsWith("data-cornerfill-owned")) continue;
          if (attribute.startsWith(COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX)) continue;
          if (attribute === "style" && target instanceof view.HTMLElement && handles.has(target)) {
            continue;
          }
          if (target === host || target.contains(host)) refresh = true;
          continue;
        }
        if (record.type === "characterData") {
          const parent = record.target.parentElement;
          if (state.hostContext && parent?.contains(host)) refresh = true;
          continue;
        }
        if (mutationContainsNode(record, host)) {
          pendingFull = true;
          refresh = true;
        } else if (state.hostContext
          && record.target instanceof view.Element
          && record.target.contains(host)) refresh = true;
        if ([...record.addedNodes, ...record.removedNodes].some((node) => (
          nodeContainsStylesheet(node, view)
        ))) refresh = true;
      }
      if (refresh) {
        refreshAllCandidates();
        queuePending();
      }
    };

    const handleExternalStateEvent = (event: Event): void => {
      if (root === document) return;
      const host = (root as ShadowRoot).host;
      const target = event.target instanceof view.Element ? event.target : null;
      if (target && target !== host && !target.contains(host)) return;
      counters.eventInvalidations += 1;
      refreshAllCandidates();
      if (stateFrame === null) {
        stateFrame = view.requestAnimationFrame(() => {
          stateFrame = null;
          queuePending();
        });
      }
    };

    const addEventRecord = (
      target: EventTarget,
      type: string,
      listener: EventListener,
      listenerOptions: boolean | AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, listener, listenerOptions);
      eventListeners.push(Object.freeze({ target, type, listener, options: listenerOptions }));
    };

    const configureObservation = (): void => {
      clearObservation();
      if (!autoObserve || destroyed || scopeDestroyed) return;
      if (view.MutationObserver) {
        observer = new view.MutationObserver(handleMutations);
        const attributes = new Set([
          "dir", "style", ...STYLESHEET_ATTRIBUTES, ...state.observation.attributes,
        ]);
        const observerOptions: MutationObserverInit = {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true,
        };
        if (!state.observation.conservative) observerOptions.attributeFilter = [...attributes];
        observer.observe(root === document ? document.documentElement : root, observerOptions);
        if (root !== document) {
          const externalRoot = (root as ShadowRoot).host.getRootNode();
          if (externalRoot instanceof view.Document || externalRoot instanceof view.ShadowRoot) {
            externalObserver = new view.MutationObserver(handleExternalMutations);
            externalObserver.observe(
              externalRoot === document ? document.documentElement : externalRoot,
              { attributes: true, childList: true, characterData: state.hostContext, subtree: true },
            );
          }
        }
      }
      const stylesheetSettled: EventListener = (event) => {
        if (event.target instanceof view.Element && isStylesheetElement(event.target, view)) {
          scheduleManifestRefresh();
        }
      };
      addEventRecord(root, "load", stylesheetSettled, true);
      addEventRecord(root, "error", stylesheetSettled, true);
      for (const type of state.observation.events) {
        const windowEvent = type === "hashchange" || type === "popstate";
        const documentEvent = type === "fullscreenchange";
        const internalTarget: EventTarget = windowEvent
          ? view
          : documentEvent
            ? document
            : root;
        const listenerOptions = windowEvent ? Object.freeze({ passive: true }) : true;
        addEventRecord(internalTarget, type, handleStateEvent, listenerOptions);
        if (root !== document && state.hostDependent && !windowEvent && !documentEvent) {
          const externalTarget = (root as ShadowRoot).host.getRootNode();
          addEventRecord(externalTarget, type, handleExternalStateEvent, true);
        }
      }
      for (const query of state.mediaQueries) {
        const list = view.matchMedia(query);
        const listener = (_event: MediaQueryListEvent): void => {
          counters.mediaInvalidations += 1;
          refreshAllCandidates();
          queuePending();
        };
        if (typeof list.addEventListener === "function") {
          list.addEventListener("change", listener);
          mediaListeners.push(Object.freeze({ list, listener, legacy: false }));
        } else {
          list.addListener(listener);
          mediaListeners.push(Object.freeze({ list, listener, legacy: true }));
        }
      }
    };

    const performRefresh = async (): Promise<Readonly<CornerfillCompiledExplanation>> => {
      if (destroyed || scopeDestroyed) throw new Error("Cornerfill compiled scope is destroyed");
      if (manifestFrame !== null) view.cancelAnimationFrame(manifestFrame);
      manifestFrame = null;
      pendingFull = false;
      pendingElements.clear();
      pendingSubtrees.clear();
      pendingRefresh.clear();
      try {
        clearObservation();
        counters.manifestReads += 1;
        const manifests = compiledManifests(view, manifestTarget());
        state = manifestState(document, root, manifests);
        manifestCount = manifests.length;
        syncHostContextMarkers();
        const nextErrors = (await reconcile(fullScanRoots(), true)).errors;
        configureObservation();
        errors = nextErrors;
        return explain();
      } catch (error) {
        if (stateFrame !== null) view.cancelAnimationFrame(stateFrame);
        stateFrame = null;
        failClosed(error);
        throw error;
      }
    };

    const refreshLocal = (): Promise<Readonly<CornerfillCompiledExplanation>> => {
      let report: Readonly<CornerfillCompiledExplanation>;
      return queueOperation(async () => { report = await performRefresh(); }).then(() => report!);
    };

    const destroyLocal = (): void => {
      if (scopeDestroyed) return;
      scopeDestroyed = true;
      clearObservation();
      if (stateFrame !== null) view.cancelAnimationFrame(stateFrame);
      if (manifestFrame !== null) view.cancelAnimationFrame(manifestFrame);
      stateFrame = null;
      manifestFrame = null;
      pendingElements.clear();
      pendingSubtrees.clear();
      pendingRefresh.clear();
      for (const attribute of [...ownedHostContextMarkers]) releaseHostContextMarker(attribute);
      for (const element of [...candidates]) {
        candidates.delete(element);
        removeClaim(scope, element);
        if (!claims.has(element)) detach(element);
      }
      if (root !== document && scopes.get(root as ShadowRoot) === scope) {
        scopes.delete(root as ShadowRoot);
      }
    };

    let ready: Promise<Readonly<CornerfillCompiledExplanation>>;
    const handle: CornerfillCompiledScopeHandle = Object.freeze({
      get ready() { return ready; },
      refresh: refreshLocal,
      explain,
      destroy() {
        if (isPrimary) destroyAll();
        else destroyLocal();
      },
    });
    const scope: CompiledScopeInternal = {
      candidates,
      counters,
      root,
      handle,
      contains,
      performRefresh,
      destroyLocal,
    };
    ready = refreshLocal();
    return scope;
  };

  const destroyAll = (): void => {
    if (destroyed) return;
    destroyed = true;
    const cleanupErrors: unknown[] = [];
    for (const scope of [...scopes.values()]) {
      try { scope.destroyLocal(); } catch (error) { cleanupErrors.push(error); }
    }
    scopes.clear();
    try { primary.destroyLocal(); } catch (error) { cleanupErrors.push(error); }
    claims.clear();
    handles.clear();
    try { runtime.destroy(); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Cornerfill compiled teardown failed");
    }
  };

  primary = createScope(document, true);
  function controllerExplain(): Readonly<CornerfillCompiledExplanation>;
  function controllerExplain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
  function controllerExplain(
    element?: HTMLElement,
  ): Readonly<CornerfillCompiledExplanation> | Readonly<CornerfillEntryExplanation> | null {
    if (element) return runtime.explain(element);
    const registered = [primary, ...scopes.values()];
    const reports = registered.map(({ handle }) => handle.explain());
    return Object.freeze({
      schema: "cornerfill-compiled-controller@1",
      mode: "compiled",
      root: "document",
      scopes: scopes.size,
      manifests: reports.reduce((sum, report) => sum + report.manifests, 0),
      candidates: reports.reduce((sum, report) => sum + report.candidates, 0),
      attached: handles.size,
      errors: Object.freeze(reports.flatMap(({ errors: values }) => values)),
      observing: reports.some(({ observing }) => observing),
      observation: mergeSelectorObservation(reports.map(({ observation }) => observation)),
      limits: Object.freeze({ maxCandidateElements, maxScannedElements }),
      counters: Object.freeze(sumCounters(registered.map(({ counters: values }) => values))),
      runtime: runtime.stats(),
    });
  }
  const controller: CornerfillCompiledControllerHandle = Object.freeze({
    ready: primary.handle.ready.then(() => controllerExplain()),
    explain: controllerExplain,
    refresh() {
      if (destroyed) return Promise.reject(new Error("Cornerfill compiled controller is destroyed"));
      return queueOperation(async () => {
        await primary.performRefresh();
        for (const scope of scopes.values()) await scope.performRefresh();
      }).then(() => controllerExplain());
    },
    registerRoot(root: ShadowRoot): CornerfillCompiledScopeHandle {
      if (destroyed) throw new Error("Cornerfill compiled controller is destroyed");
      if (!(root instanceof view.ShadowRoot) || root.ownerDocument !== document) {
        throw new TypeError("Cornerfill compiled scopes require an open ShadowRoot in the same document");
      }
      if (root.host.shadowRoot !== root) {
        throw new TypeError("Cornerfill compiled scopes cannot register a closed ShadowRoot");
      }
      const existing = scopes.get(root);
      if (existing) return existing.handle;
      const scope = createScope(root, false);
      scopes.set(root, scope);
      return scope.handle;
    },
    unregisterRoot(root: ShadowRoot): boolean {
      const scope = scopes.get(root);
      if (!scope) return false;
      scope.destroyLocal();
      return true;
    },
    destroy: destroyAll,
  });
  return controller;
}
