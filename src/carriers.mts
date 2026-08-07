import {
  cssFunctions,
  cssEscapeEnd,
  cssIdentifierAt,
  decodeCssEscapes,
  scanCssSyntax,
  skipCssTrivia,
  validCssLayerName,
  wholeCssIdentifier,
} from "./css-syntax.mjs";
import {
  AUTO_ALL_PENDING,
  AUTO_CARRIER_SET,
  SHAPE_CARRIERS,
  SHAPE_MARKERS,
  SHAPE_PROPERTY_BY_CARRIER,
  SHAPE_STATUS_CARRIERS,
  compileAuthoredAllCarrierCss,
  compileAuthoredShapeCarrierCss,
  isShapeProperty,
} from "./carrier-contract.mjs";
import type { SelectorObservation, ShapeProperty } from "./carrier-contract.mjs";
export {
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
} from "./carrier-contract.mjs";
export type { SelectorObservation } from "./carrier-contract.mjs";
import { propertyAffectsOwnedPaint } from "./paint-properties.mjs";
import { nextDocumentId } from "./identity.mjs";
import { selectorObservation } from "./selector-metadata.mjs";
export { mergeSelectorObservation, selectorObservation } from "./selector-metadata.mjs";
import {
  carrierSupportsCondition,
  carrierSupportsHeader,
  evaluateSupportsCondition,
} from "./supports.mjs";
export {
  carrierSupportsCondition,
  evaluateSupportsCondition,
  supportsConditionTestsShape,
} from "./supports.mjs";

type RuntimeWindow = Window & typeof globalThis;
type RuntimeDocument = Document & Readonly<{ defaultView: RuntimeWindow }>;

export type DiagnosticOwner = object | string;
interface TextReplacement {
  readonly end: number;
  readonly start: number;
  readonly value: string;
}

export interface SelectorRecord {
  readonly declaration: string | null;
  readonly selector: string;
  readonly source: string;
}

interface MediaQueryState {
  readonly matches: boolean;
  readonly query: string;
}

export interface MediaDependencySnapshot {
  readonly queries: readonly string[];
  readonly states: readonly Readonly<MediaQueryState>[];
}

export const EMPTY_MEDIA_DEPENDENCIES: Readonly<MediaDependencySnapshot> = Object.freeze({
  queries: Object.freeze([]),
  states: Object.freeze([]),
});

function mediaDependencies(
  states: Iterable<Readonly<MediaQueryState>> = [],
): Readonly<MediaDependencySnapshot> {
  const captured = Object.freeze([...new Map([...states].map(({ matches, query }) => (
    [`${matches ? "1" : "0"}\u0000${query}`, Object.freeze({ matches, query })]
  ))).values()]);
  if (captured.length === 0) return EMPTY_MEDIA_DEPENDENCIES;
  return Object.freeze({
    queries: Object.freeze([...new Set(captured.map(({ query }) => query).filter(Boolean))].sort()),
    states: captured,
  });
}

export function captureMediaDependency(
  view: RuntimeWindow,
  query: string,
): Readonly<MediaDependencySnapshot> {
  return query
    ? mediaDependencies([Object.freeze({ query, matches: view.matchMedia(query).matches })])
    : EMPTY_MEDIA_DEPENDENCIES;
}

export function mergeMediaDependencies(
  dependencies: Iterable<Readonly<MediaDependencySnapshot>>,
): Readonly<MediaDependencySnapshot> {
  return mediaDependencies([...dependencies].flatMap(({ states }) => states));
}

export function mediaDependenciesAreCurrent(
  view: RuntimeWindow,
  dependencies: Readonly<MediaDependencySnapshot>,
): boolean {
  return dependencies.states.every(({ query, matches }) => view.matchMedia(query).matches === matches);
}

export function mediaDependencyKey(
  view: RuntimeWindow,
  queries: Iterable<string>,
  dependencies: Readonly<MediaDependencySnapshot> = EMPTY_MEDIA_DEPENDENCIES,
): string {
  const captured = new Map(dependencies.states.map(({ query, matches }) => [query, matches]));
  return JSON.stringify([...new Set(queries)].filter(Boolean).sort().map((query) => (
    [query, captured.get(query) ?? view.matchMedia(query).matches]
  )));
}

