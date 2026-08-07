# Cornerfill 📐

An experimental paint-only CSS `corner-shape` polyfill for Safari and Firefox. Cornerfill preserves native CSS, lets the browser resolve the cascade, and paints a transparent Canvas-backed image only where a qualified native implementation is unavailable.

| Chrome (native) | WebKit (Cornerfill) | Firefox (Cornerfill) |
| --- | --- | --- |
| ![Animated native Chrome triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-native-chrome.gif) | ![Animated Cornerfill WebKit triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-webkit.gif) | ![Animated Cornerfill Firefox triangle](https://raw.githubusercontent.com/layoutit/cornerfill/main/assets/cornerfill-firefox.gif) |

These are real Playwright engine captures of the same `matrix3d()` animation. WebKit and Firefox painted once and left the animation to the compositor. The captures demonstrate the three rendering routes; they are not a pixel-parity claim or direct certification of stable browser releases.

## Setup

Install Cornerfill and PostCSS:

```sh
npm install cornerfill postcss
```

Add Cornerfill after any `@import` expansion and CSS nesting transforms:

```js
// postcss.config.mjs
import cornerfill from "cornerfill/postcss";

export default {
  plugins: [cornerfill()],
};
```

Import the browser runtime once:

```js
import "cornerfill";
```

Then author standard CSS:

```css
.triangle {
  width: 120px;
  height: 100px;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  corner-shape: bevel bevel round round;
  background: #f05a47;
}
```

Every stylesheet that can set `corner-shape`, reset it with `all`, or affect paint on a Cornerfill target must pass through the plugin. This includes CSS for registered shadow roots and CSS generated at runtime before it is inserted. Raw inline shape declarations and other unprocessed CSS are intentionally not recovered by compiled mode; use a transformed rule or the explicit runtime.

## How it works

The PostCSS plugin keeps each native declaration and emits private custom-property carriers beside it, in the same selector, conditional context, layer, source order, and priority. It also emits compact candidate and invalidation metadata and rewrites only implemented `corner-shape` feature tests. A cross-file dependency graph follows only custom properties reached from shape or owned-paint values; unrelated design tokens do not become Cornerfill dependencies. Authors never write or depend on the generated declarations.

The browser resolves specificity, inheritance, variables, media queries, scopes, layers, CSS-wide values, and `!important`. Cornerfill reads the resolved carriers; it does not fetch or interpret stylesheet source in compiled mode.

Qualified Chrome remains fully native and does not load the painter. WebKit and Firefox generate the spec-derived contour, paint the admitted background and border into a transparent Canvas surface, and attach that surface to the original element through `-webkit-canvas()` or `-moz-element()`. Layout, stacking, opacity, filters, and transforms—including `matrix3d()`—stay on the original element. Transform-only animation does not repaint.

Cornerfill does not use `clip-path`, CSS masks, SVG or font stencils, extra clipping elements, or baked-alpha assets.

## Modes

| Mode | Entry | Contract |
| --- | --- | --- |
| Compiled, recommended | `cornerfill/postcss` + `cornerfill` | Browser-resolved cascade, bounded candidate discovery, no stylesheet source recovery |
| Automatic, experimental | `cornerfill/auto` | No-build best effort for uncontrolled CSS; may need source fetching and explicit handoff |
| Explicit runtime | `cornerfill/runtime` | Direct attachment and prepared state for generated applications |

Compiled mode observes transformed style/link insertion, removal and activation (including `CSSStyleSheet.disabled`); relevant class, id, inherited language/direction, observable state, media, and size changes; and registered open shadow roots. A root that fails closed keeps a minimal recovery observer and retries when its stylesheet inputs change. Call `refresh()` after changing an `adoptedStyleSheets` list or a paint-only CSSOM declaration because those operations do not emit a DOM mutation. A CSSOM replacement that changes shape declarations must contain plugin-transformed CSS; `refresh()` does not compile authored CSS in the browser.

When lifecycle control is needed:

```js
import cornerfill from "cornerfill";

if (cornerfill) {
  await cornerfill.ready;
  console.log(cornerfill.explain());

  const scope = cornerfill.registerRoot(openShadowRoot);
  await scope.ready;

  await cornerfill.refresh(); // after compiled CSSOM or adoptedStyleSheets changes
  cornerfill.destroy();       // when the application shell is removed
}
```

The default export is `null` outside a browser document. A registered shadow root must be open, use transformed CSS, and be explicitly registered. Registration may happen before connection; Cornerfill follows the host's shadow-including containing-root chain after connection or migration.

## Implemented paint subset

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, finite `superellipse()` corners, physical and logical shape properties, and browser-computed `border-radius` values.
- Solid colors; static same-origin or CORS-enabled raster backgrounds with the admitted sizing, positioning, repetition, origin, and clip grammar; and non-repeating linear, radial, and conic gradients.
- One-color solid borders with unequal widths, one zero-offset/zero-blur inset shadow, and one fully contained solid outline. The explicit runtime can additionally accept one caller-certified opaque raster using `multiply` over one opaque color.
- Variables across transformed CSS chunks, media queries, named layers, observable selector states, explicit-root `@scope` rules, and open shadow roots with the documented selector restrictions.

Unsupported syntax is rejected at build time or reported before paint ownership rather than approximated.

## Limits

- Cornerfill shapes host paint only. It cannot provide descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, shaped `backdrop-filter` clipping, automatic pseudo-element targets, or pixels outside the border box. A fallback host with computed overflow other than `visible` is refused.
- Outer shadows/outlines, `border-image`, per-side border colors, non-solid borders, animated CSS images, repeating gradients, and general background blending are unsupported. Compiled mode cannot infer that a CSS raster is fully opaque, so its `multiply` case requires explicit runtime state. A contained outline requires an empty paint-owned host.
- Canvas raster sampling and gradient color interpolation can differ from native CSS. Native-versus-candidate pixel tolerances remain deliberately `UNQUALIFIED`.
- Cross-origin raster images require CORS. Explicit colors using `attr()` are refused.
- Shape declarations and `all` resets in keyframes, dynamic `@container` activation, pseudo-element targets, namespace-qualified selectors, and selector states the runtime cannot observe are rejected by the compiler. Run Cornerfill after `@import` expansion and nesting transforms.
- Shape or paint animation is not native-timing parity. Value-driven `dir=auto` changes that do not mutate DOM text or attributes require explicit `refresh()`. Direct CSSOM shape edits are unprocessed CSS; replace them with transformed output or use the explicit runtime.
- Scoped rules require an explicit observable scope-start selector. Relative scoped selectors and `:scope` inside the scoped selector are rejected in `0.0.1`.
- Closed shadow roots cannot use compiled discovery. In a shadow root, host pseudos must lead their selector branch; `:host-context()` accepts one compound selector, and nested host pseudos or complex relative host chains are refused.
- Default compiled limits are 512 active candidate elements and 100,000 incrementally scanned elements per root, with bounded surface and decoded-image pixel budgets in the painter. Inactive conditional matches may be cached as potential candidates but do not consume the active limit. Exceeding a limit fails closed and remains recoverable when stylesheet inputs change.
- The experimental `cornerfill/auto` mode has additional source-access, CSP `connect-src`, CSSOM, import, layer, and selector boundaries. Use compiled mode when the CSS build is controlled.

## Development

```sh
npm test
npm run test:package
npm run test:browser:runtime
npm run oracle:cross
```

Browser tests run Chrome, WebKit, and Firefox one at a time. TypeScript `.mts` files are the source of truth. The [implementation bible](notes/README.md) records the design constraints; the [oracle contract](oracle/README.md) defines evidence and qualification.

## License

Cornerfill is [MIT licensed](LICENSE).
