import {
  parseCornerShape,
  resolveBorderRadius,
} from "./values.mjs";
import type { Four, ResolvedCornerRadius } from "./values.mjs";

export type Point = readonly [x: number, y: number];
export type Radius = Readonly<ResolvedCornerRadius>;

export interface CanonicalCorner {
  readonly rx: number;
  readonly ry: number;
  readonly s: number;
}

export interface CornerSamplingOptions {
  readonly maxDepth?: number | undefined;
  readonly segments?: number | undefined;
  readonly tolerance?: number | undefined;
}

interface SamplingOptions extends CornerSamplingOptions {
  readonly dpr?: number | undefined;
}

export interface CornerGeometryOptions {
  readonly borderRadius: string | Four<Radius>;
  readonly cornerShape: string | Four<number>;
  readonly dpr?: number;
  readonly height: number;
  readonly tolerance?: number | undefined;
  readonly width: number;
}

export interface ResolvedCornerRadii {
  readonly ordinaryScaleApplied: boolean;
  readonly oppositeScale: number;
  readonly radii: Four<Radius>;
}

export interface CornerContourOptions {
  readonly dpr?: number | undefined;
  readonly height: number;
  readonly radii: Four<Radius>;
  readonly radiiAreResolved?: boolean | undefined;
  readonly segments?: number | undefined;
  readonly shapeParameters: Four<number>;
  readonly tolerance?: number | undefined;
  readonly width: number;
}

export interface CornerGeometry {
  readonly carveOuts: Four<readonly Point[]>;
  readonly contour: readonly Point[];
  readonly dpr: number;
  readonly height: number;
  readonly oppositeScale: number;
  readonly ordinaryScaleApplied: boolean;
  readonly radii: Four<Radius>;
  readonly requestedRadii: Four<Radius>;
  readonly shapeParameters: Four<number>;
  readonly width: number;
}

export interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface CornerVertices {
  readonly center: Point;
  readonly end: Point;
  readonly outer: Point;
  readonly start: Point;
}

export interface InsetCornerGeometry {
  readonly contour: readonly Point[];
  readonly corners: readonly Readonly<CornerVertices>[];
  readonly targetRect: Readonly<Rect>;
}

export type CornerInsets =
  | number
  | Four<number>
  | Readonly<{ bottom: number; left: number; right: number; top: number }>;

interface CornerHull {
  readonly origin: Point;
  readonly polygon: readonly Point[];
}

interface SegmentIntersection {
  readonly firstRatio: number;
  readonly point: Point;
  readonly secondRatio: number;
}

interface TrimmedCurves {
  readonly next: Point[];
  readonly previous: Point[];
}

interface AdjustedCornerVertices extends CornerVertices {
  readonly scoopRadii?: Point;
}

type InsetCacheValue = InsetCornerGeometry | typeof UNSUPPORTED_INSET_TOPOLOGY;
type InsetCache = Map<string, InsetCacheValue>;

const CORNER_COUNT = 4;
const INTERSECTION_EPSILON = 1e-9;
const FLOATING_SHAPE_LIMIT = 54;
const CONCAVE_SAFETY_SEGMENTS = 256;
const CONCAVE_SAFETY_MARGIN = 1e-5;
const MAX_ADAPTIVE_DEPTH = 14;
const MAX_INSET_ADAPTIVE_DEPTH = 8;
const MAX_INSET_CACHE_ENTRIES = 16;
const MAX_ADAPTIVE_CURVE_POINTS = 2 ** MAX_ADAPTIVE_DEPTH + 1;
const MAX_CONTOUR_POINTS = 1 + CORNER_COUNT * MAX_ADAPTIVE_CURVE_POINTS;
const MAX_CARVE_OUT_POINTS = MAX_ADAPTIVE_CURVE_POINTS + 1;
// 52 bisections reach the precision limit of a finite IEEE-754 mantissa.
const INTERSECTION_BISECTION_ITERATIONS = 52;
const UNSUPPORTED_INSET_TOPOLOGY = Symbol("unsupported inset topology");
const INSET_TOPOLOGY_ERROR = "shaped inset contour self-intersects after clipping and is unsupported";
const insetGeometryCache = new WeakMap<CornerGeometry, InsetCache>();
const trustedCornerGeometries = new WeakSet<CornerGeometry>();

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number`);
  }
  return value;
}

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a finite positive number`);
  }
  return value;
}

function validShapeParameter(value: number, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new TypeError(`${label} must be a number or signed infinity`);
  }
  return value;
}

function frozenPoint(x: number, y: number): Point {
  return Object.freeze([x, y]);
}

function frozenFour<T>(first: T, second: T, third: T, fourth: T): Four<T> {
  return Object.freeze([first, second, third, fourth]);
}

function normalizedRadius(input: unknown, index: number): Radius {
  const corner = input !== null && typeof input === "object"
    ? input as Partial<Radius>
    : null;
  return Object.freeze({
    rx: finiteNonNegative(corner?.rx, `radii[${index}].rx`),
    ry: finiteNonNegative(corner?.ry, `radii[${index}].ry`),
  });
}

function normalizedRadii(radii: Four<Radius>): Four<Radius> {
  if (!Array.isArray(radii) || radii.length !== CORNER_COUNT) {
    throw new TypeError("radii must contain top-left, top-right, bottom-right, bottom-left");
  }
  const input: readonly unknown[] = radii;
  return frozenFour(
    normalizedRadius(input[0], 0),
    normalizedRadius(input[1], 1),
    normalizedRadius(input[2], 2),
    normalizedRadius(input[3], 3),
  );
}

function normalizedShapeParameters(input: unknown, label = "shapeParameters"): Four<number> {
  if (!Array.isArray(input) || input.length !== CORNER_COUNT) {
    throw new TypeError(`${label} must contain four values`);
  }
  return frozenFour(
    validShapeParameter(input[0], `${label}[0]`),
    validShapeParameter(input[1], `${label}[1]`),
    validShapeParameter(input[2], `${label}[2]`),
    validShapeParameter(input[3], `${label}[3]`),
  );
}

function overlapRatio(available: number, first: number, second: number): number {
  const scale = Math.max(first, second);
  if (scale === 0) return 1;
  return (available / scale) / (first / scale + second / scale);
}

export function resolveRadii(
  width: number,
  height: number,
  radii: Four<Radius>,
): Four<Radius> {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  const values = normalizedRadii(radii);
  const ratios = [
    overlapRatio(width, values[0].rx, values[1].rx),
    overlapRatio(width, values[3].rx, values[2].rx),
    overlapRatio(height, values[0].ry, values[3].ry),
    overlapRatio(height, values[1].ry, values[2].ry),
  ];
  const scale = Math.min(1, ...ratios);
  const scaleRadius = ({ rx, ry }: Radius): Radius => Object.freeze({
    rx: rx * scale,
    ry: ry * scale,
  });
  return frozenFour(
    scaleRadius(values[0]),
    scaleRadius(values[1]),
    scaleRadius(values[2]),
    scaleRadius(values[3]),
  );
}

