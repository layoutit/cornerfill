# Architecture status and design

Status: the ownership flow and WebKit/Gecko surface model are implemented. The
TypeScript module tree, build transform, Native Paint backend, `border-shape`
lane, and parts of the API below are historical or future sketches, not release
requirements. [`src/`](../src/) is the implementation authority.

## End-to-end flow

```text
authored CSS / direct prepared state
  -> declaration transport
  -> computed box snapshot
  -> normalized corner shape
  -> contour requests
  -> owned paint graph
  -> backend-neutral painter
  -> WebKit live canvas | Firefox live element | opt-in static data URL
  -> CSS image on the original element
  -> browser applies foreground/pseudos, transform/opacity/filter/visibility/stacking
```

Geometry, paint ownership, scheduling, and backend plumbing must be separate. Mixing them is how a “small polyfill” becomes impossible to test.

## Superseded proposed module boundaries

```text
src/
  api/
    install.ts
    controller.ts
    requirements.ts
  capture/
    build-transform.ts
    stylesheet-scan.ts
    computed-snapshot.ts
    shadow-roots.ts
  parse/
    corner-shape.ts
    border-radius.ts
    background.ts
    border-shape.ts
    css-values.ts
  geometry/
    corner.ts
    constraints.ts
    contour.ts
    interpolation.ts
    basic-shape.ts
  paint/
    graph.ts
    background.ts
    border.ts
    shadow.ts
    compositor.ts
  backends/
    native-paint.ts
    webkit-canvas.ts
    moz-element.ts
    static-image.ts
  runtime/
    registry.ts
    invalidation.ts
    animation-loop.ts
    image-cache.ts
    visibility.ts
  probes/
    native-corner.ts
    live-surface.ts
```

The shipped source uses flat `.mjs` modules rather than this tree. The enduring
boundary is that numeric geometry remains DOM-independent and unit-testable;
this file layout must not be recreated merely to satisfy the old sketch.

## Author declaration transport

Unsupported properties can be discarded by the target engine's CSS parser, so a runtime CSSOM scanner cannot reliably recover the author's `corner-shape` or `border-shape` declaration. Cross-origin stylesheets add another barrier because their rules are not readable without CORS.

A possible future general solution is a build transform that duplicates
supported declarations into durable custom-property carriers adjacent to the
original declarations. No such build transform ships today:

```css
.card {
  border-radius: 24px;
  corner-shape: squircle;
  --cornerfill-corner-shape: squircle;
}
```

For image ownership:

```css
@property --cornerfill-background-image {
  syntax: "<image>";
  inherits: false;
  initial-value: linear-gradient(transparent, transparent);
}

.face {
  background-image: url("texels.webp");
  --cornerfill-background-image: url("texels.webp");
}
```

If implemented later, the transform must preserve cascade order, importance,
custom properties, media/supports/layer context, and URL base. It must not remove
the native declaration. Supporting browsers continue to use native CSS.

The current default import instead reads accessible author CSS once and creates
a companion stylesheet containing shape carriers. It cannot recover inaccessible
cross-origin/imported rules, constructed/adopted sheets, closed roots, or
authored `corner-shape` declarations inside `@keyframes`; those cases require
explicit carriers or the direct API.

Runtime-only adoption can be best-effort:

- explicit `data-cornerfill`/custom properties;
- same-origin readable stylesheets;
- inline styles intercepted through a narrow Cornerfill API;
- direct prepared state for renderers such as PolyCSS.

Do not promise recovery of an unknown declaration already dropped by a foreign parser.

## Direct prepared-state path

High-frequency renderers should not repeatedly serialize and reparse CSS. Expose an internal/direct controller:

```ts
interface CornerfillHandle {
  setGeometry(state: ResolvedGeometry): void;
  setPaint(state: ResolvedPaint): void;
  setVisibility(visible: boolean): void;
  dispose(): void;
}
```

PolyCSS preparation can emit normalized radii, a fixed bevel shape, atlas identity, crop metadata, and canonical surface dimensions. Runtime lighting updates then change only the crop key. This stays a generic Cornerfill backend while avoiding CSSOM work in a known prepared pipeline.

## Capability selection

Backend selection is per document and requirement profile, not per frame.

```text
if complete native property for requested features:
  native property, no Cornerfill surface
else if WebKit named CSS canvas probe passes:
  WebKit live canvas backend
else if Firefox element-image probe passes:
  Gecko live element backend
else if static fallback explicitly allowed:
  static image backend
else:
  report unsupported
```

A Native Paint branch is a future option, not part of current selection.

The live-surface probe should create one tiny surface, draw a known alpha/color pattern, attach it, mutate it, and verify the backend's state hooks. Automated release qualification adds screenshot comparison; normal runtime detection should remain cheap.

## State model

Each controlled element needs a compact record:

```ts
interface Entry {
  element: HTMLElement;
  mode: "corner"; // border-shape would be a separate future state model
  requirements: NativeRequirements;
  geometryKey: string;
  paintKey: string;
  surfaceKey: string;
  surface: LiveSurface | null;
  animationActive: boolean;
  visible: boolean;
}
```

