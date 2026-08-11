import {
  cssIdentifierAt,
  cssEscapeEnd,
  replaceCssCommentsWithWhitespace,
  scanCssSyntax,
  skipCssTrivia,
  wholeCssFunction,
  wholeCssIdentifier,
} from "./css-syntax.mjs";

const CORNER_COUNT = 4;

export type Four<T> = readonly [T, T, T, T];
export type CornerDirection = "ltr" | "rtl";
export type CornerTextOrientation = "mixed" | "upright" | "sideways";
export type CornerWritingMode =
  | "horizontal-tb"
  | "vertical-rl"
  | "vertical-lr"
  | "sideways-rl"
  | "sideways-lr";
export type PhysicalCorner = "top-left" | "top-right" | "bottom-right" | "bottom-left";
export type LogicalCorner = "start-start" | "start-end" | "end-end" | "end-start";

type PhysicalRadiusDeclaration = PhysicalCorner | `border-${PhysicalCorner}-radius`;
type LogicalRadiusDeclaration = LogicalCorner | `border-${LogicalCorner}-radius`;
type PhysicalShapeDeclaration = PhysicalCorner | `corner-${PhysicalCorner}-shape`;
type LogicalShapeDeclaration = LogicalCorner | `corner-${LogicalCorner}-shape`;

export interface LengthPercentage {
  readonly px: number;
  readonly percent: number;
  readonly source: string;
}

export interface ParsedCornerRadius {
  readonly rx: LengthPercentage;
  readonly ry: LengthPercentage;
}

export interface ResolvedCornerRadius {
  readonly rx: number;
  readonly ry: number;
}

export interface CornerWritingOptions {
  readonly direction?: CornerDirection;
  readonly textOrientation?: CornerTextOrientation;
  readonly writingMode?: CornerWritingMode;
}

export interface BorderRadiusDeclarations extends CornerWritingOptions {
  readonly shorthand?: string;
  readonly physical?: Readonly<Partial<Record<PhysicalRadiusDeclaration, string>>>;
  readonly logical?: Readonly<Partial<Record<LogicalRadiusDeclaration, string>>>;
}

export interface CornerShapeDeclarations extends CornerWritingOptions {
  readonly shorthand?: string;
  readonly physical?: Readonly<Partial<Record<PhysicalShapeDeclaration, string>>>;
  readonly logical?: Readonly<Partial<Record<LogicalShapeDeclaration, string>>>;
}

export type CornerShapeSource = string | Four<number> | CornerShapeDeclarations;

type PhysicalSide = "top" | "right" | "bottom" | "left";

export const CORNER_SHAPE_PARAMETERS = Object.freeze({
  notch: Number.NEGATIVE_INFINITY,
  scoop: -1,
  bevel: 0,
  round: 1,
  squircle: 2,
  square: Number.POSITIVE_INFINITY,
});

function syntaxError(label: string, value: unknown, detail: string): SyntaxError {
  return new SyntaxError(`${label} ${detail}: ${JSON.stringify(value)}`);
}

function scanTopLevel(
  value: string,
  onCharacter: (character: string, index: number, depth: number) => void,
): void {
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === "\\") {
      if (!quote) onCharacter(character, index, depth);
      const end = cssEscapeEnd(value, index);
      if (end > index) index = end - 1;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      onCharacter(character, index, depth);
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth < 0) throw syntaxError("CSS value", value, "has an unmatched closing parenthesis");
    }
    onCharacter(character, index, depth);
  }
  if (quote) throw syntaxError("CSS value", value, "has an unterminated string");
  if (depth !== 0) throw syntaxError("CSS value", value, "has unbalanced parentheses");
}

export function splitTopLevelWhitespace(input: string): readonly string[] {
  const value = replaceCssCommentsWithWhitespace(String(input)).trim();
  if (!value) return Object.freeze([]);
  const parts = [];
  let start = 0;
  let tokenOpen = false;
  scanTopLevel(value, (character, index, depth) => {
    if (/\s/u.test(character) && depth === 0) {
      if (tokenOpen) parts.push(value.slice(start, index));
      tokenOpen = false;
    } else if (!tokenOpen) {
      start = index;
      tokenOpen = true;
    }
  });
  if (tokenOpen) parts.push(value.slice(start));
  return Object.freeze(parts);
}

