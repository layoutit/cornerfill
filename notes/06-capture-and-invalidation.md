# CSS capture, invalidation, and lifecycle

## Audit of the archived Paint polyfill

The archived [GoogleChromeLabs CSS Paint polyfill](https://github.com/GoogleChromeLabs/css-paint-polyfill) proves the backend idea, but its runtime model is not sufficient for Cornerfill unchanged.

At pinned revision `9dff83a8131fc7bb98490bfd2e05112c39842df8`, it:

- searches image-valued properties with a broad property-name regex;
- rewrites `paint(name)` into a placeholder URL so unsupported parsers retain it;
- scans accessible stylesheets and refetches imports;
- records `Painter.inputProperties`;
- schedules element updates through `requestAnimationFrame`;
- observes border-box size with `ResizeObserver`;
- uses WebKit named canvas and Firefox element image when available;
- otherwise serializes Canvas to a URL;
- observes DOM/style mutations;
- patches `setAttribute`, `HTMLElement.style`, `cssText`, and `setProperty`;
- listens for animation/transition start/end/iteration and common interaction events.

Its property container mostly returns trimmed strings or a small `CSSUnitValue` approximation. It does not provide Cornerfill's required registered `<image>`/`CSSImageValue` model in fallback engines. It also alternates class instances on the main thread rather than reproducing worklet isolation.

## Why event-only animation invalidation is wrong

An `animationstart` or `transitionstart` event can enqueue one repaint, but computed values continue changing on every sampled frame without DOM mutations. The old polyfill listens to lifecycle events; it does not inherently poll all intermediate computed values.

Cornerfill needs an active-animation loop:

1. on transition/animation start, mark the affected entry active;
2. on every `requestAnimationFrame`, read only its observed computed signature;
3. repaint when the normalized geometry/paint signature changed;
4. remove it after end/cancel and one final sample;
5. pause work for hidden/culled entries while preserving final-state correctness.

For prepared renderers, direct invalidation is better: the renderer already knows when a lighting crop or geometry value changes and calls the handle without a computed-style read.

## Declaration survival

### Build-time transform: authoritative path

Insert Cornerfill carriers next to the source declarations. This survives unsupported parser behavior, preserves the cascade, and retains the stylesheet-relative URL base.

The transform must cover:

- `corner-shape` shorthand and physical/logical longhands;
- the combined `corner` shorthands if supported;
- `border-shape` in the later lane;
- background image/position/size/repeat/origin/clip when Cornerfill takes paint ownership;
- relevant border/shadow/outline inputs.

Store source URL metadata for each transformed image declaration or rewrite relative URLs to absolute URLs during the build.

### Runtime stylesheet scan: best effort

Same-origin `document.styleSheets` rules can identify selectors and custom carriers. Handle nested `@media`, `@supports`, `@layer`, `@container`, and `@scope` without flattening their conditions.

Limitations:

- inaccessible cross-origin sheets cannot be read;
- unsupported native declarations may already be absent from CSSOM;
- constructed/adopted stylesheets may have no owner node;
- stylesheet mutations are not all represented by DOM mutations.

Expose `controller.refresh(root?)` for author-controlled rescan and document the build transform as the reliable path.

### Direct API: performance path

PolyCSS should attach prepared entries explicitly and notify changed atlas fields directly. This removes selector queries and redundant style snapshots from the hot path.

## Invalidation graph

| Trigger | Geometry | Paint | Surface size | Action |
| --- | --- | --- | --- | --- |
| `corner-shape`/radius change | Yes | No | No | rebuild contour, repaint |
| border width change | Yes | Usually | Maybe | rebuild inner contour, repaint |
| background color/image/position/size change | No | Yes | No | repaint with cached geometry |
| box size change | Yes | Yes | Yes | resize surface, rebuild, repaint |
| DPR/zoom qualification change | Maybe | Yes | Yes | resize backing, repaint |
| transform change | No | No | No | do nothing |
| opacity/visibility change | No | No | No | normally do nothing |
| image decode completion | No | Yes | No | repaint dependents |
| stylesheet/class/style mutation | Maybe | Maybe | Maybe | recompute signature once |
| element removal | No | No | No | dispose |
| element reparent/document adoption | Maybe | Maybe | Maybe | rebind document backend and recompute |

## Observer design

Use narrowly scoped observers:

- one `ResizeObserver` for controlled elements;
- one `MutationObserver` per registered root for child-list and relevant attribute changes;
- explicit registration for open ShadowRoots;
- a stylesheet registry API for adopted/constructed sheets;
- document-level animation/transition event listeners that only touch known entries;
- `matchMedia`/viewport hooks only for conditions that affect captured rules;
- a DPR watcher that detects actual resolution changes.

Avoid recursively walking an entire changed subtree on every attribute mutation. Newly added subtrees can be scanned once against the registered selector set.

## Computed signature

Serialize normalized values, not the whole computed style declaration.

Example geometry signature:

```text
width,height,dpr;
tl(rx,ry,s),tr(...),br(...),bl(...);
border(top,right,bottom,left)
```

Example paint signature for the PolyCSS slice:

```text
image-cache-id;background-size-x,y;background-position-x,y;smoothing
```

Compare numbers after one normalization/rounding policy to prevent repaint from harmless serialization differences such as whitespace or `0px` versus `0`.

## Scheduling

Maintain dirty sets by reason:

```ts
geometryDirty: Set<Entry>
paintDirty: Set<Entry>
resizeDirty: Set<Entry>
disposePending: Set<Entry>
```

One scheduled animation-frame flush should:

1. process removals;
2. resolve size and geometry;
3. advance ready image decodes;
4. repaint visible dirty entries;
5. retain dirtiness for temporarily hidden entries only when their next visible frame would otherwise be stale;
6. update counters/diagnostics.

Do not schedule one promise/rAF per face.

## Image cache

Cache by absolute URL plus request semantics, not raw CSS token text.

```ts
interface ImageRecord {
  key: string;
  state: "loading" | "ready" | "error";
  promise: Promise<void>;
  image?: CanvasImageSource;
  dependents: Set<Entry>;
  refCount: number;
}
```

On ready/error, enqueue dependents once. Release decoded images when no entries reference them, subject to a bounded LRU. Preserve atlas images aggressively because thousands of leaves share them.

## Visibility and culling

DOM visibility and application visibility are different.

- A `display:none` entry has no useful size and should not allocate until measurable.
- `visibility:hidden`/opacity zero may still need a final state before becoming visible.
- IntersectionObserver is an optional UI optimization, not reliable for transformed 3D model culling.
- PolyCSS should pass its prepared visibility decision directly.

When a hidden entry becomes visible, repaint once from current state; do not replay missed frames.

## Shadow DOM

Support is not automatic merely because Firefox's `-moz-element()` can be consumed inside a shadow root.

Cornerfill needs:

- a document-scoped surface registry shared by roots;
- root-scoped generated override styles;
- explicit registration of open roots;
- adopted stylesheet tracking;
- clear behavior for closed roots: explicit element attachment only.

Surface IDs must remain unique across all roots in one document.

## Teardown

`destroy()` and element detach must:

- unobserve resize/mutations where no longer needed;
- stop animation sampling;
- remove the entry's generated override rule;
- restore any inline declarations Cornerfill changed;
- unregister Firefox image IDs with `mozSetImageElement(id, null)`;
- remove hidden fallback canvases;
- revoke blob URLs;
- release image cache references;
- clear strong element references.

The old Paint polyfill unobserves some removed elements, but Cornerfill needs a complete, testable lifecycle because thousands of retained surfaces can otherwise leak substantial decoded memory.

## Avoid broad prototype patching

Patching `CSSStyleDeclaration.prototype` and `Element.prototype` made sense for a universal 2018 Paint API shim, but it increases compatibility and maintenance risk.

Preferred order:

1. build transform plus observers;
2. direct controller API;
3. opt-in wrapper helpers for inline writes;
4. broad prototype interception only as a separately shipped compatibility mode.

Frameworks should not lose behavior because Cornerfill replaced their style accessors.

## Diagnostics and telemetry

Expose development-only counters:

- active/native/fallback entry counts;
- surfaces and total backing pixels;
- geometry rebuilds and paints per frame;
- paint time by backend;
- image cache bytes and misses;
- skipped hidden entries;
- unsupported CSS values;
- fallback reason for each element;
- live/static backend failures;
- current animation sampler size.

These counters are necessary to distinguish an inherently expensive paint workload from accidental whole-scene invalidation.
