import {
  parseCornerShape,
  parseCornerShapeValue,
  serializeShapeParameter,
} from "./values.mjs";
import {
  cssFunctions,
  cssIdentifierAt,
  cssWideKeyword,
  decodeCssEscapes,
  replaceCssCommentsWithWhitespace,
  scanCssSyntax,
  skipCssTrivia,
} from "./css-syntax.mjs";

export interface SelectorObservation {
  readonly attributes: readonly string[];
  readonly characterData: boolean;
  readonly conservative: boolean;
  readonly events: readonly string[];
  readonly invalidation: SelectorInvalidation;
  readonly unobservableStates: readonly string[];
}

export type SelectorInvalidation = "parent" | "root" | "self" | "subtree";

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

export type ShapeProperty = keyof typeof SHAPE_PROPERTIES;
export type ShapeCarrier = (typeof SHAPE_PROPERTIES)[ShapeProperty];
type ShapeLonghand = Exclude<ShapeProperty, "corner-shape">;

export const SHAPE_CARRIERS: readonly ShapeCarrier[] = Object.freeze(Object.values(SHAPE_PROPERTIES));
export const SHAPE_PROPERTY_BY_CARRIER: Readonly<Record<ShapeCarrier, ShapeProperty>> = Object.freeze(
  Object.fromEntries(Object.entries(SHAPE_PROPERTIES).map(([property, carrier]) => [carrier, property])),
) as Readonly<Record<ShapeCarrier, ShapeProperty>>;

export const AUTO_UNSET = "__cornerfill_unset__";
export const AUTO_PHYSICAL_SHAPE = "--cornerfill-auto-physical-shape";
export const AUTO_LOGICAL_SHAPE = "--cornerfill-auto-logical-shape";
export const AUTO_ALL_PENDING = "--cornerfill-auto-all-pending";
export const AUTO_ALL_VALUE = "--cornerfill-auto-all-value";
export const AUTO_SHAPE_SOURCE = "--cornerfill-auto-shape-source";
const AUTO_ALL_SENTINEL = "__cornerfill_all__";
export const SUPPORTED_ALL_VALUE = new RegExp(`^(?:${AUTO_ALL_SENTINEL}\\s+(?:initial|unset))?$`, "iu");

export const PHYSICAL_SHAPE_PROPERTIES: readonly ShapeLonghand[] = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);

export const LOGICAL_SHAPE_PROPERTIES: readonly ShapeLonghand[] = Object.freeze([
  "corner-start-start-shape",
  "corner-start-end-shape",
  "corner-end-end-shape",
  "corner-end-start-shape",
]);

const SHAPE_STATUS_PROPERTIES = Object.freeze(Object.fromEntries(
  [...PHYSICAL_SHAPE_PROPERTIES, ...LOGICAL_SHAPE_PROPERTIES].map((property) => (
    [property, `--cornerfill-auto-status-${property}`]
  )),
)) as Readonly<Record<ShapeLonghand, string>>;

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
export const AUTO_CARRIER_SET: ReadonlySet<string> = new Set(AUTO_CARRIERS);

export const SHAPE_MARKERS = Object.freeze([
  ...SHAPE_STATUS_CARRIERS,
  AUTO_PHYSICAL_SHAPE,
  AUTO_LOGICAL_SHAPE,
  AUTO_ALL_PENDING,
  AUTO_ALL_VALUE,
  AUTO_SHAPE_SOURCE,
]);

export interface CarrierDeclaration {
  readonly important: boolean;
  readonly property: string;
  readonly value: string;
}

function declaration(property: string, value: string, important: boolean): Readonly<CarrierDeclaration> {
  return Object.freeze({ important, property, value });
}

function declarations(
  properties: Iterable<string>,
  value: string,
  important: boolean,
): Readonly<CarrierDeclaration>[] {
  return [...properties].map((property) => declaration(property, value, important));
}

