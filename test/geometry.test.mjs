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
import { getOracleCase } from "../oracle/cases.mjs";

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
  const mario = getOracleCase("mario-texel-face");
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
  const fixture = getOracleCase("mixed-asymmetric");
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
  const fixture = getOracleCase("opposite-concave-overlap");
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
