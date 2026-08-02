# Geometry and painting design

Status: contour/raster-boolean geometry and the documented shipped subsets are
implemented. General CSS backgrounds, borders, and effects remain bounded by
the qualification and carrier limits stated below.

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

Adaptive sampled output is the current correctness-first route. Two fitted cubic
halves, like Blink/WebKit, remain an optional optimization only after a
differential suite establishes maximum error across parameters, aspect ratios,
insets, and DPR.

## Contour construction

Represent the draft's operation instead of prematurely forcing one closed vector path:

```ts
interface RasterShape {
  targetRect: Rect;
  carveOuts: PathCommand[][];
}
```

The outer shape is `borderRect minus outerCornerCarveOuts`. Inner border,
background, and contained inset-effect contours repeat the construction with
purpose-specific insets and adjusted corners. Outset contours can be useful to
a native reference renderer, but cannot be emitted by the current border-box
carrier.

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

Repeated `destination-out` is union subtraction: if two carve-outs overlap, the
overlap stays removed. That is safer than relying on even/odd parity. The
operation happens inside the generated image and uses the Canvas compositing API
available to the current main-thread surfaces (and to a possible future Paint
context). It is not a CSS mask and adds no DOM renderer.

For a background fill, the simplest sequence is:

1. clear the surface;
2. paint all owned background layers across their CSS painting areas;
3. subtract the regions outside the selected background-clip contour.

This is the first production slice.

## Borders

An ordinary or `corner-shape` CSS border is a region between two contours, not
a centered Canvas stroke. One-shape `border-shape` is a separate explicit stroke
mode in CSS Borders 4.

For a uniform solid border:

1. paint the outer contour with the border color;
2. paint the background over it, restricted to the inner/background contour; or
3. construct the ring as outer shape minus inner shape on a scratch layer and composite it over the background.

Main-thread live-surface backends can use a pooled `OffscreenCanvas`/hidden
scratch canvas if needed. A future Native Paint Worklet backend could not assume
a DOM canvas is constructible; it would need a correctly wound inner contour or
a direct compositing sequence on the supplied output context.

The inner contour must come from border-aware inset geometry. A naive `rx -= borderWidth; ry -= borderWidth` fails on bevel/scoop/notch and non-uniform widths.

### Unequal widths, per-side colors, and styles

One-color unequal widths require the correct inner contour but no side-color
partition. That subset is implemented. Differing side colors or styles require
partitioning the ring into side regions without bleeding into neighboring
corners; Blink's implementation article shows why simple quadrant clips are
insufficient for extreme mixed curves.

Conventional Cornerfill subset status:

1. no border — implemented;
2. uniform solid border — implemented, oracle unqualified;
3. non-uniform widths with one color — implemented, oracle unqualified;
4. per-side solid colors — unsupported;
5. double/dashed/dotted — unsupported;
6. 3D styles (`groove`, `ridge`, `inset`, `outset`) — unsupported.

This is not “full native borders”: `<image-1D>` colors, `hairline`, border
images, partial-border grammar, and other current/future CSS Borders 4
productions remain outside the declared subset. Every admitted level must be
explicit in package metadata and diagnostics.

## Background painting

### Color

Paint the background color at the bottom of the owned layer stack, subject to the resolved `background-clip` behavior.

### URL image

For admitted static same-origin or CORS-enabled raster URLs, implement the CSS
Images/Backgrounds sizing algorithm rather than treating every image as
`100% 100%`:

- intrinsic dimensions/aspect ratio;
- explicit `<length-percentage>` pairs;
- `cover` and `contain`;
- position area and percentage formula;
- repeat, round, space, no-repeat;
- origin and clip boxes;
- multiple layers in CSS paint order.

The URL/repeat/origin geometry is implemented, but native raster sampling parity
is not qualified. In the focused `raster-repeat-origin` differential, the
content-box, six rounded tiles, restored aspect ratio, and bottom offset resolve
to the CSS algorithm. Its 1,865 changed interior pixels have zero interior alpha
error but nonzero premultiplied-RGB error, isolating the remaining difference to
native CSS versus Canvas image resampling. The case remains `UNQUALIFIED` and
`handle.explain()` reports that limit.
Native CSS cross-origin no-CORS images and animated-image timing are not
preserved by the current request/decode/draw path.

