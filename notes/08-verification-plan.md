# Verification plan

Status: qualification framework plus current evidence ledger. The broad corpus
below describes possible general-release coverage; it is not a mandatory gate
for every narrow follow-on item. Tests must follow admitted shipped behavior and
must not turn permanent backend exclusions into implementation work.

Cornerfill is finished only when the pixels, update behavior, and lifecycle are demonstrated in the target browsers. A parser test or a successful canvas draw is necessary evidence, but neither is visual parity.

The executable first implementation of this plan lives in [the oracle harness](../oracle/README.md).

## Evidence levels

Keep these levels separate in reports:

| Level | Question answered | Required artifact |
| --- | --- | --- |
| Geometry unit | Did the resolver produce the intended mathematical contour? | deterministic points/path commands and assertions |
| Raster unit | Did the painter fill, subtract, and layer the right regions? | small golden PNGs from the backend-neutral painter |
| Native differential | Does Cornerfill resemble a qualified native implementation? | native image, fallback image, absolute diff, source/browser identity |
| Browser integration | Did the live CSS image paint and update on the original transformed element? | screenshots plus observed backend/state |
| Semantic capability | Does the selected route provide the behavior the caller requested? | focused hit, overflow, border, and shadow probes |
| Performance/lifecycle | Can the target workload run without whole-scene repaint or leaks? | trace/counters, frame statistics, allocation and teardown results |

Do not collapse these into a single `supported: true` result.

The current `controller.capabilities.implementedPaintPaths` booleans report only
that a code path accepts/implements a grammar subset. Input boundaries live in
`paintInputConstraints`; neither object means native-differential `PASS`.
Qualification remains the separate oracle state, and documentation plus
`handle.explain()` must not cite an implementation boolean as parity evidence.

## Reference identity

Every native differential record must include:

- browser product, version, engine revision when available, OS, and device-pixel ratio;
- whether the property was default-on, enabled by a flag/preference, or injected by test metadata;
- exact HTML/CSS input and viewport;
- exact native and fallback images;
- the diff algorithm, channel space, tolerance, and count/location of rejected pixels;
- the Cornerfill revision and backend;
- hashes of any raster source images.

If the native feature is missing, pref-gated unexpectedly, or has known incomplete behavior for the case under test, label that capture `INVALID ORACLE` for the affected claim. Firefox's initial fill implementation must not be used as the border or shadow oracle while those follow-up bugs remain unresolved.

## Browser matrix

| Target | Native-oracle role | Fallback role | Qualification needed |
| --- | --- | --- | --- |
| Current Chrome | Primary shipped `corner-shape` oracle | Forced production static data-URL candidate for differential capture | exact version and screenshots |
| Older Chromium | No assumed native property | No current live package backend; opt-in static data URL only | no Paint Worklet claim until that backend exists |
| Safari Stable | No assumed native feature | `-webkit-canvas()` | real Safari run, not only Playwright WebKit |
| Safari Technology Preview | Candidate native/preview oracle and fallback host | native or `-webkit-canvas()` according to the probe | feature settings and build number |
| Firefox Stable | No assumed complete native feature | `-moz-element()` | real released Firefox run |
| Firefox Nightly | Candidate partial-native oracle | `-moz-element()` or native by requirement gate | preference state and open-feature exclusions |
| Playwright WebKit/Firefox | Fast integration regression | both live-image bridges | label as engine-build evidence only |

Version tables document expectations; runtime selection must still probe capabilities.

## Geometry corpus

Derive fixtures from the CSS Borders 4 contract and the WPT directory. At minimum cover:

### Value resolution

- each keyword: `round`, `squircle`, `square`, `bevel`, `scoop`, and `notch`;
- representative `superellipse(s)` values on both sides of zero;
- zero, tiny, very large, and infinite parameter behavior;
- 1, 2, 3, and 4 corner-shape shorthand values;
- physical and logical longhands in horizontal and vertical writing modes;
- pixel and percentage radii, including slash syntax;
- zero radius, where the shape must have no visible corner region;
- computed interpolation between every adjacent keyword pair.

### Box geometry

- square and non-square boxes;
- symmetric and asymmetric elliptical radii;
- radii that require the ordinary overlap reduction factor;
- two diagonally opposed concave corners whose hulls overlap;
- mixed convex, bevel, and concave corners;
- widths and heights below one CSS pixel after scaling;
- fractional sizes, fractional radii, zoom, and several DPR values.

### Border geometry

- no border;
- uniform solid border;
- unequal side widths;
- a border wider than either resolved radius;
- mixed corner shapes around one border ring;
- inner contours at padding-box and content-box insets;
- later phases: per-side colors and every enabled border style.

The interpolation fixtures must encode the practical half-corner mapping described in [01 — Spec contract](01-spec-contract.md), not the internally inconsistent equation currently printed in the editor's draft. Keep the local algebraic regression named independently. Track [CSSWG issue 14157](https://github.com/w3c/csswg-drafts/issues/14157) separately for signed-versus-convex half-corner and concave hull-direction changes.

