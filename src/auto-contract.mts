export type AutomaticRoot = Document | ShadowRoot;
export type AutomaticStylesheetOwner = HTMLLinkElement | HTMLStyleElement;

export interface RegisterRootOptions {
  readonly adoptedStyleSheets?: boolean | undefined;
  readonly autoObserve?: boolean | undefined;
  readonly nonce?: string | null | undefined;
  readonly onError?: ((error: unknown, context: string) => void) | undefined;
}

export interface ReplaceStylesheetSourceOptions {
  readonly baseUrl?: string | URL | undefined;
}

export interface RefreshOptions {
  readonly retryFailed?: boolean | undefined;
}

type RuntimeDocument = Document & Readonly<{
  defaultView: Window & typeof globalThis;
}>;

export function snapshotRegisterRootOptions(
  options: Readonly<RegisterRootOptions> = {},
): Readonly<RegisterRootOptions> {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("registerRoot() options must be an object");
  }
  const { adoptedStyleSheets, autoObserve, nonce, onError } = options;
  if (adoptedStyleSheets !== undefined && typeof adoptedStyleSheets !== "boolean") {
    throw new TypeError("adoptedStyleSheets must be a boolean");
  }
  if (autoObserve !== undefined && typeof autoObserve !== "boolean") {
    throw new TypeError("autoObserve must be a boolean");
  }
  if (nonce !== undefined && nonce !== null && typeof nonce !== "string") {
    throw new TypeError("nonce must be a string or null");
  }
  if (onError !== undefined && typeof onError !== "function") {
    throw new TypeError("onError must be a function");
  }
  return Object.freeze({
    ...(adoptedStyleSheets === undefined ? {} : { adoptedStyleSheets }),
    ...(autoObserve === undefined ? {} : { autoObserve }),
    ...(nonce === undefined ? {} : { nonce }),
    ...(onError === undefined ? {} : { onError }),
  });
}

export function snapshotRefreshOptions(
  options: Readonly<RefreshOptions> = {},
): Readonly<RefreshOptions> {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("refresh() options must be an object");
  }
  const retryFailed = options.retryFailed;
  if (retryFailed !== undefined && typeof retryFailed !== "boolean") {
    throw new TypeError("retryFailed must be a boolean");
  }
  return Object.freeze(retryFailed === undefined ? {} : { retryFailed });
}

export function replacementStylesheetBaseUrl(
  owner: AutomaticStylesheetOwner | null,
  document: RuntimeDocument,
  options: Readonly<ReplaceStylesheetSourceOptions> = {},
): string | undefined {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("replaceStylesheetSource() options must be an object");
  }
  const baseUrl = options.baseUrl;
  if (baseUrl === undefined) return undefined;
  if (!(owner instanceof document.defaultView.HTMLLinkElement)) {
    throw new TypeError("replaceStylesheetSource() baseUrl is available only for linked stylesheets");
  }
  if (typeof baseUrl !== "string" && !(baseUrl instanceof document.defaultView.URL)) {
    throw new TypeError("replaceStylesheetSource() baseUrl must be a string or URL");
  }
  return new URL(baseUrl, document.baseURI).href;
}

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

export function isAddressableStylesheetOwner(element: Element): element is AutomaticStylesheetOwner {
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

export function validateAdoptedStylesheetSource(
  root: AutomaticRoot,
  sheet: CSSStyleSheet,
  source: unknown,
  includeAdoptedStyleSheets: boolean,
): void {
  if (!includeAdoptedStyleSheets) {
    throw new TypeError("This automatic scope did not opt in to adopted stylesheets");
  }
  if (!root.adoptedStyleSheets.includes(sheet)) {
    throw new TypeError("The stylesheet is not adopted by this automatic scope");
  }
  if (typeof source !== "string") {
    throw new TypeError("refreshAdoptedStyleSheet() requires the exact standard CSS source");
  }
}

export function validateStylesheetSourceReplacement(
  root: AutomaticRoot,
  document: RuntimeDocument,
  stylesheet: unknown,
  source: unknown,
  includeAdoptedStyleSheets: boolean,
): Readonly<{
  adopted: boolean;
  owner: AutomaticStylesheetOwner | null;
  sheet: CSSStyleSheet | null;
}> {
  if (typeof source !== "string") {
    throw new TypeError("replaceStylesheetSource() requires the exact standard CSS source");
  }
  if (stylesheet instanceof document.defaultView.CSSStyleSheet) {
    if (root.adoptedStyleSheets.includes(stylesheet)) {
      validateAdoptedStylesheetSource(root, stylesheet, source, includeAdoptedStyleSheets);
      return Object.freeze({ adopted: true, owner: null, sheet: stylesheet });
    }
    let owner: AutomaticStylesheetOwner | null = null;
    for (const candidate of root.querySelectorAll("style,link[rel]")) {
      if (isAddressableStylesheetOwner(candidate) && candidate.sheet === stylesheet) {
        owner = candidate;
        break;
      }
    }
    if (!owner) throw new TypeError("The stylesheet does not belong to this automatic scope");
    return Object.freeze({ adopted: false, owner, sheet: stylesheet });
  }
  if (!(stylesheet instanceof document.defaultView.HTMLStyleElement)
    && !(stylesheet instanceof document.defaultView.HTMLLinkElement)) {
    throw new TypeError("replaceStylesheetSource() requires a style, link, or CSSStyleSheet");
  }
  if (stylesheet.ownerDocument !== document || stylesheet.getRootNode() !== root) {
    throw new TypeError("The stylesheet owner does not belong to this automatic scope");
  }
  if (!isAddressableStylesheetOwner(stylesheet)) {
    throw new TypeError("The stylesheet owner is not an automatic stylesheet source");
  }
  return Object.freeze({ adopted: false, owner: stylesheet, sheet: stylesheet.sheet });
}

export function validateShadowRootRegistration(
  document: RuntimeDocument,
  parentRoot: AutomaticRoot,
  parentAutoObserve: boolean,
  root: unknown,
  requestedAutoObserve: boolean | undefined,
): asserts root is ShadowRoot {
  const ShadowRoot = document.defaultView.ShadowRoot;
  if (!(root instanceof ShadowRoot) || root.ownerDocument !== document) {
    throw new TypeError("Cornerfill automatic scopes require an open ShadowRoot in the same document");
  }
  if (root.host.shadowRoot !== root) {
    throw new TypeError("Cornerfill automatic scopes cannot register a closed ShadowRoot");
  }
  const containingRoot = root.host.getRootNode();
  if ((parentRoot === document && containingRoot instanceof ShadowRoot)
    || (parentRoot !== document && containingRoot !== parentRoot)) {
    throw new TypeError("A shadow-root scope can register only a directly nested open ShadowRoot");
  }
  if (requestedAutoObserve === true && !parentAutoObserve) {
    throw new TypeError("An observing shadow-root scope requires an observing parent automatic scope");
  }
}
