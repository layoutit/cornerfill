import { installCornerfill } from "./runtime.mjs";
import type {
  CornerfillAuthoredStyleInspection,
  CornerfillControllerHandle,
  CornerfillControllerStats,
  CornerfillEntryExplanation,
  CornerfillHandle,
  CornerfillInstallOptions,
} from "./runtime.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import { cssDeclarationSignature, cssDeclarations } from "./css-syntax.mjs";
import { observeDisabledState, observeStylesheetMutations } from "./cssom-broker.mjs";
import {
  AUTO_ALL_PENDING,
  AUTO_ALL_VALUE,
  AUTO_CARRIERS,
  AUTO_CARRIER_SET,
  AUTO_LOGICAL_SHAPE,
  AUTO_PHYSICAL_SHAPE,
  AUTO_SHAPE_SOURCE,
  AUTO_UNSET,
  LOGICAL_SHAPE_PROPERTIES,
  PHYSICAL_SHAPE_PROPERTIES,
  SHAPE_CARRIERS,
  SHAPE_PROPERTIES,
  SHAPE_STATUS_CARRIERS,
  SUPPORTED_ALL_VALUE,
  annotateDiagnostic,
  canonicalizeCornerShapeDeclarations,
  carrierDeclarations,
  importLoadFailure,
  leadingImportStatements,
  mergeSelectorObservation,
  mutateStylesheetModel,
  ownershipBlockingError,
  ownershipBlockingRangeError,
  parseCarrierSheet,
  parseImportStatement,
  selectorObservation,
  wrapImportedCarrierCss,
} from "./carriers.mjs";
import type {
  CarrierCompilation,
  CssomMutation,
  DiagnosticDetails,
  DiagnosticError,
  DiagnosticOwner,
  InlineCarrierCompilation,
  ParsedImport,
  SelectorObservation,
  SelectorRecord,
} from "./carriers.mjs";
export type { SelectorObservation } from "./carriers.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{ defaultView: RuntimeWindow }>;
type AutoRoot = Document | ShadowRoot;
type StylesheetOwner = HTMLStyleElement | HTMLLinkElement;

interface ElementDiagnostic {
  readonly declaration: string | null;
  readonly selector: string | null;
  readonly source: string;
}

type EventListenerTarget = EventTarget & Readonly<{
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void;
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
}>;

interface CompiledSourceTree extends CarrierCompilation {
  readonly failedImports: number;
  readonly imports: number;
  readonly sources: readonly string[];
}

interface StylesheetSource {
  readonly baseUrl: string;
  readonly sourceUrl: string;
  readonly text: string;
}

export interface DiagnosticRecord {
  readonly context: string;
  readonly declaration: string | null;
  readonly message: string;
  readonly name: string;
  readonly owner: string;
  readonly selector: string | null;
  readonly source: string;
}

interface CssomHook {
  active: boolean;
  readonly baseUrl: string;
  modelSource: string;
  readonly owner: StylesheetOwner;
  readonly restore: () => void;
  readonly sheet: CSSStyleSheet;
}

interface StylesheetRecord {
  readonly adopted?: true | undefined;
  readonly companion: HTMLStyleElement | null;
  readonly cssomHook: CssomHook | null;
  readonly failed: boolean;
  readonly identity?: string | undefined;
  readonly imports: number;
  readonly key: string;
  readonly media: string;
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
  readonly ownershipBlocking: boolean;
  readonly owner: CSSStyleSheet | StylesheetOwner;
  readonly selectorRecords: readonly Readonly<SelectorRecord>[];
  readonly selectors: readonly string[];
  readonly sources: readonly string[];
}

interface WriteStylesheetOptions {
  readonly cssomHook?: CssomHook | null | undefined;
  readonly existing?: Readonly<StylesheetRecord> | undefined;
  readonly key?: string | undefined;
}

interface RefreshRequestOptions {
  readonly attachments?: boolean | undefined;
  readonly candidates?: boolean | undefined;
  readonly retryFailed?: boolean | undefined;
  readonly sources?: boolean | undefined;
}

export interface RegisterRootOptions {
  readonly adoptedStyleSheets?: boolean | undefined;
  readonly autoObserve?: boolean | undefined;
  readonly nonce?: string | null | undefined;
  readonly onError?: ((error: unknown, context: string) => void) | undefined;
}

interface InlineDeclaration {
  readonly previousPriority: string;
  readonly previousValue: string;
  readonly priority: string;
  readonly property: string;
  readonly value: string;
}

interface InlineRecord {
  readonly appliedAttribute: string;
  readonly authoredShape: string;
  readonly declarations: readonly Readonly<InlineDeclaration>[];
  readonly shape: boolean;
  readonly signature: string;
}

interface ImportRequestRecord {
  readonly consumers: Set<SourceRequest>;
  readonly controller: AbortController;
  readonly key: string;
  promise: Promise<Readonly<StylesheetSource>> | null;
  settled: boolean;
}

interface SourceRequest {
  aborted: boolean;
  bytes: number;
  cancelWait: (() => void) | null;
  readonly controller: AbortController | null;
  readonly deadline: number;
  readonly importCache: Map<string, Promise<Readonly<CompiledSourceTree>>>;
  imports: number;
  readonly importRecords: Set<ImportRequestRecord>;
  readonly key: string;
  promise: Promise<void> | null;
  readonly provenance: Set<string>;
}

interface CarrierRegistration {
  references: number;
  readonly style: HTMLStyleElement;
}

interface EventListenerRecord {
  readonly listener: EventListener;
  readonly options: AddEventListenerOptions | boolean;
  readonly target: EventListenerTarget;
  readonly type: string;
}

interface MediaListenerRecord {
  readonly legacy: boolean;
  readonly list: MediaQueryList;
  readonly listener: (event: MediaQueryListEvent) => void;
}

export interface ObservationState extends SelectorObservation {
  readonly mediaQueries: readonly string[];
}

interface AutomaticCounters {
  attachmentPasses: number;
  candidatePasses: number;
  computedChecks: number;
  handleAttaches: number;
  handleDetaches: number;
  handleRefreshes: number;
  sourceCompiles: number;
  sourcePasses: number;
  sourceReads: number;
}

export type CornerfillAutomaticCounters = Readonly<AutomaticCounters>;

export interface CornerfillAutoOptions extends CornerfillInstallOptions {
  readonly adoptedStyleSheets?: boolean | undefined;
  readonly autoObserve?: boolean | undefined;
  readonly maxCompiledSelectors?: number | undefined;
  readonly maxImportCount?: number | undefined;
  readonly maxImportDepth?: number | undefined;
  readonly maxStylesheetBytes?: number | undefined;
  readonly onError?: ((error: unknown, context: string) => void) | undefined;
  readonly root?: AutoRoot | undefined;
  readonly stylesheetTimeoutMs?: number | undefined;
  readonly unreadableStylesheetPolicy?: "best-effort" | "block-root" | undefined;
}

interface InternalCornerfillAutoOptions extends CornerfillAutoOptions {
  readonly controller?: CornerfillControllerHandle | undefined;
  readonly parentAuto?: CornerfillAutoController | null | undefined;
}

export interface CornerfillAutoExplanation {
  readonly attached: number;
  readonly automatic?: Readonly<{
    adoptedStylesheets: number;
    counters: CornerfillAutomaticCounters;
    cssomInsertDeleteAfterInstallation: true;
    inlineStyleAttributes: true;
    limitations: readonly string[];
    observation: Readonly<ObservationState>;
    observedSourceClassStyleStateAndViewportChanges: boolean;
    observing: boolean;
    readableStyleElements: true;
    sameOriginAndCorsStylesheetLinks: true;
    selectorAndConditionalCascade: true;
    sourceLimits: Readonly<{
      deadlineMs: number;
      maxCompiledSelectors: number;
      maxImportCount: number;
      maxImportDepth: number;
      maxStylesheetBytes: number;
      unreadableStylesheetPolicy: "best-effort" | "block-root";
    }>;
  }> | undefined;
  readonly decision: Readonly<{
    reason: "fallback-forced" | "native-requirements-satisfied" | "native-requirements-unresolved";
    selected: "fallback" | "native";
    unresolvedNativeRequirements: readonly string[];
  }>;
  readonly errors: readonly Readonly<DiagnosticRecord>[];
  readonly fallbackLoaded: boolean;
  readonly implementation: Readonly<{
    automaticDiscovery: "BYPASSED_NATIVE" | "IMPLEMENTED";
    fallbackRenderer: "IMPLEMENTED" | "NOT_LOADED" | "NOT_SELECTED";
  }>;
  readonly inlineElements: number;
  readonly mode: "fallback" | "native";
  readonly nativeQualification: Readonly<CornerfillNativeQualification>;
  readonly oracleQualification: typeof CORNERFILL_ORACLE_QUALIFICATION;
  readonly runtime: Readonly<CornerfillControllerStats> | null;
  readonly schema: "cornerfill-auto@1";
  readonly scopes: number;
  readonly stylesheets: number;
}

export interface CornerfillAutoControllerHandle {
  readonly ready: Promise<Readonly<CornerfillAutoExplanation>>;
  destroy(): void;
  explain(): Readonly<CornerfillAutoExplanation>;
  explain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
  refresh(
    options?: Readonly<{ retryFailed?: boolean | undefined }>,
  ): Promise<Readonly<CornerfillAutoExplanation>>;
  refreshAdoptedStyleSheet(
    sheet: CSSStyleSheet,
    source: string,
  ): Promise<Readonly<CornerfillAutoExplanation>>;
  replaceStylesheetSource(
    stylesheet: CSSStyleSheet | HTMLLinkElement | HTMLStyleElement,
    source: string,
  ): Promise<Readonly<CornerfillAutoExplanation>>;
  registerRoot(
    root: ShadowRoot,
    options?: Readonly<RegisterRootOptions>,
  ): CornerfillAutoControllerHandle;
  unregisterRoot(root: ShadowRoot): boolean;
}

const AUTO_STYLESHEET_ATTRIBUTE = "data-cornerfill-auto-styles";
const CARRIER_REGISTRATIONS = new WeakMap<Document, CarrierRegistration>();

const AUTOMATIC_DISCOVERY = Object.freeze({
  readableStyleElements: true,
  sameOriginAndCorsStylesheetLinks: true,
  inlineStyleAttributes: true,
  selectorAndConditionalCascade: true,
  cssomInsertDeleteAfterInstallation: true,
  limitations: Object.freeze([
    "cross-origin stylesheets without CORS",
    "unregistered or closed shadow roots",
    "adopted stylesheets unless explicitly enabled for a registered open shadow root",
    "adopted stylesheet corner-shape source unless supplied to refreshAdoptedStyleSheet()",
    "mixed physical/logical declaration families",
    "all: var(...)/env(...) results that require inherit, revert, or revert-layer cascade reconstruction",
    "corner-shape @supports blocks that also control ordinary declarations or author custom properties",
    "container-query paint dependencies",
    "corner-shape or paint changes driven by CSS animations or transitions",
    "alternate stylesheet sets",
    "corner-shape rules inserted through CSSOM before Cornerfill starts",
    "mutations of existing CSSRule declarations, selectors, grouping rules, or media lists unless exact source is supplied to replaceStylesheetSource()",
    "one ownership-blocking source disables fallback for its registered root",
    "unsupported declarations assigned through CSSStyleDeclaration, which the browser discards",
  ]),
});

