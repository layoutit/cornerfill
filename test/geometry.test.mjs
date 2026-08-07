import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCornerGeometry,
  convexPolygonsOverlap,
  contourPoints,
  insetCornerGeometry,
  resolveRadii,
  sampleCanonicalCorner,
  snapshotCornerGeometry,
} from "../dist/geometry.mjs";

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

function properIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const first = [firstEnd[0] - firstStart[0], firstEnd[1] - firstStart[1]];
  const second = [secondEnd[0] - secondStart[0], secondEnd[1] - secondStart[1]];
  const denominator = first[0] * second[1] - first[1] * second[0];
  if (Math.abs(denominator) < 1e-9) return false;
  const delta = [secondStart[0] - firstStart[0], secondStart[1] - firstStart[1]];
  const firstRatio = (delta[0] * second[1] - delta[1] * second[0]) / denominator;
  const secondRatio = (delta[0] * first[1] - delta[1] * first[0]) / denominator;
  return firstRatio > 1e-8 && firstRatio < 1 - 1e-8
    && secondRatio > 1e-8 && secondRatio < 1 - 1e-8;
}

function assertSimpleContour(points) {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 2; second < points.length; second += 1) {
      if (first === 0 && second === points.length - 1) continue;
      assert.equal(properIntersection(
        points[first],
        points[(first + 1) % points.length],
        points[second],
        points[(second + 1) % points.length],
      ), false, `segments ${first} and ${second} intersect`);
    }
  }
}

test("ordinary radius overlap scaling is deterministic", () => {
  const resolved = resolveRadii(100, 80, [
    { rx: 80, ry: 60 },
    { rx: 80, ry: 60 },
    { rx: 20, ry: 20 },
    { rx: 20, ry: 20 },
  ]);
  close(resolved[0].rx, 50);
  close(resolved[1].rx, 50);
  close(resolved[0].ry, 37.5);
});

test("finite extreme radii resolve without overflow", () => {
  const maximum = Number.MAX_VALUE;
  const resolved = resolveRadii(maximum, maximum, [
    { rx: maximum, ry: maximum },
    { rx: maximum, ry: maximum },
    { rx: maximum, ry: maximum },
    { rx: maximum, ry: maximum },
  ]);
  assert.ok(resolved.every(({ rx, ry }) => Number.isFinite(rx) && Number.isFinite(ry)));
  assert.equal(resolved[0].rx, maximum * 0.5);
  assert.equal(resolved[0].ry, maximum * 0.5);
});

test("keyword midpoint ordering follows square, round, bevel, scoop, notch", () => {
  const midpoint = (s) => {
    const points = sampleCanonicalCorner({ rx: 100, ry: 100, s }, { segments: 2 });
    if (points.length === 2) return (points[0][0] + points[1][0]) / 2;
    return points[Math.floor(points.length / 2)][0];
  };
  assert.equal(midpoint(Number.POSITIVE_INFINITY), 0);
  close(midpoint(1), 100 * (1 - Math.SQRT1_2));
  assert.equal(midpoint(0), 50);
  close(midpoint(-1), 100 * Math.SQRT1_2);
  assert.equal(midpoint(Number.NEGATIVE_INFINITY), 100);
});

test("finite shape limits produce the same outer and inset contours as square and notch", () => {
  const geometry = (shape) => buildCornerGeometry({
    width: 120,
    height: 90,
    borderRadius: "24px 18px 30px 12px",
    cornerShape: [shape, shape, shape, shape],
  });
  for (const [finite, keyword] of [
    [54, Number.POSITIVE_INFINITY],
    [-54, Number.NEGATIVE_INFINITY],
  ]) {
    const finiteGeometry = geometry(finite);
    const keywordGeometry = geometry(keyword);
    assert.deepEqual(finiteGeometry.contour, keywordGeometry.contour);
    assert.deepEqual(
      insetCornerGeometry(finiteGeometry, [3, 5, 7, 9]).contour,
      insetCornerGeometry(keywordGeometry, [3, 5, 7, 9]).contour,
    );
  }
});

test("bevel uses exact endpoints instead of sampled approximation", () => {
  assert.deepEqual(sampleCanonicalCorner({ rx: 40, ry: 25, s: 0 }), [[40, 0], [0, 25]]);
});