export function isShapeProperty(value: string): value is ShapeProperty {
  return Object.hasOwn(SHAPE_PROPERTIES, value);
}

function normalizedValue(value: string): string {
  return replaceCssCommentsWithWhitespace(value).trim();
}

function statusDeclarations(
  properties: readonly ShapeLonghand[],
  status: "ok" | "unsupported",
  important: boolean,
): Readonly<CarrierDeclaration>[] {
  return properties.map((property) => declaration(
    SHAPE_STATUS_PROPERTIES[property],
    status,
    important,
  ));
}

function declarationState(important: boolean): Readonly<CarrierDeclaration>[] {
  return [
    declaration(AUTO_SHAPE_SOURCE, "1", important),
    declaration(AUTO_ALL_PENDING, AUTO_UNSET, important),
    declaration(AUTO_ALL_VALUE, AUTO_UNSET, important),
  ];
}

function cssWideDeclarations(
  property: ShapeProperty,
  value: string,
  important: boolean,
  longhands: readonly ShapeLonghand[],
  marker: string,
): Readonly<CarrierDeclaration>[] {
  const carrierValue = /^(?:initial|unset)$/iu.test(value) ? AUTO_UNSET : value;
  const carriers = property === "corner-shape"
    ? longhands.map((longhand) => SHAPE_PROPERTIES[longhand])
    : [SHAPE_PROPERTIES[property]];
  return [
    ...declarations(carriers, carrierValue, important),
    ...declarations(longhands.map((longhand) => SHAPE_STATUS_PROPERTIES[longhand]), carrierValue, important),
    declaration(marker, carrierValue, important),
  ];
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

export function compileShapeCarrierDeclarations(
  property: ShapeProperty,
  rawValue: string,
  important = false,
): readonly Readonly<CarrierDeclaration>[] {
  const value = normalizedValue(rawValue);
  const decodedValue = decodeCssEscapes(value);
  const cssWide = cssWideKeyword(value);
  const longhands: readonly ShapeLonghand[] = property === "corner-shape"
    ? PHYSICAL_SHAPE_PROPERTIES
    : [property];
  const marker = property === "corner-shape" || PHYSICAL_SHAPE_PROPERTIES.includes(property)
    ? AUTO_PHYSICAL_SHAPE
    : AUTO_LOGICAL_SHAPE;
  const state = declarationState(important);
  if (cssWide) {
    return Object.freeze([
      ...cssWideDeclarations(property, cssWide, important, longhands, marker),
      ...state,
    ]);
  }
  try {
    if (cssFunctions(value).some(({ name }) => name === "env" || name === "var")) {
      return Object.freeze([
        declaration(SHAPE_PROPERTIES[property], value, important),
        ...statusDeclarations(longhands, "ok", important),
        declaration(marker, "1", important),
        ...state,
      ]);
    }
    if (property === "corner-shape") {
      const values = parseCornerShape(decodedValue);
      return Object.freeze([
        ...PHYSICAL_SHAPE_PROPERTIES.map((longhand, index) => declaration(
          SHAPE_PROPERTIES[longhand],
          serializeShapeParameter(values[index]!),
          important,
        )),
        ...statusDeclarations(longhands, "ok", important),
        declaration(AUTO_PHYSICAL_SHAPE, "1", important),
        ...state,
      ]);
    }
    return Object.freeze([
      declaration(
        SHAPE_PROPERTIES[property],
        serializeShapeParameter(parseCornerShapeValue(decodedValue)),
        important,
      ),
      ...statusDeclarations(longhands, "ok", important),
      declaration(marker, "1", important),
      ...state,
    ]);
  } catch {
    return potentiallyValidUnsupportedShape(decodedValue)
      ? Object.freeze([
        ...statusDeclarations(longhands, "unsupported", important),
        declaration(marker, "1", important),
        ...state,
      ])
      : Object.freeze([]);
  }
}

export function compileAllCarrierDeclarations(
  rawValue: string,
  important = false,
): readonly Readonly<CarrierDeclaration>[] {
  const value = normalizedValue(rawValue);
  const cssWide = cssWideKeyword(value);
  const substitution = cssFunctions(value).some(({ name }) => name === "env" || name === "var");
  if (!cssWide && !substitution) return Object.freeze([]);
  if (cssWide) {
    const carrierValue = cssWide === "initial" || cssWide === "unset" ? AUTO_UNSET : cssWide;
    return Object.freeze(declarations(ALL_RESET_CARRIERS, carrierValue, important));
  }
  return Object.freeze([
    ...declarations(CASCADE_CARRIERS, value, important),
    declaration(AUTO_ALL_PENDING, "1", important),
    declaration(AUTO_ALL_VALUE, `${AUTO_ALL_SENTINEL} ${value}`, important),
  ]);
}

export function parseAuthoredDeclarationValue(
  raw: string,
): Readonly<{ important: boolean; value: string }> {
  let importantStart = -1;
  scanCssSyntax(raw, 0, (index, character, parentheses, brackets, blocks) => {
    if (character === "!" && parentheses === 0 && brackets === 0 && blocks === 0) {
      importantStart = index;
    }
  });
  if (importantStart >= 0) {
    const identifierStart = skipCssTrivia(raw, importantStart + 1);
    const identifier = cssIdentifierAt(raw, identifierStart);
    if (identifier?.value.toLowerCase() !== "important"
      || skipCssTrivia(raw, identifier.end) !== raw.length) importantStart = -1;
  }
  return Object.freeze({
    value: normalizedValue(importantStart < 0 ? raw : raw.slice(0, importantStart)),
    important: importantStart >= 0,
  });
}

export function serializeCarrierDeclarations(
  records: Iterable<Readonly<CarrierDeclaration>>,
): string {
  return [...records].map(({ important, property, value }) => (
    `${property}:${value}${important ? " !important" : ""};`
  )).join("");
}

export function compileAuthoredShapeCarrierCss(property: ShapeProperty, rawValue: string): string {
  const { important, value } = parseAuthoredDeclarationValue(rawValue);
  return serializeCarrierDeclarations(compileShapeCarrierDeclarations(property, value, important));
}

export function compileAuthoredAllCarrierCss(
  rawDeclaration: string,
  rawValue: string,
): string | null {
  const { important, value } = parseAuthoredDeclarationValue(rawValue);
  const compiled = compileAllCarrierDeclarations(value, important);
  return compiled.length === 0 ? null : `${rawDeclaration};${serializeCarrierDeclarations(compiled)}`;
}

export function resolvedCarrierValue(
  values: Readonly<Record<string, string>>,
  property: string,
): string {
  const value = (values[property] ?? "").trim();
  return value === AUTO_UNSET || /^(?:initial|unset)$/iu.test(value) ? "" : value;
}

export function compiledCarrierProblem(
  values: Readonly<Record<string, string>>,
  label = "Compiled CSS",
): string | null {
  if (resolvedCarrierValue(values, AUTO_ALL_PENDING)
    && resolvedCarrierValue(values, AUTO_SHAPE_SOURCE)) {
    const resolved = resolvedCarrierValue(values, AUTO_ALL_VALUE);
    if (!SUPPORTED_ALL_VALUE.test(resolved)) {
      return `${label} cannot safely transport this all: var(...) result; use cornerfill/runtime for explicit state.`;
    }
  }
  if (SHAPE_STATUS_CARRIERS.some((property) => (
    resolvedCarrierValue(values, property) === "unsupported"
  ))) {
    return `${label} cannot resolve this corner-shape value; use cornerfill/runtime for explicit state.`;
  }
  const variableShorthand = resolvedCarrierValue(values, SHAPE_PROPERTIES["corner-shape"]);
  const competingLonghand = [...PHYSICAL_SHAPE_PROPERTIES, ...LOGICAL_SHAPE_PROPERTIES]
    .some((property) => resolvedCarrierValue(values, SHAPE_PROPERTIES[property]));
  if (variableShorthand && competingLonghand) {
    return `${label} refuses a variable corner-shape shorthand combined with longhands because their cascade order cannot be preserved.`;
  }
  if (resolvedCarrierValue(values, AUTO_PHYSICAL_SHAPE)
    && resolvedCarrierValue(values, AUTO_LOGICAL_SHAPE)) {
    return `${label} refuses mixed physical and logical corner-shape declarations because their cross-family cascade cannot be preserved.`;
  }
  return null;
}

export function hasResolvedShapeCarrier(values: Readonly<Record<string, string>>): boolean {
  return SHAPE_CARRIERS.some((property) => resolvedCarrierValue(values, property) !== "");
}

export const COMPILED_MANIFEST_SCHEMA = "cornerfill-compiled@1";
export const COMPILED_MANIFEST_PROPERTY_PREFIX = "--cornerfill-compiled-manifest-";
export const COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX = "data-cornerfill-host-context-";
const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

export interface CornerfillCompiledManifest {
  readonly hostContexts: readonly Readonly<CornerfillCompiledHostContext>[];
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
  readonly schema: typeof COMPILED_MANIFEST_SCHEMA;
  readonly selectors: readonly string[];
}

export interface CornerfillCompiledHostContext {
  readonly argument: string;
  readonly attribute: string;
}

export interface CornerfillCompiledManifestInput {
  readonly hostContexts?: Iterable<Readonly<CornerfillCompiledHostContext>> | undefined;
  readonly mediaQueries?: Iterable<string> | undefined;
  readonly observation: Readonly<SelectorObservation>;
  readonly selectors: Iterable<string>;
}

function normalizedHostContexts(
  values: Iterable<Readonly<CornerfillCompiledHostContext>>,
): readonly Readonly<CornerfillCompiledHostContext>[] {
  const contexts = new Map<string, Readonly<CornerfillCompiledHostContext>>();
  for (const value of values) {
    if (!value || typeof value !== "object"
      || typeof value.argument !== "string"
      || typeof value.attribute !== "string") {
      throw new TypeError("compiled manifest host context is invalid");
    }
    const argument = value.argument.trim();
    const attribute = value.attribute.trim();
    if (attribute !== compiledHostContextAttribute(argument)) {
      throw new TypeError("compiled manifest host context marker is invalid");
    }
    const existing = contexts.get(attribute);
    if (existing && existing.argument !== argument) {
      throw new TypeError("compiled manifest host context marker collision");
    }
    contexts.set(attribute, Object.freeze({ argument, attribute }));
  }
  return Object.freeze([...contexts.values()].sort((left, right) => (
    left.attribute.localeCompare(right.attribute)
  )));
}

function normalizedStrings(values: Iterable<string>, allowEmpty = false): readonly string[] {
  const normalized = [...values].map((value) => {
    if (typeof value !== "string") throw new TypeError("compiled manifest entries must be strings");
    return value.trim();
  }).filter((value) => allowEmpty || value !== "");
  return Object.freeze([...new Set(normalized)].sort());
}

function manifestObservation(value: Readonly<SelectorObservation>): Readonly<SelectorObservation> {
  if (!value || typeof value !== "object"
    || typeof value.characterData !== "boolean"
    || typeof value.conservative !== "boolean"
    || !new Set(["parent", "root", "self", "subtree"]).has(value.invalidation)) {
    throw new TypeError("compiled manifest observation is invalid");
  }
  return Object.freeze({
    attributes: normalizedStrings(value.attributes),
    characterData: value.characterData,
    conservative: value.conservative,
    events: normalizedStrings(value.events),
    invalidation: value.invalidation,
    unobservableStates: normalizedStrings(value.unobservableStates),
  });
}

export function createCompiledManifest(
  input: Readonly<CornerfillCompiledManifestInput>,
): Readonly<CornerfillCompiledManifest> {
  if (!input || typeof input !== "object") throw new TypeError("compiled manifest input must be an object");
  const selectors = normalizedStrings(input.selectors);
  if (selectors.length === 0) throw new TypeError("compiled manifest requires at least one selector");
  return Object.freeze({
    schema: COMPILED_MANIFEST_SCHEMA,
    selectors,
    hostContexts: normalizedHostContexts(input.hostContexts ?? []),
    mediaQueries: normalizedStrings(input.mediaQueries ?? []),
    observation: manifestObservation(input.observation),
  });
}

export function serializeCompiledManifest(input: Readonly<CornerfillCompiledManifestInput>): string {
  return JSON.stringify(createCompiledManifest(input));
}

export function compiledManifestPropertyName(serializedManifest: string): string {
  if (typeof serializedManifest !== "string") {
    throw new TypeError("serialized compiled manifest must be a string");
  }
  let hash = FNV64_OFFSET;
  for (let index = 0; index < serializedManifest.length; index += 1) {
    hash ^= BigInt(serializedManifest.charCodeAt(index));
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  }
  return `${COMPILED_MANIFEST_PROPERTY_PREFIX}${hash.toString(16).padStart(16, "0")}`;
}

export function compiledHostContextAttribute(argument: string): string {
  if (typeof argument !== "string" || !argument.trim()) {
    throw new TypeError("compiled :host-context() requires a selector argument");
  }
  const normalized = argument.trim();
  let hash = FNV64_OFFSET;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= BigInt(normalized.charCodeAt(index));
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  }
  return `${COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX}${hash.toString(16).padStart(16, "0")}`;
}