const SOURCE_ATTRIBUTE_NAMES = Object.freeze([
  "crossorigin",
  "disabled",
  "href",
  "integrity",
  "media",
  "nonce",
  "referrerpolicy",
  "rel",
  "style",
  "title",
  "type",
]);

function normalizedCarrier(source: string): string {
  const value = source.trim();
  return value === AUTO_UNSET || /^(?:initial|unset)$/iu.test(value) ? "" : value;
}

const AUTOMATIC_COMPUTED_PROPERTIES = Object.freeze([
  "background-attachment",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-origin",
  "background-position",
  "background-repeat",
  "background-size",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-image-source",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "box-shadow",
  "box-sizing",
  "color",
  "height",
  "image-rendering",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  "overflow-x",
  "overflow-y",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "width",
]);

const AUTOMATIC_SIGNATURE_PROPERTIES = Object.freeze([
  "visibility",
  "direction",
  "writing-mode",
  ...AUTOMATIC_COMPUTED_PROPERTIES,
  ...AUTO_CARRIERS,
]);

function inspectionCarrier(
  inspection: Readonly<CornerfillAuthoredStyleInspection>,
  property: string,
): string {
  return normalizedCarrier(inspection.values[property] ?? "");
}

function automaticComputedSignature(
  inspection: Readonly<CornerfillAuthoredStyleInspection>,
): string {
  return AUTOMATIC_SIGNATURE_PROPERTIES.map((property) => (
    AUTO_CARRIER_SET.has(property)
      ? inspectionCarrier(inspection, property)
      : inspection.values[property] ?? ""
  )).join("\n");
}

function automaticStyleMutationSignature(value: unknown, ignorePlacement = true): string {
  return cssDeclarationSignature(value, (property) => {
    if (property === "--cornerfill-live-image"
      || property === "opacity"
      || property === "filter"
      || property === "z-index"
      || property === "will-change"
      || property === "translate"
      || property === "rotate"
      || property === "scale"
      || property === "perspective"
      || property === "perspective-origin") return false;
    if (ignorePlacement && (
      property === "top"
      || property === "right"
      || property === "bottom"
      || property === "left"
      || property === "inset"
      || property.startsWith("inset-")
    )) return false;
    return property !== "transform" && !property.startsWith("transform-")
      && property !== "-webkit-transform" && !property.startsWith("-webkit-transform-");
  });
}

function carrierProblem(inspection: Readonly<CornerfillAuthoredStyleInspection>): string | null {
  if (inspectionCarrier(inspection, AUTO_ALL_PENDING)
    && inspectionCarrier(inspection, AUTO_SHAPE_SOURCE)) {
    const resolved = inspectionCarrier(inspection, AUTO_ALL_VALUE);
    if (!SUPPORTED_ALL_VALUE.test(resolved)) {
      return "Automatic CSS cannot safely transport this all: var(...) result; use cornerfill/runtime for explicit state.";
    }
  }
  if (SHAPE_STATUS_CARRIERS.some((property) => inspectionCarrier(inspection, property) === "unsupported")) {
    return "Automatic CSS cannot resolve this corner-shape value; use cornerfill/runtime for explicit state.";
  }
  const variableShorthand = inspectionCarrier(inspection, SHAPE_PROPERTIES["corner-shape"]);
  const competingLonghand = [...PHYSICAL_SHAPE_PROPERTIES, ...LOGICAL_SHAPE_PROPERTIES]
    .some((property) => inspectionCarrier(inspection, SHAPE_PROPERTIES[property]));
  if (variableShorthand && competingLonghand) {
    return "Automatic CSS refuses a variable corner-shape shorthand combined with longhands because their cascade order cannot be preserved.";
  }
  if (inspectionCarrier(inspection, AUTO_PHYSICAL_SHAPE)
    && inspectionCarrier(inspection, AUTO_LOGICAL_SHAPE)) {
    return "Automatic CSS refuses mixed physical and logical corner-shape declarations because their cross-family cascade cannot be preserved.";
  }
  return null;
}

function hasShapeCarrier(inspection: Readonly<CornerfillAuthoredStyleInspection>): boolean {
  return SHAPE_CARRIERS.some((property) => inspectionCarrier(inspection, property));
}

function stylesheetElements(root: AutoRoot): StylesheetOwner[] {
  return stylesheetSourceElements(root).filter(stylesheetElementIsEligible);
}

function stylesheetSourceElements(root: AutoRoot): StylesheetOwner[] {
  return [...root.querySelectorAll<StylesheetOwner>(
    `style:not([${AUTO_STYLESHEET_ATTRIBUTE}]):not([data-cornerfill-ownership-styles]),link[rel~="stylesheet"]`,
  )];
}

function isStylesheetLink(owner: StylesheetOwner): owner is HTMLLinkElement {
  return owner.localName === "link";
}

function stylesheetElementIsEligible(owner: StylesheetOwner): boolean {
  if (!owner?.isConnected || owner.disabled || owner.sheet?.disabled) return false;
  if (owner.localName === "style") {
    const type = (owner.getAttribute("type") ?? "").trim().toLowerCase();
    return type === "" || type === "text/css";
  }
  if (!isStylesheetLink(owner) || !owner.relList.contains("stylesheet")) return false;
  return !owner.relList.contains("alternate");
}

function authoredShapeInlineElements(root: AutoRoot): Element[] {
  return [...root.querySelectorAll("[style]")].filter((element) => (
    cssDeclarations(element.getAttribute("style")).some(({ property }) => (
      Object.hasOwn(SHAPE_PROPERTIES, property)
    ))
  ));
}

function stylesheetMedia(owner: StylesheetOwner): string {
  return owner.getAttribute("media") ?? "";
}

function adoptedStylesheetMedia(sheet: CSSStyleSheet): string {
  const media = (sheet as CSSStyleSheet & Readonly<{ media?: MediaList | undefined }>).media;
  return media?.mediaText ?? "";
}

function adoptedStylesheetSource(sheet: CSSStyleSheet): string {
  return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
}

function nonceValue(element: Element | null | undefined): string {
  return (element as (Element & Readonly<{ nonce?: string | undefined }> | null | undefined))?.nonce
    || element?.getAttribute("nonce")
    || "";
}

function assertGeneratedStyleActive(style: HTMLStyleElement, context: string): void {
  try {
    if (!style.sheet || style.sheet.cssRules.length === 0) {
      const error = new Error(`${context} was blocked or discarded`) as DiagnosticError;
      Object.defineProperty(error, "cornerfillOwnershipBlocking", { value: true });
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && /blocked or discarded/u.test(error.message)) throw error;
    const failure = new Error(`${context} is not readable after insertion`, { cause: error }) as DiagnosticError;
    Object.defineProperty(failure, "cornerfillOwnershipBlocking", { value: true });
    throw failure;
  }
}

function stylesheetKey(owner: StylesheetOwner, suppliedSource?: string): string {
  if (suppliedSource !== undefined) {
    return `supplied\n${owner.localName}\n${stylesheetMedia(owner)}\n${suppliedSource}`;
  }
  if (!isStylesheetLink(owner)) {
    return `style\n${owner.getAttribute("type") ?? ""}\n${stylesheetMedia(owner)}\n${owner.getAttribute("nonce") ?? ""}\n${owner.textContent ?? ""}`;
  }
  return [
      "link",
      owner.rel,
      owner.title,
      stylesheetMedia(owner),
      nonceValue(owner),
      owner.href,
      owner.crossOrigin ?? "",
      owner.integrity ?? "",
      owner.referrerPolicy ?? "",
  ].join("\n");
}

function carrierRegistrationCss(): string {
  return AUTO_CARRIERS.map((property) => (
    `@property ${property}{syntax:"*";inherits:false;initial-value:${AUTO_UNSET};}`
  )).join("");
}

function inlineCarrierRecords(
  document: RuntimeDocument,
  source: string | null | undefined,
): Readonly<InlineCarrierCompilation> {
  if (!source) return Object.freeze({
    declarations: Object.freeze([]),
    shape: false,
    signature: "",
    authoredShape: "",
  });
  const authoredDeclarations: string[] = [];
  const transformed = canonicalizeCornerShapeDeclarations(
    String(source),
    authoredDeclarations,
    "declarations",
  );
  const scratch = document.createElement("div");
  scratch.setAttribute("style", transformed);
  const compiled = carrierDeclarations(scratch.style);
  if (!compiled.css) return Object.freeze({
    declarations: Object.freeze([]),
    shape: false,
    signature: "",
    authoredShape: authoredDeclarations.join(";"),
  });
  const carrierScratch = document.createElement("div");
  carrierScratch.setAttribute("style", compiled.css);
  const declarations = AUTO_CARRIERS.map((property) => Object.freeze({
    property,
    value: carrierScratch.style.getPropertyValue(property),
    priority: carrierScratch.style.getPropertyPriority(property),
  })).filter(({ value }) => value);
  const signature = declarations.map(({ property, value, priority }) => (
    `${property}:${value.trim()}${priority ? "!important" : ""}`
  )).join(";");
  return Object.freeze({
    declarations: Object.freeze(declarations),
    shape: compiled.shape,
    signature,
    authoredShape: authoredDeclarations.join(";"),
  });
}

function runtimeOptions(
  options: Readonly<InternalCornerfillAutoOptions>,
  document: RuntimeDocument,
): CornerfillInstallOptions {
  const {
    root: _root,
    controller: _controller,
    autoObserve: _autoObserve,
    adoptedStyleSheets: _adoptedStyleSheets,
    parentAuto: _parentAuto,
    onError: _onError,
    stylesheetTimeoutMs: _stylesheetTimeoutMs,
    maxCompiledSelectors: _maxCompiledSelectors,
    maxImportCount: _maxImportCount,
    maxImportDepth: _maxImportDepth,
    maxStylesheetBytes: _maxStylesheetBytes,
    unreadableStylesheetPolicy: _unreadableStylesheetPolicy,
    ...runtime
  } = options;
  return {
    maxActiveEntries: 512,
    maxImageCachePixels: 8_388_608,
    maxSurfacePixels: 4_194_304,
    maxTotalSurfacePixels: 16_777_216,
    ...runtime,
    document,
  };
}