function canonicalPoint(rx: number, ry: number, s: number, theta: number): Point {
  const exponent = 2 ** Math.abs(s);
  const power = 2 / exponent;
  const sin = Math.sin(theta) ** power;
  const cos = Math.cos(theta) ** power;
  return s > 0
    ? [rx * (1 - sin), ry * (1 - cos)]
    : [rx * cos, ry * sin];
}

function pointLineDistance(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(
    (dx / length) * (start[1] - point[1])
    - (dy / length) * (start[0] - point[0]),
  );
}

function sampleAdaptiveCurve(
  startParameter: number,
  start: Point,
  endParameter: number,
  end: Point,
  pointAt: (parameter: number) => Point,
  tolerance: number,
  maxDepth: number,
): Point[] {
  const points: Point[] = [start];
  const subdivide = (
    parameter0: number,
    point0: Point,
    parameter1: number,
    point1: Point,
    depth: number,
  ): void => {
    const parameter = (parameter0 + parameter1) / 2;
    const midpoint = pointAt(parameter);
    if (depth < maxDepth && pointLineDistance(midpoint, point0, point1) > tolerance) {
      subdivide(parameter0, point0, parameter, midpoint, depth + 1);
      subdivide(parameter, midpoint, parameter1, point1, depth + 1);
    } else points.push(point1);
  };
  subdivide(startParameter, start, endParameter, end, 0);
  return points;
}

function adaptiveCanonicalCorner(
  rx: number,
  ry: number,
  s: number,
  tolerance: number,
  maxDepth: number,
): Point[] {
  const start: Point = [rx, 0];
  const end: Point = [0, ry];
  const points = sampleAdaptiveCurve(
    0,
    start,
    Math.PI / 2,
    end,
    (theta) => canonicalPoint(rx, ry, s, theta),
    tolerance,
    maxDepth,
  );
  points[0] = [rx, 0];
  points[points.length - 1] = [0, ry];
  return points;
}

export function sampleCanonicalCorner({ rx, ry, s }: CanonicalCorner, {
  segments,
  tolerance = 0.125,
  maxDepth = 14,
}: CornerSamplingOptions = {}): readonly Point[] {
  finiteNonNegative(rx, "corner.rx");
  finiteNonNegative(ry, "corner.ry");
  validShapeParameter(s, "corner.s");
  if (segments !== undefined) {
    if (!Number.isInteger(segments) || segments < 1 || segments > 4096) {
      throw new TypeError("segments must be an integer from 1 through 4096");
    }
  } else {
    finitePositive(tolerance, "tolerance");
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_ADAPTIVE_DEPTH) {
      throw new TypeError(`maxDepth must be an integer from 1 through ${MAX_ADAPTIVE_DEPTH}`);
    }
  }
  if (rx === 0 || ry === 0) return Object.freeze([frozenPoint(rx, 0), frozenPoint(0, ry)]);
  if (s === Number.POSITIVE_INFINITY || s >= FLOATING_SHAPE_LIMIT) {
    return Object.freeze([frozenPoint(rx, 0), frozenPoint(0, 0), frozenPoint(0, ry)]);
  }
  if (s === Number.NEGATIVE_INFINITY || s <= -FLOATING_SHAPE_LIMIT) {
    return Object.freeze([frozenPoint(rx, 0), frozenPoint(rx, ry), frozenPoint(0, ry)]);
  }
  if (s === 0) return Object.freeze([frozenPoint(rx, 0), frozenPoint(0, ry)]);

  let points: Point[];
  if (segments !== undefined) {
    points = [];
    for (let index = 0; index <= segments; index += 1) {
      points.push(canonicalPoint(rx, ry, s, (index / segments) * Math.PI / 2));
    }
    points[0] = [rx, 0];
    points[points.length - 1] = [0, ry];
  } else {
    points = adaptiveCanonicalCorner(rx, ry, s, tolerance, maxDepth);
  }
  return Object.freeze(points.map(([x, y]) => frozenPoint(x, y)));
}

function append(points: Point[], candidates: readonly Point[], skipFirst = true): void {
  for (let index = skipFirst ? 1 : 0; index < candidates.length; index += 1) {
    points.push(candidates[index]!);
  }
}

function mapped(
  points: readonly Point[],
  mapper: (x: number, y: number) => Point,
  reverse = false,
): readonly Point[] {
  const source = reverse ? [...points].reverse() : points;
  return source.map(([x, y]) => frozenPoint(...mapper(x, y)));
}

function cornerCurve(
  index: number,
  width: number,
  height: number,
  radius: Radius,
  shapeParameter: number,
  options: CornerSamplingOptions,
): readonly Point[] {
  const canonical = sampleCanonicalCorner({ ...radius, s: shapeParameter }, options);
  if (index === 0) return mapped(canonical, (x, y) => [x, y]);
  if (index === 1) return mapped(canonical, (x, y) => [width - x, y]);
  if (index === 2) return mapped(canonical, (x, y) => [width - x, height - y], true);
  return mapped(canonical, (x, y) => [x, height - y]);
}

function outerCorner(index: number, width: number, height: number): Point {
  if (index === 0) return frozenPoint(0, 0);
  if (index === 1) return frozenPoint(width, 0);
  if (index === 2) return frozenPoint(width, height);
  return frozenPoint(0, height);
}

