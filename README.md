# Cornerfill

A `corner-shape` polyfill for Safari and Firefox. Cornerfill draws the element's shaped background and border onto a transparent canvas and displays it on the original DOM element. Chrome uses the native CSS property. Because Cornerfill never replaces or transforms the element, `matrix3d(...)` animation remains browser-composited.

Cornerfill is built for retained DOM renderers such as [PolyCSS](https://github.com/LayoutitStudio/polycss), but its runtime and geometry are standalone.

## Use

```sh
npm install cornerfill
```

Import Cornerfill once, then write ordinary CSS:

```js
import "cornerfill";
```

```css
.triangle {
  width: 120px;
  height: 100px;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  corner-shape: bevel bevel round round;
  background: #f05a47;
}
```

Chrome uses its native implementation. Cornerfill finds the same declaration in readable authored stylesheets and attaches the Safari or Firefox fallback automatically.

Retained renderers can skip stylesheet discovery and use the explicit runtime API:

```js
import { installCornerfill } from "cornerfill/runtime";

const cornerfill = installCornerfill();
const triangle = cornerfill.attach(document.querySelector(".triangle"));

await triangle.ready;

// Geometry or paint changes repaint the retained live image.
await triangle.update({ cornerShape: "squircle" });

triangle.dispose();
cornerfill.destroy();
```

## How It Works

The default import reads author CSS once and creates a small companion stylesheet containing only the shape values Safari and Firefox would otherwise discard. The browser still resolves selectors, conditions, and the cascade.

Cornerfill parses `border-radius` and `corner-shape`, resolves the CSS radius constraints, builds the contour, and paints the element-owned pixels into a transparent Canvas surface. Safari receives that surface through `-webkit-canvas()`. Firefox receives it through `-moz-element()` and `mozSetImageElement()`.

The original element keeps its transform, opacity, filter, stacking state, and pseudo-elements. Transform-only animation and ordinary browser repaints perform no Cornerfill work. Resize or a relevant paint/style change rebuilds only the state that changed, while decoded images, geometry, and prepared atlas programs are cached.

There is no `clip-path`, CSS mask, SVG or font stencil, or baked-alpha asset workaround.

## Browser Paths

| Browser | Rendering path |
|---|---|
| Qualified Chrome | Native CSS `corner-shape` |
| Safari / WebKit | Transparent live image via `-webkit-canvas()` |
| Firefox | Transparent live image via `-moz-element()` |

## Supported

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, and finite `superellipse()` corners.
- Physical and logical radius/shape declarations, elliptical percentages, `calc()`, overlap reduction, and opposite-concave constraints.
- Solid colors, raster and atlas crops, and supported linear, radial, and conic gradient layers with background sizing, positioning, repetition, origin, and clip.
- Solid borders with unequal widths, one contained inset shadow, and one fully contained solid outline.
- Generic observed elements and a lower-overhead caller-clocked prepared path for retained renderers.

## Limits

Fallback mode owns the host background, supported border paint, and supported contained effects. It cannot provide descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, shaped `backdrop-filter` clipping, outer shadows, outlines outside the border box, per-side border colors, or non-solid border styles.

Cornerfill refuses cases whose semantics it cannot preserve instead of silently rendering a false result. Inspect `controller.capabilities` and `handle.explain()` for the exact active path and limitations.

Automatic discovery cannot read a cross-origin stylesheet without CORS, imported rules reached through `@import`, constructed/adopted stylesheets, closed shadow roots, or styles blocked by a strict CSP. Those cases can use the explicit runtime API or prepared state.

## Development

```sh
npm test
npm run oracle:smoke
npm run oracle:cross
```

The executable oracle exercises the production parser, geometry, painter, and live-image backends in Chrome, WebKit, and Firefox. Native Chrome A/A calibration must remain exact; native-to-polyfill comparisons remain `UNQUALIFIED` until reviewed evidence justifies tolerances.

See the [executable oracle contract](oracle/README.md) and [polyfill bible](notes/README.md) for the full evidence and conformance boundary.

## License

Cornerfill is [MIT licensed](LICENSE).
