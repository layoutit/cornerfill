import { cssDeclarationSignature } from "./css-syntax.mjs";
import { colorProbeMutation } from "./colors.mjs";
import {
  isStylesheetSourceElement,
  mutationTouchesStylesheetSource,
  nodeContainsStylesheetSource,
} from "./auto-contract.mjs";

export interface AutomaticMutationPlan {
  readonly attachments: boolean;
  readonly baseChanged: boolean;
  readonly candidates: boolean;
  readonly childListChanged: boolean;
  readonly sources: boolean;
}

interface AutomaticMutationContext {
  readonly candidateAttributes: ReadonlySet<string>;
  readonly candidates: ReadonlySet<Element>;
  readonly characterData: boolean;
  readonly conservative: boolean;
  readonly handles: ReadonlyMap<HTMLElement, unknown>;
  readonly hasAuthoredInlineShape: (element: Element) => boolean;
  readonly HTMLElement: typeof HTMLElement;
  readonly inline: ReadonlyMap<HTMLElement, unknown>;
  readonly rawStyleSelector: boolean;
  readonly selectors: ReadonlySet<string>;
}

const ROOT_SENSITIVE_CHILD_LIST_SELECTOR = /(?:[+~]|:(?:empty|first-(?:child|of-type)|focus-within|has|host-context|last-(?:child|of-type)|nth-(?:last-)?(?:child|col|of-type)|only-(?:child|of-type)|scope)\b)/iu;

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

function selectorRequiresRootChildListReconciliation(selector: string): boolean {
  return selector.includes("\\")
    || selector.includes("||")
    || ROOT_SENSITIVE_CHILD_LIST_SELECTOR.test(selector);
}

function trackedElement(element: Element, context: Readonly<AutomaticMutationContext>): boolean {
  return context.candidates.has(element)
    || (element instanceof context.HTMLElement
      && (context.inline.has(element) || context.handles.has(element)));
}

function trackedSubtree(root: Element, context: Readonly<AutomaticMutationContext>): boolean {
  if (trackedElement(root, context)) return true;
  for (const element of root.querySelectorAll("*")) {
    if (trackedElement(element, context)) return true;
  }
  return false;
}

function addedSubtreeMayContainCandidate(
  root: Element,
  selectorList: string,
  context: Readonly<AutomaticMutationContext>,
): boolean {
  if (context.hasAuthoredInlineShape(root)) return true;
  for (const element of root.querySelectorAll("[style]")) {
    if (context.hasAuthoredInlineShape(element)) return true;
  }
  if (!selectorList) return false;
  try {
    return root.matches(selectorList) || Boolean(root.querySelector(selectorList));
  } catch {
    return true;
  }
}

function placementMutationAffectsCandidate(
  placementTargets: ReadonlySet<Element>,
  context: Readonly<AutomaticMutationContext>,
): boolean {
  for (const candidate of context.candidates) {
    if (!(candidate instanceof context.HTMLElement) || context.handles.has(candidate)) continue;
    let ancestor: Element | null = candidate;
    while (ancestor) {
      if (placementTargets.has(ancestor)) return true;
      ancestor = ancestor.parentElement;
    }
  }
  return false;
}

export function planAutomaticMutations(
  records: readonly MutationRecord[],
  context: Readonly<AutomaticMutationContext>,
): Readonly<AutomaticMutationPlan> {
  let sources = false;
  let candidates = false;
  let attachments = false;
  let baseChanged = false;
  let childListChanged = false;
  let selectors: ReadonlySet<string> | null = null;
  let selectorList: string | null = null;
  let rootSensitiveSelectors: boolean | null = null;
  const placementTargets = new Set<Element>();
  for (const record of records) {
    if (colorProbeMutation(record)) continue;
    childListChanged ||= record.type === "childList";
    if (record.type === "attributes") {
      if (record.attributeName === "data-cornerfill-owned"
        || record.attributeName === "data-cornerfill-owned-border"
        || record.attributeName === "data-cornerfill-owned-outline"
        || record.attributeName === "data-cornerfill-owned-shadow"
        || record.attributeName === "data-cornerfill-owned-surface") continue;
      const target = record.target as Element;
      if (target.localName === "base" && record.attributeName === "href") {
        baseChanged = true;
        sources = true;
        candidates = true;
        continue;
      }
      if (mutationTouchesStylesheetSource(record)) {
        sources = true;
        candidates = true;
        continue;
      }
      if (record.attributeName !== "style") {
        candidates ||= Boolean(
          record.attributeName && context.candidateAttributes.has(record.attributeName),
        );
        continue;
      }
      const currentStyle = target.getAttribute("style");
      if (context.rawStyleSelector && record.oldValue !== currentStyle) {
        candidates = true;
        continue;
      }
      if (automaticStyleMutationSignature(record.oldValue)
        !== automaticStyleMutationSignature(currentStyle)) {
        candidates = true;
        continue;
      }
      if (automaticStyleMutationSignature(record.oldValue, false)
        !== automaticStyleMutationSignature(currentStyle, false)) {
        placementTargets.add(target);
      }
      continue;
    }
    if (record.type === "characterData") {
      const stylesheet = record.target.parentElement;
      if (stylesheet && isStylesheetSourceElement(stylesheet)) {
        sources = true;
        candidates = true;
        continue;
      }
      const parent = record.target.parentElement;
      candidates ||= context.characterData || Boolean(parent && trackedElement(parent, context));
      continue;
    }
    const mutationTarget = record.target as Element;
    if (mutationTarget.nodeType === 1 && isStylesheetSourceElement(mutationTarget)) {
      sources = true;
      candidates = true;
      continue;
    }
    const nodes = [...record.addedNodes, ...record.removedNodes];
    const elements = nodes.filter((node): node is Element => node.nodeType === 1);
    const baseNodes = elements.some((node) => (
      node.localName === "base" || Boolean(node.querySelector("base"))
    ));
    if (baseNodes) baseChanged = true;
    const sourceNodes = baseNodes || nodes.some(nodeContainsStylesheetSource);
    if (sourceNodes) {
      sources = true;
      candidates = true;
      continue;
    }
    if (elements.length === 0) {
      candidates ||= nodes.length > 0
        && (context.characterData || trackedElement(mutationTarget, context));
      continue;
    }
    selectors ??= context.selectors;
    selectorList ??= [...selectors].join(",");
    rootSensitiveSelectors ??= context.conservative
      || [...selectors].some(selectorRequiresRootChildListReconciliation);
    const added = [...record.addedNodes].filter((node): node is Element => node.nodeType === 1);
    const removed = [...record.removedNodes].filter((node): node is Element => node.nodeType === 1);
    candidates ||= rootSensitiveSelectors
      || added.some((element) => addedSubtreeMayContainCandidate(element, selectorList!, context))
      || removed.some((element) => trackedSubtree(element, context));
    attachments ||= !candidates && context.candidates.has(mutationTarget);
  }
  if (!candidates && placementTargets.size > 0) {
    candidates = placementMutationAffectsCandidate(placementTargets, context);
  }
  return Object.freeze({
    attachments,
    baseChanged,
    candidates,
    childListChanged,
    sources,
  });
}
