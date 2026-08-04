import { cssDeclarationSignature } from "./css-syntax.mjs";
import { LIVE_IMAGE_PROPERTY } from "./ownership.mjs";
import type { CornerfillElement } from "./ownership.mjs";
import { ALL_CARRIERS } from "./style.mjs";

interface RuntimeAnimationEvent extends Event {
  readonly animationName: string;
  readonly propertyName: string;
}

interface RuntimeAnimation extends Animation {
  readonly animationName?: string | undefined;
  readonly effect: (AnimationEffect & {
    getKeyframes?: (() => readonly Record<string, unknown>[]) | undefined;
  }) | null;
}

const ANIMATED_PAINT_PROPERTIES = new Set([
  "-webkit-appearance",
  "-webkit-backdrop-filter",
  "appearance",
  "backdrop-filter",
  "border-collapse",
  "box-shadow",
  "box-sizing",
  "color",
  "content",
  "direction",
  "display",
  "height",
  "image-rendering",
  "text-orientation",
  "visibility",
  "width",
  "writing-mode",
]);

const ANIMATED_PAINT_PREFIXES = [
  "background",
  "border",
  "corner",
  "font",
  "list-style",
  "outline",
  "overflow",
  "padding",
];

function animatedPropertyAffectsPaint(property: string): boolean {
  return property.startsWith("--")
    || ANIMATED_PAINT_PROPERTIES.has(property)
    || ANIMATED_PAINT_PREFIXES.some((prefix) => (
      property === prefix || property.startsWith(`${prefix}-`)
    ));
}

function animationEvent(event: Event): RuntimeAnimationEvent {
  return event as RuntimeAnimationEvent;
}

function normalizeAnimatedProperty(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

function visibilityAffectingInlineSignature(value: unknown): string {
  return cssDeclarationSignature(value, (property) => (
    property === "visibility" || property === "all"
      || (property.startsWith("--") && property !== LIVE_IMAGE_PROPERTY)
  ));
}

function paintAffectingInlineSignature(value: unknown, ignorePositionAxes = false): string {
  return cssDeclarationSignature(value, (property) => {
    if (property === LIVE_IMAGE_PROPERTY
      || property === "visibility"
      || (ignorePositionAxes && property === "background-position-x")
      || (ignorePositionAxes && property === "background-position-y")
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
  });
}

function positionAffectingInlineSignature(value: unknown): string {
  return cssDeclarationSignature(value, (property) => (
    property === "background-position-x" || property === "background-position-y"
  ));
}

function nodeContainsStylesheetSource(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : null;
  return Boolean(element) && (
    /^(?:style|link)$/u.test(element!.localName)
    || Boolean(element!.querySelector("style,link[rel~=stylesheet]"))
  );
}

export function inlineCarrierSignature(element: CornerfillElement): string {
  return ALL_CARRIERS
    .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
    .join("|");
}

export function styleMutationMayAffectVisibility(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return visibilityAffectingInlineSignature(record.oldValue)
    !== visibilityAffectingInlineSignature(target?.getAttribute("style"));
}

export function styleMutationMayAffectPaint(
  record: MutationRecord,
  ignorePositionAxes = false,
): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return paintAffectingInlineSignature(record.oldValue, ignorePositionAxes)
    !== paintAffectingInlineSignature(target?.getAttribute("style"), ignorePositionAxes);
}

export function mutationStylesheetRoot(record: MutationRecord): Node | null {
  if (record.type === "characterData") {
    const style = record.target.parentElement;
    return style?.localName === "style" ? style.getRootNode() : null;
  }
  if (record.type === "attributes") {
    const target = record.target as Element;
    return /^(?:style|link)$/u.test(target.localName) ? target.getRootNode() : null;
  }
  const target = record.target as Element;
  if (target.localName === "style"
    || [...record.addedNodes, ...record.removedNodes].some(nodeContainsStylesheetSource)) {
    return target.getRootNode();
  }
  return null;
}

export function styleMutationMayAffectPosition(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return positionAffectingInlineSignature(record.oldValue)
    !== positionAffectingInlineSignature(target?.getAttribute("style"));
}

export function hasShadowIncludingAncestor(
  ancestors: ReadonlySet<Node>,
  element: Node,
): boolean {
  let current: Node | null = element;
  while (current) {
    if (ancestors.has(current)) return true;
    if (current.parentNode) {
      current = current.parentNode;
      continue;
    }
    const root = current.getRootNode?.() as Node & { readonly host?: Element | undefined };
    current = root.host ?? null;
  }
  return false;
}

export function animationToken(event: Event): string {
  const runtimeEvent = animationEvent(event);
  if (event.type.startsWith("transition")) return `transition:${runtimeEvent.propertyName}`;
  return `animation:${runtimeEvent.animationName}`;
}

export function animationAffectsPaint(element: CornerfillElement, event: Event): boolean {
  const runtimeEvent = animationEvent(event);
  if (event.type.startsWith("transition")) {
    return animatedPropertyAffectsPaint(runtimeEvent.propertyName);
  }
  const animations = (element.getAnimations?.() ?? []) as RuntimeAnimation[];
  const matching = animations.filter((animation) => (
    !runtimeEvent.animationName || animation.animationName === runtimeEvent.animationName
  ));
  if (matching.length === 0) return true;
  return matching.some((animation) => {
    const keyframes = animation.effect?.getKeyframes?.();
    if (!keyframes) return true;
    return keyframes.some((keyframe) => (
      Object.keys(keyframe).some((property) => {
        const normalized = normalizeAnimatedProperty(property);
        return animatedPropertyAffectsPaint(normalized);
      })
    ));
  });
}
