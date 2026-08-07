import { nextDocumentId } from "./identity.mjs";
import {
  cssFunctions,
  cssIdentifierAt,
  cssIdentifiers,
  cssWideKeyword,
  scanCssSyntax,
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
    readonly valid: boolean;
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

interface VariableProbeProperties extends TypedColorProperties {
  readonly firstFallback: string;
  readonly secondFallback: string;
}

interface IndexedColorSource {
  readonly closeByOpen: ReadonlyMap<number, number>;
  readonly commaByOpen: ReadonlyMap<number, number>;
  readonly text: string;
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
const ABSOLUTE_COLOR_FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla"]);
const probeRoots = new WeakMap<Node, ColorProbeRootState>();
const typedColorProperties = new WeakMap<Document, TypedColorProperties>();
const variableProbeProperties = new WeakMap<Document, VariableProbeProperties>();

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

function hostAttributeDependentColor(source: string): boolean {
  return cssFunctions(source).some(({ name }) => name === "attr");
}

function firstColorDependencyFunction(
  source: Readonly<IndexedColorSource>,
  start: number,
  end: number,
): Readonly<{ name: "attr" | "var"; open: number; start: number }> | null {
  let dependency: Readonly<{ name: "attr" | "var"; open: number; start: number }> | null = null;
  let skipThrough = -1;
  scanCssSyntax(source.text, start, (index) => {
    if (index >= end) return false;
    if (index < skipThrough) return;
    const identifier = cssIdentifierAt(source.text, index);
    if (!identifier || identifier.end > end) return;
    skipThrough = identifier.end;
    const name = identifier.value.toLowerCase();
    if ((name !== "attr" && name !== "var") || source.text[identifier.end] !== "(") return;
    dependency = Object.freeze({ name, open: identifier.end, start: identifier.start });
    return false;
  });
  return dependency;
}

function indexColorSource(text: string): Readonly<IndexedColorSource> {
  const closeByOpen = new Map<number, number>();
  const commaByOpen = new Map<number, number>();
  const stack: number[] = [];
  scanCssSyntax(text, 0, (index, character) => {
    if (character === "(") stack.push(index);
    else if (character === ")") {
      const open = stack.pop();
      if (open !== undefined) closeByOpen.set(open, index);
    } else if (character === "," && stack.length > 0) {
      const open = stack[stack.length - 1]!;
      if (!commaByOpen.has(open)) commaByOpen.set(open, index);
    }
  });
  return Object.freeze({
    closeByOpen,
    commaByOpen,
    text,
  });
}

function collectActiveColorDependencies(
  source: string,
  computed: CSSStyleDeclaration,
  customPropertyIsValid: (name: string) => boolean,
  customProperties: Set<string>,
): boolean {
  type DependencyTask = Readonly<
    | { readonly kind: "exit"; readonly name: string }
    | {
      readonly end: number;
      readonly kind: "source";
      readonly source: Readonly<IndexedColorSource>;
      readonly start: number;
    }
  >;
  const active = new Set<string>();
  const indexed = new Map<string, Readonly<IndexedColorSource>>();
  const sourceIndex = (text: string): Readonly<IndexedColorSource> => {
    let value = indexed.get(text);
    if (!value) {
      value = indexColorSource(text);
      indexed.set(text, value);
    }
    return value;
  };
  const initial = sourceIndex(source);
  const pending: DependencyTask[] = [{
    kind: "source",
    source: initial,
    start: 0,
    end: initial.text.length,
  }];
  while (pending.length > 0) {
    const task = pending.pop()!;
    if (task.kind === "exit") {
      active.delete(task.name);
      continue;
    }
    const dependency = firstColorDependencyFunction(task.source, task.start, task.end);
    if (!dependency) continue;
    if (dependency.name === "attr") return true;
    const end = task.source.closeByOpen.get(dependency.open);
    if (end === undefined || end >= task.end) {
      return hostAttributeDependentColor(task.source.text.slice(task.start, task.end));
    }
    const name = cssIdentifierAt(
      task.source.text,
      skipCssTrivia(task.source.text, dependency.open + 1),
    );
    if (!name || name.end > end || !name.value.startsWith("--")) {
      return hostAttributeDependentColor(task.source.text.slice(task.start, task.end));
    }
    customProperties.add(name.value);
    let selectedSource: Readonly<IndexedColorSource>;
    let selectedStart: number;
    let selectedEnd: number;
    if (customPropertyIsValid(name.value)) {
      const selected = computed.getPropertyValue(name.value);
      selectedSource = sourceIndex(selected);
      selectedStart = 0;
      selectedEnd = selected.length;
    } else {
      const comma = task.source.commaByOpen.get(dependency.open);
      selectedSource = task.source;
      selectedStart = comma === undefined ? end : comma + 1;
      selectedEnd = end;
    }
    if (end + 1 < task.end) {
      pending.push({
        kind: "source",
        source: task.source,
        start: end + 1,
        end: task.end,
      });
    }
    if (skipCssTrivia(selectedSource.text, selectedStart) >= selectedEnd) continue;
    if (active.has(name.value)) {
      if (hostAttributeDependentColor(selectedSource.text.slice(selectedStart, selectedEnd))) return true;
      continue;
    }
    active.add(name.value);
    pending.push({ kind: "exit", name: name.value });
    pending.push({
      kind: "source",
      source: selectedSource,
      start: selectedStart,
      end: selectedEnd,
    });
  }
  return false;
}

export function captureElementColorContext(
  element: Element,
  computed: CSSStyleDeclaration,
  values: Iterable<string> = [],
): Readonly<ElementColorContext> {
  const validity = new Map<string, boolean>();
  const customPropertyIsValid = (name: string) => {
    const known = validity.get(name);
    if (known !== undefined) return known;
    const value = computed.getPropertyValue(name);
    const valid = value !== "" || ambiguousCustomPropertyIsValid(element, name);
    validity.set(name, valid);
    return valid;
  };
  const pending = new Set<string>();
  for (const value of values) {
    const source = String(value);
    if (collectActiveColorDependencies(source, computed, customPropertyIsValid, pending)) {
      throw new TypeError("explicit attr() colors require host-attribute resolution");
    }
  }
  const customProperties: Readonly<{
    readonly name: string;
    readonly priority: string;
    readonly valid: boolean;
    readonly value: string;
  }>[] = [];
  for (const name of pending) {
    const value = computed.getPropertyValue(name);
    customProperties.push(Object.freeze({
      name,
      priority: computed.getPropertyPriority(name),
      valid: customPropertyIsValid(name),
      value,
    }));
  }
  const color = computed.color || "canvastext";
  const colorScheme = computed.colorScheme || "normal";
  const forcedColorAdjust = computed.getPropertyValue("forced-color-adjust") || "auto";
  const signature = [
    color,
    colorScheme,
    forcedColorAdjust,
    ...customProperties.flatMap(({ name, valid, value }) => [name, String(valid), value]),
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
  const id = nextDocumentId(document, "color-probe");
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

function registeredVariableProbeProperties(
  view: Window & typeof globalThis,
  document: Document,
): Readonly<VariableProbeProperties> {
  const existing = variableProbeProperties.get(document);
  if (existing) return existing;
  const registerProperty = (view.CSS as RegisterableCss).registerProperty;
  if (typeof registerProperty !== "function") {
    throw new TypeError("contextual CSS colors require CSS.registerProperty()");
  }
  const id = nextDocumentId(document, "variable-probe");
  const properties = Object.freeze({
    first: `--${id}-a`,
    firstFallback: `${id}-missing-a`,
    second: `--${id}-b`,
    secondFallback: `${id}-missing-b`,
  });
  registerProperty.call(view.CSS, {
    name: properties.first,
    syntax: "*",
    inherits: false,
    initialValue: properties.firstFallback,
  });
  registerProperty.call(view.CSS, {
    name: properties.second,
    syntax: "*",
    inherits: false,
    initialValue: properties.secondFallback,
  });
  variableProbeProperties.set(document, properties);
  return properties;
}

function ambiguousCustomPropertyIsValid(element: Element, name: string): boolean {
  const document = element.ownerDocument;
  const view = document.defaultView as (Window & typeof globalThis) | null;
  if (!view || typeof element.animate !== "function") {
    throw new TypeError("empty custom-property colors require Web Animations");
  }
  const properties = registeredVariableProbeProperties(view, document);
  const keyframe: Record<string, string> = {
    [properties.first]: `var(${name}, ${properties.firstFallback})`,
    [properties.second]: `var(${name}, ${properties.secondFallback})`,
  };
  const animation = element.animate([keyframe, keyframe], { duration: 1, fill: "both" });
  try {
    animation.pause();
    animation.currentTime = 0;
    const resolved = view.getComputedStyle(element);
    return resolved.getPropertyValue(properties.first)
      === resolved.getPropertyValue(properties.second);
  } finally {
    animation.cancel();
  }
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
  const functions = cssFunctions(color);
  const outer = functions[0];
  if (!outer || outer.start !== skipCssTrivia(color, 0)
    || !ABSOLUTE_COLOR_FUNCTIONS.has(outer.name)) return null;
  if (functions.some(({ name }) => name === "attr" || name === "env" || name === "var")) return null;
  const identifiers = cssIdentifiers(color).map(({ value }) => value.toLowerCase());
  if (identifiers.includes("currentcolor") || identifiers.includes("from")) return null;
  return color;
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
    for (const { name, priority, valid, value } of context.customProperties) {
      const copied = valid ? (value || " ") : "initial";
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
    if (cssWideKeyword(color)) throw new SyntaxError(`invalid ${label}: ${value}`);
    if (hostAttributeDependentColor(color)
      && !cssFunctions(color).some(({ name }) => name === "var")) {
      throw new TypeError("explicit attr() colors require host-attribute resolution");
    }
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
