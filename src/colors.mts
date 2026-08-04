import { nextDocumentId } from "./identity.mjs";
import {
  cssFunctions,
  cssIdentifierAt,
  skipCssTrivia,
  wholeCssIdentifier,
} from "./css-syntax.mjs";

export const COLOR_PROBE_ATTRIBUTE = "data-cornerfill-color-probe";

export type ContextualColorResolver = (value: string, label: string) => string;

export interface ElementColorContext {
  readonly color: string;
  readonly colorScheme: string;
  readonly customProperties: readonly Readonly<{
    readonly name: string;
    readonly priority: string;
    readonly value: string;
  }>[];
  readonly forcedColorAdjust: string;
  readonly signature: string;
}

interface ColorProbePair {
  readonly first: HTMLSpanElement;
  readonly parent: HTMLSpanElement;
  readonly second: HTMLSpanElement;
}

interface ColorProbeRootState {
  readonly available: ColorProbePair[];
  readonly cache: Map<string, string>;
  cacheClearQueued: boolean;
}

interface TypedColorProperties {
  readonly first: string;
  readonly second: string;
}

type RegisterableCss = typeof CSS & Readonly<{
  registerProperty?: ((definition: PropertyDefinition) => void) | undefined;
}>;

interface PropertyDefinition {
  readonly inherits: boolean;
  readonly initialValue: string;
  readonly name: string;
  readonly syntax: string;
}

const COLOR_CACHE_ENTRIES = 256;
const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "revert", "revert-layer", "unset"]);
const probeRoots = new WeakMap<Node, ColorProbeRootState>();
const typedColorProperties = new WeakMap<Document, TypedColorProperties>();

function colorProbeNode(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    if (current.nodeType === 1 && (current as Element).hasAttribute(COLOR_PROBE_ATTRIBUTE)) return true;
  }
  return false;
}

export function colorProbeMutation(record: MutationRecord): boolean {
  if (colorProbeNode(record.target)) return true;
  if (record.type !== "childList") return false;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return nodes.length > 0 && nodes.every(colorProbeNode);
}

