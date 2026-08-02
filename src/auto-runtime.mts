import { installCornerfill } from "./runtime.mjs";
import type {
  CornerfillControllerHandle,
  CornerfillControllerStats,
  CornerfillEntryExplanation,
  CornerfillHandle,
  CornerfillInstallOptions,
} from "./runtime.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import {
  parseCornerShape,
  parseCornerShapeValue,
  serializeShapeParameter,
} from "./values.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{ defaultView: RuntimeWindow }>;
type AutoRoot = Document | ShadowRoot;
type StylesheetOwner = HTMLStyleElement | HTMLLinkElement;
type DiagnosticOwner = object | string;
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

interface TextReplacement {
  readonly end: number;
  readonly start: number;
  readonly value: string;
}

export interface SelectorObservation {
  readonly attributes: readonly string[];
  readonly characterData: boolean;
  readonly conservative: boolean;
  readonly events: readonly string[];
}

interface SelectorRecord {
  readonly declaration: string | null;
  readonly selector: string;
  readonly source: string;
}

interface ElementDiagnostic {
  readonly declaration: string | null;
  readonly selector: string | null;
  readonly source: string;
}

interface CarrierCompilation {
  readonly css: string;
  readonly imports?: number | undefined;
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
  readonly selectorRecords: readonly Readonly<SelectorRecord>[];
  readonly selectors: readonly string[];
  readonly sources?: readonly string[] | undefined;
}

interface CarrierRule extends CSSRule {
  readonly cssRules?: CSSRuleList | undefined;
  readonly keyText?: string | undefined;
  readonly selectorText?: string | undefined;
  readonly style?: CSSStyleDeclaration | undefined;
}

interface InlineCarrierCompilation {
  readonly authoredShape: string;
  readonly declarations: readonly Readonly<{
    readonly priority: string;
    readonly property: string;
    readonly value: string;
  }>[];
  readonly shape: boolean;
  readonly signature: string;
}

interface ImportUrlParse {
  readonly rest: string;
  readonly url: string;
}

interface ImportFunctionParse {
  readonly rest: string;
  readonly value: string;
}

interface CompiledSourceTree extends CarrierCompilation {
  readonly imports: number;
  readonly sources: readonly string[];
}

interface StylesheetSource {
  readonly baseUrl: string;
  readonly sourceUrl: string;
  readonly text: string;
}

interface ImportStatement {
  readonly end: number;
  readonly prelude: string;
  readonly start: number;
}

interface ParsedImport {
  readonly layer: string | null;
  readonly media: string;
  readonly supports: string | null;
  readonly url: string;
}

interface DiagnosticDetails {
  readonly bucket?: DiagnosticOwner | undefined;
  readonly declaration?: string | null | undefined;
  readonly owner?: DiagnosticOwner | undefined;
  readonly ownerIdentity?: string | undefined;
  readonly selector?: string | null | undefined;
  readonly source?: string | undefined;
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

type DiagnosticError = Error & Readonly<{ cornerfillDiagnostic?: DiagnosticDetails | undefined }>;

interface CssomInsertMutation {
  readonly index: number;
  readonly kind: "insert";
  readonly rule: string;
}

interface CssomDeleteMutation {
  readonly index: number;
  readonly kind: "delete";
}

type CssomMutation = CssomDeleteMutation | CssomInsertMutation;

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
  cancelWait: (() => void) | null;
  readonly controller: AbortController | null;
  readonly importCache: Map<string, Promise<Readonly<CompiledSourceTree>>>;
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
  readonly controller?: CornerfillControllerHandle | undefined;
  readonly onError?: ((error: unknown, context: string) => void) | undefined;
  readonly root?: AutoRoot | undefined;
  readonly stylesheetTimeoutMs?: number | undefined;
}

interface InternalCornerfillAutoOptions extends CornerfillAutoOptions {
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
  readonly ready: Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null>;
  destroy(): void;
  explain(
    element?: HTMLElement | null,
  ): Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null;
  refresh(
    options?: Readonly<{ retryFailed?: boolean | undefined }>,
  ): Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null>;
  refreshAdoptedStyleSheet(
    sheet: CSSStyleSheet,
    source: string,
  ): Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null>;
  registerRoot(
    root: ShadowRoot,
    options?: Readonly<RegisterRootOptions>,
  ): CornerfillAutoControllerHandle;
  unregisterRoot(root: ShadowRoot): boolean;
}

const SHAPE_PROPERTIES = Object.freeze({
  "corner-shape": "--cornerfill-corner-shape",
  "corner-top-left-shape": "--cornerfill-corner-top-left-shape",
  "corner-top-right-shape": "--cornerfill-corner-top-right-shape",
  "corner-bottom-right-shape": "--cornerfill-corner-bottom-right-shape",
  "corner-bottom-left-shape": "--cornerfill-corner-bottom-left-shape",
  "corner-start-start-shape": "--cornerfill-corner-start-start-shape",
  "corner-start-end-shape": "--cornerfill-corner-start-end-shape",
  "corner-end-end-shape": "--cornerfill-corner-end-end-shape",
  "corner-end-start-shape": "--cornerfill-corner-end-start-shape",
});

type ShapeProperty = keyof typeof SHAPE_PROPERTIES;
type ShapeCarrier = (typeof SHAPE_PROPERTIES)[ShapeProperty];

const SHAPE_CARRIERS: readonly ShapeCarrier[] = Object.freeze(Object.values(SHAPE_PROPERTIES));
const SHAPE_PROPERTY_BY_CARRIER: Readonly<Record<ShapeCarrier, ShapeProperty>> = Object.freeze(Object.fromEntries(
  Object.entries(SHAPE_PROPERTIES).map(([property, carrier]) => [carrier, property]),
)) as Readonly<Record<ShapeCarrier, ShapeProperty>>;
const AUTO_STYLESHEET_ATTRIBUTE = "data-cornerfill-auto-styles";
const AUTO_UNSET = "__cornerfill_unset__";
const AUTO_PHYSICAL_SHAPE = "--cornerfill-auto-physical-shape";
const AUTO_LOGICAL_SHAPE = "--cornerfill-auto-logical-shape";
const CARRIER_REGISTRATIONS = new WeakMap<Document, CarrierRegistration>();

const PHYSICAL_SHAPE_PROPERTIES: readonly Exclude<ShapeProperty, "corner-shape">[] = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);

const LOGICAL_SHAPE_PROPERTIES: readonly Exclude<ShapeProperty, "corner-shape">[] = Object.freeze([
  "corner-start-start-shape",
  "corner-start-end-shape",
  "corner-end-end-shape",
  "corner-end-start-shape",
]);

const SHAPE_STATUS_PROPERTIES = Object.freeze(Object.fromEntries(
  [...PHYSICAL_SHAPE_PROPERTIES, ...LOGICAL_SHAPE_PROPERTIES].map((property) => (
    [property, `--cornerfill-auto-status-${property}`]
  )),
)) as Readonly<Record<Exclude<ShapeProperty, "corner-shape">, string>>;
const SHAPE_STATUS_CARRIERS = Object.freeze(Object.values(SHAPE_STATUS_PROPERTIES));

const AUTO_CARRIERS = Object.freeze([
  ...new Set([
    ...SHAPE_CARRIERS,
    ...SHAPE_STATUS_CARRIERS,
    AUTO_PHYSICAL_SHAPE,
    AUTO_LOGICAL_SHAPE,
  ]),
]);

