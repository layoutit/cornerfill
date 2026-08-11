import {
  parseLengthPercentage,
  splitTopLevelCommas,
  splitTopLevelWhitespace,
} from "./values.mjs";
import type { LengthPercentage } from "./values.mjs";

export type GradientStop = readonly [offset: number, color: string];

export type LinearGradientLine =
  | Readonly<{ kind: "angle"; radians: number }>
  | Readonly<{
    kind: "side";
    horizontal: "left" | "right" | null;
    vertical: "top" | "bottom" | null;
  }>;

export type RadialGradientShape = "circle" | "ellipse";
type RadialGradientSizeKeyword =
  | "closest-side"
  | "closest-corner"
  | "farthest-side"
  | "farthest-corner";
export type RadialGradientSize =
  | Readonly<{
    kind: "explicit";
    radii: readonly Readonly<LengthPercentage>[];
  }>
  | Readonly<{
    kind: "keyword";
    value: RadialGradientSizeKeyword;
  }>;

interface ParsedGradientBase {
  readonly css: string;
  readonly stops: readonly GradientStop[];
}

interface ParsedLinearGradient extends ParsedGradientBase {
  readonly kind: "linear-gradient";
  readonly line: LinearGradientLine;
}

interface ParsedRadialGradient extends ParsedGradientBase {
  readonly centerSource: string;
  readonly kind: "radial-gradient";
  readonly shape: RadialGradientShape;
  readonly size: RadialGradientSize;
}

interface ParsedConicGradient extends ParsedGradientBase {
  readonly angle: number;
  readonly centerSource: string;
  readonly kind: "conic-gradient";
}

export type ParsedCssGradient =
  | ParsedLinearGradient
  | ParsedRadialGradient
  | ParsedConicGradient;

interface GradientCall {
  readonly body: string;
  readonly css: string;
  readonly type: "linear" | "radial" | "conic";
}

interface MutableStop {
  color: string;
  offset: number | null;
}

interface RadialPrelude {
  readonly centerSource: string;
  readonly shape: RadialGradientShape;
  readonly size: RadialGradientSize;
}

interface ConicPrelude {
  readonly angle: number;
  readonly centerSource: string;
}

type PositionParser = (input: string) => number;

const ANGLE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/iu;
const PERCENTAGE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)%$/iu;

function angleRadians(
  input: unknown,
  label: string,
  { unitlessZero = true }: { unitlessZero?: boolean } = {},
): number {
  const value = String(input).trim();
  const match = ANGLE.exec(value);
  if (!match) throw new SyntaxError(`${label} requires deg, grad, rad, or turn: ${value}`);
  const number = Number(match[1]!);
  const unit = (match[2] ?? "").toLowerCase();
  if (!Number.isFinite(number) || (!unit && (!unitlessZero || number !== 0))) {
    throw new SyntaxError(`${label} requires a finite angle: ${value}`);
  }
  if (unit === "grad") return number * Math.PI / 200;
  if (unit === "rad") return number;
  if (unit === "turn") return number * Math.PI * 2;
  return number * Math.PI / 180;
}

function linearStopPosition(input: string): number {
  const value = String(input).trim();
  const percent = PERCENTAGE.exec(value);
  if (percent) return Number(percent[1]!) / 100;
  const zero = /^[-+]?0(?:\.0+)?(?:px)?$/iu.test(value);
  if (zero) return 0;
  throw new SyntaxError(`gradient stop positions support percentages and zero lengths: ${value}`);
}

function conicStopPosition(input: string): number {
  const percent = PERCENTAGE.exec(String(input).trim());
  if (percent) return Number(percent[1]!) / 100;
  return angleRadians(input, "conic gradient stop") / (Math.PI * 2);
}

