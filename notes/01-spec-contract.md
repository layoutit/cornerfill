# Spec contract

Status: current semantic synthesis against the 26 March 2026 Working Draft.
Project/backend limitations are recorded separately from native semantics.

Primary target: [CSS Borders and Box Decorations Level 4](https://drafts.csswg.org/css-borders-4/), Working Draft dated 26 March 2026. The editor's draft is live and can change; the pinned source revision used for this research is listed in [references](references.md).

## `corner-shape` value model

The shape lives inside each corner area established by `border-radius`. If either radius dimension is zero, that corner has no shaped area and `corner-shape` has no visible effect.

The computed value of each shape longhand is a `superellipse()` parameter `s`. The mathematical superellipse exponent is:

```text
n = 2^s
```

| Keyword | Parameter `s` | Exponent / limiting shape |
| --- | ---: | --- |
| `notch` | `-∞` | concave 90° notch |
| `scoop` | `-1` | concave quarter ellipse |
| `bevel` | `0` | straight diagonal |
| `round` | `1` | exponent 2, ordinary ellipse |
| `squircle` | `2` | exponent 4 |
| `square` | `+∞` | convex 90° square |

`corner-shape` takes one to four values in top-left, top-right, bottom-right, bottom-left order, with the same missing-value expansion pattern as four-sided CSS shorthands. Physical and flow-relative longhands must be resolved using writing mode and direction before geometry is built.

## Required contours

Native painting does not use one path for everything.

- The shape value defines the outer border edge.
- The inner border edge follows an offset-like contour that aims for nearly constant thickness; simply subtracting `border-width` from each radius is not generally correct.
- Outer shadows and overflow-clip outsets use axis-aligned expansion rules rather than blindly following the inner-border construction.
- Background clipping selects the appropriate border, padding, or content contour.
- Native overflow and hit testing use the shaped clip, not only the painted pixels.

Cornerfill therefore needs an explicit contour request such as:

```text
contour(box, radii, shapes, insets, purpose)
```

where `purpose` distinguishes outer edge, inner border, background clip, inset/outset shadow, and test-only hit geometry.

## General corner construction

The current draft describes each corner as a carve-out from an axis-aligned target rectangle. In broad terms:

1. Compute the unshaped target rectangle from border-box insets.
2. Apply ordinary border-radius constraint scaling.
3. For concave diagonally opposite corners, compute the additional hull-based scale factor that prevents overlap.
4. Derive the adjusted corner start, outer, end, and center points from the requested insets.
5. Build the corner carve-out path.
6. Boolean-subtract each carve-out from the target rectangle.

For a general finite parameter, the draft samples the curve with an implementation-chosen approximation. Expressed in the draft's corner coordinates, it uses a power curve based on `2^abs(s)` and reflects the convex result for negative parameters. Exact keyword cases can be emitted analytically:

- `bevel`: one line;
- `round`: elliptical arc;
- `square`: axis-aligned outer corner;
- `notch`: axis-aligned concave corner;
- `scoop`: reflected ellipse;
- other finite values: adaptively sampled curve or fitted cubic Béziers.

The spec intentionally leaves the clipping/boolean implementation to the engine. [CSSWG issue 14158](https://github.com/w3c/csswg-drafts/issues/14158) explains why this matters: the per-corner result is a pre-clip path that can overshoot the target rectangle, and the general case may require curve/line or curve/curve intersection if an implementation insists on producing one final vector path.

Cornerfill can avoid a general-purpose vector boolean library for its painted output. Canvas compositing is itself a raster boolean operation:

1. paint the target region;
2. set `globalCompositeOperation = 'destination-out'`;
3. fill each carve-out;
4. restore normal compositing.

`PaintRenderingContext2D` includes the Canvas compositing, path, and image-drawing
mixins, so the operation is available to the current main-thread fallback
contexts and would also be available to a future Native Paint backend. This is
an internal painter operation, not a CSS mask.

## Opposite-corner constraints

Ordinary `border-radius` scaling prevents adjacent radii from exceeding the box edges. Concave shapes add another failure mode: diagonally opposite scoops/notches can overlap in the interior.

The draft requires constructing a normalized hull for each concave corner, mapping the four hulls into the border box, and finding the largest common scale for each diagonal pair that prevents intersection. The final factor is the minimum of one and the two diagonal factors.

This cannot be skipped in a spec-complete geometry engine. It should have dedicated tests because WebKit's current preview implementation exposes `oppositeCornerScaleFactor()` but still returns `1.0` with a `TODO` at the pinned revision.

## Interpolation

Linear interpolation of the raw superellipse parameter produces visibly uneven motion near concave and convex extremes. The CSSWG resolved that interpolation should be linear in the corner's diagonal intersection, then converted back to the superellipse parameter. See [CSSWG issue 11608](https://github.com/w3c/csswg-drafts/issues/11608).

For finite `s`, let:

```text
n = 2^abs(s)
h = 0.5^(1 / n)
v = s < 0 ? 1 - h : h
```

`v` is the signed diagonal interpolation coordinate: `0` at notch, `0.5` at bevel, and `1` at square. Interpolate `v`, then invert:

```text
h = v < 0.5 ? 1 - v : v
n = ln(0.5) / ln(h)
s = log2(n) * (v < 0.5 ? -1 : 1)
```

### Current editor's-draft defect

As of this snapshot, the draft's forward algorithm says to compute `k = 0.5^abs(s)` and then `convexHalfCorner = 0.5^(1/k)`. That is not the inverse of the following conversion algorithm, reverses the stated limiting behavior, and differs from Blink and WebKit. This is a local algebraic erratum. The open [CSSWG issue 14157](https://github.com/w3c/csswg-drafts/issues/14157) separately tracks signed-versus-convex half-corner selection and the concave hull-direction mismatch; it does not establish the distinct printed forward-expression defect.

Cornerfill must not copy that expression verbatim. Use the CSSWG's closed interpolation resolution and differential tests against native Chromium. Keep the formula isolated behind tests so it can be updated when the draft is corrected.

## Inner border contour

The inner edge is not generally another superellipse with smaller radii. Border widths can differ on the two sides meeting at a corner, and concave shapes need their tip moved inward correctly.

Practical implementation rules drawn from the draft and engine sources:

- Special-case `round`, `scoop`, and `bevel` with stable closed-form geometry.
- Derive the general inset direction from the convex half-corner/hull direction, even when the visible shape is concave.
- Clip or composite the adjusted curve against the inner target rectangle.
- Preserve separate horizontal and vertical insets for non-uniform border widths.
- Generate the border as the outer region minus the inner region; do not use a centered Canvas stroke as the source of truth.

This is where a visually plausible polyfill most easily diverges from native output.

## Overflow, hit testing, and layout

The draft says shaped corners retain the overflow behavior of `border-radius`, except with the new shape. The WPT suite includes a hit-test test that checks `elementsFromPoint()` in the removed bevel corners. Those semantics belong to the browser's clip and event systems.

Paint Level 1 cannot supply them. Cornerfill records the same geometry for testing, but its live-image backends only change host paint.

Layout is different: both `corner-shape` and `border-shape` are visual. They do not alter the box's layout geometry or content flow. Leaving layout untouched is correct.

## `border-shape` contract

The same CSS Borders 4 draft defines `border-shape` as `none` or one/two `<basic-shape>` values with optional geometry boxes.

### One shape: stroke mode

The shape path is stroked. Width, style, and color come from the logical “relevant side,” which is the first non-`none` border side in block-start, inline-start, block-end, inline-end order, or block-start if all are `none`. The default reference box is `half-border-box`.

### Two shapes: fill mode

The first shape is the outer boundary and defaults to the border box. The second
is the inner boundary and defaults to the padding box. The border is the filled
region between them, using the relevant side's color.

### Interactions

- Non-`none` `border-shape` causes `border-radius` and `corner-shape` to be ignored.
- Outer shadow starts from the outer path and inset shadow from the inner path;
  ordinary spread, blur, offset, paint-order, and clipping rules still apply.
- The inner path is the native overflow clip.
- Layout and content flow remain rectangular.

The PolyCSS rule `polygon(50% 0, 100% 100%, 0 100%) circle(0)` is the simple two-shape fill case. A complete implementation is much larger because `<basic-shape>` includes circles, ellipses, inset/rect/`xywh()` forms, polygons, `path()`, and `shape()` with geometry-box and percentage resolution. Cornerfill currently implements none of this `border-shape` lane, and valid paint outside the border box cannot be carried by its live background image.

## Required conformance corpus

Start from the [pinned WPT corner-shape directory](https://github.com/web-platform-tests/wpt/tree/4a5810a124fa0523dd2494996bf1542d4b67f394/css/css-borders/corner-shape), then classify tests:

- parse/computed value;
- keyword and arbitrary parameter rendering;
- asymmetric/percentage radii;
- borders and images;
- inner/outer shadows;
- overflow and backdrop/filter composition;
- hit testing;
- interpolation and animation;
- zoom/extreme-value crash cases.

Paint-mode conformance applies only to the admitted border-box-contained host
paint subset. Descendant overflow, hit testing, replaced-content clipping,
multi-fragment boxes, shaped backdrop-filter, outer shadows, external outlines,
and out-of-box `border-shape` paint must be marked “unimplementable by this
backend,” not silently counted as passes. Existing explicit runtime refusals are
sufficient; this classification does not require a new test per exclusion.
