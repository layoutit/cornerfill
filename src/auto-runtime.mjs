import { installCornerfill } from "./runtime.mjs";

const SHAPE_PROPERTIES = Object.freeze({
  "corner-shape": "--cornerfill-corner-shape",
  "corner-top-left-shape": "--cornerfill-corner-top-left-shape",
  "corner-top-right-shape": "--cornerfill-corner-top-right-shape",
  "corner-bottom-right-shape": "--cornerfill-corner-bottom-right-shape",
  "corner-bottom-left-shape": "--cornerfill-corner-bottom-left-shape",
  "corner-start-start-shape": "--cornerfill-corner-start-start-shape",
  "corner-start-end-shape": "--cornerfill-corner-start-end-shape",
  "corner-end-end-shape": "--cornerfill-corner-end-end-shape",
  "corner-end-start-shape": "--cornerfill-corner-end-start-shape",
});

const SHAPE_CARRIERS = Object.freeze(Object.values(SHAPE_PROPERTIES));
const AUTO_STYLESHEET_ATTRIBUTE = "data-cornerfill-auto-styles";

function isCssWhitespaceOrComments(value) {
  return value.replaceAll(/\/\*[\s\S]*?\*\//gu, "").trim() === "";
}

/**
 * Rename authored corner-shape declarations to durable custom properties.
 * Strings, comments, selectors, @supports conditions, and declaration values
 * are left untouched. The browser still performs the actual CSS parse.
 */
export function transportCornerShapeDeclarations(source) {
  if (typeof source !== "string") throw new TypeError("CSS source must be a string");
  const replacements = [];
  let statementStart = 0;
  let quote = null;
  let comment = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ":") {
      const statement = source.slice(statementStart, index);
      const match = /([\w-]+)\s*$/u.exec(statement);
      if (match && isCssWhitespaceOrComments(statement.slice(0, match.index))) {
        const property = match[1].toLowerCase();
        const carrier = SHAPE_PROPERTIES[property];
        if (carrier) {
          replacements.push(Object.freeze({
            start: statementStart + match.index,
            end: statementStart + match.index + match[1].length,
            value: carrier,
          }));
        }
      }
      continue;
    }
    if (character === ";" || character === "{" || character === "}") statementStart = index + 1;
  }

  if (replacements.length === 0) return source;
  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += source.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }
  return output + source.slice(cursor);
}

function carrierDeclarations(style) {
  let output = "";
  for (const property of SHAPE_CARRIERS) {
    const value = style?.getPropertyValue?.(property)?.trim();
    if (!value) continue;
    const priority = style.getPropertyPriority(property);
    output += `${property}:${value}${priority ? " !important" : ""};`;
  }
  return output;
}

function ruleHeader(rule) {
  const index = rule.cssText.indexOf("{");
  return index < 0 ? "" : rule.cssText.slice(0, index).trim();
}

function serializeCarrierRules(rules, selectors) {
  let output = "";
  for (const rule of rules) {
    const header = ruleHeader(rule);
    if (/^@(?:-webkit-)?keyframes\b/iu.test(header)) continue;
    const declarations = carrierDeclarations(rule.style);
    const nested = rule.cssRules ? serializeCarrierRules(rule.cssRules, selectors) : "";
    if (typeof rule.selectorText === "string") {
      if (!declarations && !nested) continue;
      if (declarations) selectors.add(rule.selectorText);
      output += `${rule.selectorText}{${declarations}${nested}}`;
      continue;
    }
    if (typeof rule.keyText === "string") {
      if (declarations) output += `${rule.keyText}{${declarations}}`;
      continue;
    }
    if (nested) {
      if (header) output += `${header}{${nested}}`;
    }
  }
  return output;
}

function parseCarrierSheet(document, source) {
  const transformed = transportCornerShapeDeclarations(source);
  if (!SHAPE_CARRIERS.some((property) => transformed.includes(property))) {
    return Object.freeze({ css: "", selectors: Object.freeze([]) });
  }
  let sheet;
  let parserStyle = null;
  try {
    sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync(transformed);
  } catch {
    parserStyle = document.createElement("style");
    parserStyle.media = "not all";
    parserStyle.textContent = transformed;
    (document.head ?? document.documentElement).append(parserStyle);
    sheet = parserStyle.sheet;
  }
  try {
    const selectors = new Set();
    const css = serializeCarrierRules(sheet?.cssRules ?? [], selectors);
    return Object.freeze({ css, selectors: Object.freeze([...selectors]) });
  } finally {
    parserStyle?.remove();
  }
}

function hasShapeCarrier(computed) {
  return SHAPE_CARRIERS.some((property) => computed.getPropertyValue(property).trim());
}

