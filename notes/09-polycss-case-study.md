# PolyCSS Mario case study

Status: implemented workload integration with completed Firefox ABBA lifecycle
and timing evidence. Native-to-candidate visual parity remains `UNQUALIFIED`.

This is the first high-value consumer for Cornerfill. It is also an unusually clean fit for the honest paint-only boundary: Mario is a retained DOM scene made from empty polygon leaves whose visible content is an atlas image. The browser still owns every face's layout and 3D transform; Cornerfill needs to own only the leaf's local pixels.

## Current source facts

The inspected Super Mario 64 adapter in a sibling `cssGraphics` checkout emits 1,213 retained face leaves and an 820-frame loop.

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

That `border-shape` rule is not the current Mario rendering route and is not part
of the `corner-shape` follow-on. It may inform separately authorized future
research, but Cornerfill has no current parser/runtime/oracle support for it.

Source anchors:

- package CSS: `src/adapters/super-mario-64/package.mjs` in the inspected `cssGraphics` checkout;
- player leaf creation: `src/adapters/super-mario-64/player/scene.ts`;
- audit leaf creation: `src/adapters/super-mario-64/audit/scene.ts`;
- prepared playback contract: `src/adapters/super-mario-64/stages/playbackPacket.mjs`;
- prepared lighting contract: `src/adapters/super-mario-64/stages/lighting.mjs`.

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
  geometry: preparedBevelTriangle,
  size: preparedCanonicalSize,
  paint: preparedOpaqueAtlasPaint,
  paintActive: preparedInitialVisibility,
});
```

Update only prepared state:

```ts
cornerfill.updatePreparedBatch(changedFaces.map((face) => ({
  element: face.leaf,
  backgroundPosition: face.nextPreparedCrop,
  paintActive: face.nextVisibility,
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

The current runtime connects prepared visibility and changed-face decisions. A
face that changes while hidden retains only its latest logical crop and repaints
once when it becomes visible again.

The completed [Firefox Mario stress trace](evidence/firefox-mario-stress.md)
runs eight fresh OFF/ON lanes across all 820 source ticks with one identical
ordered workload stream. Each ON lane records 132,424 Cornerfill paints and zero
style checks. This proves the prepared dirty-only integration and retained
lifecycle under that fixture; it is not native visual parity.

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

WebKit's document-global CSS-canvas names use a bounded pool and still need
released-Safari qualification. Firefox registrations use explicit
`mozSetImageElement(id, null)` teardown; the complete ABBA trace records fresh
sessions and post-dispose resources without growth for the tested workload.

## Completed and open criteria

- Completed: real `texels.webp` crops paint through the production prepared path.
- Completed: the original leaf owns its CSS transform; transform-only changes
  produce zero Cornerfill commits.
- Completed: lighting work follows the prepared changed/visible stream, shares
  the atlas decode, and tears down registrations in the tested Firefox workload.
- Completed: eight 820-tick OFF/ON lanes have identical workload identity.
- Open: native-to-candidate triangle/texel pixels need an approved edge and
  sampling tolerance; current oracle results remain `UNQUALIFIED`.
- Open: released Safari qualification and its long-lived named-canvas behavior.
- Not achieved/claimed: 30 Hz source playback on 60 Hz presentation. The current
  trace is roughly 25 source FPS with about 50 ms display p95.

## What this case does not prove

Mario proves the most valuable paint-owned workload and lifecycle use case. It
does not prove native visual parity, descendant overflow clipping, shaped pointer
hit testing, replaced-content clipping, multi-fragment boxes, shaped
`backdrop-filter`, full CSS background grammar, arbitrary borders, external
effects, or general `border-shape`. Permanent carrier exclusions are not future
Mario gates.
