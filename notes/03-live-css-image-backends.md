# Live CSS image backends

## The breakthrough

Houdini's useful property here is not “running code in a worklet.” It is producing a transparent CSS `<image>` whose pixels update when size or style inputs change.

Safari and Firefox do not need to ship Paint Worklets for Cornerfill to emulate that output. Both engines already have a vendor-specific way to bind a live canvas to a CSS image:

```text
WebKit:  CanvasRenderingContext2D -> -webkit-canvas(name)
Firefox: canvas element          -> -moz-element(#name)
```

Cornerfill paints the same geometry into either surface, then assigns that surface to the original element. CSS applies transforms after background painting, so the browser rotates the transparent result as one compositor input.

## Why rotation does not glitch

The painter never computes screen-space rotation and never makes a pre-rotated asset. It paints in the element's ordinary, untransformed border-box coordinate space.

```text
CSS box coordinates
  -> transparent shaped image
  -> element background
  -> element opacity/backface/visibility
  -> matrix3d and compositor
  -> screen
```

A shape/font workaround can be vulnerable to text rasterization and transform-specific engine bugs. A nested clipping construction can change the 3D subtree and flattening behavior. A live background image does neither: it stays on the existing face element.

Transform-only animation is therefore not an invalidation input. Repaint is required only when the box size, shape/radius, or owned paint source changes.

## Native CSS Paint backend

Where `CSS.paintWorklet` is available, the ideal API is ordinary Custom Paint:

```css
@property --cornerfill-image {
  syntax: "<image>";
  inherits: false;
  initial-value: linear-gradient(transparent, transparent);
}

.face {
  --cornerfill-image: url("texels.webp");
  background-image: paint(cornerfill);
}
```

CSS Properties and Values Level 1 allows a registered `<image>` custom property to reify as `CSSImageValue`. CSS Paint Level 1 extends `CanvasImageSource` with `CSSImageValue`, so the painter can pass it to `drawImage()`. The official WPT `paint2d-image.https.html` demonstrates the path by reading `border-image-source` and drawing it.

The earlier local research ran that WPT path in real Chrome 151 and saw the supplied image paint successfully. That proves native Custom Paint can crop a decoded atlas image inside its own transparent output; it is not restricted to procedural colors.

The native worklet context also includes Canvas compositing, paths, and image drawing. It excludes pixel readback and text APIs, neither of which Cornerfill needs.

## WebKit backend

Runtime probe:

```js
if (typeof document.getCSSCanvasContext === "function") {
  const name = "cornerfill-42";
  const ctx = document.getCSSCanvasContext("2d", name, pixelWidth, pixelHeight);
  element.style.backgroundImage = `-webkit-canvas(${name})`;
}
```

Properties:

- the CSS image is named, not tied to a DOM canvas element;
- drawing into the returned context invalidates consumers;
- changing size requires obtaining the correctly sized named context;
- names must be unique per active surface unless two consumers intentionally share identical pixels;
- capability detection is mandatory because the API is non-standard;
- `CSSPaintingAPIEnabled` being false does not disable this legacy hook.

The source proof is WebKit's `Document.getCSSCanvasContext` binding plus its incremental repaint layout test. Product qualification must still run in actual Safari Stable and Technology Preview, not only Playwright's WebKit build.

## Firefox backend

Preferred runtime path:

