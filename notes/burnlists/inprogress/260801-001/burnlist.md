# Cornerfill Support and Integration Burnlist

Status: Burnlist Final
Updated: 2026-08-01
Repo: `/Users/ekrof/fed/cornerfill`
Goal: `./goal.md`

## Active Checklist

- [ ] **B4 | Prove and approval-gate the upstream baseline**
  - Files/search: Git inventory, packed files, existing browser/oracle output, repository owner/visibility/remote.
  - Action: Run the existing source, browser, and cross-engine proof; present the exact tracked inventory and proposed remote action. Pause for immediate approval before repository creation or push.
  - Done/delete when: The approved baseline commit is reproducible from a clean clone and its package hash is recorded without weakened tolerances.
  - Validate: `npm test`; `npm run test:browser:runtime`; `npm run oracle:cross`; `npm pack --dry-run --json`.

- [ ] **B11 | Pin a clean PolyCSS baseline**
  - Files/search: `/Users/ekrof/fed/polycss-cornerfill-pr`; PolyCSS package surfaces, adapter conventions, React/Vue entry points, current focused tests/builds.
  - Action: Create or refresh the dedicated clean checkout from the intended remote base without touching `/Users/ekrof/fed/polycss`; record the exact base and existing relevant behavior.
  - Done/delete when: The integration checkout is clean, reproducible, and its focused pre-change tests/builds pass.
  - Validate: existing affected-package tests/builds and one existing strategy golden only.

- [ ] **B12 | Integrate Cornerfill into PolyCSS**
  - Files/search: vanilla public API, React/Vue wrappers, lifecycle/disposal hooks, package manifests and docs.
  - Action: Add an opt-in adapter backed by one immutable Cornerfill dependency/commit, with public vanilla and framework parity, exact teardown, no copied renderer, scheduler, transform-frame work, or unused base-bundle cost.
  - Done/delete when: The same retained element can opt into Cornerfill through each relevant public surface and restore its owned styles/resources on teardown.
  - Validate: focused affected-package tests/builds; clean import/bundle check.

- [ ] **B13 | Prove and approval-gate the PolyCSS PR**
  - Files/search: serial Chrome/WebKit/Firefox fixture, prepared Mario workload, runtime counters, branch diff and PR target.
  - Action: Capture one ordinary fixture and the prepared Mario workload serially in all three engines, confirm transform-only zero-work and teardown counters, then present the exact branch/push/PR action for immediate approval.
  - Done/delete when: Painted evidence and focused tests pass and, after approval, the branch is pushed and the PR is opened against the agreed target.
  - Validate: affected-package tests/builds plus the narrow serial browser integration run.

- [ ] **B14 | Close both release lanes**
  - Files/search: Cornerfill commit/package hash, PolyCSS base/head, final evidence paths, limitations and links.
  - Action: Reconcile the standalone package and adapter against the same immutable implementation; record hashes, proof, limitations, and approved upstream/PR links.
  - Done/delete when: A new contributor can reproduce the package and PolyCSS integration from the recorded commits with no machine-local or proprietary contents.
  - Validate: final package dry-run and focused integration verification only.

## Completed

- B1 | 2026-08-01T22:20:36-03:00 | Initialize the upstreamable repository boundary
- B2 | 2026-08-01T22:31:00-03:00 | Complete declaration and value handling
- B3 | 2026-08-01T22:35:53-03:00 | Add spec-derived interpolation
- B5 | 2026-08-01T22:56:17-03:00 | Complete raster background semantics
- B6 | 2026-08-01T23:14:36-03:00 | Add gradients and background layers
- B7 | 2026-08-01T23:23:41-03:00 | Paint non-round shaped borders
- B8 | 2026-08-01T23:36:48-03:00 | Add feasible shaped shadows and outlines
- B9 | 2026-08-01T23:44:18-03:00 | Close ordinary composition contexts
- B10 | 2026-08-01T23:50:14-03:00 | Certify the supported Cornerfill surface
