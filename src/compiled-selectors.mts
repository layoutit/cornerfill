import {
  cssIdentifierAt,
  replaceCssCommentsWithWhitespace,
  scanCssSyntax,
  skipCssTrivia,
} from "./css-syntax.mjs";
import { compiledHostContextAttribute } from "./carrier-contract.mjs";

export interface CompiledHostContext {
  readonly argument: string;
  readonly attribute: string;
}

export interface CompiledSelectorPlan {
  readonly documentSelectors: readonly string[];
  readonly elementSelectors: readonly string[];
  readonly hostCandidate: boolean;
  readonly hostContext: boolean;
  readonly hostContexts: readonly Readonly<CompiledHostContext>[];
  readonly hostDependent: boolean;
}

function selectorBranches(selector: string): readonly string[] {
  const branches: string[] = [];
  let start = 0;
  scanCssSyntax(selector, 0, (index, character, parentheses, brackets) => {
    if (character !== "," || parentheses !== 0 || brackets !== 0) return;
    branches.push(selector.slice(start, index).trim());
    start = index + 1;
  });
  branches.push(selector.slice(start).trim());
  if (branches.some((branch) => !branch)) throw new SyntaxError("selector contains an empty branch");
  return Object.freeze(branches);
}

function matchingParenthesis(source: string, open: number): number {
  let close = -1;
  scanCssSyntax(source, open, (index, character, parentheses) => {
    if (character !== ")" || parentheses !== 1) return;
    close = index;
    return false;
  });
  return close;
}

function containsHostPseudo(selector: string): boolean {
  let found = false;
  scanCssSyntax(selector, 0, (index, character) => {
    if (character !== ":" || selector[index + 1] === ":") return;
    const pseudo = cssIdentifierAt(selector, index + 1)?.value.toLowerCase();
    if (pseudo === "host" || pseudo === "host-context") {
      found = true;
      return false;
    }
  });
  return found;
}

function validHostContextArgument(argument: string): boolean {
  const selector = replaceCssCommentsWithWhitespace(argument).trim();
  if (!selector) return false;
  let previous = "";
  let whitespace = false;
  let valid = true;
  scanCssSyntax(selector, 0, (_index, character, parentheses, brackets) => {
    if (parentheses !== 0 || brackets !== 0) return;
    if (/\s/u.test(character)) {
      whitespace = true;
      return;
    }
    if (whitespace && previous && !"([".includes(previous)) {
      valid = false;
      return false;
    }
    whitespace = false;
    if (character === "," || character === ">" || character === "+" || character === "~") {
      valid = false;
      return false;
    }
    if (character === "|" && previous === "|") {
      valid = false;
      return false;
    }
    previous = character;
  });
  return valid;
}

function hostBranch(branch: string): Readonly<{
  elementSelector: string | null;
  hostCandidate: boolean;
  hostContext: boolean;
  hostContextArgument: string | null;
  suffix: string;
}> | null {
  const start = skipCssTrivia(branch, 0);
  if (branch[start] !== ":") return null;
  const identifier = cssIdentifierAt(branch, start + 1);
  const name = identifier?.value.toLowerCase();
  if (!identifier || (name !== "host" && name !== "host-context")) return null;
  let end = identifier.end;
  let hostContextArgument: string | null = null;
  if (branch[end] === "(") {
    const close = matchingParenthesis(branch, end);
    const argument = close < 0 ? "" : branch.slice(end + 1, close).trim();
    if (close < 0 || !argument) {
      throw new SyntaxError(`invalid :${name}() selector`);
    }
    if (name === "host-context") {
      if (!validHostContextArgument(argument)) {
        throw new SyntaxError(":host-context() requires one compound selector");
      }
      hostContextArgument = argument;
    }
    end = close + 1;
  } else if (name === "host-context") {
    throw new SyntaxError(":host-context() requires an argument");
  }
  const rest = branch.slice(end);
  if (containsHostPseudo(rest)) {
    throw new SyntaxError("multiple or nested shadow host pseudos are not representable");
  }
  if (!rest.trim()) {
    return Object.freeze({
      elementSelector: null,
      hostCandidate: true,
      hostContext: name === "host-context",
      hostContextArgument,
      suffix: rest,
    });
  }
  const leadingWhitespace = /^\s/u.test(rest);
  const trimmed = rest.trimStart();
  if (!leadingWhitespace && !/^[>+~]/u.test(trimmed)) {
    throw new SyntaxError("tokens after :host() must begin a descendant or child branch");
  }
  const elementSelector = trimmed.replace(/^[>+~]\s*/u, "").trim();
  if (!elementSelector) throw new SyntaxError("shadow host selector has no element branch");
  return Object.freeze({
    elementSelector,
    hostCandidate: false,
    hostContext: name === "host-context",
    hostContextArgument,
    suffix: rest,
  });
}

export function compiledSelectorPlan(selectors: Iterable<string>): Readonly<CompiledSelectorPlan> {
  const documentSelectors = new Set<string>();
  const elementSelectors = new Set<string>();
  let hostCandidate = false;
  let hostContext = false;
  let hostDependent = false;
  const hostContexts = new Map<string, Readonly<CompiledHostContext>>();
  for (const selector of selectors) {
    for (const branch of selectorBranches(selector)) {
      const host = hostBranch(branch);
      if (host) {
        hostDependent = true;
        if (host.elementSelector) elementSelectors.add(host.elementSelector);
        hostCandidate ||= host.hostCandidate;
        hostContext ||= host.hostContext;
        if (host.hostContextArgument) {
          const attribute = compiledHostContextAttribute(host.hostContextArgument);
          const existing = hostContexts.get(attribute);
          if (existing && existing.argument !== host.hostContextArgument) {
            throw new SyntaxError("compiled :host-context() marker hash collision");
          }
          hostContexts.set(attribute, Object.freeze({
            argument: host.hostContextArgument,
            attribute,
          }));
        }
        continue;
      }
      if (containsHostPseudo(branch)) {
        throw new SyntaxError("shadow host pseudos must lead their selector branch");
      }
      documentSelectors.add(branch);
      elementSelectors.add(branch);
    }
  }
  return Object.freeze({
    documentSelectors: Object.freeze([...documentSelectors].sort()),
    elementSelectors: Object.freeze([...elementSelectors].sort()),
    hostCandidate,
    hostContext,
    hostContexts: Object.freeze([...hostContexts.values()].sort((left, right) => (
      left.attribute.localeCompare(right.attribute)
    ))),
    hostDependent,
  });
}

export function compiledHostContextFallbackSelectors(selector: string): readonly string[] {
  const selectors: string[] = [];
  for (const branch of selectorBranches(selector)) {
    const host = hostBranch(branch);
    if (!host?.hostContextArgument) continue;
    const attribute = compiledHostContextAttribute(host.hostContextArgument);
    selectors.push(
      `:host(:where([${attribute}]):is(${host.hostContextArgument},:where([${attribute}])))${host.suffix}`,
    );
  }
  return Object.freeze(selectors);
}
