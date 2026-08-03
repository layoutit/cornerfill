# Cornerfill

Cornerfill makes CSS `corner-shape` work in Safari and Firefox. You write ordinary CSS; Cornerfill paints the host background and border into a transparent Canvas-backed background image while leaving the original element, layout, and transform in place. A semantically qualified native engine stays native and never starts the fallback renderer.

Cornerfill shapes host paint. It does not add descendant overflow clipping or shaped hit testing. It is built for retained DOM renderers such as [PolyCSS](https://github.com/LayoutitStudio/polycss), but the runtime and geometry are standalone.

## Installation

```sh
npm install cornerfill
```

## Usage

Import Cornerfill once:

```js
import cornerfill from "cornerfill";

await cornerfill?.ready;
```

Then write normal CSS:

```css
.triangle {
  width: 120px;
  height: 100px;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  corner-shape: bevel bevel round round;
  background: #f05a47;
}
```

That is the plug-and-play document path. A qualified native engine renders the declaration itself. On supported Safari/WebKit and Firefox builds, Cornerfill finds accessible authored declarations and attaches the fallback automatically. You do not need carrier properties, a build transform, or a second import. Startup installs discovery immediately; `ready` resolves after the first asynchronous stylesheet and attachment pass. The export is `null` only outside a DOM environment.

## How It Works

Safari and Firefox may omit an unsupported `corner-shape` declaration from CSSOM. Cornerfill reads accessible authored stylesheet text and copies only those shape declarations into a private companion stylesheet. The browser then resolves selectors, variables, conditions, layers, importance, CSS-wide values, and declaration order. Backgrounds, borders, radii, and other supported paint inputs come from browser-computed style; Cornerfill does not recreate their cascade.

Cornerfill parses `border-radius` and `corner-shape`, resolves the CSS radius constraints, builds the contour, and paints the host-owned pixels into a transparent Canvas surface. Safari/WebKit exposes that surface through `-webkit-canvas()`. Firefox registers it with `mozSetImageElement()` and displays it through `-moz-element()`.

The image stays on the original element. Its transform, opacity, filter, stacking state, and pseudo-elements remain browser-owned. Transform-only animation, including `matrix3d(...)` rotation, does no Cornerfill work. Resize or a relevant paint change updates only the affected retained state, while images, geometry, and prepared atlas programs are cached.

Cornerfill does not use `clip-path`, CSS masks, SVG or font stencils, or baked-alpha assets.

## Browser Paths

| Browser | Rendering path |
|---|---|
| Semantically qualified native engine | Native CSS after syntax and canonical computed-value probes pass |
| Safari / WebKit | `-webkit-canvas()` when the live Canvas API is available |
| Firefox | `-moz-element()` when Canvas registration is available |

Native selection requires syntax support and canonical computed corner-shape longhands; syntax support alone is not enough. Shaped hit testing is probed only as a reported capability because it is not a semantic the paint-only fallback can provide and may be unobservable under page isolation policy. The qualification report marks untested outer paint, inner borders, clipping, effects, and animation as `unobserved`. Fallback backends are capability-probed. Test the exact stable browser versions in your support matrix.

## Automatic Sources and Shadow Roots

Document mode reads `<style>` text, inline `style` attributes, and same-origin or CORS-readable stylesheet links. Supported top-level `@import` trees are fetched recursively; child URLs, media conditions, direct `@supports` conditions, and named layers retain their source context. Relevant selector state and source changes are coalesced into one animation-frame pass. They do not restart a settled import graph.

Open shadow roots are explicit because discovery does not cross a shadow boundary:

```js
import { cornerfill } from "cornerfill";

if (!cornerfill) throw new Error("Cornerfill requires a document");
const scope = cornerfill.registerRoot(shadowRoot);
await scope.ready;

cornerfill.unregisterRoot(shadowRoot);
```

Root-local `<style>` and inline declarations remain ordinary CSS. Constructed stylesheets need one extra source handoff because fallback CSSOM has already discarded the unsupported declaration:

```js
const css = `.card { corner-shape: bevel; border-radius: 20px; }`;
const sheet = new CSSStyleSheet();
sheet.replaceSync(css);
shadowRoot.adoptedStyleSheets = [sheet];

if (!cornerfill) throw new Error("Cornerfill requires a document");
const scope = cornerfill.registerRoot(shadowRoot, { adoptedStyleSheets: true });
await scope.ready;
await scope.refreshAdoptedStyleSheet(sheet, css);
```

Call `refreshAdoptedStyleSheet()` again with the same standard source passed to a later `replace()` or `replaceSync()`. Cornerfill does not patch `attachShadow()`, `CSSStyleSheet`, or `CSS.supports()`.

Linked stylesheets and `@import` recovery use `fetch()`. A restrictive CSP must therefore allow those URLs through `connect-src` as well as normal stylesheet loading. Pass a `nonce` when the policy requires one for Cornerfill's generated companion style.

## Supported

- `round`, `squircle`, `square`, `bevel`, `scoop`, `notch`, and finite `superellipse()` corners.
- `corner-shape` plus its physical and logical corner longhands. Standard `border-radius` declarations are read from browser-computed physical longhands, so relative units and browser-resolved `calc()`, `min()`, `max()`, and `clamp()` values are retained. The explicit value helpers also accept documented px/percentage expressions.
- Solid colors, static same-origin or CORS raster layers and atlas crops, and non-repeating linear, radial, and conic gradients within the implemented grammar.
- Admitted background stacks with sizing, positioning, repetition, origin, and clip. The explicit runtime also admits one opaque scroll-attached raster using `multiply` over one opaque `rgb()` or hex color.
- One-color solid borders with unequal widths when the clipped inner edge remains one non-self-intersecting contour, one zero-offset zero-blur inset shadow with non-negative spread, and one fully contained solid outline on an empty paint-owned host.
- Observed generic elements and a lower-overhead caller-clocked prepared path for retained renderers.
- Automatic variables, direct corner-shape `@supports` declarations, media rules, named layers, stateful selectors, recursive imports, and explicitly registered open roots within the source boundary above.

Implemented support is not an oracle `PASS`. Current fallback comparisons remain `UNQUALIFIED`; `controller.capabilities.paint` reports available code paths, not pixel parity. Gradient color and repeated or resized raster sampling still need native qualification.

## Spec Surface

The latest published [CSS Borders and Box Decorations Level 4 Working Draft](https://www.w3.org/TR/2025/WD-css-borders-4-20251216/) is dated 16 December 2025. Cornerfill's implementation evidence is additionally pinned to a 31 July 2026 editor's-draft repository snapshot. `cornerfill/spec` exports both identities, the exact CSSWG source blob, the WPT snapshot, and a machine-readable property matrix.

| Surface | 0.0.1 status |
| --- | --- |
| `corner-shape` and four physical plus four logical corner-shape longhands | Automatic fallback |
| `border-radius` and four physical plus four logical radius longhands | Browser-computed input |
| Side shape shorthands, combined radius-and-shape properties, and side radius shorthands | Not implemented |
| Ordinary elements | Automatic fallback |
| `::before`, `::after`, and other pseudo-elements | Not implemented |

The matrix is deliberately narrower than the current draft. Unknown or unsupported syntax is reported or left native; it is not approximated.

## Runtime API

The package root is the zero-configuration entry. If an application needs scanner options, `cornerfill/auto` exports the installer without starting it as an import side effect:

```js
import { installCornerfillAuto } from "cornerfill/auto";

const cornerfill = installCornerfillAuto({
  stylesheetTimeoutMs: 5_000,
  nonce: document.currentScript?.nonce,
  onError(error, context) {
    console.error(`Cornerfill source error in ${context}`, error);
  },
});

await cornerfill.ready;
```

`autoObserve: false` switches off automatic source/state observation. `adoptedStyleSheets: true` opts a registered open shadow root into constructed-sheet handling. These options are for controlled integrations; normal document use should import `cornerfill`.

Use the scanner-free runtime when your application already owns element state:

```js
import { installCornerfill } from "cornerfill/runtime";

const cornerfill = installCornerfill();
const triangle = cornerfill.attach(document.querySelector(".triangle"), {
  cornerShape: "bevel bevel round round",
});

await triangle.ready;
await triangle.update({ cornerShape: "squircle" });

triangle.dispose();
cornerfill.destroy();
```

`attach()` observes supported style and size changes. Pass values directly when the fallback browser has already discarded the unsupported declaration.

Diagnostics are runtime state, not parity certification:

```js
cornerfill.capabilities;
triangle.explain();
cornerfill.stats();
```

The automatic package export has its own report:

```js
import { cornerfill } from "cornerfill";

await cornerfill?.ready;
cornerfill?.explain();
```

The top-level automatic report contains its native/fallback decision, unresolved native requirements, implementation state, oracle qualification, attachment counts, current-generation source errors, discovery limits, and runtime counters. Source errors include URL or inline identity and, when a rule exists, its selector and declaration. Recovery or source removal clears the old generation. Per-element fallback explanations always include unsupported semantic limits. The export is `null` outside a DOM environment.

Pure geometry and CSS-value helpers are available from `cornerfill/geometry` and `cornerfill/values`.

## Retained Renderers

PolyCSS-style renderers should keep ordinary `corner-shape` CSS for qualified Chrome and use `attachPrepared()` only when a live fallback backend exists:

```js
import { installCornerfill } from "cornerfill/runtime";

const cornerfill = installCornerfill({ observe: false });
const { native, surfaces } = cornerfill.capabilities;
const liveFallback = surfaces.webkitCanvas || surfaces.mozElement;

if (!native.qualified && liveFallback) {
  const face = cornerfill.attachPrepared(faceElement, preparedFace);
  await face.ready;

  cornerfill.updatePreparedBatch([{
    element: faceElement,
    backgroundPosition: nextAtlasCrop,
    visible: nextVisibility,
  }]);

  face.dispose();
}

cornerfill.destroy();
```

`preparedFace` contains a fixed `size`, normalized `paint`, and either prepared `geometry` or explicit `borderRadius` plus `cornerShape`. Preparation owns those descriptors. Position and visibility batches are synchronous and caller-clocked. Prepared entries do not observe layout or DPR changes; call `handle.resize()` when either changes.

Prepared surfaces are allocated during attachment so the first visibility change does not allocate inside an animation frame. Set `deferHiddenSurface: true` only when saving surfaces for entries that may remain hidden is more important than reveal-time latency.

## Limits

- The fallback owns the host background, supported border, radius, shadow, and outline paint. Author `!important` declarations that prevent that ownership are rejected.
- Descendant overflow clipping, shaped hit testing, replaced-content clipping, multi-fragment boxes, and shaped `backdrop-filter` clipping are not available. Pseudo-elements remain on the host but do not gain a shaped overflow clip.
- Outer shadows, outlines outside the border box, `border-shape`, `border-image`, per-side border colors, and non-solid border styles are not implemented.
- Rare combinations of concave corners, radii, and unequal border widths can make the clipped inner border edge self-intersect and require multiple contours. Cornerfill refuses those elements before mutating their paint surface instead of approximating the border.
- Animated CSS images, cross-origin images without CORS, general `image-set()` selection, repeating gradients, and gradient interpolation spaces or hints are outside the supported paint grammar.
- General background blending is not supported. Automatic mode cannot prove raster opacity, so the bounded `multiply` path is explicit-runtime only.
- Automatic discovery supports one physical or logical declaration family at a time. Mixed families are rejected. Automatic CSS animations and transitions of shape or paint dependencies are not reproduced with native timing or interpolation; use the explicit update/interpolation API when that behavior matters.
- Direct declaration tests such as `@supports (corner-shape: bevel)` are preserved. Complex conditions that cannot be transported without changing their meaning, anonymous layers, nested selector rules, and unknown at-rule contexts are refused before ownership.
- Pending-substitution `all: var(...)` resets are transported when they resolve to `initial`, `unset`, or the invalid-at-computed-value reset behavior. Cascade-dependent results such as `revert-layer` are reported and refused instead of leaving stale shape carriers active.
- Cross-origin stylesheets and imports require CORS. Closed or unregistered shadow roots are not discovered. Constructed/adopted sheets require explicit open-root registration and the exact-source refresh shown above. Generated styles require a CSP nonce when the page policy does.
- After installation, automatic mode mirrors `insertRule()` and `deleteRule()` on directly discovered, non-import stylesheet instances and restores the original instance methods on teardown. Rules inserted before startup and unsupported values assigned through `CSSStyleDeclaration` cannot be recovered after the browser discards them.
- A failed linked stylesheet stays cached until its source changes or `cornerfill.refresh({ retryFailed: true })` is requested. Refusals and source failures appear in `cornerfill.explain().errors`.

Cornerfill refuses unsupported cases instead of painting a result with different semantics.

## Development

```sh
npm run build
npm test
npm run test:browser:runtime
npm run oracle:smoke
npm run oracle:cross
CORNERFILL_MARIO_TEXELS=/absolute/path/to/texels.webp npm run oracle:mario
```

`test:browser:runtime` opens and closes Chrome, WebKit, and Firefox strictly one at a time. The oracle commands do the same and never use `kill-all`. Smoke and cross-engine checks are self-contained; the explicit Mario stress command uses the real texel atlas and requires `CORNERFILL_MARIO_TEXELS`. See [the executable oracle contract](oracle/README.md).

TypeScript `.mts` modules are the source of truth. The build writes browser-ready `.mjs` files and matching declarations to `dist/`. It also generates the exported qualification object from the tracked [oracle qualification record](oracle/qualification.json); candidate comparisons remain `UNQUALIFIED` until reviewed evidence supports explicit tolerances. The package root is asynchronous ESM; controlled integrations that cannot consume top-level await can call the installers from `cornerfill/auto` or `cornerfill/runtime` directly.

## License

Cornerfill is [MIT licensed](LICENSE).