## Painter corpus

Qualify paint features individually rather than using one broad “background supported” flag:

- transparent and opaque background colors;
- one static same-origin or CORS-enabled raster URL with `no-repeat`;
- `cover`, `contain`, explicit lengths/percentages, and percentage positions;
- atlas crops with nearest-neighbor and smoothed sampling;
- multiple layers with independent origin/clip;
- one explicitly opaque raster using `multiply` over one opaque RGB/hex color;
- the current linear/radial/conic Canvas-gradient path as experimental evidence,
  not qualified CSS color interpolation;
- `border-box`, `padding-box`, and `content-box`; `border-area` remains rejected by the current runtime;
- solid border rings;
- the existing contained inset ring and contained solid outline as separate
  unqualified capabilities; outer shadows and external outlines are permanent
  carrier exclusions.

General `image-set()` selection is not in this corpus because candidate choice
is UA-specific. Do not add DPR/type-selection cases unless a separately labelled
non-general Cornerfill policy is authorized.

Include overlapping carve-outs. The expected result for the raster-boolean algorithm is union subtraction: pixels removed by one corner must stay removed after another corner is processed. This specifically catches an incorrect even/odd implementation.

## Native differential method

Use a current shipped Chromium build as the first full-paint oracle because its implementation is already shipped and includes more of the required pipeline than the partial preview implementations.

For each case:

1. Render the native declaration on a transparent, fixed-size capture surface.
2. Render the same resolved input through Cornerfill with native `corner-shape` disabled or isolated in a second document.
3. Capture after fonts/images and two stable animation frames have completed.
4. Compare premultiplied alpha separately from RGB. Transparent RGB must not count as visible error.
5. Emit the native image, fallback image, heatmap, numerical summary, and worst-pixel coordinates.
6. Inspect every changed acceptance threshold visually before adopting it.

When an automation backend cannot emit transparent screenshots, capture the painted result over both black and white and reconstruct alpha from the two composites. Preserve both inputs and record reconstruction diagnostics; never replace painted-browser evidence with the painter's source canvas.

Recommended reporting metrics:

- exact pixel count and percentage;
- alpha error percentiles and maximum;
- visible RGB error percentiles and maximum;
- a one-pixel boundary-band score, because anti-aliasing differences should not hide interior fill errors;
- connected regions of error, to distinguish a shifted contour from isolated raster noise.

Do not choose a universal tolerance before seeing the first corpus. The accepted
boundary error may vary by backend rasterizer. Only solid, unfiltered opaque
interiors should normally be exact. Gradients, resampled images, blending, blur,
dithering, transformed edges, and color-managed output require behavior-specific
tolerances after native A/A calibration.

## Live-backend tests

Every implemented backend must pass the same observable contract:

1. Allocate at a known CSS size and DPR.
2. Attach its CSS image to the original element.
3. Paint a pattern with transparent corners.
4. Mutate the pixels without changing the CSS image token.
5. Resize and verify that context state is reinitialized correctly.
6. Animate only `transform`; confirm zero painter commits.
7. Animate one registered paint input; confirm one coalesced commit per sampled frame.
8. Hide, detach, reattach, and dispose the element.
9. Confirm that disposed Firefox registrations, hidden canvases, observers, and strong references are gone.

Backend-specific checks:

- WebKit: document-global name collision, incremental repaint, DPR scaling, retained-surface behavior after element removal, and real Safari qualification.
- Firefox: detached-canvas invalidation, `mozSetImageElement(id, null)` cleanup, ID collision, and `-moz-element()` sizing.
- Future Paint Worklet backend: add its own checks only if that backend is implemented; it is not a current gate.
- Static data URL: CORS-tainted export failure and an explicit assertion that this backend is disabled for live animation by default. There is no object-URL revocation gate.

## Semantic exclusion tests

Tests should demonstrate the limits, not conceal them:

- Put a bright child in a concave corner with `overflow: hidden`; the fallback is expected not to match native clipping.
- Probe `elementsFromPoint()` in a removed bevel corner; the fallback host is expected to retain its rectangular hit region.
- Place an `<img>` as replaced content; the fallback must report it unsupported unless Cornerfill owns and repaints that image.
- Confirm that external box-shadow/outline outsets are refused; exercise only the
  already implemented contained inset-ring and paint-owned-leaf contained-outline fixtures.

These are passing tests when the runtime refuses an unsupported semantic
requirement or reports the limitation accurately. Existing focused refusals are
sufficient; do not add one new oracle image for every permanent exclusion.

## Animation and invalidation tests

Test all invalidation sources independently:

- resize, including fractional ResizeObserver sizes;
- class, style, and relevant attribute changes;
- stylesheet insertion/removal where declarations are discoverable;
- transitions and CSS animations of radii, color, and background position;
- shape animation only through a declaration carrier/direct path that actually
  preserves intermediate values; the default auto companion skips `@keyframes`;