```js
const canvas = document.createElement("canvas");
canvas.width = pixelWidth;
canvas.height = pixelHeight;
const id = "cornerfill-42";

document.mozSetImageElement(id, canvas);
element.style.backgroundImage = `-moz-element(#${id})`;
```

Fallback if `mozSetImageElement` is unavailable but `-moz-element()` parses: give the hidden canvas that ID and append it to a Cornerfill-owned hidden root.

Properties:

- current Gecko source documents image-element IDs and their precedence;
- a reftest proves that repainting an out-of-document registered canvas invalidates the CSS consumer;
- teardown must call `document.mozSetImageElement(id, null)`;
- a hidden DOM canvas is still needed when the direct registration API is absent;
- IDs are document-scoped and must not collide across Cornerfill instances.

## Static data/blob backend

The archived CSS Paint polyfill converts the canvas to a data URL when neither live bridge is available. Cornerfill may retain that as a compatibility escape hatch, but it is not suitable for animated PolyCSS:

- serialization and image decode can occur on every update;
- the CSS declaration changes every update;
- object URLs need revocation;
- data size and garbage pressure are high;
- delivery can miss the intended frame.

Static mode should be opt-in or limited to immutable decoration.

## Local proof record

The minimal probe is preserved as [live-paint-surface-probe.html](evidence/live-paint-surface-probe.html). It creates one 240×160 element with:

```css
transform: rotateX(31deg) rotateY(47deg) rotateZ(13deg);
```

It paints a transparent triangle, exposes the canvas through the engine's live image hook, and repaints the gradient from orange/red to cyan/blue without replacing the CSS image or transform.

Recorded results:

| Run | Initial state | Repaint state | Result |
| --- | --- | --- | --- |
| Playwright `webkit` engine build | `backend=webkit-canvas`, `phase=0` | `phase=1` after `repaint(1)` | transparent rotated triangle updated in place |
| Playwright `firefox` engine build | `backend=moz-element`, `phase=0` | `phase=1` after `repaint(1)` | transparent rotated triangle updated in place |

Evidence images remain in the source workspace and are linked from [evidence/README.md](evidence/README.md). The exact claim is engine-build proof of the live-surface mechanism. It is not yet Safari release certification or a full 1,213-face performance result.

## Adapting the archived CSS Paint polyfill

The Apache-2.0 [GoogleChromeLabs CSS Paint polyfill](https://github.com/GoogleChromeLabs/css-paint-polyfill) already contains the key backend selection:

- detects `getCSSCanvasContext`;
- detects `-moz-element()`;
- creates one context/canvas per element and painter;
- applies `-webkit-canvas(...)` or `-moz-element(...)`;
- uses `ResizeObserver` and a queued update pass;
- falls back to `toDataURL()` elsewhere.

That is the right archaeological base, not production code to import unchanged. It is archived, executes painter code on the main thread, monkey-patches broad DOM/CSS prototypes, and has only a minimal scalar Typed OM emulation. Cornerfill needs a narrower runtime and a real image-input/cache path.

## Image transport

Native Paint and fallback canvases need different adapters around one logical input:

```ts
type PaintImage =
  | { kind: "css-image"; value: CSSImageValue }
  | { kind: "decoded"; value: CanvasImageSource; sourceUrl: string };
```

- Native Paint reads a registered `<image>` custom property as `CSSImageValue`.
- Main-thread fallbacks parse the serialized custom property, resolve the URL against the declaration's source URL, load/decode once, and draw the resulting image.
- The painter receives normalized source/destination rectangles, not backend-specific image-loading state.

For multiple images and gradients, the logical paint graph should use explicit layer nodes rather than handing raw CSS strings to geometry code.

## Security and correctness constraints

- Respect CORS and canvas taint rules. Do not assume a CSS-loaded cross-origin image can be exported by the static backend.
- Resolve relative URLs against the stylesheet that authored them, not automatically against the document.
- Do not expose pixel-read APIs; they are unnecessary.
- Decode before switching the live surface into use to avoid a blank frame.
- Include device pixel ratio in backing dimensions, but keep painter coordinates in CSS pixels.
- Reinitialize context state after a resize because canvas resizing resets it.
- Disable or configure image smoothing according to the source's intended sampling; PolyCSS texel fields require an explicit choice.
- Bound surface dimensions and total decoded memory.

## Lifecycle contract

Every backend must implement the same small interface:

```ts
interface LiveSurface {
  readonly cssImage: string;
  readonly context: CanvasRenderingContext2D;
  resize(cssWidth: number, cssHeight: number, dpr: number): boolean;
  commit(): void;
  dispose(): void;
}
```

`commit()` is a no-op for automatically live contexts but remains in the interface for static/blob surfaces. `dispose()` unregisters Firefox image IDs, removes hidden canvases, clears references, and revokes any object URL.
