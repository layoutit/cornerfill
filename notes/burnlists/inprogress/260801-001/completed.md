## B1 | Initialize the upstreamable repository boundary

Completed: 2026-08-01T22:20:36-03:00
Changed:
- `.git/`
- `.gitignore`
- `package.json`
Proof:
- `npm test`
- `npm pack --dry-run --json`
- clean tarball install and public import smoke
Outcome:
- The existing folder is now a local Git repository and its distribution is limited to the runtime source, manifest, and README.
Follow-up:
- B2 | Complete declaration and value handling

## B2 | Complete declaration and value handling

Completed: 2026-08-01T22:31:00-03:00
Changed:
- `src/values.mjs`
- `src/runtime.mjs`
- `src/index.mjs`
- `test/values.test.mjs`
- `bench/runtime-regression.mjs`
- `README.md`
Proof:
- `npm test`
- `npm run test:browser:runtime`
- `output/playwright/runtime-hardening/2026-08-02T01-28-28.312Z/manifest.json`
Outcome:
- Physical and logical radius/shape declarations now resolve through explicit objects or durable longhand carriers in all three engines, including writing-mode and direction mapping.
Follow-up:
- B3 | Add spec-derived interpolation

## B3 | Add spec-derived interpolation

Completed: 2026-08-01T22:35:53-03:00
Changed:
- `src/values.mjs`
- `src/runtime.mjs`
- `src/index.mjs`
- `test/values.test.mjs`
- `bench/runtime-regression.mjs`
- `oracle/cases.mjs`
- `oracle/painter.mjs`
- `README.md`
Proof:
- `npm test`
- `npm run test:browser:runtime`
- `oracle/results/2026-08-02T01-35-16Z/manifest.json`
Outcome:
- Caller-clocked shape animation now interpolates in diagonal space, repaints once for a changed contour, and performs zero repaint for a repeated progress value.
Follow-up:
- B4 | Prove and approval-gate the upstream baseline

## B4 | Prove and approval-gate the upstream baseline

Completed: 2026-08-02T00:33:45-03:00
Changed:
- Public repository `https://github.com/layoutit/cornerfill`
- Git remote/tracking state for local `main`
Proof:
- Remote `main` and local baseline both resolved to `4252b115a7c4c1fe65058568aa15213b4842c1be`
- Clean-clone `npm test`: 38 passed
- `npm pack --dry-run --json`: 12 files, 52,685 packed bytes, integrity `sha512-Ittzg7huCU6pUFZyOMjCQWJq4IK2+Y0I6IDAQUn/pL3Ua0wL27mZULqhAFQYuAU2Hmechsjac0OArsZHMlzCAw==`
- Existing serial Chrome, WebKit, Firefox runtime and oracle evidence remained tied to the published source hashes with unchanged tolerances
Outcome:
- The approved MIT baseline was published to public `layoutit/cornerfill` on `main`; generated browser output, Mario assets, and machine-local state were excluded.
Follow-up:
- B15 | Publish the plug-and-play npm release

## B5 | Complete raster background semantics

Completed: 2026-08-01T22:56:17-03:00
Changed:
- `src/background.mjs`
- `src/geometry.mjs`
- `src/paint.mjs`
- `src/runtime.mjs`
- `test/background.test.mjs`
- `test/geometry.test.mjs`
- `bench/runtime-regression.mjs`
- `oracle/cases.mjs`
- `oracle/fixture.mjs`
- `oracle/painter.mjs`
- `scripts/oracle.mjs`
- `README.md`
Proof:
- `npm test`
- `npm run test:browser:runtime -- --browsers=chrome`
- `npm run test:browser:runtime -- --browsers=webkit,firefox`
- `oracle/results/2026-08-02T01-54-25Z/manifest.json`
- `oracle/results/2026-08-02T01-55-49Z/manifest.json`
Outcome:
- One raster layer now follows CSS intrinsic/explicit/cover/contain sizing, edge-aware positions, every repeat mode, and border/padding/content origin and clip while retaining source alpha and failing closed on unreadable cross-origin sources.
Follow-up:
- B6 | Add gradients and background layers

## B6 | Add gradients and background layers

Completed: 2026-08-01T23:14:36-03:00
Changed:
- `src/values.mjs`
- `src/gradients.mjs`
- `src/background.mjs`
- `src/paint.mjs`
- `src/runtime.mjs`
- `test/background.test.mjs`
- `bench/runtime-regression.mjs`
- `oracle/cases.mjs`
- `oracle/painter.mjs`
- `scripts/oracle.mjs`
- `README.md`
Proof:
- `npm test`
- `npm run test:browser:runtime`
- `output/playwright/runtime-hardening/2026-08-02T02-13-41.075Z/manifest.json`
- `oracle/results/2026-08-02T02-14-15Z/manifest.json`
Outcome:
- Standard non-repeating linear, radial, and conic gradients now compose with any number of raster/gradient layers in CSS order, including independent geometry and an asset-hashed mixed Mario-atlas oracle case in all three engines.
Follow-up:
- B7 | Paint non-round shaped borders