function stylesheetElements(root) {
  return [...root.querySelectorAll(`style:not([${AUTO_STYLESHEET_ATTRIBUTE}]),link[rel~="stylesheet"]`)];
}

function inlineElements(root) {
  const elements = [...root.querySelectorAll("[style]")];
  if (root.nodeType === 1 && root.hasAttribute("style")) elements.unshift(root);
  return elements;
}

function stylesheetMedia(owner) {
  return owner.getAttribute("media") ?? "";
}

function stylesheetKey(owner) {
  return owner.localName === "style"
    ? `style\n${stylesheetMedia(owner)}\n${owner.textContent ?? ""}`
    : `link\n${stylesheetMedia(owner)}\n${owner.href}`;
}

function runtimeOptions(options, document) {
  const {
    root: _root,
    controller: _controller,
    autoObserve: _autoObserve,
    onError: _onError,
    ...runtime
  } = options;
  return { ...runtime, document };
}

class CornerfillAutoController {
  constructor(options = {}) {
    this.document = options.document ?? options.root?.ownerDocument ?? globalThis.document;
    if (!this.document?.defaultView) throw new TypeError("installCornerfillAuto() requires a browser document");
    this.root = options.root ?? this.document;
    this.controller = options.controller ?? installCornerfill(runtimeOptions(options, this.document));
    this.ownsController = options.controller === undefined;
    this.autoObserve = options.autoObserve ?? options.observe !== false;
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.stylesheets = new Map();
    this.inline = new Map();
    this.handles = new Map();
    this.errors = [];
    this.observer = null;
    this.destroyed = false;
    this.refreshQueued = false;
    this.refreshPromise = Promise.resolve();
    this.native = this.controller.capabilities.native.qualified
      && this.controller.options.forceFallback !== true;
    this.ready = this._start();
  }

  _recordError(error, context) {
    const record = Object.freeze({
      context,
      message: error instanceof Error ? error.message : String(error),
    });
    this.errors.push(record);
    this.onError?.(error, context);
  }

