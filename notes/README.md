# Cornerfill polyfill bible

Status: authoritative research snapshot, 2026-08-01. The first production slice now lives in [`src/`](../src/) and is wired into the executable oracle; this bible remains its design and scope authority.

Cornerfill is the proposed no-`clip-path`, no-CSS-mask polyfill for CSS `corner-shape`, with a later `border-shape` phase. The target is not a baked Mario asset trick. It is a reusable painter that computes the shape from CSS values and puts a live, transparent CSS image on the original element.

## Verdict

The central route is feasible:

1. Resolve `border-radius`, `corner-shape`, the element's paint inputs, and its untransformed border-box size.
2. Build the CSS Borders 4 contour in JavaScript.
3. Paint the background and border through that contour into a transparent canvas-backed image.
4. Expose the canvas as the element's live CSS image:
   - native `paint()` where CSS Paint Worklets exist;
   - `-webkit-canvas(name)` on WebKit;
   - `-moz-element(#name)` on Firefox.
5. Leave `transform`, including `matrix3d()`, on the original element. The browser compositor rotates the finished image with the element.

That route was proven locally with a dynamically repainted transparent triangle under compound 3D rotation in Playwright's WebKit and Firefox engine builds. It used no `clip-path`, CSS mask, font, SVG layer, extra clipping element, or baked sprite alpha. See [the evidence record](evidence/README.md).

There is one non-negotiable boundary: a CSS image can change what an element paints, but it cannot install the browser's descendant overflow clip or hit-test geometry. CSS Paint API Level 1 explicitly produces an `<image>` and leaves custom clipping to a possible future level. Therefore Cornerfill can be paint-accurate for backgrounds, borders, and shadows, and it is a strong fit for empty painted leaves such as PolyCSS faces. It cannot honestly claim complete `corner-shape` semantics for arbitrary descendant DOM without another clipping primitive.

## What this is not

- Not Hyperellipse's `clip-path: path(...)` fallback.
- Not a font glyph used as a stencil.
- Not triangle alpha baked into an application sprite sheet.
- Not nested transformed boxes with `overflow`.
- Not an SVG or CSS-mask renderer hidden behind a polyfill API.
- Not a claim that Houdini Paint Worklets ship in Safari or Firefox. They do not; the live canvas bridges emulate the useful image-producing part.

## Compatibility layers

| Layer | Selection | Output | Intended engines |
| --- | --- | --- | --- |
| Native property | A requirement-aware native capability gate passes | Browser-native `corner-shape` or `border-shape` | Complete native implementations |
| Native Paint | `CSS.paintWorklet` and required image inputs work | `paint(cornerfill)` | Chromium versions without the property, test harnesses |
| WebKit live surface | `document.getCSSCanvasContext` exists | `-webkit-canvas(cornerfill-…)` | Safari/WebKit fallback |
| Gecko live surface | `-moz-element()` plus `mozSetImageElement` works | `-moz-element(#cornerfill-…)` | Firefox fallback |
| Static image | No live bridge exists | Data/blob URL | Last-resort, non-animation-grade mode only |

`CSS.supports('corner-shape: bevel')` is not a sufficient native gate. Firefox's first rendering landing is pref-gated and still has separate open border and shadow work. The gate must be tied to the semantics the caller needs.

## Scope in one sentence

Cornerfill should promise a spec-derived painted-box fallback and explicitly refuse to promise browser-owned overflow clipping, replaced-element clipping, or pointer hit testing.

## Reading order

| Note | Purpose |
| --- | --- |
| [00 — Verdict and scope](00-verdict-and-scope.md) | Exact product promise, feasibility matrix, and hard boundary |
| [01 — Spec contract](01-spec-contract.md) | Normative geometry, property semantics, and current spec defects |
| [02 — Engine implementations](02-engine-implementations.md) | Chromium, WebKit, Firefox, support state, and source-level clues |
| [03 — Live CSS image breakthrough](03-live-css-image-backends.md) | Why Houdini-style output works in Safari/Firefox and rotates safely |
| [04 — Architecture](04-architecture.md) | Modules, backend order, declaration transport, and paint ownership |
| [05 — Geometry and painting](05-geometry-and-painting.md) | Contours, raster boolean operations, borders, images, and shadows |
| [06 — Capture and invalidation](06-capture-and-invalidation.md) | CSS parsing, observers, animation sampling, caching, and teardown |
| [07 — Limits and rejected routes](07-limits-and-rejected-routes.md) | Why the earlier alternatives do not satisfy the actual request |
| [08 — Verification plan](08-verification-plan.md) | WPT-derived correctness, browser evidence, and performance gates |
| [09 — PolyCSS case study](09-polycss-case-study.md) | The exact Mario/retained-face workload and first useful slice |
| [References](references.md) | Primary sources, pinned revisions, bugs, tests, and prior art |

Executable evidence is maintained separately in the [Cornerfill oracle harness](../oracle/README.md).

## Research rules

- Treat the [CSS Borders 4 editor's draft](https://drafts.csswg.org/css-borders-4/) as the semantic target, but do not transcribe it blindly. Its current half-corner interpolation formula is internally inconsistent and is tracked in [CSSWG issue 14157](https://github.com/w3c/csswg-drafts/issues/14157).
- Treat native engine source as implementation evidence and a differential oracle, not as license-free code to paste.
- Keep `corner-shape` and `border-shape` separate. The former shapes the corner regions established by `border-radius`; the latter accepts arbitrary basic shapes and has stroke and fill modes.
- Distinguish engine proof from product proof. The local WebKit run is not a shipped-Safari certification.
- A visual fallback is not semantic equivalence unless overflow and hit testing are also demonstrated.

## The shortest implementation thesis

Fork the useful scheduling and surface-selection ideas from the archived Apache-2.0 [GoogleChromeLabs CSS Paint polyfill](https://github.com/GoogleChromeLabs/css-paint-polyfill), replace its incomplete CSS-value/image model, add a spec-derived contour engine, and make the painter own every background layer that must become transparent outside the contour. For general superellipse insets, use canvas compositing as the boolean path operation the draft leaves to implementations. Transform-only changes must never trigger repaint.
