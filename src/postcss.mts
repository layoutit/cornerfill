import postcss from "postcss";
import type { AtRule, Declaration, Node, PluginCreator, Root, Rule } from "postcss";
import {
  AUTO_CARRIER_SET,
  AUTO_UNSET,
  COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX,
  COMPILED_MANIFEST_PROPERTY_PREFIX,
  compiledManifestCssValue,
  compiledManifestPropertyName,
  compileAllCarrierDeclarations,
  compileShapeCarrierDeclarations,
  isShapeProperty,
  parseAuthoredDeclarationValue,
  parseCompiledManifestCssValue,
  serializeCompiledManifest,
} from "./carrier-contract.mjs";
import type {
  CornerfillCompiledCustomPropertyInput,
  CornerfillCompiledHostContext,
  SelectorInvalidation,
  SelectorObservation,
} from "./carrier-contract.mjs";
import {
  cssFunctions,
  cssIdentifierAt,
  decodeCssEscapes,
  replaceCssCommentsWithWhitespace,
  scanCssSyntax,
  skipCssTrivia,
} from "./css-syntax.mjs";
import { standardPropertyAffectsOwnedPaint } from "./paint-properties.mjs";
import { mergeSelectorObservation, selectorObservation } from "./selector-metadata.mjs";
import { rewriteCornerShapeSupportsCondition } from "./supports.mjs";
import {
  compiledHostContextFallbackSelectors,
  compiledSelectorPlan,
} from "./compiled-selectors.mjs";

export interface CornerfillPostcssOptions {}

interface ParsedDeclarationValue {
  readonly important: boolean;
  readonly value: string;
}

interface RuleMetadata {
  readonly hostContexts: readonly Readonly<CornerfillCompiledHostContext>[];
  readonly mediaQueries: readonly string[];
  readonly observation: Readonly<SelectorObservation>;
}

interface MutableCustomProperty {
  readonly declarations: Declaration[];
  readonly hostContexts: Map<string, Readonly<CornerfillCompiledHostContext>>;
  readonly mediaQueries: Set<string>;
  readonly observations: Readonly<SelectorObservation>[];
  readonly problems: Set<string>;
  readonly references: Set<string>;
}

const CONTAINER_AT_RULES = new Set(["container"]);
const CONDITIONAL_SEMANTIC_AT_RULES = new Set([
  "container", "document", "media", "scope", "starting-style", "supports",
]);
const KEYFRAME_AT_RULES = new Set(["keyframes", "-webkit-keyframes"]);
const SCOPE_AT_RULES = new Set(["scope"]);
const LEGACY_PSEUDO_ELEMENTS = new Set(["after", "before", "first-letter", "first-line"]);
const MANIFEST_RULE_SELECTORS = new Set([":host", ":root"]);
const INVALIDATION_RANK: Readonly<Record<SelectorInvalidation, number>> = Object.freeze({
  self: 0,
  subtree: 1,
  parent: 2,
  root: 3,
});

function declarationRule(declaration: Declaration): Rule | null {
  return declaration.parent?.type === "rule" ? declaration.parent : null;
}

function declarationValue(authored: Declaration): Readonly<ParsedDeclarationValue> {
  return authored.important
    ? Object.freeze({ important: true, value: authored.value })
    : parseAuthoredDeclarationValue(authored.value);
}

function decodedProperty(authored: Declaration): string {
  const property = decodeCssEscapes(authored.prop);
  return property.startsWith("--") ? property : property.toLowerCase();
}

function matchingParenthesis(source: string, open: number): number {
  let close = -1;
  scanCssSyntax(source, open, (index, character, parentheses) => {
    if (character !== ")" || parentheses !== 1) return;
    close = index;
    return false;
  });
  return close;
}

function customPropertyReferences(value: string): readonly string[] {
  const references = new Set<string>();
  for (const fn of cssFunctions(value)) {
    if (fn.name !== "var") continue;
    const name = cssIdentifierAt(value, skipCssTrivia(value, fn.open + 1));
    if (name?.value.startsWith("--")) references.add(name.value);
  }
  return Object.freeze([...references].sort());
}

function ancestorAtRule(node: Node, names: ReadonlySet<string>): AtRule | null {
  let parent: Node | undefined = node.parent;
  while (parent) {
    if (parent.type === "atrule") {
      const atRule = parent as AtRule;
      if (names.has(decodeCssEscapes(atRule.name).toLowerCase())) return atRule;
    }
    parent = parent.parent;
  }
  return null;
}

