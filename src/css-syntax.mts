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

function normalizedProperty(value: string): string {
  return decodeCssEscapes(value.replaceAll(/\/\*[\s\S]*?\*\//gu, " "))
    .replaceAll(/\s/gu, "")
    .toLowerCase();
}

export function cssDeclarations(source: unknown): readonly Readonly<CssDeclarationToken>[] {
  const text = String(source ?? "");
  const declarations: Readonly<CssDeclarationToken>[] = [];
  let quote: "\"" | "'" | null = null;
  let comment = false;
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;
  let blocks = 0;
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
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index] ?? ";";
    const next = text[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
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
    else if (character === "{") blocks += 1;
    else if (character === "}") blocks = Math.max(0, blocks - 1);
    else if (parentheses === 0 && brackets === 0 && blocks === 0) {
      if (character === ":" && colon < start) colon = index;
      else if (character === ";") {
        commit(index);
        start = index + 1;
        colon = -1;
      }
    }
  }
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
