# PolyCSS Mario case study

This is the first high-value consumer for Cornerfill. It is also a unusually clean fit for the honest paint-only boundary: Mario is a retained DOM scene made from empty polygon leaves whose visible content is an atlas image. The browser still owns every face's layout and 3D transform; Cornerfill needs to own only the leaf's local pixels.

## Current source facts

The current Super Mario 64 adapter in `/Users/ekrof/fed/cssGraphics` emits 1,213 retained face leaves and an 820-frame loop.

The common leaf style is:

```css
[data-shape] > :is(s, u, i) {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 1;
  background-color: transparent;
  background-image: url("./assets/texels.webp");
  background-repeat: no-repeat;
  backface-visibility: visible;
  transform-style: preserve-3d;
}
```

The actual current Mario player/audit creates `u` leaves. Their triangular silhouette is expressed as two shaped top corners:

```css
[data-shape] > u {
  border-top-left-radius: 50% 100%;
  border-top-right-radius: 50% 100%;
  corner-top-left-shape: bevel;
  corner-top-right-shape: bevel;
}
```

There is also an adjacent/general `i` rule:

```css
[data-shape] > i {
  border-shape: polygon(50% 0, 100% 100%, 0 100%) circle(0);
  background-clip: border-area;
}
```

That `border-shape` rule should not be described as the current Mario rendering route unless the created leaf tag changes. It is nevertheless a useful second geometry target because it expresses the triangle directly.

Source anchors:

- package CSS: `/Users/ekrof/fed/cssGraphics/src/adapters/super-mario-64/package.mjs`;
- player leaf creation: `/Users/ekrof/fed/cssGraphics/src/adapters/super-mario-64/player/scene.ts`;
- audit leaf creation: `/Users/ekrof/fed/cssGraphics/src/adapters/super-mario-64/audit/scene.ts`;
- prepared playback contract: `/Users/ekrof/fed/cssGraphics/src/adapters/super-mario-64/stages/playbackPacket.mjs`;
- prepared lighting contract: `/Users/ekrof/fed/cssGraphics/src/adapters/super-mario-64/stages/lighting.mjs`.

## What Cornerfill changes

For a fallback engine, one face becomes:

```text
prepared face dimensions + fixed bevel geometry
prepared atlas image + crop/size/position state
                         |
                         v
                local transparent surface
                         |
                         v
               original retained <u> leaf
                         |
                         v
        existing CSS matrix3d / visibility / opacity
```

The leaf remains in the same DOM position and keeps the same transform. Cornerfill suppresses the leaf's original rectangular `background-image`, draws the selected atlas region into the local surface, and subtracts the two outside top-corner regions. Because the two bevel lines meet at the top center, the retained pixels form the same triangle.

Canvas is a backing store for a CSS image here, not a replacement scene renderer. It never receives world coordinates, a camera, a depth sort, mesh topology, or a frame-wide draw list. The scene remains retained DOM/CSS; the browser composites each original face.

## Exact first painter

The Mario route needs only a deliberately small paint grammar:

- one already-decoded `texels.webp` image;
- `background-repeat: no-repeat`;
- prepared `background-size`;
- prepared `background-position`;
- transparent background color;
- zero border;
- fixed top-left and top-right `bevel` with `50% 100%` radii;
- the face's canonical untransformed width and height;
- the existing image-sampling choice.

This avoids pretending that the first slice needs a complete parser for CSS gradients, repeating images, border styles, or arbitrary descendants.

Pseudo-paint sequence:

```js
function paintMarioFace(ctx, face, atlas) {
  ctx.clearRect(0, 0, face.width, face.height);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(face.width / 2, 0);
  ctx.lineTo(face.width, face.height);
  ctx.lineTo(0, face.height);
  ctx.closePath();
  ctx.clip();
  drawPreparedAtlasBackground(ctx, atlas, face.background);
  ctx.restore();
}
```

The production painter should obtain the triangle from the same normalized corner resolver as every other caller, even if this closed-form path is retained as a unit oracle and fast path.

## Prepared-state integration

Do not discover 1,213 faces and reparse their computed CSS on every source frame. The Mario runtime already knows exactly which leaves change.

Attach once:

```ts
const handle = cornerfill.attachPrepared(leaf, {
  mode: "paint",
  geometry: preparedBevelTriangle,
  size: preparedCanonicalSize,
  paint: preparedOpaqueAtlasPaint,
  visibility: preparedInitialVisibility,
});
```

Update only prepared state:

```ts
cornerfill.updatePreparedBatch(changedFaces.map((face) => ({
  element: face.leaf,
  backgroundPosition: face.nextPreparedCrop,
  visible: face.nextVisibility,
})));
```

