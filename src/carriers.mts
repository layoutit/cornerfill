import {
  parseCornerShape,
  parseCornerShapeValue,
  serializeShapeParameter,
} from "./values.mjs";
import {
  cssFunctions,
  cssEscapeEnd,
  cssIdentifierAt,
  cssWideKeyword,
  decodeCssEscapes,
  scanCssSyntax,
  skipCssTrivia,
  validCssLayerName,
  wholeCssIdentifier,
} from "./css-syntax.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{ defaultView: RuntimeWindow }>;

export type DiagnosticOwner = object | string;
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
  readonly unobservableStates: readonly string[];
}

export interface SelectorRecord {
  readonly declaration: string | null;
  readonly selector: string;
  readonly source: string;
}

export interface CarrierCompilation {
  readonly css: string;
  readonly failedImports?: number | undefined;
  readonly imports?: number | undefined;
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
  readonly parsedRuleCount?: number | undefined;
  readonly selectorOccurrences?: readonly string[] | undefined;
  readonly selectorRecords: readonly Readonly<SelectorRecord>[];
  readonly selectors: readonly string[];
  readonly sources?: readonly string[] | undefined;
}

interface CarrierRule extends CSSRule {
  readonly conditionText?: string | undefined;
  readonly cssRules?: CSSRuleList | undefined;
  readonly keyText?: string | undefined;
  readonly media?: MediaList | undefined;
  readonly selectorText?: string | undefined;
  readonly style?: CSSStyleDeclaration | undefined;
}