class CornerfillAutoController {
  declare readonly adoptedStylesheetIds: WeakMap<CSSStyleSheet, string>;
  declare readonly adoptedStylesheetSources: WeakMap<CSSStyleSheet, string>;
  declare readonly adoptedStylesheets: Map<CSSStyleSheet, Readonly<StylesheetRecord>>;
  declare attachmentRequested: boolean;
  declare readonly autoObserve: boolean;
  declare automaticCounters: AutomaticCounters;
  declare candidateProvenance: Map<Element, Readonly<SelectorRecord>[]>;
  declare candidateRequested: boolean;
  declare candidates: Set<Element>;
  declare readonly controller: CornerfillControllerHandle;
  declare destroyed: boolean;
  declare readonly diagnosticsByOwner: Map<DiagnosticOwner, Map<string, Readonly<DiagnosticRecord>>>;
  declare readonly document: RuntimeDocument;
  declare readonly eventListeners: EventListenerRecord[];
  declare readonly handleSignatures: Map<HTMLElement, string>;
  declare readonly handles: Map<HTMLElement, Readonly<CornerfillHandle>>;
  declare readonly importRequests: Map<string, ImportRequestRecord>;
  declare readonly includeAdoptedStyleSheets: boolean;
  declare readonly inline: Map<HTMLElement, Readonly<InlineRecord>>;
  declare readonly mediaListeners: MediaListenerRecord[];
  declare readonly maxCompiledSelectors: number;
  declare readonly maxImportCount: number;
  declare readonly maxImportDepth: number;
  declare readonly maxStylesheetBytes: number;
  declare native: boolean;
  declare readonly nativeQualification: Readonly<CornerfillNativeQualification>;
  declare nextAdoptedStylesheetId: number;
  declare nextSourceOwnerId: number;
  declare readonly nonce: string | null;
  declare observationState: Readonly<ObservationState>;
  declare observer: MutationObserver | null;
  declare readonly onError: ((error: unknown, context: string) => void) | null;
  declare readonly ownsController: boolean;
  declare readonly parentAuto: CornerfillAutoController | null;
  declare readonly pendingFetches: Set<AbortController>;
  declare readonly pendingStylesheetWaits: Set<() => void>;
  declare readonly ready: Promise<Readonly<CornerfillAutoExplanation>>;
  declare refreshFrame: number | null;
  declare refreshPromise: Promise<Readonly<CornerfillAutoExplanation>> | null;
  declare refreshQueued: boolean;
  declare registrationAcquired: boolean;
  declare registrationStyle: HTMLStyleElement | null;
  declare retryFailedRequested: boolean;
  declare readonly root: AutoRoot;
  declare rootConnected: boolean;
  declare readonly scopes: Map<ShadowRoot, CornerfillAutoController>;
  declare readonly sourceOwnerIds: WeakMap<object, number>;
  declare sourceRequested: boolean;
  declare readonly sourceRequests: Map<StylesheetOwner, SourceRequest>;
  declare readonly stylesheets: Map<StylesheetOwner, Readonly<StylesheetRecord>>;
  declare readonly stylesheetSources: WeakMap<StylesheetOwner, string>;
  declare readonly stylesheetStateObservers: Map<object, () => void>;
  declare readonly stylesheetTimeoutMs: number;
  declare readonly unreadableStylesheetPolicy: "best-effort" | "block-root";
  declare workRequested: boolean;

  constructor(options: Readonly<InternalCornerfillAutoOptions> = {}) {
    const document = options.document ?? options.root?.ownerDocument ?? globalThis.document;
    if (!document?.defaultView) throw new TypeError("installCornerfillAuto() requires a browser document");
    this.document = document as RuntimeDocument;
    this.root = options.root ?? this.document;
    this.rootConnected = this.root === this.document
      || (this.root as ShadowRoot).host.isConnected;
    const includeAdoptedStyleSheets = options.adoptedStyleSheets === true;
    if (includeAdoptedStyleSheets && this.root === this.document) {
      throw new TypeError("Automatic adopted stylesheet support is limited to registered shadow roots");
    }
    this.stylesheetTimeoutMs = options.stylesheetTimeoutMs ?? 3_000;
    if (!Number.isFinite(this.stylesheetTimeoutMs) || this.stylesheetTimeoutMs <= 0) {
      throw new TypeError("stylesheetTimeoutMs must be a finite positive number");
    }
    this.maxStylesheetBytes = options.maxStylesheetBytes ?? 1_048_576;
    this.maxImportDepth = options.maxImportDepth ?? 16;
    this.maxImportCount = options.maxImportCount ?? 64;
    this.maxCompiledSelectors = options.maxCompiledSelectors ?? 1_024;
    for (const [name, value] of [
      ["maxStylesheetBytes", this.maxStylesheetBytes],
      ["maxImportDepth", this.maxImportDepth],
      ["maxImportCount", this.maxImportCount],
      ["maxCompiledSelectors", this.maxCompiledSelectors],
    ] as const) {
      if (!Number.isInteger(value) || value < 1) throw new TypeError(`${name} must be a positive integer`);
    }
    this.unreadableStylesheetPolicy = options.unreadableStylesheetPolicy ?? "block-root";
    if (this.unreadableStylesheetPolicy !== "block-root"
      && this.unreadableStylesheetPolicy !== "best-effort") {
      throw new TypeError("unreadableStylesheetPolicy must be block-root or best-effort");
    }
    this.nonce = options.nonce ?? stylesheetElements(this.root).map(nonceValue).find(Boolean)
      ?? nonceValue(this.document.querySelector("script[nonce],style[nonce],link[nonce]"))
      ?? null;
    this.controller = options.controller ?? installCornerfill(runtimeOptions({
      ...options,
      nonce: this.nonce,
    }, this.document));
    this.ownsController = options.controller === undefined;
    this.autoObserve = options.autoObserve ?? options.observe !== false;
    this.includeAdoptedStyleSheets = includeAdoptedStyleSheets;
    this.adoptedStylesheetSources = new WeakMap();
    this.parentAuto = options.parentAuto ?? null;
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.stylesheets = new Map();
    this.stylesheetSources = new WeakMap();
    this.stylesheetStateObservers = new Map();
    this.adoptedStylesheets = new Map();
    this.adoptedStylesheetIds = new WeakMap();
    this.nextAdoptedStylesheetId = 1;
    this.sourceOwnerIds = new WeakMap();
    this.nextSourceOwnerId = 1;
    this.scopes = new Map();
    this.inline = new Map();
    this.handles = new Map();
    this.diagnosticsByOwner = new Map();
    this.candidateProvenance = new Map();
    this.observer = null;
    this.observationState = Object.freeze({
      attributes: Object.freeze([...SOURCE_ATTRIBUTE_NAMES]),
      characterData: false,
      conservative: false,
      events: Object.freeze([]),
      mediaQueries: Object.freeze([]),
      unobservableStates: Object.freeze([]),
    });
    this.registrationStyle = null;
    this.registrationAcquired = false;
    this.eventListeners = [];
    this.mediaListeners = [];
    this.destroyed = false;
    this.refreshQueued = false;
    this.workRequested = false;
    this.refreshPromise = null;
    this.refreshFrame = null;
    this.sourceRequested = false;
    this.candidateRequested = false;
    this.attachmentRequested = false;
    this.retryFailedRequested = false;
    this.pendingFetches = new Set();
    this.pendingStylesheetWaits = new Set();
    this.sourceRequests = new Map();
    this.importRequests = new Map();
    this.handleSignatures = new Map();
    this.candidates = new Set();
    this.automaticCounters = {
      sourcePasses: 0,
      sourceReads: 0,
      sourceCompiles: 0,
      candidatePasses: 0,
      attachmentPasses: 0,
      computedChecks: 0,
      handleAttaches: 0,
      handleRefreshes: 0,
      handleDetaches: 0,
    };
    this.nativeQualification = options.nativeQualification ?? this.controller.capabilities.native;
    this.native = this.controller.capabilities.native.qualified
      && this.controller.options.forceFallback !== true;
    this.ready = this._start();
  }

  _ownerIdentity(owner: unknown): string {
    const sourceOwner = owner !== null && typeof owner === "object"
      ? owner as Readonly<{ href?: unknown; localName?: unknown }>
      : null;
    if (sourceOwner?.localName === "link") {
      return typeof sourceOwner.href === "string" && sourceOwner.href
        ? sourceOwner.href
        : "stylesheet link";
    }
    if (sourceOwner?.localName === "style") {
      const styleOwner = owner as object;
      let id = this.sourceOwnerIds.get(styleOwner);
      if (!id) {
        id = this.nextSourceOwnerId;
        this.nextSourceOwnerId += 1;
        this.sourceOwnerIds.set(styleOwner, id);
      }
      return `${this.document.baseURI}#cornerfill-inline-style-${id}`;
    }
    if (owner instanceof this.document.defaultView.Element) {
      return owner.id ? `#${owner.id}` : owner.localName;
    }
    return typeof owner === "string" ? owner : "automatic runtime";
  }

  _stylesheetKey(owner: StylesheetOwner): string {
    return stylesheetKey(owner, this.stylesheetSources.get(owner));
  }

  _recordError(
    error: unknown,
    context: string,
    details: Readonly<DiagnosticDetails> = {},
  ): void {
    const diagnostic = error instanceof Error
      ? (error as DiagnosticError).cornerfillDiagnostic ?? {}
      : {};
    const bucketOwner = details.bucket ?? details.owner ?? `automatic:${context}`;
    const owner = details.ownerIdentity ?? this._ownerIdentity(details.owner ?? context);
    const record: Readonly<DiagnosticRecord> = Object.freeze({
      context,
      owner,
      source: details.source ?? diagnostic.source ?? owner,
      selector: details.selector ?? diagnostic.selector ?? null,
      declaration: details.declaration ?? diagnostic.declaration ?? null,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    });
    const key = `${record.source}\n${record.selector ?? ""}\n${record.declaration ?? ""}\n${record.message}`;
    let records = this.diagnosticsByOwner.get(bucketOwner);
    if (!records) {
      records = new Map();
      this.diagnosticsByOwner.set(bucketOwner, records);
    }
    if (records.has(key)) return;
    records.set(key, record);
    this.onError?.(error, context);
  }

  _clearErrors(owner: DiagnosticOwner): void {
    this.diagnosticsByOwner.delete(owner);
  }

  _errors(): readonly Readonly<DiagnosticRecord>[] {
    const errors: Readonly<DiagnosticRecord>[] = [];
    for (const records of this.diagnosticsByOwner.values()) {
      for (const record of records.values()) errors.push(record);
    }
    return Object.freeze(errors);
  }

  _elementDiagnostic(element: HTMLElement): Readonly<ElementDiagnostic> {
    const provenance = this.candidateProvenance.get(element)?.[0];
    if (provenance) return provenance;
    const inline = this.inline.get(element);
    return Object.freeze({
      source: this._ownerIdentity(element),
      selector: inline ? "[style]" : null,
      declaration: inline?.authoredShape || null,
    });
  }

  _recordElementError(error: unknown, element: HTMLElement): void {
    const diagnostic = this._elementDiagnostic(element);
    this._recordError(error, this._ownerIdentity(element), {
      bucket: element,
      ownerIdentity: diagnostic.source,
      ...diagnostic,
    });
  }

