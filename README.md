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

## Browser Paths

| Browser | Path |
| --- | --- |
| Qualified native browser | Native CSS; fallback code is not loaded |
| Safari / WebKit | Canvas surface through `-webkit-canvas()` |
| Firefox | Canvas surface through `-moz-element()` |

Every path is capability-probed. Test the exact stable browser versions in your support matrix.

## Supported

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, finite `superellipse()` corners, physical and logical longhands, and browser-computed `border-radius` values.
- Solid colors, admitted raster and atlas backgrounds, non-repeating gradients, and supported background sizing, positioning, repetition, origin, and clip.
- One-color solid borders with unequal widths, one contained inset shadow, and one contained solid outline within the documented geometry limits.
- `<style>`, inline styles, readable linked stylesheets, recursive imports, variables, media rules, named layers, stateful selectors, and explicitly registered open shadow roots.
- Resize, relevant style changes, teardown, and a caller-clocked prepared path for retained renderers such as [PolyCSS](https://github.com/LayoutitStudio/polycss).

Unsupported syntax is reported or left native. Cornerfill does not approximate it.

## Advanced Use

The package root is the zero-configuration path. Use `cornerfill/auto` when you need scanner options:

```js
import { installCornerfillAuto } from "cornerfill/auto";

const cornerfill = installCornerfillAuto({
  stylesheetTimeoutMs: 5_000,
  nonce: document.currentScript?.nonce,
});

await cornerfill.ready;
```

Open shadow roots must be registered because discovery does not cross shadow boundaries:

```js
const scope = cornerfill.registerRoot(shadowRoot);
await scope.ready;
```

Constructed stylesheets also require their exact source through `refreshAdoptedStyleSheet(sheet, css)`. Cross-origin stylesheets and imports require CORS. A restrictive CSP must allow linked stylesheet recovery through `connect-src` and generated styles through the configured nonce.

Use `cornerfill/runtime` when your application already owns element state:

```js
import { installCornerfill } from "cornerfill/runtime";

const runtime = installCornerfill();
const triangle = runtime.attach(element, { cornerShape: "bevel bevel round round" });

await triangle.ready;
triangle.dispose();
runtime.destroy();
```

Retained renderers can use `attachPrepared()` and `updatePreparedBatch()` to reuse fixed geometry, decoded images, and atlas programs. Pure helpers are exported from `cornerfill/geometry`, `cornerfill/values`, and `cornerfill/spec`.

## Limits

- Cornerfill shapes host paint. It does not provide descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, shaped `backdrop-filter` clipping, or automatic pseudo-element targets.
- The fallback owns the host background, supported border, radii, shadow, and outline. Conflicting author `!important` declarations are rejected.
- Outer shadows, outside outlines, `border-image`, per-side border colors, non-solid borders, animated CSS images, repeating gradients, and general background blending are not implemented.
- Automatic CSS animations and transitions of shape or paint inputs do not reproduce native timing. Use the explicit update or interpolation API when that behavior matters.
- Closed shadow roots, unreadable cross-origin CSS, and unsupported CSSOM mutations cannot be discovered automatically.
- Allocation is bounded by active fallback entries and aggregate backing pixels. Unsupported or self-intersecting geometry is refused before surface mutation.

Candidate comparisons remain `UNQUALIFIED`; implemented support is not a native pixel-parity claim.

## Diagnostics and Contracts

`cornerfill.explain()`, element-handle `explain()`, and runtime `stats()` report the selected path, active capabilities, limitations, source errors, and resource counters.

The detailed implementation contract lives in the [polyfill bible](notes/README.md). The [executable oracle contract](oracle/README.md) defines capture and comparison rules.

## Development

```sh
npm run build
npm test
npm run test:package
npm run test:browser:runtime
npm run oracle:smoke
npm run oracle:cross
```

Browser and oracle scripts open Chrome, WebKit, and Firefox strictly one at a time. TypeScript `.mts` files are the source of truth; the build emits browser-ready `.mjs` files and declarations to `dist/`.

## License

Cornerfill is [MIT licensed](LICENSE).