export interface InlineCarrierCompilation {
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

export interface ImportStatement {
  readonly end: number;
  readonly prelude: string;
  readonly start: number;
}

export interface ParsedImport {
  readonly layer: string | null;
  readonly media: string;
  readonly supports: string | null;
  readonly url: string;
}

export interface DiagnosticDetails {
  readonly bucket?: DiagnosticOwner | undefined;
  readonly declaration?: string | null | undefined;
  readonly owner?: DiagnosticOwner | undefined;
  readonly ownerIdentity?: string | undefined;
  readonly selector?: string | null | undefined;
  readonly source?: string | undefined;
}

export type DiagnosticError = Error & Readonly<{
  cornerfillDiagnostic?: DiagnosticDetails | undefined;
  cornerfillImportLoadFailure?: true | undefined;
  cornerfillOwnershipBlocking?: true | undefined;
}>;

interface CssomInsertMutation {
  readonly index: number;
  readonly kind: "insert";
  readonly rule: string;
}

interface CssomDeleteMutation {
  readonly index: number;
  readonly kind: "delete";
}

export type CssomMutation = CssomDeleteMutation | CssomInsertMutation;

export const SHAPE_PROPERTIES = Object.freeze({
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

export const SHAPE_CARRIERS: readonly ShapeCarrier[] = Object.freeze(Object.values(SHAPE_PROPERTIES));
const SHAPE_PROPERTY_BY_CARRIER: Readonly<Record<ShapeCarrier, ShapeProperty>> = Object.freeze(Object.fromEntries(
  Object.entries(SHAPE_PROPERTIES).map(([property, carrier]) => [carrier, property]),
)) as Readonly<Record<ShapeCarrier, ShapeProperty>>;
export const AUTO_UNSET = "__cornerfill_unset__";
export const AUTO_PHYSICAL_SHAPE = "--cornerfill-auto-physical-shape";
export const AUTO_LOGICAL_SHAPE = "--cornerfill-auto-logical-shape";
export const AUTO_ALL_PENDING = "--cornerfill-auto-all-pending";
export const AUTO_ALL_VALUE = "--cornerfill-auto-all-value";
export const AUTO_SHAPE_SOURCE = "--cornerfill-auto-shape-source";
const AUTO_ALL_SENTINEL = "__cornerfill_all__";
export const SUPPORTED_ALL_VALUE = new RegExp(`^(?:${AUTO_ALL_SENTINEL}\\s+(?:initial|unset))?$`, "iu");

export const PHYSICAL_SHAPE_PROPERTIES: readonly Exclude<ShapeProperty, "corner-shape">[] = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);

export const LOGICAL_SHAPE_PROPERTIES: readonly Exclude<ShapeProperty, "corner-shape">[] = Object.freeze([
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
export const SHAPE_STATUS_CARRIERS = Object.freeze(Object.values(SHAPE_STATUS_PROPERTIES));

const CASCADE_CARRIERS = Object.freeze([
  ...new Set([
    ...SHAPE_CARRIERS,
    ...SHAPE_STATUS_CARRIERS,
    AUTO_PHYSICAL_SHAPE,
    AUTO_LOGICAL_SHAPE,
  ]),
]);
const ALL_RESET_CARRIERS = Object.freeze([
  ...CASCADE_CARRIERS,
  AUTO_ALL_PENDING,
  AUTO_ALL_VALUE,
]);
export const AUTO_CARRIERS = Object.freeze([
  ...ALL_RESET_CARRIERS,
  AUTO_SHAPE_SOURCE,
]);
export const AUTO_CARRIER_SET = new Set<string>(AUTO_CARRIERS);

const SHAPE_MARKERS = Object.freeze([
  ...SHAPE_STATUS_CARRIERS,
  AUTO_PHYSICAL_SHAPE,
  AUTO_LOGICAL_SHAPE,
  AUTO_ALL_PENDING,
  AUTO_ALL_VALUE,
  AUTO_SHAPE_SOURCE,
]);

function isShapeProperty(value: string): value is ShapeProperty {
  return Object.hasOwn(SHAPE_PROPERTIES, value);
}

function namedLayerBlockHeader(header: string): boolean {
  const match = /^@layer\s+([\s\S]+?)\s*$/iu.exec(header);
  return Boolean(match && validCssLayerName(match[1]!));
}

function declarationEnd(source: string, start: number): number {
  let end = source.length;
  scanCssSyntax(source, start, (index, character, parentheses, brackets) => {
    if (parentheses !== 0 || brackets !== 0
      || (character !== ";" && character !== "}" && character !== "{")) return;
    if (character === "{") end = -1;
    else end = index;
    return false;
  });
  return end;
}

function customPropertyEnd(source: string, start: number): number {
  let end = source.length;
  scanCssSyntax(source, start, (index, character, parentheses, brackets, blocks) => {
    if (parentheses !== 0 || brackets !== 0 || blocks !== 0) return;
    if (character === ";" || character === "}") {
      end = index;
      return false;
    }
  });
  return end;
}

function declarationValue(raw: string): Readonly<{ priority: string; value: string }> {
  const normalized = raw.replaceAll(/\/\*[\s\S]*?(?:\*\/|$)/gu, " ").trim();
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

function shapeDeclarationState(priority: string): string {
  return `${AUTO_SHAPE_SOURCE}:1${priority};`
    + `${AUTO_ALL_PENDING}:${AUTO_UNSET}${priority};`
    + `${AUTO_ALL_VALUE}:${AUTO_UNSET}${priority};`;
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

const CSS_MATH_FUNCTION = "(?:calc|min|max|clamp|round|mod|rem|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp|abs|sign)";
const POTENTIALLY_VALID_UNSUPPORTED_SHAPE = new RegExp(
  `^superellipse\\(\\s*(${CSS_MATH_FUNCTION}\\([\\s\\S]*\\))\\s*\\)$`,
  "iu",
);

function potentiallyValidUnsupportedShape(value: string): boolean {
  const functionValue = POTENTIALLY_VALID_UNSUPPORTED_SHAPE.exec(value);
  if (!functionValue) return false;
  const expression = functionValue[1]!;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character !== "+" && character !== "-") continue;
    const before = expression[index - 1] ?? "";
    const after = expression[index + 1] ?? "";
    if (character === "-" && /[a-z_]/iu.test(before) && /[a-z_]/iu.test(after)) continue;
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
  const decodedValue = decodeCssEscapes(value);
  const cssWide = cssWideKeyword(value);
  const longhands: readonly Exclude<ShapeProperty, "corner-shape">[] = property === "corner-shape"
    ? PHYSICAL_SHAPE_PROPERTIES
    : [property as Exclude<ShapeProperty, "corner-shape">];
  const marker = property === "corner-shape" || PHYSICAL_SHAPE_PROPERTIES.includes(property)
    ? AUTO_PHYSICAL_SHAPE
    : AUTO_LOGICAL_SHAPE;
  const state = shapeDeclarationState(priority);
  if (cssWide) {
    return `${shapeCssWideDeclaration(property, cssWide, priority, longhands, marker)}${state}`;
  }
  try {
    if (cssFunctions(value).some(({ name }) => name === "env" || name === "var")) {
      const carrier = SHAPE_PROPERTIES[property];
      return `${carrier}:${value}${priority};${shapeStatusDeclarations(longhands, "ok", priority)}${marker}:1${priority};${state}`;
    }
    if (property === "corner-shape") {
      const values = parseCornerShape(decodedValue);
      return `${PHYSICAL_SHAPE_PROPERTIES.map((longhand, index) => (
        `${SHAPE_PROPERTIES[longhand]}:${serializeShapeParameter(values[index]!)}${priority};`
      )).join("")}${shapeStatusDeclarations(longhands, "ok", priority)}${AUTO_PHYSICAL_SHAPE}:1${priority};${state}`;
    }
    const carrier = SHAPE_PROPERTIES[property];
    const parsed = serializeShapeParameter(parseCornerShapeValue(decodedValue));
    return `${carrier}:${parsed}${priority};${shapeStatusDeclarations(longhands, "ok", priority)}${marker}:1${priority};${state}`;
  } catch {
    return potentiallyValidUnsupportedShape(decodedValue)
      ? `${shapeStatusDeclarations(longhands, "unsupported", priority)}${marker}:1${priority};${state}`
      : "";
  }
}

function allCarrierDeclaration(rawDeclaration: string, rawValue: string): string | null {
  const { value, priority } = declarationValue(rawValue);
  const cssWide = cssWideKeyword(value);
  const substitution = cssFunctions(value).some(({ name }) => name === "env" || name === "var");
  if (!cssWide && !substitution) return null;
  if (cssWide) {
    const carrierValue = cssWide === "initial" || cssWide === "unset" ? AUTO_UNSET : cssWide;
    return `${rawDeclaration};${ALL_RESET_CARRIERS.map((carrier) => (
      `${carrier}:${carrierValue}${priority};`
    )).join("")}`;
  }
  return `${rawDeclaration};${CASCADE_CARRIERS.map((carrier) => (
    `${carrier}:${value}${priority};`
  )).join("")}${AUTO_ALL_PENDING}:1${priority};`
    + `${AUTO_ALL_VALUE}:${AUTO_ALL_SENTINEL} ${value}${priority};`;
}

export function canonicalizeCornerShapeDeclarations(
  source: string,
  authoredDeclarations: string[] | null = null,
  context: "declarations" | "stylesheet" = "stylesheet",
): string {
  const replacements: TextReplacement[] = [];
  let statementStart = 0;
  let skipThrough = -1;
  scanCssSyntax(source, 0, (index, character, parentheses, brackets, blocks) => {
    if (index <= skipThrough) return;
    if (parentheses !== 0 || brackets !== 0) return;
    if (character === ":" && (context === "declarations" || blocks > 0)) {
      const statement = source.slice(statementStart, index);
      const identifier = wholeCssIdentifier(statement);
      if (!identifier) return;
      const property = identifier.value.toLowerCase();
      if (property.startsWith("--")) {
        skipThrough = customPropertyEnd(source, index + 1) - 1;
        return;
      }
      if (!isShapeProperty(property) && property !== "all") return;
      const end = declarationEnd(source, index + 1);
      if (end < 0) return;
      const start = statementStart + identifier.start;
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

export function carrierDeclarations(
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
  if (declarations.length === 0 && (
    SHAPE_STATUS_CARRIERS.some((property) => style.getPropertyValue(property).trim() === "unsupported")
    || style.getPropertyValue(AUTO_ALL_PENDING).trim() === "1"
  )) {
    declarations.push("corner-shape: <unsupported value>");
  }
  return Object.freeze(declarations);
}

function ruleHeader(rule: CSSRule): string {
  let index = -1;
  scanCssSyntax(rule.cssText, 0, (position, character, parentheses, brackets, blocks) => {
    if (character !== "{" || parentheses !== 0 || brackets !== 0 || blocks !== 0) return;
    index = position;
    return false;
  });
  return index < 0 ? "" : rule.cssText.slice(0, index).trim();
}

function groupingRuleMatches(
  document: RuntimeDocument,
  rule: Readonly<CarrierRule>,
  header: string,
  observesOwnedSubtree: boolean,
  mediaQueries: Set<string>,
): boolean {
  if (/^@media\b/iu.test(header)) {
    const condition = (rule.conditionText || rule.media?.mediaText
      || header.replace(/^@media\b/iu, "")).trim();
    if (observesOwnedSubtree && condition) mediaQueries.add(condition);
    return !condition || document.defaultView.matchMedia(condition).matches;
  }
  if (/^@supports\b/iu.test(header)) {
    const condition = (rule.conditionText || header.replace(/^@supports\b/iu, "")).trim();
    return !condition || document.defaultView.CSS.supports(
      carrierSupportsHeader(`@supports ${condition}`).slice("@supports ".length),
    );
  }
  return true;
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

function atKeyword(
  source: string,
  start = skipCssTrivia(source, 0),
): Readonly<{ end: number; name: string }> | null {
  if (source[start] !== "@") return null;
  const identifier = cssIdentifierAt(source, start + 1);
  return identifier ? Object.freeze({
    end: identifier.end,
    name: identifier.value.toLowerCase(),
  }) : null;
}

function supportDeclaration(
  source: string,
): Readonly<{ property: string; value: string }> | null {
  let colon = -1;
  let invalid = false;
  scanCssSyntax(source, 0, (index, character, parentheses, brackets, blocks) => {
    if (parentheses !== 0 || brackets !== 0 || blocks !== 0) return;
    if (character === ":" && colon < 0) colon = index;
    else if (character === ";" || character === "{" || character === "}") {
      invalid = true;
      return false;
    }
  });
  if (invalid || colon < 0) return null;
  const property = wholeCssIdentifier(source.slice(0, colon))?.value.toLowerCase();
  const value = source.slice(colon + 1).trim();
  return property && value ? Object.freeze({ property, value }) : null;
}

function supportsShapeValue(property: string, value: string): boolean {
  if (cssWideKeyword(value)) return true;
  if (cssFunctions(value).some(({ name }) => name === "env" || name === "var")) return true;
  try {
    if (property === "corner-shape") parseCornerShape(value);
    else parseCornerShapeValue(value);
    return true;
  } catch {
    return false;
  }
}

const OBSERVED_OWNED_PROPERTY = /^(?:-webkit-(?:appearance|backdrop-filter)$|appearance$|aspect-ratio$|backdrop-filter$|background(?:-|$)|block-size$|border(?:-|$)|box-shadow$|box-sizing$|color(?:-scheme)?$|contain$|content(?:-|$)|corner-(?:.*-)?shape$|direction$|display$|font(?:-|$)|height$|image-rendering$|inline-size$|line-height$|list-style(?:-|$)|max-(?:block-size|height|inline-size|width)$|min-(?:block-size|height|inline-size|width)$|outline(?:-|$)|overflow(?:-|$)|padding(?:-|$)|text-orientation$|visibility$|width$|writing-mode$)/u;

function styleProperties(style: CSSStyleDeclaration | null | undefined): readonly string[] {
  if (!style) return Object.freeze([]);
  return Object.freeze(Array.from({ length: style.length }, (_value, index) => style.item(index)).filter(Boolean));
}

function styleMayAffectOwnedPaint(style: CSSStyleDeclaration | null | undefined): boolean {
  return styleProperties(style).some((property) => (
    property.startsWith("--") || OBSERVED_OWNED_PROPERTY.test(property)
  ));
}

function unsupportedConditionalDeclarations(
  style: CSSStyleDeclaration | null | undefined,
): readonly string[] {
  return Object.freeze(styleProperties(style).filter((property) => !AUTO_CARRIER_SET.has(property)));
}

function rulesMayAffectOwnedPaint(rules: CSSRuleList | readonly CSSRule[]): boolean {
  for (const rawRule of rules) {
    const rule = rawRule as CarrierRule;
    if (styleMayAffectOwnedPaint(rule.style)) return true;
    if (rule.cssRules && rulesMayAffectOwnedPaint(rule.cssRules)) return true;
  }
  return false;
}

interface SupportsParenthesis {
  close: number;
  readonly children: SupportsParenthesis[];
  readonly open: number;
}

function supportsParentheses(source: string): readonly Readonly<SupportsParenthesis>[] {
  const roots: SupportsParenthesis[] = [];
  const stack: SupportsParenthesis[] = [];
  scanCssSyntax(source, 0, (index, character) => {
    if (character === "(") {
      const node: SupportsParenthesis = { open: index, close: -1, children: [] };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else roots.push(node);
      stack.push(node);
    } else if (character === ")") {
      const node = stack.pop();
      if (node) node.close = index;
    }
  });
  return Object.freeze(roots);
}

function analyzeSupportsCondition(source: string): Readonly<{
  replacements: readonly Readonly<TextReplacement>[];
  testsShape: boolean;
}> {
  const functionOpenings = new Set(cssFunctions(source).map(({ open }) => open));
  const replacements: TextReplacement[] = [];
  let testsShape = false;
  const visit = (node: Readonly<SupportsParenthesis>) => {
    if (node.close < 0) return;
    const inner = source.slice(node.open + 1, node.close);
    const declaration = supportDeclaration(inner);
    if (declaration) {
      if (!isShapeProperty(declaration.property)) return;
      testsShape = true;
      const { property, value } = declaration;
      const cssWide = cssWideKeyword(value);
      replacements.push(Object.freeze({
        start: node.open + 1,
        end: node.close,
        value: cssWide === "revert-rule"
          ? `all:${value}`
          : supportsShapeValue(property, value)
            ? `--cornerfill-supports-${property}:${value}`
            : "display:__cornerfill_invalid__",
      }));
      return;
    }
    if (functionOpenings.has(node.open)) return;
    for (const child of node.children) visit(child);
  };
  for (const root of supportsParentheses(source)) visit(root);
  return Object.freeze({ replacements: Object.freeze(replacements), testsShape });
}

function shapeSupportReplacements(header: string): readonly Readonly<TextReplacement>[] {
  return atKeyword(header)?.name === "supports"
    ? analyzeSupportsCondition(header).replacements
    : Object.freeze([]);
}

export function supportsConditionTestsShape(condition: string): boolean {
  return analyzeSupportsCondition(normalizeSupportsCondition(condition)).testsShape;
}

function carrierSupportsHeader(header: string): string {
  const replacements = shapeSupportReplacements(header);
  if (replacements.length === 0) return header;
  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += header.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }
  return output + header.slice(cursor);
}

export function normalizeSupportsCondition(condition: string): string {
  const source = String(condition).trim();
  const start = skipCssTrivia(source, 0);
  const leading = cssIdentifierAt(source, start)?.value.toLowerCase();
  return source[start] === "(" || leading === "not" ? source : `(${source})`;
}

export function carrierSupportsCondition(condition: string): string {
  const normalized = normalizeSupportsCondition(condition);
  return carrierSupportsHeader(`@supports ${normalized}`).slice("@supports ".length);
}

function resolvedNestedSelector(selector: string, parent: string): string {
  let output = "";
  let cursor = 0;
  let replaced = false;
  scanCssSyntax(selector, 0, (index, character) => {
    if (character !== "&") return;
    output += `${selector.slice(cursor, index)}:is(${parent})`;
    cursor = index + 1;
    replaced = true;
  });
  return replaced ? output + selector.slice(cursor) : `:is(${parent}) ${selector}`;
}

function selectorUsesNamespace(selector: string): boolean {
  let namespaced = false;
  scanCssSyntax(selector, 0, (index, character) => {
    if (character !== "|") return;
    const previous = selector[index - 1];
    const next = selector[index + 1];
    if (previous === "|" || next === "|" || next === "=") return;
    namespaced = true;
    return false;
  });
  return namespaced;
}

interface SourceRuleScan {
  readonly namespaceBinding: boolean;
  readonly selectors: readonly Readonly<{ end: number; start: number }>[];
}

function sourceRuleScan(source: string): Readonly<SourceRuleScan> {
  const starts = [0];
  const blocks: ("at" | "declaration" | "style")[] = [];
  const selectors: Readonly<{ end: number; start: number }>[] = [];
  let namespaceBinding = false;
  const statementStart = (depth: number) => skipCssTrivia(source, starts[depth] ?? 0);
  scanCssSyntax(source, 0, (index, character, parentheses, brackets, depth) => {
    if (parentheses !== 0 || brackets !== 0) return;
    if (character === ";") {
      const header = source.slice(statementStart(depth), index).trim();
      if (depth === 0 && /^@namespace\b/iu.test(header)) namespaceBinding = true;
      starts[depth] = index + 1;
      return;
    }
    if (character === "{") {
      const start = statementStart(depth);
      const header = source.slice(start, index).trim();
      const parent = blocks[depth - 1];
      const customBlock = parent === "style" && /^--[-_a-z0-9\\]+\s*:/iu.test(header);
      const kind = parent === "declaration"
        ? "declaration"
        : header.startsWith("@") ? "at" : customBlock ? "declaration" : "style";
      blocks[depth] = kind;
      starts[depth + 1] = index + 1;
      if (/^@namespace\b/iu.test(header)) namespaceBinding = true;
      else if (kind === "style") selectors.push(Object.freeze({ start, end: index }));
      return;
    }
    if (character === "}") {
      blocks.length = Math.max(0, depth - 1);
      starts[Math.max(0, depth - 1)] = index + 1;
    }
  });
  return Object.freeze({ namespaceBinding, selectors: Object.freeze(selectors) });
}

function transformSelectorHeaders(
  source: string,
  selectors: readonly Readonly<{ end: number; start: number }>[],
  transform: (selector: string) => string,
): string {
  let output = "";
  let cursor = 0;
  for (const { start, end } of selectors) {
    output += source.slice(cursor, start) + transform(source.slice(start, end));
    cursor = end;
  }
  return output + source.slice(cursor);
}

function serializeCarrierRules(
  document: RuntimeDocument,
  rules: CSSRuleList | readonly CSSRule[],
  selectors: Set<string>,
  selectorOccurrences: string[],
  selectorRecords: Readonly<SelectorRecord>[],
  sourceIdentity: string,
  mediaQueries: Set<string>,
  observationSelectors: Set<string>,
  strictShapeSupports = false,
  parentSelector: string | null = null,
  selectorDisplay: ((selector: string) => string) | null = null,
): string {
  let output = "";
  for (const rawRule of rules) {
    const rule = rawRule as CarrierRule;
    const statement = rule.cssText.trim();
    if (/^@namespace\b/iu.test(statement)) {
      throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve @namespace selector bindings");
    }
    if (/^@layer\b[^{}]*;$/iu.test(statement)) {
      output += statement;
      continue;
    }
    const header = ruleHeader(rule);
    if (/^@(?:-webkit-)?keyframes\b/iu.test(header)) {
      if (strictShapeSupports) {
        throw ownershipBlockingSyntaxError(
          `Automatic CSS refuses semantic rule inside a corner-shape support condition: ${header}`,
        );
      }
      continue;
    }
    const namedLayer = namedLayerBlockHeader(header);
    const supportedGroupingRule = Boolean(rule.cssRules) && (
      /^@supports\b/iu.test(header)
      || /^@media\b/iu.test(header)
      || namedLayer
    );
    const nestedDeclarations = rule.type === 0
      && typeof rule.selectorText !== "string"
      && Boolean(rule.style)
      && !rule.cssRules
      && header === "";
    if (strictShapeSupports && typeof rule.selectorText !== "string"
      && !supportedGroupingRule && !nestedDeclarations) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS refuses semantic rule inside a corner-shape support condition: ${header}`,
      );
    }
    const declarations = carrierDeclarations(rule.style);
    const ruleSelector = typeof rule.selectorText === "string"
      ? (selectorDisplay ? selectorDisplay(rule.selectorText) : rule.selectorText)
      : null;
    const selector = ruleSelector
      ? (parentSelector ? resolvedNestedSelector(ruleSelector, parentSelector) : ruleSelector)
      : null;
    if (selector && selectorUsesNamespace(selector)) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS cannot discover namespace-qualified selector matches: ${selector}`,
      );
    }
    const shapeSupports = shapeSupportReplacements(header).length > 0;
    const observesOwnedSubtree = Boolean(rule.cssRules && rulesMayAffectOwnedPaint(rule.cssRules));
    if (rule.cssRules && !groupingRuleMatches(
      document,
      rule,
      header,
      observesOwnedSubtree,
      mediaQueries,
    )) continue;
    if (/^@container\b/iu.test(header) && observesOwnedSubtree) {
      throw ownershipBlockingSyntaxError(`Automatic CSS cannot observe container-query paint dependencies: ${header}`);
    }
    if (/^@layer\s*$/iu.test(header) && observesOwnedSubtree) {
      throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
    }
    if (rule.cssRules && typeof rule.selectorText !== "string"
      && !supportedGroupingRule && observesOwnedSubtree) {
      throw ownershipBlockingSyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
    }
    const nested = rule.cssRules
      ? serializeCarrierRules(
        document,
        rule.cssRules,
        selectors,
        selectorOccurrences,
        selectorRecords,
        sourceIdentity,
        mediaQueries,
        observationSelectors,
        strictShapeSupports || shapeSupports,
        selector ?? parentSelector,
        selectorDisplay,
      )
      : "";
    if (nestedDeclarations) {
      if (!parentSelector) {
        throw ownershipBlockingSyntaxError("Automatic CSS found nested declarations without a parent selector");
      }
      if (styleMayAffectOwnedPaint(rule.style)) observationSelectors.add(parentSelector);
      if (strictShapeSupports) {
        const unsupported = unsupportedConditionalDeclarations(rule.style);
        if (unsupported.length > 0) {
          throw ownershipBlockingSyntaxError(
            `Automatic CSS refuses @supports corner-shape declarations because they also declare: ${unsupported.join(", ")}`,
          );
        }
      }
      if (declarations.shape) {
        selectors.add(parentSelector);
        selectorOccurrences.push(parentSelector);
        selectorRecords.push(Object.freeze({
          source: sourceIdentity,
          selector: parentSelector,
          declaration: rule.style ? diagnosticShapeDeclarations(rule.style).join("; ") || null : null,
        }));
      }
      output += declarations.css;
      continue;
    }
    if (selector) {
      if (styleMayAffectOwnedPaint(rule.style)) observationSelectors.add(selector);
      if (strictShapeSupports) {
        const unsupported = unsupportedConditionalDeclarations(rule.style);
        if (unsupported.length > 0) {
          throw ownershipBlockingSyntaxError(
            `Automatic CSS refuses @supports corner-shape rule ${rule.selectorText} because it also declares: ${unsupported.join(", ")}`,
          );
        }
      }
      if (!declarations.css && !nested) continue;
      if (declarations.shape) {
        selectors.add(selector);
        selectorOccurrences.push(selector);
        selectorRecords.push(Object.freeze({
          source: sourceIdentity,
          selector,
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
    const preserveEmptyLayer = strictShapeSupports && namedLayer;
    if (nested || preserveEmptyLayer) {
      if (/^@layer\s*$/iu.test(header)) {
        throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
      }
      if (/^@supports\b/iu.test(header)) output += `${carrierSupportsHeader(header)}{${nested}}`;
      else if (/^@media\b/iu.test(header) || namedLayer) {
        output += `${header}{${nested}}`;
      } else {
        throw ownershipBlockingSyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
      }
    }
  }
  return output;
}

const SELECTOR_STATE_EVENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  hover: Object.freeze(["pointerover", "pointerout"]),
  focus: Object.freeze(["focusin", "focusout"]),
  "focus-visible": Object.freeze(["focusin", "focusout"]),
  "focus-within": Object.freeze(["focusin", "focusout"]),
  disabled: Object.freeze(["input", "change"]),
  enabled: Object.freeze(["input", "change"]),
  optional: Object.freeze(["input", "change"]),
  required: Object.freeze(["input", "change"]),
  modal: Object.freeze(["toggle"]),
  open: Object.freeze(["toggle"]),
  "popover-open": Object.freeze(["toggle"]),
  fullscreen: Object.freeze(["fullscreenchange"]),
});

const STATIC_SELECTOR_PSEUDOS = new Set<string>([
  "any-link", "empty", "first-child", "first-of-type", "has", "host", "host-context", "is", "lang",
  "last-child", "last-of-type", "link", "not", "nth-child",
  "nth-last-child", "nth-last-of-type", "nth-of-type", "only-child",
  "only-of-type", "root", "scope", "where",
]);

export function selectorObservation(selectors: Iterable<string>): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  const unobservableStates = new Set<string>();
  let characterData = false;
  let conservative = false;
  for (const selector of selectors) {
    scanCssSyntax(selector, 0, (index, character, _parentheses, brackets) => {
      if (brackets !== 0) return;
      if (character === ".") {
        attributes.add("class");
        return;
      }
      if (character === "#") {
        attributes.add("id");
        return;
      }
      if (character === "[") {
        const name = cssIdentifierAt(selector, skipCssTrivia(selector, index + 1));
        if (name) attributes.add(name.value.toLowerCase());
        else conservative = true;
        return;
      }
      if (character !== ":" || selector[index - 1] === ":" || selector[index + 1] === ":") return;
      const name = cssIdentifierAt(selector, index + 1);
      if (!name) {
        conservative = true;
        return;
      }
      const pseudo = name.value.toLowerCase();
      const stateEvents = SELECTOR_STATE_EVENTS[pseudo];
      if (stateEvents) {
        for (const event of stateEvents) events.add(event);
        if (["checked", "default", "disabled", "enabled", "required", "optional"].includes(pseudo)) {
          attributes.add(pseudo === "enabled" ? "disabled" : pseudo);
        }
        if (["modal", "open"].includes(pseudo)) attributes.add("open");
        if (pseudo === "popover-open") attributes.add("popover");
        return;
      }
      if (pseudo === "dir") {
        attributes.add("dir");
        return;
      }
      if (pseudo === "lang") {
        attributes.add("lang");
        return;
      }
      if (pseudo === "empty") characterData = true;
      else if (["any-link", "link"].includes(pseudo)) attributes.add("href");
      else if (!STATIC_SELECTOR_PSEUDOS.has(pseudo)) unobservableStates.add(pseudo);
    });
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    events: Object.freeze([...events].sort()),
    characterData,
    conservative,
    unobservableStates: Object.freeze([...unobservableStates].sort()),
  });
}

export function parseCarrierSheet(
  document: RuntimeDocument,
  source: string,
  baseUrl = document.baseURI,
  nonce: string | null = null,
  sourceIdentity = baseUrl,
  strictShapeSupports = false,
  selectorTransform: ((selector: string) => string) | null = null,
  selectorDisplay: ((selector: string) => string) | null = null,
): Readonly<CarrierCompilation> {
  const sourceRules = sourceRuleScan(source);
  if (sourceRules.namespaceBinding) {
    throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve @namespace selector bindings");
  }
  for (const { start, end } of sourceRules.selectors) {
    const selector = source.slice(start, end).trim();
    if (selectorUsesNamespace(selector)) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS cannot discover namespace-qualified selector matches: ${selector}`,
      );
    }
  }
  const selectorSource = selectorTransform
    ? transformSelectorHeaders(source, sourceRules.selectors, selectorTransform)
    : source;
  const transformed = canonicalizeCornerShapeDeclarations(selectorSource);
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
    const selectorOccurrences: string[] = [];
    const observationSelectors = new Set<string>();
    const selectorRecords: Readonly<SelectorRecord>[] = [];
    const mediaQueries = new Set<string>();
    const css = serializeCarrierRules(
      document,
      sheet?.cssRules ?? [],
      selectors,
      selectorOccurrences,
      selectorRecords,
      sourceIdentity,
      mediaQueries,
      observationSelectors,
      strictShapeSupports,
      null,
      selectorDisplay,
    );
    const selectorList = Object.freeze([...selectors]);
    const observation = selectorObservation(observationSelectors);
    if (observation.unobservableStates.length > 0) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS cannot observe selector state: ${observation.unobservableStates.join(", ")}`,
      );
    }
    return Object.freeze({
      css,
      selectors: selectorList,
      selectorOccurrences: Object.freeze(selectorOccurrences),
      selectorRecords: Object.freeze(selectorRecords),
      observation,
      mediaQueries: Object.freeze([...mediaQueries].filter(Boolean).sort()),
      parsedRuleCount: sheet?.cssRules.length ?? 0,
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

export function leadingImportStatements(
  source: string,
): Readonly<{ imports: readonly Readonly<ImportStatement>[]; local: string }> {
  const imports: Readonly<ImportStatement>[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = skipCssTrivia(source, cursor);
    if (start >= source.length) break;
    const keyword = atKeyword(source, start);
    if (keyword?.name === "import") {
      const end = cssStatementEnd(source, keyword.end);
      if (end < 0) break;
      imports.push(Object.freeze({ start, end: end + 1, prelude: source.slice(start, end + 1) }));
      cursor = end + 1;
      continue;
    }
    if (keyword?.name === "charset" || keyword?.name === "layer") {
      const end = cssStatementEnd(source, keyword.end);
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

function importString(value: string): Readonly<{ end: number; value: string }> | null {
  const quote = value[0];
  if (quote !== "\"" && quote !== "'") return null;
  for (let index = 1; index < value.length;) {
    const character = value[index]!;
    if (character === quote) return Object.freeze({
      end: index + 1,
      value: decodeCssEscapes(value.slice(1, index)),
    });
    if (/[\n\f\r]/u.test(character)) {
      throw new SyntaxError("Automatic CSS found an invalid @import string");
    }
    if (character !== "\\") {
      index += 1;
      continue;
    }
    const next = value[index + 1];
    if (!next) throw new SyntaxError("Automatic CSS found an unterminated @import string");
    if (next === "\r" && value[index + 2] === "\n") index += 3;
    else if (/[\n\f\r]/u.test(next)) index += 2;
    else {
      const end = cssEscapeEnd(value, index);
      if (end < 0) throw new SyntaxError("Automatic CSS found an invalid @import string escape");
      index = end;
    }
  }
  throw new SyntaxError("Automatic CSS found an unterminated @import string");
}

function unquoteImportUrl(value: string): Readonly<ImportUrlParse> {
  const source = value.slice(skipCssTrivia(value, 0)).trimEnd();
  const quoted = importString(source);
  if (quoted) return Object.freeze({
    rest: source.slice(skipCssTrivia(source, quoted.end)).trim(),
    url: quoted.value,
  });
  const urlFunction = consumeImportFunction(source, "url");
  if (!urlFunction) {
    throw new SyntaxError("Automatic CSS supports quoted or url() @import URLs");
  }
  const contents = urlFunction.value.trim();
  const nested = importString(contents);
  if (nested && skipCssTrivia(contents, nested.end) !== contents.length) {
    throw new SyntaxError("Automatic CSS found an invalid @import url()");
  }
  if (!nested) {
    for (let index = 0; index < contents.length;) {
      const character = contents[index]!;
      if (character === "\\") {
        const end = cssEscapeEnd(contents, index);
        if (end < 0) throw new SyntaxError("Automatic CSS found an invalid @import url()");
        index = end;
        continue;
      }
      const code = character.codePointAt(0) ?? 0;
      if (/[\t\n\f\r "'()]/u.test(character) || code < 0x20 || code === 0x7f) {
        throw new SyntaxError("Automatic CSS found an invalid @import url()");
      }
      index += 1;
    }
  }
  return Object.freeze({
    rest: urlFunction.rest,
    url: nested?.value ?? decodeCssEscapes(contents),
  });
}

function consumeImportFunction(value: string, name: string): Readonly<ImportFunctionParse> | null {
  const identifierStart = skipCssTrivia(value, 0);
  const identifier = cssIdentifierAt(value, identifierStart);
  if (identifier?.value.toLowerCase() !== name) return null;
  const start = identifier.end;
  if (value[start] !== "(") return null;
  const end = matchingParenthesis(value, start);
  if (end < 0) throw new SyntaxError(`Automatic CSS found an unterminated @import ${name}()`);
  return Object.freeze({
    value: value.slice(start + 1, end).trim(),
    rest: value.slice(end + 1).trim(),
  });
}

export function parseImportStatement(statement: string, baseUrl: string): Readonly<ParsedImport> {
  const keyword = atKeyword(statement);
  if (keyword?.name !== "import") throw new SyntaxError("Automatic CSS expected an @import rule");
  const body = statement.slice(keyword.end).replace(/;\s*$/u, "").trim();
  const parsedUrl = unquoteImportUrl(body);
  let rest = parsedUrl.rest;
  let layer = null;
  let supports = null;
  const layerIdentifier = cssIdentifierAt(rest, skipCssTrivia(rest, 0));
  if (layerIdentifier?.value.toLowerCase() === "layer") {
    const layerFunction = consumeImportFunction(rest, "layer");
    if (!layerFunction) {
      throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve an anonymous @import layer");
    }
    if (!validCssLayerName(layerFunction.value)) {
      throw new SyntaxError(`Automatic CSS cannot preserve @import layer name: ${layerFunction.value}`);
    }
    layer = layerFunction.value;
    rest = layerFunction.rest;
  }
  const supportsFunction = consumeImportFunction(rest, "supports");
  const supportsIdentifier = cssIdentifierAt(rest, skipCssTrivia(rest, 0));
  if (!supportsFunction && supportsIdentifier?.value.toLowerCase() === "supports") {
    throw new SyntaxError("Automatic CSS found an invalid @import supports() function");
  }
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

export function wrapImportedCarrierCss(css: string, imported: Readonly<ParsedImport>): string {
  let output = css;
  if (imported.layer) output = `@layer ${imported.layer}{${output}}`;
  if (imported.supports) {
    output = `@supports ${carrierSupportsCondition(imported.supports)}{${output}}`;
  }
  if (imported.media) output = `@media ${imported.media}{${output}}`;
  return output;
}

export function mergeSelectorObservation(
  records: readonly Readonly<SelectorObservation>[],
): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  const unobservableStates = new Set<string>();
  let characterData = false;
  let conservative = false;
  for (const record of records) {
    for (const attribute of record.attributes) attributes.add(attribute);
    for (const event of record.events) events.add(event);
    for (const state of record.unobservableStates) unobservableStates.add(state);
    characterData ||= record.characterData;
    conservative ||= record.conservative;
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    events: Object.freeze([...events].sort()),
    characterData,
    conservative,
    unobservableStates: Object.freeze([...unobservableStates].sort()),
  });
}

export function ownershipBlockingSyntaxError(message: string): DiagnosticError {
  const error = new SyntaxError(message) as DiagnosticError;
  Object.defineProperty(error, "cornerfillOwnershipBlocking", { value: true });
  return error;
}

export function ownershipBlockingRangeError(message: string): DiagnosticError {
  const error = new RangeError(message) as DiagnosticError;
  Object.defineProperty(error, "cornerfillOwnershipBlocking", { value: true });
  return error;
}

export function ownershipBlockingError(error: unknown): boolean {
  return error instanceof Error
    && (error as DiagnosticError).cornerfillOwnershipBlocking === true;
}

export function importLoadFailure(error: unknown): boolean {
  return error instanceof Error
    && (error as DiagnosticError).cornerfillImportLoadFailure === true;
}

export function annotateDiagnostic(error: unknown, details: Readonly<DiagnosticDetails>): DiagnosticError {
  const value = (error instanceof Error ? error : new Error(String(error))) as DiagnosticError;
  const previous = value.cornerfillDiagnostic ?? {};
  Object.defineProperty(value, "cornerfillDiagnostic", {
    configurable: true,
    value: Object.freeze({ ...details, ...previous }),
  });
  return value;
}

export function mutateStylesheetModel(
  document: RuntimeDocument,
  source: string,
  mutation: Readonly<CssomMutation>,
  nonce: string | null = null,
): string {
  const insertedRule = mutation.kind === "insert"
    ? canonicalizeCornerShapeDeclarations(mutation.rule)
    : "";
  let placeholderIndex = 0;
  let placeholderPrefix = "cornerfill-cssom-import";
  while (source.includes(placeholderPrefix) || insertedRule.includes(placeholderPrefix)) {
    placeholderPrefix += "-x";
  }
  const imports = new Map<string, string>();
  const placeholder = (statement: string) => {
    const rule = `@layer ${placeholderPrefix}-${placeholderIndex};`;
    placeholderIndex += 1;
    imports.set(rule, statement);
    return rule;
  };
  const split = leadingImportStatements(source);
  let parserSource = source;
  for (const record of [...split.imports].reverse()) {
    parserSource = parserSource.slice(0, record.start)
      + placeholder(record.prelude)
      + parserSource.slice(record.end);
  }
  let parserRule = insertedRule;
  if (mutation.kind === "insert") {
    const inserted = leadingImportStatements(insertedRule);
    if (inserted.imports.length === 1 && inserted.local.trim() === "") {
      parserRule = placeholder(inserted.imports[0]!.prelude);
    }
  }
  let sheet: CSSStyleSheet | null;
  let parserStyle: HTMLStyleElement | null = null;
  try {
    sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync(parserSource);
  } catch {
    parserStyle = document.createElement("style");
    parserStyle.media = "not all";
    if (nonce) parserStyle.setAttribute("nonce", nonce);
    parserStyle.textContent = parserSource;
    (document.head ?? document.documentElement).append(parserStyle);
    sheet = parserStyle.sheet;
  }
  try {
    if (!sheet) throw new Error("temporary CSS parser did not expose a stylesheet");
    if (mutation.kind === "insert") {
      sheet.insertRule(parserRule, mutation.index);
    } else sheet.deleteRule(mutation.index);
    return [...(sheet.cssRules ?? [])]
      .map((rule) => imports.get(rule.cssText) ?? rule.cssText)
      .join("\n");
  } finally {
    parserStyle?.remove();
  }
}
