const CORNER_COUNT = 4;

export const CORNER_SHAPE_PARAMETERS = Object.freeze({
  notch: Number.NEGATIVE_INFINITY,
  scoop: -1,
  bevel: 0,
  round: 1,
  squircle: 2,
  square: Number.POSITIVE_INFINITY,
});

function syntaxError(label, value, detail) {
  return new SyntaxError(`${label} ${detail}: ${JSON.stringify(value)}`);
}

function scanTopLevel(value, onCharacter) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
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

export function splitTopLevelWhitespace(input) {
  const value = String(input).trim();
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

export function splitTopLevelCommas(input) {
  const value = String(input).trim();
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

function splitTopLevelSlash(input) {
  const value = String(input).trim();
  const slashIndexes = [];
  scanTopLevel(value, (character, index, depth) => {
    if (character === "/" && depth === 0) slashIndexes.push(index);
  });
  if (slashIndexes.length > 1) throw syntaxError("border-radius", value, "contains more than one top-level slash");
  if (slashIndexes.length === 0) return Object.freeze([value]);
  return Object.freeze([
    value.slice(0, slashIndexes[0]).trim(),
    value.slice(slashIndexes[0] + 1).trim(),
  ]);
}

function freezeLengthPercentage(px, percent, source) {
  return Object.freeze({ px, percent, source });
}

const NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const SIMPLE_LENGTH_PERCENTAGE = new RegExp(`^([+-]?${NUMBER})(px|%)?$`, "iu");
const CALC_TERM = new RegExp(`([+-]?)(${NUMBER})(px|%)?`, "ig");

export function parseLengthPercentage(input, { label = "length-percentage" } = {}) {
  const source = String(input).trim();
  const simple = SIMPLE_LENGTH_PERCENTAGE.exec(source);
  if (simple) {
    const number = Number(simple[1]);
    const unit = (simple[2] ?? "").toLowerCase();
    if (!Number.isFinite(number) || (!unit && number !== 0)) {
      throw syntaxError(label, source, "requires px, %, or unitless zero");
    }
    return freezeLengthPercentage(unit === "%" ? 0 : number, unit === "%" ? number / 100 : 0, source);
  }

  const match = /^calc\((.*)\)$/isu.exec(source);
  if (!match) throw syntaxError(label, source, "is outside the supported px/% syntax");
  const expression = match[1].replaceAll(/\s+/gu, "");
  if (!expression) throw syntaxError(label, source, "contains an empty calc()");
  let cursor = 0;
  let px = 0;
  let percent = 0;
  let terms = 0;
  CALC_TERM.lastIndex = 0;
  for (let term = CALC_TERM.exec(expression); term; term = CALC_TERM.exec(expression)) {
    if (term.index !== cursor || (terms > 0 && !term[1])) {
      throw syntaxError(label, source, "uses unsupported calc() arithmetic");
    }
    const number = Number(`${term[1]}${term[2]}`);
    const unit = (term[3] ?? "").toLowerCase();
    if (!Number.isFinite(number) || (!unit && number !== 0)) {
      throw syntaxError(label, source, "requires px, %, or unitless zero terms");
    }
    if (unit === "%") percent += number / 100;
    else px += number;
    cursor = CALC_TERM.lastIndex;
    terms += 1;
  }
  if (terms === 0 || cursor !== expression.length) {
    throw syntaxError(label, source, "uses unsupported calc() arithmetic");
  }
  return freezeLengthPercentage(px, percent, source);
}

export function resolveLengthPercentage(value, reference) {
  if (!Number.isFinite(reference) || reference < 0) {
    throw new TypeError("length-percentage reference must be a finite non-negative number");
  }
  const parsed = typeof value === "string" ? parseLengthPercentage(value) : value;
  if (!parsed || !Number.isFinite(parsed.px) || !Number.isFinite(parsed.percent)) {
    throw new TypeError("invalid parsed length-percentage");
  }
  return parsed.px + parsed.percent * reference;
}

function expandFour(values, label) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) {
    throw new SyntaxError(`${label} requires one through four values`);
  }
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return [...values];
}

