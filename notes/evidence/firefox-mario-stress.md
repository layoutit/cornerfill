# Firefox Mario stress evidence

Captured 2026-08-03 with Firefox 152.0.4 in eight fresh, headless sessions:

```sh
node scripts/trace-firefox-mario.mjs --mode=both --frames=820 --warmup=60 --trials=1 --pairs=2 --headless
```

The source-backed fixture retained 1,213 face elements, all using `-moz-element()`. Four OFF lanes and four ON lanes completed the same 820 source ticks with one identical workload signature (`912485f6`), identical start/end source state, and identical leaf hashes.

| Measure | OFF | ON | ON / OFF |
| --- | ---: | ---: | ---: |
| source-tick FPS | 23.990 | 24.723 | 1.031 |
| display p95 | 50.800 ms | 50.460 ms | 0.993 |
| display p99 | 66.760 ms | 66.720 ms | 0.999 |
| display frames over 33 ms | 2,812 | 2,593 | 0.922 |

Each ON lane performed exactly 132,424 changed-face paints for the 132,424 atlas-position changes; transform-only animation did not paint. The measured animation interval performed zero style checks, geometry builds, surface resizes, or image decodes. Initial attachment of all 1,213 faces took 246–266 ms across the four ON sessions. Every teardown ended with zero entries, surfaces, Firefox registrations, image-cache references, owned elements, live-image properties, and errors.

Evidence identities:

- Cornerfill runtime SHA-256: `608230cb76e1f96473252298bdcd9d6c433f7522680a5220c851db95856aeb70`
- Cornerfill painter SHA-256: `9bb96e6d4d69b1ff68f04c9efe65d4f4f7a79bace50a6e8a2b5ce9a6a8dda6ea`
- Mario `texels.webp` SHA-256: `cb3cbaedb6a0a6680652640210df470f48b4d92f1896a35e816851379b91f5ca`

This trace qualifies workload identity and runtime behavior, not visual parity. Firefox WebDriver screenshots do not faithfully capture this `-moz-element()` scene, so visual acceptance remains a headed OS-compositor gate. Native-versus-candidate oracle comparisons remain `UNQUALIFIED`; no tolerance was changed for this evidence.
