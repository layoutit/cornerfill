# Verdict and scope

Status: current product-scope synthesis. “Feasible” means compatible with the
carrier in principle; “implemented” and “qualified” are stated separately.

## Decision

Build Cornerfill as a paint-equivalent polyfill, not as a false claim of complete browser geometry.

The no-`clip-path` breakthrough is a live CSS image. A transparent canvas contains the correctly shaped background and border, while the original DOM element retains layout, `matrix3d()`, opacity, visibility, backface behavior, and compositor ownership. WebKit and Firefox both expose legacy live-image hooks capable of keeping a canvas connected to CSS.

This is generic in the important sense: the shape is calculated at runtime from CSS box geometry and CSS shape values. It does not require authoring a special font or rewriting the application's source images. It remains subject to an explicit semantic ceiling because an image cannot alter descendant clipping or hit testing.

## Three product modes

Cornerfill should name its modes so users cannot confuse their guarantees.

### Paint mode

The element is an empty or paint-owned leaf. Cornerfill owns its admitted
background, border, and contained-effect paint. This is the primary target and
the PolyCSS mode.

Target: native-equivalent visible pixels within a reviewed, declared raster
tolerance. No native-to-candidate parity guarantee exists while the oracle state
is `UNQUALIFIED`. CSS transforms and author filters remain native.

### Decorate mode

The element may contain descendants, but the caller only needs the admitted
host background and border subset to have the requested shape. A contained
outline is equivalent only when no host foreground or pseudo-element overlaps it.

Contract: admitted host decoration only, with each paint subset retaining its
oracle qualification state. Descendants can still paint or receive pointer hits
in areas that native `corner-shape` would exclude.

### Semantic mode

Full native behavior, including descendant overflow clipping, replaced content,
multi-fragment boxes, shaped backdrop-filter interactions, external effects,
and hit testing. Ordinary author `filter` is not part of this unavailable mode:
it remains on the original element and browser-owned in paint/decorate modes.

Guarantee: unavailable through a Paint Level 1/live-image backend alone. Cornerfill must not expose this mode unless a future platform primitive actually supplies those semantics.

## Feasibility matrix

| Behavior | Paint/live-image fallback | Notes |
| --- | --- | --- |
| Background color | Implemented, unqualified | Paint into the transparent surface and remove the outside region |
| One static same-origin/CORS raster URL | Implemented subset, unqualified | Cross-origin no-CORS and animated-image timing are outside the current decode/draw contract |
| PolyCSS atlas crop | Implemented, unqualified | A particularly small subset: URL, no-repeat, explicit size and position |
| Multiple URL layers | Implemented subset, unqualified | Every admitted layer is owned; general CSS image grammar is not implied |
| Background blending | One explicit-runtime `multiply` subset, unqualified | Exactly one explicitly opaque raster over one opaque RGB/hex color; broader modes, layers, gradients, and translucent inputs are refused |
| Linear/radial/conic gradients | Geometry implemented, color parity unqualified | Default CSS uses Oklab/premultiplied interpolation while Canvas does not; general exactness needs CSS Color-aware rasterization or a much narrower declared subset |
| Solid uniform border | Implemented, unqualified | Paint the region between outer and inner contours |
| Non-uniform border widths, one color | Implemented, unqualified | Correct inner contour is required; per-side partitioning is not |
| Dotted/dashed/double/groove borders | Unsupported; outside current lane | Native border painting is much more than a stroked path |
| Outer box shadow | No | The final background image cannot paint beyond the border box |
| Inset box shadow | One contained subset implemented, unqualified | Broader blur/offset grammar remains unsupported |
| Outline | One fully contained solid subset implemented, unqualified | External pixels are impossible; foreground/pseudo overlap prevents general stacking equivalence |
| `corner-shape` keywords | Implemented, unqualified | `round`, `squircle`, `square`, `bevel`, `scoop`, `notch` |
| Arbitrary `superellipse()` | Implemented, unqualified | Adaptive sampling is used; cubic fitting remains an optional optimization |
| Per-corner values | Implemented, unqualified | Resolve physical/logical longhands and 1–4 value shorthands |
| Radius animation | Implemented sampling, unqualified | Active computed radii are sampled while their declaration path is observable |
| Shape animation | Explicit-carrier/direct path only | Default auto transport does not preserve authored `corner-shape` keyframes |
| Transform animation | Implemented without repaint | The surface is attached before CSS compositing; transform is not a painter input |
| Opacity/visibility animation | Browser-owned without repaint | Native CSS applies these to the finished element |
| Descendant overflow clipping | No | An `<image>` cannot install the element's browser clip chain |
| Pointer hit testing | No | The DOM box remains rectangular in fallback engines |
| Replaced-content clipping | No | Paint ownership does not change how the replaced content is clipped |
| Layout/content flow | Correct by doing nothing | Native `corner-shape` and `border-shape` do not reshape layout |
| `border-shape: polygon(...) circle(0)` | Future contained-paint candidate only | No current parser, runtime, capability, or oracle path; still no descendant clipping |
| Full `border-shape` grammar/output | No current parity claim | Parsing may be implementable, but valid stroke/fill paint can escape the carrier and full semantics include relevant-side ownership and native clipping |

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

The completed/current `corner-shape` order is:

1. `corner-shape` fill on paint-owned elements;
2. uniform and one-color unequal-width solid borders;
3. the prepared PolyCSS atlas path and dirty-only runtime;
4. only bounded background additions that preserve honest oracle status.

`border-shape` is not the next free phase of this queue. Any later work must be
a separately authorized, border-box-contained paint subset with its own parser,
ownership, capability, and oracle contract.

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
- The original element keeps author `filter`, stacking, and pseudo-elements.
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

Go for the PolyCSS and paint-owned-box target. The core surface and rotation
premise is implemented beyond the original one-element probe, while visual
candidate parity remains `UNQUALIFIED`. Do not market arbitrary-DOM semantic
equivalence. Treat any `border-shape` work as a separate research and
implementation lane. It may reuse internal machinery, but full rendered parity
is not bridgeable when valid paint or native semantics extend beyond the
border-box image.
