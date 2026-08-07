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
  compiledManifestPropertyName,
  hasResolvedShapeCarrier,
  parseCompiledManifestCssValue,
  serializeCompiledManifest,
} from "./carrier-contract.mjs";
import type {
  CornerfillCompiledManifest,
  SelectorInvalidation,
  SelectorObservation,
} from "./carrier-contract.mjs";
import { compiledSelectorPlan } from "./compiled-selectors.mjs";
import type { CompiledHostContext } from "./compiled-selectors.mjs";
import { cssDeclarationSignature } from "./css-syntax.mjs";
import { mergeSelectorObservation, selectorObservation } from "./selector-metadata.mjs";
import { observeDisabledState } from "./cssom-broker.mjs";
import { isStylesheetSourceElement } from "./stylesheet-elements.mjs";

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
  readonly potentialCandidates: number;
  readonly root: "document" | "shadow";
  readonly runtime: Readonly<CornerfillControllerStats>;
  readonly schema: "cornerfill-compiled-controller@1";
  readonly scopes: number;
  readonly status: "active" | "blocked-recoverable";
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
  readonly inspections: ReadonlyMap<HTMLElement, Readonly<{
    requiresFallback: boolean;
    values: Readonly<Record<string, string>>;
  }>>;
  readonly matched: ReadonlySet<HTMLElement>;
  readonly rawMatched: ReadonlySet<HTMLElement>;
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
  readonly performRefresh: () => Promise<Readonly<CornerfillCompiledExplanation>>;
  readonly destroyLocal: () => void;
  readonly contains: (element: HTMLElement) => boolean;
  readonly mayStyle: (element: HTMLElement) => boolean;
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
  return !isGeneratedStyle(element, view) && isStylesheetSourceElement(element);
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

function inlineCustomPropertySignature(source: unknown): string {
  return cssDeclarationSignature(source, (property) => property.startsWith("--"));
}

function inlineCustomPropertiesChanged(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return inlineCustomPropertySignature(record.oldValue)
    !== inlineCustomPropertySignature(target?.getAttribute("style"));
}

function minimalScanRoots(roots: Iterable<Readonly<ScanRoot>>): readonly Readonly<ScanRoot>[] {
  const direct = new Set<Element>();
  const subtrees = new Set<Element>();
  for (const { element, subtree } of roots) (subtree ? subtrees : direct).add(element);
  const coverage = new Map<Element, boolean>();
  const coveredBySubtree = (element: Element): boolean => {
    let parent = element.parentElement;
    const path: Element[] = [];
    while (parent && !subtrees.has(parent) && !coverage.has(parent)) {
      path.push(parent);
      parent = parent.parentElement;
    }
    const result = parent !== null
      && (subtrees.has(parent) || coverage.get(parent) === true);
    for (const ancestor of path) coverage.set(ancestor, result);
    return result;
  };
  return Object.freeze([
    ...[...subtrees]
      .filter((element) => !coveredBySubtree(element))
      .map((element) => Object.freeze({ element, subtree: true })),
    ...[...direct]
      .filter((element) => !subtrees.has(element) && !coveredBySubtree(element))
      .map((element) => Object.freeze({ element, subtree: false })),
  ]);
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
    const manifest = parseCompiledManifestCssValue(value);
    if (property !== compiledManifestPropertyName(serializeCompiledManifest(manifest))) {
      throw new TypeError(`compiled manifest property does not match its payload: ${property}`);
    }
    manifests.set(property, manifest);
  }
  return Object.freeze([...manifests.values()]);
}

