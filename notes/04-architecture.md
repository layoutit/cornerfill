# Proposed architecture

## End-to-end flow

```text
authored CSS / direct prepared state
  -> declaration transport
  -> computed box snapshot
  -> normalized corner or border shape
  -> contour requests
  -> owned paint graph
  -> backend-neutral painter
  -> native paint | WebKit live canvas | Firefox live element | static image
  -> CSS image on the original element
  -> browser compositor applies transform/opacity/visibility
```

Geometry, paint ownership, scheduling, and backend plumbing must be separate. Mixing them is how a “small polyfill” becomes impossible to test.

## Proposed module boundaries

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

The geometry package should have no DOM imports. Given numbers and normalized enums, it returns paths/curve commands or carve-out commands. It should be unit-testable in Node.

## Author declaration transport

Unsupported properties can be discarded by the target engine's CSS parser, so a runtime CSSOM scanner cannot reliably recover the author's `corner-shape` or `border-shape` declaration. Cross-origin stylesheets add another barrier because their rules are not readable without CORS.

The robust general solution is a build transform that duplicates supported declarations into durable custom-property carriers adjacent to the original declarations:

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

The transform must preserve cascade order, importance, custom properties, media/supports/layer context, and URL base. It should not remove the native declaration. Supporting browsers continue to use native CSS.

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
else if native CSS Paint plus required image/compositing support:
  native paint backend
else if WebKit named CSS canvas probe passes:
  WebKit live canvas backend
else if Firefox element-image probe passes:
  Gecko live element backend
else if static fallback explicitly allowed:
  static image backend
else:
  report unsupported
```

The live-surface probe should create one tiny surface, draw a known alpha/color pattern, attach it, mutate it, and verify the backend's state hooks. Automated release qualification adds screenshot comparison; normal runtime detection should remain cheap.

## State model

Each controlled element needs a compact record:

```ts
interface Entry {
  element: HTMLElement;
  mode: "corner" | "border-shape";
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
  shadowOutsets?: RasterShape[];
}
```

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

The first release can support a declared subset and fail visibly/diagnostically on an unsupported layer. Silently leaving a rectangular native layer underneath would violate the core transparency guarantee.

## `border-shape` lane

Reuse surfaces, paint graph, scheduling, and lifecycle. Replace only the geometry resolver.

Phase order:

1. two-shape `polygon(...) circle(0)` for the PolyCSS triangle;
2. circle/ellipse/polygon/inset/rect/xywh;
3. `path()`;
4. `shape()` and full percentage/calc resolution;
5. stroke-mode border styles and relevant-side selection.

Do not route arbitrary `border-shape` strings through `clip-path` as a renderer. A target engine's existing shape parser may be useful as an optional parse aid, but Cornerfill's output must still be its live painted image.

## Surface allocation

Baseline: one surface per active element. It is easy to reason about and matches the old polyfill's proven live-image mapping.

Possible later optimizations:

- share immutable surfaces for identical size/geometry/paint keys;
- pool detached canvases by backing size;
- delay allocation for culled/offscreen entries;
- keep small canonical PolyCSS surfaces rather than transformed screen bounds;
- batch repaint scheduling while retaining per-element live image identity.

Do not share surfaces whose pixels diverge per animation frame merely because their shape is identical.

## Public API sketch

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
- Image decode failure: use the CSS layer's defined fallback color if available.
- Surface bridge failure: fall through to the next backend once, not every frame.
- Oversized allocation: refuse or downscale according to an explicit policy.
- Native uncertainty: prefer Cornerfill for paint-only callers; report that semantic callers remain unsupported.