export interface CarrierCompilation {
  readonly css: string;
  readonly establishesLayer?: boolean | undefined;
  readonly failedImports?: number | undefined;
  readonly imports?: number | undefined;
  readonly mediaDependencies: Readonly<MediaDependencySnapshot>;
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
  readonly name?: string | undefined;
  readonly nameList?: Iterable<string> | undefined;
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
  readonly mediaDependencies?: Readonly<MediaDependencySnapshot> | undefined;
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
        const replacement = compileAuthoredAllCarrierCss(
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
        value: compileAuthoredShapeCarrierCss(property as ShapeProperty, source.slice(index + 1, end)),
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

function ruleBrand(rule: CSSRule): string {
  return Object.prototype.toString.call(rule).slice(8, -1);
}

function ruleAtKeyword(brand: string): string {
  return brand
    .replace(/^CSS/u, "")
    .replace(/Rule$/u, "")
    .replace(/[A-Z]/gu, (character, index) => `${index === 0 ? "" : "-"}${character.toLowerCase()}`);
}

function ruleHeader(rule: Readonly<CarrierRule>): string {
  if (typeof rule.selectorText === "string") return rule.selectorText;
  if (typeof rule.keyText === "string") return rule.keyText;
  const brand = ruleBrand(rule);
  if (brand === "CSSMediaRule") {
    return `@media ${(rule.conditionText || rule.media?.mediaText || "").trim()}`.trimEnd();
  }
  if (brand === "CSSSupportsRule") {
    return `@supports ${(rule.conditionText || "").trim()}`.trimEnd();
  }
  if (brand === "CSSLayerBlockRule") return `@layer ${(rule.name || "").trim()}`.trimEnd();
  if (brand === "CSSContainerRule") {
    return `@container ${(rule.conditionText || "").trim()}`.trimEnd();
  }
  if (brand === "CSSKeyframesRule") return `@keyframes ${(rule.name || "").trim()}`.trimEnd();
  if (rule.cssRules) return `@${ruleAtKeyword(brand)}`;
  if (brand === "CSSNestedDeclarations") return "";
  let index = -1;
  scanCssSyntax(rule.cssText, 0, (position, character, parentheses, brackets, blocks) => {
    if (character !== "{" || parentheses !== 0 || brackets !== 0 || blocks !== 0) return;
    index = position;
    return false;
  });
  return index < 0 ? "" : rule.cssText.slice(0, index).trim();
}

interface RuleTreeAnalysis {
  readonly affectsOwnedPaint: boolean;
  readonly descendantsAffectOwnedPaint: boolean;
  readonly descendantsEstablishLayer: boolean;
  readonly descendantsRegisterProperty: boolean;
  readonly establishesLayer: boolean;
  readonly ownAffectsOwnedPaint: boolean;
  readonly registersProperty: boolean;
}

function ruleRegistersProperty(rule: Readonly<CarrierRule>): boolean {
  return ruleBrand(rule) === "CSSPropertyRule" || /^@property\b/iu.test(ruleHeader(rule));
}

function analyzeRuleTree(
  rule: Readonly<CarrierRule>,
  cache: WeakMap<CSSRule, Readonly<RuleTreeAnalysis>>,
): Readonly<RuleTreeAnalysis> {
  const cached = cache.get(rule);
  if (cached) return cached;
  const pending: Array<Readonly<{ expanded: boolean; rule: Readonly<CarrierRule> }>> = [
    { expanded: false, rule },
  ];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (cache.has(current.rule)) continue;
    if (!current.expanded) {
      pending.push({ expanded: true, rule: current.rule });
      if (current.rule.cssRules) {
        for (let index = current.rule.cssRules.length - 1; index >= 0; index -= 1) {
          const child = current.rule.cssRules[index] as CarrierRule;
          if (!cache.has(child)) pending.push({ expanded: false, rule: child });
        }
      }
      continue;
    }
    let descendantsAffectOwnedPaint = false;
    let descendantsEstablishLayer = false;
    let descendantsRegisterProperty = false;
    if (current.rule.cssRules) {
      for (const child of current.rule.cssRules) {
        const analysis = cache.get(child);
        if (!analysis) throw new Error("Cornerfill rule-tree analysis did not visit a child rule");
        descendantsAffectOwnedPaint ||= analysis.affectsOwnedPaint;
        descendantsEstablishLayer ||= analysis.establishesLayer;
        descendantsRegisterProperty ||= analysis.registersProperty;
      }
    }
    const ownAffectsOwnedPaint = styleMayAffectOwnedPaint(current.rule.style);
    const ownRegistersProperty = ruleRegistersProperty(current.rule);
    cache.set(current.rule, Object.freeze({
      affectsOwnedPaint: ownAffectsOwnedPaint || descendantsAffectOwnedPaint,
      descendantsAffectOwnedPaint,
      descendantsEstablishLayer,
      descendantsRegisterProperty,
      establishesLayer: ruleBrand(current.rule).startsWith("CSSLayer") || descendantsEstablishLayer,
      ownAffectsOwnedPaint,
      registersProperty: ownRegistersProperty || descendantsRegisterProperty,
    }));
  }
  return cache.get(rule)!;
}

function ruleCurrentlyEstablishesLayer(
  document: RuntimeDocument,
  rule: Readonly<CarrierRule>,
  cache: WeakMap<CSSRule, Readonly<RuleTreeAnalysis>>,
  current: WeakMap<CSSRule, boolean>,
): boolean {
  if (current.has(rule)) return current.get(rule)!;
  const pending: Array<Readonly<{ expanded: boolean; rule: Readonly<CarrierRule> }>> = [
    { expanded: false, rule },
  ];
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (current.has(item.rule)) continue;
    const analysis = analyzeRuleTree(item.rule, cache);
    if (!item.expanded && analysis.establishesLayer
      && !ruleBrand(item.rule).startsWith("CSSLayer") && item.rule.cssRules) {
      pending.push({ expanded: true, rule: item.rule });
      for (let index = item.rule.cssRules.length - 1; index >= 0; index -= 1) {
        const child = item.rule.cssRules[index] as CarrierRule;
        if (!current.has(child)) pending.push({ expanded: false, rule: child });
      }
      continue;
    }
    let establishes = analysis.establishesLayer
      && ruleBrand(item.rule).startsWith("CSSLayer");
    if (!establishes && analysis.establishesLayer && item.rule.cssRules) {
      const match = groupingRuleMatches(
        document,
        item.rule,
        ruleHeader(item.rule),
        false,
        [],
      );
      if (match.active || match.auditOnly) {
        for (const child of item.rule.cssRules) {
          if (current.get(child) !== true) continue;
          establishes = true;
          break;
        }
      }
    }
    current.set(item.rule, establishes);
  }
  return current.get(rule)!;
}

