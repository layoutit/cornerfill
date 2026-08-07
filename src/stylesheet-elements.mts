export type StylesheetSourceOwner = HTMLLinkElement | HTMLStyleElement;

function relContainsStylesheet(value: string | null): boolean {
  return (value ?? "").split(/[\t\n\f\r ]+/u).some((token) => (
    token.toLowerCase() === "stylesheet"
  ));
}

function cssStylesheetType(value: string | null): boolean {
  const type = (value ?? "").trim().toLowerCase();
  return !type || type === "text/css";
}

function cornerfillGeneratedStylesheet(element: Element): boolean {
  return element.hasAttribute("data-cornerfill-auto-styles")
    || element.hasAttribute("data-cornerfill-ownership-styles");
}

function stylesheetSourceElement(
  element: Element,
  rel = element.getAttribute("rel"),
  type = element.getAttribute("type"),
): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || cornerfillGeneratedStylesheet(element)) return false;
  if (!cssStylesheetType(type)) return false;
  if (element instanceof view.HTMLStyleElement) return true;
  return element instanceof view.HTMLLinkElement && relContainsStylesheet(rel);
}

export function isStylesheetSourceElement(element: Element): boolean {
  return stylesheetSourceElement(element);
}

export function isAddressableStylesheetSource(
  element: Element,
): element is StylesheetSourceOwner {
  return stylesheetSourceElement(element)
    && !(element.getAttribute("rel") ?? "").split(/[\t\n\f\r ]+/u).some((token) => (
      token.toLowerCase() === "alternate"
    ));
}

export function nodeContainsStylesheetSource(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : null;
  if (!element) return false;
  if (isStylesheetSourceElement(element)) return true;
  for (const candidate of element.querySelectorAll("style,link[rel]")) {
    if (isStylesheetSourceElement(candidate)) return true;
  }
  return false;
}

export function mutationTouchesStylesheetSource(record: MutationRecord): boolean {
  if (record.type === "characterData") {
    const owner = record.target.parentElement;
    return Boolean(owner && isStylesheetSourceElement(owner));
  }
  if (record.type === "attributes") {
    const target = record.target as Element;
    if (target.localName !== "style" && target.localName !== "link") return false;
    if (isStylesheetSourceElement(target)) return true;
    const previousRel = record.attributeName === "rel"
      ? record.oldValue
      : target.getAttribute("rel");
    const previousType = record.attributeName === "type"
      ? record.oldValue
      : target.getAttribute("type");
    return stylesheetSourceElement(target, previousRel, previousType);
  }
  for (const nodes of [record.addedNodes, record.removedNodes]) {
    for (const node of nodes) {
      if (nodeContainsStylesheetSource(node)) return true;
    }
  }
  return false;
}