export function splitTopLevelCommas(input: string): readonly string[] {
  const value = replaceCssCommentsWithWhitespace(String(input)).trim();
  if (!value) return Object.freeze([]);
  const parts = [];
  let start = 0;
  scanTopLevel(value, (character, index, depth) => {
    if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  });
  parts.push(value.slice(start).trim());
  if (parts.some((part) => !part)) throw syntaxError("CSS list", value, "contains an empty item");
  return Object.freeze(parts);
}

function splitTopLevelSlash(input: string): readonly [string] | readonly [string, string] {
  const value = replaceCssCommentsWithWhitespace(String(input)).trim();
  const slashIndexes: number[] = [];
  scanTopLevel(value, (character, index, depth) => {
    if (character === "/" && depth === 0) slashIndexes.push(index);
  });
  if (slashIndexes.length > 1) throw syntaxError("border-radius", value, "contains more than one top-level slash");
  if (slashIndexes.length === 0) return Object.freeze([value]);
  const slashIndex = slashIndexes[0]!;
  return Object.freeze([
    value.slice(0, slashIndex).trim(),
    value.slice(slashIndex + 1).trim(),
  ]);
}

function freezeLengthPercentage(px: number, percent: number, source: string): Readonly<LengthPercentage> {
  return Object.freeze({ px, percent, source });
}

const NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const SIMPLE_LENGTH_PERCENTAGE = new RegExp(`^([+-]?${NUMBER})(px|%)?$`, "iu");

interface AdditiveCalcTerm {
  readonly number: number;
  readonly unit: string;
}

function additiveCalcTerms(
  expression: string,
  source: string,
  label: string,
): readonly Readonly<AdditiveCalcTerm>[] {
  const firstPattern = new RegExp(`\\s*([+-]?)(${NUMBER})(px|%)?`, "iuy");
  const first = firstPattern.exec(expression);
  if (!first) throw syntaxError(label, source, "uses unsupported calc() arithmetic");
  const terms: Readonly<AdditiveCalcTerm>[] = [Object.freeze({
    number: Number(`${first[1]}${first[2]}`),
    unit: (first[3] ?? "").toLowerCase(),
  })];
  let cursor = first[0].length;
  const next = new RegExp(`\\s+([+-])\\s+([+-]?)(${NUMBER})(px|%)?`, "iuy");
  while (cursor < expression.length) {
    let trailing = cursor;
    while (/\s/u.test(expression[trailing] ?? "")) trailing += 1;
    if (trailing === expression.length) {
      cursor = expression.length;
      break;
    }
    next.lastIndex = cursor;
    const match = next.exec(expression);
    if (!match) throw syntaxError(label, source, "uses unsupported calc() arithmetic");
    const binarySign = match[1] === "-" ? -1 : 1;
    terms.push(Object.freeze({
      number: binarySign * Number(`${match[2]}${match[3]}`),
      unit: (match[4] ?? "").toLowerCase(),
    }));
    cursor = next.lastIndex;
  }
  return Object.freeze(terms);
}

export function parseLengthPercentage(
  input: string,
  { label = "length-percentage" }: { label?: string } = {},
): Readonly<LengthPercentage> {
  const source = String(input).trim();
  const syntax = replaceCssCommentsWithWhitespace(source).trim();
  const simple = SIMPLE_LENGTH_PERCENTAGE.exec(syntax);
  if (simple) {
    const number = Number(simple[1]);
    const unit = (simple[2] ?? "").toLowerCase();
    if (!Number.isFinite(number) || (!unit && number !== 0)) {
      throw syntaxError(label, source, "requires px, %, or unitless zero");
    }
    return freezeLengthPercentage(unit === "%" ? 0 : number, unit === "%" ? number / 100 : 0, source);
  }

  const match = /^calc\((.*)\)$/isu.exec(syntax);
  if (!match) throw syntaxError(label, source, "is outside the supported px/% syntax");
  const expression = match[1]!;
  if (!expression.trim()) throw syntaxError(label, source, "contains an empty calc()");
  let px = 0;
  let percent = 0;
  for (const term of additiveCalcTerms(expression, source, label)) {
    const { number, unit } = term;
    if (!Number.isFinite(number) || (!unit && number !== 0)) {
      throw syntaxError(label, source, "requires px, %, or unitless zero terms");
    }
    if (unit === "%") percent += number / 100;
    else px += number;
  }
  if (!Number.isFinite(px) || !Number.isFinite(percent)) {
    throw syntaxError(label, source, "overflows the supported numeric range");
  }
  return freezeLengthPercentage(px, percent, source);
}