The generic stylesheet-capture path is still needed for public use, but it does not sit in this hot loop. The direct API is not a Mario-specific renderer; it is a normalized input seam for any prepared retained-DOM system. The current local evidence adapter brackets the original runtime's source tick and submits at most one batch. It does not patch `CSSStyleDeclaration`, install a Cornerfill observer, or schedule a follow-up microtask.

The opaque atlas fast path retains the contour alpha already painted into each live surface. A real crop change updates a changed visible face with one `drawImage()` under preconfigured `source-in` compositing. That draw is irreducible under the no-mask, no-`clip-path`, live-image constraints; browser repaints and transform-only source changes do not call Cornerfill at all.

## Workload evidence

The checked prepared artifact `build/generated/lean-mario-runtime-oracle-20260729/lighting-atlases.json` records:

| Field | Value |
| --- | ---: |
| retained faces | 1,213 |
| retained lighting states | 150,985 |
| source frames | 820 |
| changed lighting faces, mean | 187.23 |
| changed lighting faces, p50 | 131 |
| changed lighting faces, p95 | 498 |
| changed lighting faces, maximum | 927 |

The exact values belong to that prepared artifact and should be refreshed if preparation changes. Their architectural meaning is stable: a normal frame changes a subset, and Cornerfill must preserve that sparsity. Repainting all 1,213 leaves because one root variable or stylesheet rule changed would erase the preparation work.

The current runtime also has prepared visibility decisions. Cornerfill should intersect changed faces with visible faces before enqueueing surfaces. A face that changes while hidden needs only the latest logical crop retained; it can repaint once when it becomes visible again.

## Transform rule

Face transforms and atlas crops are independent invalidation domains.

- A `matrix3d()` change: no surface repaint.
- Parent/model transform: no surface repaint.
- Opacity, visibility, or backface behavior: no surface repaint, although visibility can suppress future pixel work.
- Canonical face size or DPR change: resize and repaint.
- Atlas crop/lighting field change: repaint that visible face.
- Fixed bevel geometry: resolve once per canonical size.

This distinction is mandatory. Treating every style mutation as a paint mutation would make the fallback look correct while destroying the reason the retained/prepared architecture is fast.

## Memory model

A simple implementation allocates one small surface per active face:

```text
backing bytes ~= sum(width * height * DPR^2 * 4)
```

Use the canonical local face dimensions, never the transformed screen-space bounding box. Track the total backing pixels, not merely the number of canvas objects. The implementation may later share immutable surfaces for faces with identical size, geometry, and crop, but it must not merge faces that can diverge on the next lighting frame.

The atlas image must decode once per document/runtime and be shared by every face painter. A per-face decoded copy would be an implementation bug.

WebKit's document-global CSS-canvas names need a bounded allocation policy. Firefox registrations have an explicit `mozSetImageElement(id, null)` teardown. Both need repeated attach/play/dispose tests before a full scene is considered leak-safe.

## Bring-up sequence

### Slice 1 — one real face

- Use the real `texels.webp` and one real prepared crop.
- Paint on the real retained `u` element in WebKit and Firefox fallbacks.
- Compare against current native Chromium at the same frame and transform.
- Change the crop and transform independently; prove the expected repaint counts.

### Slice 2 — a representative cluster

- Select faces spanning the actual canonical size distribution and atlas locations.
- Include front-facing, back-facing, hidden, and rapidly changing leaves.
- Run enough frames to exercise sequential and nonsequential frame changes.

### Slice 3 — the full retained head

- Connect direct dirty-face updates and prepared visibility.
- Run the entire 820-frame loop at its 30 Hz source cadence on a 60 Hz display.
- Capture native/fallback frame pairs at fixed source frames.
- Record CPU, missed frames, surface pixels, heap, and teardown.
- Qualify one target engine at a time; do not launch concurrent full-browser stress runs.

## Success criteria

- The fallback triangle matches the native reference within an agreed edge-raster tolerance.
- The selected 4 by 4 texel field and its interpolation match the current face paint.
- The original leaf owns its CSS transform throughout.
- Transform-only frames produce zero Cornerfill commits.
- Lighting repaint count never exceeds the changed-and-visible prepared set.
- Hidden faces coalesce to their latest state and repaint once on return.
- One atlas decode is shared across the scene.
- A complete loop does not grow surface registrations or retained canvas objects.
- Disabling Cornerfill leaves modern Chromium's native path and output untouched.

## What this case does not prove

Mario proves the most valuable paint-owned use case. It does not prove descendant overflow clipping, shaped pointer hit testing, replaced-content clipping, full CSS background grammar, arbitrary borders, or shadows. Those remain separate capability lanes and must not delay this first useful slice.