General [`image-set()`](https://drafts.csswg.org/css-images-4/#image-set-notation)
remains unimplemented and UA-owned. Its candidate choice may use UA-specific
criteria and change over a page lifetime, while the selected density also
changes intrinsic CSS sizing. A deterministic URL-only DPR policy
could be a separately labelled Cornerfill/prepared subset, but it must not claim
general native `image-set()` parity.

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

### Blend mode

One bounded explicit-runtime subset is implemented: one scroll-attached raster
declared opaque with `rasterIsOpaque: true` can use `multiply` over one opaque
`rgb()`/hex background color. The painter fills that color, draws the raster with
Canvas `globalCompositeOperation = "multiply"`, and uses no scratch surface.
The ordinary and prepared atlas paths remain unchanged; prepared multiply is
refused. The focused Chrome differential is pixel-exact but remains
`UNQUALIFIED` under the oracle contract. Multiple images, gradients, translucent
inputs, other blend modes, and automatic opacity inference remain unsupported.

### Gradients

Canvas has linear/radial/conic gradient primitives, but CSS gradient fidelity also requires:

- CSS angle/direction conventions;
- automatic and double-position color stops;
- interpolation hints;
- repeating periods;
- color interpolation spaces and hue methods;
- premultiplied-alpha behavior;
- radial sizing keywords and elliptical radii.

The decisive mismatch exists even when the interpolation method is omitted:
[CSS Images 4](https://drafts.csswg.org/css-images-4/#coloring-gradient-line)
defaults gradients to Oklab with premultiplied-alpha interpolation, whereas
[Canvas](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvasgradient-addcolorstop-dev)
interpolates stops in the context color space without premultiplying alpha. The
current parser rejects explicit interpolation spaces
but accepts the omitted/default form, then delegates color strings to Canvas.
That route is geometric/experimental, not default-CSS color parity.

A deliberately narrow explicit-sRGB, fully opaque legacy-color subset could
avoid a general CSS Color engine because premultiplication is inert at alpha 1,
but it would still require raster qualification. Default gradients, differing
alpha, hints, missing components, wide-gamut colors, and synthesized boundary
colors require CSS Color-aware interpolation or refusal. Do not expand repeating
or absolute-stop grammar on top of the current unqualified premise.

## Background clip choices

The live surface occupies the border box. Resolve `background-origin` and `background-clip` independently for each layer.

- `border-box`: subtract outside the outer contour.
- `padding-box`: use the inner border contour.
- `content-box`: use the content inset with a corresponding shaped contour where the spec requires it.
- `border-area`: relevant to a possible native/`border-shape` lane, but the current Cornerfill background parser rejects it.
- `text`: outside Cornerfill's first scope.

## Contained effects and impossible outsets

The final generated image is the host's border-box background. A padded scratch
surface does not change that destination bound. Outer box shadows and every
outline pixel outside the border box are therefore impossible through the
current backend and must remain unsupported.

The implemented inset subset is one zero-offset, zero-blur inset ring with
non-negative spread. The implemented outline subset is one fully contained solid
ring. Both remain native-differential `UNQUALIFIED`; broader blur, offset, style,
or stacking behavior is not implied.

Native [outline paint](https://drafts.csswg.org/css-ui-4/#outline-props) is above
the host box, while a live background image is below foreground and
pseudo-elements. Even a geometrically contained outline is
therefore equivalent only for empty/paint-owned leaves with no overlapping host
foreground or pseudos. Ordinary author `filter` remains browser-owned on the
original element; Cornerfill must not replace box-shadow with `drop-shadow()` or
rasterize the filter into its background.

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

Do not put transform matrices in any paint cache key. Do not cache a failed image
forever; the current cache removes the failed record so a later request can retry.

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
