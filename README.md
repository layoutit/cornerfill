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

Every stylesheet that can set `corner-shape`, reset it with `all`, or affect paint on a Cornerfill target must pass through the plugin. Run Cornerfill after imports, nesting, CSS Modules/scoping, custom selectors/media, property renaming, and every other transform that changes selectors or dependency structure; only serialization-safe minification may follow it. This includes CSS for registered shadow roots and CSS generated at runtime before it is inserted. Raw inline shape declarations and other unprocessed CSS are intentionally not recovered by compiled mode; use a transformed rule or the explicit runtime.

## How it works

The PostCSS plugin keeps each native declaration and emits private custom-property carriers beside it, in the same selector, conditional context, layer, source order, and priority. It also emits compact candidate and invalidation metadata. Shape-sensitive `@supports` queries are rejected because a CSS feature query cannot represent whether the runtime loaded and remains healthy. A cross-file dependency graph follows only custom properties reached from shape or owned-paint values; unrelated design tokens do not become Cornerfill dependencies. Authors never write or depend on the generated declarations.

The browser resolves specificity, inheritance, variables, media queries, scopes, layers, CSS-wide values, and `!important`. Cornerfill reads the resolved carriers; it does not fetch or interpret stylesheet source in compiled mode.

Qualified Chrome remains fully native and does not load the painter. WebKit and Firefox generate the spec-derived contour, paint the admitted background and border into a transparent Canvas surface, and attach that surface to the original element through `-webkit-canvas()` or `-moz-element()`. Layout, stacking, opacity, filters, and transforms—including `matrix3d()`—stay on the original element. Transform-only animation does not repaint.

Cornerfill does not use `clip-path`, CSS masks, SVG or font stencils, extra clipping elements, or baked-alpha assets.

## Modes

| Mode | Entry | Contract |
| --- | --- | --- |
| Compiled, recommended | `cornerfill/postcss` + `cornerfill` | Browser-resolved cascade, bounded candidate discovery, no stylesheet source recovery |
| Compiled, configurable | `cornerfill/postcss` + `cornerfill/compiled` | The same runtime with explicit nonce, limits, observation, diagnostics, and lifecycle control |
| Automatic, experimental | `cornerfill/auto` | No-build best effort for uncontrolled CSS; may need source fetching and explicit handoff |
| Explicit runtime | `cornerfill/runtime` | Direct attachment and prepared state for generated applications |

Explicit-runtime handle mutations return promises. Await or catch them: disposal before a pending mutation commits rejects with the exported `CornerfillDetachedError`.

Compiled mode automatically handles initial transformed CSS and common component mutations: transformed style/link lifecycle (including owner media and `CSSStyleSheet.disabled`); relevant attributes and inline paint; inherited paint, language and direction across registered roots; observable selector state; media, viewport and size changes; subtree insertion/removal; and open shadow roots registered with the controller. Non-measurable targets stay local and pending instead of blocking their root. A root that fails closed retains the media and selector-state signals needed to retry after the failed condition becomes inactive.

Automatic synchronization ends where browsers expose no dependable mutation or lifecycle signal. Call `refresh()` after changing an `adoptedStyleSheets` list, a paint-only CSSOM declaration, `CSSStyleSheet.media.mediaText`, or another application-driven computed-style dependency that does not change observed DOM state. Refresh can reread values only when selector and custom-property dependency metadata remain unchanged. Dependency-changing CSSOM edits require complete plugin-transformed stylesheet replacement or the explicit runtime; missing graph edges cannot be reconstructed in the browser. Controller-wide refresh attempts every registered scope and rejects with an aggregate if any scope fails.

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

For a nonce-only CSP or explicit configuration, import the configurable compiled entry instead of the side-effect root:

```js
import { installCornerfillCompiled } from "cornerfill/compiled";

const cornerfill = installCornerfillCompiled({ nonce: window.cspNonce });
await cornerfill.ready;
```

Setting either `observe: false` or `autoObserve: false` disables both compiled discovery observation and the underlying painter observation; manual `refresh()` then owns synchronization.

Register every open shadow root in a nested containing-root chain. That registration graph carries inherited standard paint and custom-property dependencies, conditional invalidation, connection changes, and fail-close influence across shadow boundaries. Relevant inline standard-property and custom-property `var()` edges are indexed during the bounded candidate traversal; while at least one exists, the scope conservatively subscribes to all transformed custom-property metadata in its registered ancestor chain.

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
- Fallback-relevant declarations in keyframes, shape-sensitive `@supports`, dynamic `@container` activation, pseudo-element targets, namespace-qualified selectors, `:focus-visible`, and other selector states the runtime cannot observe are rejected by the compiler.
- Shape or paint animation is not native-timing parity. Fallback-relevant keyframes are rejected. If a transition can activate a previously inactive fallback target after its triggering DOM mutation, call `refresh()` when the transition completes. Other value-driven changes with no DOM, media or registered-root signal also require explicit `refresh()`. Direct CSSOM shape edits are unprocessed CSS; replace them with transformed output or use the explicit runtime.
- Scoped rules require an explicit observable scope-start selector. Relative scoped selectors and top-level or scoped `:scope` semantics are rejected in `0.0.1`.
- A conditional named layer is accepted only when the complete layer name was established earlier and unconditionally in the same transformed stylesheet; conditional first establishment is rejected. Conditional `@property` registrations are rejected. Authored registrations for private Cornerfill carriers must exactly match the generated non-inheriting token contract.
- If a reachable custom property has any definition whose selector or condition cannot be observed, compiled mode refuses that dependency instead of trying to prove the definition irrelevant to a particular element. Split the token or use the explicit runtime. Definitions absent from transformed CSS cannot be recovered by `refresh()`.
- Closed shadow roots cannot use compiled discovery. In a shadow root, host pseudos must lead their selector branch; `:host-context()` accepts one compound selector. Host-relative child and sibling combinators are refused in compiled mode.
- Compiled mode refuses `attr()` and container-relative units in fallback-relevant values, including reachable custom-property definitions, because their dependencies cannot be observed soundly. Use the explicit runtime for those inputs.
- Anonymous layer ancestry cannot establish a named layer for a later conditional layer statement. Malformed, conditional, nested, or incompatible Cornerfill-private `@property` registrations are refused.
- Registered scopes subscribe to each containing root in `0.0.1`; total observer and listener subscriptions can grow quadratically with maximum nesting depth, so keep deeply nested registered-root chains shallow.
- Default per-root compiled limits are 512 admitted active candidates, 100,000 potential or locally refused candidates, 100,000 incrementally scanned or inline-dependency elements, 1 MiB of effective local-plus-inherited manifest values, 512 effective manifest records, and 100,000 effective custom-property definition records. The painter separately bounds surfaces and decoded-image pixels. Exceeding a limit fails closed and remains recoverable when its inputs or activation conditions change.
- The experimental `cornerfill/auto` mode has additional source-access, CSP `connect-src`, CSSOM, import, layer, and selector boundaries. It may fetch a linked stylesheet before the browser reports that `style-src` rejected it, but never commits carriers unless the browser exposes the applied stylesheet. Use compiled mode when the CSS build is controlled.

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