  async _source(owner) {
    if (owner.localName === "style") return owner.textContent ?? "";
    const url = new URL(owner.href, this.document.baseURI);
    const response = await this.document.defaultView.fetch(url.href, {
      credentials: url.origin === new URL(this.document.baseURI).origin ? "same-origin" : "omit",
      mode: "cors",
    });
    if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}: ${url.href}`);
    return response.text();
  }

  async _processStylesheet(owner) {
    if (!owner.isConnected || owner.disabled) {
      this.stylesheets.get(owner)?.companion?.remove();
      this.stylesheets.delete(owner);
      return;
    }
    const key = stylesheetKey(owner);
    const existing = this.stylesheets.get(owner);
    if (existing?.key === key) return;
    let source;
    try {
      source = await this._source(owner);
    } catch (error) {
      this._recordError(error, owner.href || "inline stylesheet");
      this.stylesheets.set(owner, Object.freeze({
        owner,
        companion: null,
        key,
        media: stylesheetMedia(owner),
        selectors: Object.freeze([]),
      }));
      return;
    }
    if (this.destroyed || !owner.isConnected) return;
    let compiled;
    try {
      compiled = parseCarrierSheet(this.document, source);
    } catch (error) {
      this._recordError(error, owner.href || "inline stylesheet");
      return;
    }
    const companion = existing?.companion ?? this.document.createElement("style");
    companion.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "");
    const nonce = owner.getAttribute("nonce");
    if (nonce) companion.setAttribute("nonce", nonce);
    else companion.removeAttribute("nonce");
    companion.media = stylesheetMedia(owner);
    companion.textContent = compiled.css;
    if (!companion.isConnected) owner.after(companion);
    this.stylesheets.set(owner, Object.freeze({
      owner,
      companion,
      key,
      media: stylesheetMedia(owner),
      selectors: compiled.selectors,
    }));
  }

  _processInline(element) {
    if (!(element instanceof this.document.defaultView.HTMLElement)) return;
    if (this.inline.has(element)) return;
    const originalAttribute = element.getAttribute("style");
    if (!originalAttribute || !/corner(?:-[\w-]+)?-shape\s*:/iu.test(originalAttribute)) return;
    const transformed = transportCornerShapeDeclarations(originalAttribute);
    const scratch = this.document.createElement("div");
    scratch.setAttribute("style", transformed);
    const declarations = SHAPE_CARRIERS.map((property) => Object.freeze({
      property,
      value: scratch.style.getPropertyValue(property),
      priority: scratch.style.getPropertyPriority(property),
      previousValue: element.style.getPropertyValue(property),
      previousPriority: element.style.getPropertyPriority(property),
    })).filter(({ value }) => value);
    if (declarations.length === 0) return;
    for (const declaration of declarations) {
      element.style.setProperty(declaration.property, declaration.value, declaration.priority);
    }
    this.inline.set(element, Object.freeze({
      originalAttribute,
      generatedAttribute: element.getAttribute("style"),
      declarations,
    }));
  }

  async _discoverSources() {
    for (const [element] of this.inline) {
      if (!element.isConnected) this.inline.delete(element);
    }
    for (const element of inlineElements(this.root)) this._processInline(element);
    const owners = stylesheetElements(this.root);
    const activeOwners = new Set(owners);
    for (const [owner, record] of this.stylesheets) {
      if (activeOwners.has(owner)) continue;
      record.companion?.remove();
      this.stylesheets.delete(owner);
    }
    await Promise.all(owners.map((owner) => this._processStylesheet(owner)));
  }

  _selectorCandidates() {
    const candidates = new Set(this.inline.keys());
    for (const record of this.stylesheets.values()) {
      for (const selector of record.selectors) {
        try {
          for (const element of this.root.querySelectorAll(selector)) candidates.add(element);
        } catch (error) {
          this._recordError(error, `selector ${selector}`);
        }
      }
    }
    return candidates;
  }

  async _syncAttachments() {
    if (this.native || this.destroyed) return;
    const candidates = this._selectorCandidates();
    const ready = [];
    for (const [element, handle] of [...this.handles]) {
      if (candidates.has(element) && element.isConnected && hasShapeCarrier(this.document.defaultView.getComputedStyle(element))) {
        continue;
      }
      handle.dispose();
      this.handles.delete(element);
    }
    for (const element of candidates) {
      if (!(element instanceof this.document.defaultView.HTMLElement)
        || !element.isConnected || this.handles.has(element)) continue;
      if (!hasShapeCarrier(this.document.defaultView.getComputedStyle(element))) continue;
      try {
        const handle = this.controller.attach(element);
        this.handles.set(element, handle);
        ready.push(handle.ready.catch((error) => {
          this._recordError(error, element.id ? `#${element.id}` : element.localName);
          handle.dispose();
          this.handles.delete(element);
        }));
      } catch (error) {
        this._recordError(error, element.id ? `#${element.id}` : element.localName);
      }
    }
    await Promise.all(ready);
  }

  _installObserver() {
    if (!this.autoObserve || this.observer || !this.document.defaultView.MutationObserver) return;
    const target = this.root === this.document ? this.document.documentElement : this.root;
    this.observer = new this.document.defaultView.MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === "attributes") return true;
        if (record.type === "characterData") return record.target.parentElement?.localName === "style";
        if (record.target.localName === "style") return true;
        return [...record.addedNodes, ...record.removedNodes].some((node) => (
          node.nodeType === this.document.defaultView.Node.ELEMENT_NODE
        ));
      });
      if (!relevant) return;
      this._queueRefresh();
    });
    this.observer.observe(target, {
      attributes: true,
      attributeFilter: ["class", "href", "media", "rel", "disabled"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  async _start() {
    if (this.document.readyState === "loading") {
      await new Promise((resolve) => this.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }
    if (this.destroyed || this.native) return this.explain();
    await this._discoverSources();
    await this._syncAttachments();
    this._installObserver();
    return this.explain();
  }

  _queueRefresh() {
    if (this.refreshQueued || this.destroyed || this.native) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refreshPromise = this.refresh().catch((error) => this._recordError(error, "automatic refresh"));
    });
  }

  async refresh() {
    if (this.destroyed) throw new Error("Cornerfill auto controller is destroyed");
    if (this.native) return this.explain();
    await this._discoverSources();
    await this._syncAttachments();
    return this.explain();
  }

  explain(element = null) {
    if (element) return this.handles.get(element)?.explain() ?? this.controller.explain(element);
    return Object.freeze({
      schema: "cornerfill-auto@1",
      mode: this.native ? "native" : "fallback",
      attached: this.handles.size,
      stylesheets: this.stylesheets.size,
      inlineElements: this.inline.size,
      errors: Object.freeze([...this.errors]),
      runtime: this.controller.stats(),
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;
    for (const handle of this.handles.values()) handle.dispose();
    this.handles.clear();
    for (const { companion } of this.stylesheets.values()) companion?.remove();
    this.stylesheets.clear();
    for (const [element, record] of this.inline) {
      if (element.getAttribute("style") === record.generatedAttribute) {
        element.setAttribute("style", record.originalAttribute);
        continue;
      }
      for (const declaration of record.declarations) {
        element.style.removeProperty(declaration.property);
        if (declaration.previousValue) {
          element.style.setProperty(
            declaration.property,
            declaration.previousValue,
            declaration.previousPriority,
          );
        }
      }
    }
    this.inline.clear();
    if (this.ownsController) this.controller.destroy();
  }
}

export function installCornerfillAuto(options = {}) {
  return new CornerfillAutoController(options);
}
