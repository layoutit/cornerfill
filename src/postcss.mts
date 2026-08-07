import postcss from "postcss";
import type { AtRule, Declaration, Node, PluginCreator, Root, Rule } from "postcss";
import {
  AUTO_CARRIERS,
  AUTO_UNSET,
  COMPILED_MANIFEST_PROPERTY_PREFIX,
  compiledManifestCssValue,
  compiledManifestPropertyName,
  compileAllCarrierDeclarations,
  compileShapeCarrierDeclarations,
  isShapeProperty,
  parseAuthoredDeclarationValue,
  serializeCompiledManifest,
} from "./carrier-contract.mjs";
import { decodeCssEscapes } from "./css-syntax.mjs";
import { cssIdentifierAt, scanCssSyntax } from "./css-syntax.mjs";
import { propertyAffectsOwnedPaint } from "./paint-properties.mjs";
import { selectorObservation } from "./selector-metadata.mjs";
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

function sourceAlreadyCompiled(root: Root): boolean {
  let found = false;
  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith(COMPILED_MANIFEST_PROPERTY_PREFIX)) found = true;
  });
  return found;
}

function declarationRule(declaration: Declaration): Rule | null {
  return declaration.parent?.type === "rule" ? declaration.parent : null;
}

function declarationValue(authored: Declaration): Readonly<ParsedDeclarationValue> {
  return authored.important
    ? Object.freeze({ important: true, value: authored.value })
    : parseAuthoredDeclarationValue(authored.value);
}

function collectMediaQueries(declaration: Declaration, target: Set<string>): void {
  let parent: Node | undefined = declaration.parent;
  while (parent) {
    if (parent.type === "atrule") {
      const atRule = parent as AtRule;
      if (decodeCssEscapes(atRule.name).toLowerCase() === "media" && atRule.params.trim()) {
        target.add(atRule.params.trim());
      }
    }
    parent = parent.parent;
  }
}

const LEGACY_PSEUDO_ELEMENTS = new Set(["after", "before", "first-letter", "first-line"]);

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

function validateObservedRule(rule: Rule): void {
  if (rule.parent?.type === "rule") {
    throw rule.error("Cornerfill found unresolved CSS nesting; run it after the nesting transform");
  }
  let parent: Node | undefined = rule.parent;
  while (parent) {
    if (parent.type === "atrule"
      && decodeCssEscapes((parent as AtRule).name).toLowerCase() === "container") {
      throw rule.error("Cornerfill cannot observe dynamic @container activation; use cornerfill/runtime");
    }
    parent = parent.parent;
  }
  const issue = selectorIssue(rule.selector);
  if (issue) throw rule.error(`Cornerfill cannot compile ${rule.selector}: ${issue}`);
  try {
    compiledSelectorPlan([rule.selector]);
  } catch (error) {
    throw rule.error(`Cornerfill cannot compile ${rule.selector}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
  const observation = selectorObservation([rule.selector]);
  if (observation.unobservableStates.length > 0) {
    throw rule.error(
      `Cornerfill cannot observe selector state: ${observation.unobservableStates.join(", ")}`,
    );
  }
}

function registerCarrier(root: Root, property: string): void {
  const registration = postcss.atRule({ name: "property", params: property });
  registration.append(
    postcss.decl({ prop: "syntax", value: '"*"' }),
    postcss.decl({ prop: "inherits", value: "false" }),
    postcss.decl({ prop: "initial-value", value: AUTO_UNSET }),
  );
  root.append(registration);
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

const cornerfillPostcss: PluginCreator<CornerfillPostcssOptions> = () => ({
  postcssPlugin: "cornerfill",
  Once(root) {
    if (sourceAlreadyCompiled(root)) return;
    const selectors = new Set<string>();
    const observationSelectors = new Set<string>();
    const mediaQueries = new Set<string>();
    const generatedProperties = new Set<string>();
    const validatedRules = new WeakSet<Rule>();
    const hostContextRules = new Set<Rule>();

    root.walkAtRules((atRule) => {
      const name = decodeCssEscapes(atRule.name).toLowerCase();
      if (name === "import") {
        throw atRule.error("Cornerfill must run after @import expansion");
      }
    });

    root.walkDecls((authored) => {
      const property = decodeCssEscapes(authored.prop).toLowerCase();
      const rule = declarationRule(authored);
      if (rule && propertyAffectsOwnedPaint(property)) {
        if (!validatedRules.has(rule)) {
          validateObservedRule(rule);
          validatedRules.add(rule);
          if (compiledHostContextFallbackSelectors(rule.selector).length > 0) {
            hostContextRules.add(rule);
          }
        }
        observationSelectors.add(rule.selector);
        collectMediaQueries(authored, mediaQueries);
      }
      if (!isShapeProperty(property) && property !== "all") return;
      if (!rule) {
        if (isShapeProperty(property)) {
          throw authored.error("Cornerfill cannot compile corner-shape outside a style rule");
        }
        return;
      }
      const parsed = declarationValue(authored);
      const compiled = isShapeProperty(property)
        ? compileShapeCarrierDeclarations(property, parsed.value, parsed.important)
        : compileAllCarrierDeclarations(parsed.value, parsed.important);
      if (compiled.length === 0) return;
      selectors.add(rule.selector);
      let anchor = authored;
      for (const record of compiled) {
        const carrier = authored.clone({
          prop: record.property,
          value: record.value,
          important: record.important,
        });
        anchor.parent!.insertAfter(anchor, carrier);
        anchor = carrier;
        generatedProperties.add(record.property);
      }
    });

    root.walkAtRules((atRule) => {
      if (decodeCssEscapes(atRule.name).toLowerCase() !== "supports") return;
      atRule.params = rewriteCornerShapeSupportsCondition(atRule.params);
    });

    for (const rule of hostContextRules) {
      if (!rule.parent) continue;
      const selectors = compiledHostContextFallbackSelectors(rule.selector);
      if (selectors.length > 0) rule.after(rule.clone({ selector: selectors.join(",") }));
    }

    if (selectors.size === 0) return;
    for (const property of AUTO_CARRIERS) {
      if (generatedProperties.has(property)) registerCarrier(root, property);
    }
    const serialized = serializeCompiledManifest({
      selectors,
      hostContexts: compiledSelectorPlan([...hostContextRules].map(({ selector }) => selector))
        .hostContexts,
      mediaQueries,
      observation: selectorObservation(observationSelectors),
    });
    const property = compiledManifestPropertyName(serialized);
    const value = compiledManifestCssValue(serialized);
    registerCarrier(root, property);
    appendManifestRule(root, ":root", property, value);
    appendManifestRule(root, ":host", property, value);
  },
});

cornerfillPostcss.postcss = true;

export default cornerfillPostcss;
