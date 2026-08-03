# Firefox Mario stress evidence

Captured 2026-08-03 with Firefox 152 in eight fresh, headless sessions:

```sh
node scripts/trace-firefox-mario.mjs --mode=both --frames=820 --warmup=60 --trials=1 --pairs=2 --headless
```

The source-backed fixture retained 1,213 face elements, all using `-moz-element()`. Four OFF lanes and four ON lanes completed the same 820 source ticks with one identical workload signature (`912485f6`), identical start/end source state, and identical leaf hashes.

| Measure | OFF | ON | ON / OFF |
| --- | ---: | ---: | ---: |
| source-tick FPS | 21.972 | 22.126 | 1.007 |
| display p95 | 66.700 ms | 66.720 ms | 1.000 |
| display p99 | 66.740 ms | 83.420 ms | 1.250 |
| display frames over 33 ms | 3,131 | 3,029 | 0.967 |

Each ON lane performed exactly 132,424 changed-face paints. The measured animation interval performed zero style checks, geometry builds, surface resizes, or image decodes. Initial attachment of all 1,213 faces took 533–860 ms across the four ON sessions. Every teardown ended with zero entries, surfaces, Firefox registrations, image-cache references, owned elements, and live-image properties.

Evidence identities:

- Cornerfill runtime SHA-256: `4d2bd486ee8b7816265ca95f5bad07d7c87781564dd2777957d335bf98443aa7`
- Cornerfill painter SHA-256: `0e224cf01e7640211d27b28103cfb5715165eabd7daed2c7f7915f9f25879121`
- Mario `texels.webp` SHA-256: `cb3cbaedb6a0a6680652640210df470f48b4d92f1896a35e816851379b91f5ca`

This trace qualifies workload identity and runtime behavior, not visual parity. Firefox WebDriver screenshots do not faithfully capture this `-moz-element()` scene, so visual acceptance remains a headed OS-compositor gate. Native-versus-candidate oracle comparisons remain `UNQUALIFIED`; no tolerance was changed for this evidence.
