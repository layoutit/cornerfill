# Cornerfill 📐

Experimental paint-only CSS `corner-shape` fallback using WebKit and Gecko live-image backends. Import Cornerfill once, write normal CSS, and leave the qualified Chrome path native.

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

Apps that need to gate initial paint, inspect the selected path, or tear down an app shell can retain the controller:

```js
import cornerfill from "cornerfill";

if (cornerfill) {
  await cornerfill.ready;
  console.log(cornerfill.explain());
  // cornerfill.destroy(); when the app shell is removed
}
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

That's it. Cornerfill discovers the CSS automatically; no build transform or custom carrier declarations are required. An engine stays native when it passes Cornerfill's syntax, computed-value, and shaped-hit-test proxy; fallback API availability does not affect that decision. Engines that fail the proxy use an available live-image fallback.

## How It Works

Fallback browsers can discard unsupported `corner-shape` declarations before computed style exposes them. Cornerfill recovers accessible authored CSS, lets the browser resolve its cascade, and paints the resulting host background and supported border into a transparent Canvas surface.

WebKit displays that surface with `-webkit-canvas()`. Firefox registers it with `mozSetImageElement()` and displays it with `-moz-element()`. The image stays on the original element, so layout, opacity, stacking, and transforms such as `matrix3d(...)` remain browser-owned. Transform-only animation does not repaint the surface.

Cornerfill does not use `clip-path`, CSS masks, SVG or font stencils, or baked-alpha assets.

## Implemented Subset

Every fallback paint path below is experimental. Native-versus-candidate pixel parity remains `UNQUALIFIED`.

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, finite `superellipse()` corners, physical and logical properties, and browser-computed `border-radius` values.
- Solid colors, including `currentColor` and system colors resolved in the host's color context, plus static same-origin or CORS-enabled raster backgrounds with supported sizing, positioning, repetition, origin, and clip. Native CSS image sampling and Canvas `drawImage()` can drift at raster edges, so raster pixel parity is explicitly unqualified.
- Non-repeating gradients with supported geometry. Canvas does not reproduce default CSS gradient color interpolation, so gradient color parity is explicitly unqualified.
- One-color solid borders with unequal widths, one inset shadow, and one contained solid outline.
- Inline, embedded, and readable linked CSS, including imports, variables, media queries, named layers, observable focus/hover/open/fullscreen selectors, and registered open shadow roots with `:host`, `:host()`, `:host-context()`, or ordinary descendant selectors.
- Resize plus discovered source, class, attribute, inline-style, and observable selector-state changes update automatically.

Unsupported syntax is reported or left native rather than approximated.

## Limits

- Cornerfill shapes host paint. It does not provide descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, `backdrop-filter` clipping, or automatic pseudo-element targets. A fallback host whose computed overflow is not `visible` is refused even while empty.
- Outer shadows and outlines, `border-image`, per-side border colors, non-solid borders, animated CSS images, repeating gradients, and general background blending are not implemented. Conflicting `!important` paint declarations are rejected.
- A contained painted outline requires an empty, paint-owned host. Any open shadow root counts as foreground content because later shadow-tree mutations cannot safely preserve that contract.
- Cross-origin raster images without CORS are unsupported even when native CSS could display them.
- Explicit colors that depend on `attr()` are rejected because detached color probes cannot preserve host-attribute evaluation.
- Default fallback budgets are 512 automatic entries (2,048 through the explicit runtime), `2048²` pixels per surface, and `4096²` pixels each for total live surfaces and decoded images per controller. Explicit runtime options can change these limits.
- Linked and imported CSS source is recovered through a separate `fetch()`, so CSP must permit it through `connect-src`. A blocked or unreadable source fails automatic ownership closed for its root; dynamically varying responses require exact source handoff.
- CSS animations and transitions of shape or paint inputs do not reproduce native timing.
- Direct `dir` changes are observed. Content-driven direction changes under `dir=auto` are not tracked across arbitrary descendant text and require an explicit refresh.
- Closed shadow roots, unreadable cross-origin CSS, and linked/imported CSS that is not UTF-8 fail automatic ownership closed by default. `cornerfill.explain().automatic.ownership` reports `blocked-root` when this happens. Unobservable selector states such as programmatic `:checked`, `:target`, and `:visited` are refused instead of becoming stale.
- Automatic ownership also fails closed for `@scope`, anonymous layer blocks/import layers, namespace bindings or qualified selectors, and other valid cascade contexts Cornerfill cannot preserve.
- In registered shadow roots, a host pseudo must lead its selector branch. Nested host pseudos and complex relative chains after `:host >` fail that root closed.
- `insertRule()` and `deleteRule()` are observed only on the top-level `CSSStyleSheet` owned by a readable `<style>` or `<link>` element. Imported child sheets and adopted stylesheets still require their documented explicit source handoff.
- Direct mutation of existing CSSOM declarations, selectors, grouping rules, or media lists requires exact authored source through `replaceStylesheetSource()`; generic `refresh()` cannot reconstruct source the browser no longer exposes.
- The explicit `cornerfill/runtime` observer covers host class, inline style, content, size, and readable stylesheet-source changes in observed containing trees. Call `handle.refresh()` or `controller.refresh()` after other cascade inputs change.

## Development

```sh
npm test
npm run test:package
npm run test:browser:runtime
npm run oracle:cross # all 17 portable cases, serially in three engines
```

Browser tests run Chrome, WebKit, and Firefox one at a time. TypeScript `.mts` files are the source of truth. See the [implementation contract](notes/README.md) and [oracle contract](oracle/README.md) for details.

## License

Cornerfill is [MIT licensed](LICENSE).