function customPropertyReferences(source: string, output: Set<string>): void {
  if (!source.includes("\\") && !/var\(/iu.test(source)) return;
  for (const token of cssFunctions(source)) {
    if (token.name !== "var") continue;
    const name = cssIdentifierAt(source, skipCssTrivia(source, token.open + 1));
    if (name?.value.startsWith("--")) output.add(name.value);
  }
}

export function captureElementColorContext(
  computed: CSSStyleDeclaration,
  values: Iterable<string> = [],
): Readonly<ElementColorContext> {
  const pending = new Set<string>();
  for (const value of values) customPropertyReferences(String(value), pending);
  const customProperties: Readonly<{
    readonly name: string;
    readonly priority: string;
    readonly value: string;
  }>[] = [];
  const captured = new Set<string>();
  while (pending.size > 0) {
    const name = pending.values().next().value;
    if (!name) break;
    pending.delete(name);
    if (captured.has(name)) continue;
    captured.add(name);
    const value = computed.getPropertyValue(name);
    customProperties.push(Object.freeze({
      name,
      priority: computed.getPropertyPriority(name),
      value,
    }));
    customPropertyReferences(value, pending);
  }
  const color = computed.color || "canvastext";
  const colorScheme = computed.colorScheme || "normal";
  const forcedColorAdjust = computed.getPropertyValue("forced-color-adjust") || "auto";
  const signature = [
    color,
    colorScheme,
    forcedColorAdjust,
    ...customProperties.flatMap(({ name, value }) => [name, value]),
  ].join("\u0000");
  return Object.freeze({
    color,
    colorScheme,
    customProperties: Object.freeze(customProperties),
    forcedColorAdjust,
    signature,
  });
}

function registeredColorProperties(
  view: Window & typeof globalThis,
  document: Document,
): Readonly<TypedColorProperties> {
  const existing = typedColorProperties.get(document);
  if (existing) return existing;
  const registerProperty = (view.CSS as RegisterableCss).registerProperty;
  if (typeof registerProperty !== "function") {
    throw new TypeError("contextual CSS colors require CSS.registerProperty()");
  }
  const id = nextDocumentId(document, "color-probe", "cornerfill-color-probe");
  const properties = Object.freeze({ first: `--${id}-a`, second: `--${id}-b` });
  registerProperty.call(view.CSS, {
    name: properties.first,
    syntax: "<color>",
    inherits: false,
    initialValue: "rgba(1, 2, 3, 0.25)",
  });
  registerProperty.call(view.CSS, {
    name: properties.second,
    syntax: "<color>",
    inherits: false,
    initialValue: "rgba(4, 5, 6, 0.5)",
  });
  typedColorProperties.set(document, properties);
  return properties;
}

function createProbePair(document: Document): ColorProbePair {
  const parent = document.createElement("span");
  const first = document.createElement("span");
  const second = document.createElement("span");
  const probeRoot = parent.attachShadow({ mode: "closed" });
  parent.setAttribute(COLOR_PROBE_ATTRIBUTE, "");
  first.setAttribute(COLOR_PROBE_ATTRIBUTE, "");
  second.setAttribute(COLOR_PROBE_ATTRIBUTE, "");
  parent.style.cssText = "position:fixed!important;width:0!important;height:0!important;contain:strict!important;visibility:hidden!important;pointer-events:none!important";
  for (const probe of [first, second]) {
    probe.style.setProperty("color", "inherit", "important");
    probe.style.setProperty("color-scheme", "inherit", "important");
    probe.style.setProperty("forced-color-adjust", "inherit", "important");
  }
  probeRoot.append(first, second);
  return { first, parent, second };
}

function rootState(root: Node): ColorProbeRootState {
  let state = probeRoots.get(root);
  if (!state) {
    state = { available: [], cache: new Map(), cacheClearQueued: false };
    probeRoots.set(root, state);
  }
  return state;
}

function absoluteColor(color: string): string | null {
  const identifier = wholeCssIdentifier(color)?.value.toLowerCase();
  if (identifier) return identifier === "transparent" ? color : null;
  if (/^#[0-9a-f]{3,8}$/iu.test(color)) return color;
  if (/^(?:rgba?|hsla?)\(/iu.test(color)
    && !/(?:\bcurrentcolor\b|\bfrom\b|(?:attr|env|var)\s*\()/iu.test(color)) return color;
  return null;
}

function cacheResolvedColor(state: ColorProbeRootState, key: string, value: string): void {
  state.cache.set(key, value);
  if (!state.cacheClearQueued) {
    state.cacheClearQueued = true;
    setTimeout(() => {
      state.cache.clear();
      state.cacheClearQueued = false;
    }, 0);
  }
  if (state.cache.size <= COLOR_CACHE_ENTRIES) return;
  const oldest = state.cache.keys().next().value;
  if (oldest !== undefined) state.cache.delete(oldest);
}

export function withElementColorResolver<T>(
  view: Window & typeof globalThis,
  element: Element,
  context: Readonly<ElementColorContext>,
  work: (resolve: ContextualColorResolver) => T,
): T {
  const document = element.ownerDocument;
  const root = element.getRootNode();
  const container = root instanceof view.ShadowRoot ? root : document.documentElement;
  const state = rootState(root);
  let pair: ColorProbePair | null = null;
  let properties: Readonly<TypedColorProperties> | null = null;
  const ensurePair = () => {
    if (pair) return pair;
    properties = registeredColorProperties(view, document);
    pair = state.available.pop() ?? createProbePair(document);
    pair.parent.style.setProperty("color", context.color, "important");
    pair.parent.style.setProperty("color-scheme", context.colorScheme, "important");
    pair.parent.style.setProperty("forced-color-adjust", context.forcedColorAdjust, "important");
    for (const { name, priority, value } of context.customProperties) {
      const copied = value || "initial";
      pair.first.style.setProperty(name, copied, priority || "important");
      pair.second.style.setProperty(name, copied, priority || "important");
    }
    container.append(pair.parent);
    return pair;
  };
  const cache = new Map<string, string>();
  const resolve: ContextualColorResolver = (value, label) => {
    const color = String(value).trim();
    if (!color) throw new SyntaxError(`${label} must be a valid CSS color`);
    const keyword = wholeCssIdentifier(color)?.value.toLowerCase();
    if (keyword && CSS_WIDE_KEYWORDS.has(keyword)) throw new SyntaxError(`invalid ${label}: ${value}`);
    const cached = cache.get(color);
    if (cached) return cached;
    if (!view.CSS.supports("color", color)) throw new SyntaxError(`invalid ${label}: ${value}`);
    const absolute = absoluteColor(color);
    if (absolute !== null) {
      cache.set(color, absolute);
      return absolute;
    }
    const sharedKey = `${context.signature}\u0000${color}`;
    const shared = state.cache.get(sharedKey);
    if (shared) {
      cache.set(color, shared);
      return shared;
    }
    const active = ensurePair();
    active.first.style.setProperty(properties!.first, color, "important");
    active.second.style.setProperty(properties!.second, color, "important");
    active.first.style.setProperty("background-color", `var(${properties!.first})`, "important");
    active.second.style.setProperty("background-color", `var(${properties!.second})`, "important");
    const firstStyle = view.getComputedStyle(active.first);
    const secondStyle = view.getComputedStyle(active.second);
    const firstToken = firstStyle.getPropertyValue(properties!.first).trim();
    const secondToken = secondStyle.getPropertyValue(properties!.second).trim();
    if (!firstToken || firstToken !== secondToken) throw new SyntaxError(`invalid ${label}: ${value}`);
    const resolved = firstStyle.backgroundColor.trim();
    if (!resolved) throw new SyntaxError(`invalid ${label}: ${value}`);
    cache.set(color, resolved);
    cacheResolvedColor(state, sharedKey, resolved);
    return resolved;
  };
  try {
    return work(resolve);
  } finally {
    const usedPair = pair as ColorProbePair | null;
    if (usedPair) {
      usedPair.parent.remove();
      usedPair.parent.style.removeProperty("color");
      usedPair.parent.style.removeProperty("color-scheme");
      usedPair.parent.style.removeProperty("forced-color-adjust");
      for (const { name } of context.customProperties) {
        usedPair.first.style.removeProperty(name);
        usedPair.second.style.removeProperty(name);
      }
      usedPair.first.style.removeProperty(properties!.first);
      usedPair.second.style.removeProperty(properties!.second);
      usedPair.first.style.removeProperty("background-color");
      usedPair.second.style.removeProperty("background-color");
      state.available.push(usedPair);
    }
  }
}
