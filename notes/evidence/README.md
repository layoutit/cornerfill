# Live CSS image evidence

Status: mechanism probe completed 2026-08-01. This is evidence for the live-image transport and transform premise only.

## Question

Can Safari/WebKit and Firefox display a dynamically changing transparent Canvas surface as the background image of the original element, while that element remains under an ordinary compound CSS 3D transform?

If yes, Cornerfill does not need a font, SVG overlay, extra clipping face, per-frame data URL, baked alpha atlas, or `clip-path` to keep a generated silhouette attached to a rotating PolyCSS face.

## Probe

The preserved [live-paint-surface-probe.html](live-paint-surface-probe.html) creates one `240px` by `160px` face and applies:

```css
transform: rotateX(31deg) rotateY(47deg) rotateZ(13deg);
```

It selects one of two engines' legacy image bridges:

- WebKit: `document.getCSSCanvasContext('2d', name, width, height)` with `background-image: -webkit-canvas(name)`;
- Firefox: a canvas registered with `document.mozSetImageElement(id, canvas)` and `background-image: -moz-element(#id)`.

The painter clips a gradient to a triangle, leaving transparent pixels outside it. Calling `repaint(1)` clears and redraws the same backing surface with different colors. The CSS image token and transform are not replaced.

The document exposes simple observation state:

```text
document.documentElement.dataset.ready   = "true"
document.documentElement.dataset.backend = "webkit-canvas" | "moz-element"
document.documentElement.dataset.phase   = "0" | "1"
```

## Recorded result

| Browser runner | Initial | Mutation | Observed result |
| --- | --- | --- | --- |
| Playwright WebKit engine build | ready, `webkit-canvas`, phase 0 | `repaint(1)` | phase 1 cyan/blue triangle repainted in place under the same transform |
| Playwright Firefox engine build | ready, `moz-element`, phase 0 | `repaint(1)` | phase 1 cyan/blue triangle repainted in place under the same transform |

Source-workspace screenshots:

- [WebKit initial](/Users/ekrof/fed/cssGraphics/.playwright-cli/page-2026-08-01T17-57-55-255Z.png)
- [WebKit repaint](/Users/ekrof/fed/cssGraphics/.playwright-cli/page-2026-08-01T17-58-24-908Z.png)
- [Firefox initial](/Users/ekrof/fed/cssGraphics/.playwright-cli/page-2026-08-01T17-59-07-135Z.png)
- [Firefox repaint](/Users/ekrof/fed/cssGraphics/.playwright-cli/page-2026-08-01T17-59-25-017Z.png)

The original scratch probe remains at `/Users/ekrof/fed/cssGraphics/output/playwright/live-paint-surface-probe.html`; the copy beside this record is the durable research artifact.

## What this establishes

- Transparent generated pixels can replace the rectangular background pixels.
- Updating the backing canvas invalidates the CSS image consumer in both tested engine builds.
- The generated local image remains attached while the original element is transformed in 3D.
- No independent overlay needs to mirror the element's transform.
- The two nonstandard live-image APIs are real implementation routes worth productizing and testing in released browsers.

## What this does not establish

- This was not a Safari Stable or Safari Technology Preview run. Playwright WebKit is engine evidence, not shipped-product certification.
- It did not implement the CSS Borders 4 superellipse contour.
- It did not compare against native `corner-shape` pixels.
- It did not test borders, shadows, descendant overflow, hit testing, replaced content, CORS images, DPR changes, or teardown.
- It did not measure 1,213 surfaces or an 820-frame animation.
- It did not prove that WebKit named-canvas resources are reclaimed under long-lived name churn.

Those are explicit gates in [08 — Verification plan](../08-verification-plan.md).

## Reproduction discipline

The probe is intentionally static and dependency-free. When rerunning it:

1. Run one browser engine at a time.
2. Wait for `dataset.ready === "true"`.
3. Record the backend and initial phase.
4. Capture the initial painted frame.
5. call `window.repaint(1)`;
6. wait for `dataset.phase === "1"` and two presentation frames;
7. capture the repaint;
8. close the runner and verify its child processes have exited.

Do not turn this tiny evidence page into a full-scene stress harness. The full workload belongs in a separately invoked performance test with counters and cleanup checks.