const SHAPE_MARKERS = Object.freeze([
  ...SHAPE_STATUS_CARRIERS,
  AUTO_PHYSICAL_SHAPE,
  AUTO_LOGICAL_SHAPE,
]);

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
    "corner-shape or paint changes driven by CSS animations or transitions",
    "alternate stylesheet sets",
    "corner-shape rules inserted through CSSOM before Cornerfill starts",
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

const CONSERVATIVE_STATE_EVENTS = Object.freeze([
  "change",
  "focusin",
  "focusout",
  "hashchange",
  "input",
  "pointercancel",
  "pointerdown",
  "pointerout",
  "pointerover",
  "pointerup",
  "popstate",
  "toggle",
]);

function isShapeProperty(value: string): value is ShapeProperty {
  return Object.hasOwn(SHAPE_PROPERTIES, value);
}

function isCssWhitespaceOrComments(value: string): boolean {
  return value.replaceAll(/\/\*[\s\S]*?\*\//gu, "").trim() === "";
}

type CssTokenVisitor = (
  index: number,
  character: string,
  parentheses: number,
  brackets: number,
) => boolean | void;

function scanCssSyntax(source: string, start: number, visit: CssTokenVisitor): void {
  let quote: string | null = null;
  let comment = false;
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (visit(index, character, parentheses, brackets) === false) return;
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
  }
}

function declarationEnd(source: string, start: number): number {
  let end = source.length;
  scanCssSyntax(source, start, (index, character, parentheses, brackets) => {
    if (parentheses !== 0 || brackets !== 0 || (character !== ";" && character !== "}")) return;
    end = index;
    return false;
  });
  return end;
}

function declarationValue(raw: string): Readonly<{ priority: string; value: string }> {
  const normalized = raw.replaceAll(/\/\*[\s\S]*?\*\//gu, " ").trim();
  const important = /!\s*important\s*$/iu.test(normalized);
  return Object.freeze({
    value: normalized.replace(/!\s*important\s*$/iu, "").trim(),
    priority: important ? " !important" : "",
  });
}

function shapeStatusDeclarations(
  properties: readonly Exclude<ShapeProperty, "corner-shape">[],
  status: "ok" | "unsupported",
  priority: string,
): string {
  return properties.map((property) => (
    `${SHAPE_STATUS_PROPERTIES[property]}:${status}${priority};`
  )).join("");
}

function shapeCssWideDeclaration(
  property: ShapeProperty,
  value: string,
  priority: string,
  longhands: readonly Exclude<ShapeProperty, "corner-shape">[],
  marker: string,
): string {
  const carrierValue = /^(?:initial|unset)$/iu.test(value) ? AUTO_UNSET : value;
  const carriers = property === "corner-shape"
    ? longhands.map((longhand) => SHAPE_PROPERTIES[longhand])
    : [SHAPE_PROPERTIES[property]];
  return `${carriers.map((carrier) => `${carrier}:${carrierValue}${priority};`).join("")}`
    + `${longhands.map((longhand) => `${SHAPE_STATUS_PROPERTIES[longhand]}:${carrierValue}${priority};`).join("")}`
    + `${marker}:${carrierValue}${priority};`;
}

function potentiallyValidUnsupportedShape(value: string): boolean {
  const functionValue = /^superellipse\(\s*((?:calc|min|max|clamp)\([\s\S]*\))\s*\)$/iu.exec(value);
  if (!functionValue) return false;
  const expression = functionValue[1]!;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character !== "+" && character !== "-") continue;
    const before = expression[index - 1] ?? "";
    const after = expression[index + 1] ?? "";
    const prefix = expression.slice(0, index).trimEnd();
    const unary = prefix === ""
      || /[,(+\-*/]$/u.test(prefix)
      || /[eE]$/u.test(prefix);
    if (!unary && (!/\s/u.test(before) || !/\s/u.test(after))) return false;
  }
  return true;
}

function shapeCarrierDeclaration(property: ShapeProperty, rawValue: string): string {
  const { value, priority } = declarationValue(rawValue);
  const longhands: readonly Exclude<ShapeProperty, "corner-shape">[] = property === "corner-shape"
    ? PHYSICAL_SHAPE_PROPERTIES
    : [property as Exclude<ShapeProperty, "corner-shape">];
  const marker = property === "corner-shape" || PHYSICAL_SHAPE_PROPERTIES.includes(property)
    ? AUTO_PHYSICAL_SHAPE
    : AUTO_LOGICAL_SHAPE;
  if (/^(?:inherit|initial|revert|revert-layer|revert-rule|unset)$/iu.test(value)) {
    return shapeCssWideDeclaration(property, value, priority, longhands, marker);
  }
  try {
    if (/\bvar\s*\(/iu.test(value)) {
      const carrier = SHAPE_PROPERTIES[property];
      return `${carrier}:${value}${priority};${shapeStatusDeclarations(longhands, "ok", priority)}${marker}:1${priority};`;
    }
    if (property === "corner-shape") {
      const values = parseCornerShape(value);
      return `${PHYSICAL_SHAPE_PROPERTIES.map((longhand, index) => (
        `${SHAPE_PROPERTIES[longhand]}:${serializeShapeParameter(values[index]!)}${priority};`
      )).join("")}${shapeStatusDeclarations(longhands, "ok", priority)}${AUTO_PHYSICAL_SHAPE}:1${priority};`;
    }
    const carrier = SHAPE_PROPERTIES[property];
    const parsed = serializeShapeParameter(parseCornerShapeValue(value));
    return `${carrier}:${parsed}${priority};${shapeStatusDeclarations(longhands, "ok", priority)}${marker}:1${priority};`;
  } catch {
    return potentiallyValidUnsupportedShape(value)
      ? `${shapeStatusDeclarations(longhands, "unsupported", priority)}${marker}:1${priority};`
      : "";
  }
}

function allCarrierDeclaration(rawDeclaration: string, rawValue: string): string | null {
  const { value, priority } = declarationValue(rawValue);
  if (!/^(?:inherit|initial|revert|revert-layer|revert-rule|unset)$/iu.test(value)) return null;
  const carrierValue = /^(?:initial|unset)$/iu.test(value) ? AUTO_UNSET : value;
  return `${rawDeclaration};${AUTO_CARRIERS.map((carrier) => (
    `${carrier}:${carrierValue}${priority};`
  )).join("")}`;
}

function canonicalizeCornerShapeDeclarations(
  source: string,
  authoredDeclarations: string[] | null = null,
): string {
  const replacements: TextReplacement[] = [];
  let statementStart = 0;
  let skipThrough = -1;
  scanCssSyntax(source, 0, (index, character, parentheses, brackets) => {
    if (index <= skipThrough) return;
    if (parentheses !== 0 || brackets !== 0) return;
    if (character === ":") {
      const statement = source.slice(statementStart, index);
      const match = /([\w-]+)\s*$/u.exec(statement);
      if (!match || !isCssWhitespaceOrComments(statement.slice(0, match.index))) return;
      const property = match[1]!.toLowerCase();
      if (!isShapeProperty(property) && property !== "all") return;
      const end = declarationEnd(source, index + 1);
      const start = statementStart + match.index;
      if (property === "all") {
        const replacement = allCarrierDeclaration(
          source.slice(start, end),
          source.slice(index + 1, end),
        );
        if (!replacement) return;
        replacements.push(Object.freeze({ start, end, value: replacement }));
        skipThrough = end - 1;
        return;
      }
      authoredDeclarations?.push(source.slice(start, end).trim());
      replacements.push(Object.freeze({
        start,
        end,
        value: shapeCarrierDeclaration(property as ShapeProperty, source.slice(index + 1, end)),
      }));
      skipThrough = end - 1;
      return;
    }
    if (character === ";" || character === "{" || character === "}") statementStart = index + 1;
  });

  if (replacements.length === 0) return source;
  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += source.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }
  return output + source.slice(cursor);
}