## B7 | Paint non-round shaped borders

Completed: 2026-08-01T23:23:41-03:00
Changed:
- `src/geometry.mjs`
- `src/paint.mjs`
- `src/runtime.mjs`
- `bench/runtime-regression.mjs`
- `oracle/cases.mjs`
- `oracle/fixture.mjs`
- `README.md`
- `oracle/README.md`
Proof:
- `npm test`
- `output/playwright/runtime-hardening/2026-08-02T02-19-23.042Z/manifest.json`
- `output/playwright/runtime-hardening/2026-08-02T02-23-21.629Z/manifest.json`
- `output/playwright/runtime-hardening/2026-08-02T02-23-25.710Z/manifest.json`
- `oracle/results/2026-08-02T02-22-07Z/manifest.json`
- `oracle/results/2026-08-02T02-22-55Z/manifest.json`
- `oracle/results/2026-08-02T02-23-04Z/manifest.json`
Outcome:
- One-color solid borders now use an even-odd ring between the spec-derived outer contour and an unequal-width inset contour for every supported corner shape. Per-side colors and non-solid styles are refused explicitly instead of approximated.
Follow-up:
- B8 | Add feasible shaped shadows and outlines

## B8 | Add feasible shaped shadows and outlines

Completed: 2026-08-01T23:36:48-03:00
Changed:
- `src/runtime.mjs`
- `src/paint.mjs`
- `bench/runtime-regression.mjs`
- `oracle/cases.mjs`
- `oracle/fixture.mjs`
- `README.md`
- `oracle/README.md`
Proof:
- `npm test`
- `output/playwright/runtime-hardening/2026-08-02T02-34-13.940Z/manifest.json`
- `output/playwright/runtime-hardening/2026-08-02T02-35-46.246Z/manifest.json`
- `output/playwright/runtime-hardening/2026-08-02T02-36-00.415Z/manifest.json`
- `oracle/results/2026-08-02T02-34-52Z/manifest.json`
- `oracle/results/2026-08-02T02-35-50Z/manifest.json`
- `oracle/results/2026-08-02T02-36-07Z/manifest.json`
Outcome:
- A zero-offset, zero-blur inset shadow and a fully contained negative-offset solid outline now paint as spec-derived rings in every backend. External outsets and broader effect grammar fail with explicit image-bound reasons; the Chrome outline case is pixel-exact and no oracle tolerance changed.
Follow-up:
- B9 | Close ordinary composition contexts

## B9 | Close ordinary composition contexts

Completed: 2026-08-01T23:44:18-03:00
Changed:
- `src/runtime.mjs`
- `bench/runtime-regression.mjs`
- `README.md`
Proof:
- `npm test`
- `output/playwright/runtime-hardening/2026-08-02T02-43-15.364Z/manifest.json`
- `output/playwright/runtime-hardening/2026-08-02T02-43-36.208Z/manifest.json`
- `output/playwright/runtime-hardening/2026-08-02T02-43-41.750Z/manifest.json`
Outcome:
- Transform, opacity, filter, blend/stacking state, and pseudo-elements stay on the original host and compositor-only changes produce zero Cornerfill paints. Replaced hosts, clipped foreground content, multi-fragment boxes, backdrop-filter clipping, and strict semantic requirements now report or refuse their exact unsupported boundary.
Follow-up:
- B10 | Certify the supported Cornerfill surface

## B10 | Certify the supported Cornerfill surface

Completed: 2026-08-01T23:50:14-03:00
Changed:
- `README.md`
- `src/runtime.mjs`
- `oracle/cases.mjs`
- `oracle/README.md`
Proof:
- `npm test`
- `output/playwright/runtime-hardening/2026-08-02T02-49-22.013Z/manifest.json`
- `oracle/results/2026-08-02T02-45-41Z/manifest.json` (Chrome, 19 cases)
- `oracle/results/2026-08-02T02-47-08Z/manifest.json` (WebKit, 19 cases)
- `oracle/results/2026-08-02T02-47-55Z/manifest.json` (Firefox, 19 cases)
- `oracle/results/2026-08-02T02-48-44Z/manifest.json` (serial cross-engine lifecycle and Mario proof)
- `npm pack --dry-run --json`: 11 files, 54,112 packed bytes, integrity `sha512-tj9VvHyLCxp/022/Dm4EMSPh2aWZNn9UZnRf/ALOzalbnwraOV3eJth3QhPwXkkGqHqXsQ4eV/K0aUvGhJB52Q==`
Outcome:
- The same runtime and oracle source hashes painted all 19 cases through Chrome static calibration, WebKit `-webkit-canvas()`, and Firefox `-moz-element()`. Mario used SHA-256 `cb3cbaedb6a0a6680652640210df470f48b4d92f1896a35e816851379b91f5ca`; native A/A passed exact zero and every native-vs-candidate comparison remains honestly `UNQUALIFIED`.
Follow-up:
- B4 | Prove and approval-gate the upstream baseline
