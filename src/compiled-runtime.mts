import { installCornerfill } from "./runtime.mjs";
import type {
  CornerfillAuthoredStyleInspection,
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
  SHAPE_CARRIERS,
  compiledCarrierProblem,
  compiledManifestPropertyName,
  hasResolvedShapeCarrier,
  parseCompiledManifestCssValue,
  resolvedCarrierValue,
  serializeCompiledManifest,
} from "./carrier-contract.mjs";
import type {
  CornerfillCompiledManifest,
  SelectorInvalidation,
  SelectorObservation,
} from "./carrier-contract.mjs";
import { compiledSelectorPlan } from "./compiled-selectors.mjs";
import type { CompiledHostContext } from "./compiled-selectors.mjs";
import { cssDeclarations, cssDeclarationSignature, cssFunctions } from "./css-syntax.mjs";
import { standardPropertyAffectsOwnedPaint } from "./paint-properties.mjs";
import { mergeSelectorObservation, selectorObservation } from "./selector-metadata.mjs";
import { observeDisabledState } from "./cssom-broker.mjs";
import {
  isStylesheetSourceElement,
  mutationTouchesStylesheetSource,
} from "./stylesheet-elements.mjs";

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
  readonly maxCustomPropertyDefinitions?: number | undefined;
  readonly maxManifestBytes?: number | undefined;
  readonly maxManifestRecords?: number | undefined;
  readonly maxPotentialCandidates?: number | undefined;
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
    maxCustomPropertyDefinitions: number;
    maxManifestBytes: number;
    maxManifestRecords: number;
    maxPotentialCandidates: number;
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
  readonly externalObservation: Readonly<SelectorObservation>;
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
  readonly errors: readonly string[];
  readonly inlineEdgeChanged: boolean;
  readonly inspections: ReadonlyMap<HTMLElement, Readonly<CornerfillAuthoredStyleInspection>>;
  readonly matched: ReadonlySet<HTMLElement>;
  readonly rawMatched: ReadonlySet<HTMLElement>;
  readonly resizeMatched: ReadonlySet<HTMLElement>;
  readonly visited: ReadonlySet<HTMLElement>;
}

interface ReconcileResult {
  readonly errors: readonly string[];
  readonly inlineEdgeChanged: boolean;
  readonly synchronized: ReadonlySet<HTMLElement>;
}

interface CompiledScopeInternal {
  readonly candidates: Set<HTMLElement>;
  readonly counters: CompiledCounters;
  readonly demote: (element: HTMLElement) => void;
  readonly handle: CornerfillCompiledScopeHandle;
  readonly localManifests: () => readonly Readonly<CornerfillCompiledManifest>[];
  readonly performRefresh: (notifyDependents?: boolean) => Promise<Readonly<CornerfillCompiledExplanation>>;
  readonly destroyLocal: () => void;
  readonly contains: (element: HTMLElement) => boolean;
  readonly mayInfluence: (element: HTMLElement) => boolean;
  readonly mayStyle: (element: HTMLElement) => boolean;
  readonly root: CompiledRoot;
  readonly scheduleManifestRefresh: () => void;
}

