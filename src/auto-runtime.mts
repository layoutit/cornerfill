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
import {
  cssDeclarations,
  cssEscapeEnd,
  decodeCssEscapes,
  scanCssSyntax,
} from "./css-syntax.mjs";
import { planAutomaticMutations } from "./auto-observation.mjs";
import type { AutomaticMutationPlan } from "./auto-observation.mjs";
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
  carrierSupportsCondition,
  importLoadFailure,
  leadingImportStatements,
  mergeSelectorObservation,
  mutateStylesheetModel,
  normalizeSupportsCondition,
  ownershipBlockingError,
  ownershipBlockingRangeError,
  ownershipBlockingSyntaxError,
  parseCarrierSheet,
  parseImportStatement,
  selectorObservation,
  supportsConditionTestsShape,
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
  readonly rootRuleCount: number;
}

interface StylesheetSource {
  readonly baseUrl: string;
  readonly sourceUrl: string;
  readonly text: string;
}

interface StylesheetSourceOverride {
  readonly epoch: number;
  readonly generation: string;
  readonly sheet: CSSStyleSheet | null;
  readonly source: string;
}

type StylesheetLoadStatus = "failed" | "loaded" | "released";

interface StylesheetLoadWatch {
  readonly settled: Promise<StylesheetLoadStatus>;
  status: "pending" | StylesheetLoadStatus;
  readonly release: () => void;
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
  readonly carrierCss: string;
  readonly companion: HTMLStyleElement | null;
  readonly cssomHook: CssomHook | null;
  readonly failed: boolean;
  readonly hostContextTokens: readonly string[];
  readonly identity?: string | undefined;
  readonly imports: number;
  readonly key: string;
  readonly media: string;
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
  readonly ownershipBlocking: boolean;
  readonly owner: CSSStyleSheet | StylesheetOwner;
  readonly selectorRecords: readonly Readonly<SelectorRecord>[];
  readonly selectorCount: number;
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
  readonly emptyStylesheets: Set<string>;
  readonly failedStylesheets: Set<string>;
  readonly importCache: Map<string, Promise<Readonly<CompiledSourceTree>>>;
  imports: number;
  readonly importRecords: Set<ImportRequestRecord>;
  readonly key: string;
  promise: Promise<void> | null;
  readonly provenance: Set<string>;
}

