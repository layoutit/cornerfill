import {
  parseLengthPercentage,
  splitTopLevelCommas,
  splitTopLevelWhitespace,
} from "./values.mjs";

const ANGLE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/iu;
const PERCENTAGE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)%$/iu;

function angleRadians(input, label, { unitlessZero = true } = {}) {
  const value = String(input).trim();
  const match = ANGLE.exec(value);
  if (!match) throw new SyntaxError(`${label} requires deg, grad, rad, or turn: ${value}`);
  const number = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase();
  if (!Number.isFinite(number) || (!unit && (!unitlessZero || number !== 0))) {
    throw new SyntaxError(`${label} requires a finite angle: ${value}`);
  }
  if (unit === "grad") return number * Math.PI / 200;
  if (unit === "rad") return number;
  if (unit === "turn") return number * Math.PI * 2;
  return number * Math.PI / 180;
}

function linearStopPosition(input) {
  const value = String(input).trim();
  const percent = PERCENTAGE.exec(value);
  if (percent) return Number(percent[1]) / 100;
  const zero = /^[-+]?0(?:\.0+)?(?:px)?$/iu.test(value);
  if (zero) return 0;
  throw new SyntaxError(`gradient stop positions support percentages and zero lengths: ${value}`);
}

function conicStopPosition(input) {
  const percent = PERCENTAGE.exec(String(input).trim());
  if (percent) return Number(percent[1]) / 100;
  return angleRadians(input, "conic gradient stop") / (Math.PI * 2);
}

function tryPosition(parser, value) {
  try {
    return parser(value);
  } catch {
    return null;
  }
}

function resolveAutomaticStops(stops) {
  const resolved = stops.map(({ color, offset }) => ({ color, offset }));
  if (resolved[0].offset === null) resolved[0].offset = 0;
  if (resolved.at(-1).offset === null) resolved.at(-1).offset = 1;
  let previous = resolved[0].offset;
  for (let index = 1; index < resolved.length; index += 1) {
    if (resolved[index].offset !== null) {
      resolved[index].offset = Math.max(previous, resolved[index].offset);
      previous = resolved[index].offset;
    }
  }
  let index = 1;
  while (index < resolved.length - 1) {
    if (resolved[index].offset !== null) {
      index += 1;
      continue;
    }
    const start = index - 1;
    let end = index + 1;
    while (resolved[end].offset === null) end += 1;
    const step = (resolved[end].offset - resolved[start].offset) / (end - start);
    for (let cursor = index; cursor < end; cursor += 1) {
      resolved[cursor].offset = resolved[start].offset + step * (cursor - start);
    }
    index = end + 1;
  }
  if (resolved.some(({ offset }) => !Number.isFinite(offset) || offset < 0 || offset > 1)) {
    throw new RangeError("gradient stop positions outside 0% through 100% are not supported");
  }
  return Object.freeze(resolved.map(({ color, offset }) => Object.freeze([offset, color])));
}