function convexHull(points: readonly Point[]): Point[] {
  const unique = [...new Map<string, Point>(points.map(([x, y]) => [
    `${x},${y}`,
    [x, y],
  ])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return unique;
  const cross = (origin: Point, a: Point, b: Point): number => (
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])
  );
  const lower: Point[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function projection(polygon: readonly Point[], axisX: number, axisY: number): Point {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [x, y] of polygon) {
    const value = x * axisX + y * axisY;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}

function normalizedAxis(current: Point, next: Point): Point | null {
  const axisX = -(next[1] - current[1]);
  const axisY = next[0] - current[0];
  const length = Math.hypot(axisX, axisY);
  if (length <= INTERSECTION_EPSILON) return null;
  return [axisX / length, axisY / length];
}

export function convexPolygonsOverlap(
  first: readonly Point[],
  second: readonly Point[],
  epsilon = INTERSECTION_EPSILON,
): boolean {
  finiteNonNegative(epsilon, "epsilon");
  const finitePoints = (points: readonly Point[], label: string): Point[] => {
    if (!Array.isArray(points)) throw new TypeError(`${label} must be an array of points`);
    const result = new Array<Point>(points.length);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!Array.isArray(point) || point.length !== 2
        || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        throw new TypeError(`${label}[${index}] must contain two finite coordinates`);
      }
      result[index] = [point[0], point[1]];
    }
    return result;
  };
  const firstPoints = finitePoints(first, "first polygon");
  const secondPoints = finitePoints(second, "second polygon");
  let coordinateScale = 1;
  for (const points of [firstPoints, secondPoints]) {
    for (const [x, y] of points) {
      coordinateScale = Math.max(coordinateScale, Math.abs(x), Math.abs(y));
    }
  }
  const scaledHull = (points: readonly Point[]): Point[] => convexHull(points.map(([x, y]) => (
    [x / coordinateScale, y / coordinateScale]
  )));
  const firstHull = scaledHull(firstPoints);
  const secondHull = scaledHull(secondPoints);
  const scaledEpsilon = epsilon / coordinateScale;
  if (firstHull.length < 3 || secondHull.length < 3) return false;

  // The origin is inside A + (-B) exactly when the two convex polygons overlap.
  // Merging the already angle-ordered hull edges keeps this O(n log n) overall
  // (the hull sorts dominate) instead of projecting every vertex onto every edge.
  const rotatedFromLowest = (polygon: readonly Point[]): Point[] => {
    let start = 0;
    for (let index = 1; index < polygon.length; index += 1) {
      const point = polygon[index]!;
      const current = polygon[start]!;
      if (point[1] < current[1] || (point[1] === current[1] && point[0] < current[0])) start = index;
    }
    return [...polygon.slice(start), ...polygon.slice(0, start)];
  };
  const firstOrdered = rotatedFromLowest(firstHull);
  const secondOrdered = rotatedFromLowest(secondHull.map(([x, y]) => [-x, -y]));
  const edges = (polygon: readonly Point[]): Point[] => polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return [next[0] - point[0], next[1] - point[1]];
  });
  const firstEdges = edges(firstOrdered);
  const secondEdges = edges(secondOrdered);
  const half = ([x, y]: Point): number => (y > 0 || (y === 0 && x >= 0) ? 0 : 1);
  const edgeOrder = (firstEdge: Point, secondEdge: Point): number => {
    const halfDifference = half(firstEdge) - half(secondEdge);
    if (halfDifference !== 0) return halfDifference;
    const cross = firstEdge[0] * secondEdge[1] - firstEdge[1] * secondEdge[0];
    return cross > 0 ? -1 : cross < 0 ? 1 : 0;
  };
  let firstIndex = 0;
  let secondIndex = 0;
  let current: Point = [
    firstOrdered[0]![0] + secondOrdered[0]![0],
    firstOrdered[0]![1] + secondOrdered[0]![1],
  ];
  const difference: Point[] = [current];
  while (firstIndex < firstEdges.length || secondIndex < secondEdges.length) {
    const firstEdge = firstEdges[firstIndex];
    const secondEdge = secondEdges[secondIndex];
    const order = firstEdge && secondEdge ? edgeOrder(firstEdge, secondEdge) : firstEdge ? -1 : 1;
    const edge: Point = order === 0
      ? [firstEdge![0] + secondEdge![0], firstEdge![1] + secondEdge![1]]
      : order < 0 ? firstEdge! : secondEdge!;
    if (order <= 0) firstIndex += 1;
    if (order >= 0) secondIndex += 1;
    current = [current[0] + edge[0], current[1] + edge[1]];
    difference.push(current);
  }
  difference.pop();
  for (let index = 0; index < difference.length; index += 1) {
    const point = difference[index]!;
    const next = difference[(index + 1) % difference.length]!;
    const edgeX = next[0] - point[0];
    const edgeY = next[1] - point[1];
    const length = Math.hypot(edgeX, edgeY);
    if (length <= INTERSECTION_EPSILON) continue;
    const inwardDistance = (edgeX * -point[1] - edgeY * -point[0]) / length;
    if (inwardDistance <= scaledEpsilon) return false;
  }
  return true;
}

function normalizedInnerCornerHull(shapeParameter: number): readonly Point[] {
  if (!(shapeParameter < 0)) return [[1, 1], [1, 0], [0, 1]];
  // The draft's signed interpolation coordinate points the concave hull in the
  // wrong direction. Use the unflipped convex half-corner called out in CSSWG
  // issue 14157 while retaining the draft's tangent-intersection construction.
  // Simplifying the tangent intersections avoids the 0 / 0 discontinuity as
  // finite parameters approach notch. At floating-point precision, |s| >= 54
  // is indistinguishable from the corresponding exact limiting keyword.
  const half = shapeParameter <= -FLOATING_SHAPE_LIMIT
    ? 1
    : 0.5 ** (1 / (2 ** Math.abs(shapeParameter)));
  const tangentExtent = 2 * half - 1;
  const intersectionA: Point = [1, -tangentExtent];
  const intersectionB: Point = [tangentExtent, 1];
  return [[1, 1], [1, 0], intersectionA, intersectionB, [0, 1]];
}

function rotateNormalized([x, y]: Point, quarterTurns: number): Point {
  if (quarterTurns === 0) return [x, y];
  if (quarterTurns === 1) return [1 - y, x];
  if (quarterTurns === 2) return [1 - x, 1 - y];
  return [y, 1 - x];
}

function mappedInnerHull(
  index: number,
  width: number,
  height: number,
  radius: Radius,
  shapeParameter: number,
): CornerHull {
  if (radius.rx === 0 || radius.ry === 0) return { origin: [0, 0], polygon: [] };
  const quarterTurns = index === 1 ? 0 : index === 2 ? 1 : index === 3 ? 2 : 3;
  const originX = index === 1 || index === 2 ? width - radius.rx : 0;
  const originY = index === 2 || index === 3 ? height - radius.ry : 0;
  const mappedHull = normalizedInnerCornerHull(shapeParameter).map((point): Point => {
    const [x, y] = rotateNormalized(point, quarterTurns);
    return [originX + x * radius.rx, originY + y * radius.ry];
  });
  return {
    origin: mappedHull[0]!,
    polygon: convexHull(mappedHull),
  };
}

function scaleOverlapTester(first: CornerHull, second: CornerHull): (scale: number) => boolean {
  const axes: Array<{
    firstOrigin: number;
    firstProjection: Point;
    secondOrigin: number;
    secondProjection: Point;
  }> = [];
  for (const polygon of [first.polygon, second.polygon]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]!;
      const next = polygon[(index + 1) % polygon.length]!;
      const axis = normalizedAxis(current, next);
      if (!axis) continue;
      const [axisX, axisY] = axis;
      axes.push({
        firstProjection: projection(first.polygon, axisX, axisY),
        secondProjection: projection(second.polygon, axisX, axisY),
        firstOrigin: first.origin[0] * axisX + first.origin[1] * axisY,
        secondOrigin: second.origin[0] * axisX + second.origin[1] * axisY,
      });
    }
  }
  return (scale: number): boolean => {
    if (first.polygon.length < 3 || second.polygon.length < 3) return false;
    for (const axis of axes) {
      const firstMin = axis.firstOrigin + (axis.firstProjection[0] - axis.firstOrigin) * scale;
      const firstMax = axis.firstOrigin + (axis.firstProjection[1] - axis.firstOrigin) * scale;
      const secondMin = axis.secondOrigin + (axis.secondProjection[0] - axis.secondOrigin) * scale;
      const secondMax = axis.secondOrigin + (axis.secondProjection[1] - axis.secondOrigin) * scale;
      if (firstMax <= secondMin + INTERSECTION_EPSILON
        || secondMax <= firstMin + INTERSECTION_EPSILON) return false;
    }
    return true;
  };
}