function serializedDeclaration(
  style: CSSStyleDeclaration,
  property: string,
  value: string,
): string {
  const priority = style.getPropertyPriority(property);
  return `${property}:${value}${priority ? " !important" : ""};`;
}

function carrierDeclarations(
  style: CSSStyleDeclaration | null | undefined,
): Readonly<{ css: string; shape: boolean }> {
  if (!style?.getPropertyValue) return Object.freeze({ css: "", shape: false });
  let css = "";
  let shape = false;
  for (const property of [...SHAPE_CARRIERS, ...SHAPE_MARKERS]) {
    const value = style.getPropertyValue(property).trim();
    if (!value) continue;
    css += serializedDeclaration(style, property, value);
    shape = true;
  }
  return Object.freeze({ css, shape });
}

function diagnosticShapeDeclarations(style: CSSStyleDeclaration): readonly string[] {
  const declarations: string[] = [];
  for (const carrier of SHAPE_CARRIERS) {
    const value = style.getPropertyValue(carrier).trim();
    if (!value) continue;
    const property = SHAPE_PROPERTY_BY_CARRIER[carrier];
    const priority = style.getPropertyPriority(carrier);
    declarations.push(`${property}: ${value}${priority ? " !important" : ""}`);
  }
  if (declarations.length === 0 && SHAPE_STATUS_CARRIERS.some((property) => (
    style.getPropertyValue(property).trim() === "unsupported"
  ))) {
    declarations.push("corner-shape: <unsupported value>");
  }
  return Object.freeze(declarations);
}

function ruleHeader(rule: CSSRule): string {
  const index = rule.cssText.indexOf("{");
  return index < 0 ? "" : rule.cssText.slice(0, index).trim();
}

function matchingParenthesis(value: string, start: number): number {
  let end = -1;
  scanCssSyntax(value, start, (index, character, parentheses) => {
    if (character !== ")" || parentheses !== 1) return;
    end = index;
    return false;
  });
  return end;
}

function supportsShapeValue(property: string, value: string): boolean {
  if (/^(?:inherit|initial|revert|revert-layer|unset)$/iu.test(value)
    || /\bvar\s*\(/iu.test(value)) return true;
  try {
    if (property === "corner-shape") parseCornerShape(value);
    else parseCornerShapeValue(value);
    return true;
  } catch {
    return false;
  }
}

function carrierSupportsHeader(header: string): string {
  if (!/^@supports\b/iu.test(header) || !/\bcorner-[\w-]*shape\b/iu.test(header)) return header;
  const replacements: TextReplacement[] = [];
  let recognized = 0;
  for (let start = header.indexOf("("); start >= 0; start = header.indexOf("(", start + 1)) {
    const end = matchingParenthesis(header, start);
    if (end < 0) break;
    const inner = header.slice(start + 1, end);
    const declaration = /^\s*(corner-(?:top-left|top-right|bottom-right|bottom-left|start-start|start-end|end-end|end-start)-shape|corner-shape)\s*:\s*([\s\S]+?)\s*$/iu.exec(inner);
    if (!declaration) continue;
    const property = declaration[1]!.toLowerCase();
    const value = declaration[2]!;
    const supported = supportsShapeValue(property, value);
    replacements.push(Object.freeze({
      start: start + 1,
      end,
      value: supported
        ? `--cornerfill-supports-${property}:${value}`
        : "display:__cornerfill_invalid__",
    }));
    recognized += 1;
    start = end;
  }
  const occurrences = header.match(/\bcorner-(?:[\w-]*-)?shape\b/giu)?.length ?? 0;
  if (recognized !== occurrences) {
    throw new SyntaxError(`Automatic CSS cannot preserve complex corner-shape support condition: ${header}`);
  }
  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += header.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }
  return output + header.slice(cursor);
}

function serializeCarrierRules(
  rules: CSSRuleList | readonly CSSRule[],
  selectors: Set<string>,
  baseUrl: string,
  selectorRecords: Readonly<SelectorRecord>[],
  sourceIdentity: string,
  mediaQueries: Set<string>,
): string {
  let output = "";
  for (const rawRule of rules) {
    const rule = rawRule as CarrierRule;
    const header = ruleHeader(rule);
    if (/^@(?:-webkit-)?keyframes\b/iu.test(header)) continue;
    const declarations = carrierDeclarations(rule.style);
    if (typeof rule.selectorText === "string" && (rule.cssRules?.length ?? 0) > 0) {
      throw new SyntaxError(`Automatic CSS cannot preserve nested selector rule: ${rule.selectorText}`);
    }
    const nested = rule.cssRules
      ? serializeCarrierRules(
        rule.cssRules,
        selectors,
        baseUrl,
        selectorRecords,
        sourceIdentity,
        mediaQueries,
      )
      : "";
    if (typeof rule.selectorText === "string") {
      if (!declarations.css && !nested) continue;
      if (declarations.shape) {
        selectors.add(rule.selectorText);
        selectorRecords.push(Object.freeze({
          source: sourceIdentity,
          selector: rule.selectorText,
          declaration: rule.style ? diagnosticShapeDeclarations(rule.style).join("; ") || null : null,
        }));
      }
      output += `${rule.selectorText}{${declarations.css}${nested}}`;
      continue;
    }
    if (typeof rule.keyText === "string") {
      if (declarations.css) output += `${rule.keyText}{${declarations.css}}`;
      continue;
    }
    if (nested) {
      if (/^@layer\s*$/iu.test(header)) {
        throw new SyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
      }
      if (/^@supports\b/iu.test(header)) output += `${carrierSupportsHeader(header)}{${nested}}`;
      else if (/^@media\b/iu.test(header) || /^@layer\s+[\w.-]+\s*$/iu.test(header)) {
        if (/^@media\b/iu.test(header)) mediaQueries.add(header.replace(/^@media\b/iu, "").trim());
        output += `${header}{${nested}}`;
      } else {
        throw new SyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
      }
    }
  }
  return output;
}

const SELECTOR_STATE_EVENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  active: Object.freeze(["pointercancel", "pointerdown", "pointerup"]),
  hover: Object.freeze(["pointerover", "pointerout"]),
  focus: Object.freeze(["focusin", "focusout"]),
  "focus-visible": Object.freeze(["focusin", "focusout"]),
  "focus-within": Object.freeze(["focusin", "focusout"]),
  checked: Object.freeze(["input", "change"]),
  default: Object.freeze(["input", "change"]),
  disabled: Object.freeze(["input", "change"]),
  enabled: Object.freeze(["input", "change"]),
  indeterminate: Object.freeze(["input", "change"]),
  invalid: Object.freeze(["input", "change"]),
  "in-range": Object.freeze(["input", "change"]),
  optional: Object.freeze(["input", "change"]),
  "out-of-range": Object.freeze(["input", "change"]),
  "placeholder-shown": Object.freeze(["input", "change"]),
  "read-only": Object.freeze(["input", "change"]),
  "read-write": Object.freeze(["input", "change"]),
  required: Object.freeze(["input", "change"]),
  "user-invalid": Object.freeze(["input", "change"]),
  "user-valid": Object.freeze(["input", "change"]),
  valid: Object.freeze(["input", "change"]),
  modal: Object.freeze(["toggle"]),
  open: Object.freeze(["toggle"]),
  "popover-open": Object.freeze(["toggle"]),
  target: Object.freeze(["hashchange", "popstate"]),
  "target-within": Object.freeze(["hashchange", "popstate"]),
  fullscreen: Object.freeze(["fullscreenchange"]),
});