test("adaptive sampling rejects depths beyond the production point bound", () => {
  assert.throws(
    () => sampleCanonicalCorner({ rx: 40, ry: 25, s: 1 }, { maxDepth: 15 }),
    /integer from 1 through 14/u,
  );
  assert.throws(
    () => sampleCanonicalCorner({ rx: 0, ry: 0, s: 0 }, { tolerance: 0 }),
    /finite positive number/u,
  );
});

test("geometry entry points reject invalid resolution inputs before sampling", () => {
  const radii = Array.from({ length: 4 }, () => ({ rx: 10, ry: 10 }));
  const shapes = [1, 1, 1, 1];
  assert.throws(
    () => buildCornerGeometry({ width: 20, height: 20, borderRadius: radii, cornerShape: shapes, dpr: 0 }),
    /dpr must be a finite positive number/u,
  );
  const geometry = buildCornerGeometry({
    width: 20,
    height: 20,
    borderRadius: radii,
    cornerShape: shapes,
  });
  assert.throws(() => insetCornerGeometry(geometry, 1, { tolerance: Number.NaN }), /finite positive number/u);
  assert.throws(
    () => buildCornerGeometry({ width: 20, height: 20, borderRadius: new Array(4), cornerShape: shapes }),
    /radii\[0\]/u,
  );
  assert.throws(
    () => buildCornerGeometry({ width: 20, height: 20, borderRadius: radii, cornerShape: new Array(4) }),
    /cornerShape\[0\]/u,
  );
  assert.throws(() => convexPolygonsOverlap(new Array(3), [[0, 0], [1, 0], [0, 1]]), /first polygon\[0\]/u);
});

test("convex overlap distinguishes penetration, separation, and edge contact", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(convexPolygonsOverlap(square, [[5, 5], [15, 5], [15, 15], [5, 15]]), true);
  assert.equal(convexPolygonsOverlap(square, [[10, 0], [20, 0], [20, 10], [10, 10]]), false);
  assert.equal(convexPolygonsOverlap(square, [[11, 0], [21, 0], [21, 10], [11, 10]]), false);
  assert.throws(() => convexPolygonsOverlap(square, [[0, 0], [1, Number.NaN], [0, 1]]), /finite coordinates/u);
});

test("convex overlap remains stable for large finite coordinates", () => {
  const scale = Number.MAX_VALUE / 4;
  const polygon = (points) => points.map(([x, y]) => [x * scale, y * scale]);
  const square = polygon([[0, 0], [1, 0], [1, 1], [0, 1]]);
  assert.equal(
    convexPolygonsOverlap(square, polygon([[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]])),
    true,
  );
  assert.equal(
    convexPolygonsOverlap(square, polygon([[1, 0], [2, 0], [2, 1], [1, 1]])),
    false,
  );
});

test("two bevel corners and two zero-radius corners resolve to a triangle", () => {
  const fixture = {
    size: [64, 44],
    radii: [
      { rx: 32, ry: 44 },
      { rx: 32, ry: 44 },
      { rx: 0, ry: 0 },
      { rx: 0, ry: 0 },
    ],
    shapeParameters: [0, 0, 1, 1],
  };
  const points = contourPoints({
    width: fixture.size[0],
    height: fixture.size[1],
    radii: fixture.radii,
    shapeParameters: fixture.shapeParameters,
  });
  const unique = [...new Map(points.map((point) => [point.join(","), point])).values()];
  assert.deepEqual(unique, [[32, 0], [64, 44], [0, 44]]);
});

test("built geometry does not retain mutable caller tuples", () => {
  const radii = Array.from({ length: 4 }, () => ({ rx: 20, ry: 10 }));
  const shapes = [0, 1, -1, 2];
  const geometry = buildCornerGeometry({ width: 100, height: 80, borderRadius: radii, cornerShape: shapes });
  radii[0].rx = 99;
  shapes[0] = 99;
  assert.equal(geometry.requestedRadii[0].rx, 20);
  assert.equal(geometry.shapeParameters[0], 0);
  assert.ok(Object.isFrozen(geometry.requestedRadii[0]));
  assert.ok(Object.isFrozen(geometry.shapeParameters));
});