  _ensureCarrierRegistration(): void {
    if (this.registrationAcquired && this.registrationStyle?.isConnected) return;
    const shared = CARRIER_REGISTRATIONS.get(this.document);
    if (shared?.style.isConnected) {
      shared.references += 1;
      this.registrationStyle = shared.style;
      this.registrationAcquired = true;
      return;
    }
    const style = this.document.createElement("style");
    style.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "properties");
    const nonce = this.nonce ?? stylesheetElements(this.root)
      .map((owner) => owner.getAttribute("nonce"))
      .find(Boolean);
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = carrierRegistrationCss();
    (this.document.head ?? this.document.documentElement).append(style);
    try {
      assertGeneratedStyleActive(style, "Cornerfill carrier registration stylesheet");
    } catch (error) {
      style.remove();
      throw error;
    }
    this.registrationStyle = style;
    this.registrationAcquired = true;
    CARRIER_REGISTRATIONS.set(this.document, { references: 1, style });
  }

  _releaseCarrierRegistration(): void {
    if (!this.registrationAcquired) return;
    this.registrationAcquired = false;
    const shared = CARRIER_REGISTRATIONS.get(this.document);
    if (!shared || shared.style !== this.registrationStyle) {
      this.registrationStyle = null;
      return;
    }
    shared.references -= 1;
    if (shared.references <= 0) {
      shared.style.remove();
      CARRIER_REGISTRATIONS.delete(this.document);
    }
    this.registrationStyle = null;
  }

  async _boundedStylesheetTask<T>(
    controller: AbortController,
    label: string,
    task: () => Promise<T>,
    deadline = Date.now() + this.stylesheetTimeoutMs,
  ): Promise<T> {
    let timer = 0;
    const remaining = Math.max(0, deadline - Date.now());
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = this.document.defaultView.setTimeout(() => {
        controller.abort();
        reject(new Error(`${label} exceeded the ${this.stylesheetTimeoutMs}ms source deadline`));
      }, remaining);
    });
    try {
      return await Promise.race([task(), timeout]);
    } finally {
      this.document.defaultView.clearTimeout(timer);
    }
  }

  async _withinSourceDeadline<T>(
    request: SourceRequest,
    label: string,
    promise: Promise<T>,
  ): Promise<T> {
    let timer = 0;
    const remaining = Math.max(0, request.deadline - Date.now());
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = this.document.defaultView.setTimeout(() => reject(
        new Error(`${label} exceeded the ${this.stylesheetTimeoutMs}ms source deadline`),
      ), remaining);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      this.document.defaultView.clearTimeout(timer);
    }
  }

  _accountSource(request: SourceRequest, text: string, label: string): void {
    const bytes = new TextEncoder().encode(text).byteLength;
    request.bytes += bytes;
    if (request.bytes > this.maxStylesheetBytes) {
      throw ownershipBlockingRangeError(
        `${label} exceeds the ${this.maxStylesheetBytes}-byte stylesheet source budget`,
      );
    }
  }

  async _readStylesheetResponse(response: Response, label: string): Promise<string> {
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > this.maxStylesheetBytes) {
      throw ownershipBlockingRangeError(
        `${label} exceeds the ${this.maxStylesheetBytes}-byte stylesheet source budget`,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > this.maxStylesheetBytes) {
        throw ownershipBlockingRangeError(
          `${label} exceeds the ${this.maxStylesheetBytes}-byte stylesheet source budget`,
        );
      }
      return text;
    }
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > this.maxStylesheetBytes) {
          await reader.cancel();
          throw ownershipBlockingRangeError(
            `${label} exceeds the ${this.maxStylesheetBytes}-byte stylesheet source budget`,
          );
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return chunks.join("");
    } finally {
      reader.releaseLock();
    }
  }

  async _source(
    owner: StylesheetOwner,
    request: SourceRequest,
  ): Promise<Readonly<StylesheetSource>> {
    this.automaticCounters.sourceReads += 1;
    const supplied = this.stylesheetSources.get(owner);
    if (supplied !== undefined) {
      this._accountSource(request, supplied, this._ownerIdentity(owner));
      const baseUrl = isStylesheetLink(owner) ? owner.href : this.document.baseURI;
      return Object.freeze({
        text: supplied,
        baseUrl,
        sourceUrl: this._ownerIdentity(owner),
      });
    }
    if (!isStylesheetLink(owner)) {
      const text = owner.textContent ?? "";
      this._accountSource(request, text, this._ownerIdentity(owner));
      return Object.freeze({
        text,
        baseUrl: this.document.baseURI,
        sourceUrl: this._ownerIdentity(owner),
      });
    }
    const url = new URL(owner.href, this.document.baseURI);
    const controller = request.controller;
    if (!controller) throw new Error("linked stylesheet request is missing its abort controller");
    this.pendingFetches.add(controller);
    const crossOrigin = owner.crossOrigin;
    const init: RequestInit = {
      credentials: crossOrigin === "use-credentials"
        ? "include"
        : url.origin === new URL(this.document.baseURI).origin ? "same-origin" : "omit",
      mode: "cors",
      signal: controller.signal,
    };
    if (owner.integrity) init.integrity = owner.integrity;
    if (owner.referrerPolicy) init.referrerPolicy = owner.referrerPolicy as ReferrerPolicy;
    try {
      const source = await this._boundedStylesheetTask(controller, `stylesheet request ${url.href}`, async () => {
        const response = await this.document.defaultView.fetch(url.href, init);
        if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}: ${url.href}`);
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
        if (contentType !== "text/css") {
          throw new TypeError(`stylesheet response has invalid CSS MIME type ${contentType || "(missing)"}: ${url.href}`);
        }
        return Object.freeze({
          text: await this._readStylesheetResponse(response, response.url || url.href),
          baseUrl: response.url || url.href,
          sourceUrl: response.url || url.href,
        });
      }, request.deadline);
      this._accountSource(request, source.text, source.sourceUrl);
      return source;
    } finally {
      this.pendingFetches.delete(controller);
    }
  }

  _releaseImportRequests(request: SourceRequest): void {
    for (const record of request.importRecords) {
      record.consumers.delete(request);
      if (record.consumers.size > 0) continue;
      if (!record.settled) record.controller.abort();
      if (this.importRequests.get(record.key) === record) this.importRequests.delete(record.key);
    }
    request.importRecords.clear();
  }

  _importSource(
    url: string,
    owner: StylesheetOwner,
    request: SourceRequest,
  ): Promise<Readonly<StylesheetSource>> {
    const crossOrigin = isStylesheetLink(owner) ? owner.crossOrigin : null;
    const credentials = crossOrigin === "use-credentials"
      ? "include"
      : new URL(url).origin === new URL(this.document.baseURI).origin ? "same-origin" : "omit";
    const referrerPolicy = isStylesheetLink(owner) ? owner.referrerPolicy : "";
    const key = `${credentials}\n${referrerPolicy}\n${url}`;
    let record = this.importRequests.get(key);
    if (!record) {
      const controller = new this.document.defaultView.AbortController();
      const created: ImportRequestRecord = {
        consumers: new Set(),
        controller,
        key,
        promise: null,
        settled: false,
      };
      record = created;
      const init: RequestInit = { credentials, mode: "cors", signal: controller.signal };
      if (referrerPolicy) init.referrerPolicy = referrerPolicy as ReferrerPolicy;
      const task = (async () => {
        try {
          return await this._boundedStylesheetTask(controller, `@import request ${url}`, async () => {
            const response = await this.document.defaultView.fetch(url, init);
            if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}`);
            const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
            if (contentType !== "text/css") {
              throw new TypeError(`stylesheet response has invalid CSS MIME type ${contentType || "(missing)"}`);
            }
            const sourceUrl = response.url || url;
            return Object.freeze({
              text: await this._readStylesheetResponse(response, sourceUrl),
              baseUrl: sourceUrl,
              sourceUrl,
            });
          });
        } catch (error) {
          if (ownershipBlockingError(error)) throw error;
          const message = error instanceof Error ? error.message : String(error);
          const failure = new Error(`@import ${url} failed: ${message}`, { cause: error }) as DiagnosticError;
          Object.defineProperty(failure, "cornerfillImportLoadFailure", { value: true });
          throw failure;
        } finally {
          created.settled = true;
          if (created.consumers.size === 0 && this.importRequests.get(key) === created) {
            this.importRequests.delete(key);
          }
        }
      })();
      created.promise = task;
      this.importRequests.set(key, created);
    }
    record.consumers.add(request);
    request.importRecords.add(record);
    if (!record.promise) throw new Error("stylesheet import request did not start");
    return this._withinSourceDeadline(request, `@import request ${url}`, record.promise)
      .catch((error: unknown) => {
        if (importLoadFailure(error) || ownershipBlockingError(error)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        const failure = new Error(`@import ${url} failed: ${message}`, { cause: error }) as DiagnosticError;
        Object.defineProperty(failure, "cornerfillImportLoadFailure", { value: true });
        throw failure;
      })
      .then((source) => {
        this._accountSource(request, source.text, source.sourceUrl);
        return source;
      });
  }

  async _compileSourceTree(
    source: Readonly<StylesheetSource>,
    owner: StylesheetOwner,
    request: SourceRequest,
    stack: readonly string[] = [],
    strictShapeSupports = false,
  ): Promise<Readonly<CompiledSourceTree>> {
    const identity = source.sourceUrl || source.baseUrl;
    if (stack.includes(identity)) {
      throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...stack, identity].join(" -> ")}`);
    }
    const nextStack = [...stack, identity];
    if (nextStack.length > this.maxImportDepth + 1) {
      throw ownershipBlockingRangeError(
        `${identity} exceeds the maximum @import depth of ${this.maxImportDepth}`,
      );
    }
    request.provenance.add(identity);
    const split = leadingImportStatements(source.text);
    request.imports += split.imports.length;
    if (request.imports > this.maxImportCount) {
      throw ownershipBlockingRangeError(
        `${identity} exceeds the maximum @import count of ${this.maxImportCount}`,
      );
    }
    const importTasks = split.imports.map(async (statement) => {
      let imported: Readonly<ParsedImport>;
      try {
        imported = parseImportStatement(statement.prelude, source.baseUrl);
      } catch (error) {
        throw annotateDiagnostic(error, { source: identity, declaration: statement.prelude });
      }
      if (nextStack.includes(imported.url)) {
        throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...nextStack, imported.url].join(" -> ")}`);
      }
      request.provenance.add(imported.url);
      const importedStrictShapeSupports = strictShapeSupports || Boolean(
        imported.supports && /\bcorner-(?:[\w-]*-)?shape\b/iu.test(imported.supports),
      );
      const importCacheKey = `${imported.url}\n${importedStrictShapeSupports ? "strict" : "normal"}`;
      let compiledPromise = request.importCache.get(importCacheKey);
      if (!compiledPromise) {
        compiledPromise = (async () => {
          const importedSource = await this._importSource(imported.url, owner, request);
          return this._compileSourceTree(
            importedSource,
            owner,
            request,
            nextStack,
            importedStrictShapeSupports,
          );
        })();
        request.importCache.set(importCacheKey, compiledPromise);
      }
      let compiled: Readonly<CompiledSourceTree>;
      try {
        compiled = await compiledPromise;
      } catch (error) {
        if (this.destroyed || request.aborted || !importLoadFailure(error)) throw error;
        const diagnostic = annotateDiagnostic(error, {
          source: imported.url,
          declaration: statement.prelude,
        });
        if (this.unreadableStylesheetPolicy === "block-root") throw diagnostic;
        this._recordError(diagnostic, `@import ${imported.url}`, {
          bucket: owner,
          ownerIdentity: this._ownerIdentity(owner),
          source: imported.url,
          declaration: statement.prelude,
        });
        return Object.freeze({
          failedImports: 1,
          part: Object.freeze({
            css: imported.layer ? wrapImportedCarrierCss("", imported) : "",
            selectors: Object.freeze([]),
            selectorRecords: Object.freeze([]),
            observation: selectorObservation([]),
            mediaQueries: Object.freeze(imported.media ? [imported.media] : []),
          }),
        });
      }
      return Object.freeze({
        failedImports: compiled.failedImports,
        part: Object.freeze({
          ...compiled,
          css: wrapImportedCarrierCss(compiled.css, imported),
          mediaQueries: Object.freeze([
            ...compiled.mediaQueries,
            ...(imported.media ? [imported.media] : []),
          ]),
        }),
      });
    });
    let local: Readonly<CarrierCompilation>;
    try {
      local = parseCarrierSheet(
        this.document,
        split.local,
        source.baseUrl,
        this.nonce,
        identity,
        strictShapeSupports,
      );
    } catch (error) {
      throw annotateDiagnostic(error, { source: identity });
    }
    const importedParts = await Promise.all(importTasks);
    const parts: CarrierCompilation[] = importedParts.map(({ part }) => part);
    parts.push(local);
    const selectors = Object.freeze([...new Set(parts.flatMap((part) => part.selectors))]);
    const selectorRecords = Object.freeze([...new Map(parts
      .flatMap((part) => part.selectorRecords)
      .map((record) => [`${record.source}\n${record.selector}\n${record.declaration ?? ""}`, record]))
      .values()]);
    if (selectorRecords.length > this.maxCompiledSelectors) {
      throw ownershipBlockingRangeError(
        `${identity} exceeds the maximum compiled selector count of ${this.maxCompiledSelectors}`,
      );
    }
    return Object.freeze({
      css: parts.map((part) => part.css).join(""),
      selectors,
      selectorRecords,
      observation: mergeSelectorObservation(parts.map((part) => part.observation)),
      mediaQueries: Object.freeze([...new Set(parts.flatMap((part) => part.mediaQueries))].sort()),
      sources: Object.freeze([...request.provenance]),
      failedImports: importedParts.reduce((total, part) => total + part.failedImports, 0),
      imports: split.imports.length,
    });
  }

  _waitForLinkedStylesheet(owner: StylesheetOwner, request: SourceRequest): Promise<void> {
    if (!isStylesheetLink(owner) || this.stylesheetSources.has(owner)) return Promise.resolve();
    try {
      if (owner.sheet?.href === owner.href) return Promise.resolve();
    } catch {
      // A cross-origin sheet can hide cssRules while still exposing load/error.
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        owner.removeEventListener("load", loaded);
        owner.removeEventListener("error", failed);
        this.document.defaultView.clearTimeout(timer);
        this.pendingStylesheetWaits.delete(cancel);
        if (request.cancelWait === cancel) request.cancelWait = null;
      };
      const finish = (error: Error | null = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const loaded = () => finish();
      const failed = () => finish(new Error(`browser stylesheet load failed: ${owner.href}`));
      const cancel = () => finish();
      request.cancelWait = cancel;
      const timer = this.document.defaultView.setTimeout(() => finish(
        new Error(
          `browser stylesheet load exceeded the ${this.stylesheetTimeoutMs}ms source deadline: ${owner.href}`,
        ),
      ), Math.max(0, request.deadline - Date.now()));
      owner.addEventListener("load", loaded, { once: true });
      owner.addEventListener("error", failed, { once: true });
      this.pendingStylesheetWaits.add(cancel);
      queueMicrotask(() => {
        try {
          if (owner.sheet?.href === owner.href) finish();
        } catch {
          // Wait for the bounded load/error path.
        }
      });
    });
  }

  _writeStylesheetRecord(
    owner: StylesheetOwner,
    compiled: Readonly<CarrierCompilation>,
    {
    key = this._stylesheetKey(owner),
    existing = this.stylesheets.get(owner),
    cssomHook = existing?.cssomHook ?? null,
    }: Readonly<WriteStylesheetOptions> = {},
  ): Readonly<StylesheetRecord> {
    let companion = existing?.companion ?? null;
    if (compiled.css) {
      companion ??= this.document.createElement("style");
      companion.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "");
      const nonce = nonceValue(owner) || this.nonce;
      if (nonce) companion.setAttribute("nonce", nonce);
      else companion.removeAttribute("nonce");
      companion.media = stylesheetMedia(owner);
      companion.textContent = compiled.css;
      if (!companion.isConnected) owner.after(companion);
      try {
        assertGeneratedStyleActive(companion, "Cornerfill generated carrier stylesheet");
      } catch (error) {
        companion.remove();
        throw error;
      }
    } else {
      companion?.remove();
      companion = null;
    }
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner,
      companion,
      key,
      failed: (compiled.failedImports ?? 0) > 0,
      media: stylesheetMedia(owner),
      selectors: compiled.selectors,
      selectorRecords: compiled.selectorRecords ?? Object.freeze([]),
      observation: compiled.observation,
      ownershipBlocking: false,
      mediaQueries: Object.freeze([
        ...new Set([stylesheetMedia(owner), ...(compiled.mediaQueries ?? [])].filter(Boolean)),
      ].sort()),
      sources: compiled.sources ?? Object.freeze([key]),
      imports: compiled.imports ?? 0,
      cssomHook,
    });
    this.stylesheets.set(owner, record);
    return record;
  }

  _writeFailedStylesheetRecord(
    owner: StylesheetOwner,
    key: string,
    cssomHook: CssomHook | null = null,
    error: unknown = null,
    sourceUnavailable = false,
  ): Readonly<StylesheetRecord> {
    const existing = this.stylesheets.get(owner);
    existing?.companion?.remove();
    if (existing?.cssomHook && existing.cssomHook !== cssomHook) existing.cssomHook.restore();
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner,
      companion: null,
      key,
      failed: true,
      media: stylesheetMedia(owner),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      observation: selectorObservation([]),
      ownershipBlocking: ownershipBlockingError(error)
        || (sourceUnavailable && this.unreadableStylesheetPolicy === "block-root"),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([key]),
      imports: 0,
      cssomHook,
    });
    this.stylesheets.set(owner, record);
    this._configureObservation();
    return record;
  }

  _adoptedStylesheetIdentity(sheet: CSSStyleSheet): string {
    let identity = this.adoptedStylesheetIds.get(sheet);
    if (!identity) {
      identity = `adopted stylesheet ${this.nextAdoptedStylesheetId}`;
      this.nextAdoptedStylesheetId += 1;
      this.adoptedStylesheetIds.set(sheet, identity);
    }
    return identity;
  }

  _writeAdoptedStylesheetRecord(
    sheet: CSSStyleSheet,
    compiled: Readonly<CarrierCompilation>,
    { key, identity, media }: Readonly<{ identity: string; key: string; media: string }>,
  ): Readonly<StylesheetRecord> {
    const existing = this.adoptedStylesheets.get(sheet);
    let companion = existing?.companion ?? null;
    if (compiled.css && !sheet.disabled) {
      companion ??= this.document.createElement("style");
      companion.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "adopted");
      if (this.nonce) companion.setAttribute("nonce", this.nonce);
      companion.media = media;
      companion.textContent = compiled.css;
      if (!companion.isConnected) {
        if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
        else this.root.append(companion);
      }
      try {
        assertGeneratedStyleActive(companion, "Cornerfill generated adopted stylesheet");
      } catch (error) {
        companion.remove();
        throw error;
      }
    } else {
      companion?.remove();
      companion = null;
    }
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner: sheet,
      adopted: true,
      companion,
      key,
      failed: false,
      identity,
      media,
      selectors: sheet.disabled ? Object.freeze([]) : compiled.selectors,
      selectorRecords: sheet.disabled ? Object.freeze([]) : compiled.selectorRecords,
      observation: sheet.disabled ? selectorObservation([]) : compiled.observation,
      ownershipBlocking: false,
      mediaQueries: sheet.disabled
        ? Object.freeze([])
        : Object.freeze([...new Set([media, ...(compiled.mediaQueries ?? [])].filter(Boolean))].sort()),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.adoptedStylesheets.set(sheet, record);
    return record;
  }

  _writeFailedAdoptedStylesheetRecord(
    sheet: CSSStyleSheet,
    identity: string,
    key = identity,
    error: unknown = null,
    sourceUnavailable = false,
  ): Readonly<StylesheetRecord> {
    this.adoptedStylesheets.get(sheet)?.companion?.remove();
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner: sheet,
      adopted: true,
      companion: null,
      key,
      failed: true,
      identity,
      media: adoptedStylesheetMedia(sheet),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      observation: selectorObservation([]),
      ownershipBlocking: ownershipBlockingError(error)
        || (sourceUnavailable && this.unreadableStylesheetPolicy === "block-root"),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.adoptedStylesheets.set(sheet, record);
    this._configureObservation();
    return record;
  }

  _processAdoptedStylesheet(sheet: CSSStyleSheet, retryFailed = false): void {
    if (this.destroyed) return;
    const existing = this.adoptedStylesheets.get(sheet);
    const identity = existing?.identity ?? this._adoptedStylesheetIdentity(sheet);
    let source: string;
    let media: string;
    try {
      source = this.adoptedStylesheetSources.get(sheet) ?? adoptedStylesheetSource(sheet);
      media = adoptedStylesheetMedia(sheet);
      this.automaticCounters.sourceReads += 1;
      if (new TextEncoder().encode(source).byteLength > this.maxStylesheetBytes) {
        throw ownershipBlockingRangeError(
          `${identity} exceeds the ${this.maxStylesheetBytes}-byte stylesheet source budget`,
        );
      }
    } catch (error) {
      this._clearErrors(sheet);
      this._recordError(error, identity, { bucket: sheet, ownerIdentity: identity });
      this._writeFailedAdoptedStylesheetRecord(sheet, identity, identity, error, true);
      return;
    }
    const key = `${identity}\n${sheet.disabled ? "disabled" : "enabled"}\n${media}\n${source}`;
    if (existing?.failed && !retryFailed && existing.key === key) return;
    if (existing?.key === key) return;
    this._clearErrors(sheet);
    if (sheet.disabled) {
      this._writeAdoptedStylesheetRecord(sheet, Object.freeze({
        css: "",
        selectors: Object.freeze([]),
        selectorRecords: Object.freeze([]),
        observation: selectorObservation([]),
        mediaQueries: Object.freeze([]),
      }), { identity, key, media });
      return;
    }
    try {
      const compiled = parseCarrierSheet(
        this.document,
        source,
        this.document.baseURI,
        this.nonce,
        identity,
      );
      if (compiled.selectorRecords.length > this.maxCompiledSelectors) {
        throw ownershipBlockingRangeError(
          `${identity} exceeds the maximum compiled selector count of ${this.maxCompiledSelectors}`,
        );
      }
      this.automaticCounters.sourceCompiles += 1;
      this._writeAdoptedStylesheetRecord(sheet, compiled, { identity, key, media });
    } catch (error) {
      this._recordError(error, identity, { bucket: sheet, ownerIdentity: identity });
      this._writeFailedAdoptedStylesheetRecord(sheet, identity, key, error);
    }
  }

  _discoverAdoptedStylesheets(retryFailed = false): void {
    if (this.destroyed || !this.includeAdoptedStyleSheets) return;
    this._clearErrors(this.adoptedStylesheets);
    let sheets: CSSStyleSheet[];
    try {
      sheets = [...this.root.adoptedStyleSheets];
    } catch (error) {
      this._recordError(error, "adopted stylesheets", {
        bucket: this.adoptedStylesheets,
        ownerIdentity: "adopted stylesheets",
      });
      return;
    }
    const active = new Set(sheets);
    for (const [sheet, record] of this.adoptedStylesheets) {
      if (active.has(sheet)) continue;
      record.companion?.remove();
      this.adoptedStylesheets.delete(sheet);
      this._clearErrors(sheet);
    }
    for (const sheet of sheets) this._processAdoptedStylesheet(sheet, retryFailed);
    for (const sheet of sheets) {
      const companion = this.adoptedStylesheets.get(sheet)?.companion;
      if (!companion) continue;
      if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
      else this.root.append(companion);
    }
  }

  _syncStylesheetStateObservers(): void {
    if (!this.autoObserve || this.destroyed) return;
    const targets = new Set<object>();
    for (const owner of stylesheetSourceElements(this.root)) {
      targets.add(owner);
      if (owner.sheet) targets.add(owner.sheet);
    }
    if (this.includeAdoptedStyleSheets) {
      try {
        for (const sheet of this.root.adoptedStyleSheets) targets.add(sheet);
      } catch {
        // Source discovery records the readable adoptedStyleSheets failure.
      }
    }
    for (const [target, release] of this.stylesheetStateObservers) {
      if (targets.has(target)) continue;
      release();
      this.stylesheetStateObservers.delete(target);
    }
    for (const target of targets) {
      if (this.stylesheetStateObservers.has(target)) continue;
      const release = observeDisabledState(this.document.defaultView, target, () => (
        this._queueRefresh({ sources: true, candidates: true, attachments: true })
      ));
      if (release) this.stylesheetStateObservers.set(target, release);
    }
  }

  _createCssomHook(
    owner: StylesheetOwner,
    source: string,
    baseUrl: string,
  ): CssomHook | null {
    const sheet = owner.sheet;
    if (!sheet?.insertRule || !sheet?.deleteRule) return null;
    let hook: CssomHook;
    let release: (() => void) | null = null;
    hook = {
      active: true,
      baseUrl,
      modelSource: canonicalizeCornerShapeDeclarations(source),
      owner,
      sheet,
      restore: () => {
        if (!hook.active) return;
        hook.active = false;
        release?.();
        release = null;
      },
    };
    const applyMutation = (mutation: Readonly<CssomMutation>): void => {
      if (!hook.active || this.destroyed || this.stylesheets.get(owner)?.cssomHook !== hook) return;
      this._clearErrors(owner);
      try {
        hook.modelSource = mutateStylesheetModel(this.document, hook.modelSource, mutation, this.nonce);
        const compiled = parseCarrierSheet(
          this.document,
          hook.modelSource,
          hook.baseUrl,
          this.nonce,
          this._ownerIdentity(owner),
        );
        this.automaticCounters.sourceCompiles += 1;
        this._writeStylesheetRecord(owner, compiled, { cssomHook: hook });
        this._configureObservation();
        this._queueRefresh({ candidates: true, attachments: true });
      } catch (error) {
        this._recordError(error, isStylesheetLink(owner) ? owner.href : "inline stylesheet CSSOM mutation", {
          bucket: owner,
          ownerIdentity: this._ownerIdentity(owner),
        });
        this._writeFailedStylesheetRecord(owner, this._stylesheetKey(owner), hook, error);
        this._queueRefresh({ candidates: true, attachments: true });
      }
    };
    release = observeStylesheetMutations(
      this.document.defaultView,
      sheet,
      (mutation) => applyMutation(mutation as Readonly<CssomMutation>),
    );
    return release ? hook : null;
  }

  _abortSourceRequest(owner: StylesheetOwner): void {
    const request = this.sourceRequests.get(owner);
    if (!request) return;
    request.aborted = true;
    request.controller?.abort();
    request.cancelWait?.();
    this._releaseImportRequests(request);
    this.sourceRequests.delete(owner);
  }

  _abortObsoleteSourceRequests(): void {
    for (const [owner, request] of this.sourceRequests) {
      if (!stylesheetElementIsEligible(owner) || this._stylesheetKey(owner) !== request.key) {
        this._abortSourceRequest(owner);
      }
    }
  }

  _processStylesheet(owner: StylesheetOwner, retryFailed = false): Promise<void> | undefined {
    if (this.destroyed) return;
    if (!stylesheetElementIsEligible(owner)) {
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      const previous = this.stylesheets.get(owner);
      previous?.companion?.remove();
      previous?.cssomHook?.restore();
      this.stylesheets.delete(owner);
      return Promise.resolve();
    }
    const key = this._stylesheetKey(owner);
    const existing = this.stylesheets.get(owner);
    if (existing?.key === key && (!existing.failed || !retryFailed)) return;
    const active = this.sourceRequests.get(owner);
    if (active?.key === key) return active.promise ?? undefined;
    if (active) this._abortSourceRequest(owner);
    this._clearErrors(owner);
    if (existing?.key !== key) {
      existing?.companion?.remove();
      existing?.cssomHook?.restore();
      this.stylesheets.delete(owner);
    }
    const request: SourceRequest = {
      aborted: false,
      bytes: 0,
      cancelWait: null,
      controller: isStylesheetLink(owner)
        ? new this.document.defaultView.AbortController()
        : null,
      deadline: Date.now() + this.stylesheetTimeoutMs,
      importCache: new Map(),
      imports: 0,
      importRecords: new Set(),
      key,
      promise: null,
      provenance: new Set(),
    };
    const task = this._runStylesheetRequest(owner, key, existing, request).finally(() => {
      this._releaseImportRequests(request);
      if (this.sourceRequests.get(owner) === request) this.sourceRequests.delete(owner);
    });
    request.promise = task;
    this.sourceRequests.set(owner, request);
    return task;
  }

  async _runStylesheetRequest(
    owner: StylesheetOwner,
    key: string,
    existing: Readonly<StylesheetRecord> | undefined,
    request: SourceRequest,
  ): Promise<void> {
    let source: Readonly<StylesheetSource>;
    try {
      [source] = await Promise.all([
        this._source(owner, request),
        this._waitForLinkedStylesheet(owner, request),
      ]);
    } catch (error) {
      request.controller?.abort();
      request.cancelWait?.();
      if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
        || !stylesheetElementIsEligible(owner) || this._stylesheetKey(owner) !== key) return;
      const ownerIdentity = isStylesheetLink(owner) ? owner.href : this._ownerIdentity(owner);
      this._recordError(error, ownerIdentity || "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: ownerIdentity || this._ownerIdentity(owner),
      });
      this._writeFailedStylesheetRecord(owner, key, null, error, true);
      return;
    }
    if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
      || !stylesheetElementIsEligible(owner) || this._stylesheetKey(owner) !== key) return;
    let compiled: Readonly<CompiledSourceTree>;
    try {
      compiled = await this._compileSourceTree(source, owner, request);
      this.automaticCounters.sourceCompiles += 1;
    } catch (error) {
      if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
        || !stylesheetElementIsEligible(owner) || this._stylesheetKey(owner) !== key) return;
      this._recordError(error, isStylesheetLink(owner) ? owner.href : "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: (error instanceof Error
          ? (error as DiagnosticError).cornerfillDiagnostic?.source
          : undefined) ?? source.sourceUrl,
      });
      this._writeFailedStylesheetRecord(owner, key, null, error, importLoadFailure(error));
      return;
    }
    if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
      || !stylesheetElementIsEligible(owner) || this._stylesheetKey(owner) !== key) return;
    let cssomHook: CssomHook | null = null;
    try {
      this.stylesheets.get(owner)?.cssomHook?.restore();
      cssomHook = compiled.imports > 0
        ? null
        : this._createCssomHook(owner, source.text, source.baseUrl);
      this._writeStylesheetRecord(owner, compiled, { key, existing, cssomHook });
    } catch (error) {
      cssomHook?.restore();
      this._recordError(error, isStylesheetLink(owner) ? owner.href : "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: source.sourceUrl,
      });
      this._writeFailedStylesheetRecord(owner, key, null, error, true);
      return;
    }
    this._configureObservation();
  }

  _processInline(element: Element, stylesheetCandidate = false): void {
    if (this.destroyed) return;
    if (!(element instanceof this.document.defaultView.HTMLElement)) return;
    const existing = this.inline.get(element);
    const currentAttribute = element.getAttribute("style") ?? "";
    if (existing?.appliedAttribute === currentAttribute) return;
    if (existing) {
      this._restoreInlineRecord(element, existing);
      this.inline.delete(element);
    }
    // Keep the exact bytes observed before touching CSSStyleDeclaration. WebKit
    // can drop the unsupported native declaration while we restore carriers.
    const authoredAttribute = currentAttribute;
    const compiled = inlineCarrierRecords(this.document, authoredAttribute);
    if (!compiled.shape && !stylesheetCandidate) {
      return;
    }
    if (compiled.declarations.length === 0) return;
    const declarations = compiled.declarations.map((declaration) => Object.freeze({
      ...declaration,
      previousValue: element.style.getPropertyValue(declaration.property),
      previousPriority: element.style.getPropertyPriority(declaration.property),
    }));
    for (const declaration of declarations) {
      element.style.setProperty(declaration.property, declaration.value, declaration.priority);
    }
    const record: Readonly<InlineRecord> = Object.freeze({
      declarations: Object.freeze(declarations),
      shape: compiled.shape,
      signature: compiled.signature,
      authoredShape: compiled.authoredShape || existing?.authoredShape || "",
      appliedAttribute: "",
    });
    this._restoreAuthoredInlineShape(element, record);
    this.inline.set(element, Object.freeze({
      ...record,
      appliedAttribute: element.getAttribute("style") ?? "",
    }));
  }

  _restoreInlineRecord(element: HTMLElement, record: Readonly<InlineRecord>): void {
    for (const declaration of record.declarations) {
      const currentValue = element.style.getPropertyValue(declaration.property);
      const currentPriority = element.style.getPropertyPriority(declaration.property);
      if (currentValue !== declaration.value || currentPriority !== declaration.priority) continue;
      element.style.removeProperty(declaration.property);
      if (declaration.previousValue) {
        element.style.setProperty(
          declaration.property,
          declaration.previousValue,
          declaration.previousPriority,
        );
      }
    }
  }

  _restoreAuthoredInlineShape(element: HTMLElement, record: Readonly<InlineRecord>): void {
    if (!record.authoredShape) return;
    const authored: string[] = [];
    canonicalizeCornerShapeDeclarations(
      element.getAttribute("style") ?? "",
      authored,
      "declarations",
    );
    if (authored.length > 0) return;
    const current = element.getAttribute("style") ?? "";
    const separator = !current.trim() || current.trim().endsWith(";") ? "" : ";";
    element.setAttribute("style", `${current}${separator}${record.authoredShape}`);
  }

  *_styleRecords(): Generator<Readonly<StylesheetRecord>, void, unknown> {
    yield* this.stylesheets.values();
    yield* this.adoptedStylesheets.values();
  }

  _stylesheetCandidates(): Set<Element> {
    const candidates = new Set<Element>();
    this.candidateProvenance.clear();
    const recordsBySelector = new Map<string, {
      readonly owner: DiagnosticOwner;
      readonly ownerIdentity: string;
      readonly record: Readonly<SelectorRecord>;
    }[]>();
    for (const record of this._styleRecords()) {
      const selectorRecords = record.selectorRecords.length > 0
        ? record.selectorRecords
        : record.selectors.map((selector) => Object.freeze({
          source: record.sources[0] ?? record.key,
          selector,
          declaration: null,
        }));
      for (const selectorRecord of selectorRecords) {
        const grouped = recordsBySelector.get(selectorRecord.selector);
        const groupedRecord = {
          owner: record.owner,
          ownerIdentity: record.sources[0] ?? record.key,
          record: selectorRecord,
        };
        if (grouped) grouped.push(groupedRecord);
        else recordsBySelector.set(selectorRecord.selector, [groupedRecord]);
      }
    }
    for (const [selector, groupedRecords] of recordsBySelector) {
      try {
        for (const element of this.root.querySelectorAll(selector)) {
          candidates.add(element);
          let provenance = this.candidateProvenance.get(element);
          if (!provenance) {
            provenance = [];
            this.candidateProvenance.set(element, provenance);
          }
          for (const { record: selectorRecord } of groupedRecords) {
            if (!provenance.some((candidate) => (
              candidate.source === selectorRecord.source
              && candidate.selector === selectorRecord.selector
              && candidate.declaration === selectorRecord.declaration
            ))) provenance.push(selectorRecord);
          }
        }
      } catch (error) {
        for (const { owner, ownerIdentity, record: selectorRecord } of groupedRecords) {
          this._recordError(error, `selector ${selector}`, {
            bucket: owner,
            ownerIdentity,
            source: selectorRecord.source,
            selector,
            declaration: selectorRecord.declaration,
          });
        }
      }
    }
    return candidates;
  }

  async _discoverSources(retryFailed = false): Promise<void> {
    if (this.destroyed) return;
    this.automaticCounters.sourcePasses += 1;
    this._syncStylesheetStateObservers();
    const owners = stylesheetElements(this.root);
    const activeOwners = new Set(owners);
    for (const [owner, record] of this.stylesheets) {
      if (activeOwners.has(owner)) continue;
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      record.companion?.remove();
      record.cssomHook?.restore();
      this.stylesheets.delete(owner);
    }
    await Promise.all(owners.map((owner) => this._processStylesheet(owner, retryFailed)));
    if (this.destroyed) return;
    for (const owner of owners) {
      const companion = this.stylesheets.get(owner)?.companion;
      if (companion && owner.nextSibling !== companion) owner.after(companion);
    }
    this._discoverAdoptedStylesheets(retryFailed);
    if (this.destroyed) return;
    this._syncStylesheetStateObservers();
    this._configureObservation();
  }

  _reconcileCandidates(): boolean {
    if (this.destroyed) return false;
    this.automaticCounters.candidatePasses += 1;
    for (const [element, record] of this.inline) {
      if (element.isConnected) continue;
      this._restoreInlineRecord(element, record);
      this._restoreAuthoredInlineShape(element, record);
      this.inline.delete(element);
      this._clearErrors(element);
    }
    if ([...this._styleRecords()].some((record) => record.ownershipBlocking)) {
      this.candidateProvenance.clear();
      this.candidates = new Set();
      return true;
    }
    const stylesheetCandidates = this._stylesheetCandidates();
    const inlineCandidates = new Set<Element>([
      ...this.inline.keys(),
      ...authoredShapeInlineElements(this.root),
      ...[...stylesheetCandidates].filter((element) => element.hasAttribute("style")),
    ]);
    for (const element of inlineCandidates) {
      if (this.destroyed) return false;
      this._processInline(element, stylesheetCandidates.has(element));
    }
    const candidates = new Set<Element>([...this.inline]
      .filter(([, record]) => record.shape)
      .map(([element]) => element));
    for (const element of stylesheetCandidates) candidates.add(element);
    for (const element of this.candidates) {
      if (!candidates.has(element)) this._clearErrors(element);
    }
    const changed = candidates.size !== this.candidates.size
      || [...candidates].some((element) => !this.candidates.has(element));
    this.candidates = candidates;
    return changed;
  }

  async _refreshAttachments(): Promise<void> {
    if (this.native || this.destroyed) return;
    this.automaticCounters.attachmentPasses += 1;
    const candidates = this.candidates;
    const ready: Promise<unknown>[] = [];
    for (const [element, handle] of [...this.handles]) {
      let failure: unknown = null;
      if (candidates.has(element) && element.isConnected) {
        this.automaticCounters.computedChecks += 1;
        try {
          const inspection = this.controller.inspectAuthoredStyle(
            element,
            AUTOMATIC_SIGNATURE_PROPERTIES,
          );
          const problem = carrierProblem(inspection);
          if (problem) failure = new TypeError(problem);
          else if (hasShapeCarrier(inspection) && inspection.requiresFallback) {
            this._clearErrors(element);
            const signature = automaticComputedSignature(inspection);
            if (this.handleSignatures.get(element) === signature) {
              try {
                handle.verify();
              } catch (error) {
                this._recordElementError(error, element);
                handle.dispose();
                this.handles.delete(element);
                this.handleSignatures.delete(element);
              }
              continue;
            }
            this.handleSignatures.set(element, signature);
            this.automaticCounters.handleRefreshes += 1;
            ready.push(handle.refresh().catch((error) => {
              this._recordElementError(error, element);
              handle.dispose();
              this.handles.delete(element);
              this.handleSignatures.delete(element);
            }));
            continue;
          }
        } catch (error) {
          failure = error;
        }
      }
      if (failure) this._recordElementError(failure, element);
      else this._clearErrors(element);
      handle.dispose();
      this.automaticCounters.handleDetaches += 1;
      this.handles.delete(element);
      this.handleSignatures.delete(element);
    }
    for (const element of candidates) {
      if (!(element instanceof this.document.defaultView.HTMLElement) || !element.isConnected) {
        this._clearErrors(element);
        continue;
      }
      if (this.handles.has(element)) continue;
      this.automaticCounters.computedChecks += 1;
      try {
        const inspection = this.controller.inspectAuthoredStyle(
          element,
          AUTOMATIC_SIGNATURE_PROPERTIES,
        );
        const problem = carrierProblem(inspection);
        if (problem) {
          this._recordElementError(new TypeError(problem), element);
          continue;
        }
        this._clearErrors(element);
        if (!hasShapeCarrier(inspection) || !inspection.requiresFallback) continue;
        const handle = this.controller.attach(element);
        this.automaticCounters.handleAttaches += 1;
        this.handles.set(element, handle);
        this.handleSignatures.set(element, automaticComputedSignature(inspection));
        ready.push(handle.ready.catch((error) => {
          this._recordElementError(error, element);
          handle.dispose();
          this.handles.delete(element);
          this.handleSignatures.delete(element);
        }));
      } catch (error) {
        this._recordElementError(error, element);
      }
    }
    await Promise.all(ready);
  }

  _observationDependencies(): Readonly<ObservationState> {
    const attributes = new Set<string>(SOURCE_ATTRIBUTE_NAMES);
    const events = new Set<string>();
    const mediaQueries = new Set<string>();
    const unobservableStates = new Set<string>();
    let characterData = false;
    let conservative = false;
    let hasSelectors = false;
    for (const record of this._styleRecords()) {
      if (record.selectors.length > 0) hasSelectors = true;
      for (const attribute of record.observation.attributes) attributes.add(attribute);
      for (const event of record.observation.events) events.add(event);
      for (const query of record.mediaQueries ?? []) mediaQueries.add(query);
      for (const state of record.observation.unobservableStates) unobservableStates.add(state);
      characterData ||= record.observation.characterData;
      conservative ||= record.observation.conservative;
    }
    if (hasSelectors || this.inline.size > 0) events.add("resize");
    return Object.freeze({
      attributes: Object.freeze([...attributes].sort()),
      characterData,
      conservative,
      events: Object.freeze([...events].sort()),
      mediaQueries: Object.freeze([...mediaQueries].sort()),
      unobservableStates: Object.freeze([...unobservableStates].sort()),
    });
  }

  _handleMutations(records: readonly MutationRecord[]): void {
    if (records.some((record) => record.type === "childList")) {
      this._refreshRegisteredRootConnections();
    }
    let sources = false;
    let relevant = false;
    const placementTargets = new Set<Element>();
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.attributeName === "data-cornerfill-owned"
          || record.attributeName === "data-cornerfill-owned-border"
          || record.attributeName === "data-cornerfill-owned-outline"
          || record.attributeName === "data-cornerfill-owned-shadow"
          || record.attributeName === "data-cornerfill-owned-surface") continue;
        const target = record.target as Element;
        if (target.localName === "style" || target.localName === "link") {
          sources = true;
          relevant = true;
          continue;
        }
        if (record.attributeName !== "style") {
          relevant = true;
          continue;
        }
        const currentStyle = target.getAttribute("style");
        if (automaticStyleMutationSignature(record.oldValue)
          !== automaticStyleMutationSignature(currentStyle)) {
          relevant = true;
          continue;
        }
        if (automaticStyleMutationSignature(record.oldValue, false)
          !== automaticStyleMutationSignature(currentStyle, false)) {
          placementTargets.add(target);
        }
        continue;
      }
      if (record.type === "characterData") {
        if (record.target.parentElement?.localName === "style") {
          sources = true;
          relevant = true;
          continue;
        }
        relevant ||= this.observationState.characterData;
        continue;
      }
      const mutationTarget = record.target as Element;
      if (mutationTarget.localName === "style") {
        sources = true;
        relevant = true;
        continue;
      }
      const nodes = [...record.addedNodes, ...record.removedNodes];
      const elements = nodes.filter((node): node is Element => (
        node.nodeType === this.document.defaultView.Node.ELEMENT_NODE
      ));
      if (elements.some((node) => (
        /^(?:style|link)$/u.test(node.localName)
        || Boolean(node.querySelector("style,link[rel~=stylesheet]"))
      ))) sources = true;
      relevant ||= elements.length > 0 || (this.observationState.characterData && nodes.length > 0);
    }
    if (!relevant && placementTargets.size > 0) {
      candidates: for (const candidate of this.candidates) {
        if (!(candidate instanceof this.document.defaultView.HTMLElement)
          || this.handles.has(candidate)) continue;
        let ancestor: Element | null = candidate;
        while (ancestor) {
          if (placementTargets.has(ancestor)) {
            relevant = true;
            break candidates;
          }
          ancestor = ancestor.parentElement;
        }
      }
    }
    if (!relevant) return;
    this._queueRefresh({ sources, candidates: true, attachments: true });
  }

  _refreshRegisteredRootConnections(): void {
    for (const scope of this.scopes.values()) {
      const connected = scope.root === this.document
        || (scope.root as ShadowRoot).host.isConnected;
      if (connected !== scope.rootConnected) {
        scope.rootConnected = connected;
        scope._queueRefresh({
          sources: connected,
          candidates: connected,
          attachments: true,
        });
      }
      scope._refreshRegisteredRootConnections();
    }
  }

  _removeObservationListeners(): void {
    for (const listener of this.eventListeners) {
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
    }
    this.eventListeners.length = 0;
    for (const { list, listener, legacy } of this.mediaListeners) {
      if (legacy) list.removeListener(listener);
      else list.removeEventListener("change", listener);
    }
    this.mediaListeners.length = 0;
  }

  _configureObservation(): void {
    if (!this.observer || !this.autoObserve) return;
    this.observationState = this._observationDependencies();
    this.observer.disconnect();
    const target = this.root === this.document ? this.document.documentElement : this.root;
    const options: MutationObserverInit = {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      subtree: true,
    };
    if (!this.observationState.conservative) {
      options.attributeFilter = [...this.observationState.attributes];
    }
    this.observer.observe(target, options);
    this._removeObservationListeners();
    const eventRoot = this.root === this.document ? this.document : this.root;
    for (const type of this.observationState.events) {
      const listener: EventListener = () => this._queueRefresh({ candidates: true, attachments: true });
      const windowEvent = ["hashchange", "popstate", "resize"].includes(type);
      const documentEvent = type === "fullscreenchange";
      const listenerTarget = (windowEvent
        ? this.document.defaultView
        : documentEvent ? this.document : eventRoot) as EventListenerTarget;
      const listenerOptions = windowEvent ? Object.freeze({ passive: true }) : true;
      listenerTarget.addEventListener(type, listener, listenerOptions);
      this.eventListeners.push(Object.freeze({
        target: listenerTarget,
        type,
        listener,
        options: listenerOptions,
      }));
    }
    for (const query of this.observationState.mediaQueries) {
      const list = this.document.defaultView.matchMedia?.(query);
      if (!list) continue;
      const listener = (_event: MediaQueryListEvent) => (
        this._queueRefresh({ candidates: true, attachments: true })
      );
      if (typeof list.addEventListener === "function") {
        list.addEventListener("change", listener);
        this.mediaListeners.push(Object.freeze({ list, listener, legacy: false }));
      } else if (typeof list.addListener === "function") {
        list.addListener(listener);
        this.mediaListeners.push(Object.freeze({ list, listener, legacy: true }));
      }
    }
  }

  _installObserver(): void {
    if (!this.autoObserve || this.observer || !this.document.defaultView.MutationObserver) return;
    this.observer = new this.document.defaultView.MutationObserver((records) => (
      this._handleMutations(records)
    ));
    this._configureObservation();
  }

  async _start(): Promise<Readonly<CornerfillAutoExplanation>> {
    if (this.destroyed || this.native) return this.explain();
    this._ensureCarrierRegistration();
    this._installObserver();
    return this.refresh();
  }

  _queueRefresh(
    { sources = false, candidates = false, attachments = true }: Readonly<RefreshRequestOptions> = {},
  ): void {
    if (this.destroyed || this.native) return;
    this.sourceRequested ||= sources;
    this.candidateRequested ||= candidates || sources;
    this.attachmentRequested ||= attachments || candidates || sources;
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    this.refreshFrame = this.document.defaultView.requestAnimationFrame(() => {
      this.refreshFrame = null;
      this.refreshQueued = false;
      this._requestRefresh().catch((error) => (
        this._recordError(error, "automatic refresh")
      ));
    });
  }

  _requestRefresh({
    sources = false,
    candidates = false,
    attachments = false,
    retryFailed = false,
  }: Readonly<RefreshRequestOptions> = {}): Promise<Readonly<CornerfillAutoExplanation>> {
    if (this.destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
    if (this.native) return Promise.resolve(this.explain());
    this.workRequested = true;
    this.sourceRequested ||= sources;
    this.candidateRequested ||= candidates || sources;
    this.attachmentRequested ||= attachments || candidates || sources;
    this.retryFailedRequested ||= retryFailed;
    if (this.sourceRequested) this._abortObsoleteSourceRequests();
    if (!this.refreshPromise) {
      const task = (async () => {
        while (this.workRequested && !this.destroyed) {
          this.workRequested = false;
          const shouldDiscover = this.sourceRequested;
          const shouldReconcile = this.candidateRequested || shouldDiscover;
          const shouldRefresh = this.attachmentRequested || shouldReconcile;
          const shouldRetryFailed = this.retryFailedRequested;
          this.sourceRequested = false;
          this.candidateRequested = false;
          this.attachmentRequested = false;
          this.retryFailedRequested = false;
          if (shouldDiscover) await this._discoverSources(shouldRetryFailed);
          if (this.destroyed) break;
          if (shouldReconcile) this._reconcileCandidates();
          if (this.destroyed) break;
          if (shouldRefresh) await this._refreshAttachments();
        }
        return this.explain();
      })();
      this.refreshPromise = task.finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  refresh(options: Readonly<{ retryFailed?: boolean | undefined }> = {}) {
    return this._requestRefresh({
      sources: true,
      candidates: true,
      attachments: true,
      retryFailed: options.retryFailed === true,
    });
  }

  refreshAdoptedStyleSheet(
    sheet: CSSStyleSheet,
    source: string,
  ): Promise<Readonly<CornerfillAutoExplanation>> {
    if (!this.includeAdoptedStyleSheets) {
      return Promise.reject(new TypeError("This automatic scope did not opt in to adopted stylesheets"));
    }
    if (!this.root.adoptedStyleSheets.includes(sheet)) {
      return Promise.reject(new TypeError("The stylesheet is not adopted by this automatic scope"));
    }
    if (typeof source !== "string") {
      return Promise.reject(new TypeError("refreshAdoptedStyleSheet() requires the exact standard CSS source"));
    }
    this.adoptedStylesheetSources.set(sheet, source);
    return this.refresh();
  }

  replaceStylesheetSource(
    stylesheet: CSSStyleSheet | HTMLLinkElement | HTMLStyleElement,
    source: string,
  ): Promise<Readonly<CornerfillAutoExplanation>> {
    if (typeof source !== "string") {
      return Promise.reject(new TypeError("replaceStylesheetSource() requires the exact standard CSS source"));
    }
    if (stylesheet instanceof this.document.defaultView.CSSStyleSheet) {
      if (this.root.adoptedStyleSheets.includes(stylesheet)) {
        return this.refreshAdoptedStyleSheet(stylesheet, source);
      }
      const owner = stylesheetElements(this.root).find((candidate) => candidate.sheet === stylesheet);
      if (!owner) {
        return Promise.reject(new TypeError("The stylesheet does not belong to this automatic scope"));
      }
      this.stylesheetSources.set(owner, source);
      return this.refresh();
    }
    if (!(stylesheet instanceof this.document.defaultView.HTMLStyleElement)
      && !(stylesheet instanceof this.document.defaultView.HTMLLinkElement)) {
      return Promise.reject(new TypeError("replaceStylesheetSource() requires a style, link, or CSSStyleSheet"));
    }
    if (stylesheet.ownerDocument !== this.document || stylesheet.getRootNode() !== this.root) {
      return Promise.reject(new TypeError("The stylesheet owner does not belong to this automatic scope"));
    }
    this.stylesheetSources.set(stylesheet, source);
    return this.refresh();
  }

  registerRoot(root: ShadowRoot, options: Readonly<RegisterRootOptions> = {}): CornerfillAutoController {
    if (this.destroyed) throw new Error("Cornerfill auto controller is destroyed");
    const ShadowRoot = this.document.defaultView.ShadowRoot;
    if (!(root instanceof ShadowRoot) || root.ownerDocument !== this.document) {
      throw new TypeError("Cornerfill automatic scopes require an open ShadowRoot in the same document");
    }
    if (root.host.shadowRoot !== root) {
      throw new TypeError("Cornerfill automatic scopes cannot register a closed ShadowRoot");
    }
    if (options.autoObserve === true && !this.autoObserve) {
      throw new TypeError("An observing shadow-root scope requires an observing parent automatic scope");
    }
    const existing = this.scopes.get(root);
    if (existing && !existing.destroyed) return existing;
    const scope = new CornerfillAutoController({
      document: this.document,
      root,
      controller: this.controller,
      parentAuto: this,
      nativeQualification: this.nativeQualification,
      nonce: options.nonce ?? this.nonce,
      autoObserve: options.autoObserve ?? this.autoObserve,
      adoptedStyleSheets: options.adoptedStyleSheets === true,
      onError: options.onError ?? this.onError ?? undefined,
      stylesheetTimeoutMs: this.stylesheetTimeoutMs,
      maxStylesheetBytes: this.maxStylesheetBytes,
      maxImportDepth: this.maxImportDepth,
      maxImportCount: this.maxImportCount,
      maxCompiledSelectors: this.maxCompiledSelectors,
      unreadableStylesheetPolicy: this.unreadableStylesheetPolicy,
    });
    this.scopes.set(root, scope);
    return scope;
  }

  unregisterRoot(root: ShadowRoot): boolean {
    const scope = this.scopes.get(root);
    if (!scope) return false;
    scope.destroy();
    return true;
  }

  explain(): Readonly<CornerfillAutoExplanation>;
  explain(element: HTMLElement): Readonly<CornerfillEntryExplanation> | null;
  explain(
    element: HTMLElement | null = null,
  ): Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null {
    if (element) return this.handles.get(element)?.explain() ?? this.controller.explain(element);
    return Object.freeze({
      schema: "cornerfill-auto@1",
      mode: this.native ? "native" : "fallback",
      fallbackLoaded: true,
      attached: this.handles.size,
      stylesheets: this.stylesheets.size + this.adoptedStylesheets.size,
      inlineElements: this.inline.size,
      scopes: this.scopes.size,
      errors: this._errors(),
      nativeQualification: this.nativeQualification,
      decision: Object.freeze({
        selected: this.native ? "native" : "fallback",
        reason: this.native
          ? "native-requirements-satisfied"
          : this.nativeQualification.qualified
            ? "fallback-forced"
            : "native-requirements-unresolved",
        unresolvedNativeRequirements: this.nativeQualification.unresolved,
      }),
      implementation: Object.freeze({
        automaticDiscovery: this.native ? "BYPASSED_NATIVE" : "IMPLEMENTED",
        fallbackRenderer: this.native ? "NOT_SELECTED" : "IMPLEMENTED",
      }),
      oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
      automatic: Object.freeze({
        ...AUTOMATIC_DISCOVERY,
        adoptedStylesheets: this.adoptedStylesheets.size,
        counters: Object.freeze({ ...this.automaticCounters }),
        observation: this.observationState,
        observing: this.autoObserve,
        sourceLimits: Object.freeze({
          deadlineMs: this.stylesheetTimeoutMs,
          maxCompiledSelectors: this.maxCompiledSelectors,
          maxImportCount: this.maxImportCount,
          maxImportDepth: this.maxImportDepth,
          maxStylesheetBytes: this.maxStylesheetBytes,
          unreadableStylesheetPolicy: this.unreadableStylesheetPolicy,
        }),
        observedSourceClassStyleStateAndViewportChanges: this.autoObserve,
      }),
      runtime: this.controller.stats(),
    }) as Readonly<CornerfillAutoExplanation>;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const scope of [...this.scopes.values()]) scope.destroy();
    this.scopes.clear();
    this.observer?.disconnect();
    this.observer = null;
    this._removeObservationListeners();
    for (const handle of this.handles.values()) handle.dispose();
    this.handles.clear();
    this.handleSignatures.clear();
    this.candidates.clear();
    this.candidateProvenance.clear();
    for (const { companion, cssomHook } of this.stylesheets.values()) {
      companion?.remove();
      cssomHook?.restore();
    }
    this.stylesheets.clear();
    for (const release of this.stylesheetStateObservers.values()) release();
    this.stylesheetStateObservers.clear();
    for (const { companion } of this.adoptedStylesheets.values()) companion?.remove();
    this.adoptedStylesheets.clear();
    for (const [element, record] of this.inline) {
      this._restoreInlineRecord(element, record);
      this._restoreAuthoredInlineShape(element, record);
    }
    this.inline.clear();
    this._releaseCarrierRegistration();
    if (this.refreshFrame !== null) this.document.defaultView.cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = null;
    for (const owner of [...this.sourceRequests.keys()]) this._abortSourceRequest(owner);
    for (const record of this.importRequests.values()) record.controller.abort();
    this.importRequests.clear();
    for (const controller of this.pendingFetches) controller.abort();
    this.pendingFetches.clear();
    for (const cancel of this.pendingStylesheetWaits) cancel();
    this.pendingStylesheetWaits.clear();
    this.diagnosticsByOwner.clear();
    if (this.parentAuto && this.root instanceof this.document.defaultView.ShadowRoot
      && this.parentAuto.scopes.get(this.root) === this) {
      this.parentAuto.scopes.delete(this.root);
    }
    if (this.ownsController) this.controller.destroy();
  }
}

export function installCornerfillAuto(
  options: Readonly<CornerfillAutoOptions> = {},
): CornerfillAutoControllerHandle {
  return new CornerfillAutoController(options);
}
