# Cornerfill

A live CSS `corner-shape` polyfill for Safari and Firefox. Cornerfill paints the spec-derived contour, backgrounds, and borders into a transparent CSS image attached to the original element. Qualified Chrome releases keep using native `corner-shape`, while transforms such as `matrix3d(...)` stay on the real DOM element in every browser.

Cornerfill is built for retained DOM renderers such as [PolyCSS](https://github.com/LayoutitStudio/polycss), but its runtime and geometry are standalone.

## Use

Browsers may discard unsupported declarations before JavaScript can read them. Keep the native properties and add durable Cornerfill carriers:

```css
.triangle {
  width: 120px;
  height: 100px;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  corner-shape: bevel bevel round round;
  --cornerfill-border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  --cornerfill-corner-shape: bevel bevel round round;
  background: #f05a47;
}
```

Attach Cornerfill to the element and dispose it when the element leaves the page:

```js
import { installCornerfill } from "cornerfill";

const cornerfill = installCornerfill();
const triangle = cornerfill.attach(document.querySelector(".triangle"));

await triangle.ready;

// Geometry or paint changes repaint the retained live image.
await triangle.update({ cornerShape: "squircle" });

triangle.dispose();
cornerfill.destroy();
```

Cornerfill is not published to a package registry yet. Consume it from source or pin a Git commit.

## How It Works

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