function highestNonOverlappingScale(first: CornerHull, second: CornerHull, maximum = 1): number {
  const overlaps = scaleOverlapTester(first, second);
  if (!overlaps(maximum)) return maximum;
  let low = 0;
  let high = maximum;
  for (let iteration = 0; iteration < INTERSECTION_BISECTION_ITERATIONS; iteration += 1) {
    const middle = (low + high) / 2;
    if (overlaps(middle)) high = middle;
    else low = middle;
  }
  return low;
}

function mappedCarveOutHull(
  index: number,
  width: number,
  height: number,
  radius: Radius,
  shapeParameter: number,
): CornerHull {
  const origin = outerCorner(index, width, height);
  return {
    origin,
    polygon: convexHull([
      origin,
      ...cornerCurve(index, width, height, radius, shapeParameter, {
        segments: CONCAVE_SAFETY_SEGMENTS,
      }),
    ]),
  };
}

export function oppositeCornerScaleFactor(
  width: number,
  height: number,
  radii: Four<Radius>,
  shapeParameters: Four<number>,
): number {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  if (!Array.isArray(radii) || radii.length !== CORNER_COUNT) {
    throw new TypeError("opposite-corner inputs must contain four corners");
  }
  const values = normalizedRadii(radii);
  const shapes = normalizedShapeParameters(shapeParameters);
  const diagonalPairs = [[0, 2], [1, 3]] as const;
  let result = 1;
  for (const [first, second] of diagonalPairs) {
    if (!(shapes[first] < 0 || shapes[second] < 0)) continue;
    const firstHull = mappedInnerHull(first, width, height, values[first], shapes[first]);
    const secondHull = mappedInnerHull(second, width, height, values[second], shapes[second]);
    result = Math.min(result, highestNonOverlappingScale(firstHull, secondHull, result));

    // The editor's current tangent hull has a known concave-direction defect.
    // Enforce its stated no-overlap invariant against the contour Cornerfill
    // actually paints as a conservative second constraint.
    const firstCarveOut = mappedCarveOutHull(
      first,
      width,
      height,
      values[first],
      shapes[first],
    );
    const secondCarveOut = mappedCarveOutHull(
      second,
      width,
      height,
      values[second],
      shapes[second],
    );
    const safeScale = highestNonOverlappingScale(firstCarveOut, secondCarveOut, result);
    if (safeScale < result) result = Math.max(0, safeScale - CONCAVE_SAFETY_MARGIN);
  }
  return result;
}

export function resolveCornerRadii(
  width: number,
  height: number,
  radii: Four<Radius>,
  shapeParameters: Four<number>,
): Readonly<ResolvedCornerRadii> {
  const requested = normalizedRadii(radii);
  const ordinary = resolveRadii(width, height, requested);
  const shapes = normalizedShapeParameters(shapeParameters);
  const oppositeScale = oppositeCornerScaleFactor(width, height, ordinary, shapes);
  return Object.freeze({
    ordinaryScaleApplied: ordinary.some((radius, index) => (
      radius.rx !== requested[index]!.rx || radius.ry !== requested[index]!.ry
    )),
    oppositeScale,
    radii: Object.freeze(ordinary.map(({ rx, ry }) => Object.freeze({
      rx: rx * oppositeScale,
      ry: ry * oppositeScale,
    }))) as Four<Radius>,
  });
}

function samplingOptions({ segments, tolerance, dpr = 1 }: SamplingOptions = {}): CornerSamplingOptions {
  finitePositive(dpr, "dpr");
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
}: CornerContourOptions): Four<readonly Point[]> {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  const shapes = normalizedShapeParameters(shapeParameters);
  const values = normalizedRadii(radii);
  const resolved = radiiAreResolved
    ? Object.freeze({ radii: values, oppositeScale: 1 })
    : resolveCornerRadii(width, height, values, shapes);
  const options = samplingOptions({ segments, tolerance, dpr });
  return Object.freeze(resolved.radii.map((radius, index) => Object.freeze([
    outerCorner(index, width, height),
    ...cornerCurve(index, width, height, radius, shapes[index]!, options),
  ]))) as Four<readonly Point[]>;
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
}: CornerContourOptions): readonly Point[] {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  const shapes = normalizedShapeParameters(shapeParameters);
  const values = normalizedRadii(radii);
  const resolved = radiiAreResolved
    ? values
    : resolveCornerRadii(width, height, values, shapes).radii;
  const options = samplingOptions({ segments, tolerance, dpr });
  const curves = resolved.map((radius, index) => cornerCurve(
    index,
    width,
    height,
    radius,
    shapes[index]!,
    options,
  ));
  const topLeft = resolved[0]!;
  const topRight = resolved[1]!;
  const bottomRight = resolved[2]!;
  const bottomLeft = resolved[3]!;
  const points: Point[] = [frozenPoint(topLeft.rx, 0)];

  points.push(frozenPoint(width - topRight.rx, 0));
  append(points, curves[1]!);
  points.push(frozenPoint(width, height - bottomRight.ry));
  append(points, curves[2]!);
  points.push(frozenPoint(bottomLeft.rx, height));
  append(points, curves[3]!);
  points.push(frozenPoint(0, topLeft.ry));
  append(points, [...curves[0]!].reverse());
  if (points.length > 1
    && points[0]![0] === points.at(-1)![0]
    && points[0]![1] === points.at(-1)![1]) points.pop();

  return Object.freeze(points);
}

