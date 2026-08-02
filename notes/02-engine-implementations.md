# Engine implementations and current support

Snapshot date: 2026-08-01. Source links are pinned in [references](references.md); support status can move quickly.

Status: point-in-time native-engine evidence. This chapter does not describe
Cornerfill's implemented backend or qualified package capabilities.

## Status table

| Engine | `corner-shape` | `border-shape` | CSS Paint Worklet | Useful fallback bridge |
| --- | --- | --- | --- | --- |
| Chromium/Blink | Shipped in Chrome 139 | Shipped in Chrome 147 | Shipped | Native `paint()` |
| WebKit | Preview feature, defaults false in the pinned preference file | No equivalent implementation found in this audit | Testable/experimental, defaults false | `getCSSCanvasContext()` + `-webkit-canvas()` |
| Gecko/Firefox | Parser and initial rendering landed behind `layout.css.corner-shape.enabled`; incomplete follow-ups remain | Open implementation bug | Meta bug open and unassigned | `mozSetImageElement()` + `-moz-element()` |

The table deliberately avoids turning a parse result into a completeness claim. In particular, Firefox's meta bug is still open and has separate assigned/new dependencies for borders, shadows, and inset-related display items.

## Chromium/Blink

Chrome's official release notes state that `corner-shape` shipped in [Chrome 139](https://developer.chrome.com/release-notes/139) and `border-shape` shipped in [Chrome 147](https://developer.chrome.com/release-notes/147). `background-clip: border-area`, used by the current PolyCSS `border-shape` leaf style, arrived in [Chrome 150](https://developer.chrome.com/release-notes/150).

Blink's implementation is the best current native oracle because it is shipped and covers much more than a painted silhouette.

### Representation

`ContouredRect` extends a rounded rectangle with four corner curvatures. Blink stores the actual superellipse exponent `n = 2^s`, not the CSS parameter `s`. Its named constants are therefore:

- round: `2`;
- bevel: `1`;
- scoop: `0.5`;
- practical straight/square clamp: `1000`;
- notch: reciprocal of the straight clamp.

Concavity is represented by an exponent below one. Inverting a corner swaps its visual center/outer vertices and takes the reciprocal curvature, letting much of the curve math operate on the convex equivalent.

### Path generation