export function resolveLengthPercentage(
  value: string | LengthPercentage,
  reference: number,
): number {
  if (!Number.isFinite(reference) || reference < 0) {
    throw new TypeError("length-percentage reference must be a finite non-negative number");
  }
  const parsed = typeof value === "string" ? parseLengthPercentage(value) : value;
  if (!parsed || !Number.isFinite(parsed.px) || !Number.isFinite(parsed.percent)) {
    throw new TypeError("invalid parsed length-percentage");
  }
  const result = parsed.px + parsed.percent * reference;
  if (!Number.isFinite(result)) {
    throw new RangeError("resolved length-percentage exceeds the finite numeric range");
  }
  return result;
}

function expandFour<T>(values: readonly T[], label: string): Four<T> {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) {
    throw new SyntaxError(`${label} requires one through four values`);
  }
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return [values[0], values[1], values[2], values[3]];
}

function parseRadiusAxis(input: string, label: string): Four<Readonly<LengthPercentage>> {
  const tokens = splitTopLevelWhitespace(input);
  if (tokens.length < 1 || tokens.length > 4) {
    throw syntaxError("border-radius", input, `${label} axis requires one through four values`);
  }
  return expandFour(tokens.map((token, index) => parseRadiusLengthPercentage(token, {
    label: `border-radius ${label} value ${index + 1}`,
  })), `border-radius ${label}`);
}

