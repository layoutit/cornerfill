# Cornerfill

CSS `corner-shape` for Safari and Firefox. Import Cornerfill once, write normal CSS, and keep native browsers native.

| Chrome (native) | WebKit (Cornerfill) | Firefox (Cornerfill) |
| --- | --- | --- |
| ![Native Chrome triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-native-chrome.png) | ![Cornerfill WebKit triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-webkit.png) | ![Cornerfill Firefox triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-firefox.png) |

These are real browser captures of the same triangle, not illustrations. They demonstrate the three rendering paths, not certified pixel parity.

## Installation

```sh
npm install cornerfill
```

## Usage

Import Cornerfill once at your application entry:

```js
import "cornerfill";
```

Then write ordinary CSS:

```css
.triangle {
  width: 120px;
  height: 100px;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  corner-shape: bevel bevel round round;
  background: #f05a47;
}
```

That's it. Cornerfill discovers the CSS automatically; there is no build transform or second import. If the browser passes Cornerfill's native behavior checks, it renders the CSS itself and the fallback is never loaded.

## How It Works

Fallback browsers can discard unsupported `corner-shape` declarations before computed style exposes them. Cornerfill recovers accessible authored CSS, lets the browser resolve its cascade, and paints the resulting host background and supported border into a transparent Canvas surface.

WebKit displays that surface with `-webkit-canvas()`. Firefox registers it with `mozSetImageElement()` and displays it with `-moz-element()`. The image stays on the original element, so layout, opacity, stacking, and transforms such as `matrix3d(...)` remain browser-owned. Transform-only animation does not repaint the surface.

Cornerfill does not use `clip-path`, CSS masks, SVG or font stencils, or baked-alpha assets.

## Supported

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, finite `superellipse()` corners, physical and logical properties, and browser-computed `border-radius` values.
- Solid colors, raster backgrounds, and non-repeating gradients with supported sizing, positioning, repetition, origin, and clip.
- One-color solid borders with unequal widths, one inset shadow, and one contained solid outline.
- Inline, embedded, and readable linked CSS, including imports, variables, media queries, layers, stateful selectors, and registered open shadow roots.
- Resize and relevant style changes update automatically.

Unsupported syntax is reported or left native rather than approximated.

## Limits

- Cornerfill shapes host paint. It does not provide descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, `backdrop-filter` clipping, or automatic pseudo-element targets.
- Outer shadows and outlines, `border-image`, per-side border colors, non-solid borders, animated CSS images, repeating gradients, and general background blending are not implemented. Conflicting `!important` paint declarations are rejected.
- CSS animations and transitions of shape or paint inputs do not reproduce native timing.
- Closed shadow roots, unreadable cross-origin CSS, and direct mutation of existing CSSOM rules cannot be discovered automatically.

## Development

```sh
npm test
npm run test:package
npm run test:browser:runtime
npm run oracle:cross
```

Browser tests run Chrome, WebKit, and Firefox one at a time. TypeScript `.mts` files are the source of truth. See the [implementation contract](notes/README.md) and [oracle contract](oracle/README.md) for details.

## License

Cornerfill is [MIT licensed](LICENSE).