function parseStops(parts, positionParser) {
  const expanded = [];
  for (const part of parts) {
    const tokens = [...splitTopLevelWhitespace(part)];
    const positions = [];
    while (tokens.length > 1 && positions.length < 2) {
      const position = tryPosition(positionParser, tokens.at(-1));
      if (position === null) break;
      positions.unshift(position);
      tokens.pop();
    }
    if (tokens.length === 1 && tryPosition(positionParser, tokens[0]) !== null) {
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

function gradientCall(input) {
  const value = String(input).trim();
  const match = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/isu.exec(value);
  if (!match) throw new SyntaxError(`unsupported CSS gradient: ${value}`);
  if (match[1]) throw new SyntaxError("repeating gradient functions are not supported");
  return Object.freeze({ type: match[2].toLowerCase(), body: match[3], css: value });
}

function rejectsColorSpacePrelude(value) {
  return /(?:^|\s)in\s+[a-z]/iu.test(value);
}

function parseLinear(call) {
  const parts = [...splitTopLevelCommas(call.body)];
  let line = Object.freeze({ kind: "angle", radians: Math.PI });
  const first = parts[0];
  if (/^to\s+/iu.test(first)) {
    const sides = splitTopLevelWhitespace(first.slice(3)).map((token) => token.toLowerCase());
    const horizontal = sides.find((side) => side === "left" || side === "right") ?? null;
    const vertical = sides.find((side) => side === "top" || side === "bottom") ?? null;
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

function radialPreludeCandidate(value) {
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

function parseRadialPrelude(value) {
  if (rejectsColorSpacePrelude(value)) {
    throw new SyntaxError("gradient color interpolation spaces are not supported");
  }
  const tokens = [...splitTopLevelWhitespace(value)];
  const at = tokens.findIndex((token) => token.toLowerCase() === "at");
  const geometryTokens = at < 0 ? tokens : tokens.slice(0, at);
  const centerSource = at < 0 ? "center" : tokens.slice(at + 1).join(" ");
  if (!centerSource) throw new SyntaxError("radial-gradient at requires a position");
  let shape = null;
  let keyword = null;
  const radii = [];
  for (const token of geometryTokens) {
    const lower = token.toLowerCase();
    if (lower === "circle" || lower === "ellipse") {
      if (shape) throw new SyntaxError(`duplicate radial-gradient shape: ${value}`);
      shape = lower;
    } else if (new Set([
      "closest-side", "closest-corner", "farthest-side", "farthest-corner",
    ]).has(lower)) {
      if (keyword) throw new SyntaxError(`duplicate radial-gradient size: ${value}`);
      keyword = lower;
    } else {
      radii.push(parseLengthPercentage(token, { label: "radial-gradient radius" }));
    }
  }
  if (keyword && radii.length > 0) throw new SyntaxError("radial-gradient cannot mix keyword and explicit sizes");
  if (radii.length > 2) throw new SyntaxError("radial-gradient supports one circle radius or two ellipse radii");
  if (radii.length === 1) shape ??= "circle";
  if (radii.length === 2) shape ??= "ellipse";
  shape ??= "ellipse";
  if (shape === "circle" && radii.length === 2) throw new SyntaxError("circle radial-gradient requires one radius");
  if (shape === "ellipse" && radii.length === 1) throw new SyntaxError("ellipse radial-gradient requires two radii");
  if (shape === "circle" && radii.length === 1 && radii[0].percent !== 0) {
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

function parseRadial(call) {
  const parts = [...splitTopLevelCommas(call.body)];
  const prelude = radialPreludeCandidate(parts[0])
    ? parseRadialPrelude(parts.shift())
    : parseRadialPrelude("");
  return Object.freeze({
    kind: "radial-gradient",
    css: call.css,
    ...prelude,
    stops: parseStops(parts, linearStopPosition),
  });
}

function parseConicPrelude(value) {
  if (rejectsColorSpacePrelude(value)) {
    throw new SyntaxError("gradient color interpolation spaces are not supported");
  }
  const tokens = [...splitTopLevelWhitespace(value)];
  let angle = 0;
  let centerSource = "center";
  let cursor = 0;
  if (tokens[cursor]?.toLowerCase() === "from") {
    if (!tokens[cursor + 1]) throw new SyntaxError("conic-gradient from requires an angle");
    angle = angleRadians(tokens[cursor + 1], "conic-gradient angle");
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

function parseConic(call) {
  const parts = [...splitTopLevelCommas(call.body)];
  const hasPrelude = /^(?:from|at|in)\s+/iu.test(parts[0]);
  const prelude = hasPrelude ? parseConicPrelude(parts.shift()) : parseConicPrelude("");
  return Object.freeze({
    kind: "conic-gradient",
    css: call.css,
    ...prelude,
    stops: parseStops(parts, conicStopPosition),
  });
}

export function isCssGradient(input) {
  return /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/iu.test(String(input).trim());
}

export function parseCssGradient(input) {
  const call = gradientCall(input);
  if (call.type === "linear") return parseLinear(call);
  if (call.type === "radial") return parseRadial(call);
  return parseConic(call);
}
