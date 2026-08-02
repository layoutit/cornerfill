# Hard limits and rejected routes

Status: current backend limits. These are product boundaries, not deferred
implementation items unless the carrier itself changes.

## The hard limit

CSS Paint API Level 1 defines `paint()` as an `<image>` generator. Its introduction explicitly says a future version could add ways to define a clip, global alpha, or filter on part of a box. That future-facing note is evidence that Level 1 does not currently install those box semantics.

A live WebKit/Firefox canvas is also only a CSS image. It can make the host's corner pixels transparent. It cannot:

- paint any final pixel outside the host's border box, including outer shadows,
  external outlines, or out-of-box `border-shape` strokes/fills;
- alter the browser's overflow clip chain for descendants;
- change `elementsFromPoint()`/pointer hit testing;
- clip native text, replaced content, video, iframe, or child compositing layers it does not paint;
- represent multiple fragments of one element with one border-box image;
- install the shaped clip required by `backdrop-filter`;
- make layout flow follow the shape.

This is an API boundary, not lack of effort. The honest solution is to target paint-owned leaves and label decoration-only behavior elsewhere.

## Why no overlay can create transparency

If a rectangular native background is already painted, drawing a transparent pixel above it reveals that background. Drawing an opaque “cover-up” pixel hides it with some replacement color, but fails over arbitrary content/backdrops and is not transparency.

The fallback must either own the original paint or use a true clipping/masking primitive. Cornerfill chooses paint ownership because `clip-path` and CSS masks are excluded.

## Route comparison

| Route | Why it was considered | Why it is not Cornerfill's answer |
| --- | --- | --- |
| `clip-path: path(...)` | Directly clips paint, descendants, and hit region in many cases | Explicitly disallowed; it is the mechanism used by the existing Hyperellipse fallback |
| CSS `mask-image` / `-webkit-mask` | Alpha knockout with easy shape images | Explicitly disallowed and remains a second CSS renderer |
| Paint Worklet used as a mask | Houdini computes geometry | Still depends on CSS masking; does not unlock the requested route |
| SVG data URI/pseudo layers | Can draw complex rings, shadows, and outlines | Hyperellipse already uses this; extra layers and SVG ownership are wrong for the PolyCSS target and still do not give full host semantics |
| Font triangle + `background-clip:text` | Reusable vector stencil, no path parser | Font rasterization and transformed text introduce the rotation failure the user rejected; wrong abstraction for arbitrary corner values |
| Baked alpha in the sprite atlas | Keeps one face and rotates correctly | Application-specific asset rewrite, not a CSS property polyfill |
| Nested transformed boxes + `overflow` | Ordinary CSS boxes can intersect into a triangle | Adds DOM/paint layers per face, complicates 3D flattening/visibility, and performed poorly or failed in engine probes |
| Canvas overlay positioned above element | Canvas can draw exact contour | Requires duplicating/synchronizing transform, stacking, opacity, visibility, and hit behavior; no reason to detach it when a live CSS image can stay on the element |
| Pseudo-element canvas/image | Avoids replacing host background | Transparent pseudo pixels cannot erase a rectangular host background; ownership still has to move |
| `border-image` | Image-valued property with slicing | Changes border paint, not arbitrary background/descendant clipping; cannot remove the host's rectangular fill |
| Cover-up triangles in ancestor color | Cheap visual trick on flat UI | Cannot represent actual transparency or unknown content behind the element |
| Static data URL per frame | Works in almost any image property | Serialization/decode/style churn makes it a last-resort static mode, not an animation backend |
| Live CSS image | Repaints transparent pixels in place and stays on original element | Selected route; honest paint-only semantic ceiling |

## Existing Hyperellipse polyfill

