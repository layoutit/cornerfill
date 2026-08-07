import {
  isAddressableStylesheetSource,
} from "./stylesheet-elements.mjs";
import type { StylesheetSourceOwner } from "./stylesheet-elements.mjs";

export type AutomaticRoot = Document | ShadowRoot;
export type AutomaticStylesheetOwner = StylesheetSourceOwner;

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
  let serialized: string;
  try {
    serialized = typeof baseUrl === "string"
      ? baseUrl
      : document.defaultView.URL.prototype.toString.call(baseUrl);
  } catch {
    throw new TypeError("replaceStylesheetSource() baseUrl must be a string or URL");
  }
  return new document.defaultView.URL(serialized, document.baseURI).href;
}

export function isAddressableStylesheetOwner(element: Element): element is AutomaticStylesheetOwner {
  return isAddressableStylesheetSource(element);
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
