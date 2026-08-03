# Cornerfill 📐

Experimental paint-only CSS `corner-shape` fallback using WebKit and Gecko live-image backends. Import Cornerfill once, write normal CSS, and keep browsers that pass its native-selection proxy native.

| Chrome (native) | WebKit (Cornerfill) | Firefox (Cornerfill) |
| --- | --- | --- |
| ![Animated native Chrome triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-native-chrome.gif) | ![Animated Cornerfill WebKit triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-webkit.gif) | ![Animated Cornerfill Firefox triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-firefox.gif) |

These are real Playwright engine captures of the same `matrix3d()` animation. WebKit and Firefox stayed at one Cornerfill paint across all 24 frames. They demonstrate the three rendering paths, not certified pixel parity or direct Safari Stable/Firefox Stable qualification.

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

That's it. Cornerfill discovers the CSS automatically; there is no build transform or second import. If the browser passes Cornerfill's syntax, computed-value, and shaped-hit-test proxy, it renders the CSS itself and the fallback is never loaded. That proxy does not independently certify every native paint feature.

## How It Works

Fallback browsers can discard unsupported `corner-shape` declarations before computed style exposes them. Cornerfill recovers accessible authored CSS, lets the browser resolve its cascade, and paints the resulting host background and supported border into a transparent Canvas surface.

WebKit displays that surface with `-webkit-canvas()`. Firefox registers it with `mozSetImageElement()` and displays it with `-moz-element()`. The image stays on the original element, so layout, opacity, stacking, and transforms such as `matrix3d(...)` remain browser-owned. Transform-only animation does not repaint the surface.

Cornerfill does not use `clip-path`, CSS masks, SVG or font stencils, or baked-alpha assets.

## Implemented Subset

Every fallback paint path below is experimental. Native-versus-candidate pixel parity remains `UNQUALIFIED`.

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, finite `superellipse()` corners, physical and logical properties, and browser-computed `border-radius` values.
- Solid colors and static same-origin or CORS-enabled raster backgrounds with supported sizing, positioning, repetition, origin, and clip.
- Non-repeating gradients with supported geometry. Canvas does not reproduce default CSS gradient color interpolation, so gradient color parity is explicitly unqualified.
- One-color solid borders with unequal widths, one inset shadow, and one contained solid outline.
- Inline, embedded, and readable linked CSS, including imports, variables, media queries, layers, observable focus/hover/open/fullscreen selectors, and registered open shadow roots.
- Resize plus discovered source, class, attribute, inline-style, and observable selector-state changes update automatically.

Unsupported syntax is reported or left native rather than approximated.

## Limits

- Cornerfill shapes host paint. It does not provide descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, `backdrop-filter` clipping, or automatic pseudo-element targets.
- Outer shadows and outlines, `border-image`, per-side border colors, non-solid borders, animated CSS images, repeating gradients, and general background blending are not implemented. Conflicting `!important` paint declarations are rejected.
- Cross-origin raster images without CORS are unsupported even when native CSS could display them.
- CSS animations and transitions of shape or paint inputs do not reproduce native timing.
- Closed shadow roots and unreadable cross-origin CSS fail automatic ownership closed by default. Unobservable selector states such as programmatic `:checked`, `:target`, and `:visited` are refused instead of becoming stale.
- Direct mutation of existing CSSOM declarations, selectors, grouping rules, or media lists requires exact authored source through `replaceStylesheetSource()`; generic `refresh()` cannot reconstruct source the browser no longer exposes.
- The explicit `cornerfill/runtime` observer covers host class, inline style, content, and size. Call `handle.refresh()` or `controller.refresh()` after other cascade inputs change.

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