export function compiledManifestCssValue(serializedManifest: string): string {
  if (typeof serializedManifest !== "string") {
    throw new TypeError("serialized compiled manifest must be a string");
  }
  return `"${serializedManifest.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function parseCompiledManifestCssValue(source: string): Readonly<CornerfillCompiledManifest> {
  if (typeof source !== "string") throw new TypeError("compiled manifest CSS value must be a string");
  const value = source.trim();
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value.at(-1) !== quote) {
    throw new TypeError("compiled manifest CSS value must be one string token");
  }
  return parseCompiledManifest(decodeCssEscapes(value.slice(1, -1)));
}

export function parseCompiledManifest(source: string): Readonly<CornerfillCompiledManifest> {
  if (typeof source !== "string") throw new TypeError("compiled manifest source must be a string");
  const parsed: unknown = JSON.parse(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("compiled manifest must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schema !== COMPILED_MANIFEST_SCHEMA) {
    throw new TypeError(`unsupported compiled manifest schema: ${String(record.schema)}`);
  }
  if (!Array.isArray(record.selectors) || !Array.isArray(record.mediaQueries)) {
    throw new TypeError("compiled manifest selector or media list is invalid");
  }
  if (record.hostContexts !== undefined && !Array.isArray(record.hostContexts)) {
    throw new TypeError("compiled manifest host context list is invalid");
  }
  const observation = record.observation;
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    throw new TypeError("compiled manifest observation is invalid");
  }
  const observed = observation as Record<string, unknown>;
  if (!Array.isArray(observed.attributes)
    || !Array.isArray(observed.events)
    || !Array.isArray(observed.unobservableStates)) {
    throw new TypeError("compiled manifest observation lists are invalid");
  }
  return createCompiledManifest({
    selectors: record.selectors as string[],
    hostContexts: (record.hostContexts ?? []) as CornerfillCompiledHostContext[],
    mediaQueries: record.mediaQueries as string[],
    observation: {
      attributes: observed.attributes as string[],
      characterData: observed.characterData as boolean,
      conservative: observed.conservative as boolean,
      events: observed.events as string[],
      invalidation: observed.invalidation as SelectorInvalidation,
      unobservableStates: observed.unobservableStates as string[],
    },
  });
}