function mediaQueries(declaration: Declaration): readonly string[] {
  const queries = new Set<string>();
  let parent: Node | undefined = declaration.parent;
  while (parent) {
    if (parent.type === "atrule") {
      const atRule = parent as AtRule;
      if (decodeCssEscapes(atRule.name).toLowerCase() === "media" && atRule.params.trim()) {
        queries.add(atRule.params.trim());
      }
    }
    parent = parent.parent;
  }
  return Object.freeze([...queries].sort());
}

function selectorTargetsPseudoElement(selector: string): boolean {
  let found = false;
  scanCssSyntax(selector, 0, (index, character) => {
    if (character !== ":") return;
    if (selector[index + 1] === ":") {
      found = true;
      return false;
    }
    const pseudo = cssIdentifierAt(selector, index + 1)?.value.toLowerCase();
    if (pseudo && LEGACY_PSEUDO_ELEMENTS.has(pseudo)) {
      found = true;
      return false;
    }
  });
  return found;
}

function selectorIssue(selector: string): string | null {
  let issue: string | null = null;
  scanCssSyntax(selector, 0, (index, character) => {
    if (character === "&") {
      issue = "unresolved CSS nesting; run Cornerfill after the nesting transform";
      return false;
    }
    if (character === "|") {
      const previous = selector[index - 1];
      const next = selector[index + 1];
      if (previous !== "|" && next !== "|" && next !== "=") {
        issue = "namespace-qualified selectors are not matchable by the compiled runtime";
        return false;
      }
    }
    if (character !== ":") return;
    if (selector[index + 1] === ":") {
      issue = "pseudo-elements cannot be painted by Cornerfill";
      return false;
    }
    const pseudo = cssIdentifierAt(selector, index + 1)?.value.toLowerCase();
    if (pseudo && LEGACY_PSEUDO_ELEMENTS.has(pseudo)) {
      issue = "pseudo-elements cannot be painted by Cornerfill";
      return false;
    }
  });
  return issue;
}

function selectorUsesScopedRelativeSyntax(selector: string): boolean {
  let branchStart = true;
  let relative = false;
  scanCssSyntax(selector, 0, (index, character, parentheses, brackets) => {
    if (character === ":" && selector[index + 1] !== ":") {
      const pseudo = cssIdentifierAt(selector, index + 1)?.value.toLowerCase();
      if (pseudo === "scope") {
        relative = true;
        return false;
      }
    }
    if (parentheses !== 0 || brackets !== 0) return;
    if (character === ",") {
      branchStart = true;
      return;
    }
    if (/\s/u.test(character)) return;
    if (branchStart && (character === ">" || character === "+" || character === "~")) {
      relative = true;
      return false;
    }
    if (branchStart && character === "|" && selector[index + 1] === "|") {
      relative = true;
      return false;
    }
    branchStart = false;
  });
  return relative;
}

function scopeBounds(atRule: AtRule): readonly string[] {
  const source = replaceCssCommentsWithWhitespace(atRule.params).trim();
  if (!source || source[0] !== "(") {
    throw new SyntaxError("Cornerfill requires an explicit @scope start selector");
  }
  const startClose = matchingParenthesis(source, 0);
  if (startClose < 0) throw new SyntaxError("Cornerfill found an unterminated @scope start selector");
  const start = source.slice(1, startClose).trim();
  if (!start) throw new SyntaxError("Cornerfill found an empty @scope start selector");
  let cursor = skipCssTrivia(source, startClose + 1);
  if (cursor === source.length) return Object.freeze([start]);
  const keyword = cssIdentifierAt(source, cursor);
  if (keyword?.value.toLowerCase() !== "to") {
    throw new SyntaxError("Cornerfill cannot parse this @scope prelude");
  }
  cursor = skipCssTrivia(source, keyword.end);
  if (source[cursor] !== "(") throw new SyntaxError("Cornerfill requires a parenthesized @scope limit");
  const limitClose = matchingParenthesis(source, cursor);
  if (limitClose < 0) throw new SyntaxError("Cornerfill found an unterminated @scope limit selector");
  const limit = source.slice(cursor + 1, limitClose).trim();
  if (!limit || skipCssTrivia(source, limitClose + 1) !== source.length) {
    throw new SyntaxError("Cornerfill cannot parse this @scope limit selector");
  }
  return Object.freeze([start, limit]);
}

