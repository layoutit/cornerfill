# Geometry and painting design

## Coordinate model

All geometry is computed in the element's untransformed CSS-pixel border box.

```ts
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Corner {
  rx: number;
  ry: number;
  s: number; // CSS superellipse parameter; may be +/-Infinity
}
```

The backing bitmap can be device-pixel sized, but path inputs remain CSS pixels and the context is scaled by DPR. `matrix3d()` and other transforms are never folded into these coordinates.

## Resolve CSS values before drawing

### Border radii

Parse the complete `border-radius` model:

- one to four horizontal radii;
- optional slash followed by one to four vertical radii;
- physical and logical longhands;
- lengths, percentages, and supported `calc()` values;
- percentages resolved against box width for `rx` and box height for `ry`.

Apply the standard corner-radius reduction factor so sums on each edge do not exceed the box dimension. This is separate from the additional diagonal constraint for concave shapes.

### Corner shapes

Expand shorthands to four physical corners and normalize keywords to `s`:

```text
round=1, squircle=2, square=+∞,
bevel=0, scoop=-1, notch=-∞
```

Preserve `-0` only if native computed-value tests prove it observable; otherwise normalize it to zero.

### Concave diagonal constraint

Implement the draft's hull test, not WebKit's current placeholder:

1. generate a convex hull polygon for each concave corner in normalized space;
2. rotate/map it into the element;
3. test each diagonal pair under a shared scalar;
4. solve for the largest non-intersecting scalar, using monotonic binary search if no simpler analytic solution is stable;
5. multiply all radii by the minimum pair scalar.

Use a deterministic iteration count/tolerance and test exact keyword/extreme cases. Geometry must not depend on browser raster output.

## Curve generation

### Exact cases

Prefer exact commands for the common keywords:

- `bevel`: line between the two corner endpoints;
- `round`: quarter ellipse/Canvas `ellipse()` arc;
- `square`: two axis-aligned lines through the outer corner;
- `notch`: two axis-aligned lines through the inner corner;
- `scoop`: reflected quarter ellipse;
- zero radius: sharp box corner.

Exact cases reduce segment count, numerical risk, and browser-to-browser anti-alias variation.

### General superellipse

For finite `s`, the normalized curve is a superellipse with exponent `n = 2^s`. A stable sampler can use the usual quarter-superellipse parameterization and map it into the corner's `rx × ry` rectangle. Concave values can be calculated directly or by reflecting the convex reciprocal equivalent, matching the native implementation strategy.

Use adaptive subdivision:

1. start with curve endpoints;
2. evaluate the analytic midpoint;
3. measure its distance from the chord or a fitted segment;
4. subdivide until device-space error is below a declared threshold;
5. cap depth/segments and special-case extreme parameters.

Suggested starting error budget: at most 0.25 device pixel for ordinary UI and 0.125 device pixel for visual-oracle tests. This is a hypothesis to benchmark, not a frozen constant.

Polyline output is sufficient for a correctness-first prototype. Two fitted cubic halves, like Blink/WebKit, are a later optimization after a differential suite establishes maximum error across parameters, aspect ratios, insets, and DPR.

## Contour construction

Represent the draft's operation instead of prematurely forcing one closed vector path:

```ts
interface RasterShape {
  targetRect: Rect;
  carveOuts: PathCommand[][];
}
```

The outer shape is `borderRect minus outerCornerCarveOuts`. The inner border/background/shadow contours repeat the construction with purpose-specific insets/outsets and adjusted corners.

This representation mirrors the spec and makes the omitted boolean operation explicit.

## Raster boolean without `clip-path`

The editor's draft leaves corner-path clipping to implementations. Blink delegates difficult intersections to Skia. Canvas gives Cornerfill a backend-neutral raster equivalent:

```js
ctx.save();
paintTargetRect(ctx);
ctx.globalCompositeOperation = "destination-out";
for (const carveOut of carveOuts) {
  ctx.fill(carveOut);
}
ctx.restore();
```

Repeated `destination-out` is union subtraction: if two carve-outs overlap, the overlap stays removed. That is safer than relying on even/odd parity. The operation happens inside the generated image and uses the compositing API that Paint Worklet contexts already include. It is not a CSS mask and adds no DOM renderer.

For a background fill, the simplest sequence is:

1. clear the surface;
2. paint all owned background layers across their CSS painting areas;
3. subtract the regions outside the selected background-clip contour.

This is the first production slice.

## Borders

A CSS border is a region between two contours, not a centered Canvas stroke.

For a uniform solid border:

1. paint the outer contour with the border color;
2. paint the background over it, restricted to the inner/background contour; or
3. construct the ring as outer shape minus inner shape on a scratch layer and composite it over the background.

