import { installCornerfill } from "./runtime.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./native.mjs";
import {
  parseCornerShape,
  parseCornerShapeValue,
  serializeShapeParameter,
} from "./values.mjs";

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
const SHAPE_PROPERTY_BY_CARRIER = Object.freeze(Object.fromEntries(
  Object.entries(SHAPE_PROPERTIES).map(([property, carrier]) => [carrier, property]),
));
const AUTO_STYLESHEET_ATTRIBUTE = "data-cornerfill-auto-styles";
const AUTO_UNSET = "__cornerfill_unset__";
const AUTO_PHYSICAL_SHAPE = "--cornerfill-auto-physical-shape";
const AUTO_LOGICAL_SHAPE = "--cornerfill-auto-logical-shape";
const AUTO_UNSUPPORTED_SHAPE = "--cornerfill-auto-unsupported-shape";
const AUTO_PHYSICAL_RADIUS = "--cornerfill-auto-physical-radius";
const AUTO_LOGICAL_RADIUS = "--cornerfill-auto-logical-radius";
const AUTO_UNSUPPORTED_OWNED = "--cornerfill-auto-unsupported-owned";
const CARRIER_REGISTRATIONS = new WeakMap();

const PHYSICAL_SHAPE_PROPERTIES = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);

const LOGICAL_SHAPE_PROPERTIES = Object.freeze([
  "corner-start-start-shape",
  "corner-start-end-shape",
  "corner-end-end-shape",
  "corner-end-start-shape",
]);

const OWNED_PROPERTY_CARRIERS = Object.freeze([
  ["border-top-left-radius", "--cornerfill-border-top-left-radius", "radius-physical"],
  ["border-top-right-radius", "--cornerfill-border-top-right-radius", "radius-physical"],
  ["border-bottom-right-radius", "--cornerfill-border-bottom-right-radius", "radius-physical"],
  ["border-bottom-left-radius", "--cornerfill-border-bottom-left-radius", "radius-physical"],
  ["border-start-start-radius", "--cornerfill-border-start-start-radius", "radius-logical"],
  ["border-start-end-radius", "--cornerfill-border-start-end-radius", "radius-logical"],
  ["border-end-end-radius", "--cornerfill-border-end-end-radius", "radius-logical"],
  ["border-end-start-radius", "--cornerfill-border-end-start-radius", "radius-logical"],
  ["background-color", "--cornerfill-background-color"],
  ["background-image", "--cornerfill-background-image", "url"],
  ["background-size", "--cornerfill-background-size"],
  ["background-position", "--cornerfill-background-position"],
  ["background-repeat", "--cornerfill-background-repeat"],
  ["background-origin", "--cornerfill-background-origin"],
  ["background-clip", "--cornerfill-background-clip"],
  ["background-blend-mode", "--cornerfill-background-blend-mode"],
  ["background-attachment", "--cornerfill-background-attachment"],
  ["image-rendering", "--cornerfill-image-rendering"],
  ["border-top-color", "--cornerfill-border-top-color"],
  ["border-right-color", "--cornerfill-border-right-color"],
  ["border-bottom-color", "--cornerfill-border-bottom-color"],
  ["border-left-color", "--cornerfill-border-left-color"],
  ["box-shadow", "--cornerfill-box-shadow"],
  ["outline-width", "--cornerfill-outline-width"],
  ["outline-style", "--cornerfill-outline-style"],
  ["outline-color", "--cornerfill-outline-color"],
  ["outline-offset", "--cornerfill-outline-offset"],
]);

const OWNED_CARRIERS = Object.freeze(OWNED_PROPERTY_CARRIERS.map(([, carrier]) => carrier));
const AUTO_CARRIERS = Object.freeze([
  ...new Set([
    ...SHAPE_CARRIERS,
    ...OWNED_CARRIERS,
    AUTO_PHYSICAL_SHAPE,
    AUTO_LOGICAL_SHAPE,
    AUTO_UNSUPPORTED_SHAPE,
    AUTO_PHYSICAL_RADIUS,
    AUTO_LOGICAL_RADIUS,
    AUTO_UNSUPPORTED_OWNED,
  ]),
]);

const SHAPE_MARKERS = Object.freeze([
  AUTO_PHYSICAL_SHAPE,
  AUTO_LOGICAL_SHAPE,
  AUTO_UNSUPPORTED_SHAPE,
]);

const AUTOMATIC_DISCOVERY = Object.freeze({
  readableStyleElements: true,
  sameOriginAndCorsStylesheetLinks: true,
  inlineStyleAttributes: true,
  selectorAndConditionalCascade: true,
  cssomInsertDeleteAfterInstallation: true,
  limitations: Object.freeze([
    "cross-origin stylesheets without CORS",
    "unregistered or closed shadow roots",
    "adopted stylesheets unless explicitly enabled for a registered open shadow root",
    "adopted stylesheet corner-shape source unless supplied to refreshAdoptedStyleSheet()",
    "mixed physical/logical declaration families",
    "corner-shape or paint changes driven by CSS keyframes",
    "alternate stylesheet sets",
    "corner-shape rules inserted through CSSOM before Cornerfill starts",
    "unsupported declarations assigned through CSSStyleDeclaration, which the browser discards",
  ]),
});

const SOURCE_ATTRIBUTE_NAMES = Object.freeze([
  "crossorigin",
  "disabled",
  "href",
  "integrity",
  "media",
  "nonce",
  "referrerpolicy",
  "rel",
  "style",
  "title",
  "type",
]);

const CONSERVATIVE_STATE_EVENTS = Object.freeze([
  "change",
  "focusin",
  "focusout",
  "hashchange",
  "input",
  "pointercancel",
  "pointerdown",
  "pointerout",
  "pointerover",
  "pointerup",
  "popstate",
  "toggle",
]);

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

function declarationEnd(source, start) {
  let quote = null;
  let comment = false;
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;
  for (let index = start; index < source.length; index += 1) {
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
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (parentheses === 0 && brackets === 0 && (character === ";" || character === "}")) return index;
  }
  return source.length;
}