Blink emits exact line/conic cases where possible and uses two cubic Bézier halves for a general superellipse corner. Its `PathBuilder::AddContouredRect` uses Skia path operations for the difficult inset/constant-thickness intersections. The implementation article [The corner cases of implementing CSS corner-shape in Blink](https://developer.chrome.com/blog/implementing-corner-shape) documents the fitted cubic controls, non-uniform borders, shadows, and per-edge clipping challenges.

The fitted coefficient set is useful evidence, not a requirement for Cornerfill's first implementation. A spec-sampled adaptive path is easier to audit and license cleanly; matching cubics can be introduced after differential tests establish their error.

### Semantics beyond paint

For non-round curvature, `ContouredRect::IntersectsQuad()` tests against the generated path. That is a reminder that native support propagates into geometry/hit systems. Cornerfill's CSS-image fallback cannot acquire that behavior simply by matching the pixels.

## WebKit

WebKit now has a substantial explicit-path implementation, but the pinned `UnifiedWebPreferences.yaml` marks `CSSCornerShapeEnabled` as `preview` and sets its defaults to false for WebKitLegacy, WebKit, and WebCore.

`CSSPaintingAPIEnabled` is marked `testable`; it is true only under WebKit experimental builds in the pinned preferences and otherwise defaults false. Cornerfill therefore cannot rely on native `CSS.paintWorklet` for released Safari.

### Geometry source

`CornerShapeUtilities.cpp` works with the CSS parameter `s` directly and contains:

- analytic bevel, scoop, and round inset construction;
- notch and square special cases;
- convex/concave inversion;
- fitted cubic Béziers for general superellipses;
- trimming of inset cubic segments to the target rectangle;
- outset miter construction and special interpolation for parameters between scoop, bevel, and round;
- an exported `borderContourPath()` used by rendering code.

`BorderShape.cpp` resolves style radii and per-corner curvature, constructs outer and inner inputs, and connects the contour to border/background painting.

### Important incompleteness

At pinned WebKit revision `3108e0a68c0ea7f887716cdb73cbd3f9109ddc78`, the exported `oppositeCornerScaleFactor()` ends with:

```cpp
// TODO: implement opposite-corner scale factor computation.
return 1.0;
```

The editor's draft requires this constraint for diagonally opposing concave corners. Cornerfill must implement and test it rather than copying WebKit's current result.

### Legacy live CSS canvas

WebKit's `Document` still exposes `getCSSCanvasContext()`. A WebKit layout test obtains a named context, assigns it through `-webkit-canvas(name)`, and checks incremental repaint after drawing. This legacy feature is the Safari fallback bridge: it is independent of the disabled Paint Worklet feature.

## Gecko/Firefox

Firefox's implementation strategy is materially different from Blink/WebKit's explicit CPU-side contour paths.

### Current bugs

As of this snapshot:

- [Bug 1726232](https://bugzilla.mozilla.org/show_bug.cgi?id=1726232), the `corner-shape` meta bug, is `NEW` and still has open dependencies.
- [Bug 2035317](https://bugzilla.mozilla.org/show_bug.cgi?id=2035317), initial rendering support, is `RESOLVED FIXED` with target milestone `153 Branch`.
- [Bug 2047627](https://bugzilla.mozilla.org/show_bug.cgi?id=2047627), border rendering, is `ASSIGNED`.
- [Bug 2048908](https://bugzilla.mozilla.org/show_bug.cgi?id=2048908), box-shadow support, is `NEW`.
- [Bug 2058091](https://bugzilla.mozilla.org/show_bug.cgi?id=2058091), computed inset/display-item support, is `NEW`.
- [Bug 1982766](https://bugzilla.mozilla.org/show_bug.cgi?id=1982766), `border-shape`, is `NEW`.
- [Bug 1302328](https://bugzilla.mozilla.org/show_bug.cgi?id=1302328), the CSS Painting API meta bug, is `NEW` and unassigned.

The initial-rendering bug's comments explicitly say important border and shadow behavior was not yet proper and should be handled in follow-up bugs. Source longhand/shorthand definitions are gated by `layout.css.corner-shape.enabled`, and Firefox's WPT metadata forces that preference true for the suite. This audit does not infer a complete stable-release feature from the milestone alone.

### WebRender path

The initial rendering commit passes per-corner `s` values through display items into WebRender. `ellipse.glsl` implements a signed-distance approximation for `superellipse(s)`, including square/notch thresholds, bevel, convex `2^s`, and reflected concave behavior. That is efficient for GPU clipping and anti-aliasing, but it is not a reusable JavaScript algorithm.

Cornerfill should still use a deterministic Canvas `Path2D`/compositing geometry shared across fallback engines. Firefox's shader is a valuable visual oracle for its native path, not the architecture for the polyfill.

### Legacy live element image

Firefox's `Document.webidl` documents `mozSetImageElement(id, element)`, which gives the registered image element precedence for `-moz-element(#id)` and accepts `null` to unregister it. Gecko reftests verify that drawing into an out-of-document canvas invalidates and repaints the `-moz-element()` consumer. This is exactly the lifecycle Cornerfill needs.

## Source licensing

Use the standards algorithm as the primary design source and keep independently written geometry under Cornerfill's chosen license.

- Chromium source carries the Chromium project's BSD-style terms.
- WebKit's `CornerShapeUtilities` files carry Apple's two-clause BSD-style notice.
- Firefox source is MPL-2.0.
- GoogleChromeLabs `css-paint-polyfill` is Apache-2.0.

Do not paste engine constants or substantial control flow without recording the applicable attribution/redistribution obligations. The simplest clean first route is spec-derived adaptive sampling plus original Canvas composition. Native code remains a differential oracle.

## Capability detection policy

Detection must answer “does native support satisfy this caller's needs?”, not only “does the parser know the property?”

Possible future requirement bits, not the current public capability schema:

```ts
type NativeRequirements = {
  fill: boolean;
  border: boolean;
  shadow: boolean;
  overflowClip: boolean;
  hitTest: boolean;
  borderShape: boolean;
};
```

The runtime can combine:

1. `CSS.supports()` for syntax;
2. computed-value checks for the specific shorthand/longhand;
3. an offscreen `elementsFromPoint()` bevel probe for shaped hit testing, modeled after WPT;
4. a maintained engine/version qualification table for rendering features that JavaScript cannot inspect pixel-perfectly;
5. conservative fallback when a required native behavior is unknown.

For paint-owned PolyCSS leaves the requirement set is much smaller: accurate fill geometry and image paint. An incomplete native border/shadow implementation does not matter if those features are unused.

## Implementation lessons from the engines

- Normalize the CSS parameter/exponent representation at one module boundary; do not mix Blink's `n` with WebKit/Gecko's `s`.
- Reflect concave curves from their convex counterparts where possible.
- Do not model borders as a centered stroke.
- Treat each contour purpose separately.
- Constrain concave opposite corners before generating paths.
- Use special cases for keyword shapes and an approximation for the general curve.
- Keep geometry independent of the rendering backend so all live surfaces receive identical paths.
- Test against native screenshots and WPT, because the editor's draft and preview implementations both contain known gaps.