Main-thread live-surface backends can use a pooled `OffscreenCanvas`/hidden scratch canvas if needed. Native Paint Worklet code should avoid assuming a DOM canvas is constructible; it can use a correctly wound closed inner contour or a direct compositing sequence on the supplied output context.

The inner contour must come from border-aware inset geometry. A naive `rx -= borderWidth; ry -= borderWidth` fails on bevel/scoop/notch and non-uniform widths.

### Per-side colors and styles

Full native borders require partitioning the ring into side regions and painting each side's style/color without bleeding into neighboring corners. Blink's implementation article shows why simple quadrant clips are insufficient for extreme mixed curves.

Release order:

1. no border;
2. uniform solid border;
3. non-uniform widths with one color;
4. per-side solid colors;
5. double/dashed/dotted;
6. 3D styles (`groove`, `ridge`, `inset`, `outset`).

Every supported level should be explicit in package metadata and diagnostics.

## Background painting

### Color

Paint the background color at the bottom of the owned layer stack, subject to the resolved `background-clip` behavior.

### URL image

Implement the CSS Images/Backgrounds sizing algorithm rather than treating every image as `100% 100%`:

- intrinsic dimensions/aspect ratio;
- explicit `<length-percentage>` pairs;
- `cover` and `contain`;
- position area and percentage formula;
- repeat, round, space, no-repeat;
- origin and clip boxes;
- multiple layers in CSS paint order.

For the first PolyCSS adapter the normalized input is simpler and fully prepared:

```ts
{
  imageId: "texels.webp",
  repeat: "no-repeat",
  size: { width: 4852, height: 3280 },
  position: { x: preparedX, y: preparedY }
}
```

The surface draws only the atlas crop intersecting the face box. An atlas-position update changes the paint key but not geometry.

### Gradients

Canvas has linear/radial/conic gradient primitives, but CSS gradient fidelity also requires:

- CSS angle/direction conventions;
- automatic and double-position color stops;
- interpolation hints;
- repeating periods;
- color interpolation spaces and hue methods;
- premultiplied-alpha behavior;
- radial sizing keywords and elliptical radii.

Treat each gradient type as a separately qualified feature. Do not claim “backgrounds supported” after only mapping a two-stop linear gradient.

## Background clip choices

The live surface occupies the border box. Resolve `background-origin` and `background-clip` independently for each layer.

- `border-box`: subtract outside the outer contour.
- `padding-box`: use the inner border contour.
- `content-box`: use the content inset with a corresponding shaped contour where the spec requires it.
- `border-area`: paint only the border region; this is particularly relevant to the current native `border-shape` PolyCSS rule.
- `text`: outside Cornerfill's first scope.

## Shadows and outlines

Outer shadow:

1. build the purpose-specific outset contour for spread;
2. paint its alpha/color on a padded scratch surface;
3. apply blur and offset;
4. composite behind the host paint.

Inset shadow starts from the inner contour and knocks out/softens the appropriate interior. Canvas shadow state may be useful, but it must be compared against CSS's specified blur/spread/clip behavior.

Outlines are visual and do not affect layout. Build an outset ring with the requested offset and width. Miter behavior around concave corners needs dedicated tests.

Do not enable shadow/outline support merely because a plausible image is produced; these features are a major source of native-engine follow-up bugs.

## Anti-aliasing and seams

- Reuse identical curve commands for boundaries shared by background and border.
- Avoid independently rasterizing two coincident edges when one compositing operation can produce the ring.
- Clear the entire backing bitmap on every full repaint.
- Scale once for DPR; do not round geometry twice.
- Test transparent edges over light, dark, and saturated checkerboards.
- Test fractional CSS dimensions and transforms, not only integer boxes.
- Compare alpha separately from RGB so transparent-RGB noise does not obscure edge errors.

## Cache strategy

Cache by normalized inputs:

- radii/shapes/box size/DPR -> geometry commands;
- image URL/request mode -> decode promise and decoded image;
- background layer normalization -> paint graph;
- complete geometry + paint -> optional shared immutable surface.

Do not put transform matrices in any paint cache key. Do not cache a failed image forever; retain error state with an explicit retry/invalidation policy.

## Numerical test points

At minimum:

- `s`: `-∞`, `-10`, `-2`, `-1`, `-0.5`, `0`, `0.5`, `1`, `2`, `10`, `+∞`;
- square, very wide, and very tall corner rectangles;
- zero/tiny radii;
- 50%/100% elliptical radii used by PolyCSS triangles;
- borders wider than one or both radii;
- all four corners mixed;
- diagonally opposing 80% concave corners;
- DPR 1, 1.25, 1.5, 2, 3;
- zoom and fractional box coordinates.

The geometry library should serialize sampled points in deterministic fixtures so formula regressions are visible without starting a browser.