function minimumInvalidation(
  observation: Readonly<SelectorObservation>,
  minimum: SelectorInvalidation,
): Readonly<SelectorObservation> {
  if (INVALIDATION_RANK[observation.invalidation] >= INVALIDATION_RANK[minimum]) return observation;
  return Object.freeze({ ...observation, invalidation: minimum });
}

function ruleMetadata(rule: Rule, declaration: Declaration): Readonly<RuleMetadata> {
  if (rule.parent?.type === "rule") {
    throw new SyntaxError("unresolved CSS nesting; run Cornerfill after the nesting transform");
  }
  const container = ancestorAtRule(declaration, CONTAINER_AT_RULES);
  if (container) {
    throw new SyntaxError("dynamic @container activation; use cornerfill/runtime");
  }
  const issue = selectorIssue(rule.selector);
  if (issue) throw new SyntaxError(issue);
  if (!ancestorAtRule(declaration, SCOPE_AT_RULES)
    && selectorUsesScopedRelativeSyntax(rule.selector)) {
    throw new SyntaxError("relative selectors and :scope require unsupported stylesheet scoping semantics");
  }
  const observations: Readonly<SelectorObservation>[] = [selectorObservation([rule.selector])];
  const hostContexts = compiledSelectorPlan([rule.selector]).hostContexts;
  let parent: Node | undefined = rule.parent;
  while (parent) {
    if (parent.type === "atrule"
      && decodeCssEscapes((parent as AtRule).name).toLowerCase() === "scope") {
      if (selectorUsesScopedRelativeSyntax(rule.selector)) {
        throw new SyntaxError("relative selectors and :scope inside @scope are not supported");
      }
      let bounds: readonly string[];
      try {
        bounds = scopeBounds(parent as AtRule);
      } catch (error) {
        throw new SyntaxError(error instanceof Error ? error.message : String(error));
      }
      for (const bound of bounds) {
        const boundIssue = selectorIssue(bound);
        if (boundIssue) throw new SyntaxError(`unobservable @scope boundary: ${boundIssue}`);
        if (selectorUsesScopedRelativeSyntax(bound)
          || compiledSelectorPlan([bound]).hostDependent) {
          throw new SyntaxError("@scope boundaries must use ordinary absolute selectors");
        }
      }
      observations.push(minimumInvalidation(selectorObservation(bounds), "subtree"));
    }
    parent = parent.parent;
  }
  const observation = mergeSelectorObservation(observations);
  if (observation.unobservableStates.length > 0) {
    throw new SyntaxError(`cannot observe selector state: ${observation.unobservableStates.join(", ")}`);
  }
  return Object.freeze({
    hostContexts,
    mediaQueries: mediaQueries(declaration),
    observation,
  });
}