function parseRadiusLengthPercentage(
  input: string,
  options: { label?: string } = {},
): Readonly<LengthPercentage> {
  const source = String(input).trim();
  const parsed = parseLengthPercentage(source, options);
  if (!/^calc\(/iu.test(source) && (parsed.px < 0 || parsed.percent < 0)) {
    throw syntaxError(options?.label ?? "corner radius", source, "cannot be negative");
  }
  return parsed;
}

export function parseBorderRadius(input: string): Four<Readonly<ParsedCornerRadius>> {
  const source = String(input).trim();
  if (!source) throw syntaxError("border-radius", source, "cannot be empty");
  const axes = splitTopLevelSlash(source);
  const horizontal = parseRadiusAxis(axes[0], "horizontal");
  const vertical = axes.length === 2 ? parseRadiusAxis(axes[1], "vertical") : horizontal;
  return Object.freeze(horizontal.map((rx, index) => (
    Object.freeze({ rx, ry: vertical[index] })
  ))) as Four<Readonly<ParsedCornerRadius>>;
}

export function parseCornerRadius(input: string): Readonly<ParsedCornerRadius> {
  const tokens = splitTopLevelWhitespace(input);
  if (tokens.length < 1 || tokens.length > 2) {
    throw syntaxError("corner radius", input, "requires one or two values");
  }
  const first = tokens[0]!;
  const rx = parseRadiusLengthPercentage(first, { label: "corner horizontal radius" });
  const ry = parseRadiusLengthPercentage(tokens[1] ?? first, { label: "corner vertical radius" });
  return Object.freeze({ rx, ry });
}

export function resolveParsedRadii(
  parsed: readonly ParsedCornerRadius[],
  width: number,
  height: number,
): Four<Readonly<ResolvedCornerRadius>> {
  if (!Array.isArray(parsed) || parsed.length !== CORNER_COUNT) {
    throw new TypeError("parsed radii must contain four corners");
  }
  const resolve = (value: ParsedCornerRadius | undefined, index: number) => {
    if (!value || typeof value !== "object") {
      throw new TypeError(`parsed radii[${index}] must contain horizontal and vertical radii`);
    }
    return Object.freeze({
      rx: Math.max(0, resolveLengthPercentage(value.rx, width)),
      ry: Math.max(0, resolveLengthPercentage(value.ry, height)),
    });
  };
  return Object.freeze([
    resolve(parsed[0], 0),
    resolve(parsed[1], 1),
    resolve(parsed[2], 2),
    resolve(parsed[3], 3),
  ]);
}

export function resolveBorderRadius(
  input: string | readonly ParsedCornerRadius[],
  width: number,
  height: number,
): Four<Readonly<ResolvedCornerRadius>> {
  return resolveParsedRadii(typeof input === "string" ? parseBorderRadius(input) : input, width, height);
}

export function resolveCornerRadiusLonghands(
  values: readonly string[],
  width: number,
  height: number,
): Four<Readonly<ResolvedCornerRadius>> {
  if (!Array.isArray(values) || values.length !== CORNER_COUNT) {
    throw new TypeError("corner radius longhands must contain four values");
  }
  for (let index = 0; index < CORNER_COUNT; index += 1) {
    if (typeof values[index] !== "string") {
      throw new TypeError(`corner radius longhands[${index}] must be a string`);
    }
  }
  if (![width, height].every((reference) => Number.isFinite(reference) && reference >= 0)) {
    throw new TypeError("length-percentage reference must be a finite non-negative number");
  }
  const resolveComputedValue = (source: string, reference: number, label: string): number => {
    try {
      return resolveLengthPercentage(source, reference);
    } catch (originalError) {
      const text = source.trim();
      const closeByOpen = new Map<number, number>();
      const commasByOpen = new Map<number, number[]>();
      const openStack: number[] = [];
      scanCssSyntax(text, 0, (index, character) => {
        if (character === "(") {
          openStack.push(index);
          commasByOpen.set(index, []);
        } else if (character === ")") {
          const open = openStack.pop();
          if (open !== undefined) closeByOpen.set(open, index);
        } else if (character === "," && openStack.length > 0) {
          commasByOpen.get(openStack[openStack.length - 1]!)!.push(index);
        }
      });

      interface EvaluationFrame {
        readonly end: number;
        readonly start: number;
        arguments?: readonly Readonly<{ end: number; start: number }>[];
        nextArgument?: number;
        operation?: "clamp" | "max" | "min";
        values?: number[];
      }
      const frames: EvaluationFrame[] = [{ start: 0, end: text.length }];
      let completed: number | undefined;
      const commit = (value: number): void => {
        frames.pop();
        const parent = frames[frames.length - 1];
        if (parent) parent.values!.push(value);
        else completed = value;
      };

      while (frames.length > 0) {
        const frame = frames[frames.length - 1]!;
        if (!frame.operation && !frame.arguments) {
          const start = skipCssTrivia(text, frame.start);
          const identifier = start < frame.end ? cssIdentifierAt(text, start) : null;
          const operation = identifier?.value.toLowerCase();
          const open = identifier?.end ?? -1;
          const close = closeByOpen.get(open);
          const wholeFunction = (operation === "min" || operation === "max" || operation === "clamp")
            && text[open] === "("
            && close !== undefined
            && skipCssTrivia(text, close + 1) === frame.end;
          if (!wholeFunction) {
            try {
              commit(resolveLengthPercentage(text.slice(frame.start, frame.end), reference));
              continue;
            } catch {
              throw frames.length === 1 ? originalError : syntaxError(
                label,
                text.slice(frame.start, frame.end),
                "contains an unsupported computed value",
              );
            }
          }
          const separators = commasByOpen.get(open) ?? [];
          const bounds = [open, ...separators, close];
          const argumentsList = bounds.slice(1).map((end, index) => Object.freeze({
            start: bounds[index]! + 1,
            end,
          }));
          if (argumentsList.some((argument) => skipCssTrivia(text, argument.start) >= argument.end)) {
            throw syntaxError(label, source, `requires non-empty ${operation}() arguments`);
          }
          if (operation === "clamp" && argumentsList.length !== 3) {
            throw syntaxError(label, source, "requires three clamp() arguments");
          }
          frame.operation = operation;
          frame.arguments = argumentsList;
          frame.nextArgument = 0;
          frame.values = [];
        }

        if (frame.nextArgument! < frame.arguments!.length) {
          const argument = frame.arguments![frame.nextArgument!]!;
          frame.nextArgument! += 1;
          frames.push({ start: argument.start, end: argument.end });
          continue;
        }
        const resolved = frame.values!;
        if (frame.operation === "clamp") {
          commit(Math.max(resolved[0]!, Math.min(resolved[1]!, resolved[2]!)));
          continue;
        }
        let result = resolved[0]!;
        for (let index = 1; index < resolved.length; index += 1) {
          result = frame.operation === "min"
            ? Math.min(result, resolved[index]!)
            : Math.max(result, resolved[index]!);
        }
        commit(result);
      }
      return completed!;
    }
  };
  const resolve = (source: string) => {
    const tokens = splitTopLevelWhitespace(source);
    if (tokens.length < 1 || tokens.length > 2) {
      throw syntaxError("corner radius", source, "requires one or two computed values");
    }
    return Object.freeze({
      rx: Math.max(0, resolveComputedValue(tokens[0]!, width, "corner horizontal radius")),
      ry: Math.max(0, resolveComputedValue(tokens[1] ?? tokens[0]!, height, "corner vertical radius")),
    });
  };
  return Object.freeze([
    resolve(values[0]!),
    resolve(values[1]!),
    resolve(values[2]!),
    resolve(values[3]!),
  ]);
}

const PHYSICAL_CORNER_INDEX = Object.freeze({
  "top-left": 0,
  "top-right": 1,
  "bottom-right": 2,
  "bottom-left": 3,
});

const PHYSICAL_RADIUS_PROPERTY = Object.freeze({
  "border-top-left-radius": "top-left",
  "border-top-right-radius": "top-right",
  "border-bottom-right-radius": "bottom-right",
  "border-bottom-left-radius": "bottom-left",
});

const PHYSICAL_SHAPE_PROPERTY = Object.freeze({
  "corner-top-left-shape": "top-left",
  "corner-top-right-shape": "top-right",
  "corner-bottom-right-shape": "bottom-right",
  "corner-bottom-left-shape": "bottom-left",
});

const LOGICAL_RADIUS_PROPERTY = Object.freeze({
  "border-start-start-radius": "start-start",
  "border-start-end-radius": "start-end",
  "border-end-end-radius": "end-end",
  "border-end-start-radius": "end-start",
});

const LOGICAL_SHAPE_PROPERTY = Object.freeze({
  "corner-start-start-shape": "start-start",
  "corner-start-end-shape": "start-end",
  "corner-end-end-shape": "end-end",
  "corner-end-start-shape": "end-start",
});

function physicalCornerName(
  corner: string,
  properties: Readonly<Record<string, string>>,
  label: string,
): PhysicalCorner {
  const name = properties[corner] ?? corner;
  if (!Object.hasOwn(PHYSICAL_CORNER_INDEX, name)) throw new TypeError(`invalid ${label}: ${corner}`);
  return name as PhysicalCorner;
}

function logicalCornerName(
  corner: string,
  properties: Readonly<Record<string, string>>,
  label: string,
): LogicalCorner {
  const name = properties[corner] ?? corner;
  if (!/^(?:start|end)-(?:start|end)$/u.test(name)) throw new TypeError(`invalid ${label}: ${corner}`);
  return name as LogicalCorner;
}

export function resolveBorderRadiusDeclarations({
  shorthand = "0",
  physical = {},
  logical = {},
  writingMode = "horizontal-tb",
  direction = "ltr",
  textOrientation = "mixed",
}: BorderRadiusDeclarations = {}, width: number, height: number): Four<Readonly<ResolvedCornerRadius>> {
  const result = [...parseBorderRadius(shorthand)];
  for (const [corner, value] of Object.entries(physical)) {
    const physicalCorner = physicalCornerName(corner, PHYSICAL_RADIUS_PROPERTY, "physical radius corner");
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerRadius(value);
  }
  for (const [corner, value] of Object.entries(logical)) {
    const logicalCorner = logicalCornerName(corner, LOGICAL_RADIUS_PROPERTY, "logical radius corner");
    const physicalCorner = logicalCornerToPhysical(logicalCorner, {
      writingMode,
      direction,
      textOrientation,
    });
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerRadius(value);
  }
  return resolveParsedRadii(result, width, height);
}

export function parseCornerShapeValue(input: string): number {
  const source = String(input).trim();
  const syntax = replaceCssCommentsWithWhitespace(source).trim();
  const identifier = wholeCssIdentifier(syntax)?.value.toLowerCase();
  if (identifier && Object.hasOwn(CORNER_SHAPE_PARAMETERS, identifier)) {
    return CORNER_SHAPE_PARAMETERS[identifier as keyof typeof CORNER_SHAPE_PARAMETERS];
  }
  const functionToken = wholeCssFunction(syntax);
  if (functionToken?.name.toLowerCase() !== "superellipse") {
    throw syntaxError("corner-shape", input, "contains an unsupported value");
  }
  const argument = functionToken.body.trim();
  const argumentIdentifier = wholeCssIdentifier(argument)?.value.toLowerCase();
  if (argumentIdentifier === "infinity") return Number.POSITIVE_INFINITY;
  if (argumentIdentifier === "-infinity") return Number.NEGATIVE_INFINITY;
  const simpleNumber = new RegExp(`^[+-]?${NUMBER}$`, "iu");
  let value: number;
  if (simpleNumber.test(argument)) value = Number(argument);
  else {
    const calculation = wholeCssFunction(argument);
    if (calculation?.name.toLowerCase() !== "calc") {
      throw syntaxError("corner-shape", input, "requires a finite number or signed infinity");
    }
    const expression = calculation.body;
    if (!expression.trim()) {
      throw syntaxError("corner-shape", input, "contains an empty calc()");
    }
    value = 0;
    for (const term of additiveCalcTerms(expression, String(input), "corner-shape")) {
      if (term.unit) {
        throw syntaxError("corner-shape", input, "uses unsupported calc() arithmetic");
      }
      value += term.number;
    }
  }
  if (!Number.isFinite(value)) throw syntaxError("corner-shape", input, "contains an invalid number");
  return Object.is(value, -0) ? 0 : value;
}

export function parseCornerShape(input: string): Four<number> {
  const source = String(input).trim();
  const tokens = splitTopLevelWhitespace(source);
  if (tokens.length < 1 || tokens.length > 4) {
    throw syntaxError("corner-shape", source, "requires one through four values");
  }
  return Object.freeze(expandFour(tokens.map(parseCornerShapeValue), "corner-shape"));
}

export function logicalCornerToPhysical(logicalCorner: string, {
  writingMode = "horizontal-tb",
  direction = "ltr",
  textOrientation = "mixed",
}: CornerWritingOptions = {}): PhysicalCorner {
  const match = /^(start|end)-(start|end)$/u.exec(logicalCorner);
  if (!match) throw new TypeError(`invalid logical corner: ${logicalCorner}`);
  const [, blockToken, inlineToken] = match;
  const mode = String(writingMode).toLowerCase();
  const directionValue = String(direction).toLowerCase();
  if (directionValue !== "ltr" && directionValue !== "rtl") {
    throw new TypeError(`unsupported direction: ${direction}`);
  }
  const orientation = String(textOrientation).toLowerCase();
  if (orientation !== "mixed" && orientation !== "upright" && orientation !== "sideways") {
    throw new TypeError(`unsupported text-orientation: ${textOrientation}`);
  }
  const verticalUpright = (mode === "vertical-rl" || mode === "vertical-lr")
    && orientation === "upright";
  const rtl = !verticalUpright && directionValue === "rtl";
  let blockStart: PhysicalSide;
  let blockEnd: PhysicalSide;
  let inlineStart: PhysicalSide;
  let inlineEnd: PhysicalSide;
  if (mode === "horizontal-tb") {
    [blockStart, blockEnd] = ["top", "bottom"];
    [inlineStart, inlineEnd] = rtl ? ["right", "left"] : ["left", "right"];
  } else if (mode === "vertical-rl" || mode === "sideways-rl") {
    [blockStart, blockEnd] = ["right", "left"];
    [inlineStart, inlineEnd] = rtl ? ["bottom", "top"] : ["top", "bottom"];
  } else if (mode === "vertical-lr") {
    [blockStart, blockEnd] = ["left", "right"];
    [inlineStart, inlineEnd] = rtl ? ["bottom", "top"] : ["top", "bottom"];
  } else if (mode === "sideways-lr") {
    [blockStart, blockEnd] = ["left", "right"];
    [inlineStart, inlineEnd] = rtl ? ["top", "bottom"] : ["bottom", "top"];
  } else {
    throw new TypeError(`unsupported writing-mode: ${writingMode}`);
  }
  const sides: readonly PhysicalSide[] = [
    blockToken === "start" ? blockStart : blockEnd,
    inlineToken === "start" ? inlineStart : inlineEnd,
  ];
  const vertical = sides.find((side) => side === "top" || side === "bottom");
  const horizontal = sides.find((side) => side === "left" || side === "right");
  if (!vertical || !horizontal) throw new Error("logical corner did not resolve to two physical axes");
  return `${vertical}-${horizontal}` as PhysicalCorner;
}

export function resolveCornerShapeDeclarations({
  shorthand = "round",
  physical = {},
  logical = {},
  writingMode = "horizontal-tb",
  direction = "ltr",
  textOrientation = "mixed",
}: CornerShapeDeclarations = {}): Four<number> {
  const result = [...parseCornerShape(shorthand)];
  for (const [corner, value] of Object.entries(physical)) {
    const physicalCorner = physicalCornerName(corner, PHYSICAL_SHAPE_PROPERTY, "physical shape corner");
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerShapeValue(value);
  }
  for (const [corner, value] of Object.entries(logical)) {
    const logicalCorner = logicalCornerName(corner, LOGICAL_SHAPE_PROPERTY, "logical shape corner");
    const physicalCorner = logicalCornerToPhysical(logicalCorner, {
      writingMode,
      direction,
      textOrientation,
    });
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerShapeValue(value);
  }
  return Object.freeze(result) as Four<number>;
}

export function resolveCornerShape(input: CornerShapeSource, {
  writingMode = "horizontal-tb",
  direction = "ltr",
  textOrientation = "mixed",
}: CornerWritingOptions = {}): Four<number> {
  if (typeof input === "string") return parseCornerShape(input);
  if (Array.isArray(input)) {
    if (input.length !== CORNER_COUNT) {
      throw new TypeError("resolved corner shapes must contain four numeric parameters");
    }
    const values = [input[0], input[1], input[2], input[3]];
    if (values.some((value) => typeof value !== "number" || Number.isNaN(value))) {
      throw new TypeError("resolved corner shapes must contain four numeric parameters");
    }
    return Object.freeze(values) as Four<number>;
  }
  if (input && typeof input === "object") {
    const declarations = input as CornerShapeDeclarations;
    return resolveCornerShapeDeclarations({
      ...declarations,
      writingMode: declarations.writingMode ?? writingMode,
      direction: declarations.direction ?? direction,
      textOrientation: declarations.textOrientation ?? textOrientation,
    });
  }
  throw new TypeError("unsupported corner-shape source");
}

export function shapeParameterToDiagonal(value: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError("corner-shape parameter must be numeric");
  }
  if (value === Number.NEGATIVE_INFINITY) return 0;
  if (value === Number.POSITIVE_INFINITY) return 1;
  if (value === 0) return 0.5;
  const exponent = 2 ** Math.abs(value);
  const convexHalfCorner = 0.5 ** (1 / exponent);
  return value < 0 ? 1 - convexHalfCorner : convexHalfCorner;
}