test("shallow-frozen external geometry is revalidated after nested mutation", () => {
  const built = buildCornerGeometry({
    width: 100,
    height: 80,
    borderRadius: "20px",
    cornerShape: "bevel",
  });
  const contour = built.contour.map((point) => [...point]);
  const geometry = Object.freeze({ ...built, contour });
  assert.doesNotThrow(() => insetCornerGeometry(geometry, 1));
  const snapshot = snapshotCornerGeometry(geometry);
  assert.equal(snapshotCornerGeometry(built), built);
  contour[0][0] = Number.NaN;
  assert.ok(Number.isFinite(snapshot.contour[0][0]));
  assert.ok(Object.isFrozen(snapshot.contour[0]));
  assert.throws(() => insetCornerGeometry(geometry, 1), /finite coordinates/u);
  assert.throws(
    () => insetCornerGeometry({ ...built, contour: new Array(65_542).fill([0, 0]) }, 1),
    /production geometry point bound/u,
  );

  let accessorContour = built.contour;
  const accessorGeometry = Object.freeze({
    ...built,
    get contour() { return accessorContour; },
  });
  assert.doesNotThrow(() => insetCornerGeometry(accessorGeometry, 1));
  accessorContour = Object.freeze([
    Object.freeze([Number.NaN, 0]),
    ...built.contour.slice(1),
  ]);
  assert.throws(() => insetCornerGeometry(accessorGeometry, 1), /finite coordinates/u);
  assert.throws(
    () => snapshotCornerGeometry({ ...built, shapeParameters: new Array(4) }),
    /shapeParameters\[0\]/u,
  );
  assert.throws(
    () => snapshotCornerGeometry({
      ...built,
      contour: [[0, 0], [100, 80], [100, 0], [0, 80]],
    }),
    /contour is inconsistent/u,
  );
});

test("adaptive contour points stay finite, bounded, and refine for device pixels", () => {
  const fixture = {
    size: [230, 170],
    radii: [
      { rx: 64, ry: 34 },
      { rx: 34, ry: 58 },
      { rx: 52, ry: 28 },
      { rx: 24, ry: 46 },
    ],
    shapeParameters: [2, 0, -1, 1],
  };
  const points = contourPoints({
    width: fixture.size[0],
    height: fixture.size[1],
    radii: fixture.radii,
    shapeParameters: fixture.shapeParameters,
  });
  const highDprPoints = contourPoints({
    width: fixture.size[0],
    height: fixture.size[1],
    radii: fixture.radii,
    shapeParameters: fixture.shapeParameters,
    dpr: 3,
  });
  assert.ok(highDprPoints.length > points.length);
  for (const [x, y] of points) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= 0 && x <= fixture.size[0]);
    assert.ok(y >= 0 && y <= fixture.size[1]);
  }
});

test("diagonally opposing concave corners receive a deterministic hull scale", () => {
  const fixture = {
    size: [220, 160],
    radii: [
      { rx: 118, ry: 92 },
      { rx: 18, ry: 18 },
      { rx: 118, ry: 92 },
      { rx: 18, ry: 18 },
    ],
    shapeParameters: [-1, 1, -1, 1],
  };
  const geometry = buildCornerGeometry({
    width: fixture.size[0],
    height: fixture.size[1],
    borderRadius: fixture.radii,
    cornerShape: fixture.shapeParameters,
    dpr: 1,
  });
  assert.ok(geometry.oppositeScale > 0 && geometry.oppositeScale < 1);
  assert.equal(convexPolygonsOverlap(geometry.carveOuts[0], geometry.carveOuts[2]), false);
});

test("mixed concave and convex opposite corners are scaled to a simple contour", () => {
  const geometry = buildCornerGeometry({
    width: 100,
    height: 100,
    borderRadius: [
      { rx: 90, ry: 90 },
      { rx: 0, ry: 0 },
      { rx: 90, ry: 90 },
      { rx: 0, ry: 0 },
    ],
    cornerShape: [Number.NEGATIVE_INFINITY, 1, 1, 1],
  });
  assert.ok(geometry.oppositeScale > 0 && geometry.oppositeScale < 1);
  assertSimpleContour(geometry.contour);
});

