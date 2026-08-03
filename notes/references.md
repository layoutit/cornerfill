# References

Snapshot date: 2026-08-01. Immutable source links are pinned where the host permits it. Release notes and bug trackers are live documents and must be rechecked before making a current-support claim.

Status: source index. A citation supports only the claim its linked text actually
makes; local algebraic findings and project/backend limits are labelled as such.

## Standards and specification history

- [CSS Borders and Box Decorations Level 4 — editor's draft](https://drafts.csswg.org/css-borders-4/): current `corner-shape`, `superellipse()`, `border-shape`, contour, interpolation, overflow, border, and shadow contract.
- [CSS Borders and Box Decorations Level 4 — W3C publication](https://www.w3.org/TR/css-borders-4/): dated published snapshot; use the editor's draft for the newest text and record which one a test targets.
- [CSS Painting API Level 1](https://drafts.css-houdini.org/css-paint-api-1/): defines `paint()`, worklet inputs, paint invalidation, the restricted 2D context, and output as a CSS `<image>`; its introduction leaves custom clipping to a possible future level.
- [CSS Properties and Values API Level 1](https://drafts.css-houdini.org/css-properties-values-api-1/): registration of typed custom properties, including `<image>` carriers for Paint input.
- [CSS Typed OM Level 1](https://drafts.css-houdini.org/css-typed-om-1/): typed computed values used by native worklets.
- [CSS Shapes Level 1](https://drafts.csswg.org/css-shapes-1/): underlying `<basic-shape>` concepts used by `border-shape`.
- [CSS Images Level 4](https://drafts.csswg.org/css-images-4/): gradient color interpolation, image fetching/invalid-image behavior, and UA-specific `image-set()` selection.
- [HTML Canvas 2D](https://html.spec.whatwg.org/multipage/canvas.html): Canvas gradient interpolation and `drawImage()` source behavior.
- [CSS Basic User Interface Level 4 — outlines](https://drafts.csswg.org/css-ui-4/#outline-props): outline paint position/order and its distinction from background paint.
- [Pinned CSSWG Borders 4 source](https://github.com/w3c/csswg-drafts/blob/13b14ec48af0219c893713d670cf80d8c014a648/css-borders-4/Overview.bs): source snapshot audited for this notebook.
- [CSSWG issue 11608 — interpolate across the corner diagonal](https://github.com/w3c/csswg-drafts/issues/11608): resolved discussion behind the current interpolation direction.
- [CSSWG issue 14157 — signed/convex half-corner and concave hull direction](https://github.com/w3c/csswg-drafts/issues/14157): open issue distinct from this bible's local finding that the printed forward interpolation expression is not the inverse of the following conversion.
- [CSSWG issue 14158 — corner paths and overlapping shape components](https://github.com/w3c/csswg-drafts/issues/14158): editorial clarification around pre-clip paths and boolean combination, not evidence that Cornerfill can carry external paint.

## Web-platform tests

WPT source snapshot: [`4a5810a124fa0523dd2494996bf1542d4b67f394`](https://github.com/web-platform-tests/wpt/tree/4a5810a124fa0523dd2494996bf1542d4b67f394).

- [Corner-shape test directory](https://github.com/web-platform-tests/wpt/tree/4a5810a124fa0523dd2494996bf1542d4b67f394/css/css-borders/corner-shape): fill, border, image/video, overflow, hit-test, shadow, writing-mode, extreme-value, and animation coverage.
- [Corner-shape hit-test test](https://github.com/web-platform-tests/wpt/blob/4a5810a124fa0523dd2494996bf1542d4b67f394/css/css-borders/corner-shape/corner-shape-hittest.html): evidence that native geometry participates beyond background pixels.
- [Paint 2D CSS image test](https://github.com/web-platform-tests/wpt/blob/4a5810a124fa0523dd2494996bf1542d4b67f394/css/css-paint-api/paint2d-image.https.html): exercises a style-map `CSSImageValue` as a `drawImage()` input.
- [Current WPT results dashboard for corner-shape](https://wpt.fyi/results/css/css-borders/corner-shape): useful for triage, but not a substitute for pinned browser evidence.

## Chromium/Blink

Pinned Chromium source snapshot: [`68daa42e384169237794b95b703647edd70c3b6b`](https://chromium.googlesource.com/chromium/src/+/68daa42e384169237794b95b703647edd70c3b6b/).

- [Chrome 139 release notes](https://developer.chrome.com/release-notes/139): shipped `corner-shape`, `superellipse()`, and `squircle`.
- [Chrome 147 release notes](https://developer.chrome.com/release-notes/147): shipped `border-shape`.
- [Chrome 150 release notes](https://developer.chrome.com/release-notes/150): shipped `background-clip: border-area`.
- [The corner cases of implementing CSS corner-shape in Blink](https://developer.chrome.com/blog/implementing-corner-shape): primary implementation account covering curve fitting, non-uniform borders, shadows, and clipping.
- [`ContouredRect` declaration](https://chromium.googlesource.com/chromium/src/+/68daa42e384169237794b95b703647edd70c3b6b/third_party/blink/renderer/platform/geometry/contoured_rect.h): corner curvature representation and geometry interface.
- [`ContouredRect` implementation](https://chromium.googlesource.com/chromium/src/+/68daa42e384169237794b95b703647edd70c3b6b/third_party/blink/renderer/platform/geometry/contoured_rect.cc): inversion, containment, intersection, and contour behavior.
- [`PathBuilder` implementation](https://chromium.googlesource.com/chromium/src/+/68daa42e384169237794b95b703647edd70c3b6b/third_party/blink/renderer/platform/geometry/path_builder.cc): line/conic/cubic generation and Skia path operations for contoured rectangles.

Chromium is the first differential oracle because the feature is shipped and participates in a broader native paint/geometry pipeline. Its source is implementation evidence, not the polyfill's specification.

## WebKit

Pinned WebKit source snapshot: [`3108e0a68c0ea7f887716cdb73cbd3f9109ddc78`](https://github.com/WebKit/WebKit/tree/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78).

- [Unified preferences — `CSSCornerShapeEnabled`](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml#L1175-L1187): preview category and default-off state in the audited revision.
- [Unified preferences — `CSSPaintingAPIEnabled`](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml#L1442-L1455): testable/experimental Paint API state.
- [`CornerShapeUtilities.h`](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/Source/WebCore/platform/graphics/CornerShapeUtilities.h): native contour API and types.
- [`CornerShapeUtilities.cpp`](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/Source/WebCore/platform/graphics/CornerShapeUtilities.cpp): explicit bevel/scoop/round cases, convex/concave conversion, general cubic construction, inset/outset logic, and the current opposite-corner TODO.
- [`BorderShape.cpp`](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/Source/WebCore/rendering/BorderShape.cpp): resolves style geometry into outer and inner paths.
- [`Document.idl`](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/Source/WebCore/dom/Document.idl#L91-L96): nonstandard `getCSSCanvasContext()` API.
- [Named canvas incremental repaint layout test](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/LayoutTests/fast/canvas/canvas-as-image-incremental-repaint.html): verifies that drawing updates a `-webkit-canvas()` CSS consumer.
- [Animated canvas-as-background manual test](https://github.com/WebKit/WebKit/blob/3108e0a68c0ea7f887716cdb73cbd3f9109ddc78/ManualTests/animated-canvas-as-background.html): additional live-image evidence.

## Gecko/Firefox

Pinned Firefox source snapshot: [`56ad29049a11ced909e25d7e1fabcc6155e1a516`](https://github.com/mozilla-firefox/firefox/tree/56ad29049a11ced909e25d7e1fabcc6155e1a516).

- [Bug 1726232 — `corner-shape` meta](https://bugzilla.mozilla.org/show_bug.cgi?id=1726232): current root tracker.
- [Bug 2035317 — initial corner-shape rendering](https://bugzilla.mozilla.org/show_bug.cgi?id=2035317): fixed initial rendering landing, explicitly separated from incomplete border/shadow follow-ups.
- [Bug 2047627 — border rendering](https://bugzilla.mozilla.org/show_bug.cgi?id=2047627): follow-up tracked as assigned at this snapshot.
- [Bug 2048908 — box shadows](https://bugzilla.mozilla.org/show_bug.cgi?id=2048908): open follow-up.
- [Bug 2058091 — inset/display-item behavior](https://bugzilla.mozilla.org/show_bug.cgi?id=2058091): open follow-up.
- [Bug 1982766 — `border-shape`](https://bugzilla.mozilla.org/show_bug.cgi?id=1982766): open implementation bug.
- [Bug 1302328 — CSS Painting API](https://bugzilla.mozilla.org/show_bug.cgi?id=1302328): open, unassigned meta bug.
- [Style longhand definitions](https://github.com/mozilla-firefox/firefox/blob/56ad29049a11ced909e25d7e1fabcc6155e1a516/servo/components/style/properties/longhands.toml#L3175-L3273): pref-gated corner-shape properties.
- [Default preference](https://github.com/mozilla-firefox/firefox/blob/56ad29049a11ced909e25d7e1fabcc6155e1a516/modules/libpref/init/StaticPrefList.yaml#L10922-L10927): `layout.css.corner-shape.enabled` state at the pinned revision.
- [WPT metadata](https://github.com/mozilla-firefox/firefox/blob/56ad29049a11ced909e25d7e1fabcc6155e1a516/testing/web-platform/meta/css/css-borders/corner-shape/__dir__.ini): forces the preference for the test directory.
- [Initial implementation commit](https://github.com/mozilla-firefox/firefox/commit/8880cba9faec): landing that transports corner parameters into WebRender.
- [`ellipse.glsl`](https://github.com/mozilla-firefox/firefox/blob/56ad29049a11ced909e25d7e1fabcc6155e1a516/gfx/wr/webrender/res/ellipse.glsl): signed-distance superellipse rendering.
- [`Document.webidl`](https://github.com/mozilla-firefox/firefox/blob/56ad29049a11ced909e25d7e1fabcc6155e1a516/dom/webidl/Document.webidl#L210-L241): documents `mozSetImageElement()` and unregistering with `null`.
- [Detached-canvas invalidation reftest](https://github.com/mozilla-firefox/firefox/blob/56ad29049a11ced909e25d7e1fabcc6155e1a516/layout/reftests/image-element/canvas-outside-document-invalidate-01.html): verifies live repaint through `-moz-element()`.

## Polyfills and geometry prior art

- [GoogleChromeLabs `css-paint-polyfill`](https://github.com/GoogleChromeLabs/css-paint-polyfill/tree/9dff83a8131fc7bb98490bfd2e05112c39842df8): archived Apache-2.0 project that discovered and implemented the same engine-specific live CSS image bridges.
- [`css-paint-polyfill` main source](https://github.com/GoogleChromeLabs/css-paint-polyfill/blob/9dff83a8131fc7bb98490bfd2e05112c39842df8/src/index.js): backend detection, canvases, observers, style interception, update queue, and static fallback to audit before adaptation.
- [`css-paint-polyfill` license](https://github.com/GoogleChromeLabs/css-paint-polyfill/blob/9dff83a8131fc7bb98490bfd2e05112c39842df8/LICENSE): Apache License 2.0.
- [Hyperellipse package README at pinned revision](https://github.com/mikhailmogilnikov/hyperellipse/blob/d530a4ec47f31c146b0af80a37c151d4f9f8cc5b/packages/hyperellipse/README.md#L107-L119): documents its `clip-path`/SVG fallback and uniform-solid fallback-border ceiling; dashed/dotted/per-side forms flatten.
- [Hyperellipse renderer at pinned revision](https://github.com/mikhailmogilnikov/hyperellipse/blob/d530a4ec47f31c146b0af80a37c151d4f9f8cc5b/packages/hyperellipse/src/internal/render.ts#L436-L548): applies `clip-path: path(...)` and constructs SVG/pseudo-element border layers.
- [jsnkuhn `corner-shape` at pinned revision](https://github.com/jsnkuhn/corner-shape/tree/39523ad8bdf3148d7341ec553419f004cb639ca6): earlier JavaScript geometry/polyfill prior art; useful for comparison, not a substitute for current spec and native differentials.

## Local project and evidence

- [Cornerfill evidence record](evidence/README.md): exact local live-surface probe, result scope, and screenshot paths.
- [Preserved live-surface probe](evidence/live-paint-surface-probe.html): self-contained WebKit/Firefox transport experiment.
- [Executable oracle contract](../oracle/README.md): production-adapter qualification states, exact native A/A requirement, and current contained-effect/external-outset boundary.
- [Complete Firefox Mario ABBA trace](../output/playwright/firefox-mario/hardening-full-abba-v2-2026-08-02/README.md): eight fresh 820-tick workload-equivalent lanes with timing, paint, and teardown evidence; not native visual parity.
- `src/adapters/super-mario-64/package.mjs` in the inspected `cssGraphics` checkout: current paint declarations and atlas source.
- `src/adapters/super-mario-64/player/scene.ts`: current retained `u` face creation.
- `src/adapters/super-mario-64/stages/playbackPacket.mjs`: 820-frame, 1,213-leaf prepared playback contract.
- `src/adapters/super-mario-64/stages/lighting.mjs`: changed-only prepared lighting state and runtime contract.
- `build/generated/lean-mario-runtime-oracle-20260729/lighting-atlases.json`: inspected workload snapshot used in the case study; generated evidence, not a permanent API.

## Source and license policy

The intended clean-room hierarchy is:

1. standards text for behavior;
2. WPT for the conformance surface;
3. native engines as differential oracles and algorithmic clues;
4. independently written geometry and painter code;
5. narrowly adapted Apache-2.0 live-surface scheduling/backend code only if its attribution and license are preserved.

Relevant upstream licenses differ: Chromium is BSD-style, the audited WebKit corner utility files carry an Apple two-clause BSD-style notice, Firefox is MPL-2.0, and the archived Google polyfill is Apache-2.0. Review notices before copying code; source links alone do not satisfy redistribution obligations.