const STATIC_SELECTOR_PSEUDOS = new Set<string>([
  "any-link", "empty", "first-child", "first-of-type", "has", "is", "lang",
  "last-child", "last-of-type", "link", "local-link", "not", "nth-child",
  "nth-last-child", "nth-last-of-type", "nth-of-type", "only-child",
  "only-of-type", "root", "scope", "where",
]);

function selectorObservation(selectors: Iterable<string>): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  let characterData = false;
  let conservative = false;
  for (const selector of selectors) {
    if (selector.includes("\\")) conservative = true;
    if (/(?:^|[^\w-])\.[_a-z-]/iu.test(selector)) attributes.add("class");
    if (/(?:^|[^\w-])#[_a-z-]/iu.test(selector)) attributes.add("id");
    const attributeMatches = [...selector.matchAll(/\[\s*([_a-z][\w-]*)/giu)];
    for (const match of attributeMatches) attributes.add(match[1]!.toLowerCase());
    if ((selector.match(/\[/gu)?.length ?? 0) !== attributeMatches.length) conservative = true;
    for (const match of selector.matchAll(/(?:^|[^:]):([a-z-]+)/giu)) {
      const pseudo = match[1]!.toLowerCase();
      const stateEvents = SELECTOR_STATE_EVENTS[pseudo];
      if (stateEvents) {
        for (const event of stateEvents) events.add(event);
        if (["checked", "default", "disabled", "enabled", "required", "optional"].includes(pseudo)) {
          attributes.add(pseudo === "enabled" ? "disabled" : pseudo);
        }
        if (["modal", "open"].includes(pseudo)) attributes.add("open");
        if (pseudo === "popover-open") attributes.add("popover");
        continue;
      }
      if (pseudo === "dir") {
        attributes.add("dir");
        continue;
      }
      if (pseudo === "lang") {
        attributes.add("lang");
        continue;
      }
      if (pseudo === "empty") characterData = true;
      else if (!STATIC_SELECTOR_PSEUDOS.has(pseudo)) conservative = true;
    }
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    events: Object.freeze([...events].sort()),
    characterData,
    conservative,
  });
}

function parseCarrierSheet(
  document: RuntimeDocument,
  source: string,
  baseUrl = document.baseURI,
  nonce: string | null = null,
  sourceIdentity = baseUrl,
): Readonly<CarrierCompilation> {
  const transformed = canonicalizeCornerShapeDeclarations(source);
  let sheet: CSSStyleSheet | null;
  let parserStyle: HTMLStyleElement | null = null;
  try {
    sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync(transformed);
  } catch {
    parserStyle = document.createElement("style");
    parserStyle.media = "not all";
    if (nonce) parserStyle.setAttribute("nonce", nonce);
    parserStyle.textContent = transformed;
    (document.head ?? document.documentElement).append(parserStyle);
    sheet = parserStyle.sheet;
  }
  try {
    const selectors = new Set<string>();
    const selectorRecords: Readonly<SelectorRecord>[] = [];
    const mediaQueries = new Set<string>();
    const css = serializeCarrierRules(
      sheet?.cssRules ?? [],
      selectors,
      baseUrl,
      selectorRecords,
      sourceIdentity,
      mediaQueries,
    );
    const selectorList = Object.freeze([...selectors]);
    return Object.freeze({
      css,
      selectors: selectorList,
      selectorRecords: Object.freeze(selectorRecords),
      observation: selectorObservation(selectorList),
      mediaQueries: Object.freeze([...mediaQueries].filter(Boolean).sort()),
    });
  } finally {
    parserStyle?.remove();
  }
}

function cssStatementEnd(source: string, start: number): number {
  let end = -1;
  scanCssSyntax(source, start, (index, character, parentheses, brackets) => {
    if (parentheses !== 0 || brackets !== 0) return;
    if (character === ";") {
      end = index;
      return false;
    }
    if (character === "{") return false;
  });
  return end;
}

function skipCssTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/\s/u.test(source[index]!)) {
      index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      return end < 0 ? source.length : skipCssTrivia(source, end + 2);
    }
    break;
  }
  return index;
}

function leadingImportStatements(
  source: string,
): Readonly<{ imports: readonly Readonly<ImportStatement>[]; local: string }> {
  const imports: Readonly<ImportStatement>[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = skipCssTrivia(source, cursor);
    if (start >= source.length) break;
    const importMatch = /^@import\b/iu.exec(source.slice(start));
    const charsetMatch = /^@charset\b/iu.exec(source.slice(start));
    const layerMatch = /^@layer\b/iu.exec(source.slice(start));
    if (importMatch) {
      const end = cssStatementEnd(source, start + importMatch[0].length);
      if (end < 0) throw new SyntaxError("Automatic CSS found a malformed top-level @import rule");
      imports.push(Object.freeze({ start, end: end + 1, prelude: source.slice(start, end + 1) }));
      cursor = end + 1;
      continue;
    }
    if (charsetMatch || layerMatch) {
      const matchedRule = charsetMatch ?? layerMatch;
      if (!matchedRule) break;
      const end = cssStatementEnd(source, start + matchedRule[0].length);
      if (end >= 0) {
        cursor = end + 1;
        continue;
      }
    }
    break;
  }
  if (imports.length === 0) return Object.freeze({ imports: Object.freeze([]), local: source });
  let local = "";
  let position = 0;
  for (const record of imports) {
    local += source.slice(position, record.start);
    local += " ".repeat(record.end - record.start);
    position = record.end;
  }
  local += source.slice(position);
  return Object.freeze({ imports: Object.freeze(imports), local });
}