function manifestState(
  document: RuntimeDocument,
  root: CompiledRoot,
  manifests: readonly Readonly<CornerfillCompiledManifest>[],
): Readonly<CompiledManifestState> {
  const authoredSelectors = Object.freeze([
    ...new Set(manifests.flatMap(({ candidateSelectors }) => candidateSelectors)),
  ].sort());
  const plan = compiledSelectorPlan(authoredSelectors);
  const customProperties = new Map<string, CornerfillCompiledManifest["customProperties"][number][]>();
  for (const manifest of manifests) {
    for (const record of manifest.customProperties) {
      const definitions = customProperties.get(record.name) ?? [];
      definitions.push(record);
      customProperties.set(record.name, definitions);
    }
  }
  const reachable = new Set<string>();
  const pending = manifests.flatMap(({ referencedCustomProperties }) => referencedCustomProperties);
  const dependencyObservations: Readonly<SelectorObservation>[] = [];
  const dependencyMediaQueries = new Set<string>();
  const dependencyHostContexts: Readonly<CompiledHostContext>[] = [];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    for (const definition of customProperties.get(name) ?? []) {
      if (definition.problems.length > 0) {
        throw new TypeError(`compiled CSS cannot observe ${name}: ${definition.problems.join("; ")}`);
      }
      pending.push(...definition.references);
      dependencyObservations.push(definition.observation);
      for (const query of definition.mediaQueries) dependencyMediaQueries.add(query);
      dependencyHostContexts.push(...definition.hostContexts);
    }
  }
  const hostContexts = new Map<string, Readonly<CompiledHostContext>>();
  for (const context of [
    ...plan.hostContexts,
    ...manifests.flatMap(({ hostContexts: values }) => values),
    ...dependencyHostContexts,
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
    ...new Set([
      ...manifests.flatMap(({ mediaQueries: values }) => values),
      ...dependencyMediaQueries,
    ]),
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
    observation: mergeSelectorObservation([
      ...manifests.map(({ observation }) => observation),
      ...dependencyObservations,
    ]),
    selectorList: selectors.join(","),
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

function shadowIncludingContains(
  view: RuntimeWindow,
  ancestor: Element,
  element: Element,
): boolean {
  let current: Element | null = element;
  while (current) {
    if (current === ancestor) return true;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    const containingRoot = current.getRootNode();
    current = containingRoot instanceof view.ShadowRoot ? containingRoot.host : null;
  }
  return false;
}

function stylesheetElements(root: CompiledRoot, view: RuntimeWindow): readonly Element[] {
  const container: ParentNode = root instanceof view.Document ? root.documentElement : root;
  const elements: Element[] = [];
  if (container instanceof view.Element && isStylesheetElement(container, view)) elements.push(container);
  for (const element of container.querySelectorAll("style,link[rel]")) {
    if (isStylesheetElement(element, view)) elements.push(element);
  }
  return Object.freeze(elements);
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
  const blockedScopes = new Set<CompiledScopeInternal>();
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

  const blockedFor = (element: HTMLElement): boolean => {
    for (const scope of blockedScopes) if (scope.mayStyle(element)) return true;
    return false;
  };

  const syncElements = async (
    elements: Iterable<HTMLElement>,
    inspections?: ReadonlyMap<HTMLElement, Readonly<{
      requiresFallback: boolean;
      values: Readonly<Record<string, string>>;
    }>>,
  ): Promise<readonly string[]> => {
    const nextErrors: string[] = [];
    for (const element of new Set(elements)) {
      const elementClaims = validClaims(element);
      for (const scope of elementClaims) scope.counters.attachmentPasses += 1;
      if (elementClaims.size === 0 || !element.isConnected || blockedFor(element)) {
        try { detach(element); } catch (error) { nextErrors.push(errorMessage(error)); }
        continue;
      }
      try {
        let inspection = inspections?.get(element);
        if (!inspection) {
          for (const scope of elementClaims) scope.counters.computedChecks += 1;
          inspection = runtime.inspectAuthoredStyle(element, AUTO_CARRIERS);
        }
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
    const watched = new Set<HTMLElement>();
    const eventListeners: EventListenerRecord[] = [];
    const mediaListeners = new Map<string, MediaListenerRecord>();
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
    let status: "active" | "blocked-recoverable" = "active";
    let errors: readonly string[] = Object.freeze([]);
    let manifestCount = 0;
    let state = EMPTY_STATE;
    let observer: MutationObserver | null = null;
    const externalObservers: MutationObserver[] = [];
    const cssomReleases: (() => void)[] = [];
    let pendingFull = false;
    let queued = false;
    let stateFrame: number | null = null;
    let manifestFrame: number | null = null;
    const ownedHostContextMarkers = new Set<string>();
    const pendingHostContextWrites = new Map<string, string | null>();

    const manifestTarget = (): Element => (
      root === document ? document.documentElement : (root as ShadowRoot).host
    );

    const contains = (element: HTMLElement): boolean => {
      if (root === document) return element.isConnected && element.getRootNode() === document;
      const shadow = root as ShadowRoot;
      if (!shadow.host.isConnected || !element.isConnected) return false;
      return element === shadow.host ? state.hostCandidate : element.getRootNode() === shadow;
    };

    const mayStyle = (element: HTMLElement): boolean => {
      if (root === document) return element.isConnected && element.getRootNode() === document;
      const shadow = root as ShadowRoot;
      return element === shadow.host || element.getRootNode() === shadow;
    };

    const releaseHostContextMarker = (attribute: string, force = false): void => {
      if (root === document) return;
      const owned = ownedHostContextMarkers.delete(attribute);
      if (!owned && !force) return;
      const host = (root as ShadowRoot).host;
      if (host.hasAttribute(attribute)) {
        pendingHostContextWrites.set(attribute, null);
        host.removeAttribute(attribute);
      }
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
          ownedHostContextMarkers.add(attribute);
          if (host.getAttribute(attribute) !== "1") {
            pendingHostContextWrites.set(attribute, "1");
            host.setAttribute(attribute, "1");
          }
        } else releaseHostContextMarker(attribute, true);
      }
    };

    const consumesOwnHostContextWrite = (target: Element, attribute: string): boolean => {
      if (root === document
        || target !== (root as ShadowRoot).host
        || !attribute.startsWith(COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX)
        || !pendingHostContextWrites.has(attribute)) return false;
      const expected = pendingHostContextWrites.get(attribute) ?? null;
      pendingHostContextWrites.delete(attribute);
      return target.getAttribute(attribute) === expected;
    };

    const reportAsyncError = (error: unknown, context: string): void => {
      const message = errorMessage(error);
      if (!errors.includes(message)) errors = Object.freeze([...errors, message]);
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
        status,
        observing: Boolean(observer),
        observation: state.observation,
        potentialCandidates: watched.size,
        limits: Object.freeze({ maxCandidateElements, maxScannedElements }),
        counters: Object.freeze({ ...counters }),
        runtime: runtime.stats(),
      });
    }

    const scan = (roots: Iterable<Readonly<ScanRoot>>, replaceAll: boolean): Readonly<ScanResult> => {
      const inspections = new Map<HTMLElement, Readonly<{
        requiresFallback: boolean;
        values: Readonly<Record<string, string>>;
      }>>();
      const matched = new Set<HTMLElement>();
      const rawMatched = new Set<HTMLElement>();
      const visited = new Set<HTMLElement>();
      if (!state.selectorList && !(root !== document && state.hostCandidate)) {
        return Object.freeze({ inspections, matched, rawMatched, visited });
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
        if (candidates.has(element) || watched.has(element)) visited.add(element);
        if (!forceHost && (!state.selectorList || !element.matches(state.selectorList))) return;
        rawMatched.add(element);
        counters.computedChecks += 1;
        const inspection = runtime.inspectAuthoredStyle(element, AUTO_CARRIERS);
        if (!hasResolvedShapeCarrier(inspection.values) || !inspection.requiresFallback) return;
        inspections.set(element, inspection);
        matched.add(element);
        if (matched.size > maxCandidateElements) {
          throw new RangeError(
            `compiled root exceeds the maximum candidate element count of ${maxCandidateElements}`,
          );
        }
      };
      for (const scanRoot of minimalScanRoots(roots)) {
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
      return Object.freeze({ inspections, matched, rawMatched, visited });
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
      const { inspections, matched, rawMatched, visited } = scan(roots, full);
      const affected = new Set<HTMLElement>(matched);
      const watchedRemovals = full ? [...watched] : [...visited];
      for (const element of watchedRemovals) {
        if (!rawMatched.has(element)) watched.delete(element);
      }
      for (const element of rawMatched) watched.add(element);
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
        errors: await syncElements(affected, inspections),
        synchronized: affected,
      });
    };

    const clearObservation = (preserveMedia = false): void => {
      observer?.disconnect();
      observer = null;
      for (const externalObserver of externalObservers.splice(0)) externalObserver.disconnect();
      for (const release of cssomReleases.splice(0)) release();
      for (const { target, type, listener, options: listenerOptions } of eventListeners.splice(0)) {
        target.removeEventListener(type, listener, listenerOptions);
      }
      if (!preserveMedia) {
        for (const { list, listener, legacy } of mediaListeners.values()) {
          if (legacy) list.removeListener(listener);
          else list.removeEventListener("change", listener);
        }
        mediaListeners.clear();
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

    const refreshAllPotentialCandidates = (): void => {
      refreshAllCandidates();
      for (const element of watched) pendingElements.add(element);
      if (root !== document && state.hostCandidate) {
        pendingElements.add((root as ShadowRoot).host);
      }
    };

    const failClosed = (error: unknown): void => {
      clearObservation();
      status = "blocked-recoverable";
      blockedScopes.add(scope);
      const cleanupErrors: unknown[] = [];
      for (const attribute of [...ownedHostContextMarkers]) releaseHostContextMarker(attribute);
      for (const element of [...candidates]) {
        candidates.delete(element);
        removeClaim(scope, element);
      }
      watched.clear();
      for (const element of [...handles.keys()]) {
        if (!mayStyle(element)) continue;
        try { detach(element); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
      }
      manifestCount = 0;
      state = EMPTY_STATE;
      errors = Object.freeze([errorMessage(error), ...cleanupErrors.map(errorMessage)]);
      configureObservation();
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
      for (const element of [...watched]) {
        if (!element.isConnected || !mayStyle(element)) watched.delete(element);
      }
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
          if (consumesOwnHostContextWrite(target, attribute)) continue;
          if (attribute.startsWith(COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX)) {
            refreshAllCandidates();
            pendingFull = true;
            continue;
          }
          const customPropertiesChanged = attribute === "style"
            && inlineCustomPropertiesChanged(record);
          if (attribute === "style"
            && target instanceof view.HTMLElement
            && handles.has(target)
            && !customPropertiesChanged) continue;
          if (customPropertiesChanged) pendingSubtrees.add(target);
          else refreshCandidateDescendants(target);
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
        const related = "relatedTarget" in event && event.relatedTarget instanceof view.Element
          ? event.relatedTarget
          : null;
        if ((event.type === "pointerover" || event.type === "pointerout") && related) {
          const targetChain = new Set<Element>();
          for (let current: Element | null = target; current; current = current.parentElement) {
            targetChain.add(current);
          }
          const relatedChain = new Set<Element>();
          for (let current: Element | null = related; current; current = current.parentElement) {
            relatedChain.add(current);
          }
          for (const element of targetChain) {
            if (!relatedChain.has(element)) scopeFor(element, state.observation.invalidation);
          }
          for (const element of relatedChain) {
            if (!targetChain.has(element)) scopeFor(element, state.observation.invalidation);
          }
        } else {
          scopeFor(target, state.observation.invalidation);
          let ancestor = target.parentElement;
          while (ancestor) {
            if (state.observation.invalidation === "subtree") pendingSubtrees.add(ancestor);
            else pendingElements.add(ancestor);
            ancestor = ancestor.parentElement;
          }
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
      let rebind = false;
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target as Element;
          const attribute = record.attributeName ?? "";
          if (attribute.startsWith("data-cornerfill-owned")) continue;
          if (consumesOwnHostContextWrite(target, attribute)) continue;
          if (attribute.startsWith(COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX)) {
            refresh = true;
            pendingFull = true;
            continue;
          }
          if (attribute === "style"
            && target instanceof view.HTMLElement
            && handles.has(target)
            && !inlineCustomPropertiesChanged(record)) {
            continue;
          }
          if (target === host || shadowIncludingContains(view, target, host)) refresh = true;
          continue;
        }
        if (record.type === "characterData") {
          const parent = record.target.parentElement;
          if (state.hostContext && parent && shadowIncludingContains(view, parent, host)) refresh = true;
          continue;
        }
        if (mutationContainsNode(record, host)) {
          pendingFull = true;
          refresh = true;
          rebind = true;
        } else if (state.hostContext
          && record.target instanceof view.Element
          && shadowIncludingContains(view, record.target, host)) refresh = true;
        if ([...record.addedNodes, ...record.removedNodes].some((node) => (
          nodeContainsStylesheet(node, view)
        ))) refresh = true;
      }
      if (refresh) {
        refreshAllPotentialCandidates();
        if (rebind) scheduleManifestRefresh();
        else queuePending();
      }
    };

    const handleExternalStateEvent = (event: Event): void => {
      if (root === document) return;
      const host = (root as ShadowRoot).host;
      const target = event.target instanceof view.Element ? event.target : null;
      if (target && target !== host && !shadowIncludingContains(view, target, host)) return;
      counters.eventInvalidations += 1;
      refreshAllPotentialCandidates();
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

    const externalObservationTargets = (): readonly Node[] => {
      if (root === document) return Object.freeze([]);
      const targets = new Set<Node>();
      let host = (root as ShadowRoot).host;
      while (true) {
        const containingRoot = host.getRootNode();
        if (containingRoot instanceof view.Document) {
          targets.add(containingRoot.documentElement);
          break;
        }
        if (containingRoot instanceof view.ShadowRoot) {
          targets.add(containingRoot);
          host = containingRoot.host;
          continue;
        }
        if (containingRoot instanceof view.Node) targets.add(containingRoot);
        targets.add(document.documentElement);
        break;
      }
      return Object.freeze([...targets]);
    };

    const handleRecoveryMutations = (records: readonly MutationRecord[]): void => {
      for (const record of records) {
        if (record.type !== "attributes") {
          scheduleManifestRefresh();
          return;
        }
        const target = record.target as Element;
        const attribute = record.attributeName ?? "";
        if (attribute.startsWith("data-cornerfill-owned")) continue;
        if (consumesOwnHostContextWrite(target, attribute)) continue;
        scheduleManifestRefresh();
        return;
      }
    };

    const addMediaListener = (
      key: string,
      query: string,
      listener: (event: MediaQueryListEvent) => void,
    ): void => {
      if (mediaListeners.has(key)) return;
      const list = view.matchMedia(query);
      let record: MediaListenerRecord;
      if (typeof list.addEventListener === "function") {
        list.addEventListener("change", listener);
        record = Object.freeze({ list, listener, legacy: false });
      } else {
        list.addListener(listener);
        record = Object.freeze({ list, listener, legacy: true });
      }
      mediaListeners.set(key, record);
    };

    const retainMediaListeners = (keys: ReadonlySet<string>): void => {
      for (const [key, { list, listener, legacy }] of mediaListeners) {
        if (keys.has(key)) continue;
        if (legacy) list.removeListener(listener);
        else list.removeEventListener("change", listener);
        mediaListeners.delete(key);
      }
    };

    const observeStylesheetLifecycle = (mediaKeys: Set<string>): void => {
      const ownerQueries = new Set<string>();
      const stylesheetStates = new Set<object>();
      for (const element of stylesheetElements(root, view)) {
        if (element instanceof view.HTMLStyleElement || element instanceof view.HTMLLinkElement) {
          if (element.media.trim()) ownerQueries.add(element.media.trim());
          stylesheetStates.add(element);
          if (element.sheet) stylesheetStates.add(element.sheet);
        }
      }
      try {
        for (const sheet of root.adoptedStyleSheets) stylesheetStates.add(sheet);
      } catch {
        // An explicit refresh remains the contract when adoptedStyleSheets itself is inaccessible.
      }
      for (const target of stylesheetStates) {
        const release = observeDisabledState(view, target, scheduleManifestRefresh);
        if (release) cssomReleases.push(release);
      }
      for (const query of ownerQueries) {
        const key = `owner:${query}`;
        mediaKeys.add(key);
        addMediaListener(key, query, () => {
          counters.mediaInvalidations += 1;
          scheduleManifestRefresh();
        });
      }
    };

    const configureObservation = (): void => {
      clearObservation(true);
      if (!autoObserve || destroyed || scopeDestroyed) return;
      const recovery = status === "blocked-recoverable";
      const externalTargets = externalObservationTargets();
      const mediaKeys = new Set<string>();
      if (view.MutationObserver) {
        observer = new view.MutationObserver(recovery ? handleRecoveryMutations : handleMutations);
        const observerOptions: MutationObserverInit = {
          attributes: true,
          attributeOldValue: true,
          childList: true,
          characterData: true,
          subtree: true,
        };
        if (!recovery && !state.observation.conservative) {
          observerOptions.attributeFilter = [...new Set([
            "dir", "style", ...STYLESHEET_ATTRIBUTES, ...state.observation.attributes,
          ])];
        }
        observer.observe(root === document ? document.documentElement : root, observerOptions);
        for (const target of externalTargets) {
          const externalObserver = new view.MutationObserver(
            recovery ? handleRecoveryMutations : handleExternalMutations,
          );
          externalObserver.observe(target, {
            attributes: true,
            attributeOldValue: true,
            childList: true,
            characterData: recovery || state.hostContext,
            subtree: true,
          });
          externalObservers.push(externalObserver);
        }
      }
      const stylesheetSettled: EventListener = (event) => {
        if (event.target instanceof view.Element && isStylesheetElement(event.target, view)) {
          scheduleManifestRefresh();
        }
      };
      addEventRecord(root, "load", stylesheetSettled, true);
      addEventRecord(root, "error", stylesheetSettled, true);
      observeStylesheetLifecycle(mediaKeys);
      if (recovery) {
        retainMediaListeners(mediaKeys);
        return;
      }
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
          for (const externalTarget of externalTargets) {
            addEventRecord(externalTarget, type, handleExternalStateEvent, true);
          }
        }
      }
      for (const query of state.mediaQueries) {
        const key = `manifest:${query}`;
        mediaKeys.add(key);
        const listener = (_event: MediaQueryListEvent): void => {
          counters.mediaInvalidations += 1;
          refreshAllPotentialCandidates();
          queuePending();
        };
        addMediaListener(key, query, listener);
      }
      retainMediaListeners(mediaKeys);
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
        clearObservation(true);
        counters.manifestReads += 1;
        const manifests = compiledManifests(view, manifestTarget());
        state = manifestState(document, root, manifests);
        manifestCount = manifests.length;
        syncHostContextMarkers();
        const wasBlocked = blockedScopes.has(scope);
        const blockedElements = wasBlocked
          ? [...claims.keys()].filter((element) => mayStyle(element))
          : [];
        status = "active";
        configureObservation();
        blockedScopes.delete(scope);
        const reconciled = await reconcile(fullScanRoots(), true);
        const recoveryErrors = wasBlocked
          ? await syncElements(blockedElements)
          : Object.freeze([]);
        errors = Object.freeze([...reconciled.errors, ...recoveryErrors]);
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
      const releasedBlock = blockedScopes.delete(scope);
      const recoveryElements = releasedBlock
        ? [...claims.keys()].filter((element) => mayStyle(element))
        : [];
      clearObservation();
      if (stateFrame !== null) view.cancelAnimationFrame(stateFrame);
      if (manifestFrame !== null) view.cancelAnimationFrame(manifestFrame);
      stateFrame = null;
      manifestFrame = null;
      pendingElements.clear();
      pendingSubtrees.clear();
      pendingRefresh.clear();
      watched.clear();
      for (const attribute of [...ownedHostContextMarkers]) releaseHostContextMarker(attribute);
      pendingHostContextWrites.clear();
      for (const element of [...candidates]) {
        candidates.delete(element);
        removeClaim(scope, element);
        if (!claims.has(element)) detach(element);
      }
      if (root !== document && scopes.get(root as ShadowRoot) === scope) {
        scopes.delete(root as ShadowRoot);
      }
      if (!destroyed && recoveryElements.length > 0) {
        void queueOperation(async () => { await syncElements(recoveryElements); }).catch((error) => (
          reportAsyncError(error, "compiled scope teardown recovery")
        ));
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
      handle,
      contains,
      mayStyle,
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
    blockedScopes.clear();
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
      status: reports.some(({ status: value }) => value === "blocked-recoverable")
        ? "blocked-recoverable"
        : "active",
      observing: reports.some(({ observing }) => observing),
      observation: mergeSelectorObservation(reports.map(({ observation }) => observation)),
      potentialCandidates: reports.reduce((sum, report) => sum + report.potentialCandidates, 0),
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
