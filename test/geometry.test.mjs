import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCornerGeometry,
  convexPolygonsOverlap,
  contourPoints,
  insetCornerGeometry,
  resolveRadii,
  sampleCanonicalCorner,
} from "../src/geometry.mjs";

const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

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

test("bevel uses exact endpoints instead of sampled approximation", () => {
  assert.deepEqual(sampleCanonicalCorner({ rx: 40, ry: 25, s: 0 }), [[40, 0], [0, 25]]);
});

test("Mario fixture resolves to a triangular contour", () => {
  const mario = {
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
    width: mario.size[0],
    height: mario.size[1],
    radii: mario.radii,
    shapeParameters: mario.shapeParameters,
  });
  const unique = [...new Map(points.map((point) => [point.join(","), point])).values()];
  assert.deepEqual(unique, [[32, 0], [64, 44], [0, 44]]);
});

test("contour points stay finite and inside the ordinary fixture box", () => {
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
  assert.ok(points.length > 100);
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
  const properIntersection = (firstStart, firstEnd, secondStart, secondEnd) => {
    const first = [firstEnd[0] - firstStart[0], firstEnd[1] - firstStart[1]];
    const second = [secondEnd[0] - secondStart[0], secondEnd[1] - secondStart[1]];
    const denominator = first[0] * second[1] - first[1] * second[0];
    if (Math.abs(denominator) < 1e-9) return false;
    const delta = [secondStart[0] - firstStart[0], secondStart[1] - firstStart[1]];
    const firstRatio = (delta[0] * second[1] - delta[1] * second[0]) / denominator;
    const secondRatio = (delta[0] * first[1] - delta[1] * first[0]) / denominator;
    return firstRatio > 1e-8 && firstRatio < 1 - 1e-8
      && secondRatio > 1e-8 && secondRatio < 1 - 1e-8;
  };
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
});

test("purpose-specific inset contours honor unequal side insets", () => {
  const radii = Array.from({ length: 4 }, () => ({ rx: 30, ry: 20 }));
  const round = insetCornerGeometry(buildCornerGeometry({
    width: 100,
    height: 80,
    borderRadius: radii,
    cornerShape: [1, 1, 1, 1],
  }), [5, 10, 15, 20]);
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
});