Keys should be stable hashes/tuples over normalized data, not raw `cssText`. Separate geometry and paint keys allow an atlas crop change to reuse the path and a shape animation to reuse the decoded image.

## Paint ownership protocol

Before applying overrides:

1. snapshot all CSS values Cornerfill will own;
2. resolve relative URLs against their declaration base;
3. build and decode the paint graph;
4. allocate/resize the surface;
5. paint a complete first frame;
6. atomically switch the element to the live CSS image;
7. make the original owned background/border paint transparent or otherwise inert without changing layout.

The override must avoid recursive capture. Once `background-image` is the live surface, reading computed `background-image` would return Cornerfill's output rather than the source. Store the authored/resolved source separately and expose refresh hooks when author state changes.

For a fully owned background, a typical override is conceptually:

```css
background-color: transparent !important;
background-image: var(--cornerfill-live-image) !important;
background-position: 0 0 !important;
background-size: 100% 100% !important;
background-repeat: no-repeat !important;
border-color: transparent !important; /* only when border is painted by Cornerfill */
```

Actual implementation should use one scoped generated stylesheet rather than a growing inline-style string, and it must restore the author's state on teardown.

## Geometry-to-paint contract

The painter should consume purpose-specific masks/paths:

```ts
interface ShapeGeometry {
  outer: RasterShape;
  innerBorder?: RasterShape;
  backgroundClip: RasterShape;
}
```

Outset contours may exist in a native-reference geometry tool, but they are not
renderable production output: the final live background image cannot carry
pixels beyond the border box.

`RasterShape` can expose direct closed-path commands for simple contours and a `rect minus carveOuts` representation for general cases. The Canvas compositor decides how to realize the boolean operation. This avoids forcing geometry to solve path intersection when raster subtraction is sufficient.

## Background paint graph

Normalize CSS into explicit layers:

```ts
type BackgroundLayer =
  | { kind: "color"; color: string }
  | { kind: "image"; imageId: string; size: SizeRule; position: PositionRule; repeat: RepeatRule }
  | { kind: "linear-gradient"; /* normalized stops and line */ }
  | { kind: "radial-gradient"; /* normalized center/radii/stops */ }
  | { kind: "conic-gradient"; /* normalized center/angle/stops */ };
```

The implementation supports a declared subset and must fail before ownership on
an unsupported layer. Gradient nodes currently map geometry into Canvas
gradients but remain color-semantics `UNQUALIFIED`; their presence in this graph
is not a CSS Color parity claim. Silently leaving a rectangular native layer
underneath would violate the core transparency guarantee.

## `border-shape` lane — future and bounded

There is no current `border-shape` parser, value transport, state model,
capability, painter path, or oracle fixture. It is not merely a replacement
geometry resolver: one/two-shape modes add geometry-box resolution,
relevant-side width/style/color selection, stroke/fill ownership, and different
overflow/effect semantics.

A separately authorized future lane may reuse the border-box surface, scheduling,
and lifecycle only for a declared paint subset whose complete output stays
inside the carrier. Full rendered parity is unavailable when a valid stroke,
shadow, or outline extends outside it. Do not route arbitrary strings through
`clip-path`, and do not add general grammar to the `corner-shape` coverage queue.

## Surface allocation

Baseline: one surface per active element. It is easy to reason about and matches the old polyfill's proven live-image mapping.

Possible later optimizations:

- share immutable surfaces for identical size/geometry/paint keys;
- pool detached canvases by backing size;
- delay allocation for culled/offscreen entries;
- keep small canonical PolyCSS surfaces rather than transformed screen bounds;
- batch repaint scheduling while retaining per-element live image identity.

Do not share surfaces whose pixels diverge per animation frame merely because their shape is identical.

## Historical public API sketch

The following illustrates intent but is not the shipped signature. Current
exports and behavior live in [`src/index.mts`](../src/index.mts) and
[`src/runtime.mts`](../src/runtime.mts).

```ts
const controller = installCornerfill({
  selector: "[data-cornerfill]",
  mode: "paint",
  native: "qualified",
  staticFallback: false,
});

controller.refresh();
controller.attach(element, preparedState);
controller.detach(element);
controller.destroy();
```

Useful diagnostics:

```ts
controller.backend;
controller.entries;
controller.stats();
controller.explain(element);
```

`explain()` should report the selected backend, captured source, unsupported paint features, last invalidation reason, surface dimensions, and whether the current mode lacks native overflow/hit semantics.

## Failure policy

- Invalid shape syntax: leave native/author fallback untouched and emit a development diagnostic.
- Unsupported background grammar: do not partially take ownership unless the caller explicitly accepts it.
- Plain URL decode failure: abort ownership/report failure before switching and
  preserve the stack's `background-color`. A CSS
  [invalid image](https://drafts.csswg.org/css-images-4/#invalid-image) is
  otherwise transparent with no natural dimensions; use a grammar-defined
  fallback only when that grammar is explicitly implemented.
- Surface bridge failure: fall through to the next backend once, not every frame.
- Oversized allocation: refuse. No current downscale policy is implemented.
- Native uncertainty: prefer Cornerfill for paint-only callers; report that semantic callers remain unsupported.
