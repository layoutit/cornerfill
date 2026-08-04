export interface CssDeclarationToken {
  readonly property: string;
  readonly value: string;
}

export function decodeCssEscapes(value: string): string {
  return String(value).replaceAll(
    /\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|((?:\r\n|[\n\f\r]))|([\s\S]))/giu,
    (
      _source: string,
      hexadecimal: string | undefined,
      newline: string | undefined,
      character: string | undefined,
    ) => {
      if (newline) return "";
      if (!hexadecimal) return character ?? "";
      const codePoint = Number.parseInt(hexadecimal, 16);
      return codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? "\ufffd"
        : String.fromCodePoint(codePoint);
    },
  );
}

interface CssIdentifierParse {
  readonly end: number;
  readonly start: number;
  readonly value: string;
}

export function cssEscapeEnd(source: string, start: number): number {
  if (source[start] !== "\\") return -1;
  const first = source[start + 1];
  if (!first || /[\n\f\r]/u.test(first)) return -1;
  if (!/[0-9a-f]/iu.test(first)) return start + 2;
  let index = start + 1;
  let digits = 0;
  while (digits < 6 && /[0-9a-f]/iu.test(source[index] ?? "")) {
    index += 1;
    digits += 1;
  }
  if (source[index] === "\r" && source[index + 1] === "\n") return index + 2;
  if (/[\t\n\f\r ]/u.test(source[index] ?? "")) index += 1;
  return index;
}

function cssSyntaxEscapeEnd(source: string, start: number): number {
  const first = source[start + 1];
  if (!first) return start + 1;
  if (first === "\r" && source[start + 2] === "\n") return start + 3;
  if (/[\n\f\r]/u.test(first)) return start + 2;
  return cssEscapeEnd(source, start);
}

function cssNameStart(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return /[a-z_]/iu.test(character) || (codePoint !== undefined && codePoint >= 0x80);
}

function cssNameCharacter(character: string): boolean {
  return cssNameStart(character) || /[\d-]/u.test(character);
}

function consumeCssIdentifier(
  source: string,
  start: number,
): Readonly<CssIdentifierParse> | null {
  let index = start;
  const first = source[index] ?? "";
  if (first === "-") {
    index += 1;
    const next = source[index] ?? "";
    if (next === "\\") {
      const end = cssEscapeEnd(source, index);
      if (end < 0) return null;
      index = end;
    } else if (next === "-" || cssNameStart(next)) {
      index += 1;
    } else {
      return null;
    }
  } else if (first === "\\") {
    const end = cssEscapeEnd(source, index);
    if (end < 0) return null;
    index = end;
  } else if (cssNameStart(first)) {
    index += 1;
  } else {
    return null;
  }
  while (index < source.length) {
    const character = source[index]!;
    if (cssNameCharacter(character)) {
      index += 1;
      continue;
    }
    if (character !== "\\") break;
    const end = cssEscapeEnd(source, index);
    if (end < 0) break;
    index = end;
  }
  return Object.freeze({
    start,
    end: index,
    value: decodeCssEscapes(source.slice(start, index)),
  });
}

export function skipCssTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (/[\t\n\f\r ]/u.test(source[index]!)) {
      index += 1;
      continue;
    }
    if (source[index] !== "/" || source[index + 1] !== "*") break;
    const end = source.indexOf("*/", index + 2);
    if (end < 0) return source.length;
    index = end + 2;
  }
  return index;
}

export function wholeCssIdentifier(source: string): Readonly<CssIdentifierParse> | null {
  const start = skipCssTrivia(source, 0);
  const identifier = consumeCssIdentifier(source, start);
  return identifier && skipCssTrivia(source, identifier.end) === source.length ? identifier : null;
}

export function validCssLayerName(source: string): boolean {
  let cursor = 0;
  let segments = 0;
  while (cursor < source.length) {
    cursor = skipCssTrivia(source, cursor);
    const identifier = consumeCssIdentifier(source, cursor);
    if (!identifier) return false;
    segments += 1;
    cursor = skipCssTrivia(source, identifier.end);
    if (cursor >= source.length) return segments > 0;
    if (source[cursor] !== ".") return false;
    cursor += 1;
  }
  return false;
}

function normalizedProperty(value: string): string {
  return wholeCssIdentifier(value)?.value.toLowerCase() ?? "";
}

type CssSyntaxVisitor = (
  index: number,
  character: string,
  parentheses: number,
  brackets: number,
  blocks: number,
) => boolean | void;

export function scanCssSyntax(
  source: string,
  start: number,
  visit: CssSyntaxVisitor,
  terminalSemicolon = false,
): void {
  let quote: "\"" | "'" | null = null;
  let comment = false;
  let parentheses = 0;
  let brackets = 0;
  let blocks = 0;
  const end = source.length + Number(terminalSemicolon);
  for (let index = start; index < end; index += 1) {
    const character = index === source.length ? ";" : source[index]!;
    const next = source[index + 1];
    if (comment && index === source.length) comment = false;
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index = cssSyntaxEscapeEnd(source, index) - 1;
      } else if (character === quote) quote = null;
      continue;
    }
    if (character === "\\") {
      index = cssSyntaxEscapeEnd(source, index) - 1;
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
    if (visit(index, character, parentheses, brackets, blocks) === false) return;
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets = Math.max(0, brackets - 1);
    else if (character === "{") blocks += 1;
    else if (character === "}") blocks = Math.max(0, blocks - 1);
  }
}

export function wholeCssFunction(
  source: string,
): Readonly<{ body: string; name: string }> | null {
  const start = skipCssTrivia(source, 0);
  const identifier = consumeCssIdentifier(source, start);
  if (!identifier || source[identifier.end] !== "(") return null;
  let end = -1;
  scanCssSyntax(source, identifier.end, (index, character, parentheses) => {
    if (character === ")" && parentheses === 1) {
      end = index;
      return false;
    }
  });
  if (end < 0 || skipCssTrivia(source, end + 1) !== source.length) return null;
  return Object.freeze({
    name: identifier.value,
    body: source.slice(identifier.end + 1, end),
  });
}

export function cssDeclarations(source: unknown): readonly Readonly<CssDeclarationToken>[] {
  const text = String(source ?? "");
  const declarations: Readonly<CssDeclarationToken>[] = [];
  let start = 0;
  let colon = -1;
  const commit = (end: number) => {
    if (colon < start) return;
    const property = normalizedProperty(text.slice(start, colon));
    if (!property) return;
    declarations.push(Object.freeze({
      property,
      value: text.slice(colon + 1, end).trim(),
    }));
  };
  scanCssSyntax(text, 0, (index, character, parentheses, brackets, blocks) => {
    if (parentheses === 0 && brackets === 0 && blocks === 0) {
      if (character === ":" && colon < start) colon = index;
      else if (character === ";") {
        commit(index);
        start = index + 1;
        colon = -1;
      }
    }
  }, true);
  return Object.freeze(declarations);
}

export function cssDeclarationSignature(
  source: unknown,
  include: (property: string) => boolean,
): string {
  return cssDeclarations(source)
    .filter(({ property }) => include(property))
    .map(({ property, value }) => `${property}:${value}`)
    .join(";");
}