function positionLikeToken(value: string): boolean {
  const token = value.trim();
  return /^[+-]?(?:\d|\.\d)/u.test(token)
    || /^(?:calc|min|max|clamp)\(/iu.test(token);
}

function tryPosition(parser: PositionParser, value: string): number | null {
  try {
    return parser(value);
  } catch (error) {
    if (positionLikeToken(value)) throw error;
    return null;
  }
}

function resolveAutomaticStops(stops: readonly MutableStop[]): readonly GradientStop[] {
  const resolved: MutableStop[] = stops.map(({ color, offset }) => ({ color, offset }));
  const first = resolved[0]!;
  const last = resolved.at(-1)!;
  if (first.offset === null) first.offset = 0;
  if (last.offset === null) last.offset = 1;
  let previous = first.offset;
  for (let index = 1; index < resolved.length; index += 1) {
    const stop = resolved[index]!;
    if (stop.offset !== null) {
      stop.offset = Math.max(previous, stop.offset);
      previous = stop.offset;
    }
  }
  let index = 1;
  while (index < resolved.length - 1) {
    if (resolved[index]!.offset !== null) {
      index += 1;
      continue;
    }
    const start = index - 1;
    let end = index + 1;
    while (resolved[end]!.offset === null) end += 1;
    const startOffset = resolved[start]!.offset!;
    const step = (resolved[end]!.offset! - startOffset) / (end - start);
    for (let cursor = index; cursor < end; cursor += 1) {
      resolved[cursor]!.offset = startOffset + step * (cursor - start);
    }
    index = end + 1;
  }
  if (resolved.some((stop) => {
    const offset = stop.offset!;
    return !Number.isFinite(offset) || offset < 0 || offset > 1;
  })) {
    throw new RangeError("gradient stop positions outside 0% through 100% are not supported");
  }
  return Object.freeze(resolved.map(({ color, offset }) => (
    Object.freeze([offset!, color] as const)
  )));
}

function parseStops(parts: readonly string[], positionParser: PositionParser): readonly GradientStop[] {
  const expanded: MutableStop[] = [];
  for (const part of parts) {
    const tokens = [...splitTopLevelWhitespace(part)];
    const positions: number[] = [];
    while (tokens.length > 1 && positions.length < 2) {
      const position = tryPosition(positionParser, tokens.at(-1)!);
      if (position === null) break;
      positions.unshift(position);
      tokens.pop();
    }
    if (tokens.length === 1 && tryPosition(positionParser, tokens[0]!) !== null) {
      throw new SyntaxError("gradient interpolation hints are not supported");
    }
    const color = tokens.join(" ").trim();
    if (!color) throw new SyntaxError(`gradient color stop has no color: ${part}`);
    if (positions.length === 0) expanded.push({ color, offset: null });
    else for (const offset of positions) expanded.push({ color, offset });
  }
  if (expanded.length < 2) throw new SyntaxError("a gradient requires at least two color stops");
  return resolveAutomaticStops(expanded);
}

function gradientCall(input: unknown): Readonly<GradientCall> {
  const value = String(input).trim();
  const match = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/isu.exec(value);
  if (!match) throw new SyntaxError(`unsupported CSS gradient: ${value}`);
  if (match[1]) throw new SyntaxError("repeating gradient functions are not supported");
  return Object.freeze({
    type: match[2]!.toLowerCase() as GradientCall["type"],
    body: match[3]!,
    css: value,
  });
}

function rejectsColorSpacePrelude(value: string): boolean {
  return /(?:^|\s)in\s+[a-z]/iu.test(value);
}

function parseLinear(call: Readonly<GradientCall>): Readonly<ParsedLinearGradient> {
  const parts = [...splitTopLevelCommas(call.body)];
  let line: LinearGradientLine = Object.freeze({ kind: "angle", radians: Math.PI });
  const first = parts[0]!;
  if (/^to\s+/iu.test(first)) {
    const sides = splitTopLevelWhitespace(first.slice(3)).map((token) => token.toLowerCase());
    const horizontal = sides.find((side): side is "left" | "right" => (
      side === "left" || side === "right"
    )) ?? null;
    const vertical = sides.find((side): side is "top" | "bottom" => (
      side === "top" || side === "bottom"
    )) ?? null;
    if (sides.length < 1 || sides.length > 2 || sides.some((side) => (
      !new Set(["left", "right", "top", "bottom"]).has(side)
    )) || (sides.length === 2 && (!horizontal || !vertical))) {
      throw new SyntaxError(`invalid linear-gradient direction: ${first}`);
    }
    line = Object.freeze({ kind: "side", horizontal, vertical });
    parts.shift();
  } else if (ANGLE.test(first)) {
    line = Object.freeze({ kind: "angle", radians: angleRadians(first, "linear-gradient angle") });
    parts.shift();
  } else if (rejectsColorSpacePrelude(first)) {
    throw new SyntaxError("gradient color interpolation spaces are not supported");
  }
  return Object.freeze({
    kind: "linear-gradient",
    css: call.css,
    line,
    stops: parseStops(parts, linearStopPosition),
  });
}

function radialPreludeCandidate(value: string): boolean {
  const tokens = splitTopLevelWhitespace(value).map((token) => token.toLowerCase());
  if (tokens.includes("at") || tokens.includes("circle") || tokens.includes("ellipse")
    || tokens.some((token) => new Set([
      "closest-side", "closest-corner", "farthest-side", "farthest-corner",
    ]).has(token))) return true;
  return tokens.length > 0 && tokens.length <= 2 && tokens.every((token) => {
      try {
        parseLengthPercentage(token, { label: "radial-gradient radius" });
        return true;
      } catch {
        return false;
      }
    });
}

function parseRadialRadius(token: string): Readonly<LengthPercentage> {
  const radius = parseLengthPercentage(token, { label: "radial-gradient radius" });
  if (!/^calc\(/iu.test(token.trim()) && (radius.px < 0 || radius.percent < 0)) {
    throw new SyntaxError(`radial-gradient radius must be non-negative: ${token}`);
  }
  return radius;
}

function parseRadialPrelude(value: string): Readonly<RadialPrelude> {
  if (rejectsColorSpacePrelude(value)) {
    throw new SyntaxError("gradient color interpolation spaces are not supported");
  }
  const tokens = [...splitTopLevelWhitespace(value)];
  const at = tokens.findIndex((token) => token.toLowerCase() === "at");
  const geometryTokens = at < 0 ? tokens : tokens.slice(0, at);
  const centerSource = at < 0 ? "center" : tokens.slice(at + 1).join(" ");
  if (!centerSource) throw new SyntaxError("radial-gradient at requires a position");
  let shape: RadialGradientShape | null = null;
  let keyword: RadialGradientSizeKeyword | null = null;
  const radii: Readonly<LengthPercentage>[] = [];
  for (const token of geometryTokens) {
    const lower = token.toLowerCase();
    if (lower === "circle" || lower === "ellipse") {
      if (shape) throw new SyntaxError(`duplicate radial-gradient shape: ${value}`);
      shape = lower;
    } else if (new Set([
      "closest-side", "closest-corner", "farthest-side", "farthest-corner",
    ]).has(lower)) {
      if (keyword) throw new SyntaxError(`duplicate radial-gradient size: ${value}`);
      keyword = lower as RadialGradientSizeKeyword;
    } else {
      radii.push(parseRadialRadius(token));
    }
  }
  if (keyword && radii.length > 0) throw new SyntaxError("radial-gradient cannot mix keyword and explicit sizes");
  if (radii.length > 2) throw new SyntaxError("radial-gradient supports one circle radius or two ellipse radii");
  if (radii.length === 1) shape ??= "circle";
  if (radii.length === 2) shape ??= "ellipse";
  shape ??= "ellipse";
  if (shape === "circle" && radii.length === 2) throw new SyntaxError("circle radial-gradient requires one radius");
  if (shape === "ellipse" && radii.length === 1) throw new SyntaxError("ellipse radial-gradient requires two radii");
  if (shape === "circle" && radii.length === 1 && radii[0]!.percent !== 0) {
    throw new SyntaxError("circle radial-gradient percentage radii are invalid");
  }
  return Object.freeze({
    shape,
    size: radii.length > 0
      ? Object.freeze({ kind: "explicit", radii: Object.freeze(radii) })
      : Object.freeze({ kind: "keyword", value: keyword ?? "farthest-corner" }),
    centerSource,
  });
}

function parseRadial(call: Readonly<GradientCall>): Readonly<ParsedRadialGradient> {
  const parts = [...splitTopLevelCommas(call.body)];
  const prelude = radialPreludeCandidate(parts[0]!)
    ? parseRadialPrelude(parts.shift()!)
    : parseRadialPrelude("");
  return Object.freeze({
    kind: "radial-gradient",
    css: call.css,
    ...prelude,
    stops: parseStops(parts, linearStopPosition),
  });
}

function parseConicPrelude(value: string): Readonly<ConicPrelude> {
  if (rejectsColorSpacePrelude(value)) {
    throw new SyntaxError("gradient color interpolation spaces are not supported");
  }
  const tokens = [...splitTopLevelWhitespace(value)];
  let angle = 0;
  let centerSource = "center";
  let cursor = 0;
  if (tokens[cursor]?.toLowerCase() === "from") {
    if (!tokens[cursor + 1]) throw new SyntaxError("conic-gradient from requires an angle");
    angle = angleRadians(tokens[cursor + 1]!, "conic-gradient angle");
    cursor += 2;
  }
  if (tokens[cursor]?.toLowerCase() === "at") {
    centerSource = tokens.slice(cursor + 1).join(" ");
    if (!centerSource) throw new SyntaxError("conic-gradient at requires a position");
    cursor = tokens.length;
  }
  if (cursor !== tokens.length) throw new SyntaxError(`unsupported conic-gradient prelude: ${value}`);
  return Object.freeze({ angle, centerSource });
}

function parseConic(call: Readonly<GradientCall>): Readonly<ParsedConicGradient> {
  const parts = [...splitTopLevelCommas(call.body)];
  const hasPrelude = /^(?:from|at|in)\s+/iu.test(parts[0]!);
  const prelude = hasPrelude ? parseConicPrelude(parts.shift()!) : parseConicPrelude("");
  return Object.freeze({
    kind: "conic-gradient",
    css: call.css,
    ...prelude,
    stops: parseStops(parts, conicStopPosition),
  });
}

export function isCssGradient(input: unknown): boolean {
  return /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/iu.test(String(input).trim());
}

export function parseCssGradient(input: unknown): Readonly<ParsedCssGradient> {
  const call = gradientCall(input);
  if (call.type === "linear") return parseLinear(call);
  if (call.type === "radial") return parseRadial(call);
  return parseConic(call);
}
