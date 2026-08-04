import {
  parseCornerShape,
  parseCornerShapeValue,
  serializeShapeParameter,
} from "./values.mjs";
import {
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
  const longhands: readonly Exclude<ShapeProperty, "corner-shape">[] = property === "corner-shape"
    ? PHYSICAL_SHAPE_PROPERTIES
    : [property as Exclude<ShapeProperty, "corner-shape">];
  const marker = property === "corner-shape" || PHYSICAL_SHAPE_PROPERTIES.includes(property)
    ? AUTO_PHYSICAL_SHAPE
    : AUTO_LOGICAL_SHAPE;
  const state = shapeDeclarationState(priority);
  if (/^(?:inherit|initial|revert|revert-layer|revert-rule|unset)$/iu.test(decodedValue)) {
    return `${shapeCssWideDeclaration(property, decodedValue, priority, longhands, marker)}${state}`;
  }
  try {
    if (/\b(?:env|var)\s*\(/iu.test(decodedValue)) {
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
  const cssWide = /^(?:inherit|initial|revert|revert-layer|revert-rule|unset)$/iu.test(value);
  if (!cssWide && !/\b(?:env|var)\s*\(/iu.test(value)) return null;
  if (cssWide) {
    const carrierValue = /^(?:initial|unset)$/iu.test(value) ? AUTO_UNSET : value;
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
    || /\b(?:env|var)\s*\(/iu.test(value)) return true;
  try {
    if (property === "corner-shape") parseCornerShape(value);
    else parseCornerShapeValue(value);
    return true;
  } catch {
    return false;
  }
}

const OBSERVED_OWNED_PROPERTY = /^(?:-webkit-(?:appearance|backdrop-filter)$|appearance$|aspect-ratio$|backdrop-filter$|background(?:-|$)|block-size$|border(?:-|$)|box-shadow$|box-sizing$|color(?:-scheme)?$|contain$|content(?:-|$)|corner-(?:.*-)?shape$|direction$|display$|font(?:-|$)|height$|image-rendering$|inline-size$|line-height$|list-style(?:-|$)|max-(?:block-size|height|inline-size|width)$|min-(?:block-size|height|inline-size|width)$|outline(?:-|$)|overflow(?:-|$)|padding(?:-|$)|visibility$|width$|writing-mode$)/u;

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

function shapeSupportReplacements(header: string): readonly Readonly<TextReplacement>[] {
  if (!/^@supports\b/iu.test(header)) return Object.freeze([]);
  const replacements: TextReplacement[] = [];
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
    start = end;
  }
  return Object.freeze(replacements);
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

function serializeCarrierRules(
  rules: CSSRuleList | readonly CSSRule[],
  selectors: Set<string>,
  selectorRecords: Readonly<SelectorRecord>[],
  sourceIdentity: string,
  mediaQueries: Set<string>,
  observationSelectors: Set<string>,
  strictShapeSupports = false,
): string {
  let output = "";
  for (const rawRule of rules) {
    const rule = rawRule as CarrierRule;
    const statement = rule.cssText.trim();
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
    if (strictShapeSupports && typeof rule.selectorText !== "string" && !supportedGroupingRule) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS refuses semantic rule inside a corner-shape support condition: ${header}`,
      );
    }
    const declarations = carrierDeclarations(rule.style);
    if (typeof rule.selectorText === "string" && (rule.cssRules?.length ?? 0) > 0) {
      throw new SyntaxError(`Automatic CSS cannot preserve nested selector rule: ${rule.selectorText}`);
    }
    const shapeSupports = shapeSupportReplacements(header).length > 0;
    const observesOwnedSubtree = Boolean(rule.cssRules && rulesMayAffectOwnedPaint(rule.cssRules));
    if (/^@container\b/iu.test(header) && observesOwnedSubtree) {
      throw ownershipBlockingSyntaxError(`Automatic CSS cannot observe container-query paint dependencies: ${header}`);
    }
    const nested = rule.cssRules
      ? serializeCarrierRules(
        rule.cssRules,
        selectors,
        selectorRecords,
        sourceIdentity,
        mediaQueries,
        observationSelectors,
        strictShapeSupports || shapeSupports,
      )
      : "";
    if (/^@media\b/iu.test(header) && observesOwnedSubtree) {
      mediaQueries.add(header.replace(/^@media\b/iu, "").trim());
    }
    if (typeof rule.selectorText === "string") {
      if (styleMayAffectOwnedPaint(rule.style)) observationSelectors.add(rule.selectorText);
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
    const preserveEmptyLayer = strictShapeSupports && namedLayer;
    if (nested || preserveEmptyLayer) {
      if (/^@layer\s*$/iu.test(header)) {
        throw new SyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
      }
      if (/^@supports\b/iu.test(header)) output += `${carrierSupportsHeader(header)}{${nested}}`;
      else if (/^@media\b/iu.test(header) || namedLayer) {
        output += `${header}{${nested}}`;
      } else {
        throw new SyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
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
  "any-link", "empty", "first-child", "first-of-type", "has", "is", "lang",
  "last-child", "last-of-type", "link", "not", "nth-child",
  "nth-last-child", "nth-last-of-type", "nth-of-type", "only-child",
  "only-of-type", "root", "scope", "where",
]);

function selectorForObservation(selector: string): string {
  return selector.replaceAll(
    /\\(?:[0-9a-f]{1,6}(?:\r\n|[\t\n\f\r ])?|(?:\r\n|[\n\f\r])|[\s\S])/giu,
    (escape) => {
      const decoded = decodeCssEscapes(escape);
      return /^[-_a-z0-9]$/iu.test(decoded) ? decoded : "_";
    },
  );
}

export function selectorObservation(selectors: Iterable<string>): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  const unobservableStates = new Set<string>();
  let characterData = false;
  let conservative = false;
  for (const rawSelector of selectors) {
    const selector = selectorForObservation(rawSelector);
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
      else if (["any-link", "link"].includes(pseudo)) attributes.add("href");
      else if (!STATIC_SELECTOR_PSEUDOS.has(pseudo)) unobservableStates.add(pseudo);
    }
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
    const observationSelectors = new Set<string>();
    const selectorRecords: Readonly<SelectorRecord>[] = [];
    const mediaQueries = new Set<string>();
    const css = serializeCarrierRules(
      sheet?.cssRules ?? [],
      selectors,
      selectorRecords,
      sourceIdentity,
      mediaQueries,
      observationSelectors,
      strictShapeSupports,
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

export function parseImportStatement(statement: string, baseUrl: string): Readonly<ParsedImport> {
  const body = statement.replace(/^@import\b/iu, "").replace(/;\s*$/u, "").trim();
  const parsedUrl = unquoteImportUrl(body);
  let rest = parsedUrl.rest;
  let layer = null;
  let supports = null;
  if (/^layer\b/iu.test(rest)) {
    const layerFunction = consumeImportFunction(rest, "layer");
    if (!layerFunction) throw new SyntaxError("Automatic CSS refuses anonymous @import layers");
    if (!validCssLayerName(layerFunction.value)) {
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

export function wrapImportedCarrierCss(css: string, imported: Readonly<ParsedImport>): string {
  let output = css;
  if (imported.layer) output = `@layer ${imported.layer}{${output}}`;
  if (imported.supports) {
    const condition = /^(?:\(|not\b)/iu.test(imported.supports)
      ? imported.supports
      : `(${imported.supports})`;
    output = `${carrierSupportsHeader(`@supports ${condition}`)}{${output}}`;
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

function ownershipBlockingSyntaxError(message: string): DiagnosticError {
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
