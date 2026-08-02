import {
  parseCornerShape,
  resolveBorderRadius,
} from "./values.mjs";

const CORNER_COUNT = 4;
const DEFAULT_SEGMENTS = 64;
const INTERSECTION_EPSILON = 1e-9;

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number`);
  }
  return value;
}

function validShapeParameter(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError(`${label} must be a number or signed infinity`);
  }
  return value;
}

function frozenPoint(x, y) {
  return Object.freeze([x, y]);
}

export function resolveRadii(width, height, radii) {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  if (!Array.isArray(radii) || radii.length !== CORNER_COUNT) {
    throw new TypeError("radii must contain top-left, top-right, bottom-right, bottom-left");
  }
  const values = radii.map((corner, index) => Object.freeze({
    rx: finiteNonNegative(corner?.rx, `radii[${index}].rx`),
    ry: finiteNonNegative(corner?.ry, `radii[${index}].ry`),
  }));
  const ratios = [
    values[0].rx + values[1].rx > 0 ? width / (values[0].rx + values[1].rx) : 1,
    values[3].rx + values[2].rx > 0 ? width / (values[3].rx + values[2].rx) : 1,
    values[0].ry + values[3].ry > 0 ? height / (values[0].ry + values[3].ry) : 1,
    values[1].ry + values[2].ry > 0 ? height / (values[1].ry + values[2].ry) : 1,
  ];
  const scale = Math.min(1, ...ratios);
  return Object.freeze(values.map(({ rx, ry }) => Object.freeze({
    rx: rx * scale,
    ry: ry * scale,
  })));
}

function canonicalPoint(rx, ry, s, theta) {
  const exponent = 2 ** Math.abs(s);
  const power = 2 / exponent;
  const sin = Math.sin(theta) ** power;
  const cos = Math.cos(theta) ** power;
  return s > 0
    ? [rx * (1 - sin), ry * (1 - cos)]
    : [rx * cos, ry * sin];
}

function pointLineDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const areaTwice = Math.abs(dx * (start[1] - point[1]) - (start[0] - point[0]) * dy);
  return areaTwice / Math.sqrt(lengthSquared);
}

function adaptiveCanonicalCorner(rx, ry, s, tolerance, maxDepth) {
  const start = [rx, 0];
  const end = [0, ry];
  const points = [start];
  const subdivide = (theta0, point0, theta1, point1, depth) => {
    const midpointTheta = (theta0 + theta1) / 2;
    const midpoint = canonicalPoint(rx, ry, s, midpointTheta);
    if (depth < maxDepth && pointLineDistance(midpoint, point0, point1) > tolerance) {
      subdivide(theta0, point0, midpointTheta, midpoint, depth + 1);
      subdivide(midpointTheta, midpoint, theta1, point1, depth + 1);
    } else points.push(point1);
  };
  subdivide(0, start, Math.PI / 2, end, 0);
  points[0] = [rx, 0];
  points[points.length - 1] = [0, ry];
  return points;
}

export function sampleCanonicalCorner({ rx, ry, s }, {
  segments,
  tolerance = 0.125,
  maxDepth = 14,
} = {}) {
  finiteNonNegative(rx, "corner.rx");
  finiteNonNegative(ry, "corner.ry");
  validShapeParameter(s, "corner.s");
  if (rx === 0 || ry === 0) return Object.freeze([frozenPoint(rx, 0), frozenPoint(0, ry)]);
  if (s === Number.POSITIVE_INFINITY) {
    return Object.freeze([frozenPoint(rx, 0), frozenPoint(0, 0), frozenPoint(0, ry)]);
  }
  if (s === Number.NEGATIVE_INFINITY) {
    return Object.freeze([frozenPoint(rx, 0), frozenPoint(rx, ry), frozenPoint(0, ry)]);
  }
  if (s === 0) return Object.freeze([frozenPoint(rx, 0), frozenPoint(0, ry)]);

  let points;
  if (segments !== undefined) {
    if (!Number.isInteger(segments) || segments < 1 || segments > 4096) {
      throw new TypeError("segments must be an integer from 1 through 4096");
    }
    points = [];
    for (let index = 0; index <= segments; index += 1) {
      points.push(canonicalPoint(rx, ry, s, (index / segments) * Math.PI / 2));
    }
    points[0] = [rx, 0];
    points[points.length - 1] = [0, ry];
  } else {
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new TypeError("tolerance must be a finite positive number");
    }
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 24) {
      throw new TypeError("maxDepth must be an integer from 1 through 24");
    }
    points = adaptiveCanonicalCorner(rx, ry, s, tolerance, maxDepth);
  }
  return Object.freeze(points.map(([x, y]) => frozenPoint(x, y)));
}

function append(points, candidates, skipFirst = true) {
  for (let index = skipFirst ? 1 : 0; index < candidates.length; index += 1) {
    points.push(candidates[index]);
  }
}

function mapped(points, mapper, reverse = false) {
  const source = reverse ? [...points].reverse() : points;
  return source.map(([x, y]) => frozenPoint(...mapper(x, y)));
}

function cornerCurve(index, width, height, radius, shapeParameter, options) {
  const canonical = sampleCanonicalCorner({ ...radius, s: shapeParameter }, options);
  if (index === 0) return mapped(canonical, (x, y) => [x, y]);
  if (index === 1) return mapped(canonical, (x, y) => [width - x, y]);
  if (index === 2) return mapped(canonical, (x, y) => [width - x, height - y], true);
  return mapped(canonical, (x, y) => [x, height - y]);
}

function outerCorner(index, width, height) {
  if (index === 0) return frozenPoint(0, 0);
  if (index === 1) return frozenPoint(width, 0);
  if (index === 2) return frozenPoint(width, height);
  return frozenPoint(0, height);
}

function convexHull(points) {
  const unique = [...new Map(points.map(([x, y]) => [`${x},${y}`, [x, y]])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return unique;
  const cross = (origin, a, b) => (
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])
  );
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function projection(polygon, axisX, axisY) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [x, y] of polygon) {
    const value = x * axisX + y * axisY;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

export function convexPolygonsOverlap(first, second, epsilon = INTERSECTION_EPSILON) {
  if (first.length < 3 || second.length < 3) return false;
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const axisX = -(next[1] - current[1]);
      const axisY = next[0] - current[0];
      const [firstMin, firstMax] = projection(first, axisX, axisY);
      const [secondMin, secondMax] = projection(second, axisX, axisY);
      if (firstMax <= secondMin + epsilon || secondMax <= firstMin + epsilon) return false;
    }
  }
  return true;
}

function normalizedInnerCornerHull(shapeParameter) {
  if (!(shapeParameter < 0)) return [[1, 1], [1, 0], [0, 1]];
  if (shapeParameter === Number.NEGATIVE_INFINITY) {
    return [[1, 1], [1, 0], [1, 1], [0, 1]];
  }
  // The draft's signed interpolation coordinate points the concave hull in the
  // wrong direction. Use the unflipped convex half-corner called out in CSSWG
  // issue 14157 while retaining the draft's tangent-intersection construction.
  const exponent = 2 ** Math.abs(shapeParameter);
  const half = 0.5 ** (1 / exponent);
  const other = 1 - half;
  const denominatorA = other;
  const denominatorB = half;
  const intersectionA = [
    1,
    other - (half * (1 - half)) / denominatorA,
  ];
  const intersectionB = [
    half - (other * (1 - other)) / denominatorB,
    1,
  ];
  return [[1, 1], [1, 0], intersectionA, intersectionB, [0, 1]];
}

function rotateNormalized([x, y], quarterTurns) {
  if (quarterTurns === 0) return [x, y];
  if (quarterTurns === 1) return [1 - y, x];
  if (quarterTurns === 2) return [1 - x, 1 - y];
  return [y, 1 - x];
}

function mappedInnerHull(index, width, height, radius, shapeParameter) {
  if (radius.rx === 0 || radius.ry === 0) return { origin: [0, 0], polygon: [] };
  const quarterTurns = index === 1 ? 0 : index === 2 ? 1 : index === 3 ? 2 : 3;
  const originX = index === 1 || index === 2 ? width - radius.rx : 0;
  const originY = index === 2 || index === 3 ? height - radius.ry : 0;
  const mappedHull = normalizedInnerCornerHull(shapeParameter).map((point) => {
    const [x, y] = rotateNormalized(point, quarterTurns);
    return [originX + x * radius.rx, originY + y * radius.ry];
  });
  return {
    origin: mappedHull[0],
    polygon: convexHull(mappedHull),
  };
}

function scaledHull({ origin, polygon }, scale) {
  return polygon.map(([x, y]) => [
    origin[0] + (x - origin[0]) * scale,
    origin[1] + (y - origin[1]) * scale,
  ]);
}

export function oppositeCornerScaleFactor(width, height, radii, shapeParameters) {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  if (!Array.isArray(radii) || radii.length !== CORNER_COUNT
    || !Array.isArray(shapeParameters) || shapeParameters.length !== CORNER_COUNT) {
    throw new TypeError("opposite-corner inputs must contain four corners");
  }
  const diagonalPairs = [[0, 2], [1, 3]];
  let result = 1;
  for (const [first, second] of diagonalPairs) {
    if (!(shapeParameters[first] < 0 && shapeParameters[second] < 0)) continue;
    const firstHull = mappedInnerHull(first, width, height, radii[first], shapeParameters[first]);
    const secondHull = mappedInnerHull(second, width, height, radii[second], shapeParameters[second]);
    const overlaps = (scale) => convexPolygonsOverlap(
      scaledHull(firstHull, scale),
      scaledHull(secondHull, scale),
    );
    if (!overlaps(1)) continue;
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 52; iteration += 1) {
      const middle = (low + high) / 2;
      if (overlaps(middle)) high = middle;
      else low = middle;
    }
    result = Math.min(result, low);
  }
  return result;
}

export function resolveCornerRadii(width, height, radii, shapeParameters) {
  const ordinary = resolveRadii(width, height, radii);
  if (!Array.isArray(shapeParameters) || shapeParameters.length !== CORNER_COUNT) {
    throw new TypeError("shapeParameters must contain four values");
  }
  shapeParameters.forEach((value, index) => validShapeParameter(value, `shapeParameters[${index}]`));
  const oppositeScale = oppositeCornerScaleFactor(width, height, ordinary, shapeParameters);
  return Object.freeze({
    ordinaryScaleApplied: ordinary.some((radius, index) => (
      radius.rx !== radii[index].rx || radius.ry !== radii[index].ry
    )),
    oppositeScale,
    radii: Object.freeze(ordinary.map(({ rx, ry }) => Object.freeze({
      rx: rx * oppositeScale,
      ry: ry * oppositeScale,
    }))),
  });
}

function samplingOptions({ segments, tolerance, dpr = 1 } = {}) {
  if (segments !== undefined) return { segments };
  return { tolerance: tolerance ?? 0.125 / Math.max(1, dpr) };
}

export function cornerCarveOuts({
  width,
  height,
  radii,
  shapeParameters,
  segments,
  tolerance,
  dpr = 1,
  radiiAreResolved = false,
}) {
  const resolved = radiiAreResolved
    ? Object.freeze({ radii, oppositeScale: 1 })
    : resolveCornerRadii(width, height, radii, shapeParameters);
  const options = samplingOptions({ segments, tolerance, dpr });
  return Object.freeze(resolved.radii.map((radius, index) => Object.freeze([
    outerCorner(index, width, height),
    ...cornerCurve(index, width, height, radius, shapeParameters[index], options),
  ])));
}

export function contourPoints({
  width,
  height,
  radii,
  shapeParameters,
  segments,
  tolerance,
  dpr = 1,
  radiiAreResolved = false,
}) {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  if (!Array.isArray(shapeParameters) || shapeParameters.length !== CORNER_COUNT) {
    throw new TypeError("shapeParameters must contain four values");
  }
  const resolved = radiiAreResolved
    ? radii
    : resolveCornerRadii(width, height, radii, shapeParameters).radii;
  const options = samplingOptions({ segments: segments ?? (tolerance === undefined ? DEFAULT_SEGMENTS : undefined), tolerance, dpr });
  const curves = resolved.map((radius, index) => cornerCurve(
    index,
    width,
    height,
    radius,
    shapeParameters[index],
    options,
  ));
  const [topLeft, topRight, bottomRight, bottomLeft] = resolved;
  const points = [frozenPoint(topLeft.rx, 0)];

  points.push(frozenPoint(width - topRight.rx, 0));
  append(points, curves[1]);
  points.push(frozenPoint(width, height - bottomRight.ry));
  append(points, curves[2]);
  points.push(frozenPoint(bottomLeft.rx, height));
  append(points, curves[3]);
  points.push(frozenPoint(0, topLeft.ry));
  append(points, [...curves[0]].reverse());

  return Object.freeze(points);
}

export function buildCornerGeometry({
  width,
  height,
  borderRadius,
  cornerShape,
  dpr = 1,
  tolerance,
}) {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  const requestedRadii = typeof borderRadius === "string"
    ? resolveBorderRadius(borderRadius, width, height)
    : borderRadius;
  const shapeParameters = typeof cornerShape === "string" ? parseCornerShape(cornerShape) : cornerShape;
  const resolved = resolveCornerRadii(width, height, requestedRadii, shapeParameters);
  const options = { width, height, radii: resolved.radii, shapeParameters, dpr, tolerance, radiiAreResolved: true };
  return Object.freeze({
    width,
    height,
    dpr,
    shapeParameters,
    requestedRadii,
    radii: resolved.radii,
    ordinaryScaleApplied: resolved.ordinaryScaleApplied,
    oppositeScale: resolved.oppositeScale,
    contour: contourPoints(options),
    carveOuts: cornerCarveOuts(options),
  });
}

export function insetGeometry({ width, height, radii, inset }) {
  finiteNonNegative(inset, "inset");
  const innerWidth = Math.max(0, width - inset * 2);
  const innerHeight = Math.max(0, height - inset * 2);
  const innerRadii = radii.map(({ rx, ry }) => Object.freeze({
    rx: Math.max(0, rx - inset),
    ry: Math.max(0, ry - inset),
  }));
  return Object.freeze({
    x: inset,
    y: inset,
    width: innerWidth,
    height: innerHeight,
    radii: Object.freeze(innerRadii),
  });
}

function pointAdd(point, vector) {
  return [point[0] + vector[0], point[1] + vector[1]];
}

function pointSubtract(first, second) {
  return [first[0] - second[0], first[1] - second[1]];
}

function vectorScale(vector, scale) {
  return [vector[0] * scale, vector[1] * scale];
}

function unitVector(from, to) {
  const vector = pointSubtract(to, from);
  const length = Math.hypot(vector[0], vector[1]);
  return length > 1e-12 ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function lineIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const first = pointSubtract(firstEnd, firstStart);
  const second = pointSubtract(secondEnd, secondStart);
  const denominator = first[0] * second[1] - first[1] * second[0];
  if (Math.abs(denominator) < 1e-12) return null;
  const delta = pointSubtract(secondStart, firstStart);
  const t = (delta[0] * second[1] - delta[1] * second[0]) / denominator;
  return pointAdd(firstStart, vectorScale(first, t));
}

function cornerVertices(index, width, height, radius, shapeParameter) {
  const { rx, ry } = radius;
  if (index === 0) return { start: [0, ry], outer: [0, 0], end: [rx, 0], center: [rx, ry] };
  if (index === 1) return { start: [width - rx, 0], outer: [width, 0], end: [width, ry], center: [width - rx, ry] };
  if (index === 2) return { start: [width, height - ry], outer: [width, height], end: [width - rx, height], center: [width - rx, height - ry] };
  return { start: [rx, height], outer: [0, height], end: [0, height - ry], center: [rx, height - ry] };
}

function inwardDirection(index) {
  return [index === 0 || index === 3 ? 1 : -1, index === 0 || index === 1 ? 1 : -1];
}

function startsOnVerticalEdge(index) {
  return index === 0 || index === 2;
}

function adjustedBevel(corner, startInset, endInset) {
  const chord = pointSubtract(corner.end, corner.start);
  let inward = [-chord[1], chord[0]];
  const inwardLength = Math.hypot(inward[0], inward[1]);
  inward = inwardLength > 0 ? vectorScale(inward, 1 / inwardLength) : [0, 0];
  const towardCenter = pointSubtract(corner.center, corner.outer);
  if (inward[0] * towardCenter[0] + inward[1] * towardCenter[1] < 0) inward = vectorScale(inward, -1);
  const adjustedStart = pointAdd(corner.start, vectorScale(inward, startInset));
  const adjustedEnd = pointAdd(corner.end, vectorScale(inward, endInset));
  const startExtension = vectorScale(unitVector(corner.start, corner.center), startInset);
  const endExtension = vectorScale(unitVector(corner.end, corner.center), endInset);
  const clipStart = pointAdd(corner.start, startExtension);
  const clipEnd = pointAdd(corner.end, endExtension);
  const clipOuter = pointAdd(pointAdd(corner.outer, startExtension), endExtension);
  const midpoint = [(adjustedStart[0] + adjustedEnd[0]) / 2, (adjustedStart[1] + adjustedEnd[1]) / 2];
  return {
    ...corner,
    start: lineIntersection(adjustedStart, midpoint, clipStart, clipOuter) ?? adjustedStart,
    end: lineIntersection(adjustedEnd, midpoint, clipEnd, clipOuter) ?? adjustedEnd,
  };
}

function adjustedRound(corner, index, startInset, endInset) {
  const verticalInset = startsOnVerticalEdge(index) ? startInset : endInset;
  const horizontalInset = startsOnVerticalEdge(index) ? endInset : startInset;
  const outerRadiusX = Math.abs(corner.center[0] - corner.outer[0]);
  const outerRadiusY = Math.abs(corner.center[1] - corner.outer[1]);
  const radiusX = Math.max(0, outerRadiusX - verticalInset);
  const radiusY = Math.max(0, outerRadiusY - horizontalInset);
  const scale = (point) => [
    corner.center[0] + (point[0] - corner.center[0]) * (outerRadiusX > 0 ? radiusX / outerRadiusX : 0),
    corner.center[1] + (point[1] - corner.center[1]) * (outerRadiusY > 0 ? radiusY / outerRadiusY : 0),
  ];
  const direction = inwardDirection(index);
  return {
    ...corner,
    start: scale(corner.start),
    outer: [corner.outer[0] + direction[0] * verticalInset, corner.outer[1] + direction[1] * horizontalInset],
    end: scale(corner.end),
  };
}

function adjustedScoop(corner, index, startInset, endInset) {
  const verticalInset = startsOnVerticalEdge(index) ? startInset : endInset;
  const horizontalInset = startsOnVerticalEdge(index) ? endInset : startInset;
  const outerRadiusX = Math.abs(corner.center[0] - corner.outer[0]);
  const outerRadiusY = Math.abs(corner.center[1] - corner.outer[1]);
  const radiusX = outerRadiusX + horizontalInset;
  const radiusY = outerRadiusY + verticalInset;
  const extent = (radius, ratio) => radius * Math.sqrt(Math.max(0, 1 - ratio * ratio));
  const direction = inwardDirection(index);
  const side = [
    corner.outer[0] + direction[0] * verticalInset,
    corner.outer[1] + direction[1] * extent(radiusY, radiusX > 0 ? verticalInset / radiusX : 0),
  ];
  const horizontal = [
    corner.outer[0] + direction[0] * extent(radiusX, radiusY > 0 ? horizontalInset / radiusY : 0),
    corner.outer[1] + direction[1] * horizontalInset,
  ];
  return {
    ...corner,
    start: startsOnVerticalEdge(index) ? side : horizontal,
    end: startsOnVerticalEdge(index) ? horizontal : side,
  };
}

function adjustedGeneral(corner, shapeParameter, startInset, endInset) {
  let strokeA;
  let strokeB;
  if (shapeParameter === Number.NEGATIVE_INFINITY) {
    strokeA = -1;
    strokeB = 1;
  } else if (shapeParameter === Number.POSITIVE_INFINITY) {
    strokeA = 0;
    strokeB = 1;
  } else {
    const clamped = Math.min(1, Math.max(-1, shapeParameter));
    const half = 0.5 ** (2 ** -clamped);
    const direction = [half * 2 - 0.5, 1.5 - half * 2];
    const length = Math.hypot(direction[0], direction[1]);
    strokeA = -direction[1] / length;
    strokeB = direction[0] / length;
  }
  const offset1 = vectorScale(unitVector(corner.start, corner.outer), startInset * strokeA);
  const offset2 = vectorScale(unitVector(corner.outer, corner.end), startInset * strokeB);
  const offset3 = vectorScale(unitVector(corner.end, corner.center), endInset * strokeB);
  const offset4 = vectorScale(unitVector(corner.center, corner.start), endInset * strokeA);
  return {
    start: pointAdd(pointAdd(corner.start, offset1), offset2),
    outer: pointAdd(pointAdd(corner.outer, offset2), offset3),
    end: pointAdd(pointAdd(corner.end, offset3), offset4),
    center: pointAdd(pointAdd(corner.center, offset4), offset1),
  };
}

function adjustCornerForInsets(corner, index, shapeParameter, startInset, endInset) {
  if (startInset === 0 && endInset === 0) return corner;
  if (shapeParameter === 0) return adjustedBevel(corner, startInset, endInset);
  if (shapeParameter === 1) return adjustedRound(corner, index, startInset, endInset);
  if (shapeParameter === -1) return adjustedScoop(corner, index, startInset, endInset);
  return adjustedGeneral(corner, shapeParameter, startInset, endInset);
}

function mappedCornerPoint(corner, shapeParameter, theta) {
  if (shapeParameter < 0) {
    return mappedCornerPoint({
      start: corner.start,
      outer: corner.center,
      end: corner.end,
      center: corner.outer,
    }, -shapeParameter, theta);
  }
  const exponent = 2 ** shapeParameter;
  const power = 2 / exponent;
  const endWeight = Math.sin(theta) ** power;
  const startWeight = Math.cos(theta) ** power;
  return [
    corner.center[0]
      + (corner.end[0] - corner.center[0]) * endWeight
      + (corner.start[0] - corner.center[0]) * startWeight,
    corner.center[1]
      + (corner.end[1] - corner.center[1]) * endWeight
      + (corner.start[1] - corner.center[1]) * startWeight,
  ];
}

function sampleAdjustedCorner(corner, shapeParameter, tolerance, maxDepth = 14) {
  if (shapeParameter === 0) return [corner.start, corner.end];
  if (shapeParameter === Number.POSITIVE_INFINITY) return [corner.start, corner.outer, corner.end];
  if (shapeParameter === Number.NEGATIVE_INFINITY) return [corner.start, corner.center, corner.end];
  const start = corner.start;
  const end = corner.end;
  const points = [start];
  const subdivide = (theta0, point0, theta1, point1, depth) => {
    const theta = (theta0 + theta1) / 2;
    const midpoint = mappedCornerPoint(corner, shapeParameter, theta);
    if (depth < maxDepth && pointLineDistance(midpoint, point0, point1) > tolerance) {
      subdivide(theta0, point0, theta, midpoint, depth + 1);
      subdivide(theta, midpoint, theta1, point1, depth + 1);
    } else points.push(point1);
  };
  subdivide(0, start, Math.PI / 2, end, 0);
  return points;
}

function normalizeInsets(insets) {
  const values = Number.isFinite(insets)
    ? [insets, insets, insets, insets]
    : Array.isArray(insets)
      ? insets
      : [insets?.top, insets?.right, insets?.bottom, insets?.left];
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("contour insets must contain four finite non-negative sides");
  }
  return values;
}

export function insetCornerGeometry(geometry, insets, {
  tolerance = 0.125 / Math.max(1, geometry?.dpr ?? 1),
} = {}) {
  if (!geometry || typeof geometry !== "object") throw new TypeError("outer corner geometry is required");
  const [top, right, bottom, left] = normalizeInsets(insets);
  const targetRect = Object.freeze({
    x: Math.min(geometry.width, left),
    y: Math.min(geometry.height, top),
    width: Math.max(0, geometry.width - left - right),
    height: Math.max(0, geometry.height - top - bottom),
  });
  if (targetRect.width === 0 || targetRect.height === 0) {
    return Object.freeze({ targetRect, contour: Object.freeze([]), corners: Object.freeze([]) });
  }
  const startInsets = [left, top, right, bottom];
  const endInsets = [top, right, bottom, left];
  const corners = geometry.radii.map((radius, index) => adjustCornerForInsets(
    cornerVertices(index, geometry.width, geometry.height, radius, geometry.shapeParameters[index]),
    index,
    geometry.shapeParameters[index],
    startInsets[index],
    endInsets[index],
  ));
  const curves = corners.map((corner, index) => sampleAdjustedCorner(
    corner,
    geometry.shapeParameters[index],
    tolerance,
  ));
  const points = [curves[0].at(-1)];
  points.push(curves[1][0]);
  append(points, curves[1]);
  points.push(curves[2][0]);
  append(points, curves[2]);
  points.push(curves[3][0]);
  append(points, curves[3]);
  points.push(curves[0][0]);
  append(points, curves[0]);
  return Object.freeze({
    targetRect,
    contour: Object.freeze(points.map(([x, y]) => frozenPoint(x, y))),
    corners: Object.freeze(corners.map((corner) => Object.freeze({
      start: frozenPoint(...corner.start),
      outer: frozenPoint(...corner.outer),
      end: frozenPoint(...corner.end),
      center: frozenPoint(...corner.center),
    }))),
  });
}
