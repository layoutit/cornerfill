# Cornerfill polyfill bible

Status: hardened research and design synthesis, 2026-08-02. It is not blanket
implementation or parity authority. Current specifications define semantics,
the root [`README.md`](../README.md) and [`src/`](../src/) define shipped behavior,
and the executable [oracle contract](../oracle/README.md) defines qualification.
This bible records the reasoning, limits, implemented subset, and explicitly
labelled future work behind those contracts.

Cornerfill is the no-`clip-path`, no-CSS-mask paint polyfill for CSS
`corner-shape`. `border-shape` is specification context and possible separately
authorized research, not an implied follow-on phase. The target is not a baked
Mario asset trick: it is a reusable painter that computes shape from CSS values
and places a live transparent CSS image on the original element.

## Verdict

The central route is feasible:

1. Resolve `border-radius`, `corner-shape`, the element's paint inputs, and its untransformed border-box size.
2. Build the CSS Borders 4 contour in JavaScript.
3. Paint the background and border through that contour into a transparent canvas-backed image.
4. Expose the canvas as the element's live CSS image:
   - `-webkit-canvas(name)` on WebKit;
   - `-moz-element(#name)` on Firefox;
   - an opt-in static data URL only when a live bridge is unavailable.
5. Leave `transform`, including `matrix3d()`, on the original element. The browser compositor rotates the finished image with the element.

A native `paint()` backend remains an unimplemented future option. It is not a
current Cornerfill package path or release gate.

That route was proven locally with a dynamically repainted transparent triangle under compound 3D rotation in Playwright's WebKit and Firefox engine builds. It used no `clip-path`, CSS mask, font, SVG layer, extra clipping element, or baked sprite alpha. See [the evidence record](evidence/README.md).

There is one non-negotiable carrier boundary: the generated CSS image occupies
the host's border box and changes only pixels Cornerfill owns inside that box.
It cannot paint external shadow/outline outsets, install the browser's descendant
overflow clip or hit-test geometry, clip replaced content, represent multiple
box fragments, or supply shaped `backdrop-filter` clipping. Cornerfill is
therefore a strong fit for empty paint-owned leaves such as PolyCSS faces, but
it cannot honestly claim complete `corner-shape` semantics for arbitrary DOM.
Ordinary author `filter`, transforms, opacity, stacking, and pseudo-elements stay
on the original element and remain browser-owned.

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
| Native Paint (future, unimplemented) | No current package selection | `paint(cornerfill)` | Possible later Chromium/test path |
| WebKit live surface | `document.getCSSCanvasContext` exists | `-webkit-canvas(cornerfill-…)` | Safari/WebKit fallback |
| Gecko live surface | `-moz-element()` plus `mozSetImageElement` works | `-moz-element(#cornerfill-…)` | Firefox fallback |
| Static image | Explicitly enabled and no live bridge exists | Data URL | Last-resort, non-animation-grade mode only |

`CSS.supports('corner-shape: bevel')` is not a sufficient native gate. Firefox's first rendering landing is pref-gated and still has separate open border and shadow work. The gate must be tied to the semantics the caller needs.

## Scope in one sentence

Cornerfill should promise only explicitly implemented, oracle-labelled,
border-box-contained host paint and must refuse external outsets, descendant
overflow clipping, replaced-element clipping, multi-fragment boxes, shaped
`backdrop-filter`, and pointer hit testing.

## Reading order

| Note | Status | Purpose |
| --- | --- | --- |
| [00 — Verdict and scope](00-verdict-and-scope.md) | Current contract synthesis | Exact product promise, feasibility matrix, and hard boundary |
| [01 — Spec contract](01-spec-contract.md) | Current semantic synthesis | Normative geometry, property semantics, and recorded spec defects |
| [02 — Engine implementations](02-engine-implementations.md) | Point-in-time support snapshot | Chromium, WebKit, Firefox, support state, and source-level clues |
| [03 — Live CSS image breakthrough](03-live-css-image-backends.md) | Implemented WebKit/Gecko transport plus historical research | Why the live output rotates safely; future paths are labelled |
| [04 — Architecture](04-architecture.md) | Implemented flow plus superseded/future sketches | Current ownership and the status of earlier module/backend proposals |
| [05 — Geometry and painting](05-geometry-and-painting.md) | Implemented core plus qualified limits | Contours, raster boolean operations, borders, images, and contained effects |
| [06 — Capture and invalidation](06-capture-and-invalidation.md) | Implemented lifecycle plus labelled proposals | CSS capture, observers, animation sampling, caching, and teardown |
| [07 — Limits and rejected routes](07-limits-and-rejected-routes.md) | Current hard limits | Why the alternatives and out-of-box semantics do not fit this backend |
| [08 — Verification plan](08-verification-plan.md) | Qualification framework and evidence ledger | Current proof status and optional future release matrix |
| [09 — PolyCSS case study](09-polycss-case-study.md) | Implemented workload case | The Mario retained-face workload, completed runtime proof, and open visual qualification |
| [References](references.md) | Source index | Primary sources, pinned revisions, bugs, tests, and prior art |

Executable evidence is maintained separately in the [Cornerfill oracle harness](../oracle/README.md).

## Research rules

- Treat the [CSS Borders 4 editor's draft](https://drafts.csswg.org/css-borders-4/) as the semantic target, but do not transcribe it blindly. The local algebraic audit found that its printed forward half-corner interpolation expression is not the inverse of the following conversion. [CSSWG issue 14157](https://github.com/w3c/csswg-drafts/issues/14157) separately tracks the signed-versus-convex half-corner and concave hull-direction problem; it is not the authority for the distinct printed-expression defect.
- Treat native engine source as implementation evidence and a differential oracle, not as license-free code to paste.
- Keep `corner-shape` and `border-shape` separate. The former shapes the corner regions established by `border-radius`; the latter accepts arbitrary basic shapes and has stroke and fill modes.
- Distinguish engine proof from product proof. The local WebKit run is not a shipped-Safari certification.
- A visual fallback is not semantic equivalence unless overflow and hit testing are also demonstrated.

## The shortest implementation thesis

Study and, where attribution permits, narrowly adapt useful scheduling and
surface-selection ideas from the archived Apache-2.0
[GoogleChromeLabs CSS Paint polyfill](https://github.com/GoogleChromeLabs/css-paint-polyfill).
The shipped implementation instead uses an independently written contour and
paint pipeline over WebKit/Gecko live surfaces. It owns only admitted background,
border, and contained-effect subsets inside the border box. Transform-only
changes and author-filter changes remain browser/compositor work and must never
trigger Cornerfill repaint.