[mikhailmogilnikov/hyperellipse](https://github.com/mikhailmogilnikov/hyperellipse) is useful prior art for parsing and geometry. Its own README says Safari/Firefox use `clip-path`/SVG layers. The renderer confirms:

- simple mode applies `clip-path: path(...)` and `-webkit-clip-path`;
- visible fallback borders are generated as uniform solid SVG data-URI rings;
- dashed, dotted, `double`, and per-side border paint is flattened to that
  uniform solid ring rather than preserved;
- shadow/outline mode creates SVG-backed pseudo layers.

That is a rational general-UI design, but it violates the actual PolyCSS constraints. Cornerfill should study its tests and parsing decisions without adopting its renderer.

The older [jsnkuhn/corner-shape](https://github.com/jsnkuhn/corner-shape) repository is historical prior art, not the live-surface solution.

## Rejected alpha-atlas experiment

An exploratory Mario-specific route put triangle alpha directly into each lighting tile. It was technically effective at keeping the existing transformed face element and eliminating live clipping.

Recorded preparation result:

- 994,660 polygon/frame fields;
- 150,985 deduplicated unique states;
- an exploratory 8×8 RGBA packing across 62 512×512 pages;
- about 7.9 MB encoded and 62 MB decoded in that prototype.

It remained the wrong answer to the polyfill question. It rewrites source assets, encodes one application's triangle geometry, and cannot respond generically to `corner-shape`, radii, borders, or arbitrary author backgrounds. It belongs only in the rejected-experiment record.

## Rejected overflow-box experiment

Another experiment made a triangle from nested transformed boxes and rectangular overflow intersections. The standard `overflow: clip` value was promising because it avoids creating a scroll container and is friendlier to `transform-style` than `overflow:hidden`.

Exploratory results, not release benchmarks:

- the basic triangle survived compound rotation in Chromium, Firefox, and WebKit;
- a dense 1,213-face stress scene was roughly 60 fps in WebKit, around 25 fps in Chromium, and substantially slower in Firefox under that test setup;
- a later full-model Firefox prototype painted Mario;
- WebKit created the 1,213 fallback faces but they were invisible, exposing a 3D subtree/engine problem;
- the route required extra per-face boxes or prewarped assets.

This line was stopped. It increases DOM, paint, and transform complexity and is inferior to the live-image route. The heavy probes also caused unacceptable machine pressure and must not be rerun casually.

## Why Houdini was not a cop-out

Two different claims were initially conflated:

1. Safari/Firefox do not ship native Paint Worklets.
2. A Houdini-style painter cannot solve the rotating atlas problem.

The first is true; the second is false. Native Paint in Chromium can receive a CSS image and draw it. Safari/Firefox can expose equivalent live output through their vendor canvas-image hooks. The transformed result stays attached to the original element.

The fundamental spatial limitation is not rotation; it is the box semantics and
border-box output bound that the image carrier never exposes. Independent paint
fidelity limits—such as CSS-gradient color interpolation—still require their own
qualification or refusal.

## `border-shape` limitation

A border-box-contained one/two-shape paint experiment may be feasible, but no
`border-shape` path is currently implemented. Full native semantics and output
still include:

- relevant-side border style selection;
- shadows following outer/inner paths;
- inner-path overflow clipping;
- all `<basic-shape>` grammar and geometry boxes;
- stroke/fill pixels that validly extend outside the border-box carrier;
- unresolved draft questions such as clipping replaced elements.

Any future Cornerfill subset must declare its parser, relevant-side ownership,
geometry boxes, paint modes, output bound, and oracle separately. It must not be
treated as a free follow-on to narrowing `corner-shape` background coverage.

## Conditions that would change the boundary

Any of the following could permit a more complete future mode:

- interoperable native `corner-shape`/`border-shape` in all target engines;
- a future Paint API level that lets a worklet define the element clip;
- a standardized custom hit-test/overflow path API;
- relaxing the project's ban on `clip-path` or masks;
- restricting the component contract so all painted content is owned by Cornerfill.

Until then, the package should make its paint-only contract impossible to miss.