function declarationValue(raw) {
  const normalized = raw.replaceAll(/\/\*[\s\S]*?\*\//gu, " ").trim();
  const important = /!\s*important\s*$/iu.test(normalized);
  return Object.freeze({
    value: normalized.replace(/!\s*important\s*$/iu, "").trim(),
    priority: important ? " !important" : "",
  });
}

function shapeCarrierDeclaration(property, rawValue) {
  const { value, priority } = declarationValue(rawValue);
  try {
    if (/\bvar\s*\(/iu.test(value)) {
      const carrier = SHAPE_PROPERTIES[property];
      const marker = property === "corner-shape" || PHYSICAL_SHAPE_PROPERTIES.includes(property)
        ? AUTO_PHYSICAL_SHAPE
        : AUTO_LOGICAL_SHAPE;
      return `${carrier}:${value}${priority};${marker}:1${priority};`;
    }
    if (property === "corner-shape") {
      const values = parseCornerShape(value);
      return `${PHYSICAL_SHAPE_PROPERTIES.map((longhand, index) => (
        `${SHAPE_PROPERTIES[longhand]}:${serializeShapeParameter(values[index])}${priority};`
      )).join("")}${AUTO_PHYSICAL_SHAPE}:1${priority};`;
    }
    const carrier = SHAPE_PROPERTIES[property];
    if (!carrier) return null;
    const parsed = serializeShapeParameter(parseCornerShapeValue(value));
    const marker = LOGICAL_SHAPE_PROPERTIES.includes(property)
      ? AUTO_LOGICAL_SHAPE
      : AUTO_PHYSICAL_SHAPE;
    return `${carrier}:${parsed}${priority};${marker}:1${priority};`;
  } catch {
    return `${AUTO_UNSUPPORTED_SHAPE}:1${priority};`;
  }
}

function canonicalizeCornerShapeDeclarations(source, authoredDeclarations = null) {
  const replacements = [];
  let statementStart = 0;
  let quote = null;
  let comment = false;
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;

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
    if (character === "(") {
      parentheses += 1;
      continue;
    }
    if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      continue;
    }
    if (character === "[") {
      brackets += 1;
      continue;
    }
    if (character === "]") {
      brackets = Math.max(0, brackets - 1);
      continue;
    }
    if (parentheses !== 0 || brackets !== 0) continue;
    if (character === ":") {
      const statement = source.slice(statementStart, index);
      const match = /([\w-]+)\s*$/u.exec(statement);
      if (!match || !isCssWhitespaceOrComments(statement.slice(0, match.index))) continue;
      const property = match[1].toLowerCase();
      if (!Object.hasOwn(SHAPE_PROPERTIES, property)) continue;
      const end = declarationEnd(source, index + 1);
      const start = statementStart + match.index;
      authoredDeclarations?.push(source.slice(start, end).trim());
      replacements.push(Object.freeze({
        start,
        end,
        value: shapeCarrierDeclaration(property, source.slice(index + 1, end)),
      }));
      index = Math.max(index, end - 1);
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

function cssString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function resolveCssUrls(value, baseUrl) {
  return String(value).replaceAll(
    /url\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s)'"\\]+))\s*\)/giu,
    (source, doubleQuoted, singleQuoted, unquoted) => {
      const raw = (doubleQuoted ?? singleQuoted ?? unquoted ?? "").replaceAll(/\\([()'"\\])/gu, "$1");
      try {
        return `url(${cssString(new URL(raw, baseUrl).href)})`;
      } catch {
        return source;
      }
    },
  );
}

function serializedDeclaration(style, property, value, outputProperty = property) {
  const priority = style.getPropertyPriority(property);
  return `${outputProperty}:${value}${priority ? " !important" : ""};`;
}

function carrierDeclarations(style, baseUrl) {
  if (!style?.getPropertyValue) return Object.freeze({ css: "", shape: false });
  let css = "";
  let shape = false;
  let physicalRadius = false;
  let logicalRadius = false;
  for (const property of [...SHAPE_CARRIERS, ...SHAPE_MARKERS]) {
    const value = style.getPropertyValue(property).trim();
    if (!value) continue;
    css += serializedDeclaration(style, property, value);
    shape = true;
  }
  for (const [property, carrier, kind] of OWNED_PROPERTY_CARRIERS) {
    let value = style.getPropertyValue(property).trim();
    if (!value) continue;
    if (/^(?:inherit|revert|revert-layer)$/iu.test(value)) {
      css += `${AUTO_UNSUPPORTED_OWNED}:1${style.getPropertyPriority(property) ? " !important" : ""};`;
      continue;
    }
    if (kind === "url") value = resolveCssUrls(value, baseUrl);
    css += serializedDeclaration(style, property, value, carrier);
    if (kind === "radius-physical") physicalRadius = true;
    else if (kind === "radius-logical") logicalRadius = true;
  }
  if (physicalRadius) css += `${AUTO_PHYSICAL_RADIUS}:1;`;
  if (logicalRadius) css += `${AUTO_LOGICAL_RADIUS}:1;`;
  return Object.freeze({ css, shape });
}

function diagnosticShapeDeclarations(style) {
  const declarations = [];
  for (const carrier of SHAPE_CARRIERS) {
    const value = style.getPropertyValue(carrier).trim();
    if (!value) continue;
    const property = SHAPE_PROPERTY_BY_CARRIER[carrier];
    const priority = style.getPropertyPriority(carrier);
    declarations.push(`${property}: ${value}${priority ? " !important" : ""}`);
  }
  if (declarations.length === 0 && style.getPropertyValue(AUTO_UNSUPPORTED_SHAPE).trim()) {
    declarations.push("corner-shape: <unsupported value>");
  }
  return Object.freeze(declarations);
}

function ruleHeader(rule) {
  const index = rule.cssText.indexOf("{");
  return index < 0 ? "" : rule.cssText.slice(0, index).trim();
}

function matchingParenthesis(value, start) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function supportsShapeValue(property, value) {
  if (/^(?:inherit|initial|revert|revert-layer|unset)$/iu.test(value)
    || /\bvar\s*\(/iu.test(value)) return true;
  try {
    if (property === "corner-shape") parseCornerShape(value);
    else parseCornerShapeValue(value);
    return true;
  } catch {
    return false;
  }
}

function carrierSupportsHeader(header) {
  if (!/^@supports\b/iu.test(header) || !/\bcorner-[\w-]*shape\b/iu.test(header)) return header;
  const replacements = [];
  let recognized = 0;
  for (let start = header.indexOf("("); start >= 0; start = header.indexOf("(", start + 1)) {
    const end = matchingParenthesis(header, start);
    if (end < 0) break;
    const inner = header.slice(start + 1, end);
    const declaration = /^\s*(corner-(?:top-left|top-right|bottom-right|bottom-left|start-start|start-end|end-end|end-start)-shape|corner-shape)\s*:\s*([\s\S]+?)\s*$/iu.exec(inner);
    if (!declaration) continue;
    const property = declaration[1].toLowerCase();
    const value = declaration[2];
    const supported = supportsShapeValue(property, value);
    replacements.push(Object.freeze({
      start: start + 1,
      end,
      value: supported
        ? `--cornerfill-supports-${property}:${value}`
        : "display:__cornerfill_invalid__",
    }));
    recognized += 1;
    start = end;
  }
  const occurrences = header.match(/\bcorner-(?:[\w-]*-)?shape\b/giu)?.length ?? 0;
  if (recognized !== occurrences) {
    throw new SyntaxError(`Automatic CSS cannot preserve complex corner-shape support condition: ${header}`);
  }
  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += header.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }
  return output + header.slice(cursor);
}

function serializeCarrierRules(
  rules,
  selectors,
  baseUrl,
  selectorRecords,
  sourceIdentity,
  mediaQueries,
) {
  let output = "";
  for (const rule of rules) {
    const header = ruleHeader(rule);
    if (/^@(?:-webkit-)?keyframes\b/iu.test(header)) continue;
    const declarations = carrierDeclarations(rule.style, baseUrl);
    if (typeof rule.selectorText === "string" && rule.cssRules?.length > 0) {
      throw new SyntaxError(`Automatic CSS cannot preserve nested selector rule: ${rule.selectorText}`);
    }
    const nested = rule.cssRules
      ? serializeCarrierRules(
        rule.cssRules,
        selectors,
        baseUrl,
        selectorRecords,
        sourceIdentity,
        mediaQueries,
      )
      : "";
    if (typeof rule.selectorText === "string") {
      if (!declarations.css && !nested) continue;
      if (declarations.shape) {
        selectors.add(rule.selectorText);
        selectorRecords.push(Object.freeze({
          source: sourceIdentity,
          selector: rule.selectorText,
          declaration: diagnosticShapeDeclarations(rule.style).join("; ") || null,
        }));
      }
      output += `${rule.selectorText}{${declarations.css}${nested}}`;
      continue;
    }
    if (typeof rule.keyText === "string") {
      if (declarations.css) output += `${rule.keyText}{${declarations.css}}`;
      continue;
    }
    if (nested) {
      if (/^@layer\s*$/iu.test(header)) {
        throw new SyntaxError("Automatic CSS cannot preserve an anonymous cascade layer");
      }
      if (/^@supports\b/iu.test(header)) output += `${carrierSupportsHeader(header)}{${nested}}`;
      else if (/^@media\b/iu.test(header) || /^@layer\s+[\w.-]+\s*$/iu.test(header)) {
        if (/^@media\b/iu.test(header)) mediaQueries.add(header.replace(/^@media\b/iu, "").trim());
        output += `${header}{${nested}}`;
      } else {
        throw new SyntaxError(`Automatic CSS cannot preserve at-rule context: ${header}`);
      }
    }
  }
  return output;
}

const SELECTOR_STATE_EVENTS = Object.freeze({
  active: Object.freeze(["pointercancel", "pointerdown", "pointerup"]),
  hover: Object.freeze(["pointerover", "pointerout"]),
  focus: Object.freeze(["focusin", "focusout"]),
  "focus-visible": Object.freeze(["focusin", "focusout"]),
  "focus-within": Object.freeze(["focusin", "focusout"]),
  checked: Object.freeze(["input", "change"]),
  default: Object.freeze(["input", "change"]),
  disabled: Object.freeze(["input", "change"]),
  enabled: Object.freeze(["input", "change"]),
  indeterminate: Object.freeze(["input", "change"]),
  invalid: Object.freeze(["input", "change"]),
  "in-range": Object.freeze(["input", "change"]),
  optional: Object.freeze(["input", "change"]),
  "out-of-range": Object.freeze(["input", "change"]),
  "placeholder-shown": Object.freeze(["input", "change"]),
  "read-only": Object.freeze(["input", "change"]),
  "read-write": Object.freeze(["input", "change"]),
  required: Object.freeze(["input", "change"]),
  "user-invalid": Object.freeze(["input", "change"]),
  "user-valid": Object.freeze(["input", "change"]),
  valid: Object.freeze(["input", "change"]),
  modal: Object.freeze(["toggle"]),
  open: Object.freeze(["toggle"]),
  "popover-open": Object.freeze(["toggle"]),
  target: Object.freeze(["hashchange", "popstate"]),
  "target-within": Object.freeze(["hashchange", "popstate"]),
  fullscreen: Object.freeze(["fullscreenchange"]),
});

const STATIC_SELECTOR_PSEUDOS = new Set([
  "any-link", "empty", "first-child", "first-of-type", "has", "is", "lang",
  "last-child", "last-of-type", "link", "local-link", "not", "nth-child",
  "nth-last-child", "nth-last-of-type", "nth-of-type", "only-child",
  "only-of-type", "root", "scope", "where",
]);

function selectorObservation(selectors) {
  const attributes = new Set();
  const events = new Set();
  let characterData = false;
  let conservative = false;
  for (const selector of selectors) {
    if (selector.includes("\\")) conservative = true;
    if (/(?:^|[^\w-])\.[_a-z-]/iu.test(selector)) attributes.add("class");
    if (/(?:^|[^\w-])#[_a-z-]/iu.test(selector)) attributes.add("id");
    const attributeMatches = [...selector.matchAll(/\[\s*([_a-z][\w-]*)/giu)];
    for (const match of attributeMatches) attributes.add(match[1].toLowerCase());
    if ((selector.match(/\[/gu)?.length ?? 0) !== attributeMatches.length) conservative = true;
    for (const match of selector.matchAll(/(?:^|[^:]):([a-z-]+)/giu)) {
      const pseudo = match[1].toLowerCase();
      const stateEvents = SELECTOR_STATE_EVENTS[pseudo];
      if (stateEvents) {
        for (const event of stateEvents) events.add(event);
        if (["checked", "default", "disabled", "enabled", "required", "optional"].includes(pseudo)) {
          attributes.add(pseudo === "enabled" ? "disabled" : pseudo);
        }
        if (["modal", "open"].includes(pseudo)) attributes.add("open");
        if (pseudo === "popover-open") attributes.add("popover");
        continue;
      }
      if (pseudo === "dir") {
        attributes.add("dir");
        continue;
      }
      if (pseudo === "lang") {
        attributes.add("lang");
        continue;
      }
      if (pseudo === "empty") characterData = true;
      else if (!STATIC_SELECTOR_PSEUDOS.has(pseudo)) conservative = true;
    }
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    events: Object.freeze([...events].sort()),
    characterData,
    conservative,
  });
}

function parseCarrierSheet(
  document,
  source,
  baseUrl = document.baseURI,
  nonce = null,
  sourceIdentity = baseUrl,
) {
  const transformed = canonicalizeCornerShapeDeclarations(source);
  let sheet;
  let parserStyle = null;
  try {
    sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync(transformed);
  } catch {
    parserStyle = document.createElement("style");
    parserStyle.media = "not all";
    if (nonce) parserStyle.setAttribute("nonce", nonce);
    parserStyle.textContent = transformed;
    (document.head ?? document.documentElement).append(parserStyle);
    sheet = parserStyle.sheet;
  }
  try {
    const selectors = new Set();
    const selectorRecords = [];
    const mediaQueries = new Set();
    const css = serializeCarrierRules(
      sheet?.cssRules ?? [],
      selectors,
      baseUrl,
      selectorRecords,
      sourceIdentity,
      mediaQueries,
    );
    const selectorList = Object.freeze([...selectors]);
    return Object.freeze({
      css,
      selectors: selectorList,
      selectorRecords: Object.freeze(selectorRecords),
      observation: selectorObservation(selectorList),
      mediaQueries: Object.freeze([...mediaQueries].filter(Boolean).sort()),
    });
  } finally {
    parserStyle?.remove();
  }
}

function cssStatementEnd(source, start) {
  let quote = null;
  let comment = false;
  let escaped = false;
  let parentheses = 0;
  for (let index = start; index < source.length; index += 1) {
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
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (parentheses === 0 && character === ";") return index;
    else if (parentheses === 0 && character === "{") return -1;
  }
  return -1;
}

function skipCssTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/u.test(source[index])) {
      index += 1;
      continue;
    }
    if (source[index] === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      return end < 0 ? source.length : skipCssTrivia(source, end + 2);
    }
    break;
  }
  return index;
}

function leadingImportStatements(source) {
  const imports = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = skipCssTrivia(source, cursor);
    if (start >= source.length) break;
    const importMatch = /^@import\b/iu.exec(source.slice(start));
    const charsetMatch = /^@charset\b/iu.exec(source.slice(start));
    const layerMatch = /^@layer\b/iu.exec(source.slice(start));
    if (importMatch) {
      const end = cssStatementEnd(source, start + importMatch[0].length);
      if (end < 0) throw new SyntaxError("Automatic CSS found a malformed top-level @import rule");
      imports.push(Object.freeze({ start, end: end + 1, prelude: source.slice(start, end + 1) }));
      cursor = end + 1;
      continue;
    }
    if (charsetMatch || layerMatch) {
      const end = cssStatementEnd(source, start + (charsetMatch ?? layerMatch)[0].length);
      if (end >= 0) {
        cursor = end + 1;
        continue;
      }
    }
    break;
  }
  if (imports.length === 0) return Object.freeze({ imports: Object.freeze([]), local: source });
  let local = "";
  let position = 0;
  for (const record of imports) {
    local += source.slice(position, record.start);
    local += " ".repeat(record.end - record.start);
    position = record.end;
  }
  local += source.slice(position);
  return Object.freeze({ imports: Object.freeze(imports), local });
}

function unquoteImportUrl(value) {
  const trimmed = value.trim();
  const quoted = /^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/u.exec(trimmed);
  if (quoted) return Object.freeze({
    rest: trimmed.slice(skipCssTrivia(trimmed, quoted[0].length)).trim(),
    url: decodeCssEscapes(quoted[1] ?? quoted[2]),
  });
  if (!/^url\s*\(/iu.test(trimmed)) {
    const unquoted = /^((?:\\[\s\S]|[^\s"'()])+)/u.exec(trimmed);
    if (unquoted) return Object.freeze({
      rest: trimmed.slice(skipCssTrivia(trimmed, unquoted[0].length)).trim(),
      url: decodeCssEscapes(unquoted[1]),
    });
    throw new SyntaxError("Automatic CSS supports quoted or url() @import URLs");
  }
  const start = trimmed.indexOf("(");
  const end = matchingParenthesis(trimmed, start);
  if (end < 0) throw new SyntaxError("Automatic CSS found an unterminated @import url()");
  const inner = trimmed.slice(start + 1, end).trim();
  const nested = unquoteImportUrl(inner);
  if (nested.rest) throw new SyntaxError("Automatic CSS found an invalid @import url()");
  return Object.freeze({
    rest: trimmed.slice(skipCssTrivia(trimmed, end + 1)).trim(),
    url: nested.url,
  });
}

function decodeCssEscapes(value) {
  return String(value).replaceAll(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|((?:\r\n|[\n\f\r]))|([\s\S]))/giu,
    (_source, hexadecimal, newline, character) => {
      if (newline) return "";
      if (!hexadecimal) return character;
      const codePoint = Number.parseInt(hexadecimal, 16);
      return codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? "\ufffd"
        : String.fromCodePoint(codePoint);
    },
  );
}

function consumeImportFunction(value, name) {
  if (!new RegExp(`^${name}\\s*\\(`, "iu").test(value)) return null;
  const start = value.indexOf("(");
  const end = matchingParenthesis(value, start);
  if (end < 0) throw new SyntaxError(`Automatic CSS found an unterminated @import ${name}()`);
  return Object.freeze({
    value: value.slice(start + 1, end).trim(),
    rest: value.slice(end + 1).trim(),
  });
}

function parseImportStatement(statement, baseUrl) {
  const body = statement.replace(/^@import\b/iu, "").replace(/;\s*$/u, "").trim();
  const parsedUrl = unquoteImportUrl(body);
  let rest = parsedUrl.rest;
  let layer = null;
  let supports = null;
  if (/^layer\b/iu.test(rest)) {
    const layerFunction = consumeImportFunction(rest, "layer");
    if (!layerFunction) throw new SyntaxError("Automatic CSS refuses anonymous @import layers");
    if (!/^[-_a-z][\w.-]*$/iu.test(layerFunction.value)) {
      throw new SyntaxError(`Automatic CSS cannot preserve @import layer name: ${layerFunction.value}`);
    }
    layer = layerFunction.value;
    rest = layerFunction.rest;
  }
  const supportsFunction = consumeImportFunction(rest, "supports");
  if (supportsFunction) {
    supports = supportsFunction.value;
    rest = supportsFunction.rest;
  }
  return Object.freeze({
    url: new URL(parsedUrl.url, baseUrl).href,
    layer,
    supports,
    media: rest,
  });
}

function wrapImportedCarrierCss(css, imported) {
  let output = css;
  if (imported.media) output = `@media ${imported.media}{${output}}`;
  if (imported.supports) {
    const condition = /^(?:\(|not\b)/iu.test(imported.supports)
      ? imported.supports
      : `(${imported.supports})`;
    output = `${carrierSupportsHeader(`@supports ${condition}`)}{${output}}`;
  }
  if (imported.layer) output = `@layer ${imported.layer}{${output}}`;
  return output;
}

function mergeSelectorObservation(records) {
  const attributes = new Set();
  const events = new Set();
  let characterData = false;
  let conservative = false;
  for (const record of records) {
    for (const attribute of record.attributes) attributes.add(attribute);
    for (const event of record.events) events.add(event);
    characterData ||= record.characterData;
    conservative ||= record.conservative;
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    events: Object.freeze([...events].sort()),
    characterData,
    conservative,
  });
}

function annotateDiagnostic(error, details) {
  const value = error instanceof Error ? error : new Error(String(error));
  const previous = value.cornerfillDiagnostic ?? {};
  Object.defineProperty(value, "cornerfillDiagnostic", {
    configurable: true,
    value: Object.freeze({ ...details, ...previous }),
  });
  return value;
}

function mutateStylesheetModel(document, source, mutation, nonce = null) {
  let sheet;
  let parserStyle = null;
  try {
    sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync(source);
  } catch {
    parserStyle = document.createElement("style");
    parserStyle.media = "not all";
    if (nonce) parserStyle.setAttribute("nonce", nonce);
    parserStyle.textContent = source;
    (document.head ?? document.documentElement).append(parserStyle);
    sheet = parserStyle.sheet;
  }
  try {
    if (mutation.kind === "insert") {
      sheet.insertRule(canonicalizeCornerShapeDeclarations(mutation.rule), mutation.index);
    } else sheet.deleteRule(mutation.index);
    return [...(sheet.cssRules ?? [])].map((rule) => rule.cssText).join("\n");
  } finally {
    parserStyle?.remove();
  }
}

function computedCarrier(computed, property) {
  const value = computed.getPropertyValue(property).trim();
  return value === AUTO_UNSET ? "" : value;
}

function automaticComputedSignature(computed) {
  return [
    computed.visibility,
    computed.direction,
    computed.writingMode,
    ...AUTO_CARRIERS.map((property) => computedCarrier(computed, property)),
  ].join("\n");
}

function automaticStyleMutationSignature(value) {
  return String(value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      if (property === "--cornerfill-live-image"
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
    })
    .join(";");
}

function carrierProblem(computed) {
  if (computedCarrier(computed, AUTO_UNSUPPORTED_SHAPE)) {
    return "Automatic CSS cannot resolve this corner-shape value; use cornerfill/runtime for explicit state.";
  }
  if (computedCarrier(computed, AUTO_UNSUPPORTED_OWNED)) {
    return "Automatic CSS cannot preserve an inherited or reverted paint-owned declaration; use cornerfill/runtime for explicit state.";
  }
  const variableShorthand = computedCarrier(computed, SHAPE_PROPERTIES["corner-shape"]);
  const competingLonghand = [...PHYSICAL_SHAPE_PROPERTIES, ...LOGICAL_SHAPE_PROPERTIES]
    .some((property) => computedCarrier(computed, SHAPE_PROPERTIES[property]));
  if (variableShorthand && competingLonghand) {
    return "Automatic CSS refuses a variable corner-shape shorthand combined with longhands because their cascade order cannot be preserved.";
  }
  if (computedCarrier(computed, AUTO_PHYSICAL_SHAPE)
    && computedCarrier(computed, AUTO_LOGICAL_SHAPE)) {
    return "Automatic CSS refuses mixed physical and logical corner-shape declarations because their cross-family cascade cannot be preserved.";
  }
  if (computedCarrier(computed, AUTO_PHYSICAL_RADIUS)
    && computedCarrier(computed, AUTO_LOGICAL_RADIUS)) {
    return "Automatic CSS refuses mixed physical and logical border-radius declarations because their cross-family cascade cannot be preserved.";
  }
  return null;
}

function hasShapeCarrier(computed) {
  return SHAPE_CARRIERS.some((property) => computedCarrier(computed, property));
}

function stylesheetElements(root) {
  return [...root.querySelectorAll(
    `style:not([${AUTO_STYLESHEET_ATTRIBUTE}]):not([data-cornerfill-ownership-styles]),link[rel~="stylesheet"]`,
  )].filter(stylesheetElementIsEligible);
}

function stylesheetElementIsEligible(owner) {
  if (!owner?.isConnected || owner.disabled) return false;
  if (owner.localName === "style") {
    const type = (owner.getAttribute("type") ?? "").trim().toLowerCase();
    return type === "" || type === "text/css";
  }
  if (owner.localName !== "link" || !owner.relList?.contains("stylesheet")) return false;
  return !owner.relList.contains("alternate");
}

function authoredShapeInlineElements(root) {
  const elements = [...root.querySelectorAll('[style*="corner-" i][style*="shape" i]')];
  if (root.nodeType === 1
    && /corner-/iu.test(root.getAttribute("style") ?? "")
    && /shape/iu.test(root.getAttribute("style") ?? "")) elements.unshift(root);
  return elements;
}

function stylesheetMedia(owner) {
  return owner.getAttribute("media") ?? "";
}

function adoptedStylesheetMedia(sheet) {
  return sheet.media?.mediaText ?? "";
}

function adoptedStylesheetSource(sheet) {
  return [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
}

function nonceValue(element) {
  return element?.nonce || element?.getAttribute?.("nonce") || "";
}

function assertGeneratedStyleActive(style, context) {
  try {
    if (!style.sheet || style.sheet.cssRules.length === 0) {
      throw new Error(`${context} was blocked or discarded`);
    }
  } catch (error) {
    if (error instanceof Error && /blocked or discarded/u.test(error.message)) throw error;
    throw new Error(`${context} is not readable after insertion`, { cause: error });
  }
}

function stylesheetKey(owner) {
  return owner.localName === "style"
    ? `style\n${owner.getAttribute("type") ?? ""}\n${stylesheetMedia(owner)}\n${owner.getAttribute("nonce") ?? ""}\n${owner.textContent ?? ""}`
    : [
      "link",
      owner.rel,
      owner.title,
      stylesheetMedia(owner),
      nonceValue(owner),
      owner.href,
      owner.crossOrigin ?? "",
      owner.integrity ?? "",
      owner.referrerPolicy ?? "",
    ].join("\n");
}

function carrierRegistrationCss() {
  return AUTO_CARRIERS.map((property) => (
    `@property ${property}{syntax:"*";inherits:false;initial-value:${AUTO_UNSET};}`
  )).join("");
}

function inlineCarrierRecords(document, source) {
  if (!source) return Object.freeze({
    declarations: Object.freeze([]),
    shape: false,
    signature: "",
    authoredShape: "",
  });
  const authoredDeclarations = [];
  const transformed = canonicalizeCornerShapeDeclarations(String(source), authoredDeclarations);
  const scratch = document.createElement("div");
  scratch.setAttribute("style", transformed);
  const compiled = carrierDeclarations(scratch.style, document.baseURI);
  if (!compiled.css) return Object.freeze({
    declarations: Object.freeze([]),
    shape: false,
    signature: "",
    authoredShape: authoredDeclarations.join(";"),
  });
  const carrierScratch = document.createElement("div");
  carrierScratch.setAttribute("style", compiled.css);
  const declarations = AUTO_CARRIERS.map((property) => Object.freeze({
    property,
    value: carrierScratch.style.getPropertyValue(property),
    priority: carrierScratch.style.getPropertyPriority(property),
  })).filter(({ value }) => value);
  const signature = declarations.map(({ property, value, priority }) => (
    `${property}:${value.trim()}${priority ? "!important" : ""}`
  )).join(";");
  return Object.freeze({
    declarations: Object.freeze(declarations),
    shape: compiled.shape,
    signature,
    authoredShape: authoredDeclarations.join(";"),
  });
}

function runtimeOptions(options, document) {
  const {
    root: _root,
    controller: _controller,
    autoObserve: _autoObserve,
    adoptedStyleSheets: _adoptedStyleSheets,
    parentAuto: _parentAuto,
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
    this.nonce = options.nonce ?? stylesheetElements(this.root).map(nonceValue).find(Boolean)
      ?? nonceValue(this.document.querySelector("script[nonce],style[nonce],link[nonce]"))
      ?? null;
    this.controller = options.controller ?? installCornerfill(runtimeOptions({
      ...options,
      nonce: this.nonce,
    }, this.document));
    this.ownsController = options.controller === undefined;
    this.autoObserve = options.autoObserve ?? options.observe !== false;
    this.includeAdoptedStyleSheets = options.adoptedStyleSheets === true;
    this.adoptedStylesheetSources = new WeakMap();
    this.parentAuto = options.parentAuto ?? null;
    this.onError = typeof options.onError === "function" ? options.onError : null;
    this.stylesheets = new Map();
    this.adoptedStylesheets = new Map();
    this.adoptedStylesheetIds = new WeakMap();
    this.nextAdoptedStylesheetId = 1;
    this.sourceOwnerIds = new WeakMap();
    this.nextSourceOwnerId = 1;
    this.scopes = new Map();
    this.inline = new Map();
    this.handles = new Map();
    this.diagnosticsByOwner = new Map();
    this.candidateProvenance = new Map();
    this.observer = null;
    this.observationState = Object.freeze({
      attributes: Object.freeze([...SOURCE_ATTRIBUTE_NAMES]),
      characterData: false,
      conservative: false,
      events: Object.freeze([]),
      mediaQueries: Object.freeze([]),
    });
    this.registrationStyle = null;
    this.registrationAcquired = false;
    this.eventListeners = [];
    this.mediaListeners = [];
    this.destroyed = false;
    this.refreshQueued = false;
    this.workRequested = false;
    this.refreshPromise = null;
    this.refreshFrame = null;
    this.sourceRequested = false;
    this.candidateRequested = false;
    this.attachmentRequested = false;
    this.retryFailedRequested = false;
    this.pendingFetches = new Set();
    this.pendingStylesheetWaits = new Set();
    this.sourceRequests = new Map();
    this.importRequests = new Map();
    this.sourceApplyPromise = null;
    this.sourceApplyFrame = null;
    this.sourceApplyFrameResolve = null;
    this.sourceApplyRequested = false;
    this.handleSignatures = new Map();
    this.candidates = new Set();
    this.automaticCounters = {
      sourcePasses: 0,
      sourceReads: 0,
      sourceCompiles: 0,
      candidatePasses: 0,
      attachmentPasses: 0,
      computedChecks: 0,
      handleAttaches: 0,
      handleRefreshes: 0,
      handleDetaches: 0,
    };
    this.nativeQualification = options.nativeQualification ?? this.controller.capabilities.native;
    this.native = this.controller.capabilities.native.qualified
      && this.controller.options.forceFallback !== true;
    this.ready = this._start();
  }

  _ownerIdentity(owner) {
    if (owner?.localName === "link") return owner.href || "stylesheet link";
    if (owner?.localName === "style") {
      let id = this.sourceOwnerIds.get(owner);
      if (!id) {
        id = this.nextSourceOwnerId;
        this.nextSourceOwnerId += 1;
        this.sourceOwnerIds.set(owner, id);
      }
      return `${this.document.baseURI}#cornerfill-inline-style-${id}`;
    }
    if (owner instanceof this.document.defaultView.Element) {
      return owner.id ? `#${owner.id}` : owner.localName;
    }
    return typeof owner === "string" ? owner : "automatic runtime";
  }

  _recordError(error, context, details = {}) {
    const diagnostic = error?.cornerfillDiagnostic ?? {};
    const bucketOwner = details.bucket ?? details.owner ?? `automatic:${context}`;
    const owner = details.ownerIdentity ?? this._ownerIdentity(details.owner ?? context);
    const record = Object.freeze({
      context,
      owner,
      source: details.source ?? diagnostic.source ?? owner,
      selector: details.selector ?? diagnostic.selector ?? null,
      declaration: details.declaration ?? diagnostic.declaration ?? null,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    });
    const key = `${record.source}\n${record.selector ?? ""}\n${record.declaration ?? ""}\n${record.message}`;
    let records = this.diagnosticsByOwner.get(bucketOwner);
    if (!records) {
      records = new Map();
      this.diagnosticsByOwner.set(bucketOwner, records);
    }
    if (records.has(key)) return;
    records.set(key, record);
    this.onError?.(error, context);
  }

  _clearErrors(owner) {
    this.diagnosticsByOwner.delete(owner);
  }

  _errors() {
    return Object.freeze([...this.diagnosticsByOwner.values()]
      .flatMap((records) => [...records.values()]));
  }

  _elementDiagnostic(element) {
    const provenance = this.candidateProvenance.get(element)?.[0];
    if (provenance) return provenance;
    const inline = this.inline.get(element);
    return Object.freeze({
      source: this._ownerIdentity(element),
      selector: inline ? "[style]" : null,
      declaration: inline?.authoredShape || null,
    });
  }

  _recordElementError(error, element) {
    const diagnostic = this._elementDiagnostic(element);
    this._recordError(error, this._ownerIdentity(element), {
      bucket: element,
      ownerIdentity: diagnostic.source,
      ...diagnostic,
    });
  }

  _ensureCarrierRegistration() {
    if (this.registrationAcquired && this.registrationStyle?.isConnected) return;
    const shared = CARRIER_REGISTRATIONS.get(this.document);
    if (shared?.style.isConnected) {
      shared.references += 1;
      this.registrationStyle = shared.style;
      this.registrationAcquired = true;
      return;
    }
    const style = this.document.createElement("style");
    style.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "properties");
    const nonce = this.nonce ?? stylesheetElements(this.root)
      .map((owner) => owner.getAttribute("nonce"))
      .find(Boolean);
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = carrierRegistrationCss();
    (this.document.head ?? this.document.documentElement).append(style);
    try {
      assertGeneratedStyleActive(style, "Cornerfill carrier registration stylesheet");
    } catch (error) {
      style.remove();
      throw error;
    }
    this.registrationStyle = style;
    this.registrationAcquired = true;
    CARRIER_REGISTRATIONS.set(this.document, { references: 1, style });
  }

  _releaseCarrierRegistration() {
    if (!this.registrationAcquired) return;
    this.registrationAcquired = false;
    const shared = CARRIER_REGISTRATIONS.get(this.document);
    if (!shared || shared.style !== this.registrationStyle) {
      this.registrationStyle = null;
      return;
    }
    shared.references -= 1;
    if (shared.references <= 0) {
      shared.style.remove();
      CARRIER_REGISTRATIONS.delete(this.document);
    }
    this.registrationStyle = null;
  }

  async _source(owner, request) {
    this.automaticCounters.sourceReads += 1;
    if (owner.localName === "style") return Object.freeze({
      text: owner.textContent ?? "",
      baseUrl: this.document.baseURI,
      sourceUrl: this._ownerIdentity(owner),
    });
    const url = new URL(owner.href, this.document.baseURI);
    const controller = request.controller;
    this.pendingFetches.add(controller);
    const crossOrigin = owner.crossOrigin;
    const init = {
      credentials: crossOrigin === "use-credentials"
        ? "include"
        : crossOrigin === "anonymous"
          ? "omit"
          : url.origin === new URL(this.document.baseURI).origin ? "same-origin" : "omit",
      mode: "cors",
      signal: controller.signal,
    };
    if (owner.integrity) init.integrity = owner.integrity;
    if (owner.referrerPolicy) init.referrerPolicy = owner.referrerPolicy;
    try {
      const response = await this.document.defaultView.fetch(url.href, init);
      if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}: ${url.href}`);
      const contentType = response.headers?.get?.("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
      if (contentType !== "text/css") {
        throw new TypeError(`stylesheet response has invalid CSS MIME type ${contentType || "(missing)"}: ${url.href}`);
      }
      return Object.freeze({
        text: await response.text(),
        baseUrl: response.url || url.href,
        sourceUrl: response.url || url.href,
      });
    } finally {
      this.pendingFetches.delete(controller);
    }
  }

  _releaseImportRequests(request) {
    for (const record of request.importRecords ?? []) {
      record.consumers.delete(request);
      if (record.consumers.size > 0) continue;
      if (!record.settled) record.controller.abort();
      if (this.importRequests.get(record.key) === record) this.importRequests.delete(record.key);
    }
    request.importRecords?.clear();
  }

  _importSource(url, owner, request) {
    const crossOrigin = owner.crossOrigin;
    const credentials = crossOrigin === "use-credentials"
      ? "include"
      : crossOrigin === "anonymous"
        ? "omit"
        : new URL(url).origin === new URL(this.document.baseURI).origin ? "same-origin" : "omit";
    const referrerPolicy = owner.referrerPolicy || "";
    const key = `${credentials}\n${referrerPolicy}\n${url}`;
    let record = this.importRequests.get(key);
    if (!record) {
      const controller = new this.document.defaultView.AbortController();
      record = {
        consumers: new Set(),
        controller,
        key,
        promise: null,
        settled: false,
      };
      const init = { credentials, mode: "cors", signal: controller.signal };
      if (referrerPolicy) init.referrerPolicy = referrerPolicy;
      const task = (async () => {
        try {
          const response = await this.document.defaultView.fetch(url, init);
          if (!response.ok) throw new Error(`stylesheet request failed with HTTP ${response.status}`);
          const contentType = response.headers?.get?.("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
          if (contentType !== "text/css") {
            throw new TypeError(`stylesheet response has invalid CSS MIME type ${contentType || "(missing)"}`);
          }
          const sourceUrl = response.url || url;
          return Object.freeze({
            text: await response.text(),
            baseUrl: sourceUrl,
            sourceUrl,
          });
        } catch (error) {
          throw new Error(`@import ${url} failed: ${error.message}`, { cause: error });
        } finally {
          record.settled = true;
          if (record.consumers.size === 0 && this.importRequests.get(key) === record) {
            this.importRequests.delete(key);
          }
        }
      })();
      record.promise = task;
      this.importRequests.set(key, record);
    }
    record.consumers.add(request);
    request.importRecords.add(record);
    return record.promise;
  }

  async _compileSourceTree(source, owner, request, stack = []) {
    const identity = source.sourceUrl || source.baseUrl;
    if (stack.includes(identity)) {
      throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...stack, identity].join(" -> ")}`);
    }
    const nextStack = [...stack, identity];
    request.provenance.add(identity);
    const split = leadingImportStatements(source.text);
    const parts = [];
    for (const statement of split.imports) {
      let imported;
      try {
        imported = parseImportStatement(statement.prelude, source.baseUrl);
      } catch (error) {
        throw annotateDiagnostic(error, { source: identity, declaration: statement.prelude });
      }
      if (nextStack.includes(imported.url)) {
        throw new SyntaxError(`Automatic CSS rejected an @import cycle: ${[...nextStack, imported.url].join(" -> ")}`);
      }
      let compiledPromise = request.importCache.get(imported.url);
      if (!compiledPromise) {
        compiledPromise = (async () => {
          const importedSource = await this._importSource(imported.url, owner, request);
          return this._compileSourceTree(importedSource, owner, request, nextStack);
        })();
        request.importCache.set(imported.url, compiledPromise);
      }
      const compiled = await compiledPromise;
      parts.push(Object.freeze({
        ...compiled,
        css: wrapImportedCarrierCss(compiled.css, imported),
        mediaQueries: Object.freeze([
          ...compiled.mediaQueries,
          ...(imported.media ? [imported.media] : []),
        ]),
      }));
    }
    let local;
    try {
      local = parseCarrierSheet(this.document, split.local, source.baseUrl, this.nonce, identity);
    } catch (error) {
      throw annotateDiagnostic(error, { source: identity });
    }
    parts.push(local);
    const selectors = Object.freeze([...new Set(parts.flatMap((part) => part.selectors))]);
    return Object.freeze({
      css: parts.map((part) => part.css).join(""),
      selectors,
      selectorRecords: Object.freeze(parts.flatMap((part) => part.selectorRecords)),
      observation: mergeSelectorObservation(parts.map((part) => part.observation)),
      mediaQueries: Object.freeze([...new Set(parts.flatMap((part) => part.mediaQueries))].sort()),
      sources: Object.freeze([...request.provenance]),
      imports: split.imports.length,
    });
  }

  _waitForLinkedStylesheet(owner, request) {
    if (owner.localName !== "link") return Promise.resolve();
    try {
      if (owner.sheet?.href === owner.href) return Promise.resolve();
    } catch {
      // A cross-origin sheet can hide cssRules while still exposing load/error.
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        owner.removeEventListener("load", loaded);
        owner.removeEventListener("error", failed);
        this.document.defaultView.clearTimeout(timer);
        this.pendingStylesheetWaits.delete(cancel);
        if (request.cancelWait === cancel) request.cancelWait = null;
      };
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const loaded = () => finish();
      const failed = () => finish(new Error(`browser stylesheet load failed: ${owner.href}`));
      const cancel = () => finish();
      request.cancelWait = cancel;
      const timer = this.document.defaultView.setTimeout(() => finish(
        new Error(`browser stylesheet load timed out: ${owner.href}`),
      ), 3_000);
      owner.addEventListener("load", loaded, { once: true });
      owner.addEventListener("error", failed, { once: true });
      this.pendingStylesheetWaits.add(cancel);
      queueMicrotask(() => {
        try {
          if (owner.sheet?.href === owner.href) finish();
        } catch {
          // Wait for the bounded load/error path.
        }
      });
    });
  }

  _writeStylesheetRecord(owner, compiled, {
    key = stylesheetKey(owner),
    existing = this.stylesheets.get(owner),
    cssomHook = existing?.cssomHook ?? null,
  } = {}) {
    let companion = existing?.companion ?? null;
    if (compiled.css) {
      companion ??= this.document.createElement("style");
      companion.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "");
      const nonce = nonceValue(owner) || this.nonce;
      if (nonce) companion.setAttribute("nonce", nonce);
      else companion.removeAttribute("nonce");
      companion.media = stylesheetMedia(owner);
      companion.textContent = compiled.css;
      if (!companion.isConnected) owner.after(companion);
      try {
        assertGeneratedStyleActive(companion, "Cornerfill generated carrier stylesheet");
      } catch (error) {
        companion.remove();
        throw error;
      }
    } else {
      companion?.remove();
      companion = null;
    }
    const record = Object.freeze({
      owner,
      companion,
      key,
      failed: false,
      media: stylesheetMedia(owner),
      selectors: compiled.selectors,
      selectorRecords: compiled.selectorRecords ?? Object.freeze([]),
      observation: compiled.observation,
      mediaQueries: Object.freeze([
        ...new Set([stylesheetMedia(owner), ...(compiled.mediaQueries ?? [])].filter(Boolean)),
      ].sort()),
      sources: compiled.sources ?? Object.freeze([key]),
      imports: compiled.imports ?? 0,
      cssomHook,
    });
    this.stylesheets.set(owner, record);
    return record;
  }

  _writeFailedStylesheetRecord(owner, key, cssomHook = null) {
    const existing = this.stylesheets.get(owner);
    existing?.companion?.remove();
    const record = Object.freeze({
      owner,
      companion: null,
      key,
      failed: true,
      media: stylesheetMedia(owner),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      observation: selectorObservation([]),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([key]),
      imports: 0,
      cssomHook,
    });
    this.stylesheets.set(owner, record);
    this._configureObservation();
    this._scheduleSourceApplication();
    return record;
  }

  _adoptedStylesheetIdentity(sheet) {
    let identity = this.adoptedStylesheetIds.get(sheet);
    if (!identity) {
      identity = `adopted stylesheet ${this.nextAdoptedStylesheetId}`;
      this.nextAdoptedStylesheetId += 1;
      this.adoptedStylesheetIds.set(sheet, identity);
    }
    return identity;
  }

  _writeAdoptedStylesheetRecord(sheet, compiled, { key, identity, media }) {
    const existing = this.adoptedStylesheets.get(sheet);
    let companion = existing?.companion ?? null;
    if (compiled.css && !sheet.disabled) {
      companion ??= this.document.createElement("style");
      companion.setAttribute(AUTO_STYLESHEET_ATTRIBUTE, "adopted");
      if (this.nonce) companion.setAttribute("nonce", this.nonce);
      companion.media = media;
      companion.textContent = compiled.css;
      if (!companion.isConnected) {
        if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
        else this.root.append(companion);
      }
      try {
        assertGeneratedStyleActive(companion, "Cornerfill generated adopted stylesheet");
      } catch (error) {
        companion.remove();
        throw error;
      }
    } else {
      companion?.remove();
      companion = null;
    }
    const record = Object.freeze({
      owner: sheet,
      adopted: true,
      companion,
      key,
      failed: false,
      identity,
      media,
      selectors: sheet.disabled ? Object.freeze([]) : compiled.selectors,
      selectorRecords: sheet.disabled ? Object.freeze([]) : compiled.selectorRecords,
      observation: sheet.disabled ? selectorObservation([]) : compiled.observation,
      mediaQueries: sheet.disabled
        ? Object.freeze([])
        : Object.freeze([...new Set([media, ...(compiled.mediaQueries ?? [])].filter(Boolean))].sort()),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.adoptedStylesheets.set(sheet, record);
    return record;
  }

  _writeFailedAdoptedStylesheetRecord(sheet, identity, key = identity) {
    this.adoptedStylesheets.get(sheet)?.companion?.remove();
    const record = Object.freeze({
      owner: sheet,
      adopted: true,
      companion: null,
      key,
      failed: true,
      identity,
      media: adoptedStylesheetMedia(sheet),
      selectors: Object.freeze([]),
      selectorRecords: Object.freeze([]),
      observation: selectorObservation([]),
      mediaQueries: Object.freeze([]),
      sources: Object.freeze([identity]),
      imports: 0,
      cssomHook: null,
    });
    this.adoptedStylesheets.set(sheet, record);
    this._configureObservation();
    this._scheduleSourceApplication();
    return record;
  }

  _processAdoptedStylesheet(sheet, retryFailed = false) {
    if (this.destroyed) return;
    const existing = this.adoptedStylesheets.get(sheet);
    if (existing?.failed && !retryFailed) return;
    const identity = existing?.identity ?? this._adoptedStylesheetIdentity(sheet);
    this._clearErrors(sheet);
    let source;
    let media;
    try {
      source = this.adoptedStylesheetSources.get(sheet) ?? adoptedStylesheetSource(sheet);
      media = adoptedStylesheetMedia(sheet);
      this.automaticCounters.sourceReads += 1;
    } catch (error) {
      this._recordError(error, identity, { bucket: sheet, ownerIdentity: identity });
      this._writeFailedAdoptedStylesheetRecord(sheet, identity);
      return;
    }
    const key = `${identity}\n${sheet.disabled ? "disabled" : "enabled"}\n${media}\n${source}`;
    if (existing?.key === key) return;
    try {
      const compiled = parseCarrierSheet(
        this.document,
        source,
        this.document.baseURI,
        this.nonce,
        identity,
      );
      this.automaticCounters.sourceCompiles += 1;
      this._writeAdoptedStylesheetRecord(sheet, compiled, { identity, key, media });
    } catch (error) {
      this._recordError(error, identity, { bucket: sheet, ownerIdentity: identity });
      this._writeFailedAdoptedStylesheetRecord(sheet, identity, key);
    }
  }

  _discoverAdoptedStylesheets(retryFailed = false) {
    if (this.destroyed || !this.includeAdoptedStyleSheets) return;
    this._clearErrors(this.adoptedStylesheets);
    let sheets;
    try {
      sheets = [...this.root.adoptedStyleSheets];
    } catch (error) {
      this._recordError(error, "adopted stylesheets", {
        bucket: this.adoptedStylesheets,
        ownerIdentity: "adopted stylesheets",
      });
      return;
    }
    const active = new Set(sheets);
    for (const [sheet, record] of this.adoptedStylesheets) {
      if (active.has(sheet)) continue;
      record.companion?.remove();
      this.adoptedStylesheets.delete(sheet);
      this._clearErrors(sheet);
      this._scheduleSourceApplication();
    }
    for (const sheet of sheets) this._processAdoptedStylesheet(sheet, retryFailed);
    for (const sheet of sheets) {
      const companion = this.adoptedStylesheets.get(sheet)?.companion;
      if (!companion) continue;
      if (this.root === this.document) (this.document.head ?? this.document.documentElement).append(companion);
      else this.root.append(companion);
    }
  }

  _createCssomHook(owner, source, baseUrl) {
    const sheet = owner.sheet;
    if (!sheet?.insertRule || !sheet?.deleteRule) return null;
    const insertDescriptor = Object.getOwnPropertyDescriptor(sheet, "insertRule");
    const deleteDescriptor = Object.getOwnPropertyDescriptor(sheet, "deleteRule");
    const originalInsert = sheet.insertRule;
    const originalDelete = sheet.deleteRule;
    const hook = {
      active: true,
      baseUrl,
      modelSource: canonicalizeCornerShapeDeclarations(source),
      owner,
      sheet,
      restore: () => {
        if (!hook.active) return;
        hook.active = false;
        if (sheet.insertRule === wrappedInsert) {
          if (insertDescriptor) Object.defineProperty(sheet, "insertRule", insertDescriptor);
          else delete sheet.insertRule;
        }
        if (sheet.deleteRule === wrappedDelete) {
          if (deleteDescriptor) Object.defineProperty(sheet, "deleteRule", deleteDescriptor);
          else delete sheet.deleteRule;
        }
      },
    };
    const applyMutation = (mutation) => {
      if (!hook.active || this.destroyed || this.stylesheets.get(owner)?.cssomHook !== hook) return;
      this._clearErrors(owner);
      try {
        hook.modelSource = mutateStylesheetModel(this.document, hook.modelSource, mutation, this.nonce);
        const compiled = parseCarrierSheet(
          this.document,
          hook.modelSource,
          hook.baseUrl,
          this.nonce,
          this._ownerIdentity(owner),
        );
        this.automaticCounters.sourceCompiles += 1;
        this._writeStylesheetRecord(owner, compiled, { cssomHook: hook });
        this._configureObservation();
        this._queueRefresh({ candidates: true, attachments: true });
      } catch (error) {
        this._recordError(error, owner.href || "inline stylesheet CSSOM mutation", {
          bucket: owner,
          ownerIdentity: this._ownerIdentity(owner),
        });
        this._writeFailedStylesheetRecord(owner, stylesheetKey(owner), hook);
      }
    };
    const wrappedInsert = function wrappedCornerfillInsert(rule, index) {
      const result = arguments.length < 2
        ? Reflect.apply(originalInsert, this, [rule])
        : Reflect.apply(originalInsert, this, [rule, index]);
      applyMutation({ kind: "insert", rule: String(rule), index: result });
      return result;
    };
    const wrappedDelete = function wrappedCornerfillDelete(index) {
      const result = Reflect.apply(originalDelete, this, [index]);
      applyMutation({ kind: "delete", index });
      return result;
    };
    try {
      Object.defineProperty(sheet, "insertRule", {
        configurable: true,
        value: wrappedInsert,
        writable: true,
      });
      Object.defineProperty(sheet, "deleteRule", {
        configurable: true,
        value: wrappedDelete,
        writable: true,
      });
      return hook;
    } catch {
      hook.restore();
      return null;
    }
  }

  _scheduleSourceApplication() {
    if (this.destroyed) return Promise.resolve();
    this.sourceApplyRequested = true;
    if (!this.sourceApplyPromise) {
      const task = (async () => {
        await new Promise((resolve) => {
          this.sourceApplyFrameResolve = resolve;
          this.sourceApplyFrame = this.document.defaultView.requestAnimationFrame(() => {
            this.sourceApplyFrame = null;
            const settle = this.sourceApplyFrameResolve;
            this.sourceApplyFrameResolve = null;
            settle?.();
          });
        });
        while (this.sourceApplyRequested && !this.destroyed) {
          this.sourceApplyRequested = false;
          this._reconcileCandidates();
          if (!this.destroyed) await this._refreshAttachments();
        }
      })();
      this.sourceApplyPromise = task.finally(() => {
        this.sourceApplyPromise = null;
      });
    }
    return this.sourceApplyPromise;
  }

  _abortSourceRequest(owner) {
    const request = this.sourceRequests.get(owner);
    if (!request) return;
    request.aborted = true;
    request.controller?.abort();
    request.cancelWait?.();
    this._releaseImportRequests(request);
    this.sourceRequests.delete(owner);
  }

  _abortObsoleteSourceRequests() {
    for (const [owner, request] of this.sourceRequests) {
      if (!stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== request.key) {
        this._abortSourceRequest(owner);
      }
    }
  }

  _processStylesheet(owner, retryFailed = false) {
    if (this.destroyed) return;
    if (!stylesheetElementIsEligible(owner)) {
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      const previous = this.stylesheets.get(owner);
      previous?.companion?.remove();
      previous?.cssomHook?.restore();
      this.stylesheets.delete(owner);
      this._scheduleSourceApplication();
      return Promise.resolve();
    }
    const key = stylesheetKey(owner);
    const existing = this.stylesheets.get(owner);
    if (existing?.key === key && (!existing.failed || !retryFailed)) return;
    const active = this.sourceRequests.get(owner);
    if (active?.key === key) return active.promise;
    if (active) this._abortSourceRequest(owner);
    this._clearErrors(owner);
    if (existing?.key !== key) {
      existing?.companion?.remove();
      existing?.cssomHook?.restore();
      this.stylesheets.delete(owner);
      this._scheduleSourceApplication();
    }
    const request = {
      aborted: false,
      cancelWait: null,
      controller: owner.localName === "link"
        ? new this.document.defaultView.AbortController()
        : null,
      importCache: new Map(),
      importRecords: new Set(),
      key,
      promise: null,
      provenance: new Set(),
    };
    const task = this._runStylesheetRequest(owner, key, existing, request).finally(() => {
      this._releaseImportRequests(request);
      if (this.sourceRequests.get(owner) === request) this.sourceRequests.delete(owner);
    });
    request.promise = task;
    this.sourceRequests.set(owner, request);
    return task;
  }

  async _runStylesheetRequest(owner, key, existing, request) {
    let source;
    try {
      [source] = await Promise.all([
        this._source(owner, request),
        this._waitForLinkedStylesheet(owner, request),
      ]);
    } catch (error) {
      if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
        || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
      this._recordError(error, owner.href || "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: owner.href || this._ownerIdentity(owner),
      });
      this._writeFailedStylesheetRecord(owner, key);
      return;
    }
    if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
      || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
    let compiled;
    try {
      compiled = await this._compileSourceTree(source, owner, request);
      this.automaticCounters.sourceCompiles += 1;
    } catch (error) {
      if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
        || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
      this._recordError(error, owner.href || "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: error.cornerfillDiagnostic?.source ?? source.sourceUrl,
      });
      this._writeFailedStylesheetRecord(owner, key);
      return;
    }
    if (this.destroyed || request.aborted || this.sourceRequests.get(owner) !== request
      || !stylesheetElementIsEligible(owner) || stylesheetKey(owner) !== key) return;
    let cssomHook = null;
    try {
      cssomHook = compiled.imports > 0
        ? null
        : this._createCssomHook(owner, source.text, source.baseUrl);
      this._writeStylesheetRecord(owner, compiled, { key, existing, cssomHook });
    } catch (error) {
      cssomHook?.restore();
      this._recordError(error, owner.href || "inline stylesheet", {
        bucket: owner,
        ownerIdentity: this._ownerIdentity(owner),
        source: source.sourceUrl,
      });
      this._writeFailedStylesheetRecord(owner, key);
      return;
    }
    this._configureObservation();
    this._scheduleSourceApplication();
  }

  _processInline(element, stylesheetCandidate = false) {
    if (this.destroyed) return;
    if (!(element instanceof this.document.defaultView.HTMLElement)) return;
    const existing = this.inline.get(element);
    const currentAttribute = element.getAttribute("style") ?? "";
    if (existing?.appliedAttribute === currentAttribute) return;
    if (existing) {
      this._restoreInlineRecord(element, existing);
      this.inline.delete(element);
    }
    // Keep the exact bytes observed before touching CSSStyleDeclaration. WebKit
    // can drop the unsupported native declaration while we restore carriers.
    const authoredAttribute = currentAttribute;
    const compiled = inlineCarrierRecords(this.document, authoredAttribute);
    if (!compiled.shape && !stylesheetCandidate) {
      return;
    }
    if (compiled.declarations.length === 0) return;
    const declarations = compiled.declarations.map((declaration) => Object.freeze({
      ...declaration,
      previousValue: element.style.getPropertyValue(declaration.property),
      previousPriority: element.style.getPropertyPriority(declaration.property),
    }));
    for (const declaration of declarations) {
      element.style.setProperty(declaration.property, declaration.value, declaration.priority);
    }
    const record = Object.freeze({
      declarations: Object.freeze(declarations),
      shape: compiled.shape,
      signature: compiled.signature,
      authoredShape: compiled.authoredShape || existing?.authoredShape || "",
      appliedAttribute: "",
    });
    this._restoreAuthoredInlineShape(element, record);
    this.inline.set(element, Object.freeze({
      ...record,
      appliedAttribute: element.getAttribute("style") ?? "",
    }));
  }

  _restoreInlineRecord(element, record) {
    for (const declaration of record.declarations) {
      const currentValue = element.style.getPropertyValue(declaration.property);
      const currentPriority = element.style.getPropertyPriority(declaration.property);
      if (currentValue !== declaration.value || currentPriority !== declaration.priority) continue;
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

  _restoreAuthoredInlineShape(element, record) {
    if (!record.authoredShape) return;
    const authored = [];
    canonicalizeCornerShapeDeclarations(element.getAttribute("style") ?? "", authored);
    if (authored.length > 0) return;
    const current = element.getAttribute("style") ?? "";
    const separator = !current.trim() || current.trim().endsWith(";") ? "" : ";";
    element.setAttribute("style", `${current}${separator}${record.authoredShape}`);
  }

  *_styleRecords() {
    yield* this.stylesheets.values();
    yield* this.adoptedStylesheets.values();
  }

  _stylesheetCandidates() {
    const candidates = new Set();
    this.candidateProvenance.clear();
    for (const record of this._styleRecords()) {
      const selectorRecords = record.selectorRecords.length > 0
        ? record.selectorRecords
        : record.selectors.map((selector) => Object.freeze({
          source: record.sources[0],
          selector,
          declaration: null,
        }));
      for (const selectorRecord of selectorRecords) {
        try {
          for (const element of this.root.querySelectorAll(selectorRecord.selector)) {
            candidates.add(element);
            let provenance = this.candidateProvenance.get(element);
            if (!provenance) {
              provenance = [];
              this.candidateProvenance.set(element, provenance);
            }
            if (!provenance.some((candidate) => (
              candidate.source === selectorRecord.source
              && candidate.selector === selectorRecord.selector
              && candidate.declaration === selectorRecord.declaration
            ))) provenance.push(selectorRecord);
          }
        } catch (error) {
          this._recordError(error, `selector ${selectorRecord.selector}`, {
            bucket: record.owner,
            ownerIdentity: record.sources[0],
            source: selectorRecord.source,
            selector: selectorRecord.selector,
            declaration: selectorRecord.declaration,
          });
        }
      }
    }
    return candidates;
  }

  async _discoverSources(retryFailed = false) {
    if (this.destroyed) return;
    this.automaticCounters.sourcePasses += 1;
    const owners = stylesheetElements(this.root);
    const activeOwners = new Set(owners);
    for (const [owner, record] of this.stylesheets) {
      if (activeOwners.has(owner)) continue;
      this._abortSourceRequest(owner);
      this._clearErrors(owner);
      record.companion?.remove();
      record.cssomHook?.restore();
      this.stylesheets.delete(owner);
      this._scheduleSourceApplication();
    }
    await Promise.all(owners.map((owner) => this._processStylesheet(owner, retryFailed)));
    if (this.destroyed) return;
    for (const owner of owners) {
      const companion = this.stylesheets.get(owner)?.companion;
      if (companion && owner.nextSibling !== companion) owner.after(companion);
    }
    this._discoverAdoptedStylesheets(retryFailed);
    if (this.destroyed) return;
    if (this.sourceApplyPromise) await this.sourceApplyPromise;
    if (this.destroyed) return;
    this._configureObservation();
  }

  _reconcileCandidates() {
    if (this.destroyed) return false;
    this.automaticCounters.candidatePasses += 1;
    for (const [element] of this.inline) {
      if (element.isConnected) continue;
      const record = this.inline.get(element);
      this._restoreInlineRecord(element, record);
      this._restoreAuthoredInlineShape(element, record);
      this.inline.delete(element);
      this._clearErrors(element);
    }
    const stylesheetCandidates = this._stylesheetCandidates();
    const inlineCandidates = new Set([
      ...this.inline.keys(),
      ...authoredShapeInlineElements(this.root),
      ...[...stylesheetCandidates].filter((element) => element.hasAttribute?.("style")),
    ]);
    for (const element of inlineCandidates) {
      if (this.destroyed) return;
      this._processInline(element, stylesheetCandidates.has(element));
    }
    const candidates = new Set([...this.inline]
      .filter(([, record]) => record.shape)
      .map(([element]) => element));
    for (const element of stylesheetCandidates) candidates.add(element);
    for (const element of this.candidates) {
      if (!candidates.has(element)) this._clearErrors(element);
    }
    const changed = candidates.size !== this.candidates.size
      || [...candidates].some((element) => !this.candidates.has(element));
    this.candidates = candidates;
    return changed;
  }

  async _refreshAttachments() {
    if (this.native || this.destroyed) return;
    this.automaticCounters.attachmentPasses += 1;
    const candidates = this.candidates;
    const ready = [];
    for (const [element, handle] of [...this.handles]) {
      this.automaticCounters.computedChecks += 1;
      const computed = element.isConnected
        ? this.document.defaultView.getComputedStyle(element)
        : null;
      const problem = computed ? carrierProblem(computed) : null;
      if (candidates.has(element) && computed && hasShapeCarrier(computed) && !problem) {
        this._clearErrors(element);
        const signature = automaticComputedSignature(computed);
        if (this.handleSignatures.get(element) === signature) {
          try {
            handle.verify();
          } catch (error) {
            this._recordElementError(error, element);
            handle.dispose();
            this.handles.delete(element);
            this.handleSignatures.delete(element);
          }
          continue;
        }
        this.handleSignatures.set(element, signature);
        this.automaticCounters.handleRefreshes += 1;
        ready.push(handle.refresh().catch((error) => {
          this._recordElementError(error, element);
          handle.dispose();
          this.handles.delete(element);
          this.handleSignatures.delete(element);
        }));
        continue;
      }
      if (problem) this._recordElementError(new TypeError(problem), element);
      else this._clearErrors(element);
      handle.dispose();
      this.automaticCounters.handleDetaches += 1;
      this.handles.delete(element);
      this.handleSignatures.delete(element);
    }
    for (const element of candidates) {
      if (!(element instanceof this.document.defaultView.HTMLElement) || !element.isConnected) {
        this._clearErrors(element);
        continue;
      }
      if (this.handles.has(element)) continue;
      this.automaticCounters.computedChecks += 1;
      const computed = this.document.defaultView.getComputedStyle(element);
      const problem = carrierProblem(computed);
      if (problem) {
        this._recordElementError(new TypeError(problem), element);
        continue;
      }
      this._clearErrors(element);
      if (!hasShapeCarrier(computed)) continue;
      try {
        const handle = this.controller.attach(element, { dynamicCarriers: true });
        this.automaticCounters.handleAttaches += 1;
        this.handles.set(element, handle);
        this.handleSignatures.set(element, automaticComputedSignature(computed));
        ready.push(handle.ready.catch((error) => {
          this._recordElementError(error, element);
          handle.dispose();
          this.handles.delete(element);
          this.handleSignatures.delete(element);
        }));
      } catch (error) {
        this._recordElementError(error, element);
      }
    }
    await Promise.all(ready);
  }

  _observationDependencies() {
    const attributes = new Set(SOURCE_ATTRIBUTE_NAMES);
    const events = new Set();
    const mediaQueries = new Set();
    let characterData = false;
    let conservative = false;
    let hasSelectors = false;
    for (const record of this._styleRecords()) {
      if (record.selectors.length > 0) hasSelectors = true;
      for (const attribute of record.observation.attributes) attributes.add(attribute);
      for (const event of record.observation.events) events.add(event);
      for (const query of record.mediaQueries ?? []) mediaQueries.add(query);
      characterData ||= record.observation.characterData;
      conservative ||= record.observation.conservative;
    }
    if (conservative) {
      for (const event of CONSERVATIVE_STATE_EVENTS) events.add(event);
    }
    if (hasSelectors || this.inline.size > 0) events.add("resize");
    return Object.freeze({
      attributes: Object.freeze([...attributes].sort()),
      characterData,
      conservative,
      events: Object.freeze([...events].sort()),
      mediaQueries: Object.freeze([...mediaQueries].sort()),
    });
  }

  _handleMutations(records) {
    let sources = false;
    const relevant = records.map((record) => {
      if (record.type === "attributes") {
        if (record.attributeName === "data-cornerfill-owned"
          || record.attributeName === "data-cornerfill-owned-border"
          || record.attributeName === "data-cornerfill-owned-surface") return false;
        if (record.target.localName === "style" || record.target.localName === "link") {
          sources = true;
          return true;
        }
        if (record.attributeName !== "style") return true;
        const previous = automaticStyleMutationSignature(record.oldValue);
        const current = automaticStyleMutationSignature(record.target.getAttribute?.("style"));
        return previous !== current;
      }
      if (record.type === "characterData") {
        if (record.target.parentElement?.localName === "style") {
          sources = true;
          return true;
        }
        return this.observationState.characterData;
      }
      if (record.target.localName === "style") {
        sources = true;
        return true;
      }
      const nodes = [...record.addedNodes, ...record.removedNodes];
      const elements = nodes.filter((node) => (
        node.nodeType === this.document.defaultView.Node.ELEMENT_NODE
      ));
      if (elements.some((node) => (
        /^(?:style|link)$/u.test(node.localName)
        || Boolean(node.querySelector?.("style,link[rel~=stylesheet]"))
      ))) sources = true;
      return elements.length > 0 || (this.observationState.characterData && nodes.length > 0);
    }).some(Boolean);
    if (!relevant) return;
    this._queueRefresh({ sources, candidates: true, attachments: true });
  }

  _configureObservation() {
    if (!this.observer || !this.autoObserve) return;
    this.observationState = this._observationDependencies();
    this.observer.disconnect();
    const target = this.root === this.document ? this.document.documentElement : this.root;
    const options = {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      subtree: true,
    };
    if (!this.observationState.conservative) {
      options.attributeFilter = this.observationState.attributes;
    }
    this.observer.observe(target, options);
    for (const listener of this.eventListeners) {
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
    }
    this.eventListeners.length = 0;
    for (const { list, listener, legacy } of this.mediaListeners) {
      if (legacy) list.removeListener(listener);
      else list.removeEventListener("change", listener);
    }
    this.mediaListeners.length = 0;
    const eventRoot = this.root === this.document ? this.document : this.root;
    for (const type of this.observationState.events) {
      const listener = () => this._queueRefresh({ candidates: true, attachments: true });
      const windowEvent = ["hashchange", "popstate", "resize"].includes(type);
      const documentEvent = type === "fullscreenchange";
      const listenerTarget = windowEvent
        ? this.document.defaultView
        : documentEvent ? this.document : eventRoot;
      const listenerOptions = windowEvent ? Object.freeze({ passive: true }) : true;
      listenerTarget.addEventListener(type, listener, listenerOptions);
      this.eventListeners.push(Object.freeze({
        target: listenerTarget,
        type,
        listener,
        options: listenerOptions,
      }));
    }
    for (const query of this.observationState.mediaQueries) {
      const list = this.document.defaultView.matchMedia?.(query);
      if (!list) continue;
      const listener = () => this._queueRefresh({ candidates: true, attachments: true });
      if (typeof list.addEventListener === "function") {
        list.addEventListener("change", listener);
        this.mediaListeners.push(Object.freeze({ list, listener, legacy: false }));
      } else if (typeof list.addListener === "function") {
        list.addListener(listener);
        this.mediaListeners.push(Object.freeze({ list, listener, legacy: true }));
      }
    }
  }

  _installObserver() {
    if (!this.autoObserve || this.observer || !this.document.defaultView.MutationObserver) return;
    this.observer = new this.document.defaultView.MutationObserver((records) => (
      this._handleMutations(records)
    ));
    this._configureObservation();
  }

  async _start() {
    if (this.document.readyState === "loading") {
      await new Promise((resolve) => this.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }
    if (this.destroyed || this.native) return this.explain();
    this._ensureCarrierRegistration();
    const result = await this.refresh();
    this._installObserver();
    return result;
  }

  _queueRefresh({ sources = false, candidates = false, attachments = true } = {}) {
    if (this.destroyed || this.native) return;
    this.sourceRequested ||= sources;
    this.candidateRequested ||= candidates || sources;
    this.attachmentRequested ||= attachments || candidates || sources;
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    this.refreshFrame = this.document.defaultView.requestAnimationFrame(() => {
      this.refreshFrame = null;
      this.refreshQueued = false;
      this._requestRefresh().catch((error) => (
        this._recordError(error, "automatic refresh")
      ));
    });
  }

  _requestRefresh({
    sources = false,
    candidates = false,
    attachments = false,
    retryFailed = false,
  } = {}) {
    if (this.destroyed) return Promise.reject(new Error("Cornerfill auto controller is destroyed"));
    if (this.native) return Promise.resolve(this.explain());
    this.workRequested = true;
    this.sourceRequested ||= sources;
    this.candidateRequested ||= candidates || sources;
    this.attachmentRequested ||= attachments || candidates || sources;
    this.retryFailedRequested ||= retryFailed;
    if (this.sourceRequested) this._abortObsoleteSourceRequests();
    if (!this.refreshPromise) {
      const task = (async () => {
        while (this.workRequested && !this.destroyed) {
          this.workRequested = false;
          const shouldDiscover = this.sourceRequested;
          const shouldReconcile = this.candidateRequested || shouldDiscover;
          const shouldRefresh = this.attachmentRequested || shouldReconcile;
          const shouldRetryFailed = this.retryFailedRequested;
          this.sourceRequested = false;
          this.candidateRequested = false;
          this.attachmentRequested = false;
          this.retryFailedRequested = false;
          if (shouldDiscover) await this._discoverSources(shouldRetryFailed);
          if (this.destroyed) break;
          if (shouldReconcile) this._reconcileCandidates();
          if (this.destroyed) break;
          if (shouldRefresh) await this._refreshAttachments();
        }
        return this.explain();
      })();
      this.refreshPromise = task.finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  refresh(options = {}) {
    return this._requestRefresh({
      sources: true,
      candidates: true,
      attachments: true,
      retryFailed: options.retryFailed === true,
    });
  }

  refreshAdoptedStyleSheet(sheet, source) {
    if (!this.includeAdoptedStyleSheets) {
      return Promise.reject(new TypeError("This automatic scope did not opt in to adopted stylesheets"));
    }
    if (!this.root.adoptedStyleSheets.includes(sheet)) {
      return Promise.reject(new TypeError("The stylesheet is not adopted by this automatic scope"));
    }
    if (typeof source !== "string") {
      return Promise.reject(new TypeError("refreshAdoptedStyleSheet() requires the exact standard CSS source"));
    }
    this.adoptedStylesheetSources.set(sheet, source);
    return this.refresh();
  }

  registerRoot(root, options = {}) {
    if (this.destroyed) throw new Error("Cornerfill auto controller is destroyed");
    const ShadowRoot = this.document.defaultView.ShadowRoot;
    if (!(root instanceof ShadowRoot) || root.ownerDocument !== this.document) {
      throw new TypeError("Cornerfill automatic scopes require an open ShadowRoot in the same document");
    }
    if (root.host.shadowRoot !== root) {
      throw new TypeError("Cornerfill automatic scopes cannot register a closed ShadowRoot");
    }
    const existing = this.scopes.get(root);
    if (existing && !existing.destroyed) return existing;
    const scope = new CornerfillAutoController({
      document: this.document,
      root,
      controller: this.controller,
      parentAuto: this,
      nativeQualification: this.nativeQualification,
      nonce: options.nonce ?? this.nonce,
      autoObserve: options.autoObserve ?? this.autoObserve,
      adoptedStyleSheets: options.adoptedStyleSheets === true,
      onError: options.onError ?? this.onError,
    });
    this.scopes.set(root, scope);
    return scope;
  }

  unregisterRoot(root) {
    const scope = this.scopes.get(root);
    if (!scope) return false;
    scope.destroy();
    return true;
  }

  explain(element = null) {
    if (element) return this.handles.get(element)?.explain() ?? this.controller.explain(element);
    return Object.freeze({
      schema: "cornerfill-auto@1",
      mode: this.native ? "native" : "fallback",
      fallbackLoaded: true,
      attached: this.handles.size,
      stylesheets: this.stylesheets.size + this.adoptedStylesheets.size,
      inlineElements: this.inline.size,
      scopes: this.scopes.size,
      errors: this._errors(),
      nativeQualification: this.nativeQualification,
      decision: Object.freeze({
        selected: this.native ? "native" : "fallback",
        reason: this.native
          ? "native-requirements-satisfied"
          : this.nativeQualification.qualified
            ? "fallback-forced"
            : "native-requirements-unresolved",
        unresolvedNativeRequirements: this.nativeQualification.unresolved,
      }),
      implementation: Object.freeze({
        automaticDiscovery: this.native ? "BYPASSED_NATIVE" : "IMPLEMENTED",
        fallbackRenderer: this.native ? "NOT_LOADED" : "IMPLEMENTED",
      }),
      oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
      automatic: Object.freeze({
        ...AUTOMATIC_DISCOVERY,
        adoptedStylesheets: this.adoptedStylesheets.size,
        counters: Object.freeze({ ...this.automaticCounters }),
        observation: this.observationState,
        observing: this.autoObserve,
        observedSourceClassStyleStateAndViewportChanges: this.autoObserve,
      }),
      runtime: this.controller.stats(),
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const scope of [...this.scopes.values()]) scope.destroy();
    this.scopes.clear();
    this.observer?.disconnect();
    this.observer = null;
    for (const listener of this.eventListeners) {
      listener.target.removeEventListener(listener.type, listener.listener, listener.options);
    }
    this.eventListeners.length = 0;
    for (const { list, listener, legacy } of this.mediaListeners) {
      if (legacy) list.removeListener(listener);
      else list.removeEventListener("change", listener);
    }
    this.mediaListeners.length = 0;
    for (const handle of this.handles.values()) handle.dispose();
    this.handles.clear();
    this.handleSignatures.clear();
    this.candidates.clear();
    this.candidateProvenance.clear();
    for (const { companion, cssomHook } of this.stylesheets.values()) {
      companion?.remove();
      cssomHook?.restore();
    }
    this.stylesheets.clear();
    for (const { companion } of this.adoptedStylesheets.values()) companion?.remove();
    this.adoptedStylesheets.clear();
    for (const [element, record] of this.inline) {
      this._restoreInlineRecord(element, record);
      this._restoreAuthoredInlineShape(element, record);
    }
    this.inline.clear();
    this._releaseCarrierRegistration();
    if (this.refreshFrame !== null) this.document.defaultView.cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = null;
    for (const owner of [...this.sourceRequests.keys()]) this._abortSourceRequest(owner);
    for (const record of this.importRequests.values()) record.controller.abort();
    this.importRequests.clear();
    this.sourceApplyRequested = false;
    if (this.sourceApplyFrame !== null) {
      this.document.defaultView.cancelAnimationFrame(this.sourceApplyFrame);
    }
    this.sourceApplyFrame = null;
    const settleSourceApplyFrame = this.sourceApplyFrameResolve;
    this.sourceApplyFrameResolve = null;
    settleSourceApplyFrame?.();
    for (const controller of this.pendingFetches) controller.abort();
    this.pendingFetches.clear();
    for (const cancel of this.pendingStylesheetWaits) cancel();
    this.pendingStylesheetWaits.clear();
    this.diagnosticsByOwner.clear();
    if (this.parentAuto?.scopes.get(this.root) === this) this.parentAuto.scopes.delete(this.root);
    if (this.ownsController) this.controller.destroy();
  }
}

export function installCornerfillAuto(options = {}) {
  return new CornerfillAutoController(options);
}