- Web Animations API changes;
- image decode/load completion;
- DPR and zoom change;
- prepared direct-API update;
- transform, opacity, visibility, and ancestor-transform changes that must not repaint the surface;
- offscreen/hidden culling and the first repaint on return.

For animation, record the computed signature and commit count for each frame. The archived CSS Paint polyfill's event-only invalidation pattern is not acceptable: `animationstart` and `transitionstart` do not expose intermediate computed values.

## PolyCSS performance gate

The real case is 1,213 retained Mario polygon leaves over 820 source frames. A currently inspected prepared lighting artifact records 150,985 retained lighting states and changed-only writes with mean `187.23`, p50 `131`, p95 `498`, and maximum `927` faces per source-frame transition. Those are evidence about expected dirtiness, not a promise that Canvas repaint is cheap.

Measure at 30 Hz source playback and 60 Hz display presentation:

- CPU time in style capture, geometry, image draw, and backend commit;
- number of candidate, dirty, visible, and repainted faces;
- long tasks and missed presentation frames;
- total live surface pixels and estimated RGBA backing bytes;
- JS heap before attachment, after a full 820-frame loop, and after disposal;
- paint/composite behavior under the existing `matrix3d()` workload.

Initial acceptance gates:

- transform-only playback causes zero Cornerfill repaints;
- no full scan or repaint of all 1,213 faces on a normal lighting update;
- repaint count is bounded by the prepared dirty-and-visible set;
- all work for one display frame is coalesced into one scheduler flush;
- no monotonically growing surface IDs, canvases, observers, image handles, or decoded atlas copies over repeated loops;
- fallback off produces the existing native-Chromium result unchanged;
- visual evidence passes before a frame-rate number is advertised.

Do not run the full browser/performance matrix as an ordinary unit-test side effect. Keep deterministic geometry/raster tests cheap, and run qualified browser suites deliberately so local automation cannot monopolize the machine.

## Optional general-release framework

These gates describe a possible broad release campaign. A narrow Burnlist uses
only the gates touched by its changed behavior: normally one focused qualified
Chrome differential, existing source/runtime coverage, and one final
representative cross-engine live-backend capture. Do not require a fresh corpus
for unrelated permanent exclusions or unimplemented backends.

### Gate A — geometry library

- All value and contour units pass.
- Spec-defect regression cases are named and linked.
- No browser is required.

### Gate B — one painted box

- Color, one URL image, bevel, round, and one general superellipse match native screenshots.
- WebKit and Firefox live surfaces repaint under a compound 3D transform.
- Teardown passes.

### Gate C — paint-owned API

- Current companion-style declaration capture and direct API work for their
  documented inputs. A build transform is not a current gate.
- Capability reporting refuses overflow and hit-test semantics.
- Active CSS animations sample intermediate frames when their values survive
  through the documented carrier/direct path.

### Gate D — PolyCSS slice

- A real `texels.webp` crop paints on actual retained face elements.
- Dirty-only invalidation and visibility culling are connected.
- A representative multi-face scene passes visual and performance budgets.

### Gate E — general release

- Safari Stable and Firefox Stable are qualified directly.
- Documentation states the semantic ceiling prominently.
- Source licenses and notices are complete.
- Every capability advertised as qualified—not merely implemented—has reviewed
  differential evidence. Experimental/unqualified paths remain labelled as such.

## Existing evidence

The preserved [live-surface probe](evidence/live-paint-surface-probe.html) passed
one dynamic repaint in Playwright's WebKit and Firefox engine builds under
`rotateX(31deg) rotateY(47deg) rotateZ(13deg)`. See the
[evidence record](evidence/README.md). That artifact remains transport evidence,
not released-Safari or pixel-parity qualification.

The executable oracle now uses the production parser, painter, surfaces,
scheduler, prepared path, and teardown. Native Chrome A/A calibration is exact;
native-to-candidate comparisons remain `UNQUALIFIED` because no tolerance is
approved. Current focused evidence includes:

- `gradient-layers`: 39.4639% changed pixels, demonstrating that the Canvas
  gradient path is not qualified CSS-default color parity;
- `raster-repeat-origin`: 4.8750% changed pixels, so the advertised raster
  repeat/origin geometry is implemented but native-versus-Canvas resampling
  remains unqualified; its interior alpha error is zero;
- `background-blend-multiply`: exact zero changed pixels for one opaque raster
  over one opaque color, retained as `UNQUALIFIED` because no candidate tolerance
  has been approved;
- contained inset-shadow and outline fixtures, with external outsets explicitly
  unsupported.

The [complete Firefox Mario stress run](evidence/firefox-mario-stress.md)
executes 1,213 retained leaves over all 820 source ticks in eight fresh sessions,
with identical workload streams, measured Cornerfill paints, and teardown
records. It proves workload integration/lifecycle equivalence only. It does not
approve native visual tolerance, and its roughly 22 source FPS / 67 ms display
p95 is not a 30/60 performance claim.