export function buildCornerGeometry({
  width,
  height,
  borderRadius,
  cornerShape,
  dpr = 1,
  tolerance,
}: CornerGeometryOptions): Readonly<CornerGeometry> {
  finiteNonNegative(width, "width");
  finiteNonNegative(height, "height");
  finitePositive(dpr, "dpr");
  const radiusInput = typeof borderRadius === "string"
    ? resolveBorderRadius(borderRadius, width, height)
    : borderRadius;
  const requestedRadii = normalizedRadii(radiusInput);
  const shapeInput = typeof cornerShape === "string" ? parseCornerShape(cornerShape) : cornerShape;
  const shapeParameters = normalizedShapeParameters(shapeInput, "cornerShape");
  const resolved = resolveCornerRadii(width, height, requestedRadii, shapeParameters);
  const options = { width, height, radii: resolved.radii, shapeParameters, dpr, tolerance, radiiAreResolved: true };
  const geometry = Object.freeze({
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
  trustedCornerGeometries.add(geometry);
  return geometry;
}

function assertCornerGeometry(geometry: CornerGeometry): void {
  if (!geometry || typeof geometry !== "object") throw new TypeError("outer corner geometry is required");
  if (trustedCornerGeometries.has(geometry)) return;

  finiteNonNegative(geometry.width, "geometry.width");
  finiteNonNegative(geometry.height, "geometry.height");
  finitePositive(geometry.dpr, "geometry.dpr");
  if (typeof geometry.ordinaryScaleApplied !== "boolean") {
    throw new TypeError("geometry.ordinaryScaleApplied must be boolean");
  }
  if (!Number.isFinite(geometry.oppositeScale)
    || geometry.oppositeScale < 0 || geometry.oppositeScale > 1) {
    throw new TypeError("geometry.oppositeScale must be finite and between zero and one");
  }

  const assertFour = (value: unknown, label: string): readonly unknown[] => {
    if (!Array.isArray(value) || value.length !== CORNER_COUNT) {
      throw new TypeError(`${label} must contain four corners`);
    }
    return value;
  };
  for (const label of ["requestedRadii", "radii"] as const) {
    const values = assertFour(geometry[label], `geometry.${label}`);
    for (let index = 0; index < CORNER_COUNT; index += 1) {
      const value = values[index];
      const radius = value !== null && typeof value === "object" ? value as Partial<Radius> : null;
      finiteNonNegative(radius?.rx, `geometry.${label}[${index}].rx`);
      finiteNonNegative(radius?.ry, `geometry.${label}[${index}].ry`);
    }
  }
  const shapeParameters = assertFour(geometry.shapeParameters, "geometry.shapeParameters");
  for (let index = 0; index < CORNER_COUNT; index += 1) {
    validShapeParameter(shapeParameters[index] as number, `geometry.shapeParameters[${index}]`);
  }

  const assertPoints = (value: unknown, label: string, maximum: number): void => {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of points`);
    if (value.length > maximum) {
      throw new RangeError(`${label} exceeds the production geometry point bound of ${maximum}`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const point = value[index];
      if (!Array.isArray(point) || point.length !== 2
        || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        throw new TypeError(`${label}[${index}] must contain two finite coordinates`);
      }
    }
  };
  assertPoints(geometry.contour, "geometry.contour", MAX_CONTOUR_POINTS);
  const carveOuts = assertFour(geometry.carveOuts, "geometry.carveOuts");
  for (let index = 0; index < CORNER_COUNT; index += 1) {
    assertPoints(
      carveOuts[index],
      `geometry.carveOuts[${index}]`,
      MAX_CARVE_OUT_POINTS,
    );
  }
  assertCornerGeometryContourStructure(geometry);
}

function assertCornerGeometryContourStructure(geometry: CornerGeometry): void {
  const epsilon = Math.max(1, geometry.width, geometry.height) * 1e-9;
  const samePoint = (first: Point, second: Point): boolean => (
    Math.abs(first[0] - second[0]) <= epsilon
    && Math.abs(first[1] - second[1]) <= epsilon
  );
  const canonicalPointForCorner = (index: number, point: Point): Point => {
    if (index === 0) return [point[0], point[1]];
    if (index === 1) return [geometry.width - point[0], point[1]];
    if (index === 2) return [geometry.width - point[0], geometry.height - point[1]];
    return [point[0], geometry.height - point[1]];
  };
  const curves: Point[][] = [];
  for (let index = 0; index < CORNER_COUNT; index += 1) {
    const carveOut = geometry.carveOuts[index]!;
    if (carveOut.length < 3 || !samePoint(carveOut[0]!, outerCorner(index, geometry.width, geometry.height))) {
      throw new TypeError(`geometry.carveOuts[${index}] is not a Cornerfill corner carve-out`);
    }
    const curve = carveOut.slice(1) as Point[];
    const canonical = curve.map((point) => canonicalPointForCorner(index, point));
    if (index === 2) canonical.reverse();
    const radius = geometry.radii[index]!;
    if (!samePoint(canonical[0]!, [radius.rx, 0])
      || !samePoint(canonical.at(-1)!, [0, radius.ry])) {
      throw new TypeError(`geometry.carveOuts[${index}] does not meet its resolved corner radius`);
    }
    for (let pointIndex = 0; pointIndex < canonical.length; pointIndex += 1) {
      const point = canonical[pointIndex]!;
      if (point[0] < -epsilon || point[0] > radius.rx + epsilon
        || point[1] < -epsilon || point[1] > radius.ry + epsilon) {
        throw new TypeError(`geometry.carveOuts[${index}] leaves its resolved corner bounds`);
      }
      const previous = canonical[pointIndex - 1];
      if (previous && (point[0] > previous[0] + epsilon || point[1] < previous[1] - epsilon)) {
        throw new TypeError(`geometry.carveOuts[${index}] is not a monotonic corner curve`);
      }
    }
    curves.push(curve);
  }

  const [topLeft, topRight, bottomRight, bottomLeft] = geometry.radii;
  const expected: Point[] = [[topLeft.rx, 0], [geometry.width - topRight.rx, 0]];
  append(expected, curves[1]!);
  expected.push([geometry.width, geometry.height - bottomRight.ry]);
  append(expected, curves[2]!);
  expected.push([bottomLeft.rx, geometry.height]);
  append(expected, curves[3]!);
  expected.push([0, topLeft.ry]);
  append(expected, [...curves[0]!].reverse());
  if (expected.length > 1 && samePoint(expected[0]!, expected.at(-1)!)) expected.pop();
  if (geometry.contour.length !== expected.length
    || geometry.contour.some((point, index) => !samePoint(point, expected[index]!))) {
    throw new TypeError("geometry.contour is inconsistent with its corner carve-outs");
  }
}

export function snapshotCornerGeometry(geometry: CornerGeometry): Readonly<CornerGeometry> {
  if (!geometry || typeof geometry !== "object") throw new TypeError("outer corner geometry is required");
  if (trustedCornerGeometries.has(geometry)) return geometry;
  const four = (value: unknown, label: string): readonly unknown[] => {
    if (!Array.isArray(value) || value.length !== CORNER_COUNT) {
      throw new TypeError(`${label} must contain four corners`);
    }
    return [value[0], value[1], value[2], value[3]];
  };
  const radii = (value: unknown, label: string): Four<Radius> => {
    const values = four(value, label);
    const captured = values.map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") {
        throw new TypeError(`${label}[${index}] must contain radius coordinates`);
      }
      const radius = candidate as Partial<Radius>;
      const rx = radius.rx;
      const ry = radius.ry;
      return Object.freeze({ rx, ry }) as Radius;
    });
    return frozenFour(captured[0]!, captured[1]!, captured[2]!, captured[3]!);
  };
  const points = (value: unknown, label: string, maximum: number): readonly Point[] => {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array of points`);
    const length = value.length;
    if (length > maximum) {
      throw new RangeError(`${label} exceeds the production geometry point bound of ${maximum}`);
    }
    const captured = new Array<Point>(length);
    for (let index = 0; index < length; index += 1) {
      const point = value[index];
      if (!Array.isArray(point) || point.length !== 2) {
        throw new TypeError(`${label}[${index}] must contain two finite coordinates`);
      }
      captured[index] = frozenPoint(point[0], point[1]);
    }
    return Object.freeze(captured);
  };
  const requestedRadii = radii(geometry.requestedRadii, "geometry.requestedRadii");
  const resolvedRadii = radii(geometry.radii, "geometry.radii");
  const shapeValues = four(geometry.shapeParameters, "geometry.shapeParameters");
  const carveValues = four(geometry.carveOuts, "geometry.carveOuts");
  const snapshot = Object.freeze({
    width: geometry.width,
    height: geometry.height,
    dpr: geometry.dpr,
    oppositeScale: geometry.oppositeScale,
    ordinaryScaleApplied: geometry.ordinaryScaleApplied,
    requestedRadii,
    radii: resolvedRadii,
    shapeParameters: frozenFour(
      shapeValues[0] as number,
      shapeValues[1] as number,
      shapeValues[2] as number,
      shapeValues[3] as number,
    ),
    contour: points(geometry.contour, "geometry.contour", MAX_CONTOUR_POINTS),
    carveOuts: frozenFour(
      points(carveValues[0], "geometry.carveOuts[0]", MAX_CARVE_OUT_POINTS),
      points(carveValues[1], "geometry.carveOuts[1]", MAX_CARVE_OUT_POINTS),
      points(carveValues[2], "geometry.carveOuts[2]", MAX_CARVE_OUT_POINTS),
      points(carveValues[3], "geometry.carveOuts[3]", MAX_CARVE_OUT_POINTS),
    ),
  });
  assertCornerGeometry(snapshot);
  trustedCornerGeometries.add(snapshot);
  return snapshot;
}

function pointAdd(point: Point, vector: Point): Point {
  return [point[0] + vector[0], point[1] + vector[1]];
}

function pointSubtract(first: Point, second: Point): Point {
  return [first[0] - second[0], first[1] - second[1]];
}

function vectorScale(vector: Point, scale: number): Point {
  return [vector[0] * scale, vector[1] * scale];
}

function unitVector(from: Point, to: Point): Point {
  const vector = pointSubtract(to, from);
  const length = Math.hypot(vector[0], vector[1]);
  return length > 1e-12 ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function lineIntersection(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
): Point | null {
  const first = pointSubtract(firstEnd, firstStart);
  const second = pointSubtract(secondEnd, secondStart);
  const denominator = first[0] * second[1] - first[1] * second[0];
  if (Math.abs(denominator) < 1e-12) return null;
  const delta = pointSubtract(secondStart, firstStart);
  const t = (delta[0] * second[1] - delta[1] * second[0]) / denominator;
  return pointAdd(firstStart, vectorScale(first, t));
}

function segmentIntersection(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
): Readonly<SegmentIntersection> | null {
  const first = pointSubtract(firstEnd, firstStart);
  const second = pointSubtract(secondEnd, secondStart);
  const denominator = first[0] * second[1] - first[1] * second[0];
  if (Math.abs(denominator) < 1e-12) return null;
  const delta = pointSubtract(secondStart, firstStart);
  const firstRatio = (delta[0] * second[1] - delta[1] * second[0]) / denominator;
  const secondRatio = (delta[0] * first[1] - delta[1] * first[0]) / denominator;
  if (firstRatio < -INTERSECTION_EPSILON || firstRatio > 1 + INTERSECTION_EPSILON
    || secondRatio < -INTERSECTION_EPSILON || secondRatio > 1 + INTERSECTION_EPSILON) return null;
  return Object.freeze({
    firstRatio: Math.min(1, Math.max(0, firstRatio)),
    secondRatio: Math.min(1, Math.max(0, secondRatio)),
    point: pointAdd(firstStart, vectorScale(first, Math.min(1, Math.max(0, firstRatio)))),
  });
}

function pointDistance(first: Point, second: Point): number {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function samePoint(first: Point, second: Point): boolean {
  return pointDistance(first, second) <= INTERSECTION_EPSILON;
}

function trimAdjacentCurves(previous: Point[], next: Point[]): TrimmedCurves {
  if (previous.length < 2 || next.length < 2) return { previous, next };
  const previousSuffix = new Array(previous.length).fill(0);
  for (let index = previous.length - 2; index >= 0; index -= 1) {
    previousSuffix[index] = previousSuffix[index + 1]! + pointDistance(previous[index]!, previous[index + 1]!);
  }
  const nextPrefix = new Array(next.length).fill(0);
  for (let index = 1; index < next.length; index += 1) {
    nextPrefix[index] = nextPrefix[index - 1]! + pointDistance(next[index - 1]!, next[index]!);
  }
  let best: {
    intersection: Readonly<SegmentIntersection>;
    nextIndex: number;
    previousIndex: number;
    score: number;
  } | null = null;
  for (let previousIndex = 0; previousIndex < previous.length - 1; previousIndex += 1) {
    for (let nextIndex = 0; nextIndex < next.length - 1; nextIndex += 1) {
      const intersection = segmentIntersection(
        previous[previousIndex]!,
        previous[previousIndex + 1]!,
        next[nextIndex]!,
        next[nextIndex + 1]!,
      );
      if (!intersection) continue;
      const score = pointDistance(intersection.point, previous[previousIndex + 1]!)
        + previousSuffix[previousIndex + 1]!
        + nextPrefix[nextIndex]!
        + pointDistance(next[nextIndex]!, intersection.point);
      if (!best || score < best.score) {
        best = { intersection, nextIndex, previousIndex, score };
      }
    }
  }
  if (!best) return { previous, next };
  const previousTrimmed = previous.slice(0, best.previousIndex + 1);
  if (!samePoint(previousTrimmed.at(-1)!, best.intersection.point)) {
    previousTrimmed.push(best.intersection.point);
  }
  const nextTrimmed = [best.intersection.point];
  for (const point of next.slice(best.nextIndex + 1)) {
    if (!samePoint(nextTrimmed.at(-1)!, point)) nextTrimmed.push(point);
  }
  return { previous: previousTrimmed, next: nextTrimmed };
}

function resolveAdjacentCurveIntersections(curves: readonly (readonly Point[])[]): Point[][] {
  const resolved = curves.map((curve) => [...curve]);
  for (let index = 0; index < resolved.length; index += 1) {
    const nextIndex = (index + 1) % resolved.length;
    const trimmed = trimAdjacentCurves(resolved[index]!, resolved[nextIndex]!);
    resolved[index] = trimmed.previous;
    resolved[nextIndex] = trimmed.next;
  }
  return resolved;
}

function clipPolygonEdge(
  points: Point[],
  inside: (point: Point) => boolean,
  intersection: (first: Point, second: Point) => Point,
): Point[] {
  if (points.length === 0) return points;
  const output: Point[] = [];
  let previous = points.at(-1)!;
  let previousInside = inside(previous);
  for (const point of points) {
    const pointInside = inside(point);
    if (pointInside !== previousInside) output.push(intersection(previous, point));
    if (pointInside) output.push(point);
    previous = point;
    previousInside = pointInside;
  }
  return output;
}

function clipContourToRect(points: readonly Point[], rect: Rect): Point[] {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const verticalIntersection = (x: number) => (first: Point, second: Point): Point => {
    const ratio = (x - first[0]) / (second[0] - first[0]);
    return [x, first[1] + (second[1] - first[1]) * ratio];
  };
  const horizontalIntersection = (y: number) => (first: Point, second: Point): Point => {
    const ratio = (y - first[1]) / (second[1] - first[1]);
    return [first[0] + (second[0] - first[0]) * ratio, y];
  };
  let clipped = [...points];
  clipped = clipPolygonEdge(clipped, ([x]) => x >= left, verticalIntersection(left));
  clipped = clipPolygonEdge(clipped, ([x]) => x <= right, verticalIntersection(right));
  clipped = clipPolygonEdge(clipped, ([, y]) => y >= top, horizontalIntersection(top));
  clipped = clipPolygonEdge(clipped, ([, y]) => y <= bottom, horizontalIntersection(bottom));
  return clipped;
}

function normalizedClosedContour(points: readonly Point[]): Point[] {
  const normalized: Point[] = [];
  for (const point of points) {
    if (!normalized.length || !samePoint(normalized.at(-1)!, point)) normalized.push(point);
  }
  if (normalized.length > 1 && samePoint(normalized[0]!, normalized.at(-1)!)) normalized.pop();
  return normalized;
}

function properContourIntersection(points: readonly Point[]): {
  first: number;
  intersection: Readonly<SegmentIntersection>;
  second: number;
} | null {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 2; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === 0 && secondNext === 0) continue;
      const intersection = segmentIntersection(
        points[first]!,
        points[firstNext]!,
        points[second]!,
        points[secondNext]!,
      );
      if (!intersection
        || intersection.firstRatio <= INTERSECTION_EPSILON
        || intersection.firstRatio >= 1 - INTERSECTION_EPSILON
        || intersection.secondRatio <= INTERSECTION_EPSILON
        || intersection.secondRatio >= 1 - INTERSECTION_EPSILON) continue;
      return { first, second, intersection };
    }
  }
  return null;
}