function validateRule(rule: Rule, declaration: Declaration): Readonly<RuleMetadata> {
  try {
    return ruleMetadata(rule, declaration);
  } catch (error) {
    throw rule.error(`Cornerfill cannot compile ${rule.selector}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

function isGeneratedHostContextRule(rule: Rule): boolean {
  return rule.selector.includes(`:where([${COMPILED_HOST_CONTEXT_ATTRIBUTE_PREFIX}`);
}

function removeExistingCompiledMetadata(root: Root): void {
  const declarations: Declaration[] = [];
  const properties = new Set<string>();
  root.walkDecls((declaration) => {
    const property = decodedProperty(declaration);
    if (!property.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) return;
    let serialized: string;
    try {
      serialized = serializeCompiledManifest(parseCompiledManifestCssValue(declaration.value));
    } catch (error) {
      throw declaration.error(`Cornerfill found an invalid compiled manifest: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
    if (property !== compiledManifestPropertyName(serialized)
      || declaration.parent?.type !== "rule"
      || !MANIFEST_RULE_SELECTORS.has(declaration.parent.selector.trim())) {
      throw declaration.error("Cornerfill found a forged or misplaced compiled manifest declaration");
    }
    properties.add(property);
    declarations.push(declaration);
  });
  const registrations: AtRule[] = [];
  root.walkAtRules((atRule) => {
    if (decodeCssEscapes(atRule.name).toLowerCase() !== "property") return;
    const property = decodeCssEscapes(atRule.params).trim();
    if (!property.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) return;
    if (!properties.has(property)) {
      throw atRule.error("Cornerfill found an orphaned compiled manifest registration");
    }
    registrations.push(atRule);
  });
  for (const declaration of declarations) {
    const parent = declaration.parent;
    declaration.remove();
    if (parent?.type === "rule" && parent.nodes.length === 0) parent.remove();
  }
  for (const registration of registrations) registration.remove();
}

function registeredProperties(root: Root): Map<string, AtRule[]> {
  const properties = new Map<string, AtRule[]>();
  root.walkAtRules((atRule) => {
    if (decodeCssEscapes(atRule.name).toLowerCase() === "property") {
      const property = decodeCssEscapes(atRule.params).trim();
      const registrations = properties.get(property) ?? [];
      registrations.push(atRule);
      properties.set(property, registrations);
    }
  });
  return properties;
}

function validateCarrierRegistration(registration: AtRule, property: string): void {
  if (ancestorAtRule(registration, CONDITIONAL_SEMANTIC_AT_RULES)) {
    throw registration.error(`Cornerfill private registration ${property} cannot be conditional`);
  }
  const descriptors = new Map<string, string[]>();
  registration.walkDecls((declaration) => {
    const name = decodedProperty(declaration);
    const values = descriptors.get(name) ?? [];
    values.push(declaration.value.trim());
    descriptors.set(name, values);
  });
  const syntax = descriptors.get("syntax") ?? [];
  const inherits = descriptors.get("inherits") ?? [];
  const initial = descriptors.get("initial-value") ?? [];
  const exact = descriptors.size === 3
    && syntax.length === 1
    && new Set(['"*"', "'*'"]).has(syntax[0]!)
    && inherits.length === 1
    && inherits[0]!.toLowerCase() === "false"
    && initial.length === 1
    && initial[0] === AUTO_UNSET;
  if (!exact) {
    throw registration.error(`Cornerfill private registration ${property} has incompatible descriptors`);
  }
}

function registerCarrier(root: Root, property: string, registered: Map<string, AtRule[]>): void {
  const existing = registered.get(property);
  if (existing) {
    for (const registration of existing) validateCarrierRegistration(registration, property);
    return;
  }
  const registration = postcss.atRule({ name: "property", params: property });
  registration.append(
    postcss.decl({ prop: "syntax", value: '"*"' }),
    postcss.decl({ prop: "inherits", value: "false" }),
    postcss.decl({ prop: "initial-value", value: AUTO_UNSET }),
  );
  root.append(registration);
  registered.set(property, [registration]);
}

function appendManifestRule(
  root: Root,
  selector: ":host" | ":root",
  property: string,
  value: string,
): void {
  const rule = postcss.rule({ selector });
  rule.append(postcss.decl({ prop: property, value }));
  root.append(rule);
}

function carrierMatches(
  node: Node | undefined,
  expected: Readonly<{ important: boolean; property: string; value: string }>,
): boolean {
  if (node?.type !== "decl") return false;
  const declaration = node as Declaration;
  return decodedProperty(declaration) === expected.property
    && declaration.value.trim() === expected.value.trim()
    && Boolean(declaration.important) === expected.important;
}

function ensureCarrierDeclarations(
  authored: Declaration,
  compiled: readonly Readonly<{ important: boolean; property: string; value: string }>[],
): readonly Declaration[] {
  const parent = authored.parent;
  if (!parent || !("nodes" in parent)) return Object.freeze([]);
  const index = parent.index(authored);
  const existing = parent.nodes.slice(index + 1, index + 1 + compiled.length);
  if (existing.length === compiled.length
    && compiled.every((record, offset) => carrierMatches(existing[offset], record))) {
    return Object.freeze(existing as Declaration[]);
  }
  if (existing.some((node) => node.type === "decl" && AUTO_CARRIER_SET.has(decodedProperty(node)))) {
    throw authored.error("Cornerfill found stale or partially generated carrier declarations");
  }
  let anchor = authored;
  const declarations: Declaration[] = [];
  for (const record of compiled) {
    const carrier = authored.clone({
      prop: record.property,
      value: record.value,
      important: record.important,
    });
    anchor.parent!.insertAfter(anchor, carrier);
    anchor = carrier;
    declarations.push(carrier);
  }
  return Object.freeze(declarations);
}

function mergeHostContexts(
  target: Map<string, Readonly<CornerfillCompiledHostContext>>,
  values: Iterable<Readonly<CornerfillCompiledHostContext>>,
): void {
  for (const value of values) {
    const existing = target.get(value.attribute);
    if (existing && existing.argument !== value.argument) {
      throw new SyntaxError("compiled :host-context() marker hash collision");
    }
    target.set(value.attribute, value);
  }
}

function customPropertyRecord(
  records: Map<string, MutableCustomProperty>,
  name: string,
): MutableCustomProperty {
  let record = records.get(name);
  if (!record) {
    record = {
      declarations: [],
      hostContexts: new Map(),
      mediaQueries: new Set(),
      observations: [],
      problems: new Set(),
      references: new Set(),
    };
    records.set(name, record);
  }
  return record;
}

function reachableCustomProperties(
  roots: Iterable<string>,
  records: ReadonlyMap<string, MutableCustomProperty>,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    for (const reference of records.get(name)?.references ?? []) pending.push(reference);
  }
  return reachable;
}

const cornerfillPostcss: PluginCreator<CornerfillPostcssOptions> = () => ({
  postcssPlugin: "cornerfill",
  Once(root) {
    removeExistingCompiledMetadata(root);
    const registered = registeredProperties(root);
    const candidateSelectors = new Set<string>();
    const directHostContexts = new Map<string, Readonly<CornerfillCompiledHostContext>>();
    const directMediaQueries = new Set<string>();
    const directObservations: Readonly<SelectorObservation>[] = [];
    const referencedCustomProperties = new Set<string>();
    const customProperties = new Map<string, MutableCustomProperty>();
    const generatedProperties = new Set<string>();
    const generatedCarriers = new WeakSet<Declaration>();
    const reservedCarrierDeclarations: Declaration[] = [];
    const hostContextRules: Rule[] = [];
    const hostContextRuleSet = new Set<Rule>();
    const generatedRuleCounts = new Map<string, number>();

    for (const [property, registrations] of registered) {
      if (AUTO_CARRIER_SET.has(property)) {
        for (const registration of registrations) {
          validateCarrierRegistration(registration, property);
        }
      }
    }

    root.walkRules((rule) => {
      if (!isGeneratedHostContextRule(rule)) return;
      const signature = rule.toString();
      generatedRuleCounts.set(signature, (generatedRuleCounts.get(signature) ?? 0) + 1);
    });

    root.walkAtRules((atRule) => {
      const name = decodeCssEscapes(atRule.name).toLowerCase();
      if (name === "import") throw atRule.error("Cornerfill must run after @import expansion");
      if (name === "supports") atRule.params = rewriteCornerShapeSupportsCondition(atRule.params);
      if (name === "property" && ancestorAtRule(atRule, CONDITIONAL_SEMANTIC_AT_RULES)) {
        throw atRule.error("Cornerfill cannot compile conditional @property registration");
      }
      if (name === "layer"
        && (!atRule.nodes || atRule.params.trim())
        && ancestorAtRule(atRule, CONDITIONAL_SEMANTIC_AT_RULES)) {
        throw atRule.error("Cornerfill cannot compile conditional cascade-layer ordering");
      }
    });

    const rememberHostContextRule = (rule: Rule): void => {
      if (hostContextRuleSet.has(rule)
        || compiledHostContextFallbackSelectors(rule.selector).length === 0) return;
      hostContextRuleSet.add(rule);
      hostContextRules.push(rule);
    };

    root.walkDecls((authored) => {
      const rule = declarationRule(authored);
      if (rule && isGeneratedHostContextRule(rule)) return;
      const property = decodedProperty(authored);
      if (AUTO_CARRIER_SET.has(property)) {
        reservedCarrierDeclarations.push(authored);
        return;
      }
      if (property.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) return;

      if (property.startsWith("--")) {
        if (!rule || selectorTargetsPseudoElement(rule.selector)) return;
        const record = customPropertyRecord(customProperties, property);
        record.declarations.push(authored);
        for (const reference of customPropertyReferences(authored.value)) {
          record.references.add(reference);
        }
        const keyframes = ancestorAtRule(authored, KEYFRAME_AT_RULES);
        if (keyframes) {
          record.problems.add(`custom property ${property} is animated in @${keyframes.name}`);
          return;
        }
        try {
          const metadata = ruleMetadata(rule, authored);
          record.observations.push(minimumInvalidation(metadata.observation, "subtree"));
          for (const query of metadata.mediaQueries) record.mediaQueries.add(query);
          mergeHostContexts(record.hostContexts, metadata.hostContexts);
          rememberHostContextRule(rule);
        } catch (error) {
          record.problems.add(error instanceof Error ? error.message : String(error));
        }
        return;
      }

      const shape = isShapeProperty(property);
      const all = property === "all";
      const keyframes = ancestorAtRule(authored, KEYFRAME_AT_RULES);
      if (shape && !rule) {
        throw authored.error("Cornerfill cannot compile corner-shape outside a style rule");
      }
      if (keyframes && (shape || all || standardPropertyAffectsOwnedPaint(property))) {
        throw authored.error(`Cornerfill cannot compile fallback-relevant ${property} inside keyframes`);
      }
      if (keyframes) return;
      let compiled: ReturnType<typeof compileShapeCarrierDeclarations> = Object.freeze([]);
      if (shape || all) {
        if (!rule) return;
        const parsed = declarationValue(authored);
        compiled = shape
          ? compileShapeCarrierDeclarations(property, parsed.value, parsed.important)
          : compileAllCarrierDeclarations(parsed.value, parsed.important);
        if (compiled.length === 0) return;
      }

      if (!rule || !standardPropertyAffectsOwnedPaint(property)) return;
      if (selectorTargetsPseudoElement(rule.selector)) {
        if (shape || all) validateRule(rule, authored);
        return;
      }
      const metadata = validateRule(rule, authored);
      directObservations.push(metadata.observation);
      for (const query of metadata.mediaQueries) directMediaQueries.add(query);
      mergeHostContexts(directHostContexts, metadata.hostContexts);
      rememberHostContextRule(rule);
      for (const reference of customPropertyReferences(authored.value)) {
        referencedCustomProperties.add(reference);
      }
      if (!shape && !all) return;
      if (shape) candidateSelectors.add(rule.selector);
      for (const declaration of ensureCarrierDeclarations(authored, compiled)) {
        generatedCarriers.add(declaration);
      }
      for (const record of compiled) generatedProperties.add(record.property);
    });

    for (const declaration of reservedCarrierDeclarations) {
      if (!generatedCarriers.has(declaration)) {
        throw declaration.error("Cornerfill found an authored or orphaned private carrier declaration");
      }
    }

    const reachable = reachableCustomProperties(referencedCustomProperties, customProperties);
    for (const name of reachable) {
      const record = customProperties.get(name);
      if (!record || record.problems.size === 0) continue;
      throw record.declarations[0]!.error(
        `Cornerfill cannot observe ${name}: ${[...record.problems].join("; ")}`,
      );
    }

    for (const rule of hostContextRules) {
      if (!rule.parent) continue;
      const selectors = compiledHostContextFallbackSelectors(rule.selector);
      if (selectors.length === 0) continue;
      const clone = rule.clone({ selector: selectors.join(",") });
      const signature = clone.toString();
      const existing = generatedRuleCounts.get(signature) ?? 0;
      if (existing > 0) generatedRuleCounts.set(signature, existing - 1);
      else rule.after(clone);
    }
    if ([...generatedRuleCounts.values()].some((count) => count > 0)) {
      throw root.error("Cornerfill found an orphaned generated :host-context() fallback rule");
    }

    const hasManifest = candidateSelectors.size > 0
      || directObservations.length > 0
      || referencedCustomProperties.size > 0
      || customProperties.size > 0;
    if (!hasManifest) return;
    for (const property of generatedProperties) registerCarrier(root, property, registered);

    const serializedCustomProperties: CornerfillCompiledCustomPropertyInput[] = [];
    for (const [name, record] of customProperties) {
      serializedCustomProperties.push(Object.freeze({
        name,
        references: record.references,
        hostContexts: record.hostContexts.values(),
        mediaQueries: record.mediaQueries,
        observation: mergeSelectorObservation(record.observations),
        problems: record.problems,
      }));
    }
    const serialized = serializeCompiledManifest({
      candidateSelectors,
      customProperties: serializedCustomProperties,
      hostContexts: directHostContexts.values(),
      mediaQueries: directMediaQueries,
      observation: mergeSelectorObservation(directObservations),
      referencedCustomProperties,
    });
    const property = compiledManifestPropertyName(serialized);
    const value = compiledManifestCssValue(serialized);
    registerCarrier(root, property, registered);
    appendManifestRule(root, ":root", property, value);
    appendManifestRule(root, ":host", property, value);
  },
});

cornerfillPostcss.postcss = true;

export default cornerfillPostcss;
