# Verdict and scope

## Decision

Build Cornerfill as a paint-equivalent polyfill, not as a false claim of complete browser geometry.

The no-`clip-path` breakthrough is a live CSS image. A transparent canvas contains the correctly shaped background and border, while the original DOM element retains layout, `matrix3d()`, opacity, visibility, backface behavior, and compositor ownership. WebKit and Firefox both expose legacy live-image hooks capable of keeping a canvas connected to CSS.

This is generic in the important sense: the shape is calculated at runtime from CSS box geometry and CSS shape values. It does not require authoring a special font or rewriting the application's source images. It remains subject to an explicit semantic ceiling because an image cannot alter descendant clipping or hit testing.

## Three product modes

Cornerfill should name its modes so users cannot confuse their guarantees.

### Paint mode

The element is an empty or paint-owned leaf. Cornerfill owns its background and, when enabled, border/shadow paint. This is the primary target and the PolyCSS mode.

Guarantee: the visible pixels can be made equivalent to native rendering within a declared raster tolerance. CSS transforms remain native. No descendant-clip promise is needed because there are no painted descendants.

### Decorate mode

The element may contain descendants, but the caller only needs the host's background, border, outline, and shadow to have the requested shape.

Guarantee: host decoration only. Descendants can still paint or receive pointer hits in areas that native `corner-shape` would exclude.

### Semantic mode

Full native behavior, including descendant overflow clipping, replaced content, backdrop/filter interactions, and hit testing.

Guarantee: unavailable through a Paint Level 1/live-image backend alone. Cornerfill must not expose this mode unless a future platform primitive actually supplies those semantics.

## Feasibility matrix

| Behavior | Paint/live-image fallback | Notes |
| --- | --- | --- |
| Background color | Yes | Paint into the transparent surface and remove the outside region |
| One decoded URL image | Yes | Load/cache it, implement CSS sizing/positioning, then draw it before contouring |
| PolyCSS atlas crop | Yes | A particularly small subset: URL, no-repeat, explicit size and position |
| Multiple URL layers | Yes, engineering work | The painter must own every layer whose outside pixels need to disappear |
| Linear/radial/conic gradients | Feasible, substantial parser work | Canvas gradients do not automatically share CSS gradient grammar or interpolation rules |
| Solid uniform border | Yes | Paint the region between outer and inner contours |
| Non-uniform border widths | Yes, difficult | Inner contour and per-side transition regions must follow CSS Borders 4 |
| Dotted/dashed/double/groove borders | Later | Native border painting is much more than a stroked path |
| Outer box shadow | Yes | Paint an outset contour, blur, and composite |
| Inset box shadow | Yes, difficult | Requires the correct inner contour and knockout behavior |
| Outline | Yes | Separate outset contour; exact joins need tests |
| `corner-shape` keywords | Yes | `round`, `squircle`, `square`, `bevel`, `scoop`, `notch` |
| Arbitrary `superellipse()` | Yes | Adaptive curve sampling is sufficient; cubic fitting is an optimization |
| Per-corner values | Yes | Resolve physical/logical longhands and 1–4 value shorthands |
| Shape/radius animation | Yes | Fallback must sample active computed values every animation frame |
| Transform animation | Yes, without repaint | The surface is attached before CSS compositing; transform is not a painter input |
| Opacity/visibility animation | Yes, without repaint | Native CSS applies these to the finished element |
| Descendant overflow clipping | No | An `<image>` cannot install the element's browser clip chain |
| Pointer hit testing | No | The DOM box remains rectangular in fallback engines |
| Replaced-content clipping | No | Paint ownership does not change how the replaced content is clipped |
| Layout/content flow | Correct by doing nothing | Native `corner-shape` and `border-shape` do not reshape layout |
| `border-shape: polygon(...) circle(0)` | Yes as a focused subset | Directly paint the two paths; still no descendant clipping |
| Full `border-shape` basic-shape grammar | Feasible as a separate phase | Requires a complete `<basic-shape>`/geometry-box parser and stroke/fill semantics |

## Why transparent output requires paint ownership

A transparent live canvas placed above an ordinary rectangular background does not remove that background. The original rectangle would remain visible through the canvas's transparent corner pixels.

Therefore Cornerfill must do one of the following:

1. own and repaint all affected background layers inside its surface; or
2. operate only on elements whose original background is already transparent and whose visible paint is supplied to Cornerfill through explicit carriers.

Using the canvas merely as an overlay is not a general solution. Using it as a CSS mask would solve the knockout, but CSS masks are explicitly outside this project's contract.

For PolyCSS the ownership transfer is narrow and deterministic: the painter receives the prepared atlas image plus `background-size` and `background-position`, draws the selected region, and clears everything outside the triangle contour.

## Corner shape versus border shape

They are related but not interchangeable.

`corner-shape` modifies the corners inside the areas established by `border-radius`. A zero radius means no shaped corner. Its inner border contour is derived from the outer curve and border widths.

`border-shape` replaces the rectangular border path with one or two arbitrary `<basic-shape>` values. One shape is stroke mode. Two shapes are fill mode: the first is the outer boundary and the second the inner boundary. A non-`none` `border-shape` makes `border-radius` and `corner-shape` irrelevant. The current draft also makes the inner shape the overflow clip, which a paint-only fallback cannot reproduce.

The implementation order should be:

1. `corner-shape` fill on paint-owned elements;
2. the exact PolyCSS `border-shape: polygon(...) circle(0)` fill case if still needed;
3. uniform solid borders and simple backgrounds;
4. full corner geometry and animation;
5. broader background and border paint;
6. general `border-shape` grammar.

## What “polyfill” may honestly mean

Cornerfill qualifies as a polyfill when it accepts the same author intent, computes the same paint geometry, and supplies it on browsers that lack the property. A polyfill does not have to be implemented inside the engine.

The package description must nevertheless say “paint polyfill” or “paint-compatible fallback,” not “complete drop-in polyfill,” unless the usage is restricted to paint-owned leaves. The distinction is observable in tests:

- native `corner-shape` changes hit testing in the corner region;
- Cornerfill's live image leaves the element's DOM hit box rectangular;
- native shaped overflow clips children;
- Cornerfill cannot remove child pixels it does not own.

## Requirements that define success

- No `clip-path` or CSS mask in any fallback backend.
- No font/glyph geometry.
- No application asset alpha preprocessing as the general mechanism.
- No required extra DOM child per PolyCSS face.
- The original face element keeps its transform.
- A background-position change repaints only that face's surface.
- A transform-only change does not repaint.
- Hidden or culled faces do not repaint.
- Surfaces are explicitly disposed and unregistered.
- Native rendering is used only when the required semantics are known to work.
- Every fidelity claim is backed by a browser image comparison, not only DOM/CSS inspection.

## Non-goals for the first release

- Reimplement every CSS background grammar production.
- Reimplement all decorative border styles.
- Pretend to clip arbitrary descendants.
- Patch browser prototypes as broadly as the old CSS Paint polyfill did.
- Scan inaccessible cross-origin stylesheets and guess their discarded declarations.
- Use a static data URL path for high-frequency animation.

## Go/no-go conclusion

Go for the PolyCSS and paint-owned-box target. The core surface and rotation premise is already proven at one element. Do not market arbitrary-DOM semantic equivalence. Treat full `border-shape` as a second project lane sharing the same painter and backends, not as a free extension of `corner-shape`.
