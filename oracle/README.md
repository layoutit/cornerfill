# Cornerfill executable oracle

This harness captures the same deterministic fixtures through:

1. native Chromium `corner-shape`;
2. the forced production Cornerfill runtime in Chromium;
3. optionally, the same candidate pixels through WebKit `-webkit-canvas()` and Firefox `-moz-element()`.

It is the executable companion to [the verification plan](../notes/08-verification-plan.md). It is not itself the Cornerfill runtime.

## Evidence contract

Every run writes an immutable directory containing:

```text
oracle/results/<UTC run>/
  manifest.json
  README.md
  frames/
    native-chrome-a/frame_0000.png
    native-chrome-b/frame_0000.png
    candidate-chrome/frame_0000.png
    candidate-webkit/frame_0000.png      # when requested
    candidate-firefox/frame_0000.png     # when requested
  composites/candidate-firefox/
    frame_0000.black.png                 # retained alpha-reconstruction inputs
    frame_0000.white.png
  reports/<comparison>/
    report.json
    report.csv
    summary.md
    diffs/frame_0000.png
```

Raw numbered PNGs are the source of truth. The manifest binds the fixture/painter source hashes, `texels.webp` hash when used, host identity, browser user agent, backend, DPR, computed styles, frame-to-case mapping, and capture order.

The comparator preserves alpha. It reports alpha independently, compares premultiplied RGB so invisible transparent RGB is ignored, separates boundary and fully opaque interior error, and reports connected changed regions.

## Safety rule

Browsers are launched strictly one at a time and the exact context and process are closed before another engine starts. The harness never calls `kill-all`, never launches a full scene, and never starts concurrent capture workers.

The driver uses the pinned stable Playwright package directly. Navigation and fixture readiness have bounded timeouts so a wedged page cannot run indefinitely.

The current Playwright Firefox/BiDi backend cannot request a transparent page background. Firefox frames are therefore captured twice against opaque black and white, then reconstructed as RGBA from the two composites. Both opaque inputs are retained, the manifest records the method and reconstruction diagnostics, and the reconstructor rejects transparent inputs or mismatched dimensions. This preserves painted `-moz-element()` evidence instead of substituting the source canvas.

The default is Chromium only and excludes the external Mario asset:

```bash
npm run build
node scripts/oracle.mjs run
```

Run the build before invoking `scripts/oracle.mjs` directly; captures load the generated production modules from `dist/`.

Explicit cross-engine capture remains serial:

```bash
node scripts/oracle.mjs run --browsers=chrome,webkit,firefox
```

If a requested browser binary is missing, install only that browser through Playwright CLI, then rerun. Do not work around a missing engine by silently relabeling another browser.

## Commands

List the fixed corpus:

```bash
node scripts/oracle.mjs list
```

Run the portable small integration proof:

```bash
npm run oracle:smoke
```

Run the portable Chrome/WebKit/Firefox proof sequentially. It includes a compound 3D transform:

```bash
npm run oracle:cross
```

Run the real Mario texel-face stress case in all three engines:

```bash
CORNERFILL_MARIO_TEXELS=/absolute/path/to/texels.webp npm run oracle:mario
```

Choose an explicit output directory:

```bash
node scripts/oracle.mjs run --out=/absolute/path/to/new-run
```

The harness refuses to overwrite an existing output directory.

## Qualification states

- `PASS`: an approved tolerance exists and every structural and pixel gate passes.
- `FAIL`: an approved tolerance exists and at least one gate fails.
- `UNQUALIFIED`: metrics and artifacts exist, but no candidate tolerance has been approved.
- `INVALID`: missing/mismatched frames or dimensions make comparison meaningless.
- `INVALID ORACLE`: the capture driver could not prove that Chromium computed the requested native property.

Native A/A calibration is approved at exact zero and must pass. Native-vs-candidate tolerances begin deliberately unapproved in [tolerances.json](tolerances.json). A candidate run therefore produces measurements and heatmaps without being mislabeled as parity.

`node scripts/oracle.mjs run --enforce-candidate` enables enforcement. It should remain red until reviewed evidence justifies explicit tolerances and the candidate implementation passes them.

## Production candidate adapter

[painter.mjs](painter.mjs) is now only the adapter from fixed oracle cases into the production build in [`dist/`](../dist/), generated from [`src/`](../src/). The fixture uses the production parser, geometry/cache, painter, live-surface backend, ownership overrides, invalidation scheduler, and teardown. There is no separate reference-candidate renderer.

`controller.capabilities.paint` booleans mean that a production code path is
implemented for the admitted grammar. They do not override this chapter's
qualification states and must not be read as native-differential `PASS`.

For the `bevel` case, every requested browser also executes a post-capture lifecycle proof: a literal `matrix3d()` change must cause zero paints, a carrier style change and a resize must each cause one paint, and disposal must remove the active entry. Failure makes the oracle run fail structurally.

For `mario-texel-face`, a post-capture prepared crop update must repaint the same surface, reuse the already-decoded atlas, resolve the next exact 4×4 source field, and unregister cleanly. This proof also fails the run structurally if any invariant is lost.

The `opposite-concave-overlap` fixture now exercises the CSSWG hull scale. Current Chromium's path-intersection result is retained as implementation evidence, so that frame is still deliberately unqualified rather than treated as a tolerance pass. The border fixtures exercise uniform and unequal shaped rings. `inset-shadow-shaped` and `outline-contained-shaped` exercise the two effects that fit entirely inside the live image; the outline fixture is an empty paint-owned host, because a background image cannot reproduce native outline stacking over arbitrary foreground/pseudos. External outsets remain explicitly unsupported.

`raster-repeat-origin` retains spec-resolved repeat/origin geometry while exposing
the remaining native-versus-Canvas raster sampling difference.
`background-blend-multiply` is the only blend fixture: one explicitly opaque
static raster over one opaque color, composited by the production painter with
Canvas `multiply` and no scratch surface. It does not imply support for general
blend modes, multiple layers, gradients, translucent inputs, or prepared atlas
updates. Both candidate comparisons remain `UNQUALIFIED` regardless of their
measured pixel counts.

## Mario evidence

The `mario-texel-face` case reads, but does not copy or modify, the file supplied through `CORNERFILL_MARIO_TEXELS` or `--mario-texels=`. The run manifest hashes the exact file.

The fixture uses prepared face index 7:

```text
element:             64 x 44 CSS pixels
atlas:               4852 x 3280 pixels
background-size:     77632px 36080px
background-position: -448px 0
resolved source crop: x=28, y=0, width=4, height=4
```

That is the actual 4×4 lighting field stretched across one retained triangular face.