function rememberInsetGeometry(
  geometry: CornerGeometry,
  cache: InsetCache | null | undefined,
  key: string,
  value: InsetCacheValue,
): void {
  if (!trustedCornerGeometries.has(geometry)) return;
  const nextCache = cache ?? new Map();
  nextCache.set(key, value);
  while (nextCache.size > MAX_INSET_CACHE_ENTRIES) nextCache.delete(nextCache.keys().next().value!);
  if (!cache) insetGeometryCache.set(geometry, nextCache);
}

function cornerVertices(
  index: number,
  width: number,
  height: number,
  radius: Radius,
): CornerVertices {
  const { rx, ry } = radius;
  if (index === 0) return { start: [0, ry], outer: [0, 0], end: [rx, 0], center: [rx, ry] };
  if (index === 1) return { start: [width - rx, 0], outer: [width, 0], end: [width, ry], center: [width - rx, ry] };
  if (index === 2) return { start: [width, height - ry], outer: [width, height], end: [width - rx, height], center: [width - rx, height - ry] };
  return { start: [rx, height], outer: [0, height], end: [0, height - ry], center: [rx, height - ry] };
}

function inwardDirection(index: number): Point {
  return [index === 0 || index === 3 ? 1 : -1, index === 0 || index === 1 ? 1 : -1];
}

