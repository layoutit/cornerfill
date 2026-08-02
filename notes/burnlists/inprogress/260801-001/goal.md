# Cornerfill Upstream and PolyCSS Integration Goal

Repo: `/Users/ekrof/fed/cornerfill`

## Goal

Publish Cornerfill as the small, reusable `layoutit/cornerfill` repository,
close the implementable `corner-shape` support gaps in its paint-owned
backend, and integrate its prepared API into PolyCSS through an opt-in adapter
PR.

The implementation work includes declaration/value behavior, native
interpolation, complete CSS background painting that can be owned by the live
image, non-round shaped borders, and shaped shadow/outline subsets that can be
implemented without violating the renderer constraints. It should also cover
ordinary composition contexts where transparent host paint is sufficient.

Complete descendant overflow clipping, shaped hit testing, and replaced/native
content clipping remain impossible through a CSS image and are not to be
simulated. Any other feature proven impossible through the selected backend
must be refused explicitly with the concrete reason.

## Guardrails

- Invariant from the user: do not overengineer and do not add unnecessary
  gates, abstractions, tests, or conformance machinery.
- Reuse the production implementation and existing oracle. Do not create a
  second renderer, compatibility framework, or generalized plugin system.
- No `clip-path`, CSS masks, SVG/font stencils, asset-specific contour, or
  baked-alpha workaround in Cornerfill production code.
- Keep `matrix3d()` and every transform on the original element. Transform-
  only frames must do zero Cornerfill work.
- A changed visible atlas crop may perform the irreducible single retained
  `drawImage()`; do not add style scans, observers, or a scheduler to the
  prepared hot path.
- Keep unsupported overflow, hit-test, replaced-content, shadow, outline,
  multi-layer, and non-round-border semantics explicit. Do not fake parity.
- Do not weaken oracle tolerances. Candidate comparisons may remain honestly
  `UNQUALIFIED` for the initial release.
- Keep proprietary Mario assets external. Generated `output/`,
  `oracle/results/`, and `.playwright-cli/` state are not package contents.
- The dirty canonical `/Users/ekrof/fed/polycss` checkout is read-only. Use
  `/Users/ekrof/fed/polycss-cornerfill-pr` from a clean remote base.
- Honor PolyCSS's no-general-render-loop rule and React/Vue public parity.
- Run one browser engine at a time and close only the exact session opened.
- Local `git init` is authorized. Repository creation, push, and PR creation
  require immediate confirmation of the exact external action.
- Do not publish npm in this Burnlist.

## Proof Authority

- `npm test` and the existing focused tests are the source-level gate. Add a
  test only for behavior changed by an item or a demonstrated regression.
- `npm run test:browser:runtime` is the retained lifecycle/ownership gate.
- `npm run oracle:cross` is the painted Chrome/WebKit/Firefox gate; its
  unapproved candidate tolerances remain unchanged.
- The existing final Mario trace and Gecko profile remain performance
  evidence. Re-run only the narrow final integration workload, not a new
  benchmark suite.
- Repository distribution readiness is `npm pack --dry-run --json` plus one
  clean import smoke from this folder; this Burnlist does not create a second
  package or publish npm.
- PolyCSS readiness is focused affected-package tests/builds plus one serial
  browser integration capture. Root-wide unrelated gates are not added.

## Ordering Intent

B1 makes the current runtime portable. B2-B3 fill declaration/value and
interpolation gaps. B5-B10 fill and prove the remaining implementable
paint/composition gaps locally. B4 then becomes the explicit approval gate for
creating and pushing the completed Cornerfill repository.

After the immutable Cornerfill baseline exists, B11-B13 build and prove the
clean PolyCSS integration. B14 closes both lanes against the same Cornerfill
commit.

## Stop Conditions

- Stop before remote repository creation or push until the user confirms the
  exact owner, visibility, license, tracked files, and action.
- Stop before PolyCSS push or PR creation until the user confirms the exact
  branch, target, commits, and PR action.
- Stop if integration requires copying Cornerfill source into PolyCSS, a new
  scheduler, per-transform painting, private cross-package imports, or edits
  to the dirty canonical PolyCSS checkout.
- Stop if an existing supported test regresses, browser sessions overlap,
  teardown leaks resources, or source/evidence identity is invalid.
- Stop and report a support gap only when the selected live-image backend
  cannot own it without a prohibited renderer or false semantics; difficulty
  alone is not a reason to defer it.

## Handoff

Execute with the `burnlist` skill. Hand off the local/upstream Cornerfill
commit and package inventory, the clean PolyCSS base/head, affected package
tests/builds, serial painted evidence, performance counters, and the PR URL
only after its separately approved creation.