test("notch and finite concave limits remain nonzero, finite, and non-overlapping", () => {
  for (const shape of [Number.NEGATIVE_INFINITY, -54, -20, -4]) {
    const geometry = buildCornerGeometry({
      width: 150,
      height: 150,
      borderRadius: [
        { rx: 100, ry: 100 },
        { rx: 0, ry: 0 },
        { rx: 100, ry: 100 },
        { rx: 0, ry: 0 },
      ],
      cornerShape: [shape, 1, shape, 1],
    });
    assert.ok(geometry.oppositeScale > 0 && geometry.oppositeScale < 1);
    assert.ok(geometry.contour.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
    assert.equal(convexPolygonsOverlap(geometry.carveOuts[0], geometry.carveOuts[2]), false);
  }
});

test("concave overlap scaling is invariant under homothetic geometry", () => {
  const fixture = {
    width: 69.639,
    height: 229.27,
    radii: [
      { rx: 8.498, ry: 125.165 },
      { rx: 47.404, ry: 129.361 },
      { rx: 8.227, ry: 36.766 },
      { rx: 23.81, ry: 104.105 },
    ],
    shapes: [-0.5, -12, -0.1, -30],
  };
  const geometries = [1, 10].map((scale) => buildCornerGeometry({
    width: fixture.width * scale,
    height: fixture.height * scale,
    borderRadius: fixture.radii.map(({ rx, ry }) => ({ rx: rx * scale, ry: ry * scale })),
    cornerShape: fixture.shapes,
  }));
  close(geometries[0].oppositeScale, geometries[1].oppositeScale, 1e-10);
  for (const geometry of geometries) {
    assert.equal(convexPolygonsOverlap(geometry.carveOuts[1], geometry.carveOuts[3]), false);
  }
});

test("adjacent inset curves are trimmed before they can self-intersect", () => {
  const geometry = buildCornerGeometry({
    width: 150,
    height: 150,
    borderRadius: [
      { rx: 98, ry: 60 },
      { rx: 80, ry: 60 },
      { rx: 0, ry: 0 },
      { rx: 0, ry: 0 },
    ],
    cornerShape: [-0.5, 0.5, 1, 1],
  });
  const points = insetCornerGeometry(geometry, 1).contour;
  assertSimpleContour(points);
});

test("purpose-specific inset contours honor unequal side insets", () => {
  const radii = Array.from({ length: 4 }, () => ({ rx: 30, ry: 20 }));
  const roundGeometry = buildCornerGeometry({
    width: 100,
    height: 80,
    borderRadius: radii,
    cornerShape: [1, 1, 1, 1],
  });
  const round = insetCornerGeometry(roundGeometry, [5, 10, 15, 20]);
  assert.deepEqual(round.targetRect, { x: 20, y: 5, width: 70, height: 60 });
  assert.deepEqual(round.corners[0], {
    start: [20, 20],
    outer: [20, 5],
    end: [30, 5],
    center: [30, 20],
  });

  const bevel = insetCornerGeometry(buildCornerGeometry({
    width: 100,
    height: 80,
    borderRadius: radii,
    cornerShape: [0, 0, 0, 0],
  }), [5, 10, 15, 20]);
  close(bevel.corners[0].start[0], 20);
  close(bevel.corners[0].end[1], 5);
  assert.equal(insetCornerGeometry(roundGeometry, [5, 10, 15, 20]), round);
  for (let inset = 1; inset <= 16; inset += 1) insetCornerGeometry(roundGeometry, inset);
  assert.notEqual(insetCornerGeometry(roundGeometry, [5, 10, 15, 20]), round);
});

test("inset scoop follows the enlarged axis-aligned ellipse", () => {
  const geometry = buildCornerGeometry({
    width: 230,
    height: 170,
    borderRadius: [
      { rx: 58, ry: 44 },
      { rx: 34, ry: 58 },
      { rx: 52, ry: 28 },
      { rx: 24, ry: 46 },
    ],
    cornerShape: [2, 0, -1, 1],
  });
  const inset = insetCornerGeometry(geometry, [10, 14, 16, 8]);
  const curve = inset.contour.filter(([x, y]) => x > 160 && x < 216 && y > 120 && y < 154);
  assert.ok(curve.length > 2);
  for (const [x, y] of curve) {
    close(((x - 230) / 68) ** 2 + ((y - 170) / 42) ** 2, 1, 1e-9);
  }
});
