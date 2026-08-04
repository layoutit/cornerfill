export const COLOR_PROBE_ATTRIBUTE = "data-cornerfill-color-probe";

export type ContextualColorResolver = (value: string, label: string) => string;

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

export function withElementColorResolver<T>(
  view: Window & typeof globalThis,
  element: Element,
  computed: CSSStyleDeclaration,
  work: (resolve: ContextualColorResolver) => T,
): T {
  const document = element.ownerDocument;
  const parent = document.createElement("span");
  const probe = document.createElement("span");
  const probeRoot = parent.attachShadow({ mode: "closed" });
  parent.setAttribute(COLOR_PROBE_ATTRIBUTE, "");
  probe.setAttribute(COLOR_PROBE_ATTRIBUTE, "");
  parent.style.setProperty("position", "fixed", "important");
  parent.style.setProperty("width", "0", "important");
  parent.style.setProperty("height", "0", "important");
  parent.style.setProperty("contain", "strict", "important");
  parent.style.setProperty("visibility", "hidden", "important");
  parent.style.setProperty("pointer-events", "none", "important");
  parent.style.setProperty("color", computed.color || "canvastext", "important");
  parent.style.setProperty("color-scheme", computed.colorScheme || "normal", "important");
  parent.style.setProperty(
    "forced-color-adjust",
    computed.getPropertyValue("forced-color-adjust") || "auto",
    "important",
  );
  probe.style.setProperty("color-scheme", "inherit", "important");
  probe.style.setProperty("forced-color-adjust", "inherit", "important");
  probeRoot.append(probe);
  const root = element.getRootNode();
  const container = root instanceof view.ShadowRoot ? root : document.documentElement;
  container.append(parent);
  const cache = new Map<string, string>();
  const resolve: ContextualColorResolver = (value, label) => {
    const color = String(value).trim();
    if (!color) throw new SyntaxError(`${label} must be a valid CSS color`);
    const cached = cache.get(color);
    if (cached) return cached;
    if (!view.CSS.supports("color", color)) {
      throw new SyntaxError(`invalid ${label}: ${value}`);
    }
    probe.style.removeProperty("color");
    probe.style.setProperty("color", color, "important");
    if (!probe.style.getPropertyValue("color")) {
      throw new SyntaxError(`invalid ${label}: ${value}`);
    }
    const resolved = view.getComputedStyle(probe).color.trim();
    if (!resolved || /^currentcolor$/iu.test(resolved)) {
      throw new SyntaxError(`invalid ${label}: ${value}`);
    }
    cache.set(color, resolved);
    return resolved;
  };
  try {
    return work(resolve);
  } finally {
    parent.remove();
  }
}
