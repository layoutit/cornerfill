// Compatibility seam for historical oracle imports. The executable candidate and
// unit tests now use the production geometry implementation.
export {
  buildCornerGeometry,
  contourPoints,
  convexPolygonsOverlap,
  cornerCarveOuts,
  insetGeometry,
  oppositeCornerScaleFactor,
  resolveCornerRadii,
  resolveRadii,
  sampleCanonicalCorner,
} from "../src/geometry.mjs";