const DEFAULT_MAX_CANDIDATE_ELEMENTS = 512;
const DEFAULT_MAX_CUSTOM_PROPERTY_DEFINITIONS = 100_000;
const DEFAULT_MAX_MANIFEST_BYTES = 1024 * 1024;
const DEFAULT_MAX_MANIFEST_RECORDS = 512;
const DEFAULT_MAX_POTENTIAL_CANDIDATES = 100_000;
const DEFAULT_MAX_SCANNED_ELEMENTS = 100_000;
const STYLESHEET_ATTRIBUTES = Object.freeze([
  "disabled", "href", "media", "rel", "title", "type",
]);
const EMPTY_STATE: Readonly<CompiledManifestState> = Object.freeze({
  externalObservation: selectorObservation([]),
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

function inlineCustomVariableSignature(source: unknown): string {
  return cssDeclarations(source)
    .filter(({ property, value }) => (
      property.startsWith("--") || standardPropertyAffectsOwnedPaint(property)
    )
      && cssFunctions(value).some(({ name }) => name === "var"))
    .map(({ property, value }) => `${property}:${value}`)
    .join(";");
}

function inlineOwnedPaintChanged(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  const signature = (source: unknown) => cssDeclarationSignature(
    source,
    standardPropertyAffectsOwnedPaint,
  );
  return signature(record.oldValue) !== signature(target?.getAttribute("style"));
}

function inlineFallbackDecisionChanged(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  const signature = (source: unknown) => cssDeclarationSignature(source, (property) => (
    property === "all"
    || property === "direction"
    || property === "font"
    || property === "font-size"
    || property === "text-orientation"
    || property === "writing-mode"
    || (property.startsWith("border-") && property.endsWith("-radius"))
  ));
  return signature(record.oldValue) !== signature(target?.getAttribute("style"));
}

function inlineInheritedPaintChanged(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  const signature = (source: unknown) => cssDeclarationSignature(source, (property) => (
    property === "color"
    || property === "color-scheme"
    || property === "direction"
    || property === "forced-color-adjust"
    || property === "image-rendering"
    || property === "line-height"
    || property === "text-orientation"
    || property === "visibility"
    || property === "writing-mode"
    || property === "font"
    || property.startsWith("font-")
  ));
  return signature(record.oldValue) !== signature(target?.getAttribute("style"));
}

function computedCarrierValues(
  view: RuntimeWindow,
  element: HTMLElement,
): Readonly<Record<string, string>> {
  const computed = view.getComputedStyle(element);
  return Object.freeze(Object.fromEntries(AUTO_CARRIERS.map((property) => (
    [property, computed.getPropertyValue(property)]
  ))));
}

function pendingMeasurement(error: unknown): boolean {
  return error instanceof RangeError
    && error.message === "Cornerfill requires a measurable non-zero border box";
}

function carrierMayNeedShapedGeometry(values: Readonly<Record<string, string>>): boolean {
  return SHAPE_CARRIERS.some((property) => {
    const value = resolvedCarrierValue(values, property);
    return Boolean(value && !/^round(?:\s+round){0,3}$/iu.test(value));
  });
}

function autoDirectionAncestor(element: Element | null): Element | null {
  for (let current = element; current; current = current.parentElement) {
    if (current.getAttribute("dir")?.trim().toLowerCase() === "auto") return current;
  }
  return null;
}

function shadowIncludingAutoDirectionAncestor(
  view: RuntimeWindow,
  element: Element,
): Element | null {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("dir")?.trim().toLowerCase() === "auto") return current;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    const containingRoot = current.getRootNode();
    current = containingRoot instanceof view.ShadowRoot ? containingRoot.host : null;
  }
  return null;
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
  limits: Readonly<{
    maxCustomPropertyDefinitions: number;
    maxManifestBytes: number;
    maxManifestRecords: number;
  }>,
): readonly Readonly<CornerfillCompiledManifest>[] {
  const computed = view.getComputedStyle(target);
  const manifests = new Map<string, Readonly<CornerfillCompiledManifest>>();
  const encoder = new view.TextEncoder();
  let bytes = 0;
  let customPropertyDefinitions = 0;
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) continue;
    const value = computed.getPropertyValue(property).trim();
    if (!value || value === AUTO_UNSET) continue;
    bytes += encoder.encode(value).byteLength;
    if (bytes > limits.maxManifestBytes) {
      throw new RangeError(`compiled root exceeds the maximum manifest byte count of ${limits.maxManifestBytes}`);
    }
    if (manifests.size >= limits.maxManifestRecords) {
      throw new RangeError(`compiled root exceeds the maximum manifest record count of ${limits.maxManifestRecords}`);
    }
    const manifest = parseCompiledManifestCssValue(value);
    customPropertyDefinitions += manifest.customProperties.length;
    if (customPropertyDefinitions > limits.maxCustomPropertyDefinitions) {
      throw new RangeError(
        `compiled root exceeds the maximum custom-property definition count of ${limits.maxCustomPropertyDefinitions}`,
      );
    }
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
  localManifests: readonly Readonly<CornerfillCompiledManifest>[],
  inheritedManifests: readonly Readonly<CornerfillCompiledManifest>[],
  inlineCustomVariableEdge: boolean,
  limits: Readonly<{
    maxCustomPropertyDefinitions: number;
    maxManifestBytes: number;
    maxManifestRecords: number;
  }>,
): Readonly<CompiledManifestState> {
  const authoredSelectors = Object.freeze([
    ...new Set(localManifests.flatMap(({ candidateSelectors }) => candidateSelectors)),
  ].sort());
  const plan = compiledSelectorPlan(authoredSelectors);
  const effectiveManifests = [...localManifests, ...inheritedManifests];
  const serializedManifests = new Map<string, Readonly<CornerfillCompiledManifest>>();
  const encoder = new document.defaultView.TextEncoder();
  let manifestBytes = 0;
  let customPropertyDefinitions = 0;
  for (const manifest of effectiveManifests) {
    const serialized = serializeCompiledManifest(manifest);
    if (serializedManifests.has(serialized)) continue;
    if (serializedManifests.size >= limits.maxManifestRecords) {
      throw new RangeError(
        `compiled effective graph exceeds the maximum manifest record count of ${limits.maxManifestRecords}`,
      );
    }
    manifestBytes += encoder.encode(serialized).byteLength;
    if (manifestBytes > limits.maxManifestBytes) {
      throw new RangeError(
        `compiled effective graph exceeds the maximum manifest byte count of ${limits.maxManifestBytes}`,
      );
    }
    customPropertyDefinitions += manifest.customProperties.length;
    if (customPropertyDefinitions > limits.maxCustomPropertyDefinitions) {
      throw new RangeError(
        `compiled effective graph exceeds the maximum custom-property definition count of ${limits.maxCustomPropertyDefinitions}`,
      );
    }
    serializedManifests.set(serialized, manifest);
  }
  const customProperties = new Map<string, {
    readonly local: boolean;
    readonly record: CornerfillCompiledManifest["customProperties"][number];
  }[]>();
  const addDefinitions = (
    manifests: readonly Readonly<CornerfillCompiledManifest>[],
    local: boolean,
  ): void => {
    for (const manifest of manifests) {
      for (const record of manifest.customProperties) {
        const definitions = customProperties.get(record.name) ?? [];
        definitions.push({ local, record });
        customProperties.set(record.name, definitions);
      }
    }
  };
  addDefinitions(localManifests, true);
  addDefinitions(inheritedManifests, false);
  const reachable = new Set<string>();
  const pending = [
    ...localManifests.flatMap(({ referencedCustomProperties }) => referencedCustomProperties),
    ...inheritedManifests.flatMap(
      ({ inheritedReferencedCustomProperties }) => inheritedReferencedCustomProperties,
    ),
  ];
  const localDependencyObservations: Readonly<SelectorObservation>[] = [];
  const externalDependencyObservations: Readonly<SelectorObservation>[] = [];
  const dependencyMediaQueries = new Set<string>();
  const dependencyHostContexts: Readonly<CompiledHostContext>[] = [];
  let unresolvedInlineEdge = inlineCustomVariableEdge;
  const includeDefinition = (
    definition: { readonly local: boolean; readonly record: CornerfillCompiledManifest["customProperties"][number] },
  ): void => {
    const { local, record } = definition;
    if (record.problems.length > 0) {
      throw new TypeError(
        `compiled CSS cannot safely resolve reachable ${record.name}; `
        + `at least one transformed definition is unobservable: ${record.problems.join("; ")}`,
      );
    }
    pending.push(...record.references);
    (local ? localDependencyObservations : externalDependencyObservations).push(record.observation);
    for (const query of record.mediaQueries) dependencyMediaQueries.add(query);
    if (local) dependencyHostContexts.push(...record.hostContexts);
  };
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    const definitions = customProperties.get(name) ?? [];
    if (definitions.length === 0) unresolvedInlineEdge = true;
    for (const definition of definitions) includeDefinition(definition);
  }
  if (unresolvedInlineEdge) {
    for (const [name, definitions] of customProperties) {
      if (reachable.has(name)) continue;
      reachable.add(name);
      for (const definition of definitions) includeDefinition(definition);
    }
    while (pending.length > 0) {
      const name = pending.pop()!;
      if (reachable.has(name)) continue;
      reachable.add(name);
      for (const definition of customProperties.get(name) ?? []) includeDefinition(definition);
    }
  }
  const hostContexts = new Map<string, Readonly<CompiledHostContext>>();
  for (const context of [
    ...plan.hostContexts,
    ...localManifests.flatMap(({ hostContexts: values }) => values),
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
      ...effectiveManifests.flatMap(({ mediaQueries: values }) => values),
      ...dependencyMediaQueries,
    ]),
  ].sort());
  return Object.freeze({
    externalObservation: mergeSelectorObservation([
      ...inheritedManifests.map(({ observation }) => observation),
      ...externalDependencyObservations,
    ]),
    hostCandidate: root === document ? false : plan.hostCandidate,
    hostContext: root === document ? false : plan.hostContext || hostContexts.size > 0,
    hostContexts: root === document
      ? Object.freeze([])
      : Object.freeze([...hostContexts.values()].sort((left, right) => (
        left.attribute < right.attribute ? -1 : left.attribute > right.attribute ? 1 : 0
      ))),
    hostDependent: root === document ? false : plan.hostDependent || hostContexts.size > 0,
    manifests: localManifests,
    mediaQueries,
    observation: mergeSelectorObservation([
      ...localManifests.map(({ observation }) => observation),
      ...localDependencyObservations,
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
  const autoObserve = options.autoObserve !== false && options.observe !== false;
  const maxCandidateElements = options.maxCandidateElements
    ?? DEFAULT_MAX_CANDIDATE_ELEMENTS;
  const maxScannedElements = options.maxScannedElements ?? DEFAULT_MAX_SCANNED_ELEMENTS;
  const maxPotentialCandidates = options.maxPotentialCandidates
    ?? DEFAULT_MAX_POTENTIAL_CANDIDATES;
  const maxManifestBytes = options.maxManifestBytes ?? DEFAULT_MAX_MANIFEST_BYTES;
  const maxManifestRecords = options.maxManifestRecords ?? DEFAULT_MAX_MANIFEST_RECORDS;
  const maxCustomPropertyDefinitions = options.maxCustomPropertyDefinitions
    ?? DEFAULT_MAX_CUSTOM_PROPERTY_DEFINITIONS;
  positiveSafeInteger(maxCandidateElements, "maxCandidateElements");
  positiveSafeInteger(maxCustomPropertyDefinitions, "maxCustomPropertyDefinitions");
  positiveSafeInteger(maxManifestBytes, "maxManifestBytes");
  positiveSafeInteger(maxManifestRecords, "maxManifestRecords");
  positiveSafeInteger(maxPotentialCandidates, "maxPotentialCandidates");
  positiveSafeInteger(maxScannedElements, "maxScannedElements");
  if (options.autoObserve !== undefined && typeof options.autoObserve !== "boolean") {
    throw new TypeError("autoObserve must be a boolean");
  }
  if (options.observe !== undefined && typeof options.observe !== "boolean") {
    throw new TypeError("observe must be a boolean");
  }
  if (options.onError !== undefined && typeof options.onError !== "function") {
    throw new TypeError("onError must be a function");
  }
  const {
    autoObserve: _autoObserve,
    maxCandidateElements: _maxCandidateElements,
    maxCustomPropertyDefinitions: _maxCustomPropertyDefinitions,
    maxManifestBytes: _maxManifestBytes,
    maxManifestRecords: _maxManifestRecords,
    maxPotentialCandidates: _maxPotentialCandidates,
    maxScannedElements: _maxScannedElements,
    onError,
    ...runtimeOptions
  } = options;
  void _autoObserve;
  void _maxCandidateElements;
  void _maxCustomPropertyDefinitions;
  void _maxManifestBytes;
  void _maxManifestRecords;
  void _maxPotentialCandidates;
  void _maxScannedElements;

  const compiledLimits = Object.freeze({
    maxCandidateElements,
    maxCustomPropertyDefinitions,
    maxManifestBytes,
    maxManifestRecords,
    maxPotentialCandidates,
    maxScannedElements,
  });

  const runtime: CornerfillControllerHandle = installCornerfill({
    ...runtimeOptions,
    document,
    observe: autoObserve,
  });
  const handles = new Map<HTMLElement, Readonly<CornerfillHandle>>();
  const claims = new Map<HTMLElement, Set<CompiledScopeInternal>>();
  const blockedScopes = new Set<CompiledScopeInternal>();
  const scopes = new Map<ShadowRoot, CompiledScopeInternal>();
  const internalStyleWrites = new Map<Element, string | null>();
  let primary: CompiledScopeInternal;
  let destroyed = false;
  let operationChain: Promise<void> = Promise.resolve();
  let internalStyleCleanup: number | null = null;

  const recordInternalStyleWrite = <T,>(element: Element, operation: () => T): T => {
    try {
      return operation();
    } finally {
      internalStyleWrites.set(element, element.getAttribute("style"));
      if (internalStyleCleanup === null) {
        internalStyleCleanup = view.setTimeout(() => {
          internalStyleCleanup = null;
          internalStyleWrites.clear();
        }, 0);
      }
    }
  };

  const consumesInternalStyleWrite = (element: Element): boolean => (
    internalStyleWrites.has(element)
      && internalStyleWrites.get(element) === element.getAttribute("style")
  );

  const inspectAuthoredStyle = (
    element: HTMLElement,
  ): ReturnType<CornerfillControllerHandle["inspectAuthoredStyle"]> => (
    handles.get(element)?.backend === "native-corner-shape"
      ? recordInternalStyleWrite(element, () => runtime.inspectAuthoredStyle(element, AUTO_CARRIERS))
      : runtime.inspectAuthoredStyle(element, AUTO_CARRIERS)
  );

  const queueOperation = (operation: () => Promise<void>): Promise<void> => {
    const result = operationChain.then(operation, operation);
    operationChain = result.then(() => undefined, () => undefined);
    return result;
  };

  const parentScopeForRoot = (root: CompiledRoot): CompiledScopeInternal | null => {
    if (root === document) return null;
    const containingRoot = (root as ShadowRoot).host.getRootNode();
    if (containingRoot instanceof view.Document) return primary;
    return containingRoot instanceof view.ShadowRoot
      ? scopes.get(containingRoot) ?? null
      : null;
  };

  const inheritedManifestsFor = (
    root: CompiledRoot,
  ): readonly Readonly<CornerfillCompiledManifest>[] => {
    const manifests: Readonly<CornerfillCompiledManifest>[] = [];
    const seen = new Set<CompiledScopeInternal>();
    let current = root;
    while (current !== document) {
      const containingRoot = (current as ShadowRoot).host.getRootNode();
      let parent: CompiledScopeInternal | null;
      if (containingRoot instanceof view.Document) parent = primary;
      else if (containingRoot instanceof view.ShadowRoot) {
        parent = scopes.get(containingRoot) ?? null;
        if (!parent) {
          throw new TypeError(
            "Cornerfill compiled nested roots require every containing open ShadowRoot to be registered",
          );
        }
      } else break;
      if (seen.has(parent)) break;
      seen.add(parent);
      manifests.push(...parent.localManifests());
      current = parent.root;
    }
    return Object.freeze(manifests);
  };

  const scheduleDirectDependents = (parent: CompiledScopeInternal): void => {
    for (const scope of scopes.values()) {
      if (scope !== parent && parentScopeForRoot(scope.root) === parent) {
        scope.scheduleManifestRefresh();
      }
    }
  };

  const scheduleMovedScopes = (record: MutationRecord): void => {
    if (record.type !== "childList") return;
    for (const scope of scopes.values()) {
      if (scope.root === document) continue;
      if (mutationContainsNode(record, (scope.root as ShadowRoot).host)) {
        scope.scheduleManifestRefresh();
      }
    }
  };

  const scopesInTreeOrder = (): readonly CompiledScopeInternal[] => {
    const depths = new Map<CompiledScopeInternal, number>();
    const visiting = new Set<CompiledScopeInternal>();
    const depth = (scope: CompiledScopeInternal): number => {
      const known = depths.get(scope);
      if (known !== undefined) return known;
      if (visiting.has(scope)) return 0;
      visiting.add(scope);
      const parent = parentScopeForRoot(scope.root);
      const value = parent ? depth(parent) + 1 : 0;
      visiting.delete(scope);
      depths.set(scope, value);
      return value;
    };
    return Object.freeze([primary, ...scopes.values()].sort((left, right) => (
      depth(left) - depth(right)
    )));
  };

  const detach = (element: HTMLElement): void => {
    const handle = handles.get(element);
    if (!handle) return;
    handles.delete(element);
    for (const scope of claims.get(element) ?? []) scope.counters.handleDetaches += 1;
    recordInternalStyleWrite(element, () => handle.dispose());
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
    for (const scope of blockedScopes) if (scope.mayInfluence(element)) return true;
    return false;
  };

  const syncElements = async (
    elements: Iterable<HTMLElement>,
    inspections?: ReadonlyMap<HTMLElement, Readonly<CornerfillAuthoredStyleInspection>>,
  ): Promise<readonly string[]> => {
    const synchronize = async (element: HTMLElement): Promise<readonly string[]> => {
      const elementErrors: string[] = [];
      const elementClaims = validClaims(element);
      for (const scope of elementClaims) scope.counters.attachmentPasses += 1;
      if (elementClaims.size === 0 || !element.isConnected || blockedFor(element)) {
        try { detach(element); } catch (error) { elementErrors.push(errorMessage(error)); }
        return elementErrors;
      }
      try {
        let inspection = inspections?.get(element);
        if (!inspection) {
          for (const scope of elementClaims) scope.counters.computedChecks += 1;
          inspection = inspectAuthoredStyle(element);
        }
        const problem = compiledCarrierProblem(inspection.values);
        if (problem) throw new TypeError(problem);
        if (inspection.fallbackProblem) throw new TypeError(inspection.fallbackProblem);
        if (!hasResolvedShapeCarrier(inspection.values) || !inspection.requiresFallback) {
          detach(element);
          for (const scope of [...elementClaims]) scope.demote(element);
          return elementErrors;
        }
        const existing = handles.get(element);
        if (existing) {
          for (const scope of elementClaims) scope.counters.handleRefreshes += 1;
          await existing.refresh();
        } else {
          const handle = recordInternalStyleWrite(element, () => runtime.attach(element));
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
        try { detach(element); } catch (cleanupError) {
          elementErrors.push(errorMessage(cleanupError));
        }
        for (const scope of [...elementClaims]) scope.demote(element);
        elementErrors.push(errorMessage(error));
      }
      return elementErrors;
    };
    const results = await Promise.all([...new Set(elements)].map(synchronize));
    return Object.freeze(results.flat());
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
    const potential = new Set<HTMLElement>();
    const resizeObserved = new Set<HTMLElement>();
    const localInlineEdges = new Set<Element>();
    const externalInlineEdges = new Set<Element>();
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
    let localManifests: readonly Readonly<CornerfillCompiledManifest>[] = Object.freeze([]);
    let recoveryMediaQueries: readonly string[] = Object.freeze([]);
    let recoveryObservation = EMPTY_STATE.observation;
    let recoveryExternalObservation = EMPTY_STATE.externalObservation;
    let recoveryHostDependent = false;
    let state = EMPTY_STATE;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const externalObservers: MutationObserver[] = [];
    const cssomReleases: (() => void)[] = [];
    let pendingFull = false;
    let queued = false;
    let stateFrame: number | null = null;
    let manifestFrame: number | null = null;
    let viewportRecoveryActive = false;
    const ownedHostContextMarkers = new Set<string>();
    const pendingHostContextWrites = new Map<string, string | null>();

    const manifestTarget = (): Element => (
      root === document ? document.documentElement : (root as ShadowRoot).host
    );

    const inlineEdgeActive = (): boolean => (
      localInlineEdges.size > 0 || externalInlineEdges.size > 0
    );

    const setInlineEdge = (target: Set<Element>, element: Element): void => {
      const signature = inlineCustomVariableSignature(element.getAttribute("style"));
      if (!signature) {
        target.delete(element);
        return;
      }
      const retained = target.size + (
        target === externalInlineEdges ? localInlineEdges.size : externalInlineEdges.size
      );
      if (!target.has(element) && retained >= maxScannedElements) {
        throw new RangeError(
          `compiled root exceeds the maximum inline dependency element count of ${maxScannedElements}`,
        );
      }
      target.add(element);
    };

    const pruneLocalInlineEdges = (): void => {
      for (const element of localInlineEdges) {
        if (element.getRootNode() !== root) localInlineEdges.delete(element);
      }
    };

    const syncExternalInlineEdges = (): void => {
      externalInlineEdges.clear();
      if (root === document) return;
      let ancestor: Element | null = (root as ShadowRoot).host;
      let scanned = 0;
      while (ancestor) {
        scanned += 1;
        if (scanned > maxScannedElements) {
          throw new RangeError(
            `compiled root exceeds the maximum scanned element count of ${maxScannedElements}`,
          );
        }
        setInlineEdge(externalInlineEdges, ancestor);
        if (ancestor.parentElement) {
          ancestor = ancestor.parentElement;
          continue;
        }
        const containingRoot = ancestor.getRootNode();
        ancestor = containingRoot instanceof view.ShadowRoot ? containingRoot.host : null;
      }
    };

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

    const mayInfluence = (element: HTMLElement): boolean => {
      if (!element.isConnected || element.ownerDocument !== document) return false;
      if (root === document) return true;
      return shadowIncludingContains(view, (root as ShadowRoot).host, element);
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
        observation: mergeSelectorObservation([state.observation, state.externalObservation]),
        potentialCandidates: potential.size,
        limits: compiledLimits,
        counters: Object.freeze({ ...counters }),
        runtime: runtime.stats(),
      });
    }

    const demote = (element: HTMLElement): void => {
      if (!candidates.delete(element)) return;
      removeClaim(scope, element);
      if (potential.has(element) || potential.size < maxPotentialCandidates) potential.add(element);
    };

    const scan = (roots: Iterable<Readonly<ScanRoot>>, replaceAll: boolean): Readonly<ScanResult> => {
      const scanErrors = new Set<string>();
      const inspections = new Map<HTMLElement, Readonly<CornerfillAuthoredStyleInspection>>();
      const matched = new Set<HTMLElement>();
      const rawMatched = new Set<HTMLElement>();
      const resizeMatched = new Set<HTMLElement>();
      const visited = new Set<HTMLElement>();
      const inlineEdgeWasActive = inlineEdgeActive();
      const nextInlineEdges = replaceAll ? new Set<Element>() : localInlineEdges;
      if (!state.selectorList && !(root !== document && state.hostCandidate)) {
        if (replaceAll) localInlineEdges.clear();
        return Object.freeze({
          errors: Object.freeze([]),
          inlineEdgeChanged: inlineEdgeWasActive !== inlineEdgeActive(),
          inspections,
          matched,
          rawMatched,
          resizeMatched,
          visited,
        });
      }
      let scanned = 0;
      const inspect = (element: Element, forceHost = false): void => {
        scanned += 1;
        if (scanned > maxScannedElements) {
          throw new RangeError(
            `compiled root exceeds the maximum scanned element count of ${maxScannedElements}`,
          );
        }
        if (element.getRootNode() === root) setInlineEdge(nextInlineEdges, element);
        if (!(element instanceof view.HTMLElement)) return;
        if (candidates.has(element) || potential.has(element)) visited.add(element);
        if (!forceHost && (!state.selectorList || !element.matches(state.selectorList))) return;
        rawMatched.add(element);
        counters.computedChecks += 1;
        let inspection: Readonly<CornerfillAuthoredStyleInspection>;
        try {
          inspection = inspectAuthoredStyle(element);
        } catch (error) {
          const values = computedCarrierValues(view, element);
          if (carrierMayNeedShapedGeometry(values)) {
            resizeMatched.add(element);
          }
          if (!pendingMeasurement(error)) scanErrors.add(errorMessage(error));
          return;
        }
        if (!hasResolvedShapeCarrier(inspection.values)) return;
        if (!inspection.requiresFallback) {
          if (carrierMayNeedShapedGeometry(inspection.values)) resizeMatched.add(element);
          return;
        }
        if (inspection.fallbackProblem) {
          scanErrors.add(inspection.fallbackProblem);
          return;
        }
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
      if (replaceAll) {
        localInlineEdges.clear();
        for (const element of nextInlineEdges) localInlineEdges.add(element);
      }
      counters.scannedElements += scanned;
      let projectedCandidates = replaceAll ? 0 : candidates.size;
      let projectedPotential = replaceAll ? 0 : potential.size;
      if (!replaceAll) {
        for (const element of visited) {
          if (candidates.has(element)) projectedCandidates -= 1;
          if (potential.has(element)) projectedPotential -= 1;
        }
      }
      projectedCandidates += matched.size;
      for (const element of rawMatched) if (!matched.has(element)) projectedPotential += 1;
      if (projectedCandidates > maxCandidateElements) {
        throw new RangeError(
          `compiled root exceeds the maximum candidate element count of ${maxCandidateElements}`,
        );
      }
      if (projectedPotential > maxPotentialCandidates) {
        throw new RangeError(
          `compiled root exceeds the maximum potential candidate count of ${maxPotentialCandidates}`,
        );
      }
      return Object.freeze({
        errors: Object.freeze([...scanErrors]),
        inlineEdgeChanged: inlineEdgeWasActive !== inlineEdgeActive(),
        inspections,
        matched,
        rawMatched,
        resizeMatched,
        visited,
      });
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
      deferInlineRefresh = true,
      precomputed?: Readonly<ScanResult>,
    ): Promise<Readonly<ReconcileResult>> => {
      counters.candidatePasses += 1;
      const {
        errors: scanErrors,
        inlineEdgeChanged,
        inspections,
        matched,
        rawMatched,
        resizeMatched,
        visited,
      } = precomputed ?? scan(roots, full);
      const affected = new Set<HTMLElement>(matched);
      const potentialRemovals = full ? [...potential] : [...visited];
      for (const element of potentialRemovals) potential.delete(element);
      const removals = full ? [...candidates] : [...visited];
      for (const element of removals) {
        if (matched.has(element)) continue;
        candidates.delete(element);
        removeClaim(scope, element);
        affected.add(element);
      }
      for (const element of matched) {
        potential.delete(element);
        candidates.add(element);
        addClaim(scope, element);
      }
      for (const element of rawMatched) {
        if (!matched.has(element)) potential.add(element);
      }
      if (resizeObserver) {
        const resizeRemovals = full ? [...resizeObserved] : [...visited];
        for (const element of resizeRemovals) {
          if (resizeMatched.has(element)) continue;
          resizeObserved.delete(element);
          resizeObserver.unobserve(element);
        }
        for (const element of resizeMatched) {
          if (resizeObserved.has(element)) continue;
          resizeObserved.add(element);
          resizeObserver.observe(element);
        }
      }
      const synchronizedErrors = await syncElements(affected, inspections);
      if (inlineEdgeChanged && deferInlineRefresh) scheduleManifestRefresh();
      return Object.freeze({
        errors: Object.freeze([...scanErrors, ...synchronizedErrors]),
        inlineEdgeChanged,
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
      for (const element of candidates) pendingElements.add(element);
      for (const element of potential) pendingElements.add(element);
      if (root !== document && state.hostCandidate) {
        pendingElements.add((root as ShadowRoot).host);
      }
    };

    const failClosed = (
      error: unknown,
      failedState: Readonly<CompiledManifestState> | null,
    ): void => {
      clearObservation();
      if (failedState) {
        recoveryMediaQueries = failedState.mediaQueries;
        recoveryObservation = failedState.observation;
        recoveryExternalObservation = failedState.externalObservation;
        recoveryHostDependent = failedState.hostDependent;
      }
      status = "blocked-recoverable";
      blockedScopes.add(scope);
      const cleanupErrors: unknown[] = [];
      for (const attribute of [...ownedHostContextMarkers]) releaseHostContextMarker(attribute);
      for (const element of [...candidates]) {
        candidates.delete(element);
        removeClaim(scope, element);
      }
      potential.clear();
      resizeObserved.clear();
      resizeObserver?.disconnect();
      localInlineEdges.clear();
      externalInlineEdges.clear();
      for (const element of [...handles.keys()]) {
        if (!mayInfluence(element)) continue;
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
      for (const element of [...potential]) {
        if (!element.isConnected || !mayStyle(element)) potential.delete(element);
      }
      for (const element of [...resizeObserved]) {
        if (element.isConnected && mayStyle(element)) continue;
        resizeObserved.delete(element);
        resizeObserver?.unobserve(element);
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
        failClosed(error, state);
        throw error;
      }
    };

    const queuePending = (): void => {
      if (queued || destroyed || scopeDestroyed) return;
      if (!pendingFull
        && pendingElements.size === 0
        && pendingSubtrees.size === 0
        && pendingRefresh.size === 0) return;
      queued = true;
      view.queueMicrotask(() => {
        queued = false;
        if (destroyed || scopeDestroyed) return;
        void queueOperation(performPending).catch((error) => (
          reportAsyncError(error, "compiled invalidation")
        ));
      });
    };

    if (autoObserve && view.ResizeObserver) {
      resizeObserver = new view.ResizeObserver((entries) => {
        if (destroyed || scopeDestroyed) return;
        for (const { target } of entries) {
          if (target instanceof view.HTMLElement && resizeObserved.has(target)) {
            pendingElements.add(target);
          }
        }
        queuePending();
      });
    }

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

    const scheduleViewportRecovery = (): void => {
      if (viewportRecoveryActive || destroyed || scopeDestroyed) return;
      viewportRecoveryActive = true;
      let retry = true;
      const attempt = (): void => {
        if (destroyed || scopeDestroyed || status !== "blocked-recoverable") {
          viewportRecoveryActive = false;
          return;
        }
        void queueOperation(async () => { await performRefresh(); }).then(() => {
          viewportRecoveryActive = false;
        }, (error) => {
          reportAsyncError(error, "compiled viewport recovery");
          if (retry && !destroyed && !scopeDestroyed && status === "blocked-recoverable") {
            retry = false;
            view.requestAnimationFrame(attempt);
          } else viewportRecoveryActive = false;
        });
      };
      view.requestAnimationFrame(attempt);
    };

    const handleMutations = (records: readonly MutationRecord[]): void => {
      counters.mutationBatches += 1;
      const attributes = new Set(state.observation.attributes);
      const styleTargets = new Set<Element>();
      let stylesheetChanged = false;
      let localEdgesMayHaveLeft = false;
      for (const record of records) {
        if (record.type === "attributes") {
          const target = record.target as Element;
          const attribute = record.attributeName ?? "";
          if (STYLESHEET_ATTRIBUTES.includes(attribute)
            && mutationTouchesStylesheetSource(record)) {
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
          if (attribute === "style") {
            if (styleTargets.has(target)) continue;
            styleTargets.add(target);
            if (consumesInternalStyleWrite(target)) continue;
          }
          const customPropertiesChanged = attribute === "style"
            && inlineCustomPropertiesChanged(record);
          const ownedPaintChanged = attribute === "style" && inlineOwnedPaintChanged(record);
          const affectsSelector = state.observation.conservative || attributes.has(attribute);
          if (attribute === "style") {
            const inlineEdgeWasActive = inlineEdgeActive();
            try { setInlineEdge(localInlineEdges, target); } catch (error) {
              failClosed(error, state);
              reportAsyncError(error, "compiled inline dependency budget");
              return;
            }
            if (inlineEdgeWasActive !== inlineEdgeActive()) scheduleManifestRefresh();
            if (!customPropertiesChanged && !ownedPaintChanged && !affectsSelector) continue;
            if (target instanceof view.HTMLElement && handles.has(target)
              && !customPropertiesChanged
              && !affectsSelector) {
              const inheritedPaintChanged = inlineInheritedPaintChanged(record);
              if (runtime.explain(target)?.backend === "native-corner-shape"
                && !inheritedPaintChanged) continue;
              if (!inheritedPaintChanged && !inlineFallbackDecisionChanged(record)) continue;
            }
            if (customPropertiesChanged || ownedPaintChanged) pendingSubtrees.add(target);
          } else refreshCandidateDescendants(target);
          if (attribute === "dir") pendingSubtrees.add(target);
          if (affectsSelector) {
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
          const directionRoot = autoDirectionAncestor(parent);
          if (directionRoot) pendingSubtrees.add(directionRoot);
          else if (parent && state.observation.characterData) {
            scopeFor(parent, state.observation.invalidation);
          }
          continue;
        }
        scheduleMovedScopes(record);
        const target = record.target instanceof view.Element ? record.target : null;
        if (target instanceof view.HTMLElement
          && (candidates.has(target) || potential.has(target))) {
          pendingElements.add(target);
        }
        const directionRoot = autoDirectionAncestor(target);
        if (directionRoot) pendingSubtrees.add(directionRoot);
        if (stylesheetTextOwner(record.target, view)) stylesheetChanged = true;
        for (const node of record.addedNodes) {
          if (nodeContainsStylesheet(node, view)) stylesheetChanged = true;
          else if (node instanceof view.Element
            && !isGeneratedStyle(node, view)
            && state.selectorList) pendingSubtrees.add(node);
        }
        for (const node of record.removedNodes) {
          if (nodeContainsStylesheet(node, view)) stylesheetChanged = true;
          if (node instanceof view.Element) localEdgesMayHaveLeft = true;
        }
        if (target && state.observation.invalidation !== "self") {
          refreshCandidateDescendants(target);
          scopeFor(target, state.observation.invalidation);
        }
      }
      if (localEdgesMayHaveLeft) {
        const inlineEdgeWasActive = inlineEdgeActive();
        pruneLocalInlineEdges();
        if (inlineEdgeWasActive !== inlineEdgeActive()) scheduleManifestRefresh();
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

    const handleViewportResize = (): void => {
      refreshAllPotentialCandidates();
      if (stateFrame === null) {
        stateFrame = view.requestAnimationFrame(() => {
          stateFrame = null;
          queuePending();
        });
      }
    };

    const effectiveExternalObservation = (): Readonly<SelectorObservation> => (
      state.hostDependent
        ? mergeSelectorObservation([state.externalObservation, state.observation])
        : state.externalObservation
    );

    const externalMutationAffectsHost = (
      target: Element,
      host: Element,
      invalidation: SelectorInvalidation,
    ): boolean => {
      if (invalidation === "root" || target === host || shadowIncludingContains(view, target, host)) {
        return true;
      }
      return invalidation === "parent"
        && Boolean(target.parentElement && shadowIncludingContains(view, target.parentElement, host));
    };

    const handleExternalMutations = (records: readonly MutationRecord[]): void => {
      if (root === document) return;
      const host = (root as ShadowRoot).host;
      const externalObservation = effectiveExternalObservation();
      const attributes = new Set(externalObservation.attributes);
      const styleTargets = new Set<Element>();
      let refresh = false;
      let manifestRefresh = false;
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
          const affectsSelector = externalObservation.conservative || attributes.has(attribute);
          if (attribute !== "style"
            && attribute !== "dir"
            && !externalObservation.conservative
            && !attributes.has(attribute)) continue;
          if (attribute === "style") {
            if (styleTargets.has(target)) continue;
            styleTargets.add(target);
            if (consumesInternalStyleWrite(target)) continue;
            const customPropertiesChanged = inlineCustomPropertiesChanged(record);
            const ownedPaintChanged = inlineOwnedPaintChanged(record);
            if (target === host || shadowIncludingContains(view, target, host)) {
              const inlineEdgeWasActive = inlineEdgeActive();
              try { setInlineEdge(externalInlineEdges, target); } catch (error) {
                failClosed(error, state);
                reportAsyncError(error, "compiled external inline dependency budget");
                return;
              }
              if (inlineEdgeWasActive !== inlineEdgeActive()) manifestRefresh = true;
            }
            if (!customPropertiesChanged && !ownedPaintChanged && !affectsSelector) continue;
            if (target instanceof view.HTMLElement && handles.has(target)
              && !customPropertiesChanged
              && !affectsSelector) {
              const inheritedPaintChanged = inlineInheritedPaintChanged(record);
              if (runtime.explain(target)?.backend === "native-corner-shape"
                && !inheritedPaintChanged) continue;
              if (!inheritedPaintChanged && !inlineFallbackDecisionChanged(record)) continue;
            }
          }
          if (attribute === "dir"
            && (target === host || shadowIncludingContains(view, target, host))) {
            const previous = record.oldValue?.trim().toLowerCase() ?? "";
            const current = target.getAttribute("dir")?.trim().toLowerCase() ?? "";
            if (previous === "auto" || current === "auto") manifestRefresh = true;
          }
          if (externalMutationAffectsHost(
            target,
            host,
            affectsSelector ? externalObservation.invalidation : "self",
          )) {
            refresh = true;
          }
          continue;
        }
        if (record.type === "characterData") {
          const parent = record.target.parentElement;
          const directionRoot = autoDirectionAncestor(parent);
          if (parent && (
            (directionRoot && shadowIncludingContains(view, directionRoot, host))
            || (externalObservation.characterData
              && externalObservation.invalidation === "root")
            || ((state.hostContext || state.observation.characterData)
              && shadowIncludingContains(view, parent, host))
          )) refresh = true;
          continue;
        }
        const externalDirectionRoot = record.target instanceof view.Element
          ? autoDirectionAncestor(record.target)
          : null;
        if (mutationContainsNode(record, host)) {
          pendingFull = true;
          refresh = true;
          manifestRefresh = true;
        } else if (externalDirectionRoot
          && shadowIncludingContains(view, externalDirectionRoot, host)) {
          refresh = true;
        } else if (state.hostContext
          && record.target instanceof view.Element
          && shadowIncludingContains(view, record.target, host)) refresh = true;
        else if (externalObservation.invalidation !== "self") refresh = true;
        if ([...record.addedNodes, ...record.removedNodes].some((node) => (
          nodeContainsStylesheet(node, view)
        ))) refresh = true;
      }
      if (manifestRefresh) scheduleManifestRefresh();
      else if (refresh) {
        refreshAllPotentialCandidates();
        queuePending();
      }
    };

    const handleExternalStateEvent = (event: Event): void => {
      if (root === document) return;
      const host = (root as ShadowRoot).host;
      const target = event.target instanceof view.Element ? event.target : null;
      const externalEvent = effectiveExternalObservation().events.includes(event.type);
      if (!externalEvent
        && target
        && target !== host
        && !shadowIncludingContains(view, target, host)) return;
      counters.eventInvalidations += 1;
      refreshAllPotentialCandidates();
      if (stateFrame === null) {
        stateFrame = view.requestAnimationFrame(() => {
          stateFrame = null;
          queuePending();
        });
      }
    };

    const handleRecoveryStateEvent = (): void => {
      counters.eventInvalidations += 1;
      scheduleManifestRefresh();
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
        if (attribute === "style" && consumesInternalStyleWrite(target)) continue;
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
      const rememberSheet = (sheet: CSSStyleSheet | null): void => {
        if (!sheet) return;
        stylesheetStates.add(sheet);
        const media = sheet.media.mediaText.trim();
        if (media) ownerQueries.add(media);
      };
      for (const element of stylesheetElements(root, view)) {
        if (element instanceof view.HTMLStyleElement || element instanceof view.HTMLLinkElement) {
          if (element.media.trim()) ownerQueries.add(element.media.trim());
          stylesheetStates.add(element);
          rememberSheet(element.sheet);
        }
      }
      try {
        for (const sheet of root.adoptedStyleSheets) rememberSheet(sheet);
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
      const externalObservation = recovery
        ? (recoveryHostDependent
          ? mergeSelectorObservation([recoveryExternalObservation, recoveryObservation])
          : recoveryExternalObservation)
        : effectiveExternalObservation();
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
          const externalOptions: MutationObserverInit = {
            attributes: true,
            attributeOldValue: true,
            childList: true,
            characterData: recovery
              || externalObservation.characterData
              || (root !== document && Boolean(shadowIncludingAutoDirectionAncestor(
                view,
                (root as ShadowRoot).host,
              ))),
            subtree: true,
          };
          if (!recovery && !externalObservation.conservative) {
            externalOptions.attributeFilter = [...new Set([
              "dir",
              "style",
              ...externalObservation.attributes,
              ...state.hostContexts.map(({ attribute }) => attribute),
            ])];
          }
          externalObserver.observe(target, externalOptions);
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
      const stateEventTarget = (type: string, localTarget: EventTarget): EventTarget => (
        type === "hashchange" || type === "popstate"
          ? view
          : type === "fullscreenchange"
            ? document
            : localTarget
      );
      const stateEventOptions = (type: string): boolean | AddEventListenerOptions => (
        type === "hashchange" || type === "popstate"
          ? Object.freeze({ passive: true })
          : true
      );
      if (recovery) {
        addEventRecord(view, "resize", scheduleViewportRecovery, Object.freeze({ passive: true }));
        for (const query of recoveryMediaQueries) {
          const key = `recovery:${query}`;
          mediaKeys.add(key);
          addMediaListener(key, query, () => {
            counters.mediaInvalidations += 1;
            scheduleManifestRefresh();
          });
        }
        const internalEvents = new Set(recoveryObservation.events);
        for (const type of internalEvents) {
          addEventRecord(
            stateEventTarget(type, root),
            type,
            handleRecoveryStateEvent,
            stateEventOptions(type),
          );
        }
        const externalEvents = new Set(recoveryExternalObservation.events);
        if (recoveryHostDependent) {
          for (const type of recoveryObservation.events) externalEvents.add(type);
        }
        for (const type of externalEvents) {
          const globalEvent = type === "hashchange"
            || type === "popstate"
            || type === "fullscreenchange";
          if (globalEvent) {
            if (!internalEvents.has(type)) {
              addEventRecord(
                stateEventTarget(type, root),
                type,
                handleRecoveryStateEvent,
                stateEventOptions(type),
              );
            }
            continue;
          }
          for (const externalTarget of externalTargets) {
            addEventRecord(externalTarget, type, handleRecoveryStateEvent, true);
          }
        }
        retainMediaListeners(mediaKeys);
        return;
      }
      addEventRecord(view, "resize", handleViewportResize, Object.freeze({ passive: true }));
      const internalEvents = new Set(state.observation.events);
      for (const type of internalEvents) {
        addEventRecord(
          stateEventTarget(type, root),
          type,
          handleStateEvent,
          stateEventOptions(type),
        );
      }
      const externalEvents = new Set(state.externalObservation.events);
      if (root !== document && state.hostDependent) {
        for (const type of state.observation.events) externalEvents.add(type);
      }
      for (const type of externalEvents) {
        const globalEvent = type === "hashchange"
          || type === "popstate"
          || type === "fullscreenchange";
        if (globalEvent) {
          if (!internalEvents.has(type)) {
            addEventRecord(
              stateEventTarget(type, root),
              type,
              handleExternalStateEvent,
              stateEventOptions(type),
            );
          }
          continue;
        }
        for (const externalTarget of externalTargets) {
          addEventRecord(externalTarget, type, handleExternalStateEvent, true);
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

    const performRefresh = async (
      notifyDependents = true,
    ): Promise<Readonly<CornerfillCompiledExplanation>> => {
      if (destroyed || scopeDestroyed) throw new Error("Cornerfill compiled scope is destroyed");
      if (manifestFrame !== null) view.cancelAnimationFrame(manifestFrame);
      manifestFrame = null;
      pendingFull = false;
      pendingElements.clear();
      pendingSubtrees.clear();
      pendingRefresh.clear();
      let attemptedState: Readonly<CompiledManifestState> | null = status === "active"
        ? state
        : null;
      try {
        clearObservation(true);
        counters.manifestReads += 1;
        localInlineEdges.clear();
        syncExternalInlineEdges();
        const nextManifests = compiledManifests(view, manifestTarget(), compiledLimits);
        const inheritedManifests = inheritedManifestsFor(root);
        state = manifestState(
          document,
          root,
          nextManifests,
          inheritedManifests,
          inlineEdgeActive(),
          compiledLimits,
        );
        attemptedState = state;
        localManifests = nextManifests;
        manifestCount = nextManifests.length;
        syncHostContextMarkers();
        let scanned = scan(fullScanRoots(), true);
        if (scanned.inlineEdgeChanged) {
          state = manifestState(
            document,
            root,
            nextManifests,
            inheritedManifests,
            inlineEdgeActive(),
            compiledLimits,
          );
          attemptedState = state;
          syncHostContextMarkers();
          scanned = scan(fullScanRoots(), true);
        }
        recoveryMediaQueries = state.mediaQueries;
        recoveryObservation = state.observation;
        recoveryExternalObservation = state.externalObservation;
        recoveryHostDependent = state.hostDependent;
        const wasBlocked = blockedScopes.has(scope);
        const blockedElements = wasBlocked
          ? [...claims.keys()].filter((element) => mayInfluence(element))
          : [];
        status = "active";
        configureObservation();
        blockedScopes.delete(scope);
        const reconciled = await reconcile([], true, false, scanned);
        const recoveryErrors = wasBlocked
          ? await syncElements(blockedElements)
          : Object.freeze([]);
        errors = Object.freeze([...reconciled.errors, ...recoveryErrors]);
        if (notifyDependents) scheduleDirectDependents(scope);
        return explain();
      } catch (error) {
        if (stateFrame !== null) view.cancelAnimationFrame(stateFrame);
        stateFrame = null;
        failClosed(error, attemptedState);
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
        ? [...claims.keys()].filter((element) => mayInfluence(element))
        : [];
      const dependentScopes = root === document
        ? []
        : [...scopes.values()].filter((candidate) => parentScopeForRoot(candidate.root) === scope);
      clearObservation();
      if (stateFrame !== null) view.cancelAnimationFrame(stateFrame);
      if (manifestFrame !== null) view.cancelAnimationFrame(manifestFrame);
      stateFrame = null;
      manifestFrame = null;
      pendingElements.clear();
      pendingSubtrees.clear();
      pendingRefresh.clear();
      potential.clear();
      resizeObserved.clear();
      resizeObserver?.disconnect();
      localInlineEdges.clear();
      externalInlineEdges.clear();
      localManifests = Object.freeze([]);
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
      for (const dependent of dependentScopes) dependent.scheduleManifestRefresh();
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
      demote,
      handle,
      localManifests: () => localManifests,
      contains,
      mayInfluence,
      mayStyle,
      performRefresh,
      destroyLocal,
      root,
      scheduleManifestRefresh,
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
    if (internalStyleCleanup !== null) view.clearTimeout(internalStyleCleanup);
    internalStyleCleanup = null;
    internalStyleWrites.clear();
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
      limits: compiledLimits,
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
        const failures: unknown[] = [];
        for (const scope of scopesInTreeOrder()) {
          try { await scope.performRefresh(false); } catch (error) { failures.push(error); }
        }
        if (failures.length > 0) {
          throw new AggregateError(failures, "Cornerfill compiled refresh failed");
        }
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
      scheduleDirectDependents(scope);
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