interface CarrierRegistration {
  readonly nonce: string;
  references: number;
  style: HTMLStyleElement;
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

interface AutomaticAttachmentState {
  candidateProvenance: Map<Element, Readonly<SelectorRecord>[]>;
  candidates: Set<Element>;
  readonly handles: Map<HTMLElement, Readonly<CornerfillHandle>>;
  readonly inline: Map<HTMLElement, Readonly<InlineRecord>>;
}

interface SharedAutomaticHandle {
  readonly claimants: Set<CornerfillAutoController>;
  readonly handle: Readonly<CornerfillHandle>;
  pending: Promise<void> | null;
  signature: string;
}

interface AutomaticHandleRegistry {
  readonly handles: Map<HTMLElement, SharedAutomaticHandle>;
  readonly scopes: Set<CornerfillAutoController>;
}

interface AutomaticObservationRuntime {
  configurationKey: string | null;
  readonly eventListeners: EventListenerRecord[];
  readonly mediaListeners: MediaListenerRecord[];
  observer: MutationObserver | null;
  state: Readonly<ObservationState>;
}

interface AutomaticRefreshState {
  attachmentRequested: boolean;
  candidateRequested: boolean;
  frame: number | null;
  promise: Promise<Readonly<CornerfillAutoExplanation>> | null;
  queued: boolean;
  retryFailedRequested: boolean;
  sourceRequested: boolean;
  workRequested: boolean;
}

interface AutomaticSourceState {
  readonly adoptedIds: WeakMap<CSSStyleSheet, string>;
  readonly adoptedSources: WeakMap<CSSStyleSheet, string>;
  readonly adoptedStylesheets: Map<CSSStyleSheet, Readonly<StylesheetRecord>>;
  readonly importRequests: Map<string, ImportRequestRecord>;
  readonly lateStylesheetLoads: Map<StylesheetOwner, () => void>;
  nextAdoptedId: number;
  nextOwnerId: number;
  readonly ownerIds: WeakMap<object, number>;
  readonly pendingFetches: Set<AbortController>;
  readonly pendingStylesheetWaits: Set<() => void>;
  readonly requests: Map<StylesheetOwner, SourceRequest>;
  readonly stylesheetEpochs: WeakMap<StylesheetOwner, number>;
  readonly stylesheetSources: WeakMap<StylesheetOwner, Readonly<StylesheetSourceOverride>>;
  readonly stylesheetStateObservers: Map<object, () => void>;
  readonly stylesheets: Map<StylesheetOwner, Readonly<StylesheetRecord>>;
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
  readonly handleRegistry?: AutomaticHandleRegistry | undefined;
  readonly parentAuto?: CornerfillAutoController | null | undefined;
}

export interface CornerfillAutoExplanation {
  readonly attached: number;
  readonly automatic?: Readonly<{
    adoptedStylesheets: number;
    counters: CornerfillAutomaticCounters;
    elementOwnedTopLevelCssomInsertDeleteAfterInstallation: true;
    inlineStyleAttributes: true;
    limitations: readonly string[];
    observation: Readonly<ObservationState>;
    observedSourceClassStyleStateAndViewportChanges: boolean;
    observing: boolean;
    ownership: "active" | "blocked-root";
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
    reason: "fallback-forced" | "native-observable-proxy-satisfied" | "native-requirements-unresolved";
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
const CARRIER_REGISTRATIONS = new WeakMap<Document, Map<string, CarrierRegistration>>();
let nextHostContextScope = 1;

const AUTOMATIC_DISCOVERY = Object.freeze({
  readableStyleElements: true,
  sameOriginAndCorsStylesheetLinks: true,
  inlineStyleAttributes: true,
  selectorAndConditionalCascade: true,
  elementOwnedTopLevelCssomInsertDeleteAfterInstallation: true,
  limitations: Object.freeze([
    "cross-origin stylesheets without CORS",
    "unregistered or closed shadow roots",
    "adopted stylesheets unless explicitly enabled for a registered open shadow root",
    "adopted stylesheet corner-shape source unless supplied to refreshAdoptedStyleSheet()",
    "mixed physical/logical declaration families",
    "all: var(...)/env(...) results that require inherit, revert, or revert-layer cascade reconstruction",
    "corner-shape @supports blocks that also control ordinary declarations or author custom properties",
    "container-query paint dependencies",
    "@scope, anonymous cascade layers, and namespace-qualified selectors",
    "shadow host pseudos nested inside another functional selector or followed by a complex child chain",
    "corner-shape or paint changes driven by CSS animations or transitions",
    "content-driven direction changes under dir=auto across arbitrary descendant text",
    "alternate stylesheet sets",
    "corner-shape rules inserted through CSSOM before Cornerfill starts",
    "CSSOM insertRule()/deleteRule() mutations on imported child stylesheets",
    "mutations of existing CSSRule declarations, selectors, grouping rules, or media lists unless exact source is supplied to replaceStylesheetSource()",
    "one ownership-blocking source disables fallback for its registered root",
    "unsupported declarations assigned through CSSStyleDeclaration, which the browser discards",
  ]),
});

const SOURCE_ATTRIBUTE_NAMES = Object.freeze([
  "crossorigin",
  "dir",
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

const SOURCE_GENERATION_ATTRIBUTE_NAMES = new Set([
  "crossorigin",
  "href",
  "integrity",
  "referrerpolicy",
  "rel",
  "type",
]);

function selectorBranches(selector: string): readonly string[] {
  const branches: string[] = [];
  let start = 0;
  scanCssSyntax(selector, 0, (index, character, parentheses, brackets) => {
    if (character !== "," || parentheses !== 0 || brackets !== 0) return;
    branches.push(selector.slice(start, index).trim());
    start = index + 1;
  });
  branches.push(selector.slice(start).trim());
  return Object.freeze(branches);
}

function selectorPseudo(
  selector: string,
  colon: number,
): Readonly<{ end: number; name: string }> | null {
  if (selector[colon] !== ":" || selector[colon - 1] === ":" || selector[colon + 1] === ":") {
    return null;
  }
  let end = colon + 1;
  while (end < selector.length) {
    const character = selector[end]!;
    if (/[-_a-z0-9]/iu.test(character)) {
      end += 1;
      continue;
    }
    if (character !== "\\") break;
    const escapeEnd = cssEscapeEnd(selector, end);
    if (escapeEnd < 0) break;
    end = escapeEnd;
  }
  if (end === colon + 1) return null;
  return Object.freeze({
    end,
    name: decodeCssEscapes(selector.slice(colon + 1, end)).toLowerCase(),
  });
}

const SELECTOR_LIST_PSEUDOS = new Set([
  "has",
  "is",
  "not",
  "nth-child",
  "nth-last-child",
  "where",
]);

function selectorComponentCount(selector: string): number {
  let count = 1;
  const listDepths = new Set<number>();
  const listOpenings = new Set<number>();
  scanCssSyntax(selector, 0, (index, character, parentheses, brackets) => {
    if (character === ":") {
      const pseudo = selectorPseudo(selector, index);
      if (pseudo && SELECTOR_LIST_PSEUDOS.has(pseudo.name) && selector[pseudo.end] === "(") {
        listOpenings.add(pseudo.end);
      }
      return;
    }
    if (character === "(" && listOpenings.delete(index)) {
      listDepths.add(parentheses + 1);
      return;
    }
    if (character === ")") {
      listDepths.delete(parentheses);
      return;
    }
    if (character === "," && brackets === 0
      && (parentheses === 0 || listDepths.has(parentheses))) count += 1;
  });
  return count;
}

function selectorHasHostPseudo(selector: string): boolean {
  let found = false;
  scanCssSyntax(selector, 0, (index, character) => {
    if (character !== ":") return;
    const pseudo = selectorPseudo(selector, index);
    if (pseudo?.name !== "host" && pseudo?.name !== "host-context") return;
    found = true;
    return false;
  });
  return found;
}

function selectorHasCombinator(selector: string): boolean {
  let found = false;
  scanCssSyntax(selector, 0, (_index, character, parentheses, brackets) => {
    if (parentheses !== 0 || brackets !== 0) return;
    if (/\s/u.test(character) || character === ">" || character === "+" || character === "~") {
      found = true;
      return false;
    }
  });
  return found;
}

function matchingSelectorParenthesis(selector: string, start: number): number {
  let end = -1;
  scanCssSyntax(selector, start, (index, character, parentheses) => {
    if (character !== ")" || parentheses !== 1) return;
    end = index;
    return false;
  });
  return end;
}

function replaceHostContextFunctions(
  selector: string,
  replacement: (argument: string) => string,
): string {
  const replacements: { end: number; start: number; value: string }[] = [];
  let skipThrough = -1;
  scanCssSyntax(selector, 0, (index, character) => {
    if (index <= skipThrough || character !== ":") return;
    const pseudo = selectorPseudo(selector, index);
    if (pseudo?.name !== "host-context" || selector[pseudo.end] !== "(") return;
    const open = pseudo.end;
    const end = matchingSelectorParenthesis(selector, open);
    if (end < 0) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS found an unterminated shadow host selector: ${selector}`,
      );
    }
    const argument = selector.slice(open + 1, end).trim();
    if (!argument) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS requires an argument for :host-context(): ${selector}`,
      );
    }
    replacements.push({ start: index, end: end + 1, value: replacement(argument) });
    skipThrough = end;
  });
  if (replacements.length === 0) return selector;
  let output = "";
  let cursor = 0;
  for (const item of replacements) {
    output += selector.slice(cursor, item.start) + item.value;
    cursor = item.end;
  }
  return output + selector.slice(cursor);
}

function shadowIncludingContextMatches(host: Element, selector: string): boolean {
  let element: Element | null = host;
  while (element) {
    try {
      if (element.matches(selector)) return true;
    } catch {
      return false;
    }
    if (element.parentElement) {
      element = element.parentElement;
      continue;
    }
    const root = element.getRootNode() as Node & Readonly<{ host?: Element | undefined }>;
    element = root.host ?? null;
  }
  return false;
}

function validHostContextArgument(host: Element, argument: string): boolean {
  if (!argument || selectorBranches(argument).length !== 1 || selectorHasCombinator(argument)) {
    return false;
  }
  try {
    host.matches(argument);
    return true;
  } catch {
    return false;
  }
}

function shadowSelectorMatches(root: ShadowRoot, selector: string): readonly Element[] {
  if (!selectorHasHostPseudo(selector)) return [...root.querySelectorAll(selector)];
  const source = selector.trim();
  const pseudo = selectorPseudo(source, 0);
  if (pseudo?.name !== "host" && pseudo?.name !== "host-context") {
    throw ownershipBlockingSyntaxError(`Automatic CSS cannot discover this shadow host selector: ${selector}`);
  }
  const context = pseudo.name === "host-context";
  let cursor = pseudo.end;
  let argument = "";
  if (source[cursor] === "(") {
    const end = matchingSelectorParenthesis(source, cursor);
    if (end < 0) {
      throw ownershipBlockingSyntaxError(`Automatic CSS found an unterminated shadow host selector: ${selector}`);
    }
    argument = source.slice(cursor + 1, end).trim();
    cursor = end + 1;
  } else if (context) {
    throw ownershipBlockingSyntaxError(`Automatic CSS requires an argument for :host-context(): ${selector}`);
  }
  const rest = source.slice(cursor);
  let boundary = rest.length;
  scanCssSyntax(rest, 0, (index, character, parentheses, brackets) => {
    if (parentheses !== 0 || brackets !== 0) return;
    if (/\s/u.test(character) || character === ">" || character === "+" || character === "~") {
      boundary = index;
      return false;
    }
  });
  const hostSuffix = rest.slice(0, boundary).trim();
  const host = root.host;
  if (argument && (context
    ? !shadowIncludingContextMatches(host, argument)
    : !host.matches(argument))) return Object.freeze([]);
  if (hostSuffix && !host.matches(hostSuffix)) return Object.freeze([]);
  const descendant = rest.slice(boundary).trim();
  if (!descendant) return Object.freeze([host]);
  if (descendant.startsWith(">")) {
    const relative = descendant.slice(1).trim();
    if (!relative) return Object.freeze([]);
    if (selectorHasCombinator(relative)) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS cannot discover a complex shadow host child selector: ${selector}`,
      );
    }
    return Object.freeze([...root.children].filter((element) => element.matches(relative)));
  }
  if (/^[+~]/u.test(descendant)) return Object.freeze([]);
  return Object.freeze([...root.querySelectorAll(descendant)]);
}

function compiledSelectorCount(records: readonly Readonly<SelectorRecord>[]): number {
  return records.reduce((count, { selector }) => count + selectorComponentCount(selector), 0);
}

function selectorOccurrenceCount(selectors: readonly string[]): number {
  return selectors.reduce((count, selector) => count + selectorComponentCount(selector), 0);
}

function compilationSelectorCount(compiled: Readonly<CarrierCompilation>): number {
  if (compiled.selectorOccurrences) return selectorOccurrenceCount(compiled.selectorOccurrences);
  if (compiled.selectorRecords.length > 0) return compiledSelectorCount(compiled.selectorRecords);
  return selectorOccurrenceCount(compiled.selectors);
}

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
  "text-orientation",
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

function importConditionMatches(view: RuntimeWindow, rule: CSSImportRule): boolean {
  const supportsText = rule.supportsText;
  if (supportsText && !view.CSS.supports(supportsText)) return false;
  const media = rule.media.mediaText;
  return !media || view.matchMedia(media).matches;
}

function authoredImportConditionMatches(
  view: RuntimeWindow,
  imported: Readonly<ParsedImport>,
): boolean {
  if (imported.supports) {
    if (!view.CSS.supports(normalizeSupportsCondition(imported.supports))) return false;
  }
  return !imported.media || view.matchMedia(imported.media).matches;
}

function importedStylesheetsReady(
  view: RuntimeWindow,
  sheet: CSSStyleSheet,
  seen: Set<CSSStyleSheet>,
  requireImportedContent: boolean,
  emptyStylesheets: ReadonlySet<string>,
  failedStylesheets: ReadonlySet<string>,
): boolean {
  if (seen.has(sheet)) return true;
  seen.add(sheet);
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return false;
  }
  for (const rule of rules) {
    if (rule.type !== 3) continue;
    const imported = rule as CSSImportRule;
    if (!importConditionMatches(view, imported)) continue;
    const importedUrl = new URL(
      imported.href,
      sheet.href || view.document.baseURI,
    ).href;
    if (!imported.styleSheet) {
      if (failedStylesheets.has(importedUrl)) continue;
      return false;
    }
    let importedRules: CSSRuleList;
    try {
      importedRules = imported.styleSheet.cssRules;
    } catch {
      if (failedStylesheets.has(importedUrl)) continue;
      return false;
    }
    if (requireImportedContent && importedRules.length === 0
      && !emptyStylesheets.has(importedUrl)) {
      return false;
    }
    if (!importedStylesheetsReady(
      view,
      imported.styleSheet,
      seen,
      requireImportedContent,
      emptyStylesheets,
      failedStylesheets,
    )) return false;
  }
  return true;
}

function browserStylesheetIsReady(
  view: RuntimeWindow,
  owner: StylesheetOwner,
  expectedImports: number,
  sourceHasContent: boolean,
  requireImportedContent: boolean,
  emptyStylesheets: ReadonlySet<string>,
  failedStylesheets: ReadonlySet<string>,
): boolean {
  const sheet = owner.sheet;
  if (!sheet) return false;
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return false;
  }
  let imports = 0;
  for (const rule of rules) {
    if (rule.type === 3) imports += 1;
  }
  if (imports < expectedImports) return false;
  if (isStylesheetLink(owner) && sourceHasContent && rules.length === 0
    && !emptyStylesheets.has(owner.href)) return false;
  return importedStylesheetsReady(
    view,
    sheet,
    new Set(),
    requireImportedContent,
    emptyStylesheets,
    failedStylesheets,
  );
}

function inlineStylesheetMayBeLoading(owner: HTMLStyleElement): boolean {
  try {
    return leadingImportStatements(owner.textContent ?? "").imports.length > 0;
  } catch {
    return false;
  }
}

function stylesheetElementIsEligible(owner: StylesheetOwner): boolean {
  if (!owner?.isConnected || owner.disabled || owner.sheet?.disabled) return false;
  const type = (owner.getAttribute("type") ?? "").trim().toLowerCase();
  if (type && type !== "text/css") return false;
  if (owner.localName === "style") {
    return owner.sheet !== null || inlineStylesheetMayBeLoading(owner);
  }
  if (!isStylesheetLink(owner) || !owner.relList.contains("stylesheet")) return false;
  return !owner.relList.contains("alternate");
}

function hasAuthoredInlineShape(element: Element): boolean {
  if (!element.hasAttribute("style")) return false;
  return cssDeclarations(element.getAttribute("style")).some(({ property }) => (
    Object.hasOwn(SHAPE_PROPERTIES, property)
  ));
}

function authoredShapeInlineElements(root: AutoRoot): Element[] {
  return [...root.querySelectorAll("[style]")].filter(hasAuthoredInlineShape);
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

function activateShadowCompanion(root: AutoRoot, style: HTMLStyleElement): void {
  const ShadowRoot = style.ownerDocument.defaultView?.ShadowRoot;
  if (!ShadowRoot || !(root instanceof ShadowRoot) || !style.sheet) return;
  style.sheet.disabled = true;
  style.sheet.disabled = false;
}

function applyCompanionState(
  style: HTMLStyleElement,
  kind: string,
  nonce: string,
  media: string,
  css: string,
): void {
  style.disabled = false;
  style.removeAttribute("type");
  style.removeAttribute("title");
  style.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, kind);
  if (nonce) style.setAttribute("nonce", nonce);
  else style.removeAttribute("nonce");
  if (media) style.setAttribute("media", media);
  else style.removeAttribute("media");
  if (style.textContent !== css) style.textContent = css;
  if (style.sheet) style.sheet.disabled = false;
}

function stylesheetGeneration(owner: StylesheetOwner): string {
  return isStylesheetLink(owner)
    ? `link\n${owner.href}`
    : `style\n${owner.textContent ?? ""}`;
}

function isUtf8EncodingLabel(label: string): boolean {
  try {
    return new TextDecoder(label, { fatal: true }).encoding === "utf-8";
  } catch {
    return false;
  }
}

function stylesheetKey(owner: StylesheetOwner, suppliedSource?: string): string {
  if (!isStylesheetLink(owner)) {
    return [
      suppliedSource === undefined ? "style" : "supplied-style",
      owner.getAttribute("type") ?? "",
      stylesheetMedia(owner),
      owner.getAttribute("nonce") ?? "",
      owner.baseURI,
      suppliedSource ?? owner.textContent ?? "",
    ].join("\n");
  }
  return [
    suppliedSource === undefined ? "link" : "supplied-link",
      owner.rel,
      (owner.getAttribute("type") ?? "").trim().toLowerCase(),
      owner.title,
    stylesheetMedia(owner),
    nonceValue(owner),
    owner.href,
    owner.crossOrigin ?? "",
    owner.integrity ?? "",
    owner.referrerPolicy ?? "",
    ...(suppliedSource === undefined ? [] : [suppliedSource]),
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
    handleRegistry: _handleRegistry,
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
    ...runtime,
    document,
  };
}

class CornerfillAutoController {
  declare readonly attachmentState: AutomaticAttachmentState;
  declare readonly autoObserve: boolean;
  declare automaticCounters: AutomaticCounters;
  declare readonly controller: CornerfillControllerHandle;
  declare destroyed: boolean;
  declare readonly diagnosticsByOwner: Map<DiagnosticOwner, Map<string, Readonly<DiagnosticRecord>>>;
  declare readonly document: RuntimeDocument;
  declare readonly discoveredNonce: string | null;
  declare readonly explicitNonce: string | null;
  declare readonly includeAdoptedStyleSheets: boolean;
  declare readonly handleRegistry: AutomaticHandleRegistry;
  declare readonly maxCompiledSelectors: number;
  declare readonly maxImportCount: number;
  declare readonly maxImportDepth: number;
  declare readonly maxStylesheetBytes: number;
  declare native: boolean;
  declare readonly nativeQualification: Readonly<CornerfillNativeQualification>;
  declare readonly nonce: string | null;
  declare readonly observation: AutomaticObservationRuntime;
  declare readonly onError: ((error: unknown, context: string) => void) | null;
  declare readonly ownsController: boolean;
  declare readonly parentAuto: CornerfillAutoController | null;
  declare readonly ready: Promise<Readonly<CornerfillAutoExplanation>>;
  declare readonly refreshState: AutomaticRefreshState;
  declare registration: CarrierRegistration | null;
  declare ownershipBlocked: boolean;
  declare readonly root: AutoRoot;
  declare rootConnected: boolean;
  declare readonly scopes: Map<ShadowRoot, CornerfillAutoController>;
  declare readonly sourceState: AutomaticSourceState;
  declare readonly stylesheetTimeoutMs: number;
  declare readonly unreadableStylesheetPolicy: "best-effort" | "block-root";
  private readonly hostContextAttribute: string | null;
  private readonly hostContextArguments: Map<string, string>;
  private readonly hostContextConditions: Map<string, string>;
  private hostContextOwnedValue: string | null;
  private nextHostContextToken: number;
  private readonly selectorBudgetOwner: object;

  constructor(options: Readonly<InternalCornerfillAutoOptions> = {}) {
    const document = options.document ?? options.root?.ownerDocument ?? globalThis.document;
    if (!document?.defaultView) throw new TypeError("installCornerfillAuto() requires a browser document");
    this.document = document as RuntimeDocument;
    this.root = options.root ?? this.document;
    this.hostContextArguments = new Map();
    this.hostContextConditions = new Map();
    this.hostContextOwnedValue = null;
    this.nextHostContextToken = 1;
    const ShadowRoot = this.document.defaultView.ShadowRoot;
    if (ShadowRoot && this.root instanceof ShadowRoot) {
      let attribute: string;
      do attribute = `data-cornerfill-host-context-${nextHostContextScope++}`;
      while (this.root.host.hasAttribute(attribute));
      this.hostContextAttribute = attribute;
    } else {
      this.hostContextAttribute = null;
    }
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
    this.explicitNonce = options.nonce ?? null;
    this.discoveredNonce = stylesheetElements(this.root).map(nonceValue).find(Boolean)
      ?? nonceValue(this.document.querySelector("script[nonce],style[nonce],link[nonce]"))
      ?? null;
    this.nonce = this.explicitNonce ?? this.discoveredNonce;
    this.controller = options.controller ?? installCornerfill(runtimeOptions({
      ...options,
      nonce: this.nonce,
    }, this.document));
    this.ownsController = options.controller === undefined;
    this.autoObserve = options.autoObserve ?? options.observe !== false;
    this.includeAdoptedStyleSheets = includeAdoptedStyleSheets;
    this.parentAuto = options.parentAuto ?? null;
    this.handleRegistry = options.handleRegistry ?? { handles: new Map(), scopes: new Set() };
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.sourceState = {
      adoptedIds: new WeakMap(),
      adoptedSources: new WeakMap(),
      adoptedStylesheets: new Map(),
      importRequests: new Map(),
      lateStylesheetLoads: new Map(),
      nextAdoptedId: 1,
      nextOwnerId: 1,
      ownerIds: new WeakMap(),
      pendingFetches: new Set(),
      pendingStylesheetWaits: new Set(),
      requests: new Map(),
      stylesheetEpochs: new WeakMap(),
      stylesheetSources: new WeakMap(),
      stylesheetStateObservers: new Map(),
      stylesheets: new Map(),
    };
    this.scopes = new Map();
    this.attachmentState = {
      candidateProvenance: new Map(),
      candidates: new Set(),
      handles: new Map(),
      inline: new Map(),
    };
    this.handleRegistry.scopes.add(this);
    this.diagnosticsByOwner = new Map();
    this.observation = {
      configurationKey: null,
      eventListeners: [],
      mediaListeners: [],
      observer: null,
      state: Object.freeze({
        attributes: Object.freeze([...SOURCE_ATTRIBUTE_NAMES]),
        characterData: false,
        conservative: false,
        events: Object.freeze([]),
        mediaQueries: Object.freeze([]),
        unobservableStates: Object.freeze([]),
      }),
    };
    this.registration = null;
    this.destroyed = false;
    this.ownershipBlocked = false;
    this.selectorBudgetOwner = Object.freeze({});
    this.refreshState = {
      attachmentRequested: false,
      candidateRequested: false,
      frame: null,
      promise: null,
      queued: false,
      retryFailedRequested: false,
      sourceRequested: false,
      workRequested: false,
    };
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
      let id = this.sourceState.ownerIds.get(styleOwner);
      if (!id) {
        id = this.sourceState.nextOwnerId;
        this.sourceState.nextOwnerId += 1;
        this.sourceState.ownerIds.set(styleOwner, id);
      }
      return `${this.document.baseURI}#cornerfill-inline-style-${id}`;
    }
    if (owner instanceof this.document.defaultView.Element) {
      return owner.id ? `#${owner.id}` : owner.localName;
    }
    return typeof owner === "string" ? owner : "automatic runtime";
  }

  _stylesheetKey(owner: StylesheetOwner): string {
    return `${stylesheetKey(owner, this._stylesheetSourceOverride(owner))}\nsource-epoch:${
      this.sourceState.stylesheetEpochs.get(owner) ?? 0
    }`;
  }

  _stylesheetSourceOverride(owner: StylesheetOwner): string | undefined {
    const record = this.sourceState.stylesheetSources.get(owner);
    if (!record) return undefined;
    const epoch = this.sourceState.stylesheetEpochs.get(owner) ?? 0;
    if (record.epoch === epoch
      && record.generation === stylesheetGeneration(owner)
      && (!record.sheet || record.sheet === owner.sheet)) return record.source;
    this.sourceState.stylesheetSources.delete(owner);
    return undefined;
  }

  _replaceStylesheetSource(owner: StylesheetOwner, source: string): void {
    this.sourceState.stylesheetSources.set(owner, Object.freeze({
      epoch: this.sourceState.stylesheetEpochs.get(owner) ?? 0,
      generation: stylesheetGeneration(owner),
      sheet: owner.sheet,
      source,
    }));
  }

  _invalidateStylesheetSource(owner: StylesheetOwner): void {
    this.sourceState.stylesheetEpochs.set(
      owner,
      (this.sourceState.stylesheetEpochs.get(owner) ?? 0) + 1,
    );
    this.sourceState.stylesheetSources.delete(owner);
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
    try {
      this.onError?.(error, context);
    } catch (callbackError) {
      try {
        const reportError = this.document.defaultView.reportError;
        if (typeof reportError === "function") reportError(callbackError);
        else this.document.defaultView.console.error("Cornerfill onError callback failed", callbackError);
      } catch {
        // Error reporting is external to the automatic runtime transaction.
      }
    }
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
    const provenance = this.attachmentState.candidateProvenance.get(element)?.[0];
    if (provenance) return provenance;
    const inline = this.attachmentState.inline.get(element);
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

  _companionNonce(owner: StylesheetOwner | null = null): string {
    if (this.explicitNonce !== null) return this.explicitNonce;
    return (owner ? nonceValue(owner) : "") || this.discoveredNonce || "";
  }

  _rewriteHostContextSelector(selector: string): string {
    const attribute = this.hostContextAttribute;
    if (!attribute) return selector;
    try {
      let valid = true;
      replaceHostContextFunctions(selector, (argument) => {
        if (!validHostContextArgument((this.root as ShadowRoot).host, argument)) valid = false;
        return `:host-context(${argument})`;
      });
      if (!valid) return ":not(*)";
    } catch {
      return ":not(*)";
    }
    return replaceHostContextFunctions(selector, (argument) => {
      let token = this.hostContextConditions.get(argument);
      if (!token) {
        token = `h${this.nextHostContextToken++}`;
        this.hostContextConditions.set(argument, token);
        this.hostContextArguments.set(token, argument);
      }
      return `:host(:where([${attribute}~="${token}"]):is(:where(*),${argument}))`;
    });
  }

  _restoreHostContextSelector(selector: string): string {
    const attribute = this.hostContextAttribute;
    if (!attribute) return selector;
    const marker = new RegExp(
      `\\[${attribute}\\s*~=\\s*(?:"([^"]+)"|'([^']+)'|([-_a-z0-9]+))\\s*\\]`,
      "iu",
    );
    const replacements: { end: number; start: number; value: string }[] = [];
    let skipThrough = -1;
    scanCssSyntax(selector, 0, (index, character) => {
      if (index <= skipThrough || character !== ":") return;
      const pseudo = selectorPseudo(selector, index);
      if (pseudo?.name !== "host" || selector[pseudo.end] !== "(") return;
      const end = matchingSelectorParenthesis(selector, pseudo.end);
      if (end < 0) return;
      skipThrough = end;
      const match = marker.exec(selector.slice(pseudo.end + 1, end));
      if (!match) return;
      const argument = this.hostContextArguments.get(match[1] ?? match[2] ?? match[3]!);
      if (argument) replacements.push({
        start: index,
        end: end + 1,
        value: `:host-context(${argument})`,
      });
    });
    if (replacements.length === 0) return selector;
    let output = "";
    let cursor = 0;
    for (const replacement of replacements) {
      output += selector.slice(cursor, replacement.start) + replacement.value;
      cursor = replacement.end;
    }
    return output + selector.slice(cursor);
  }

  _syncHostContextMarker(): void {
    const attribute = this.hostContextAttribute;
    const root = this.root;
    if (!attribute || !(root instanceof this.document.defaultView.ShadowRoot)) return;
    const activeTokens = new Set<string>();
    for (const record of this._styleRecords()) {
      for (const token of record.hostContextTokens) activeTokens.add(token);
    }
    for (const [argument, token] of this.hostContextConditions) {
      if (activeTokens.has(token)) continue;
      this.hostContextConditions.delete(argument);
      this.hostContextArguments.delete(token);
    }
    const tokens = [...this.hostContextConditions]
      .filter(([, token]) => activeTokens.has(token))
      .filter(([argument]) => shadowIncludingContextMatches(root.host, argument))
      .map(([, token]) => token);
    const value = tokens.join(" ");
    if (value) {
      if (root.host.getAttribute(attribute) !== value) root.host.setAttribute(attribute, value);
      this.hostContextOwnedValue = value;
    } else {
      if (root.host.hasAttribute(attribute)) root.host.removeAttribute(attribute);
      this.hostContextOwnedValue = null;
    }
  }

  _hostContextTokens(css: string): readonly string[] {
    const attribute = this.hostContextAttribute;
    if (!attribute || !css) return Object.freeze([]);
    const pattern = new RegExp(`\\[${attribute}~="([^"]+)"\\]`, "gu");
    return Object.freeze([...new Set([...css.matchAll(pattern)].map((match) => match[1]!))]);
  }

  _ensureCarrierRegistration(): void {
    const css = carrierRegistrationCss();
    const nonce = this._companionNonce();
    let registrations = CARRIER_REGISTRATIONS.get(this.document);
    let registration = this.registration ?? registrations?.get(nonce) ?? null;
    if (!registration) {
      const style = this.document.createElement("style");
      try {
        applyCompanionState(style, "properties", nonce, "", css);
        (this.document.head ?? this.document.documentElement).append(style);
        assertGeneratedStyleActive(style, "Cornerfill carrier registration stylesheet");
      } catch (error) {
        style.remove();
        throw error;
      }
      registration = { nonce, references: 1, style };
      registrations ??= new Map();
      registrations.set(nonce, registration);
      CARRIER_REGISTRATIONS.set(this.document, registrations);
      this.registration = registration;
      return;
    }
    const previousStyle = registration.style;
    let style = previousStyle;
    if (!style.isConnected || style.getRootNode() !== this.document) {
      style = this.document.createElement("style");
      applyCompanionState(style, "properties", registration.nonce, "", css);
      (this.document.head ?? this.document.documentElement).append(style);
    } else {
      applyCompanionState(style, "properties", registration.nonce, "", css);
      const parent = this.document.head ?? this.document.documentElement;
      if (style.parentNode !== parent) parent.append(style);
    }
    try {
      assertGeneratedStyleActive(style, "Cornerfill carrier registration stylesheet");
    } catch (error) {
      if (style !== previousStyle) style.remove();
      throw error;
    }
    registration.style = style;
    if (previousStyle !== style) previousStyle.remove();
    if (!this.registration) {
      registration.references += 1;
      this.registration = registration;
    }
  }

  _releaseCarrierRegistration(): void {
    const registration = this.registration;
    if (!registration) return;
    this.registration = null;
    registration.references -= 1;
    if (registration.references <= 0) {
      registration.style.remove();
      const registrations = CARRIER_REGISTRATIONS.get(this.document);
      if (registrations?.get(registration.nonce) === registration) {
        registrations.delete(registration.nonce);
        if (registrations.size === 0) CARRIER_REGISTRATIONS.delete(this.document);
      }
    }
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

  _assertCssResponse(response: Response, label: string): void {
    const contentType = response.headers.get("content-type") ?? "";
    const mime = contentType.split(";", 1)[0]!.trim().toLowerCase();
    if (mime !== "text/css") {
      throw new TypeError(`stylesheet response has invalid CSS MIME type ${mime || "(missing)"}: ${label}`);
    }
    for (const match of contentType.matchAll(/;\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]*))/giu)) {
      const charset = (match[1] ?? match[2] ?? match[3] ?? "").trim().toLowerCase();
      if (!isUtf8EncodingLabel(charset)) {
        throw new TypeError(`Cornerfill automatic CSS supports only UTF-8 stylesheets; received ${charset || "an empty charset"}: ${label}`);
      }
    }
  }

