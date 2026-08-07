import { parseCornerShape, parseCornerShapeValue } from "./values.mjs";
import {
  cssFunctions,
  cssIdentifierAt,
  cssWideKeyword,
  scanCssSyntax,
  skipCssTrivia,
  wholeCssIdentifier,
} from "./css-syntax.mjs";
import { isShapeProperty } from "./carrier-contract.mjs";

interface TextReplacement {
  readonly end: number;
  readonly start: number;
  readonly value: string;
}

interface SupportsParenthesis {
  close: number;
  colon: number;
  readonly children: SupportsParenthesis[];
  invalid: boolean;
  readonly open: number;
}

type SupportsWindow = Pick<Window & typeof globalThis, "CSS">;

function supportsParentheses(source: string): readonly Readonly<SupportsParenthesis>[] {
  const roots: SupportsParenthesis[] = [];
  const stack: SupportsParenthesis[] = [];
  scanCssSyntax(source, 0, (index, character, _parentheses, brackets, blocks) => {
    if (character === "(") {
      const node: SupportsParenthesis = {
        open: index,
        close: -1,
        colon: -1,
        children: [],
        invalid: false,
      };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      else roots.push(node);
      stack.push(node);
    } else if (character === ")") {
      const node = stack.pop();
      if (node) node.close = index;
    } else {
      const node = stack[stack.length - 1];
      if (!node || brackets !== 0 || blocks !== 0) return;
      if (character === ":" && node.colon < 0) node.colon = index;
      else if (character === ";" || character === "{" || character === "}") node.invalid = true;
    }
  });
  return Object.freeze(roots);
}

function supportDeclaration(
  source: string,
  node: Readonly<SupportsParenthesis>,
): Readonly<{ property: string; value: string }> | null {
  if (node.invalid || node.colon < 0 || node.close < 0) return null;
  const property = wholeCssIdentifier(source.slice(node.open + 1, node.colon))?.value.toLowerCase();
  const value = source.slice(node.colon + 1, node.close).trim();
  return property && value ? Object.freeze({ property, value }) : null;
}

function supportsShapeValue(property: string, value: string): boolean {
  if (cssWideKeyword(value)) return true;
  if (cssFunctions(value).some(({ name }) => name === "env" || name === "var")) return true;
  try {
    if (property === "corner-shape") parseCornerShape(value);
    else parseCornerShapeValue(value);
    return true;
  } catch {
    return false;
  }
}

function analyzeSupportsCondition(source: string): Readonly<{
  replacements: readonly Readonly<TextReplacement>[];
  testsShape: boolean;
}> {
  const functionOpenings = new Set(cssFunctions(source).map(({ open }) => open));
  const replacements: TextReplacement[] = [];
  let testsShape = false;
  const pending = [...supportsParentheses(source)].reverse();
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.close < 0) continue;
    const declaration = supportDeclaration(source, node);
    if (declaration) {
      if (isShapeProperty(declaration.property)) {
        testsShape = true;
        const { property, value } = declaration;
        const cssWide = cssWideKeyword(value);
        if (cssWide === "revert-rule") {
          replacements.push(Object.freeze({
            start: node.open + 1,
            end: node.close,
            value: `all:${value}`,
          }));
        } else if (supportsShapeValue(property, value)) {
          replacements.push(Object.freeze({
            start: node.open + 1,
            end: node.close,
            value: `--cornerfill-supports-${property}:${value}`,
          }));
        }
      }
      continue;
    }
    if (functionOpenings.has(node.open)) continue;
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      pending.push(node.children[index]!);
    }
  }
  return Object.freeze({ replacements: Object.freeze(replacements), testsShape });
}

function applyReplacements(source: string, replacements: readonly Readonly<TextReplacement>[]): string {
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

function normalizeSupportsCondition(condition: string): string {
  const source = String(condition).trim();
  const start = skipCssTrivia(source, 0);
  const leading = cssIdentifierAt(source, start)?.value.toLowerCase();
  return source[start] === "(" || leading === "not" ? source : `(${source})`;
}

export function rewriteCornerShapeSupportsCondition(condition: string): string {
  const source = String(condition);
  return applyReplacements(source, analyzeSupportsCondition(source).replacements);
}

export function supportsConditionTestsShape(condition: string): boolean {
  return analyzeSupportsCondition(normalizeSupportsCondition(condition)).testsShape;
}

export function carrierSupportsHeader(header: string): string {
  return rewriteCornerShapeSupportsCondition(header);
}

export function carrierSupportsCondition(condition: string): string {
  return rewriteCornerShapeSupportsCondition(normalizeSupportsCondition(condition));
}

export function evaluateSupportsCondition(
  view: SupportsWindow,
  condition: string,
): Readonly<{
  auditOnly: boolean;
  carrierMatches: boolean;
  nativeMatches: boolean;
  testsShape: boolean;
  truthDiffers: boolean;
}> {
  const normalized = normalizeSupportsCondition(condition);
  const nativeMatches = view.CSS.supports(normalized);
  const carrierMatches = view.CSS.supports(carrierSupportsCondition(normalized));
  return Object.freeze({
    auditOnly: nativeMatches && !carrierMatches,
    carrierMatches,
    nativeMatches,
    testsShape: supportsConditionTestsShape(normalized),
    truthDiffers: nativeMatches !== carrierMatches,
  });
}