function startsOnVerticalEdge(index: number): boolean {
  return index === 0 || index === 2;
}

function adjustedBevel(
  corner: CornerVertices,
  startInset: number,
  endInset: number,
): CornerVertices {
  const chord = pointSubtract(corner.end, corner.start);
  let inward: Point = [-chord[1], chord[0]];
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
  const midpoint: Point = [
    (adjustedStart[0] + adjustedEnd[0]) / 2,
    (adjustedStart[1] + adjustedEnd[1]) / 2,
  ];
  return {
    ...corner,
    start: lineIntersection(adjustedStart, midpoint, clipStart, clipOuter) ?? adjustedStart,
    end: lineIntersection(adjustedEnd, midpoint, clipEnd, clipOuter) ?? adjustedEnd,
  };
}

function adjustedRound(
  corner: CornerVertices,
  index: number,
  startInset: number,
  endInset: number,
): CornerVertices {
  const verticalInset = startsOnVerticalEdge(index) ? startInset : endInset;
  const horizontalInset = startsOnVerticalEdge(index) ? endInset : startInset;
  const outerRadiusX = Math.abs(corner.center[0] - corner.outer[0]);
  const outerRadiusY = Math.abs(corner.center[1] - corner.outer[1]);
  const radiusX = Math.max(0, outerRadiusX - verticalInset);
  const radiusY = Math.max(0, outerRadiusY - horizontalInset);
  const scale = (point: Point): Point => [
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

function adjustedScoop(
  corner: CornerVertices,
  index: number,
  startInset: number,
  endInset: number,
): AdjustedCornerVertices {
  const verticalInset = startsOnVerticalEdge(index) ? startInset : endInset;
  const horizontalInset = startsOnVerticalEdge(index) ? endInset : startInset;
  const outerRadiusX = Math.abs(corner.center[0] - corner.outer[0]);
  const outerRadiusY = Math.abs(corner.center[1] - corner.outer[1]);
  const radiusX = outerRadiusX + horizontalInset;
  const radiusY = outerRadiusY + verticalInset;
  const extent = (radius: number, ratio: number): number => (
    radius * Math.sqrt(Math.max(0, 1 - ratio * ratio))
  );
  const direction = inwardDirection(index);
  const side: Point = [
    corner.outer[0] + direction[0] * verticalInset,
    corner.outer[1] + direction[1] * extent(radiusY, radiusX > 0 ? verticalInset / radiusX : 0),
  ];
  const horizontal: Point = [
    corner.outer[0] + direction[0] * extent(radiusX, radiusY > 0 ? horizontalInset / radiusY : 0),
    corner.outer[1] + direction[1] * horizontalInset,
  ];
  return {
    ...corner,
    start: startsOnVerticalEdge(index) ? side : horizontal,
    end: startsOnVerticalEdge(index) ? horizontal : side,
    scoopRadii: [radiusX, radiusY],
  };
}

function adjustedGeneral(
  corner: CornerVertices,
  shapeParameter: number,
  startInset: number,
  endInset: number,
): CornerVertices {
  let strokeA: number;
  let strokeB: number;
  if (shapeParameter <= -FLOATING_SHAPE_LIMIT) {
    strokeA = -1;
    strokeB = 1;
  } else if (shapeParameter >= FLOATING_SHAPE_LIMIT) {
    strokeA = 0;
    strokeB = 1;
  } else {
    const clamped = Math.min(1, Math.max(-1, shapeParameter));
    const half = 0.5 ** (2 ** -clamped);
    const direction: Point = [half * 2 - 0.5, 1.5 - half * 2];
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

function adjustCornerForInsets(
  corner: CornerVertices,
  index: number,
  shapeParameter: number,
  startInset: number,
  endInset: number,
): AdjustedCornerVertices {
  if (Math.hypot(corner.outer[0] - corner.start[0], corner.outer[1] - corner.start[1]) < 1e-6
    || Math.hypot(corner.end[0] - corner.outer[0], corner.end[1] - corner.outer[1]) < 1e-6) {
    return corner;
  }
  if (startInset === 0 && endInset === 0) return corner;
  if (shapeParameter === 0) return adjustedBevel(corner, startInset, endInset);
  if (shapeParameter === 1) return adjustedRound(corner, index, startInset, endInset);
  if (shapeParameter === -1) return adjustedScoop(corner, index, startInset, endInset);
  return adjustedGeneral(corner, shapeParameter, startInset, endInset);
}

function sampleAdjustedScoop(
  corner: AdjustedCornerVertices,
  radii: Point,
  tolerance: number,
  maxDepth: number,
): Point[] {
  // Inset scoop endpoints intersect the inset edges rather than the ellipse axes.
  // Sample the enlarged axis-aligned ellipse directly; the generic basis map would shear it.
  const [radiusX, radiusY] = radii;
  const [centerX, centerY] = corner.outer;
  const angle = ([x, y]: Point): number => Math.atan2(
    (y - centerY) / radiusY,
    (x - centerX) / radiusX,
  );
  const startAngle = angle(corner.start);
  let endAngle = angle(corner.end);
  while (endAngle > startAngle) endAngle -= Math.PI * 2;
  const pointAt = (theta: number): Point => [
    centerX + radiusX * Math.cos(theta),
    centerY + radiusY * Math.sin(theta),
  ];
  return sampleAdaptiveCurve(
    startAngle,
    corner.start,
    endAngle,
    corner.end,
    pointAt,
    tolerance,
    maxDepth,
  );
}

function mappedCornerPoint(corner: CornerVertices, shapeParameter: number, theta: number): Point {
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

function sampleAdjustedCorner(
  corner: AdjustedCornerVertices,
  shapeParameter: number,
  tolerance: number,
  maxDepth = MAX_INSET_ADAPTIVE_DEPTH,
): Point[] {
  if (shapeParameter === 0) return [corner.start, corner.end];
  if (shapeParameter >= FLOATING_SHAPE_LIMIT) return [corner.start, corner.outer, corner.end];
  if (shapeParameter <= -FLOATING_SHAPE_LIMIT) return [corner.start, corner.center, corner.end];
  if (shapeParameter === -1 && corner.scoopRadii) {
    return sampleAdjustedScoop(corner, corner.scoopRadii, tolerance, maxDepth);
  }
  const start = corner.start;
  const end = corner.end;
  return sampleAdaptiveCurve(
    0,
    start,
    Math.PI / 2,
    end,
    (theta) => mappedCornerPoint(corner, shapeParameter, theta),
    tolerance,
    maxDepth,
  );
}

function normalizeInsets(insets: CornerInsets): Four<number> {
  const values = Number.isFinite(insets)
    ? [insets as number, insets as number, insets as number, insets as number]
    : Array.isArray(insets)
      ? insets
      : [
        (insets as Exclude<CornerInsets, number | Four<number>>)?.top,
        (insets as Exclude<CornerInsets, number | Four<number>>)?.right,
        (insets as Exclude<CornerInsets, number | Four<number>>)?.bottom,
        (insets as Exclude<CornerInsets, number | Four<number>>)?.left,
      ];
  const captured = [values[0], values[1], values[2], values[3]];
  if (values.length !== 4 || captured.some((value) => !Number.isFinite(value) || value! < 0)) {
    throw new TypeError("contour insets must contain four finite non-negative sides");
  }
  return frozenFour(captured[0]!, captured[1]!, captured[2]!, captured[3]!);
}

export function insetCornerGeometry(geometry: CornerGeometry, insets: CornerInsets, {
  tolerance: requestedTolerance,
}: { tolerance?: number } = {}): Readonly<InsetCornerGeometry> {
  geometry = snapshotCornerGeometry(geometry);
  const tolerance = requestedTolerance ?? 0.125 / Math.max(1, geometry.dpr);
  finitePositive(tolerance, "tolerance");
  const [top, right, bottom, left] = normalizeInsets(insets);
  const cacheKey = `${top}\n${right}\n${bottom}\n${left}\n${tolerance}`;
  const cache = trustedCornerGeometries.has(geometry) ? insetGeometryCache.get(geometry) : null;
  const cached = cache?.get(cacheKey);
  if (cached !== undefined) {
    cache!.delete(cacheKey);
    cache!.set(cacheKey, cached);
    if (cached === UNSUPPORTED_INSET_TOPOLOGY) throw new TypeError(INSET_TOPOLOGY_ERROR);
    return cached;
  }
  const targetRect = Object.freeze({
    x: Math.min(geometry.width, left),
    y: Math.min(geometry.height, top),
    width: Math.max(0, geometry.width - left - right),
    height: Math.max(0, geometry.height - top - bottom),
  });
  if (targetRect.width === 0 || targetRect.height === 0) {
    const empty = Object.freeze({ targetRect, contour: Object.freeze([]), corners: Object.freeze([]) });
    rememberInsetGeometry(geometry, cache, cacheKey, empty);
    return empty;
  }
  const startInsets: Four<number> = [left, top, right, bottom];
  const endInsets: Four<number> = [top, right, bottom, left];
  const corners = geometry.radii.map((radius, index) => adjustCornerForInsets(
    cornerVertices(index, geometry.width, geometry.height, radius),
    index,
    geometry.shapeParameters[index]!,
    startInsets[index]!,
    endInsets[index]!,
  ));
  const curves = resolveAdjacentCurveIntersections(corners.map((corner, index) => sampleAdjustedCorner(
    corner,
    geometry.shapeParameters[index]!,
    tolerance,
  )));
  const points: Point[] = [curves[0]!.at(-1)!];
  points.push(curves[1]![0]!);
  append(points, curves[1]!);
  points.push(curves[2]![0]!);
  append(points, curves[2]!);
  points.push(curves[3]![0]!);
  append(points, curves[3]!);
  points.push(curves[0]![0]!);
  append(points, curves[0]!);
  const resolvedPoints = normalizedClosedContour(clipContourToRect(points, targetRect));
  if (properContourIntersection(resolvedPoints)) {
    rememberInsetGeometry(geometry, cache, cacheKey, UNSUPPORTED_INSET_TOPOLOGY);
    throw new TypeError(INSET_TOPOLOGY_ERROR);
  }
  const result = Object.freeze({
    targetRect,
    contour: Object.freeze(resolvedPoints.map(([x, y]) => frozenPoint(x, y))),
    corners: Object.freeze(corners.map((corner) => Object.freeze({
      start: frozenPoint(...corner.start),
      outer: frozenPoint(...corner.outer),
      end: frozenPoint(...corner.end),
      center: frozenPoint(...corner.center),
    }))),
  });
  rememberInsetGeometry(geometry, cache, cacheKey, result);
  return result;
}