  _assertUtf8Stylesheet(text: string, label: string): string {
    const charset = /^\ufeff?@charset\s+(?:"([^"]*)"|'([^']*)')\s*;/iu.exec(text);
    if (charset) {
      const value = (charset[1] ?? charset[2] ?? "").trim().toLowerCase();
      if (!isUtf8EncodingLabel(value)) {
        throw new TypeError(`Cornerfill automatic CSS supports only UTF-8 stylesheets; received @charset ${value || "(empty)"}: ${label}`);
      }
    }
    return text;
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
      let text: string;
      if (typeof response.arrayBuffer === "function") {
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(await response.arrayBuffer());
        } catch (error) {
          throw new TypeError(`stylesheet response is not valid UTF-8: ${label}`, { cause: error });
        }
      } else {
        text = await response.text();
      }
      if (new TextEncoder().encode(text).byteLength > this.maxStylesheetBytes) {
        throw ownershipBlockingRangeError(
          `${label} exceeds the ${this.maxStylesheetBytes}-byte stylesheet source budget`,
        );
      }
      return this._assertUtf8Stylesheet(text, label);
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const chunks: string[] = [];
    let bytes = 0;
    let text: string;
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
      text = chunks.join("");
    } catch (error) {
      if (error instanceof TypeError) {
        throw new TypeError(`stylesheet response is not valid UTF-8: ${label}`, { cause: error });
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
    return this._assertUtf8Stylesheet(text, label);
  }

  async _source(
    owner: StylesheetOwner,
    request: SourceRequest,
  ): Promise<Readonly<StylesheetSource>> {
    this.automaticCounters.sourceReads += 1;
    const supplied = this._stylesheetSourceOverride(owner);
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
    this.sourceState.pendingFetches.add(controller);
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
        this._assertCssResponse(response, url.href);
        return Object.freeze({
          text: await this._readStylesheetResponse(response, response.url || url.href),
          baseUrl: response.url || url.href,
          sourceUrl: response.url || url.href,
        });
      }, request.deadline);
      this._accountSource(request, source.text, source.sourceUrl);
      return source;
    } finally {
      this.sourceState.pendingFetches.delete(controller);
    }
  }

  _releaseImportRequests(request: SourceRequest): void {
    for (const record of request.importRecords) {
      record.consumers.delete(request);
      if (record.consumers.size > 0) continue;
      if (!record.settled) record.controller.abort();
      if (this.sourceState.importRequests.get(record.key) === record) this.sourceState.importRequests.delete(record.key);
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
    let record = this.sourceState.importRequests.get(key);
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
            const sourceUrl = response.url || url;
            this._assertCssResponse(response, sourceUrl);
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
          if (created.consumers.size === 0 && this.sourceState.importRequests.get(key) === created) {
            this.sourceState.importRequests.delete(key);
          }
        }
      })();
      created.promise = task;
      this.sourceState.importRequests.set(key, created);
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
    const parsedImports = split.imports.flatMap((statement) => {
      let imported: Readonly<ParsedImport>;
      try {
        imported = parseImportStatement(statement.prelude, source.baseUrl);
      } catch (error) {
        if (!ownershipBlockingError(error)) return [];
        throw annotateDiagnostic(error, { source: identity, declaration: statement.prelude });
      }
      return [Object.freeze({
        active: !imported.supports || this.document.defaultView.CSS.supports(
          carrierSupportsCondition(imported.supports),
        ),
        imported,
        statement,
      })];
    });
    request.imports += parsedImports.filter(({ active }) => active).length;
    if (request.imports > this.maxImportCount) {
      throw ownershipBlockingRangeError(
        `${identity} exceeds the maximum @import count of ${this.maxImportCount}`,
      );
    }
    const importTasks: Promise<Readonly<{
      readonly activeImports: number;
      readonly failedImports: number;
      readonly part: Readonly<CarrierCompilation>;
    }>>[] = parsedImports.map(async ({ active, imported, statement }) => {
      if (!active) {
        return Object.freeze({
          activeImports: 0,
          failedImports: 0,
          part: Object.freeze({
            css: "",
            selectors: Object.freeze([]),
            selectorRecords: Object.freeze([]),
            observation: selectorObservation([]),
            mediaQueries: Object.freeze([]),
          }),
        });
      }
      if (nextStack.includes(imported.url)) {
        throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...nextStack, imported.url].join(" -> ")}`);
      }
      request.provenance.add(imported.url);
      const importedStrictShapeSupports = strictShapeSupports || Boolean(
        imported.supports && supportsConditionTestsShape(imported.supports),
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
        request.failedStylesheets.add(imported.url);
        this._recordError(diagnostic, `@import ${imported.url}`, {
          bucket: owner,
          ownerIdentity: this._ownerIdentity(owner),
          source: imported.url,
          declaration: statement.prelude,
        });
        return Object.freeze({
          activeImports: 1,
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
      if (compiled.rootRuleCount === 0) request.emptyStylesheets.add(imported.url);
      return Object.freeze({
        activeImports: 1,
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
        this.hostContextAttribute ? (selector) => this._rewriteHostContextSelector(selector) : null,
        this.hostContextAttribute ? (selector) => this._restoreHostContextSelector(selector) : null,
      );
    } catch (error) {
      throw annotateDiagnostic(error, { source: identity });
    }
    const importedParts = await Promise.all(importTasks);
    const parts: CarrierCompilation[] = importedParts.map(({ part }) => part);
    parts.push(local);
    const selectors = Object.freeze([...new Set(parts.flatMap((part) => part.selectors))]);
    const selectorOccurrences = Object.freeze(parts.flatMap((part) => (
      part.selectorOccurrences ?? part.selectorRecords.map(({ selector }) => selector)
    )));
    const selectorRecords = Object.freeze([...new Map(parts
      .flatMap((part) => part.selectorRecords)
      .map((record) => [`${record.source}\n${record.selector}\n${record.declaration ?? ""}`, record]))
      .values()]);
    if (selectorOccurrenceCount(selectorOccurrences) > this.maxCompiledSelectors) {
      throw ownershipBlockingRangeError(
        `${identity} exceeds the maximum compiled selector count of ${this.maxCompiledSelectors}`,
      );
    }
    const rootRuleCount = split.imports.length + (local.parsedRuleCount ?? 0);
    if (rootRuleCount === 0) request.emptyStylesheets.add(identity);
    return Object.freeze({
      css: parts.map((part) => part.css).join(""),
      selectors,
      selectorOccurrences,
      selectorRecords,
      observation: mergeSelectorObservation(parts.map((part) => part.observation)),
      mediaQueries: Object.freeze([...new Set(parts.flatMap((part) => part.mediaQueries))].sort()),
      ...(stack.length === 0
        ? { sources: Object.freeze([...request.provenance]) }
        : {}),
      failedImports: importedParts.reduce((total, part) => total + part.failedImports, 0),
      imports: importedParts.reduce((total, part) => total + part.activeImports, 0),
      rootRuleCount,
    });
  }

  _observeLateStylesheetLoad(owner: StylesheetOwner): void {
    if (!this.autoObserve || this.sourceState.lateStylesheetLoads.has(owner)) return;
    const release = () => {
      owner.removeEventListener("load", loaded);
      owner.removeEventListener("error", failed);
      if (this.sourceState.lateStylesheetLoads.get(owner) === release) {
        this.sourceState.lateStylesheetLoads.delete(owner);
      }
    };
    const loaded = () => {
      release();
      if (!this.destroyed) {
        const record = this.sourceState.stylesheets.get(owner);
        if (record?.failed) {
          record.cssomHook?.restore();
          record.companion?.remove();
          this.sourceState.stylesheets.delete(owner);
          this._clearErrors(owner);
        }
        this._queueRefresh({ sources: true, candidates: true, attachments: true });
      }
    };
    const failed = () => release();
    owner.addEventListener("load", loaded, { once: true });
    owner.addEventListener("error", failed, { once: true });
    this.sourceState.lateStylesheetLoads.set(owner, release);
  }

  _watchBrowserStylesheet(owner: StylesheetOwner): StylesheetLoadWatch {
    let finish: (status: StylesheetLoadStatus) => void;
    const watch: StylesheetLoadWatch = {
      status: "pending",
      settled: new Promise((resolve) => { finish = resolve; }),
      release: () => settle("released"),
    };
    const cleanup = () => {
      owner.removeEventListener("load", loaded);
      owner.removeEventListener("error", failed);
    };
    const settle = (status: StylesheetLoadStatus) => {
      if (watch.status !== "pending") return;
      watch.status = status;
      cleanup();
      finish(status);
    };
    const loaded = () => settle("loaded");
    const failed = () => settle("failed");
    owner.addEventListener("load", loaded, { once: true });
    owner.addEventListener("error", failed, { once: true });
    if (isStylesheetLink(owner) && owner.sheet) settle("loaded");
    return watch;
  }

  _waitForBrowserStylesheet(
    owner: StylesheetOwner,
    request: SourceRequest,
    source: string,
    emptyStylesheets: ReadonlySet<string>,
    failedStylesheets: ReadonlySet<string>,
    watch = this._watchBrowserStylesheet(owner),
  ): Promise<boolean> {
    const importBase = (isStylesheetLink(owner) ? owner.href : owner.baseURI) || this.document.baseURI;
    const imports = leadingImportStatements(source).imports.flatMap(({ prelude }) => {
      try {
        return [parseImportStatement(prelude, importBase)];
      } catch {
        return [];
      }
    }).filter((imported) => (
      authoredImportConditionMatches(this.document.defaultView, imported)
    )).length;
    const sourceHasContent = source.trim().length > 0;
    if (!isStylesheetLink(owner) && imports === 0) {
      watch.release();
      return Promise.resolve(owner.sheet !== null);
    }
    if (browserStylesheetIsReady(
      this.document.defaultView,
      owner,
      imports,
      sourceHasContent,
      true,
      emptyStylesheets,
      failedStylesheets,
    )) {
      watch.release();
      return Promise.resolve(true);
    }
    if (watch.status === "loaded") {
      watch.release();
      return Promise.resolve(browserStylesheetIsReady(
        this.document.defaultView,
        owner,
        imports,
        sourceHasContent,
        false,
        emptyStylesheets,
        failedStylesheets,
      ));
    }
    if (watch.status !== "pending") return Promise.resolve(false);
    this.sourceState.lateStylesheetLoads.get(owner)?.();
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let deadlineTimer = 0;
      let pollTimer = 0;
      const cleanup = () => {
        watch.release();
        this.document.defaultView.clearTimeout(deadlineTimer);
        this.document.defaultView.clearTimeout(pollTimer);
        this.sourceState.pendingStylesheetWaits.delete(cancel);
        if (request.cancelWait === cancel) request.cancelWait = null;
      };
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(loaded);
      };
      const poll = () => {
        if (settled) return;
        if (browserStylesheetIsReady(
          this.document.defaultView,
          owner,
          imports,
          sourceHasContent,
          true,
          emptyStylesheets,
          failedStylesheets,
        )) {
          finish(true);
        }
        else pollTimer = this.document.defaultView.setTimeout(poll, 16);
      };
      const cancel = () => finish(false);
      request.cancelWait = cancel;
      deadlineTimer = this.document.defaultView.setTimeout(() => {
        finish(false);
        this._observeLateStylesheetLoad(owner);
      }, Math.max(0, request.deadline - Date.now()));
      watch.settled.then((status) => finish(status === "loaded" && browserStylesheetIsReady(
        this.document.defaultView,
        owner,
        imports,
        sourceHasContent,
        false,
        emptyStylesheets,
        failedStylesheets,
      )));
      this.sourceState.pendingStylesheetWaits.add(cancel);
      queueMicrotask(poll);
    });
  }

  _writeStylesheetRecord(
    owner: StylesheetOwner,
    compiled: Readonly<CarrierCompilation>,
    {
    key = this._stylesheetKey(owner),
    existing = this.sourceState.stylesheets.get(owner),
    cssomHook = existing?.cssomHook ?? null,
    }: Readonly<WriteStylesheetOptions> = {},
  ): Readonly<StylesheetRecord> {
    let companion = existing?.companion ?? null;
    if (compiled.css) {
      const created = companion === null;
      companion ??= this.document.createElement("style");
      if (created) {
        applyCompanionState(
          companion,
          "",
          this._companionNonce(owner),
          stylesheetMedia(owner),
          "",
        );
        owner.after(companion);
      }
      applyCompanionState(
        companion,
        "",
        this._companionNonce(owner),
        stylesheetMedia(owner),
        compiled.css,
      );
      if (owner.nextSibling !== companion) owner.after(companion);
      activateShadowCompanion(this.root, companion);
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
      carrierCss: compiled.css,
      companion,
      key,
      failed: (compiled.failedImports ?? 0) > 0,
      hostContextTokens: this._hostContextTokens(compiled.css),
      media: stylesheetMedia(owner),
      selectors: compiled.selectors,
      selectorRecords: compiled.selectorRecords ?? Object.freeze([]),
      selectorCount: compilationSelectorCount(compiled),
      observation: compiled.observation,
      ownershipBlocking: false,
      mediaQueries: Object.freeze([
        ...new Set([stylesheetMedia(owner), ...(compiled.mediaQueries ?? [])].filter(Boolean)),
      ].sort()),
      sources: compiled.sources ?? Object.freeze([key]),
      imports: compiled.imports ?? 0,
      cssomHook,
    });
    this.sourceState.stylesheets.set(owner, record);
    return record;
  }

  _writeFailedStylesheetRecord(
    owner: StylesheetOwner,
    key: string,
    cssomHook: CssomHook | null = null,
    error: unknown = null,
    sourceUnavailable = false,
  ): Readonly<StylesheetRecord> {
    const existing = this.sourceState.stylesheets.get(owner);
    existing?.companion?.remove();
    if (existing?.cssomHook && existing.cssomHook !== cssomHook) existing.cssomHook.restore();
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner,
      carrierCss: "",
      companion: null,
      key,
      failed: true,
      hostContextTokens: Object.freeze([]),
      media: stylesheetMedia(owner),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      selectorCount: 0,
      observation: selectorObservation([]),
      ownershipBlocking: ownershipBlockingError(error)
        || (sourceUnavailable && this.unreadableStylesheetPolicy === "block-root"),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([key]),
      imports: 0,
      cssomHook,
    });
    this.sourceState.stylesheets.set(owner, record);
    this._configureObservation();
    return record;
  }

  _adoptedStylesheetIdentity(sheet: CSSStyleSheet): string {
    let identity = this.sourceState.adoptedIds.get(sheet);
    if (!identity) {
      identity = `adopted stylesheet ${this.sourceState.nextAdoptedId}`;
      this.sourceState.nextAdoptedId += 1;
      this.sourceState.adoptedIds.set(sheet, identity);
    }
    return identity;
  }

  _writeAdoptedStylesheetRecord(
    sheet: CSSStyleSheet,
    compiled: Readonly<CarrierCompilation>,
    { key, identity, media }: Readonly<{ identity: string; key: string; media: string }>,
  ): Readonly<StylesheetRecord> {
    const existing = this.sourceState.adoptedStylesheets.get(sheet);
    let companion = existing?.companion ?? null;
    if (compiled.css && !sheet.disabled) {
      const created = companion === null;
      companion ??= this.document.createElement("style");
      if (created) {
        applyCompanionState(companion, "adopted", this.nonce || "", media, "");
        if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
        else this.root.append(companion);
      }
      applyCompanionState(companion, "adopted", this.nonce || "", media, compiled.css);
      const parent = this.root === this.document
        ? (this.document.head ?? this.document.documentElement)
        : this.root;
      if (companion.parentNode !== parent) parent.append(companion);
      activateShadowCompanion(this.root, companion);
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
      carrierCss: sheet.disabled ? "" : compiled.css,
      companion,
      key,
      failed: false,
      hostContextTokens: this._hostContextTokens(sheet.disabled ? "" : compiled.css),
      identity,
      media,
      selectors: sheet.disabled ? Object.freeze([]) : compiled.selectors,
      selectorRecords: sheet.disabled ? Object.freeze([]) : compiled.selectorRecords,
      selectorCount: sheet.disabled ? 0 : compilationSelectorCount(compiled),
      observation: sheet.disabled ? selectorObservation([]) : compiled.observation,
      ownershipBlocking: false,
      mediaQueries: sheet.disabled
        ? Object.freeze([])
        : Object.freeze([...new Set([media, ...(compiled.mediaQueries ?? [])].filter(Boolean))].sort()),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.sourceState.adoptedStylesheets.set(sheet, record);
    return record;
  }

  _writeFailedAdoptedStylesheetRecord(
    sheet: CSSStyleSheet,
    identity: string,
    key = identity,
    error: unknown = null,
    sourceUnavailable = false,
  ): Readonly<StylesheetRecord> {
    this.sourceState.adoptedStylesheets.get(sheet)?.companion?.remove();
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner: sheet,
      adopted: true,
      carrierCss: "",
      companion: null,
      key,
      failed: true,
      hostContextTokens: Object.freeze([]),
      identity,
      media: adoptedStylesheetMedia(sheet),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      selectorCount: 0,
      observation: selectorObservation([]),
      ownershipBlocking: ownershipBlockingError(error)
        || (sourceUnavailable && this.unreadableStylesheetPolicy === "block-root"),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.sourceState.adoptedStylesheets.set(sheet, record);
    this._configureObservation();
    return record;
  }

  _processAdoptedStylesheet(sheet: CSSStyleSheet, retryFailed = false): void {
    if (this.destroyed) return;
    const existing = this.sourceState.adoptedStylesheets.get(sheet);
    const identity = existing?.identity ?? this._adoptedStylesheetIdentity(sheet);
    let source: string;
    let media: string;
    try {
      source = this.sourceState.adoptedSources.get(sheet) ?? adoptedStylesheetSource(sheet);
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
        false,
        this.hostContextAttribute ? (selector) => this._rewriteHostContextSelector(selector) : null,
        this.hostContextAttribute ? (selector) => this._restoreHostContextSelector(selector) : null,
      );
      if (compilationSelectorCount(compiled) > this.maxCompiledSelectors) {
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
    this._clearErrors(this.sourceState.adoptedStylesheets);
    let sheets: CSSStyleSheet[];
    try {
      sheets = [...this.root.adoptedStyleSheets];
    } catch (error) {
      this._recordError(error, "adopted stylesheets", {
        bucket: this.sourceState.adoptedStylesheets,
        ownerIdentity: "adopted stylesheets",
      });
      return;
    }
    const active = new Set(sheets);
    for (const [sheet, record] of this.sourceState.adoptedStylesheets) {
      if (active.has(sheet)) continue;
      record.companion?.remove();
      this.sourceState.adoptedStylesheets.delete(sheet);
      this._clearErrors(sheet);
    }
    for (const sheet of sheets) this._processAdoptedStylesheet(sheet, retryFailed);
    this._repairAdoptedCompanions();
  }

  _repairAdoptedCompanions(): void {
    for (const record of this.sourceState.adoptedStylesheets.values()) {
      const companion = record.companion;
      if (!companion) continue;
      applyCompanionState(
        companion,
        "adopted",
        this.nonce || "",
        record.media,
        record.carrierCss,
      );
      if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
      else this.root.append(companion);
      assertGeneratedStyleActive(companion, "Cornerfill generated adopted stylesheet");
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
    for (const [target, release] of this.sourceState.stylesheetStateObservers) {
      if (targets.has(target)) continue;
      release();
      this.sourceState.stylesheetStateObservers.delete(target);
    }
    for (const target of targets) {
      if (this.sourceState.stylesheetStateObservers.has(target)) continue;
      const release = observeDisabledState(this.document.defaultView, target, () => (
        this._queueRefresh({ sources: true, candidates: true, attachments: true })
      ));
      if (release) this.sourceState.stylesheetStateObservers.set(target, release);
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
      if (!hook.active || this.destroyed || this.sourceState.stylesheets.get(owner)?.cssomHook !== hook) return;
      this._clearErrors(owner);
      try {
        hook.modelSource = mutateStylesheetModel(this.document, hook.modelSource, mutation, this.nonce);
        this._replaceStylesheetSource(owner, hook.modelSource);
        if (leadingImportStatements(hook.modelSource).imports.length > 0) {
          this._queueRefresh({ sources: true, candidates: true, attachments: true });
        } else {
          const compiled = parseCarrierSheet(
            this.document,
            hook.modelSource,
            hook.baseUrl,
            this.nonce,
            this._ownerIdentity(owner),
            false,
            this.hostContextAttribute ? (selector) => this._rewriteHostContextSelector(selector) : null,
            this.hostContextAttribute ? (selector) => this._restoreHostContextSelector(selector) : null,
          );
          if (compilationSelectorCount(compiled) > this.maxCompiledSelectors) {
            throw ownershipBlockingRangeError(
              `${this._ownerIdentity(owner)} exceeds the maximum compiled selector count of ${this.maxCompiledSelectors}`,
            );
          }
          this.automaticCounters.sourceCompiles += 1;
          this._writeStylesheetRecord(owner, compiled, { cssomHook: hook });
          this._configureObservation();
          this._queueRefresh({ candidates: true, attachments: true });
        }
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
    const request = this.sourceState.requests.get(owner);
    if (!request) return;
    request.aborted = true;
    request.controller?.abort();
    request.cancelWait?.();
    this._releaseImportRequests(request);
    this.sourceState.requests.delete(owner);
  }

  _abortObsoleteSourceRequests(): void {
    for (const [owner, request] of this.sourceState.requests) {
      if (!stylesheetElementIsEligible(owner) || this._stylesheetKey(owner) !== request.key) {
        this._abortSourceRequest(owner);
      }
    }
  }

  _sourceRequestIsCurrent(
    owner: StylesheetOwner,
    key: string,
    request: SourceRequest,
  ): boolean {
    return !this.destroyed
      && !request.aborted
      && this.sourceState.requests.get(owner) === request
      && stylesheetElementIsEligible(owner)
      && this._stylesheetKey(owner) === key;
  }

  _processStylesheet(owner: StylesheetOwner, retryFailed = false): Promise<void> | undefined {
    if (this.destroyed) return;
    if (!stylesheetElementIsEligible(owner)) {
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      const previous = this.sourceState.stylesheets.get(owner);
      previous?.companion?.remove();
      previous?.cssomHook?.restore();
      this.sourceState.stylesheets.delete(owner);
      return Promise.resolve();
    }
    const key = this._stylesheetKey(owner);
    const existing = this.sourceState.stylesheets.get(owner);
    if (existing?.key === key && (!existing.failed || !retryFailed)) return;
    const active = this.sourceState.requests.get(owner);
    if (active?.key === key) return active.promise ?? undefined;
    if (active) this._abortSourceRequest(owner);
    this._clearErrors(owner);
    const request: SourceRequest = {
      aborted: false,
      bytes: 0,
      cancelWait: null,
      controller: isStylesheetLink(owner)
        ? new this.document.defaultView.AbortController()
        : null,
      deadline: Date.now() + this.stylesheetTimeoutMs,
      emptyStylesheets: new Set(),
      failedStylesheets: new Set(),
      importCache: new Map(),
      imports: 0,
      importRecords: new Set(),
      key,
      promise: null,
      provenance: new Set(),
    };
    const task = this._runStylesheetRequest(owner, key, existing, request).finally(() => {
      this._releaseImportRequests(request);
      if (this.sourceState.requests.get(owner) === request) this.sourceState.requests.delete(owner);
    });
    request.promise = task;
    this.sourceState.requests.set(owner, request);
    return task;
  }

  async _runStylesheetRequest(
    owner: StylesheetOwner,
    key: string,
    existing: Readonly<StylesheetRecord> | undefined,
    request: SourceRequest,
  ): Promise<void> {
    const browserWatch = this._watchBrowserStylesheet(owner);
    try {
      let source: Readonly<StylesheetSource>;
      try {
        source = await this._source(owner, request);
      } catch (error) {
        request.controller?.abort();
        request.cancelWait?.();
        if (!this._sourceRequestIsCurrent(owner, key, request)) return;
        const ownerIdentity = isStylesheetLink(owner) ? owner.href : this._ownerIdentity(owner);
        this._recordError(error, ownerIdentity || "inline stylesheet", {
          bucket: owner,
          ownerIdentity: this._ownerIdentity(owner),
          source: ownerIdentity || this._ownerIdentity(owner),
        });
        this._writeFailedStylesheetRecord(owner, key, null, error, true);
        return;
      }
      if (!this._sourceRequestIsCurrent(owner, key, request)) return;
      let compiled: Readonly<CompiledSourceTree>;
      try {
        compiled = await this._compileSourceTree(source, owner, request);
        this.automaticCounters.sourceCompiles += 1;
      } catch (error) {
        if (!this._sourceRequestIsCurrent(owner, key, request)) return;
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
      if (!this._sourceRequestIsCurrent(owner, key, request)) return;
      if (compiled.rootRuleCount === 0 && isStylesheetLink(owner)) {
        request.emptyStylesheets.add(owner.href);
      }
      const browserLoaded = await this._waitForBrowserStylesheet(
        owner,
        request,
        source.text,
        request.emptyStylesheets,
        request.failedStylesheets,
        browserWatch,
      );
      if (!this._sourceRequestIsCurrent(owner, key, request)) return;
      if (!browserLoaded) {
        const error = new Error("browser did not expose the authored stylesheet before the source deadline");
        this._recordError(error, isStylesheetLink(owner) ? owner.href : "inline stylesheet", {
          bucket: owner,
          ownerIdentity: this._ownerIdentity(owner),
          source: source.sourceUrl,
        });
        this._writeFailedStylesheetRecord(owner, key, null, error);
        return;
      }
      let cssomHook: CssomHook | null = null;
      try {
        this.sourceState.stylesheets.get(owner)?.cssomHook?.restore();
        cssomHook = this._createCssomHook(owner, source.text, source.baseUrl);
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
    } finally {
      browserWatch.release();
    }
  }

  _processInline(element: Element, stylesheetCandidate = false): void {
    if (this.destroyed) return;
    if (!(element instanceof this.document.defaultView.HTMLElement)) return;
    const existing = this.attachmentState.inline.get(element);
    const currentAttribute = element.getAttribute("style") ?? "";
    if (existing?.appliedAttribute === currentAttribute) return;
    if (existing) {
      this._restoreInlineRecord(element, existing);
      this.attachmentState.inline.delete(element);
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
    this.attachmentState.inline.set(element, Object.freeze({
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
    yield* this.sourceState.stylesheets.values();
    yield* this.sourceState.adoptedStylesheets.values();
  }

  _stylesheetCandidates(): Set<Element> | null {
    const candidates = new Set<Element>();
    this.attachmentState.candidateProvenance.clear();
    this._clearErrors(this.selectorBudgetOwner);
    const recordsBySelector = new Map<string, {
      readonly owner: DiagnosticOwner;
      readonly ownerIdentity: string;
      readonly record: Readonly<SelectorRecord>;
    }[]>();
    let selectorCount = 0;
    for (const record of this._styleRecords()) {
      selectorCount += record.selectorCount;
      if (selectorCount > this.maxCompiledSelectors) {
        const error = ownershipBlockingRangeError(
          `automatic root exceeds the maximum aggregate compiled selector count of ${this.maxCompiledSelectors}`,
        );
        this._recordError(error, "automatic root selector budget", {
          bucket: this.selectorBudgetOwner,
          ownerIdentity: "automatic root",
        });
        return null;
      }
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
        for (const branch of selectorBranches(selector)) {
          const matches = this.root === this.document
            ? this.root.querySelectorAll(branch)
            : shadowSelectorMatches(this.root as ShadowRoot, branch);
          for (const element of matches) {
            candidates.add(element);
            let provenance = this.attachmentState.candidateProvenance.get(element);
            if (!provenance) {
              provenance = [];
              this.attachmentState.candidateProvenance.set(element, provenance);
            }
            for (const { record: selectorRecord } of groupedRecords) {
              if (!provenance.some((candidate) => (
                candidate.source === selectorRecord.source
                && candidate.selector === selectorRecord.selector
                && candidate.declaration === selectorRecord.declaration
              ))) provenance.push(selectorRecord);
            }
          }
        }
      } catch (error) {
        const failure = ownershipBlockingError(error)
          ? error
          : ownershipBlockingSyntaxError(
            `Automatic CSS cannot discover selector matches for ${selector}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        for (const { owner, ownerIdentity, record: selectorRecord } of groupedRecords) {
          this._recordError(failure, `selector ${selector}`, {
            bucket: owner,
            ownerIdentity,
            source: selectorRecord.source,
            selector,
            declaration: selectorRecord.declaration,
          });
        }
        return null;
      }
    }
    return candidates;
  }

  async _discoverSources(retryFailed = false): Promise<void> {
    if (this.destroyed) return;
    this._ensureCarrierRegistration();
    for (const [owner, record] of this.sourceState.stylesheets) {
      const companion = record.companion;
      if (!companion || !owner.isConnected) continue;
      applyCompanionState(
        companion,
        "",
        this._companionNonce(owner),
        stylesheetMedia(owner),
        record.carrierCss,
      );
      if (owner.nextSibling !== companion) owner.after(companion);
      assertGeneratedStyleActive(companion, "Cornerfill generated carrier stylesheet");
    }
    this._repairAdoptedCompanions();
    this.automaticCounters.sourcePasses += 1;
    this._syncStylesheetStateObservers();
    const owners = stylesheetElements(this.root);
    const activeOwners = new Set(owners);
    for (const [owner, release] of this.sourceState.lateStylesheetLoads) {
      if (activeOwners.has(owner)) continue;
      release();
    }
    for (const [owner, record] of this.sourceState.stylesheets) {
      if (activeOwners.has(owner)) continue;
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      record.companion?.remove();
      record.cssomHook?.restore();
      this.sourceState.stylesheets.delete(owner);
    }
    await Promise.all(owners.map((owner) => this._processStylesheet(owner, retryFailed)));
    if (this.destroyed) return;
    for (const owner of owners) {
      const record = this.sourceState.stylesheets.get(owner);
      const companion = record?.companion;
      if (!companion) continue;
      applyCompanionState(
        companion,
        "",
        this._companionNonce(owner),
        stylesheetMedia(owner),
        record.carrierCss,
      );
      if (owner.nextSibling !== companion) owner.after(companion);
      assertGeneratedStyleActive(companion, "Cornerfill generated carrier stylesheet");
    }
    this._discoverAdoptedStylesheets(retryFailed);
    if (this.destroyed) return;
    this._syncStylesheetStateObservers();
    this._configureObservation();
  }

  _reconcileCandidates(): boolean {
    if (this.destroyed) return false;
    this.automaticCounters.candidatePasses += 1;
    this._syncHostContextMarker();
    for (const [element, record] of this.attachmentState.inline) {
      if (element.isConnected) continue;
      this._restoreInlineRecord(element, record);
      this._restoreAuthoredInlineShape(element, record);
      this.attachmentState.inline.delete(element);
      this._clearErrors(element);
    }
    if ([...this._styleRecords()].some((record) => record.ownershipBlocking)) {
      this._clearErrors(this.selectorBudgetOwner);
      this.ownershipBlocked = true;
      this.attachmentState.candidateProvenance.clear();
      this.attachmentState.candidates = new Set();
      return true;
    }
    const stylesheetCandidates = this._stylesheetCandidates();
    if (!stylesheetCandidates) {
      this.ownershipBlocked = true;
      this.attachmentState.candidateProvenance.clear();
      this.attachmentState.candidates = new Set();
      return true;
    }
    this.ownershipBlocked = false;
    const inlineCandidates = new Set<Element>([
      ...this.attachmentState.inline.keys(),
      ...authoredShapeInlineElements(this.root),
      ...[...stylesheetCandidates].filter((element) => element.hasAttribute("style")),
    ]);
    for (const element of inlineCandidates) {
      if (this.destroyed) return false;
      this._processInline(element, stylesheetCandidates.has(element));
    }
    const candidates = new Set<Element>([...this.attachmentState.inline]
      .filter(([, record]) => record.shape)
      .map(([element]) => element));
    for (const element of stylesheetCandidates) candidates.add(element);
    for (const element of this.attachmentState.candidates) {
      if (!candidates.has(element)) this._clearErrors(element);
    }
    const changed = candidates.size !== this.attachmentState.candidates.size
      || [...candidates].some((element) => !this.attachmentState.candidates.has(element));
    this.attachmentState.candidates = candidates;
    return changed;
  }

  _disposeAutomaticHandle(
    element: HTMLElement,
    record: SharedAutomaticHandle,
    error: unknown = null,
  ): void {
    if (this.handleRegistry.handles.get(element) !== record) return;
    this.handleRegistry.handles.delete(element);
    for (const claimant of record.claimants) {
      claimant.attachmentState.handles.delete(element);
      if (error !== null && !claimant.destroyed) claimant._recordElementError(error, element);
    }
    record.claimants.clear();
    record.handle.dispose();
    this.automaticCounters.handleDetaches += 1;
  }

  _clearAutomaticHandleErrors(element: HTMLElement, record: SharedAutomaticHandle): void {
    for (const claimant of record.claimants) {
      if (!claimant.destroyed) claimant._clearErrors(element);
    }
  }

  _releaseAutomaticClaim(element: HTMLElement): SharedAutomaticHandle | null {
    this.attachmentState.handles.delete(element);
    const record = this.handleRegistry.handles.get(element);
    if (!record || !record.claimants.delete(this)) return null;
    if (record.claimants.size > 0) return record;
    this._disposeAutomaticHandle(element, record);
    return null;
  }

  _trackAutomaticPending(
    record: SharedAutomaticHandle,
    pending: Promise<void>,
  ): Promise<void> {
    record.pending = pending;
    const settle = () => {
      if (record.pending === pending) record.pending = null;
    };
    void pending.then(settle, settle);
    return pending;
  }

  _refreshAutomaticHandle(
    element: HTMLElement,
    record: SharedAutomaticHandle,
    inspection: Readonly<CornerfillAuthoredStyleInspection>,
  ): Promise<void> | null {
    const signature = automaticComputedSignature(inspection);
    if (record.signature === signature) {
      if (record.pending) return record.pending;
      try {
        record.handle.verify();
      } catch (error) {
        this._disposeAutomaticHandle(element, record, error);
      }
      return null;
    }
    record.signature = signature;
    this.automaticCounters.handleRefreshes += 1;
    const pending = record.handle.refresh().then(
      () => undefined,
      (error) => this._disposeAutomaticHandle(element, record, error),
    );
    return this._trackAutomaticPending(record, pending);
  }

  _claimAutomaticHandle(
    element: HTMLElement,
    inspection: Readonly<CornerfillAuthoredStyleInspection>,
  ): Promise<void> | null {
    const claimants = [...this.handleRegistry.scopes].filter((scope) => (
      !scope.destroyed && scope.attachmentState.candidates.has(element)
    ));
    const existing = this.handleRegistry.handles.get(element);
    if (existing) {
      for (const claimant of claimants) {
        existing.claimants.add(claimant);
        claimant.attachmentState.handles.set(element, existing.handle);
        claimant._clearErrors(element);
      }
      return this._refreshAutomaticHandle(element, existing, inspection);
    }
    const handle = this.controller.attach(element);
    const record: SharedAutomaticHandle = {
      claimants: new Set(claimants),
      handle,
      pending: null,
      signature: automaticComputedSignature(inspection),
    };
    this.handleRegistry.handles.set(element, record);
    for (const claimant of claimants) {
      claimant.attachmentState.handles.set(element, handle);
      claimant._clearErrors(element);
    }
    this.automaticCounters.handleAttaches += 1;
    const pending = handle.ready.then(
      () => undefined,
      (error) => this._disposeAutomaticHandle(element, record, error),
    );
    return this._trackAutomaticPending(record, pending);
  }

  _refreshRemainingAutomaticHandle(
    element: HTMLElement,
    record: SharedAutomaticHandle,
  ): Promise<void> | null {
    if (this.handleRegistry.handles.get(element) !== record) return null;
    if (!element.isConnected) {
      this._clearAutomaticHandleErrors(element, record);
      this._disposeAutomaticHandle(element, record);
      return null;
    }
    try {
      const inspection = this.controller.inspectAuthoredStyle(
        element,
        AUTOMATIC_SIGNATURE_PROPERTIES,
      );
      const problem = carrierProblem(inspection);
      if (problem) {
        this._disposeAutomaticHandle(element, record, new TypeError(problem));
        return null;
      }
      if (!hasShapeCarrier(inspection) || !inspection.requiresFallback) {
        this._clearAutomaticHandleErrors(element, record);
        this._disposeAutomaticHandle(element, record);
        return null;
      }
      for (const claimant of record.claimants) claimant._clearErrors(element);
      return this._refreshAutomaticHandle(element, record, inspection);
    } catch (error) {
      if (this.handleRegistry.handles.get(element) !== record) throw error;
      this._disposeAutomaticHandle(element, record, error);
      return null;
    }
  }

  async _refreshAttachments(): Promise<void> {
    if (this.native || this.destroyed) return;
    this.automaticCounters.attachmentPasses += 1;
    const candidates = this.attachmentState.candidates;
    const ready: Promise<unknown>[] = [];
    for (const [element, handle] of [...this.attachmentState.handles]) {
      const record = this.handleRegistry.handles.get(element);
      if (!record || record.handle !== handle || !record.claimants.has(this)) {
        this.attachmentState.handles.delete(element);
        continue;
      }
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
            const pending = this._refreshAutomaticHandle(element, record, inspection);
            if (pending) ready.push(pending);
            continue;
          }
        } catch (error) {
          failure = error;
        }
      }
      if (failure) this._recordElementError(failure, element);
      else this._clearErrors(element);
      const remaining = this._releaseAutomaticClaim(element);
      const pending = remaining && this._refreshRemainingAutomaticHandle(element, remaining);
      if (pending) ready.push(pending);
    }
    for (const element of candidates) {
      if (!(element instanceof this.document.defaultView.HTMLElement) || !element.isConnected) {
        if (element instanceof this.document.defaultView.HTMLElement) {
          const existing = this.handleRegistry.handles.get(element);
          if (existing) {
            this._clearAutomaticHandleErrors(element, existing);
            this._disposeAutomaticHandle(element, existing);
          }
        }
        this._clearErrors(element);
        continue;
      }
      if (this.attachmentState.handles.has(element)) continue;
      this.automaticCounters.computedChecks += 1;
      try {
        const inspection = this.controller.inspectAuthoredStyle(
          element,
          AUTOMATIC_SIGNATURE_PROPERTIES,
        );
        const problem = carrierProblem(inspection);
        if (problem) {
          const error = new TypeError(problem);
          this._recordElementError(error, element);
          const existing = this.handleRegistry.handles.get(element);
          if (existing) this._disposeAutomaticHandle(element, existing, error);
          continue;
        }
        this._clearErrors(element);
        if (!hasShapeCarrier(inspection) || !inspection.requiresFallback) {
          const existing = this.handleRegistry.handles.get(element);
          if (existing) {
            this._clearAutomaticHandleErrors(element, existing);
            this._disposeAutomaticHandle(element, existing);
          }
          continue;
        }
        const pending = this._claimAutomaticHandle(element, inspection);
        if (pending) ready.push(pending);
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
    for (const scope of this.scopes.values()) {
      const external = scope._hostObservationDependencies();
      if (!external) continue;
      for (const attribute of external.attributes) attributes.add(attribute);
      for (const event of external.events) events.add(event);
      characterData ||= external.characterData;
      conservative ||= external.conservative;
    }
    if (hasSelectors || this.attachmentState.inline.size > 0) events.add("resize");
    return Object.freeze({
      attributes: Object.freeze([...attributes].sort()),
      characterData,
      conservative,
      events: Object.freeze([...events].sort()),
      mediaQueries: Object.freeze([...mediaQueries].sort()),
      unobservableStates: Object.freeze([...unobservableStates].sort()),
    });
  }

  _hostObservationDependencies(): Readonly<SelectorObservation> | null {
    const observations = [...this._styleRecords()]
      .filter((record) => record.selectors.some(selectorHasHostPseudo))
      .map((record) => record.observation);
    for (const scope of this.scopes.values()) {
      const nested = scope._hostObservationDependencies();
      if (nested) observations.push(nested);
    }
    if (observations.length === 0) return null;
    const merged = mergeSelectorObservation(observations);
    return Object.freeze({
      ...merged,
      attributes: Object.freeze([...new Set([
        ...merged.attributes,
        ...(this.hostContextAttribute ? [this.hostContextAttribute] : []),
        "class",
        "dir",
        "id",
        "style",
      ])].sort()),
    });
  }

  _hasOwnHostSelectors(): boolean {
    return [...this._styleRecords()].some((record) => record.selectors.some(selectorHasHostPseudo));
  }

  _hasHostSelectors(): boolean {
    return this._hasOwnHostSelectors()
      || [...this.scopes.values()].some((scope) => scope._hasHostSelectors());
  }

  _queueHostSelectorRefreshes(): void {
    for (const scope of this.scopes.values()) {
      if (!scope.rootConnected) continue;
      if (scope._hasOwnHostSelectors()) {
        scope._queueRefresh({ candidates: true, attachments: true });
      }
      scope._queueHostSelectorRefreshes();
    }
  }

  _queueObservedStateRefresh(): void {
    this._queueRefresh({ candidates: true, attachments: true });
    this._queueHostSelectorRefreshes();
  }

  _stylesheetSelectors(): Set<string> {
    const selectors = new Set<string>();
    for (const record of this._styleRecords()) {
      for (const selector of record.selectors) selectors.add(selector);
    }
    return selectors;
  }

  _hasRawStyleSelector(): boolean {
    for (const record of this._styleRecords()) {
      if (record.observation.attributes.includes("style")) return true;
    }
    return false;
  }

  _invalidateStylesheetSourceMutations(records: readonly MutationRecord[]): void {
    const owners = new Set<StylesheetOwner>();
    const addNode = (node: Node) => {
      if (!(node instanceof this.document.defaultView.Element)) return;
      if (node.localName === "style" || node.localName === "link") {
        owners.add(node as StylesheetOwner);
      }
      for (const owner of node.querySelectorAll<StylesheetOwner>("style,link")) owners.add(owner);
    };
    for (const record of records) {
      if (record.type === "attributes") {
        const target = record.target;
        if (target instanceof this.document.defaultView.HTMLStyleElement) {
          if (record.attributeName === "type") owners.add(target);
        } else if (target instanceof this.document.defaultView.HTMLLinkElement
          && record.attributeName
          && SOURCE_GENERATION_ATTRIBUTE_NAMES.has(record.attributeName)) {
          owners.add(target);
        }
        continue;
      }
      if (record.type === "characterData") {
        const owner = record.target.parentElement;
        if (owner instanceof this.document.defaultView.HTMLStyleElement) owners.add(owner);
        continue;
      }
      if (record.target instanceof this.document.defaultView.HTMLStyleElement) {
        owners.add(record.target);
      }
      for (const node of [...record.addedNodes, ...record.removedNodes]) addNode(node);
    }
    for (const owner of owners) this._invalidateStylesheetSource(owner);
  }

  _expectedHostMarkerMutation(record: MutationRecord): boolean {
    const root = this.root;
    if (record.type === "attributes"
      && this.hostContextAttribute
      && root instanceof this.document.defaultView.ShadowRoot
      && record.target === root.host
      && record.attributeName === this.hostContextAttribute) {
      return root.host.getAttribute(this.hostContextAttribute) === this.hostContextOwnedValue;
    }
    return [...this.scopes.values()].some((scope) => scope._expectedHostMarkerMutation(record));
  }

  _planMutations(records: readonly MutationRecord[]): Readonly<AutomaticMutationPlan> {
    const externalRecords = records.filter((record) => !this._expectedHostMarkerMutation(record));
    this._invalidateStylesheetSourceMutations(externalRecords);
    const plan = planAutomaticMutations(externalRecords, {
      candidates: this.attachmentState.candidates,
      characterData: this.observation.state.characterData,
      conservative: this.observation.state.conservative,
      handles: this.attachmentState.handles,
      hasAuthoredInlineShape,
      HTMLElement: this.document.defaultView.HTMLElement,
      inline: this.attachmentState.inline,
      rawStyleSelector: this._hasRawStyleSelector(),
      selectors: () => this._stylesheetSelectors(),
    });
    const inheritedDirectionChanged = externalRecords.some((record) => (
      record.type === "attributes" && record.attributeName === "dir"
    ));
    if (plan.childListChanged || inheritedDirectionChanged || plan.baseChanged) {
      this._refreshRegisteredRootConnections(inheritedDirectionChanged, plan.baseChanged);
    }
    if (plan.sources || plan.candidates || plan.attachments || plan.childListChanged
      || inheritedDirectionChanged || plan.baseChanged) {
      this._queueHostSelectorRefreshes();
    }
    return plan;
  }

  _drainPendingMutations(): Readonly<AutomaticMutationPlan> | null {
    const records = this.observation.observer?.takeRecords() ?? [];
    return records.length > 0 ? this._planMutations(records) : null;
  }

  _handleMutations(records: readonly MutationRecord[]): void {
    const plan = this._planMutations(records);
    if (!plan.candidates && !plan.attachments) return;
    this._queueRefresh({
      sources: plan.sources,
      candidates: plan.candidates,
      attachments: true,
    });
  }

  _refreshRegisteredRootConnections(
    inheritedDirectionChanged = false,
    baseChanged = false,
  ): void {
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
      if (inheritedDirectionChanged && connected) {
        scope._queueRefresh({ candidates: true, attachments: true });
      }
      if (baseChanged && connected) {
        scope._queueRefresh({ sources: true, candidates: true, attachments: true });
      }
      scope._refreshRegisteredRootConnections(inheritedDirectionChanged, baseChanged);
    }
  }

  _removeObservationListeners(): void {
    const errors: unknown[] = [];
    for (const listener of this.observation.eventListeners.splice(0)) {
      try {
        listener.target.removeEventListener(listener.type, listener.listener, listener.options);
      } catch (error) {
        errors.push(error);
      }
    }
    for (const { list, listener, legacy } of this.observation.mediaListeners.splice(0)) {
      try {
        if (legacy) list.removeListener(listener);
        else list.removeEventListener("change", listener);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Cornerfill automatic listener teardown failed");
  }

  _configureObservation(): void {
    if (!this.observation.observer || !this.autoObserve) return;
    const state = this._observationDependencies();
    const configurationKey = JSON.stringify([state, this._hasHostSelectors()]);
    if (configurationKey === this.observation.configurationKey) return;
    const pending = this.observation.observer.takeRecords();
    this.observation.observer.disconnect();
    this.observation.state = state;
    const target = this.root === this.document ? this.document.documentElement : this.root;
    const options: MutationObserverInit = {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      subtree: true,
    };
    if (!this.observation.state.conservative) {
      options.attributeFilter = [...this.observation.state.attributes];
    }
    this.observation.observer.observe(target, options);
    this._removeObservationListeners();
    const eventRoot = this.root === this.document ? this.document : this.root;
    for (const type of this.observation.state.events) {
      const listener: EventListener = () => this._queueObservedStateRefresh();
      const windowEvent = ["hashchange", "popstate", "resize"].includes(type);
      const documentEvent = type === "fullscreenchange";
      const listenerTarget = (windowEvent
        ? this.document.defaultView
        : documentEvent ? this.document : eventRoot) as EventListenerTarget;
      const listenerOptions = windowEvent ? Object.freeze({ passive: true }) : true;
      listenerTarget.addEventListener(type, listener, listenerOptions);
      this.observation.eventListeners.push(Object.freeze({
        target: listenerTarget,
        type,
        listener,
        options: listenerOptions,
      }));
    }
    for (const query of this.observation.state.mediaQueries) {
      const list = this.document.defaultView.matchMedia?.(query);
      if (!list) continue;
      const listener = (_event: MediaQueryListEvent) => (
        this._queueRefresh({ candidates: true, attachments: true })
      );
      if (typeof list.addEventListener === "function") {
        list.addEventListener("change", listener);
        this.observation.mediaListeners.push(Object.freeze({ list, listener, legacy: false }));
      } else if (typeof list.addListener === "function") {
        list.addListener(listener);
        this.observation.mediaListeners.push(Object.freeze({ list, listener, legacy: true }));
      }
    }
    this.observation.configurationKey = configurationKey;
    if (pending.length > 0) this._handleMutations(pending);
    this.parentAuto?._configureObservation();
  }

  _installObserver(): void {
    if (!this.autoObserve || this.observation.observer || !this.document.defaultView.MutationObserver) return;
    this.observation.observer = new this.document.defaultView.MutationObserver((records) => (
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
    this.refreshState.sourceRequested ||= sources;
    this.refreshState.candidateRequested ||= candidates || sources;
    this.refreshState.attachmentRequested ||= attachments || candidates || sources;
    if (this.refreshState.queued) return;
    this.refreshState.queued = true;
    this.refreshState.frame = this.document.defaultView.requestAnimationFrame(() => {
      this.refreshState.frame = null;
      this.refreshState.queued = false;
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
    const pending = this._drainPendingMutations();
    sources ||= pending?.sources === true;
    candidates ||= pending?.candidates === true || pending?.sources === true;
    attachments ||= pending?.attachments === true || pending?.candidates === true;
    this.refreshState.workRequested = true;
    this.refreshState.sourceRequested ||= sources;
    this.refreshState.candidateRequested ||= candidates || sources;
    this.refreshState.attachmentRequested ||= attachments || candidates || sources;
    this.refreshState.retryFailedRequested ||= retryFailed;
    if (this.refreshState.sourceRequested) this._abortObsoleteSourceRequests();
    if (!this.refreshState.promise) {
      const task = (async () => {
        while (this.refreshState.workRequested && !this.destroyed) {
          this.refreshState.workRequested = false;
          const shouldDiscover = this.refreshState.sourceRequested;
          const shouldReconcile = this.refreshState.candidateRequested || shouldDiscover;
          const shouldRefresh = this.refreshState.attachmentRequested || shouldReconcile;
          const shouldRetryFailed = this.refreshState.retryFailedRequested;
          this.refreshState.sourceRequested = false;
          this.refreshState.candidateRequested = false;
          this.refreshState.attachmentRequested = false;
          this.refreshState.retryFailedRequested = false;
          const hadHostSelectors = shouldReconcile && this._hasOwnHostSelectors();
          if (shouldDiscover) await this._discoverSources(shouldRetryFailed);
          if (this.destroyed) break;
          const candidatesChanged = shouldReconcile && this._reconcileCandidates();
          if (this.destroyed) break;
          if (shouldRefresh) await this._refreshAttachments();
          if (candidatesChanged && this.parentAuto && !this.parentAuto.destroyed
            && (hadHostSelectors || this._hasOwnHostSelectors())) {
            await this.parentAuto._requestRefresh({ attachments: true });
          }
        }
        return this.explain();
      })();
      this.refreshState.promise = task.finally(() => {
        this.refreshState.promise = null;
      });
    }
    return this.refreshState.promise;
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
    this.sourceState.adoptedSources.set(sheet, source);
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
      const owner = stylesheetSourceElements(this.root).find((candidate) => candidate.sheet === stylesheet);
      if (!owner) {
        return Promise.reject(new TypeError("The stylesheet does not belong to this automatic scope"));
      }
      this._drainPendingMutations();
      this._replaceStylesheetSource(owner, source);
      return this.refresh();
    }
    if (!(stylesheet instanceof this.document.defaultView.HTMLStyleElement)
      && !(stylesheet instanceof this.document.defaultView.HTMLLinkElement)) {
      return Promise.reject(new TypeError("replaceStylesheetSource() requires a style, link, or CSSStyleSheet"));
    }
    if (stylesheet.ownerDocument !== this.document || stylesheet.getRootNode() !== this.root) {
      return Promise.reject(new TypeError("The stylesheet owner does not belong to this automatic scope"));
    }
    this._drainPendingMutations();
    this._replaceStylesheetSource(stylesheet, source);
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
      handleRegistry: this.handleRegistry,
      parentAuto: this,
      nativeQualification: this.nativeQualification,
      nonce: options.nonce ?? this.explicitNonce ?? undefined,
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
    this._configureObservation();
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
    if (element) return this.attachmentState.handles.get(element)?.explain() ?? null;
    return Object.freeze({
      schema: "cornerfill-auto@1",
      mode: this.native ? "native" : "fallback",
      fallbackLoaded: true,
      attached: this.attachmentState.handles.size,
      stylesheets: this.sourceState.stylesheets.size + this.sourceState.adoptedStylesheets.size,
      inlineElements: this.attachmentState.inline.size,
      scopes: this.scopes.size,
      errors: this._errors(),
      nativeQualification: this.nativeQualification,
      decision: Object.freeze({
        selected: this.native ? "native" : "fallback",
        reason: this.native
          ? "native-observable-proxy-satisfied"
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
        adoptedStylesheets: this.sourceState.adoptedStylesheets.size,
        counters: Object.freeze({ ...this.automaticCounters }),
        observation: this.observation.state,
        observing: this.autoObserve,
        ownership: this.ownershipBlocked ? "blocked-root" : "active",
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
    this.handleRegistry.scopes.delete(this);
    const errors: unknown[] = [];
    const attempt = (operation: () => void) => {
      try { operation(); } catch (error) { errors.push(error); }
    };
    for (const scope of [...this.scopes.values()]) attempt(() => scope.destroy());
    this.scopes.clear();
    const root = this.root;
    const hostContextAttribute = this.hostContextAttribute;
    if (hostContextAttribute
      && root instanceof this.document.defaultView.ShadowRoot
      && this.hostContextOwnedValue !== null
      && root.host.getAttribute(hostContextAttribute) === this.hostContextOwnedValue) {
      attempt(() => root.host.removeAttribute(hostContextAttribute));
    }
    this.hostContextConditions.clear();
    this.hostContextArguments.clear();
    this.hostContextOwnedValue = null;
    attempt(() => this.observation.observer?.disconnect());
    this.observation.observer = null;
    attempt(() => this._removeObservationListeners());
    this.attachmentState.candidates.clear();
    this.attachmentState.candidateProvenance.clear();
    for (const { companion, cssomHook } of this.sourceState.stylesheets.values()) {
      attempt(() => companion?.remove());
      attempt(() => cssomHook?.restore());
    }
    this.sourceState.stylesheets.clear();
    for (const release of this.sourceState.stylesheetStateObservers.values()) attempt(release);
    this.sourceState.stylesheetStateObservers.clear();
    for (const { companion } of this.sourceState.adoptedStylesheets.values()) {
      attempt(() => companion?.remove());
    }
    this.sourceState.adoptedStylesheets.clear();
    for (const [element, record] of this.attachmentState.inline) {
      attempt(() => this._restoreInlineRecord(element, record));
      attempt(() => this._restoreAuthoredInlineShape(element, record));
    }
    this.attachmentState.inline.clear();
    for (const element of [...this.attachmentState.handles.keys()]) {
      attempt(() => {
        const remaining = this._releaseAutomaticClaim(element);
        if (!remaining) return;
        for (const claimant of remaining.claimants) {
          if (!claimant.destroyed) claimant._queueRefresh({ candidates: true, attachments: true });
        }
      });
    }
    attempt(() => this._releaseCarrierRegistration());
    if (this.refreshState.frame !== null) {
      attempt(() => this.document.defaultView.cancelAnimationFrame(this.refreshState.frame!));
    }
    this.refreshState.frame = null;
    this.refreshState.queued = false;
    for (const owner of [...this.sourceState.requests.keys()]) attempt(() => this._abortSourceRequest(owner));
    this.sourceState.requests.clear();
    for (const record of this.sourceState.importRequests.values()) attempt(() => record.controller.abort());
    this.sourceState.importRequests.clear();
    for (const controller of this.sourceState.pendingFetches) attempt(() => controller.abort());
    this.sourceState.pendingFetches.clear();
    for (const cancel of this.sourceState.pendingStylesheetWaits) attempt(cancel);
    this.sourceState.pendingStylesheetWaits.clear();
    for (const release of this.sourceState.lateStylesheetLoads.values()) attempt(release);
    this.sourceState.lateStylesheetLoads.clear();
    this.diagnosticsByOwner.clear();
    if (this.parentAuto && this.root instanceof this.document.defaultView.ShadowRoot
      && this.parentAuto.scopes.get(this.root) === this) {
      this.parentAuto.scopes.delete(this.root);
      this.parentAuto._configureObservation();
      this.parentAuto._queueRefresh({ candidates: true, attachments: true });
    }
    if (this.ownsController) attempt(() => this.controller.destroy());
    if (errors.length > 0) throw new AggregateError(errors, "Cornerfill automatic teardown failed");
  }
}

export function installCornerfillAuto(
  options: Readonly<CornerfillAutoOptions> = {},
): CornerfillAutoControllerHandle {
  return new CornerfillAutoController(options);
}