function unquoteImportUrl(value: string): Readonly<ImportUrlParse> {
  const trimmed = value.trim();
  const quoted = /^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/u.exec(trimmed);
  if (quoted) return Object.freeze({
    rest: trimmed.slice(skipCssTrivia(trimmed, quoted[0].length)).trim(),
    url: decodeCssEscapes(quoted[1] ?? quoted[2] ?? ""),
  });
  if (!/^url\s*\(/iu.test(trimmed)) {
    const unquoted = /^((?:\\[\s\S]|[^\s"'()])+)/u.exec(trimmed);
    if (unquoted) return Object.freeze({
      rest: trimmed.slice(skipCssTrivia(trimmed, unquoted[0].length)).trim(),
      url: decodeCssEscapes(unquoted[1] ?? ""),
    });
    throw new SyntaxError("Automatic CSS supports quoted or url() @import URLs");
  }
  const start = trimmed.indexOf("(");
  const end = matchingParenthesis(trimmed, start);
  if (end < 0) throw new SyntaxError("Automatic CSS found an unterminated @import url()");
  const inner = trimmed.slice(start + 1, end).trim();
  const nested: Readonly<ImportUrlParse> = unquoteImportUrl(inner);
  if (nested.rest) throw new SyntaxError("Automatic CSS found an invalid @import url()");
  return Object.freeze({
    rest: trimmed.slice(skipCssTrivia(trimmed, end + 1)).trim(),
    url: nested.url,
  });
}

function decodeCssEscapes(value: string): string {
  return String(value).replaceAll(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|((?:\r\n|[\n\f\r]))|([\s\S]))/giu,
    (
      _source: string,
      hexadecimal: string | undefined,
      newline: string | undefined,
      character: string | undefined,
    ) => {
      if (newline) return "";
      if (!hexadecimal) return character ?? "";
      const codePoint = Number.parseInt(hexadecimal, 16);
      return codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? "\ufffd"
        : String.fromCodePoint(codePoint);
    },
  );
}

function consumeImportFunction(value: string, name: string): Readonly<ImportFunctionParse> | null {
  if (!new RegExp(`^${name}\\s*\\(`, "iu").test(value)) return null;
  const start = value.indexOf("(");
  const end = matchingParenthesis(value, start);
  if (end < 0) throw new SyntaxError(`Automatic CSS found an unterminated @import ${name}()`);
  return Object.freeze({
    value: value.slice(start + 1, end).trim(),
    rest: value.slice(end + 1).trim(),
  });
}

function parseImportStatement(statement: string, baseUrl: string): Readonly<ParsedImport> {
  const body = statement.replace(/^@import\b/iu, "").replace(/;\s*$/u, "").trim();
  const parsedUrl = unquoteImportUrl(body);
  let rest = parsedUrl.rest;
  let layer = null;
  let supports = null;
  if (/^layer\b/iu.test(rest)) {
    const layerFunction = consumeImportFunction(rest, "layer");
    if (!layerFunction) throw new SyntaxError("Automatic CSS refuses anonymous @import layers");
    if (!/^[-_a-z][\w.-]*$/iu.test(layerFunction.value)) {
      throw new SyntaxError(`Automatic CSS cannot preserve @import layer name: ${layerFunction.value}`);
    }
    layer = layerFunction.value;
    rest = layerFunction.rest;
  }
  const supportsFunction = consumeImportFunction(rest, "supports");
  if (supportsFunction) {
    supports = supportsFunction.value;
    rest = supportsFunction.rest;
  }
  return Object.freeze({
    url: new URL(parsedUrl.url, baseUrl).href,
    layer,
    supports,
    media: rest,
  });
}

function wrapImportedCarrierCss(css: string, imported: Readonly<ParsedImport>): string {
  let output = css;
  if (imported.media) output = `@media ${imported.media}{${output}}`;
  if (imported.supports) {
    const condition = /^(?:\(|not\b)/iu.test(imported.supports)
      ? imported.supports
      : `(${imported.supports})`;
    output = `${carrierSupportsHeader(`@supports ${condition}`)}{${output}}`;
  }
  if (imported.layer) output = `@layer ${imported.layer}{${output}}`;
  return output;
}

function mergeSelectorObservation(
  records: readonly Readonly<SelectorObservation>[],
): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  let characterData = false;
  let conservative = false;
  for (const record of records) {
    for (const attribute of record.attributes) attributes.add(attribute);
    for (const event of record.events) events.add(event);
    characterData ||= record.characterData;
    conservative ||= record.conservative;
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    events: Object.freeze([...events].sort()),
    characterData,
    conservative,
  });
}

function annotateDiagnostic(error: unknown, details: Readonly<DiagnosticDetails>): DiagnosticError {
  const value = (error instanceof Error ? error : new Error(String(error))) as DiagnosticError;
  const previous = value.cornerfillDiagnostic ?? {};
  Object.defineProperty(value, "cornerfillDiagnostic", {
    configurable: true,
    value: Object.freeze({ ...details, ...previous }),
  });
  return value;
}

function mutateStylesheetModel(
  document: RuntimeDocument,
  source: string,
  mutation: Readonly<CssomMutation>,
  nonce: string | null = null,
): string {
  let sheet: CSSStyleSheet | null;
  let parserStyle: HTMLStyleElement | null = null;
  try {
    sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync(source);
  } catch {
    parserStyle = document.createElement("style");
    parserStyle.media = "not all";
    if (nonce) parserStyle.setAttribute("nonce", nonce);
    parserStyle.textContent = source;
    (document.head ?? document.documentElement).append(parserStyle);
    sheet = parserStyle.sheet;
  }
  try {
    if (!sheet) throw new Error("temporary CSS parser did not expose a stylesheet");
    if (mutation.kind === "insert") {
      sheet.insertRule(canonicalizeCornerShapeDeclarations(mutation.rule), mutation.index);
    } else sheet.deleteRule(mutation.index);
    return [...(sheet.cssRules ?? [])].map((rule) => rule.cssText).join("\n");
  } finally {
    parserStyle?.remove();
  }
}

function computedCarrier(computed: CSSStyleDeclaration, property: string): string {
  const value = computed.getPropertyValue(property).trim();
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

function automaticComputedSignature(computed: CSSStyleDeclaration): string {
  return [
    computed.visibility,
    computed.direction,
    computed.writingMode,
    ...AUTOMATIC_COMPUTED_PROPERTIES.map((property) => computed.getPropertyValue(property)),
    ...AUTO_CARRIERS.map((property) => computedCarrier(computed, property)),
  ].join("\n");
}

function automaticStyleMutationSignature(value: unknown): string {
  return String(value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      if (property === "--cornerfill-live-image"
        || property === "opacity"
        || property === "filter"
        || property === "will-change"
        || property === "translate"
        || property === "rotate"
        || property === "scale"
        || property === "perspective"
        || property === "perspective-origin") return false;
      return property !== "transform" && !property.startsWith("transform-")
        && property !== "-webkit-transform" && !property.startsWith("-webkit-transform-");
    })
    .join(";");
}

function carrierProblem(computed: CSSStyleDeclaration): string | null {
  if (SHAPE_STATUS_CARRIERS.some((property) => computedCarrier(computed, property) === "unsupported")) {
    return "Automatic CSS cannot resolve this corner-shape value; use cornerfill/runtime for explicit state.";
  }
  const variableShorthand = computedCarrier(computed, SHAPE_PROPERTIES["corner-shape"]);
  const competingLonghand = [...PHYSICAL_SHAPE_PROPERTIES, ...LOGICAL_SHAPE_PROPERTIES]
    .some((property) => computedCarrier(computed, SHAPE_PROPERTIES[property]));
  if (variableShorthand && competingLonghand) {
    return "Automatic CSS refuses a variable corner-shape shorthand combined with longhands because their cascade order cannot be preserved.";
  }
  if (computedCarrier(computed, AUTO_PHYSICAL_SHAPE)
    && computedCarrier(computed, AUTO_LOGICAL_SHAPE)) {
    return "Automatic CSS refuses mixed physical and logical corner-shape declarations because their cross-family cascade cannot be preserved.";
  }
  return null;
}

function hasShapeCarrier(computed: CSSStyleDeclaration): boolean {
  return SHAPE_CARRIERS.some((property) => computedCarrier(computed, property));
}

function stylesheetElements(root: AutoRoot): StylesheetOwner[] {
  return [...root.querySelectorAll<StylesheetOwner>(
    `style:not([${AUTO_STYLESHEET_ATTRIBUTE}]):not([data-cornerfill-ownership-styles]),link[rel~="stylesheet"]`,
  )].filter(stylesheetElementIsEligible);
}

function isStylesheetLink(owner: StylesheetOwner): owner is HTMLLinkElement {
  return owner.localName === "link";
}

function stylesheetElementIsEligible(owner: StylesheetOwner): boolean {
  if (!owner?.isConnected || owner.disabled) return false;
  if (owner.localName === "style") {
    const type = (owner.getAttribute("type") ?? "").trim().toLowerCase();
    return type === "" || type === "text/css";
  }
  if (!isStylesheetLink(owner) || !owner.relList.contains("stylesheet")) return false;
  return !owner.relList.contains("alternate");
}

function authoredShapeInlineElements(root: AutoRoot): Element[] {
  return [...root.querySelectorAll('[style*="corner-" i][style*="shape" i]')];
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
      throw new Error(`${context} was blocked or discarded`);
    }
  } catch (error) {
    if (error instanceof Error && /blocked or discarded/u.test(error.message)) throw error;
    throw new Error(`${context} is not readable after insertion`, { cause: error });
  }
}

