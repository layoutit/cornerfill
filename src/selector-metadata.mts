import {
  cssIdentifierAt,
  replaceCssCommentsWithWhitespace,
  scanCssSyntax,
  skipCssTrivia,
} from "./css-syntax.mjs";
import type { SelectorInvalidation, SelectorObservation } from "./carrier-contract.mjs";

const SELECTOR_STATE_EVENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  hover: Object.freeze(["pointerover", "pointerout"]),
  focus: Object.freeze(["focusin", "focusout"]),
  "focus-visible": Object.freeze(["focusin", "focusout"]),
  "focus-within": Object.freeze(["focusin", "focusout"]),
  disabled: Object.freeze(["input", "change"]),
  enabled: Object.freeze(["input", "change"]),
  optional: Object.freeze(["input", "change"]),
  required: Object.freeze(["input", "change"]),
  modal: Object.freeze(["toggle"]),
  open: Object.freeze(["toggle"]),
  "popover-open": Object.freeze(["toggle"]),
  fullscreen: Object.freeze(["fullscreenchange"]),
});

const STATIC_SELECTOR_PSEUDOS = new Set<string>([
  "any-link", "empty", "first-child", "first-of-type", "has", "host", "host-context", "is", "lang",
  "last-child", "last-of-type", "link", "not", "nth-child", "nth-last-child",
  "nth-last-of-type", "nth-of-type", "only-child", "only-of-type",
  "root", "scope", "where",
]);

const PARENT_SENSITIVE_PSEUDOS = new Set([
  "empty", "first-child", "first-of-type", "last-child", "last-of-type", "nth-child",
  "nth-last-child", "nth-last-of-type", "nth-of-type", "only-child", "only-of-type",
]);
const ROOT_SENSITIVE_PSEUDOS = new Set(["focus-within", "has", "host-context"]);
const INVALIDATION_RANK: Readonly<Record<SelectorInvalidation, number>> = Object.freeze({
  self: 0,
  subtree: 1,
  parent: 2,
  root: 3,
});

function strongerInvalidation(
  current: SelectorInvalidation,
  next: SelectorInvalidation,
): SelectorInvalidation {
  return INVALIDATION_RANK[next] > INVALIDATION_RANK[current] ? next : current;
}

export function selectorObservation(selectors: Iterable<string>): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  const unobservableStates = new Set<string>();
  let characterData = false;
  let conservative = false;
  let invalidation: SelectorInvalidation = "self";
  for (const rawSelector of selectors) {
    const selector = replaceCssCommentsWithWhitespace(rawSelector);
    let previousSignificant = "";
    let pendingWhitespace = false;
    scanCssSyntax(selector, 0, (index, character, parentheses, brackets) => {
      if (brackets !== 0) return;
      if (/\s/u.test(character)) {
        pendingWhitespace = true;
        return;
      }
      if (pendingWhitespace) {
        if (previousSignificant
          && !"(,[>+~|".includes(previousSignificant)
          && !"),[>+~|".includes(character)) {
          invalidation = strongerInvalidation(invalidation, "subtree");
        }
        pendingWhitespace = false;
      }
      if (character === ">") invalidation = strongerInvalidation(invalidation, "subtree");
      else if (character === "+" || character === "~" || character === "|") {
        invalidation = strongerInvalidation(invalidation, "parent");
      }
      previousSignificant = character;
      if (character === ".") {
        attributes.add("class");
        return;
      }
      if (character === "#") {
        attributes.add("id");
        return;
      }
      if (character === "[") {
        const name = cssIdentifierAt(selector, skipCssTrivia(selector, index + 1));
        if (name) attributes.add(name.value.toLowerCase());
        else conservative = true;
        return;
      }
      if (character !== ":" || selector[index - 1] === ":" || selector[index + 1] === ":") return;
      const name = cssIdentifierAt(selector, index + 1);
      if (!name) {
        conservative = true;
        return;
      }
      const pseudo = name.value.toLowerCase();
      if (PARENT_SENSITIVE_PSEUDOS.has(pseudo)) {
        invalidation = strongerInvalidation(invalidation, "parent");
      } else if (ROOT_SENSITIVE_PSEUDOS.has(pseudo)) {
        invalidation = "root";
      }
      const stateEvents = SELECTOR_STATE_EVENTS[pseudo];
      if (stateEvents) {
        for (const event of stateEvents) events.add(event);
        if (["checked", "default", "disabled", "enabled", "required", "optional"].includes(pseudo)) {
          attributes.add(pseudo === "enabled" ? "disabled" : pseudo);
        }
        if (["modal", "open"].includes(pseudo)) attributes.add("open");
        if (pseudo === "popover-open") attributes.add("popover");
        return;
      }
      if (pseudo === "dir") attributes.add("dir");
      else if (pseudo === "lang") attributes.add("lang");
      else if (pseudo === "empty") characterData = true;
      else if (["any-link", "link"].includes(pseudo)) attributes.add("href");
      else if (!STATIC_SELECTOR_PSEUDOS.has(pseudo)) unobservableStates.add(pseudo);
      void parentheses;
    });
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    characterData,
    conservative,
    events: Object.freeze([...events].sort()),
    invalidation,
    unobservableStates: Object.freeze([...unobservableStates].sort()),
  });
}

export function mergeSelectorObservation(
  records: Iterable<Readonly<SelectorObservation>>,
): Readonly<SelectorObservation> {
  const attributes = new Set<string>();
  const events = new Set<string>();
  const unobservableStates = new Set<string>();
  let characterData = false;
  let conservative = false;
  let invalidation: SelectorInvalidation = "self";
  for (const record of records) {
    for (const attribute of record.attributes) attributes.add(attribute);
    for (const event of record.events) events.add(event);
    for (const state of record.unobservableStates) unobservableStates.add(state);
    characterData ||= record.characterData;
    conservative ||= record.conservative;
    invalidation = strongerInvalidation(invalidation, record.invalidation);
  }
  return Object.freeze({
    attributes: Object.freeze([...attributes].sort()),
    characterData,
    conservative,
    events: Object.freeze([...events].sort()),
    invalidation,
    unobservableStates: Object.freeze([...unobservableStates].sort()),
  });
}