function ruleListCurrentlyEstablishesLayer(
  document: RuntimeDocument,
  rules: CSSRuleList | readonly CSSRule[],
  cache: WeakMap<CSSRule, Readonly<RuleTreeAnalysis>>,
  current: WeakMap<CSSRule, boolean>,
): boolean {
  for (const rule of rules) {
    if (ruleCurrentlyEstablishesLayer(document, rule as CarrierRule, cache, current)) return true;
  }
  return false;
}

interface GroupingRuleMatch {
  readonly active: boolean;
  readonly auditOnly: boolean;
  readonly shapeSupports: boolean;
  readonly truthDiffers: boolean;
}

const ACTIVE_GROUPING_MATCH: Readonly<GroupingRuleMatch> = Object.freeze({
  active: true,
  auditOnly: false,
  shapeSupports: false,
  truthDiffers: false,
});

function groupingRuleMatches(
  document: RuntimeDocument,
  rule: Readonly<CarrierRule>,
  header: string,
  observesCarrierCascade: boolean,
  mediaStates: MediaQueryState[],
): Readonly<GroupingRuleMatch> {
  if (/^@media\b/iu.test(header)) {
    const condition = (rule.conditionText || rule.media?.mediaText
      || header.replace(/^@media\b/iu, "")).trim();
    const matches = !condition || document.defaultView.matchMedia(condition).matches;
    if (observesCarrierCascade && condition) {
      mediaStates.push(Object.freeze({ query: condition, matches }));
    }
    return Object.freeze({ active: matches, auditOnly: false, shapeSupports: false, truthDiffers: false });
  }
  if (/^@supports\b/iu.test(header)) {
    const condition = (rule.conditionText || header.replace(/^@supports\b/iu, "")).trim();
    if (!condition) return ACTIVE_GROUPING_MATCH;
    const evaluation = evaluateSupportsCondition(document.defaultView, condition);
    return Object.freeze({
      active: evaluation.carrierMatches,
      auditOnly: evaluation.auditOnly,
      shapeSupports: evaluation.testsShape,
      truthDiffers: evaluation.truthDiffers,
    });
  }
  return ACTIVE_GROUPING_MATCH;
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

const EMPTY_STYLE_PROPERTIES: readonly string[] = Object.freeze([]);

function styleProperties(style: CSSStyleDeclaration | null | undefined): readonly string[] {
  if (!style) return EMPTY_STYLE_PROPERTIES;
  return Object.freeze(Array.from({ length: style.length }, (_value, index) => style.item(index)).filter(Boolean));
}

function styleMayAffectOwnedPaint(style: CSSStyleDeclaration | null | undefined): boolean {
  return styleProperties(style).some(propertyAffectsOwnedPaint);
}

interface PaintAttributeObservation {
  readonly attributes: Set<string>;
  conservative: boolean;
}

function observePaintAttributeDependencies(
  style: CSSStyleDeclaration | null | undefined,
  observation: PaintAttributeObservation,
): void {
  for (const property of styleProperties(style)) {
    if (!propertyAffectsOwnedPaint(property)) continue;
    const value = style!.getPropertyValue(property);
    for (const fn of cssFunctions(value)) {
      if (fn.name !== "attr") continue;
      const end = matchingParenthesis(value, fn.open);
      const body = end < 0 ? "" : value.slice(fn.open + 1, end);
      const name = cssIdentifierAt(body, skipCssTrivia(body, 0));
      if (!name) {
        observation.conservative = true;
        continue;
      }
      const next = skipCssTrivia(body, name.end);
      if (next < body.length && body[next] === "|") {
        observation.conservative = true;
        continue;
      }
      observation.attributes.add(name.value.toLowerCase());
    }
  }
}

function unsupportedConditionalDeclarations(
  style: CSSStyleDeclaration | null | undefined,
): readonly string[] {
  return Object.freeze(styleProperties(style).filter((property) => !AUTO_CARRIER_SET.has(property)));
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

type CarrierOutput = string | readonly CarrierOutput[];

interface CarrierSerializationFrame {
  readonly complete: ((output: readonly CarrierOutput[]) => void) | null;
  index: number;
  readonly output: CarrierOutput[];
  readonly parentSelector: string | null;
  readonly rules: CSSRuleList | readonly CSSRule[];
  readonly strictShapeSupports: boolean;
}

function carrierOutputText(output: readonly CarrierOutput[]): string {
  const chunks: string[] = [];
  const pending: CarrierOutput[] = [...output].reverse();
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (typeof item === "string") {
      chunks.push(item);
      continue;
    }
    for (let index = item.length - 1; index >= 0; index -= 1) pending.push(item[index]!);
  }
  return chunks.join("");
}

function serializeCarrierRules(
  document: RuntimeDocument,
  rules: CSSRuleList | readonly CSSRule[],
  selectors: Set<string>,
  selectorOccurrences: string[],
  selectorRecords: Readonly<SelectorRecord>[],
  sourceIdentity: string,
  mediaStates: MediaQueryState[],
  ruleAnalysis: WeakMap<CSSRule, Readonly<RuleTreeAnalysis>>,
  currentLayerAnalysis: WeakMap<CSSRule, boolean>,
  paintAttributeObservation: PaintAttributeObservation,
  observationSelectors: Set<string>,
  strictShapeSupports = false,
  parentSelector: string | null = null,
  selectorDisplay: ((selector: string) => string) | null = null,
): string {
  let serialized: readonly CarrierOutput[] = Object.freeze([]);
  const frames: CarrierSerializationFrame[] = [{
    complete: null,
    index: 0,
    output: [],
    parentSelector,
    rules,
    strictShapeSupports,
  }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    if (frame.index >= frame.rules.length) {
      frames.pop();
      if (frame.complete) frame.complete(frame.output);
      else serialized = frame.output;
      continue;
    }
    const rawRule = frame.rules[frame.index]!;
    frame.index += 1;
    const rule = rawRule as CarrierRule;
    const brand = ruleBrand(rule);
    if (brand === "CSSNamespaceRule") {
      throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve @namespace selector bindings");
    }
    if (brand === "CSSLayerStatementRule") {
      frame.output.push(rule.cssText.trim());
      continue;
    }
    const header = ruleHeader(rule);
    if (/^@(?:-webkit-)?keyframes\b/iu.test(header)) {
      if (frame.strictShapeSupports) {
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
    if (frame.strictShapeSupports && typeof rule.selectorText !== "string"
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
      ? (frame.parentSelector
        ? resolvedNestedSelector(ruleSelector, frame.parentSelector)
        : ruleSelector)
      : null;
    if (selector && selectorUsesNamespace(selector)) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS cannot discover namespace-qualified selector matches: ${selector}`,
      );
    }
    const analysis = analyzeRuleTree(rule, ruleAnalysis);
    if (analysis.ownAffectsOwnedPaint) {
      observePaintAttributeDependencies(rule.style, paintAttributeObservation);
    }
    const observesOwnedSubtree = Boolean(rule.cssRules && analysis.descendantsAffectOwnedPaint);
    const establishesNestedLayer = Boolean(rule.cssRules && analysis.descendantsEstablishLayer);
    const observesPropertyRegistration = Boolean(
      rule.cssRules && analysis.descendantsRegisterProperty,
    );
    const groupingMatch = rule.cssRules
      ? groupingRuleMatches(
        document,
        rule,
        header,
        observesOwnedSubtree || establishesNestedLayer || observesPropertyRegistration,
        mediaStates,
      )
      : ACTIVE_GROUPING_MATCH;
    const currentlyEstablishesNestedLayer = Boolean(
      rule.cssRules
      && establishesNestedLayer
      && ruleListCurrentlyEstablishesLayer(
        document,
        rule.cssRules,
        ruleAnalysis,
        currentLayerAnalysis,
      ),
    );
    if (groupingMatch.truthDiffers && currentlyEstablishesNestedLayer) {
      throw ownershipBlockingSyntaxError(
        `Automatic CSS cannot preserve cascade-layer order when feature-query truth changes: ${header}`,
      );
    }
    if (!groupingMatch.active && !groupingMatch.auditOnly) continue;
    if (/^@container\b/iu.test(header) && (observesOwnedSubtree || observesPropertyRegistration)) {
      throw ownershipBlockingSyntaxError(`Automatic CSS cannot observe container-query paint dependencies: ${header}`);
    }
    if (/^@layer\s*$/iu.test(header) && observesOwnedSubtree) {
      throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
    }
    if (rule.cssRules && typeof rule.selectorText !== "string"
      && !supportedGroupingRule
      && (observesOwnedSubtree || establishesNestedLayer || observesPropertyRegistration)) {
      throw ownershipBlockingSyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
    }
    if (rule.cssRules && typeof rule.selectorText !== "string" && !supportedGroupingRule) continue;
    const complete = (nested: readonly CarrierOutput[]) => {
      if (groupingMatch.auditOnly) return;
      if (nestedDeclarations) {
        const parent = frame.parentSelector;
        if (!parent) {
          throw ownershipBlockingSyntaxError("Automatic CSS found nested declarations without a parent selector");
        }
        if (analysis.ownAffectsOwnedPaint) observationSelectors.add(parent);
        if (frame.strictShapeSupports) {
          const unsupported = unsupportedConditionalDeclarations(rule.style);
          if (unsupported.length > 0) {
            throw ownershipBlockingSyntaxError(
              `Automatic CSS refuses @supports corner-shape declarations because they also declare: ${unsupported.join(", ")}`,
            );
          }
        }
        if (declarations.shape) {
          selectors.add(parent);
          selectorOccurrences.push(parent);
          selectorRecords.push(Object.freeze({
            source: sourceIdentity,
            selector: parent,
            declaration: rule.style ? diagnosticShapeDeclarations(rule.style).join("; ") || null : null,
          }));
        }
        if (declarations.css) frame.output.push(declarations.css);
        return;
      }
      if (selector) {
        if (analysis.ownAffectsOwnedPaint) observationSelectors.add(selector);
        if (frame.strictShapeSupports) {
          const unsupported = unsupportedConditionalDeclarations(rule.style);
          if (unsupported.length > 0) {
            throw ownershipBlockingSyntaxError(
              `Automatic CSS refuses @supports corner-shape rule ${rule.selectorText} because it also declares: ${unsupported.join(", ")}`,
            );
          }
        }
        if (!declarations.css && nested.length === 0) return;
        if (declarations.shape) {
          selectors.add(selector);
          selectorOccurrences.push(selector);
          selectorRecords.push(Object.freeze({
            source: sourceIdentity,
            selector,
            declaration: rule.style ? diagnosticShapeDeclarations(rule.style).join("; ") || null : null,
          }));
        }
        frame.output.push([`${rule.selectorText}{${declarations.css}`, nested, "}"]);
        return;
      }
      if (typeof rule.keyText === "string") {
        if (declarations.css) frame.output.push(`${rule.keyText}{${declarations.css}}`);
        return;
      }
      const preserveEmptyLayer = frame.strictShapeSupports && namedLayer;
      if (nested.length === 0 && !preserveEmptyLayer) return;
      if (/^@layer\s*$/iu.test(header)) {
        throw ownershipBlockingSyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
      }
      if (/^@supports\b/iu.test(header)) {
        frame.output.push([`${carrierSupportsHeader(header)}{`, nested, "}"]);
      } else if (/^@media\b/iu.test(header) || namedLayer) {
        frame.output.push([`${header}{`, nested, "}"]);
      } else {
        throw ownershipBlockingSyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
      }
    };
    if (rule.cssRules) {
      frames.push({
        complete,
        index: 0,
        output: [],
        parentSelector: selector ?? frame.parentSelector,
        rules: rule.cssRules,
        strictShapeSupports: frame.strictShapeSupports || groupingMatch.shapeSupports,
      });
    } else complete(Object.freeze([]));
  }
  return carrierOutputText(serialized);
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
    if (!sheet) {
      throw ownershipBlockingSyntaxError(
        "Automatic CSS could not obtain a browser stylesheet parser",
      );
    }
    const selectors = new Set<string>();
    const selectorOccurrences: string[] = [];
    const observationSelectors = new Set<string>();
    const selectorRecords: Readonly<SelectorRecord>[] = [];
    const mediaStates: MediaQueryState[] = [];
    const ruleAnalysis = new WeakMap<CSSRule, Readonly<RuleTreeAnalysis>>();
    const currentLayerAnalysis = new WeakMap<CSSRule, boolean>();
    const paintAttributeObservation: PaintAttributeObservation = {
      attributes: new Set(),
      conservative: false,
    };
    const establishesLayer = ruleListCurrentlyEstablishesLayer(
      document,
      sheet.cssRules,
      ruleAnalysis,
      currentLayerAnalysis,
    );
    let css: string;
    try {
      css = serializeCarrierRules(
        document,
        sheet.cssRules,
        selectors,
        selectorOccurrences,
        selectorRecords,
        sourceIdentity,
        mediaStates,
        ruleAnalysis,
        currentLayerAnalysis,
        paintAttributeObservation,
        observationSelectors,
        strictShapeSupports,
        null,
        selectorDisplay,
      );
    } catch (error) {
      throw annotateDiagnostic(error, {
        mediaDependencies: mediaDependencies(mediaStates),
      });
    }
    const selectorList = Object.freeze([...selectors]);
    const selectorState = selectorObservation(observationSelectors);
    const observation = paintAttributeObservation.attributes.size > 0
      || paintAttributeObservation.conservative
      ? Object.freeze({
        ...selectorState,
        attributes: Object.freeze([...new Set([
          ...selectorState.attributes,
          ...paintAttributeObservation.attributes,
        ])].sort()),
        conservative: selectorState.conservative || paintAttributeObservation.conservative,
      })
      : selectorState;
    if (observation.unobservableStates.length > 0) {
      throw annotateDiagnostic(ownershipBlockingSyntaxError(
        `Automatic CSS cannot observe selector state: ${observation.unobservableStates.join(", ")}`,
      ), {
        mediaDependencies: mediaDependencies(mediaStates),
      });
    }
    return Object.freeze({
      css,
      selectors: selectorList,
      selectorOccurrences: Object.freeze(selectorOccurrences),
      selectorRecords: Object.freeze(selectorRecords),
      observation,
      establishesLayer,
      mediaDependencies: mediaDependencies(mediaStates),
      parsedRuleCount: sheet.cssRules.length,
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
  const rawContents = urlFunction.value;
  const contents = rawContents.slice(skipCssTrivia(rawContents, 0));
  const nested = importString(contents);
  if (nested && skipCssTrivia(contents, nested.end) !== contents.length) {
    throw new SyntaxError("Automatic CSS found an invalid @import url()");
  }
  let unquotedEnd = contents.length;
  if (!nested) {
    for (let index = 0; index < contents.length;) {
      const character = contents[index]!;
      if (/\s/u.test(character) || (character === "/" && contents[index + 1] === "*")) {
        unquotedEnd = index;
        break;
      }
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
    if (unquotedEnd === 0 || skipCssTrivia(contents, unquotedEnd) !== contents.length) {
      throw new SyntaxError("Automatic CSS found an invalid @import url()");
    }
  }
  return Object.freeze({
    rest: urlFunction.rest,
    url: nested?.value ?? decodeCssEscapes(contents.slice(0, unquotedEnd)),
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
  const dependencies = mergeMediaDependencies([
    details.mediaDependencies ?? EMPTY_MEDIA_DEPENDENCIES,
    previous.mediaDependencies ?? EMPTY_MEDIA_DEPENDENCIES,
  ]);
  Object.defineProperty(value, "cornerfillDiagnostic", {
    configurable: true,
    value: Object.freeze({
      ...details,
      ...previous,
      ...(dependencies.states.length > 0 ? { mediaDependencies: dependencies } : {}),
    }),
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
  let placeholderPrefix = nextDocumentId(document, "cssom-import");
  if (source.includes(placeholderPrefix) || insertedRule.includes(placeholderPrefix)) {
    placeholderPrefix = nextDocumentId(document, "cssom-import");
    if (source.includes(placeholderPrefix) || insertedRule.includes(placeholderPrefix)) {
      throw new Error("Cornerfill could not allocate a collision-free CSSOM import placeholder");
    }
  }
  let placeholderIndex = 0;
  const imports = new Map<string, string>();
  const placeholder = (statement: string) => {
    const rule = `@layer ${placeholderPrefix}-${placeholderIndex};`;
    placeholderIndex += 1;
    imports.set(rule, statement);
    return rule;
  };
  const split = leadingImportStatements(source);
  const chunks: string[] = [];
  let cursor = 0;
  for (const record of split.imports) {
    chunks.push(source.slice(cursor, record.start), placeholder(record.prelude));
    cursor = record.end;
  }
  chunks.push(source.slice(cursor));
  const parserSource = chunks.join("");
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