function stylesheetKey(owner: StylesheetOwner): string {
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
  const transformed = canonicalizeCornerShapeDeclarations(String(source), authoredDeclarations);
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
    ...runtime
  } = options;
  return { ...runtime, document };
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
  declare readonly ready: Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null>;
  declare refreshFrame: number | null;
  declare refreshPromise: Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null> | null;
  declare refreshQueued: boolean;
  declare registrationAcquired: boolean;
  declare registrationStyle: HTMLStyleElement | null;
  declare retryFailedRequested: boolean;
  declare readonly root: AutoRoot;
  declare readonly scopes: Map<ShadowRoot, CornerfillAutoController>;
  declare sourceApplyFrame: number | null;
  declare sourceApplyFrameResolve: (() => void) | null;
  declare sourceApplyPromise: Promise<void> | null;
  declare sourceApplyRequested: boolean;
  declare readonly sourceOwnerIds: WeakMap<object, number>;
  declare sourceRequested: boolean;
  declare readonly sourceRequests: Map<StylesheetOwner, SourceRequest>;
  declare readonly stylesheets: Map<StylesheetOwner, Readonly<StylesheetRecord>>;
  declare readonly stylesheetTimeoutMs: number;
  declare workRequested: boolean;

  constructor(options: Readonly<InternalCornerfillAutoOptions> = {}) {
    const document = options.document ?? options.root?.ownerDocument ?? globalThis.document;
    if (!document?.defaultView) throw new TypeError("installCornerfillAuto() requires a browser document");
    this.document = document as RuntimeDocument;
    this.root = options.root ?? this.document;
    this.stylesheetTimeoutMs = options.stylesheetTimeoutMs ?? 3_000;
    if (!Number.isFinite(this.stylesheetTimeoutMs) || this.stylesheetTimeoutMs <= 0) {
      throw new TypeError("stylesheetTimeoutMs must be a finite positive number");
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
    this.includeAdoptedStyleSheets = options.adoptedStyleSheets === true;
    this.adoptedStylesheetSources = new WeakMap();
    this.parentAuto = options.parentAuto ?? null;
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.stylesheets = new Map();
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
    this.sourceApplyPromise = null;
    this.sourceApplyFrame = null;
    this.sourceApplyFrameResolve = null;
    this.sourceApplyRequested = false;
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
    return Object.freeze([...this.diagnosticsByOwner.values()]
      .flatMap((records) => [...records.values()]));
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

  async _source(
    owner: StylesheetOwner,
    request: SourceRequest,
  ): Promise<Readonly<StylesheetSource>> {
    this.automaticCounters.sourceReads += 1;
    if (!isStylesheetLink(owner)) return Object.freeze({
      text: owner.textContent ?? "",
      baseUrl: this.document.baseURI,
      sourceUrl: this._ownerIdentity(owner),
    });
    const url = new URL(owner.href, this.document.baseURI);
    const controller = request.controller;
    if (!controller) throw new Error("linked stylesheet request is missing its abort controller");
    this.pendingFetches.add(controller);
    const crossOrigin = owner.crossOrigin;
    const init: RequestInit = {
      credentials: crossOrigin === "use-credentials"
        ? "include"
        : crossOrigin === "anonymous"
          ? "omit"
          : url.origin === new URL(this.document.baseURI).origin ? "same-origin" : "omit",
      mode: "cors",
      signal: controller.signal,
    };
    if (owner.integrity) init.integrity = owner.integrity;
    if (owner.referrerPolicy) init.referrerPolicy = owner.referrerPolicy as ReferrerPolicy;
    try {
      const response = await this.document.defaultView.fetch(url.href, init);
      if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}: ${url.href}`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
      if (contentType !== "text/css") {
        throw new TypeError(`stylesheet response has invalid CSS MIME type ${contentType || "(missing)"}: ${url.href}`);
      }
      return Object.freeze({
        text: await response.text(),
        baseUrl: response.url || url.href,
        sourceUrl: response.url || url.href,
      });
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
      : crossOrigin === "anonymous"
        ? "omit"
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
          const response = await this.document.defaultView.fetch(url, init);
          if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}`);
          const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
          if (contentType !== "text/css") {
            throw new TypeError(`stylesheet response has invalid CSS MIME type ${contentType || "(missing)"}`);
          }
          const sourceUrl = response.url || url;
          return Object.freeze({
            text: await response.text(),
            baseUrl: sourceUrl,
            sourceUrl,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`@import ${url} failed: ${message}`, { cause: error });
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
    return record.promise;
  }

  async _compileSourceTree(
    source: Readonly<StylesheetSource>,
    owner: StylesheetOwner,
    request: SourceRequest,
    stack: readonly string[] = [],
  ): Promise<Readonly<CompiledSourceTree>> {
    const identity = source.sourceUrl || source.baseUrl;
    if (stack.includes(identity)) {
      throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...stack, identity].join(" -> ")}`);
    }
    const nextStack = [...stack, identity];
    request.provenance.add(identity);
    const split = leadingImportStatements(source.text);
    const parts: CarrierCompilation[] = [];
    for (const statement of split.imports) {
      let imported: Readonly<ParsedImport>;
      try {
        imported = parseImportStatement(statement.prelude, source.baseUrl);
      } catch (error) {
        throw annotateDiagnostic(error, { source: identity, declaration: statement.prelude });
      }
      if (nextStack.includes(imported.url)) {
        throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...nextStack, imported.url].join(" -> ")}`);
      }
      let compiledPromise = request.importCache.get(imported.url);
      if (!compiledPromise) {
        compiledPromise = (async () => {
          const importedSource = await this._importSource(imported.url, owner, request);
          return this._compileSourceTree(importedSource, owner, request, nextStack);
        })();
        request.importCache.set(imported.url, compiledPromise);
      }
      const compiled = await compiledPromise;
      parts.push(Object.freeze({
        ...compiled,
        css: wrapImportedCarrierCss(compiled.css, imported),
        mediaQueries: Object.freeze([
          ...compiled.mediaQueries,
          ...(imported.media ? [imported.media] : []),
        ]),
      }));
    }
    let local: Readonly<CarrierCompilation>;
    try {
      local = parseCarrierSheet(this.document, split.local, source.baseUrl, this.nonce, identity);
    } catch (error) {
      throw annotateDiagnostic(error, { source: identity });
    }
    parts.push(local);
    const selectors = Object.freeze([...new Set(parts.flatMap((part) => part.selectors))]);
    return Object.freeze({
      css: parts.map((part) => part.css).join(""),
      selectors,
      selectorRecords: Object.freeze(parts.flatMap((part) => part.selectorRecords)),
      observation: mergeSelectorObservation(parts.map((part) => part.observation)),
      mediaQueries: Object.freeze([...new Set(parts.flatMap((part) => part.mediaQueries))].sort()),
      sources: Object.freeze([...request.provenance]),
      imports: split.imports.length,
    });
  }

  _waitForLinkedStylesheet(owner: StylesheetOwner, request: SourceRequest): Promise<void> {
    if (!isStylesheetLink(owner)) return Promise.resolve();
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
        new Error(`browser stylesheet load timed out: ${owner.href}`),
      ), this.stylesheetTimeoutMs);
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
    key = stylesheetKey(owner),
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
      failed: false,
      media: stylesheetMedia(owner),
      selectors: compiled.selectors,
      selectorRecords: compiled.selectorRecords ?? Object.freeze([]),
      observation: compiled.observation,
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
  ): Readonly<StylesheetRecord> {
    const existing = this.stylesheets.get(owner);
    existing?.companion?.remove();
    const record: Readonly<StylesheetRecord> = Object.freeze({
      owner,
      companion: null,
      key,
      failed: true,
      media: stylesheetMedia(owner),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      observation: selectorObservation([]),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([key]),
      imports: 0,
      cssomHook,
    });
    this.stylesheets.set(owner, record);
    this._configureObservation();
    this._scheduleSourceApplication();
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
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.adoptedStylesheets.set(sheet, record);
    this._configureObservation();
    this._scheduleSourceApplication();
    return record;
  }

  _processAdoptedStylesheet(sheet: CSSStyleSheet, retryFailed = false): void {
    if (this.destroyed) return;
    const existing = this.adoptedStylesheets.get(sheet);
    if (existing?.failed && !retryFailed) return;
    const identity = existing?.identity ?? this._adoptedStylesheetIdentity(sheet);
    this._clearErrors(sheet);
    let source: string;
    let media: string;
    try {
      source = this.adoptedStylesheetSources.get(sheet) ?? adoptedStylesheetSource(sheet);
      media = adoptedStylesheetMedia(sheet);
      this.automaticCounters.sourceReads += 1;
    } catch (error) {
      this._recordError(error, identity, { bucket: sheet, ownerIdentity: identity });
      this._writeFailedAdoptedStylesheetRecord(sheet, identity);
      return;
    }
    const key = `${identity}\n${sheet.disabled ? "disabled" : "enabled"}\n${media}\n${source}`;
    if (existing?.key === key) return;
    try {
      const compiled = parseCarrierSheet(
        this.document,
        source,
        this.document.baseURI,
        this.nonce,
        identity,
      );
      this.automaticCounters.sourceCompiles += 1;
      this._writeAdoptedStylesheetRecord(sheet, compiled, { identity, key, media });
    } catch (error) {
      this._recordError(error, identity, { bucket: sheet, ownerIdentity: identity });
      this._writeFailedAdoptedStylesheetRecord(sheet, identity, key);
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
      this._scheduleSourceApplication();
    }
    for (const sheet of sheets) this._processAdoptedStylesheet(sheet, retryFailed);
    for (const sheet of sheets) {
      const companion = this.adoptedStylesheets.get(sheet)?.companion;
      if (!companion) continue;
      if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
      else this.root.append(companion);
    }
  }

  _createCssomHook(
    owner: StylesheetOwner,
    source: string,
    baseUrl: string,
  ): CssomHook | null {
    const sheet = owner.sheet;
    if (!sheet?.insertRule || !sheet?.deleteRule) return null;
    const insertDescriptor = Object.getOwnPropertyDescriptor(sheet, "insertRule");
    const deleteDescriptor = Object.getOwnPropertyDescriptor(sheet, "deleteRule");
    const originalInsert = sheet.insertRule;
    const originalDelete = sheet.deleteRule;
    let hook: CssomHook;
    hook = {
      active: true,
      baseUrl,
      modelSource: canonicalizeCornerShapeDeclarations(source),
      owner,
      sheet,
      restore: () => {
        if (!hook.active) return;
        hook.active = false;
        if (sheet.insertRule === wrappedInsert) {
          if (insertDescriptor) Object.defineProperty(sheet, "insertRule", insertDescriptor);
          else Reflect.deleteProperty(sheet, "insertRule");
        }
        if (sheet.deleteRule === wrappedDelete) {
          if (deleteDescriptor) Object.defineProperty(sheet, "deleteRule", deleteDescriptor);
          else Reflect.deleteProperty(sheet, "deleteRule");
        }
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
        this._writeFailedStylesheetRecord(owner, stylesheetKey(owner), hook);
      }
    };
    const wrappedInsert = function wrappedCornerfillInsert(
      this: CSSStyleSheet,
      rule: string,
      index?: number,
    ): number {
      const result = arguments.length < 2
        ? Reflect.apply(originalInsert, this, [rule])
        : Reflect.apply(originalInsert, this, [rule, index]);
      applyMutation({ kind: "insert", rule: String(rule), index: result });
      return result;
    };
    const wrappedDelete = function wrappedCornerfillDelete(
      this: CSSStyleSheet,
      index: number,
    ): void {
      const result = Reflect.apply(originalDelete, this, [index]);
      applyMutation({ kind: "delete", index });
      return result;
    };
    try {
      Object.defineProperty(sheet, "insertRule", {
        configurable: true,
        value: wrappedInsert,
        writable: true,
      });
      Object.defineProperty(sheet, "deleteRule", {
        configurable: true,
        value: wrappedDelete,
        writable: true,
      });
      return hook;
    } catch {
      hook.restore();
      return null;
    }
  }

  _scheduleSourceApplication(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.sourceApplyRequested = true;
    if (!this.sourceApplyPromise) {
      const task = (async () => {
        await new Promise<void>((resolve) => {
          this.sourceApplyFrameResolve = resolve;
          this.sourceApplyFrame = this.document.defaultView.requestAnimationFrame(() => {
            this.sourceApplyFrame = null;
            const settle = this.sourceApplyFrameResolve;
            this.sourceApplyFrameResolve = null;
            settle?.();
          });
        });
        while (this.sourceApplyRequested && !this.destroyed) {
          this.sourceApplyRequested = false;
          this._reconcileCandidates();
          if (!this.destroyed) await this._refreshAttachments();
        }
      })();
      this.sourceApplyPromise = task.finally(() => {
        this.sourceApplyPromise = null;
      });
    }
    return this.sourceApplyPromise;
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
      if (!stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== request.key) {
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
      this._scheduleSourceApplication();
      return Promise.resolve();
    }
    const key = stylesheetKey(owner);
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
      this._scheduleSourceApplication();
    }
    const request: SourceRequest = {
      aborted: false,
      cancelWait: null,
      controller: isStylesheetLink(owner)
        ? new this.document.defaultView.AbortController()
        : null,
      importCache: new Map(),
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
      if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
        || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
      const ownerIdentity = isStylesheetLink(owner) ? owner.href : this._ownerIdentity(owner);
      this._recordError(error, ownerIdentity || "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: ownerIdentity || this._ownerIdentity(owner),
      });
      this._writeFailedStylesheetRecord(owner, key);
      return;
    }
    if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
      || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
    let compiled: Readonly<CompiledSourceTree>;
    try {
      compiled = await this._compileSourceTree(source, owner, request);
      this.automaticCounters.sourceCompiles += 1;
    } catch (error) {
      if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
        || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
      this._recordError(error, isStylesheetLink(owner) ? owner.href : "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: (error instanceof Error
          ? (error as DiagnosticError).cornerfillDiagnostic?.source
          : undefined) ?? source.sourceUrl,
      });
      this._writeFailedStylesheetRecord(owner, key);
      return;
    }
    if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
      || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
    let cssomHook: CssomHook | null = null;
    try {
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
      this._writeFailedStylesheetRecord(owner, key);
      return;
    }
    this._configureObservation();
    this._scheduleSourceApplication();
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
    canonicalizeCornerShapeDeclarations(element.getAttribute("style") ?? "", authored);
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
    for (const record of this._styleRecords()) {
      const selectorRecords = record.selectorRecords.length > 0
        ? record.selectorRecords
        : record.selectors.map((selector) => Object.freeze({
          source: record.sources[0] ?? record.key,
          selector,
          declaration: null,
        }));
      for (const selectorRecord of selectorRecords) {
        try {
          for (const element of this.root.querySelectorAll(selectorRecord.selector)) {
            candidates.add(element);
            let provenance = this.candidateProvenance.get(element);
            if (!provenance) {
              provenance = [];
              this.candidateProvenance.set(element, provenance);
            }
            if (!provenance.some((candidate) => (
              candidate.source === selectorRecord.source
              && candidate.selector === selectorRecord.selector
              && candidate.declaration === selectorRecord.declaration
            ))) provenance.push(selectorRecord);
          }
        } catch (error) {
          this._recordError(error, `selector ${selectorRecord.selector}`, {
            bucket: record.owner,
            ownerIdentity: record.sources[0] ?? record.key,
            source: selectorRecord.source,
            selector: selectorRecord.selector,
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
    const owners = stylesheetElements(this.root);
    const activeOwners = new Set(owners);
    for (const [owner, record] of this.stylesheets) {
      if (activeOwners.has(owner)) continue;
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      record.companion?.remove();
      record.cssomHook?.restore();
      this.stylesheets.delete(owner);
      this._scheduleSourceApplication();
    }
    await Promise.all(owners.map((owner) => this._processStylesheet(owner, retryFailed)));
    if (this.destroyed) return;
    for (const owner of owners) {
      const companion = this.stylesheets.get(owner)?.companion;
      if (companion && owner.nextSibling !== companion) owner.after(companion);
    }
    this._discoverAdoptedStylesheets(retryFailed);
    if (this.destroyed) return;
    if (this.sourceApplyPromise) await this.sourceApplyPromise;
    if (this.destroyed) return;
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
      this.automaticCounters.computedChecks += 1;
      const computed = element.isConnected
        ? this.document.defaultView.getComputedStyle(element)
        : null;
      const problem = computed ? carrierProblem(computed) : null;
      if (candidates.has(element) && computed && hasShapeCarrier(computed) && !problem) {
        this._clearErrors(element);
        const signature = automaticComputedSignature(computed);
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
      if (problem) this._recordElementError(new TypeError(problem), element);
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
      const computed = this.document.defaultView.getComputedStyle(element);
      const problem = carrierProblem(computed);
      if (problem) {
        this._recordElementError(new TypeError(problem), element);
        continue;
      }
      this._clearErrors(element);
      if (!hasShapeCarrier(computed)) continue;
      try {
        const handle = this.controller.attach(element);
        this.automaticCounters.handleAttaches += 1;
        this.handles.set(element, handle);
        this.handleSignatures.set(element, automaticComputedSignature(computed));
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
    let characterData = false;
    let conservative = false;
    let hasSelectors = false;
    for (const record of this._styleRecords()) {
      if (record.selectors.length > 0) hasSelectors = true;
      for (const attribute of record.observation.attributes) attributes.add(attribute);
      for (const event of record.observation.events) events.add(event);
      for (const query of record.mediaQueries ?? []) mediaQueries.add(query);
      characterData ||= record.observation.characterData;
      conservative ||= record.observation.conservative;
    }
    if (conservative) {
      for (const event of CONSERVATIVE_STATE_EVENTS) events.add(event);
    }
    if (hasSelectors || this.inline.size > 0) events.add("resize");
    return Object.freeze({
      attributes: Object.freeze([...attributes].sort()),
      characterData,
      conservative,
      events: Object.freeze([...events].sort()),
      mediaQueries: Object.freeze([...mediaQueries].sort()),
    });
  }

  _handleMutations(records: readonly MutationRecord[]): void {
    let sources = false;
    const relevant = records.map((record) => {
      if (record.type === "attributes") {
        if (record.attributeName === "data-cornerfill-owned"
          || record.attributeName === "data-cornerfill-owned-border"
          || record.attributeName === "data-cornerfill-owned-surface") return false;
        const target = record.target as Element;
        if (target.localName === "style" || target.localName === "link") {
          sources = true;
          return true;
        }
        if (record.attributeName !== "style") return true;
        const previous = automaticStyleMutationSignature(record.oldValue);
        const current = automaticStyleMutationSignature(target.getAttribute("style"));
        return previous !== current;
      }
      if (record.type === "characterData") {
        if (record.target.parentElement?.localName === "style") {
          sources = true;
          return true;
        }
        return this.observationState.characterData;
      }
      const mutationTarget = record.target as Element;
      if (mutationTarget.localName === "style") {
        sources = true;
        return true;
      }
      const nodes = [...record.addedNodes, ...record.removedNodes];
      const elements = nodes.filter((node): node is Element => (
        node.nodeType === this.document.defaultView.Node.ELEMENT_NODE
      ));
      if (elements.some((node) => (
        /^(?:style|link)$/u.test(node.localName)
        || Boolean(node.querySelector("style,link[rel~=stylesheet]"))
      ))) sources = true;
      return elements.length > 0 || (this.observationState.characterData && nodes.length > 0);
    }).some(Boolean);
    if (!relevant) return;
    this._queueRefresh({ sources, candidates: true, attachments: true });
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
    for (const listener of this.eventListeners) {
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
    }
    this.eventListeners.length = 0;
    for (const { list, listener, legacy } of this.mediaListeners) {
      if (legacy) list.removeListener(listener);
      else list.removeEventListener("change", listener);
    }
    this.mediaListeners.length = 0;
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

  async _start(): Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null> {
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
  }: Readonly<RefreshRequestOptions> = {}): Promise<
    Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null
  > {
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
  ): Promise<Readonly<CornerfillAutoExplanation> | Readonly<CornerfillEntryExplanation> | null> {
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

  registerRoot(root: ShadowRoot, options: Readonly<RegisterRootOptions> = {}): CornerfillAutoController {
    if (this.destroyed) throw new Error("Cornerfill auto controller is destroyed");
    const ShadowRoot = this.document.defaultView.ShadowRoot;
    if (!(root instanceof ShadowRoot) || root.ownerDocument !== this.document) {
      throw new TypeError("Cornerfill automatic scopes require an open ShadowRoot in the same document");
    }
    if (root.host.shadowRoot !== root) {
      throw new TypeError("Cornerfill automatic scopes cannot register a closed ShadowRoot");
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
    for (const listener of this.eventListeners) {
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
    }
    this.eventListeners.length = 0;
    for (const { list, listener, legacy } of this.mediaListeners) {
      if (legacy) list.removeListener(listener);
      else list.removeEventListener("change", listener);
    }
    this.mediaListeners.length = 0;
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
    this.sourceApplyRequested = false;
    if (this.sourceApplyFrame !== null) {
      this.document.defaultView.cancelAnimationFrame(this.sourceApplyFrame);
    }
    this.sourceApplyFrame = null;
    const settleSourceApplyFrame = this.sourceApplyFrameResolve;
    this.sourceApplyFrameResolve = null;
    settleSourceApplyFrame?.();
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