export function diagonalToShapeParameter(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError("corner-shape diagonal coordinate must be finite");
  if (value <= 0) return Number.NEGATIVE_INFINITY;
  if (value >= 1) return Number.POSITIVE_INFINITY;
  if (value === 0.5) return 0;
  const convexHalfCorner = value < 0.5 ? 1 - value : value;
  const exponent = Math.log(0.5) / Math.log(convexHalfCorner);
  const parameter = Math.log2(exponent) * (value < 0.5 ? -1 : 1);
  return Object.is(parameter, -0) ? 0 : parameter;
}

export function interpolateCornerShape(
  from: CornerShapeSource,
  to: CornerShapeSource,
  progress: number,
  options: CornerWritingOptions = {},
): Four<number> {
  if (!Number.isFinite(progress)) throw new TypeError("corner-shape interpolation progress must be finite");
  const fromValues = resolveCornerShape(from, options);
  const toValues = resolveCornerShape(to, options);
  return Object.freeze(fromValues.map((fromValue, index) => {
    const fromDiagonal = shapeParameterToDiagonal(fromValue);
    const toDiagonal = shapeParameterToDiagonal(toValues[index]!);
    const diagonal = Math.min(1, Math.max(0, fromDiagonal + (toDiagonal - fromDiagonal) * progress));
    return diagonalToShapeParameter(diagonal);
  })) as Four<number>;
}

export function serializeShapeParameter(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError("corner-shape parameter must be numeric");
  }
  if (value === Number.POSITIVE_INFINITY) return "square";
  if (value === Number.NEGATIVE_INFINITY) return "notch";
  const keyword = Object.entries(CORNER_SHAPE_PARAMETERS).find(([, parameter]) => Object.is(parameter, value));
  return keyword?.[0] ?? `superellipse(${value})`;
}