function parseRadiusAxis(input, label) {
  const tokens = splitTopLevelWhitespace(input);
  if (tokens.length < 1 || tokens.length > 4) {
    throw syntaxError("border-radius", input, `${label} axis requires one through four values`);
  }
  return expandFour(tokens.map((token, index) => parseRadiusLengthPercentage(token, {
    label: `border-radius ${label} value ${index + 1}`,
  })), `border-radius ${label}`);
}

function parseRadiusLengthPercentage(input, options) {
  const source = String(input).trim();
  const parsed = parseLengthPercentage(source, options);
  if (!/^calc\(/iu.test(source) && (parsed.px < 0 || parsed.percent < 0)) {
    throw syntaxError(options?.label ?? "corner radius", source, "cannot be negative");
  }
  return parsed;
}

export function parseBorderRadius(input) {
  const source = String(input).trim();
  if (!source) throw syntaxError("border-radius", source, "cannot be empty");
  const axes = splitTopLevelSlash(source);
  const horizontal = parseRadiusAxis(axes[0], "horizontal");
  const vertical = axes.length === 2 ? parseRadiusAxis(axes[1], "vertical") : horizontal;
  return Object.freeze(horizontal.map((rx, index) => Object.freeze({ rx, ry: vertical[index] })));
}

export function parseCornerRadius(input) {
  const tokens = splitTopLevelWhitespace(input);
  if (tokens.length < 1 || tokens.length > 2) {
    throw syntaxError("corner radius", input, "requires one or two values");
  }
  const rx = parseRadiusLengthPercentage(tokens[0], { label: "corner horizontal radius" });
  const ry = parseRadiusLengthPercentage(tokens[1] ?? tokens[0], { label: "corner vertical radius" });
  return Object.freeze({ rx, ry });
}

export function resolveParsedRadii(parsed, width, height) {
  if (!Array.isArray(parsed) || parsed.length !== CORNER_COUNT) {
    throw new TypeError("parsed radii must contain four corners");
  }
  return Object.freeze(parsed.map(({ rx, ry }) => Object.freeze({
    rx: Math.max(0, resolveLengthPercentage(rx, width)),
    ry: Math.max(0, resolveLengthPercentage(ry, height)),
  })));
}

export function resolveBorderRadius(input, width, height) {
  return resolveParsedRadii(typeof input === "string" ? parseBorderRadius(input) : input, width, height);
}

export function resolveCornerRadiusLonghands(values, width, height) {
  if (!Array.isArray(values) || values.length !== CORNER_COUNT) {
    throw new TypeError("corner radius longhands must contain four values");
  }
  return resolveParsedRadii(values.map(parseCornerRadius), width, height);
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

function physicalCornerName(corner, properties, label) {
  const name = properties[corner] ?? corner;
  if (PHYSICAL_CORNER_INDEX[name] === undefined) throw new TypeError(`invalid ${label}: ${corner}`);
  return name;
}

function logicalCornerName(corner, properties, label) {
  const name = properties[corner] ?? corner;
  if (!/^(?:start|end)-(?:start|end)$/u.test(name)) throw new TypeError(`invalid ${label}: ${corner}`);
  return name;
}

export function resolveBorderRadiusDeclarations({
  shorthand = "0",
  physical = {},
  logical = {},
  writingMode = "horizontal-tb",
  direction = "ltr",
} = {}, width, height) {
  const result = [...parseBorderRadius(shorthand)];
  for (const [corner, value] of Object.entries(physical)) {
    const physicalCorner = physicalCornerName(corner, PHYSICAL_RADIUS_PROPERTY, "physical radius corner");
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerRadius(value);
  }
  for (const [corner, value] of Object.entries(logical)) {
    const logicalCorner = logicalCornerName(corner, LOGICAL_RADIUS_PROPERTY, "logical radius corner");
    const physicalCorner = logicalCornerToPhysical(logicalCorner, { writingMode, direction });
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerRadius(value);
  }
  return resolveParsedRadii(result, width, height);
}

export function parseCornerShapeValue(input) {
  const source = String(input).trim().toLowerCase();
  if (Object.hasOwn(CORNER_SHAPE_PARAMETERS, source)) return CORNER_SHAPE_PARAMETERS[source];
  const match = /^superellipse\((.*)\)$/isu.exec(source);
  if (!match) throw syntaxError("corner-shape", input, "contains an unsupported value");
  const argument = match[1].trim();
  if (argument === "infinity" || argument === "+infinity") return Number.POSITIVE_INFINITY;
  if (argument === "-infinity") return Number.NEGATIVE_INFINITY;
  const simpleNumber = new RegExp(`^[+-]?${NUMBER}$`, "iu");
  let value;
  if (simpleNumber.test(argument)) value = Number(argument);
  else {
    const calculation = /^calc\((.*)\)$/isu.exec(argument);
    if (!calculation) {
      throw syntaxError("corner-shape", input, "requires a finite number or signed infinity");
    }
    const expression = calculation[1].replaceAll(/\s+/gu, "");
    let cursor = 0;
    let terms = 0;
    value = 0;
    CALC_TERM.lastIndex = 0;
    for (let term = CALC_TERM.exec(expression); term; term = CALC_TERM.exec(expression)) {
      if (term.index !== cursor || term[3] || (terms > 0 && !term[1])) {
        throw syntaxError("corner-shape", input, "uses unsupported calc() arithmetic");
      }
      value += Number(`${term[1]}${term[2]}`);
      cursor = CALC_TERM.lastIndex;
      terms += 1;
    }
    if (terms === 0 || cursor !== expression.length) {
      throw syntaxError("corner-shape", input, "uses unsupported calc() arithmetic");
    }
  }
  if (!Number.isFinite(value)) throw syntaxError("corner-shape", input, "contains an invalid number");
  return Object.is(value, -0) ? 0 : value;
}

export function parseCornerShape(input) {
  const source = String(input).trim();
  const tokens = splitTopLevelWhitespace(source);
  if (tokens.length < 1 || tokens.length > 4) {
    throw syntaxError("corner-shape", source, "requires one through four values");
  }
  return Object.freeze(expandFour(tokens.map(parseCornerShapeValue), "corner-shape"));
}

export function logicalCornerToPhysical(logicalCorner, {
  writingMode = "horizontal-tb",
  direction = "ltr",
} = {}) {
  const match = /^(start|end)-(start|end)$/u.exec(logicalCorner);
  if (!match) throw new TypeError(`invalid logical corner: ${logicalCorner}`);
  const [, blockToken, inlineToken] = match;
  const mode = String(writingMode).toLowerCase();
  const directionValue = String(direction).toLowerCase();
  if (directionValue !== "ltr" && directionValue !== "rtl") {
    throw new TypeError(`unsupported direction: ${direction}`);
  }
  const rtl = directionValue === "rtl";
  let blockStart;
  let blockEnd;
  let inlineStart;
  let inlineEnd;
  if (mode === "horizontal-tb") {
    [blockStart, blockEnd] = ["top", "bottom"];
    [inlineStart, inlineEnd] = rtl ? ["right", "left"] : ["left", "right"];
  } else if (mode === "vertical-rl" || mode === "sideways-rl") {
    [blockStart, blockEnd] = ["right", "left"];
    [inlineStart, inlineEnd] = rtl ? ["bottom", "top"] : ["top", "bottom"];
  } else if (mode === "vertical-lr" || mode === "sideways-lr") {
    [blockStart, blockEnd] = ["left", "right"];
    [inlineStart, inlineEnd] = rtl ? ["bottom", "top"] : ["top", "bottom"];
  } else {
    throw new TypeError(`unsupported writing-mode: ${writingMode}`);
  }
  const sides = [blockToken === "start" ? blockStart : blockEnd, inlineToken === "start" ? inlineStart : inlineEnd];
  const vertical = sides.find((side) => side === "top" || side === "bottom");
  const horizontal = sides.find((side) => side === "left" || side === "right");
  return `${vertical}-${horizontal}`;
}

export function resolveCornerShapeDeclarations({
  shorthand = "round",
  physical = {},
  logical = {},
  writingMode = "horizontal-tb",
  direction = "ltr",
} = {}) {
  const result = [...parseCornerShape(shorthand)];
  for (const [corner, value] of Object.entries(physical)) {
    const physicalCorner = physicalCornerName(corner, PHYSICAL_SHAPE_PROPERTY, "physical shape corner");
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerShapeValue(value);
  }
  for (const [corner, value] of Object.entries(logical)) {
    const logicalCorner = logicalCornerName(corner, LOGICAL_SHAPE_PROPERTY, "logical shape corner");
    const physicalCorner = logicalCornerToPhysical(logicalCorner, { writingMode, direction });
    result[PHYSICAL_CORNER_INDEX[physicalCorner]] = parseCornerShapeValue(value);
  }
  return Object.freeze(result);
}

export function resolveCornerShape(input, {
  writingMode = "horizontal-tb",
  direction = "ltr",
} = {}) {
  if (typeof input === "string") return parseCornerShape(input);
  if (Array.isArray(input)) {
    if (input.length !== CORNER_COUNT || input.some((value) => (
      typeof value !== "number" || Number.isNaN(value)
    ))) throw new TypeError("resolved corner shapes must contain four numeric parameters");
    return Object.freeze([...input]);
  }
  if (input && typeof input === "object") {
    return resolveCornerShapeDeclarations({
      ...input,
      writingMode: input.writingMode ?? writingMode,
      direction: input.direction ?? direction,
    });
  }
  throw new TypeError("unsupported corner-shape source");
}

export function shapeParameterToDiagonal(value) {
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

export function diagonalToShapeParameter(value) {
  if (!Number.isFinite(value)) throw new TypeError("corner-shape diagonal coordinate must be finite");
  if (value <= 0) return Number.NEGATIVE_INFINITY;
  if (value >= 1) return Number.POSITIVE_INFINITY;
  if (value === 0.5) return 0;
  const convexHalfCorner = value < 0.5 ? 1 - value : value;
  const exponent = Math.log(0.5) / Math.log(convexHalfCorner);
  const parameter = Math.log2(exponent) * (value < 0.5 ? -1 : 1);
  return Object.is(parameter, -0) ? 0 : parameter;
}

export function interpolateCornerShape(from, to, progress, options = {}) {
  if (!Number.isFinite(progress)) throw new TypeError("corner-shape interpolation progress must be finite");
  const fromValues = resolveCornerShape(from, options);
  const toValues = resolveCornerShape(to, options);
  return Object.freeze(fromValues.map((fromValue, index) => {
    const fromDiagonal = shapeParameterToDiagonal(fromValue);
    const toDiagonal = shapeParameterToDiagonal(toValues[index]);
    const diagonal = Math.min(1, Math.max(0, fromDiagonal + (toDiagonal - fromDiagonal) * progress));
    return diagonalToShapeParameter(diagonal);
  }));
}

export function serializeShapeParameter(value) {
  if (value === Number.POSITIVE_INFINITY) return "square";
  if (value === Number.NEGATIVE_INFINITY) return "notch";
  const keyword = Object.entries(CORNER_SHAPE_PARAMETERS).find(([, parameter]) => Object.is(parameter, value));
  return keyword?.[0] ?? `superellipse(${value})`;
}
